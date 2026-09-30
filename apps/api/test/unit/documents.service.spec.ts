import { HttpException, HttpStatus } from '@nestjs/common';
import {
  CreateDocumentRequest,
  MAX_DOCUMENT_BYTES,
  maxBase64Length,
  type CreateDocumentInput,
  type Document,
} from '@triptrackr/contracts';

import { resetEnvCache } from '@/common/config/env.schema';

import {
  CREATED_AT,
  DOCUMENT_ID,
  FIELDS,
  JPEG,
  OTHER_DOCUMENT_ID,
  OTHER_TRIP_ID,
  OWNER_ID,
  STRANGER_TRIP_ID,
  TRIP_ID,
  asOwner,
  documentHarness,
  refusal,
  storedDocument,
} from '../support/document-service-harness';
import { applyUnitTestEnv } from '../support/env';

/**
 * Document decisions (rest-api.md §6; FR-031..FR-033; research D-32; tasks.md
 * T114) against a stubbed repository, bucket and owner view, with real sealing.
 *
 * test/integration/documents.spec.ts and document-encryption.spec.ts prove the
 * same against PostgreSQL and RustFS. Pinned here are the orderings and edges
 * that are hard to provoke there:
 *
 *   - the object is written before the row, only ever as ciphertext bound to the
 *     document's id, and discarded when the row cannot be written — by a failed
 *     insert, a taken id, or a concurrent retry that won;
 *   - a replay by client id (research D-15) answers with the stored document and
 *     writes no second object; an id the caller cannot use is one identical 409;
 *   - size, then signature, are checked before anything is written;
 *   - nothing the caller cannot see is distinguishable from nothing at all.
 */

beforeAll(() => applyUnitTestEnv());
afterAll(() => resetEnvCache());

function createRequest(input: Partial<CreateDocumentInput> = {}): CreateDocumentRequest {
  return CreateDocumentRequest.parse({
    type: 'other',
    content_type: 'image/jpeg',
    content_base64: JPEG.toString('base64'),
    ...input,
  });
}

/** The document the stored fixture reads as on the wire. */
function wireOf(overrides: Partial<Document> = {}): Document {
  return {
    id: DOCUMENT_ID,
    trip_id: TRIP_ID,
    type: 'other',
    content_type: 'image/jpeg',
    byte_size: JPEG.length,
    parsed_json: null,
    parsed_confirmed_at: null,
    upload_state: 'uploaded',
    created_at: CREATED_AT.toISOString(),
    updated_at: CREATED_AT.toISOString(),
    ...overrides,
  };
}

/** The arguments of a mock's one call; no call, or several, fails the test. */
function onlyCall<TArgs extends unknown[]>(calls: TArgs[]): TArgs {
  const [call, ...rest] = calls;
  if (!call || rest.length > 0) {
    throw new Error(`Expected exactly one call, saw ${calls.length}.`);
  }
  return call;
}

const ID_UNAVAILABLE = {
  status: HttpStatus.CONFLICT,
  body: {
    error: {
      code: 'DOCUMENT_ID_UNAVAILABLE',
      message: 'That document id is already in use. Please retry with a new id.',
    },
  },
};

