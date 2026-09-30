/**
 * T118 / T211 — the upload of a stored document (FR-033, FR-035, FR-041;
 * rest-api.md §6; research D-32, D-33).
 *
 * Real SQLite, the real vault over the faithful doubles, and `apiFetch`
 * mocked at the module boundary. Pinned: the sealed file is opened in memory
 * and sent as the contract's `CreateDocumentRequest` under the document's own
 * id; a success makes the row `uploaded` and clean; offline or a timeout
 * leaves it pending, quietly; `413 DOCUMENT_TOO_LARGE` makes it `failed` for
 * good; anything unexpected is reported — never with the document's
 * contents — and leaves it pending; a later confirmation of an uploaded
 * document is a `PATCH`; and one document is never uploaded twice at once.
 */
import {
  CreateDocumentRequest,
  DocumentResponse,
  PatchDocumentRequest,
  type DocumentParsedFields,
} from '@triptrackr/contracts';
import { randomUUID } from 'expo-crypto';

import { documentsRepository } from '@/db/repositories/documents';
import { tripsRepository } from '@/db/repositories/trips';
import type { DocumentRow } from '@/db/schema';
import { sealBase64 } from '@/features/documents/document-vault';
import { uploadDocument, uploadPendingDocuments } from '@/features/documents/upload';
import { ApiRequestError } from '@/lib/api-client';
import { Sentry } from '@/lib/sentry';

import { createTestDatabase, type TestSqlite } from '../db/sqlite-harness';
import type { FakeFileSystemModule } from './document-doubles';

jest.mock('expo-file-system', () => require('./document-doubles').fileSystemDouble());
jest.mock('expo-crypto', () => require('./document-doubles').cryptoDouble());
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return { ...actual, apiFetch: jest.fn() };
});

const { apiFetch } = jest.requireMock('@/lib/api-client') as { apiFetch: jest.Mock };
const fileSystem = jest.requireMock('expo-file-system') as FakeFileSystemModule;
const secureStore = jest.requireMock('expo-secure-store') as { __reset: () => void };
const captureException = Sentry.captureException as jest.Mock;

const FIELDS: DocumentParsedFields = {
  flight_number: 'AC834',
  flight_date: '2026-11-22',
  passenger_name: 'DESMARAIS/LUC',
};
/** A stand-in JPEG; its base64 must never reach an error report. */
const IMAGE_BASE64 = Buffer.from('\xff\xd8\xff\xe0 BOARDING PASS', 'latin1').toString(
  'base64',
);

let sqlite: TestSqlite;

beforeEach(async () => {
  fileSystem.__reset();
  secureStore.__reset();
  apiFetch.mockReset();
  sqlite = await createTestDatabase();
});

afterEach(() => {
  sqlite.close();
});

function newTrip() {
  return tripsRepository.create(sqlite.db, {
    id: randomUUID(),
    title: 'Montréal',
    home_currency: 'CAD',
  });
}

async function storedDocument(
  tripId: string,
  overrides: { type?: DocumentRow['type']; parsed?: DocumentParsedFields | null } = {},
): Promise<DocumentRow> {
  const id = randomUUID();
  const sealed = await sealBase64(id, IMAGE_BASE64);
  return documentsRepository.create(sqlite.db, {
    id,
    trip_id: tripId,
    type: overrides.type ?? 'boarding_pass',
    parsed_json: overrides.parsed === undefined ? FIELDS : overrides.parsed,
    local_file_uri: sealed.path,
  });
}

function serverCopy(document: DocumentRow, confirmed = false) {
  return DocumentResponse.parse({
    document: {
      id: document.id,
      trip_id: document.trip_id,
      type: document.type,
      content_type: 'image/jpeg',
      byte_size: 20,
      parsed_json: document.parsed_json,
      parsed_confirmed_at: confirmed ? '2026-11-20T10:00:00.000Z' : null,
      upload_state: 'uploaded',
      created_at: document.created_at,
      updated_at: document.updated_at,
    },
  });
}

