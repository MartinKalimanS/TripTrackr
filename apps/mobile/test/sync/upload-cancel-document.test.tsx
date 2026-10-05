/**
 * T134 — deleting a document with an upload in flight cancels the upload and
 * removes the staged (sealed) file (sync-protocol.md §4: "Deleting a record
 * with a pending upload cancels the upload job and removes the staged file";
 * FR-039, FR-041).
 *
 * The real `useDocumentActions().remove`, the real uploader and the real vault
 * over the faithful doubles, on a real SQLite database; only the network
 * (`apiFetch`) is faked, and its fake honours the `AbortSignal` the way the
 * real one does. Pinned: the request in flight is aborted; the row is a dirty
 * tombstone that nothing resurrects (`upload_state` is never moved to
 * `uploaded` for a deleted document); the sealed file is gone; the traveller
 * and Sentry hear nothing of a cancellation; a delete that lands between the
 * row read and the file read is the same quiet cancellation; and a document
 * deleted before the queue reaches it is never sent at all.
 */
import type { DocumentParsedFields } from '@triptrackr/contracts';
import { act, renderHook } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import type { PropsWithChildren } from 'react';

import { DatabaseProvider } from '@/db/client';
import { documentsRepository } from '@/db/repositories/documents';
import { tripsRepository } from '@/db/repositories/trips';
import { documents, type DocumentRow } from '@/db/schema';
import * as vault from '@/features/documents/document-vault';
import {
  cancelDocumentUpload,
  uploadDocument,
  uploadPendingDocuments,
} from '@/features/documents/upload';
import { useDocumentActions } from '@/features/documents/use-documents';
import { ApiRequestError } from '@/lib/api-client';
import { Sentry } from '@/lib/sentry';

import { createTestDatabase, type TestSqlite } from '../db/sqlite-harness';
import type { FakeFileSystemModule } from '../features/document-doubles';

jest.mock('expo-file-system', () =>
  require('../features/document-doubles').fileSystemDouble(),
);
jest.mock('expo-crypto', () => require('../features/document-doubles').cryptoDouble());
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return { ...actual, apiFetch: jest.fn() };
});
jest.mock('@/sync/upload-queue', () => ({
  kickUploadQueue: jest.fn(async () => undefined),
}));

const { apiFetch } = jest.requireMock('@/lib/api-client') as { apiFetch: jest.Mock };
const fileSystem = jest.requireMock('expo-file-system') as FakeFileSystemModule;
const secureStore = jest.requireMock('expo-secure-store') as { __reset: () => void };

const FIELDS: DocumentParsedFields = {
  flight_number: 'AC834',
  flight_date: '2026-11-22',
  passenger_name: 'DESMARAIS/LUC',
};
const IMAGE_BASE64 = Buffer.from('\xff\xd8\xff\xe0 BOARDING PASS', 'latin1').toString(
  'base64',
);

let sqlite: TestSqlite;
let tripId: string;

function wrapper({ children }: PropsWithChildren) {
  return <DatabaseProvider value={sqlite.db}>{children}</DatabaseProvider>;
}

beforeEach(async () => {
  fileSystem.__reset();
  secureStore.__reset();
  apiFetch.mockReset();
  sqlite = await createTestDatabase();
  tripId = tripsRepository.create(sqlite.db, {
    id: randomUUID(),
    title: 'Montréal',
    home_currency: 'CAD',
  }).id;
});

afterEach(() => {
  jest.restoreAllMocks();
  sqlite.close();
});

async function storedDocument(): Promise<DocumentRow> {
  const id = randomUUID();
  const sealed = await vault.sealBase64(id, IMAGE_BASE64);
  return documentsRepository.create(sqlite.db, {
    id,
    trip_id: tripId,
    type: 'boarding_pass',
    parsed_json: FIELDS,
    local_file_uri: sealed.path,
  });
}

function rawRow(id: string) {
  return sqlite.db
    .select()
    .from(documents)
    .all()
    .find((row) => row.id === id);
}