describe('DocumentsService.create — the object before the row (research D-32)', () => {
  it('seals the bytes under a key bound to the id, stores only ciphertext, then records the row', async () => {
    const { service, repository, storage, log, envelope } = documentHarness();

    const created = await asOwner(() =>
      service.create(TRIP_ID, createRequest({ id: DOCUMENT_ID })),
    );

    expect(log).toEqual(['put', 'insert']);
    const [bucket, key, body, type] = onlyCall(storage.putObject.mock.calls);
    expect(bucket).toBe('documents');
    expect(key).toMatch(new RegExp(`^${OWNER_ID}/[0-9a-f-]{36}$`));
    // The bucket learns neither that it is an image nor what it says.
    expect(type).toBe('application/octet-stream');
    expect(body.includes(Buffer.from('DESMARAIS'))).toBe(false);
    expect(body.subarray(0, 3).equals(JPEG.subarray(0, 3))).toBe(false);

    const [row] = onlyCall(repository.insert.mock.calls);
    expect(row).toMatchObject({
      id: DOCUMENT_ID,
      tripId: TRIP_ID,
      type: 'other',
      contentType: 'image/jpeg',
      byteSize: JPEG.length,
      storageKey: key,
      dekKeyId: 'v1',
      parsedSealed: null,
      confirmed: false,
    });
    // Bound to its id: the row's key opens the object under that id alone.
    const sealed = {
      ciphertext: body,
      wrappedDek: row.wrappedDek,
      dekKeyId: row.dekKeyId,
    };
    expect(envelope.open(sealed, envelope.documentAad(DOCUMENT_ID)).equals(JPEG)).toBe(
      true,
    );
    expect(() =>
      envelope.open(sealed, envelope.documentAad(OTHER_DOCUMENT_ID)),
    ).toThrow();

    expect(created).toEqual({ created: true, document: wireOf() });
  });

  it('chooses the id when the device sent none, and binds the bytes to that one', async () => {
    const { service, repository } = documentHarness();

    const { document } = await asOwner(() => service.create(TRIP_ID, createRequest()));

    expect(document.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(repository.insert.mock.calls[0]?.[0].id).toBe(document.id);
  });

  it('answers a replayed upload with the stored document and writes no second object', async () => {
    const stored = storedDocument({ fields: FIELDS, confirmed: true });
    const { service, storage, repository } = documentHarness({ stored: [stored] });

    const replay = await asOwner(() =>
      service.create(
        TRIP_ID,
        createRequest({ id: DOCUMENT_ID, type: 'boarding_pass', parsed_json: FIELDS }),
      ),
    );

    expect(replay).toEqual({
      created: false,
      document: wireOf({
        type: 'boarding_pass',
        parsed_json: FIELDS,
        parsed_confirmed_at: CREATED_AT.toISOString(),
      }),
    });
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it('refuses an id on another of the caller’s trips with 409, before writing anything', async () => {
    const stored = storedDocument({ tripId: OTHER_TRIP_ID });
    const { service, storage } = documentHarness({ stored: [stored] });

    const refused = await refusal(
      asOwner(() => service.create(TRIP_ID, createRequest({ id: DOCUMENT_ID }))),
    );

    expect(refused).toEqual(ID_UNAVAILABLE);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('refuses an id held by a row the policy hides with the same 409, and discards its object', async () => {
    const { service, storage, log } = documentHarness({ hiddenIds: [DOCUMENT_ID] });

    const refused = await refusal(
      asOwner(() => service.create(TRIP_ID, createRequest({ id: DOCUMENT_ID }))),
    );

    expect(refused).toEqual(ID_UNAVAILABLE);
    expect(log).toEqual(['put', 'insert', 'delete']);
    expect(storage.deleteObject.mock.calls[0]?.[1]).toBe(
      storage.putObject.mock.calls[0]?.[1],
    );
  });

  it('answers the loser of a race with its own concurrent retry with the winner’s document', async () => {
    // Both requests missed the replay check; the other one's row committed
    // first, so this insert found the id taken and the re-read now sees it.
    const winner = storedDocument();
    const { service, repository, storage } = documentHarness();
    repository.insert.mockResolvedValueOnce(null);
    repository.findLive.mockResolvedValueOnce(null).mockResolvedValueOnce(winner.row);

    const outcome = await asOwner(() =>
      service.create(TRIP_ID, createRequest({ id: DOCUMENT_ID })),
    );

    expect(outcome).toEqual({ created: false, document: wireOf() });
    expect(storage.deleteObject).toHaveBeenCalledWith(
      'documents',
      storage.putObject.mock.calls[0]?.[1],
    );
  });

  it('deletes the object when the row cannot be written, and reports the failure', async () => {
    const { service, repository, storage, log } = documentHarness();
    const failure = new Error('connection terminated unexpectedly');
    repository.insert.mockRejectedValueOnce(failure);

    await expect(
      asOwner(() => service.create(TRIP_ID, createRequest({ id: DOCUMENT_ID }))),
    ).rejects.toBe(failure);

    expect(log).toEqual(['put', 'delete']);
    expect(storage.deleteObject.mock.calls[0]?.[1]).toBe(
      storage.putObject.mock.calls[0]?.[1],
    );
  });

  it('records no row when the bucket refuses the bytes', async () => {
    const { service, repository, storage } = documentHarness();
    storage.putObject.mockRejectedValueOnce(new Error('SlowDown'));

    await expect(
      asOwner(() => service.create(TRIP_ID, createRequest({ id: DOCUMENT_ID }))),
    ).rejects.toThrow('SlowDown');

    expect(repository.insert).not.toHaveBeenCalled();
  });

  it('refuses a stranger’s trip as TRIP_NOT_FOUND before touching the bytes', async () => {
    const { service, storage } = documentHarness();

    const { status, body } = await refusal(
      asOwner(() => service.create(STRANGER_TRIP_ID, createRequest())),
    );

    expect(status).toBe(HttpStatus.NOT_FOUND);
    expect(body).toMatchObject({ error: { code: 'TRIP_NOT_FOUND' } });
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('refuses bytes that are not the declared type as 422, before any write', async () => {
    const { service, log } = documentHarness();

    const { status } = await refusal(
      asOwner(() =>
        service.create(TRIP_ID, createRequest({ content_type: 'image/png' })),
      ),
    );

    expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(log).toEqual([]);
  });

  it('refuses a document decoding past the limit as 413 — size before signature, before any write', async () => {
    const { service, log } = documentHarness();
    // Within the wire's string ceiling, two bytes over once decoded — and not
    // an image either, which must not be the answer.
    const request = createRequest({
      content_base64: 'A'.repeat(maxBase64Length(MAX_DOCUMENT_BYTES)),
    });

    const { status, body } = await refusal(
      asOwner(() => service.create(TRIP_ID, request)),
    );

    expect(status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(body).toMatchObject({ error: { code: 'DOCUMENT_TOO_LARGE' } });
    expect(log).toEqual([]);
  });
});

describe('DocumentsService.list', () => {
  it('decrypts each document’s fields for its owner and carries no key or storage key', async () => {
    const pass = storedDocument({ fields: FIELDS, confirmed: true });
    const booking = storedDocument({ id: OTHER_DOCUMENT_ID, type: 'booking' });
    const elsewhere = storedDocument({
      id: '77777777-7777-4777-8777-777777777777',
      tripId: OTHER_TRIP_ID,
    });
    const { service } = documentHarness({ stored: [pass, booking, elsewhere] });

    const documents = await service.list(TRIP_ID);

    expect(documents).toEqual([
      wireOf({
        type: 'boarding_pass',
        parsed_json: FIELDS,
        parsed_confirmed_at: CREATED_AT.toISOString(),
      }),
      wireOf({ id: OTHER_DOCUMENT_ID, type: 'booking' }),
    ]);
    expect(JSON.stringify(documents)).not.toMatch(/storage|dek|object-of/i);
  });

  it('refuses a stranger’s trip as TRIP_NOT_FOUND', async () => {
    const { service } = documentHarness();

    const { status, body } = await refusal(service.list(STRANGER_TRIP_ID));

    expect(status).toBe(HttpStatus.NOT_FOUND);
    expect(body).toMatchObject({ error: { code: 'TRIP_NOT_FOUND' } });
  });

  it('fails closed on fields that were sealed for another document', async () => {
    const victim = storedDocument({ id: OTHER_DOCUMENT_ID, fields: FIELDS });
    const target = storedDocument({ type: 'boarding_pass' });
    const swapped = {
      ...target,
      row: { ...target.row, parsedSealed: victim.row.parsedSealed },
    };
    const { service } = documentHarness({ stored: [swapped] });

    // GCM's refusal, raised by node:crypto — a defect (500), never a 4xx that
    // would read as a considered answer. (Its Error comes from Node's own realm,
    // so `toThrow` rather than `toBeInstanceOf(Error)`.)
    await expect(service.list(TRIP_ID)).rejects.toThrow();
    await expect(service.list(TRIP_ID)).rejects.not.toBeInstanceOf(HttpException);
  });
});

describe('DocumentsService.content — decrypted for the owner (FR-033)', () => {
  it('opens the stored object and answers the original bytes, base64, with their type', async () => {
    const stored = storedDocument({ contentType: 'image/jpeg' });
    const { service } = documentHarness({ stored: [stored] });

    expect(await service.content(DOCUMENT_ID)).toEqual({
      id: DOCUMENT_ID,
      content_type: 'image/jpeg',
      content_base64: JPEG.toString('base64'),
    });
  });

  it('answers DOCUMENT_NOT_FOUND alike for a hidden document and one that never existed', async () => {
    const { service } = documentHarness({ hiddenIds: [DOCUMENT_ID] });

    const hidden = await refusal(service.content(DOCUMENT_ID));
    const missing = await refusal(service.content(OTHER_DOCUMENT_ID));

    expect(hidden).toEqual({
      status: HttpStatus.NOT_FOUND,
      body: {
        error: {
          code: 'DOCUMENT_NOT_FOUND',
          message: 'Document does not exist or you do not have access.',
        },
      },
    });
    expect(missing).toEqual(hidden);
  });

  it('fails as a defect, not a not-found, when the row’s object is missing', async () => {
    const stored = storedDocument();
    const { service, objects } = documentHarness({ stored: [stored] });
    objects.delete(stored.storageKey);

    const outcome: unknown = await service
      .content(DOCUMENT_ID)
      .catch((error: unknown) => error);

    expect(outcome).toBeInstanceOf(Error);
    expect(outcome).not.toBeInstanceOf(HttpException);
  });

  it('refuses an object swapped in from another document', async () => {
    const stored = storedDocument();
    const other = storedDocument({ id: OTHER_DOCUMENT_ID });
    const { service, objects } = documentHarness({ stored: [stored] });
    objects.set(stored.storageKey, other.object);

    await expect(service.content(DOCUMENT_ID)).rejects.toThrow();
  });
});

describe('DocumentsService.patch and remove — row-scoped, owner only', () => {
  it('changes the type alone and leaves the sealed fields as they were', async () => {
    const stored = storedDocument({ type: 'booking' });
    const { service, repository } = documentHarness({ stored: [stored] });

    const document = await service.patch(DOCUMENT_ID, { type: 'other' });

    expect(repository.lockLive).toHaveBeenCalledWith(DOCUMENT_ID);
    expect(repository.update.mock.calls[0]?.[1]).toEqual({
      type: 'other',
      parsedSealed: undefined,
      confirmation: 'keep',
    });
    expect(document.type).toBe('other');
  });

  it('answers DOCUMENT_NOT_FOUND for a document the caller cannot see', async () => {
    const { service, repository } = documentHarness({ hiddenIds: [DOCUMENT_ID] });

    const { status, body } = await refusal(service.patch(DOCUMENT_ID, { type: 'other' }));

    expect(status).toBe(HttpStatus.NOT_FOUND);
    expect(body).toMatchObject({ error: { code: 'DOCUMENT_NOT_FOUND' } });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('answers DOCUMENT_NOT_FOUND when the row vanished between the read and the write', async () => {
    const stored = storedDocument();
    const { service, repository } = documentHarness({ stored: [stored] });
    repository.update.mockResolvedValueOnce(null);

    const { status } = await refusal(service.patch(DOCUMENT_ID, { type: 'booking' }));

    expect(status).toBe(HttpStatus.NOT_FOUND);
  });

  it('tombstones a document, and answers a second delete as not-found', async () => {
    const stored = storedDocument();
    const { service, repository } = documentHarness({ stored: [stored] });

    await expect(service.remove(DOCUMENT_ID)).resolves.toBeUndefined();
    const again = await refusal(service.remove(DOCUMENT_ID));

    expect(repository.tombstone).toHaveBeenCalledWith(DOCUMENT_ID);
    expect(again.status).toBe(HttpStatus.NOT_FOUND);
    expect(again.body).toMatchObject({ error: { code: 'DOCUMENT_NOT_FOUND' } });
  });
});