function row(id: string) {
  return documentsRepository.byId(sqlite.db, id);
}

function apiError(status: number, code: string) {
  return new ApiRequestError(status, { code, message: `${code} message` });
}

describe('uploadDocument — the first upload (POST /trips/:tripId/documents)', () => {
  test('sends the decrypted image as the contract’s request under the document’s own id, then marks it uploaded and clean', async () => {
    const trip = newTrip();
    const document = await storedDocument(trip.id);
    apiFetch.mockResolvedValueOnce(serverCopy(document));

    await expect(uploadDocument(sqlite.db, document.id)).resolves.toBe('uploaded');

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [schema, path, options] = apiFetch.mock.calls[0] as [
      unknown,
      string,
      { method: string; body: unknown },
    ];
    expect(schema).toBe(DocumentResponse);
    expect(path).toBe(`/trips/${trip.id}/documents`);
    expect(options.method).toBe('POST');
    expect(options.body).toEqual({
      id: document.id,
      type: 'boarding_pass',
      content_type: 'image/jpeg',
      content_base64: IMAGE_BASE64,
      parsed_json: FIELDS,
      confirmed: false,
    });
    expect(CreateDocumentRequest.safeParse(options.body).success).toBe(true);
    expect(row(document.id)).toMatchObject({
      upload_state: 'uploaded',
      is_dirty: false,
      synced_at: expect.any(String),
    });
  });

  test('fields confirmed on the device before the upload travel as confirmed', async () => {
    const trip = newTrip();
    const document = await storedDocument(trip.id);
    const confirmed = documentsRepository.confirmFields(sqlite.db, document.id, FIELDS);
    apiFetch.mockResolvedValueOnce(serverCopy(confirmed, true));

    await uploadDocument(sqlite.db, document.id);

    expect(apiFetch.mock.calls[0]?.[2]).toMatchObject({
      body: { parsed_json: FIELDS, confirmed: true },
    });
  });

  test('a booking travels with no fields', async () => {
    const trip = newTrip();
    const document = await storedDocument(trip.id, { type: 'booking', parsed: null });
    apiFetch.mockResolvedValueOnce(serverCopy(document));

    await uploadDocument(sqlite.db, document.id);

    expect(apiFetch.mock.calls[0]?.[2]).toMatchObject({
      body: { type: 'booking', parsed_json: null, confirmed: false },
    });
  });
});