/** A request that stays open until its signal aborts, as a stalled upload does. */
function hangUntilAborted() {
  let opened: () => void = () => undefined;
  const isOpen = new Promise<void>((resolve) => (opened = resolve));
  const signals: AbortSignal[] = [];
  apiFetch.mockImplementationOnce(
    (_schema: unknown, _path: string, options: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        if (options.signal) signals.push(options.signal);
        options.signal?.addEventListener('abort', () =>
          reject(new ApiRequestError(0, { code: 'NETWORK', message: 'aborted' })),
        );
        opened();
      }),
  );
  return { isOpen, signals };
}

describe('deleting a document while its bytes are uploading', () => {
  test('aborts the request, tombstones the row, removes the sealed file, and says nothing', async () => {
    const document = await storedDocument();
    const { result } = await renderHook(() => useDocumentActions(), { wrapper });
    const request = hangUntilAborted();

    const run = uploadDocument(sqlite.db, document.id);
    await request.isOpen;
    await act(async () => result.current.remove(document.id));

    await expect(run).resolves.toBe('missing');
    expect(request.signals).toHaveLength(1);
    expect(request.signals[0]?.aborted).toBe(true);
    // A dirty tombstone the sync engine will push — and nothing marks it uploaded.
    expect(rawRow(document.id)).toMatchObject({
      deleted_at: expect.any(String),
      is_dirty: true,
      upload_state: 'pending',
      local_file_uri: null,
    });
    expect(documentsRepository.byId(sqlite.db, document.id)).toBeNull();
    expect([...fileSystem.__files().keys()]).toEqual([]);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  test('a delete that lands after the row was read but before the file was, cancels just the same', async () => {
    const document = await storedDocument();
    const { result } = await renderHook(() => useDocumentActions(), { wrapper });
    jest.spyOn(vault, 'openSealedFile').mockImplementationOnce(async () => {
      result.current.remove(document.id);
      throw new Error(`File ${document.id}.sealed does not exist`);
    });

    await expect(uploadDocument(sqlite.db, document.id)).resolves.toBe('missing');

    expect(apiFetch).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(rawRow(document.id)?.deleted_at).toEqual(expect.any(String));
  });

  test('a confirmation being PATCHed is cancelled too', async () => {
    const document = await storedDocument();
    documentsRepository.markUploaded(sqlite.db, document.id, document.updated_at);
    documentsRepository.confirmFields(sqlite.db, document.id, FIELDS);
    const { result } = await renderHook(() => useDocumentActions(), { wrapper });
    const request = hangUntilAborted();

    const run = uploadDocument(sqlite.db, document.id);
    await request.isOpen;
    await act(async () => result.current.remove(document.id));

    await expect(run).resolves.toBe('missing');
    expect(request.signals[0]?.aborted).toBe(true);
    expect(documentsRepository.byId(sqlite.db, document.id)).toBeNull();
  });

  test('cancelling a document that is not uploading is harmless', () => {
    expect(() => cancelDocumentUpload(randomUUID())).not.toThrow();
  });
});

describe('a document deleted before the queue reaches it', () => {
  test('is never sent, and the documents after it still are', async () => {
    const doomed = await storedDocument();
    const kept = await storedDocument();
    const { result } = await renderHook(() => useDocumentActions(), { wrapper });
    await act(async () => result.current.remove(doomed.id));
    apiFetch.mockImplementation(
      async (_schema: unknown, _path: string, options: { body: { id: string } }) => ({
        document: {
          id: options.body.id,
          trip_id: tripId,
          type: 'boarding_pass',
          content_type: 'image/jpeg',
          byte_size: 20,
          parsed_json: FIELDS,
          parsed_confirmed_at: null,
          upload_state: 'uploaded',
          created_at: kept.created_at,
          updated_at: kept.updated_at,
        },
      }),
    );

    await uploadPendingDocuments(sqlite.db, tripId);

    const sent = apiFetch.mock.calls.map(
      (call) => (call[2] as { body: { id: string } }).body.id,
    );
    expect(sent).toEqual([kept.id]);
    expect(documentsRepository.byId(sqlite.db, kept.id)?.upload_state).toBe('uploaded');
  });
});