describe('uploadDocument — when the upload cannot happen now', () => {
  test.each([
    ['offline', apiError(0, 'NETWORK')],
    ['a timeout', apiError(0, 'TIMEOUT')],
    ['a server fault', apiError(503, 'UNKNOWN')],
    ['rate limiting', apiError(429, 'RATE_LIMITED')],
    ['an ended session', apiError(401, 'SESSION_EXPIRED')],
    // Trips are created on the device and reach the server with User Story 6's
    // sync, parents first; until then the document waits for its trip.
    ['a trip the server has not received yet', apiError(404, 'TRIP_NOT_FOUND')],
  ])(
    '%s: stays pending, quietly — a badge, not a dialog or a report',
    async (_case, error) => {
      const trip = newTrip();
      const document = await storedDocument(trip.id);
      apiFetch.mockRejectedValueOnce(error);

      await expect(uploadDocument(sqlite.db, document.id)).resolves.toBe('pending');

      expect(row(document.id)).toMatchObject({ upload_state: 'pending', is_dirty: true });
      expect(captureException).not.toHaveBeenCalled();
    },
  );

  test('413 DOCUMENT_TOO_LARGE: failed for good, and never tried again', async () => {
    const trip = newTrip();
    const document = await storedDocument(trip.id);
    apiFetch.mockRejectedValueOnce(apiError(413, 'DOCUMENT_TOO_LARGE'));

    await expect(uploadDocument(sqlite.db, document.id)).resolves.toBe('failed');
    await expect(uploadDocument(sqlite.db, document.id)).resolves.toBe('failed');

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(row(document.id)?.upload_state).toBe('failed');
    expect(captureException).not.toHaveBeenCalled();
  });

  test('anything unexpected is reported — without the document’s contents — and stays pending', async () => {
    const trip = newTrip();
    const document = await storedDocument(trip.id);
    const refusal = apiError(422, 'VALIDATION_FAILED');
    apiFetch.mockRejectedValueOnce(refusal);

    await expect(uploadDocument(sqlite.db, document.id)).resolves.toBe('pending');

    expect(captureException).toHaveBeenCalledWith(refusal);
    const reported = JSON.stringify(captureException.mock.calls);
    expect(reported).not.toContain(IMAGE_BASE64);
    expect(reported).not.toContain('DESMARAIS');
    expect(row(document.id)?.upload_state).toBe('pending');
  });

  test('a response that broke the contract was already reported by apiFetch; it is not reported twice', async () => {
    const trip = newTrip();
    const document = await storedDocument(trip.id);
    apiFetch.mockRejectedValueOnce(apiError(201, 'INVALID_RESPONSE'));

    await expect(uploadDocument(sqlite.db, document.id)).resolves.toBe('pending');
    expect(captureException).not.toHaveBeenCalled();
  });

  test('a sealed file that will not open is reported, and nothing is sent', async () => {
    const trip = newTrip();
    const document = await storedDocument(trip.id);
    secureStore.__reset(); // another key: the file no longer authenticates

    await expect(uploadDocument(sqlite.db, document.id)).resolves.toBe('pending');

    expect(apiFetch).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(captureException.mock.calls)).not.toContain(IMAGE_BASE64);
  });

  test('a deleted or unknown document has nothing to upload', async () => {
    const trip = newTrip();
    const document = await storedDocument(trip.id);
    documentsRepository.remove(sqlite.db, document.id);

    await expect(uploadDocument(sqlite.db, document.id)).resolves.toBe('missing');
    await expect(uploadDocument(sqlite.db, randomUUID())).resolves.toBe('missing');
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe('uploadDocument — after the upload (PATCH /documents/:id)', () => {
  async function uploaded(tripId: string) {
    const document = await storedDocument(tripId);
    apiFetch.mockResolvedValueOnce(serverCopy(document));
    await uploadDocument(sqlite.db, document.id);
    apiFetch.mockReset();
    return document;
  }

  test('a confirmation made after the upload is sent as a patch, then the row is clean', async () => {
    const trip = newTrip();
    const document = await uploaded(trip.id);
    const corrected = { ...FIELDS, passenger_name: 'DESMARAIS/LUC MR' };
    const confirmed = documentsRepository.confirmFields(
      sqlite.db,
      document.id,
      corrected,
    );
    apiFetch.mockResolvedValueOnce(serverCopy(confirmed, true));

    await expect(uploadDocument(sqlite.db, document.id)).resolves.toBe('uploaded');

    const [schema, path, options] = apiFetch.mock.calls[0] as [
      unknown,
      string,
      { method: string; body: unknown },
    ];
    expect(schema).toBe(DocumentResponse);
    expect(path).toBe(`/documents/${document.id}`);
    expect(options).toEqual({
      method: 'PATCH',
      body: { parsed_json: corrected, confirmed: true },
    });
    expect(PatchDocumentRequest.safeParse(options.body).success).toBe(true);
    expect(row(document.id)?.is_dirty).toBe(false);
  });

  test('a changed proposal travels unconfirmed, and cleared fields travel cleared', async () => {
    const trip = newTrip();
    const document = await uploaded(trip.id);
    sqlite.native
      .prepare(
        'UPDATE documents SET is_dirty = 1, parsed_confirmed_at = NULL WHERE id = ?',
      )
      .run(document.id);
    apiFetch.mockResolvedValue(serverCopy(document));

    await uploadDocument(sqlite.db, document.id);
    sqlite.native
      .prepare('UPDATE documents SET is_dirty = 1, parsed_json = NULL WHERE id = ?')
      .run(document.id);
    await uploadDocument(sqlite.db, document.id);

    expect(
      apiFetch.mock.calls.map((call) => (call[2] as { body: unknown }).body),
    ).toEqual([{ parsed_json: FIELDS }, { parsed_json: null }]);
  });

  test('an uploaded, clean document needs nothing', async () => {
    const trip = newTrip();
    const document = await uploaded(trip.id);

    await expect(uploadDocument(sqlite.db, document.id)).resolves.toBe('uploaded');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test('a patch that cannot be sent now leaves the confirmation dirty for next time', async () => {
    const trip = newTrip();
    const document = await uploaded(trip.id);
    documentsRepository.confirmFields(sqlite.db, document.id, FIELDS);
    apiFetch.mockRejectedValueOnce(apiError(0, 'NETWORK'));

    await expect(uploadDocument(sqlite.db, document.id)).resolves.toBe('pending');
    expect(row(document.id)).toMatchObject({ upload_state: 'uploaded', is_dirty: true });
  });
});

describe('uploadDocument — one at a time', () => {
  test('two calls for the same document share one upload', async () => {
    const trip = newTrip();
    const document = await storedDocument(trip.id);
    let answer: (value: unknown) => void = () => undefined;
    apiFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );

    const first = uploadDocument(sqlite.db, document.id);
    const second = uploadDocument(sqlite.db, document.id);
    await new Promise((resolve) => setImmediate(resolve));
    answer(serverCopy(document));

    await expect(Promise.all([first, second])).resolves.toEqual(['uploaded', 'uploaded']);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  test('a confirmation made while the bytes travelled is patched in the same run', async () => {
    const trip = newTrip();
    const document = await storedDocument(trip.id);
    let answer: (value: unknown) => void = () => undefined;
    apiFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );

    const run = uploadDocument(sqlite.db, document.id);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setTimeout(resolve, 2)); // a later updated_at
    const confirmed = documentsRepository.confirmFields(sqlite.db, document.id, FIELDS);
    apiFetch.mockResolvedValueOnce(serverCopy(confirmed, true));
    answer(serverCopy(document));

    await expect(run).resolves.toBe('uploaded');
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(apiFetch.mock.calls[1]?.[2]).toMatchObject({ method: 'PATCH' });
    expect(row(document.id)?.is_dirty).toBe(false);
  });

  test('uploadPendingDocuments works through a trip’s documents one after another', async () => {
    const trip = newTrip();
    const first = await storedDocument(trip.id);
    const second = await storedDocument(trip.id, { type: 'other', parsed: null });
    const order: string[] = [];
    apiFetch.mockImplementation(
      async (_schema, _path, options: { body: { id: string } }) => {
        order.push(`start ${options.body.id}`);
        await new Promise((resolve) => setImmediate(resolve));
        order.push(`end ${options.body.id}`);
        const stored = row(options.body.id) as DocumentRow;
        return serverCopy(stored);
      },
    );

    await uploadPendingDocuments(sqlite.db, trip.id);

    expect(order).toEqual([
      `start ${first.id}`,
      `end ${first.id}`,
      `start ${second.id}`,
      `end ${second.id}`,
    ]);
    expect(documentsRepository.needingUploadIds(sqlite.db, trip.id)).toEqual([]);
  });

  test('uploadPendingDocuments never rejects, whatever the store does', async () => {
    const trip = newTrip();
    await storedDocument(trip.id);
    sqlite.close();

    await expect(uploadPendingDocuments(sqlite.db, trip.id)).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalled();
    sqlite = await createTestDatabase();
  });
});
