import { HttpException } from '@nestjs/common';
import type {
  DocumentContentType,
  DocumentParsedFields,
  DocumentType,
  Trip,
} from '@triptrackr/contracts';
import type { TransactionSql } from 'postgres';

import { EnvelopeService } from '@/common/crypto/envelope.service';
import { runInRlsContext } from '@/common/rls/rls-context';
import type { StorageBucket, StorageService } from '@/common/storage/storage.service';
import { BoardingPassService } from '@/modules/documents/boarding-pass.service';
import type {
  DocumentPatch,
  DocumentRow,
  DocumentsRepository,
  NewDocument,
} from '@/modules/documents/documents.repository';
import { DocumentsService } from '@/modules/documents/documents.service';
import { tripNotFound, type TripsService } from '@/modules/trips/trips.service';

/**
 * The documents service over a stubbed repository, a stubbed bucket and a
 * stubbed owner view — with the REAL EnvelopeService and BoardingPassService,
 * so every byte a test inspects was genuinely sealed (test/unit/documents.service.spec.ts,
 * test/unit/boarding-pass.spec.ts).
 *
 * The repository stands in for PostgreSQL the way notes.service.spec.ts's does:
 * reads see only the caller's live rows (the policy), and an insert under a taken
 * id returns null (`ON CONFLICT DO NOTHING`). The bucket is a Map.
 *
 * Callers install the unit environment first (applyUnitTestEnv): the master key
 * comes from it.
 */

export const OWNER_ID = '11111111-1111-4111-8111-111111111111';
export const TRIP_ID = '22222222-2222-4222-8222-222222222222';
export const OTHER_TRIP_ID = '33333333-3333-4333-8333-333333333333';
export const STRANGER_TRIP_ID = '44444444-4444-4444-8444-444444444444';
export const DOCUMENT_ID = '55555555-5555-4555-8555-555555555555';
export const OTHER_DOCUMENT_ID = '66666666-6666-4666-8666-666666666666';
export const CREATED_AT = new Date('2026-06-02T08:00:00.000Z');
export const UPDATED_AT = new Date('2026-06-03T09:30:00.000Z');

/** A JPEG in all but content: the signature, a JFIF marker, and a readable line. */
export const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  Buffer.from('JFIF BOARDING PASS DESMARAIS/LUC AC834 SEAT 14C', 'ascii'),
  Buffer.from([0xff, 0xd9]),
]);

/** What the device's parser would extract from the pass above (FR-035). */
export const FIELDS: DocumentParsedFields = {
  flight_number: 'AC834',
  flight_date: '2026-06-02',
  passenger_name: 'DESMARAIS/LUC',
};

export interface StoredDocument {
  readonly row: DocumentRow;
  readonly storageKey: string;
  /** What the bucket holds: the sealed bytes. */
  readonly object: Buffer;
}

export interface StoredOptions {
  readonly id?: string;
  readonly tripId?: string;
  readonly type?: DocumentType;
  readonly contentType?: DocumentContentType;
  readonly bytes?: Buffer;
  readonly fields?: DocumentParsedFields | null;
  readonly confirmed?: boolean;
}

/** A document exactly as an upload leaves it: sealed object, wrapped key, sealed fields. */
export function storedDocument(options: StoredOptions = {}): StoredDocument {
  const envelope = new EnvelopeService();
  const id = options.id ?? DOCUMENT_ID;
  const bytes = options.bytes ?? JPEG;
  const fields = options.fields ?? null;
  const sealed = envelope.seal(bytes, envelope.documentAad(id));

  return {
    storageKey: `${OWNER_ID}/object-of-${id}`,
    object: sealed.ciphertext,
    row: {
      id,
      tripId: options.tripId ?? TRIP_ID,
      type: options.type ?? (fields ? 'boarding_pass' : 'other'),
      contentType: options.contentType ?? 'image/jpeg',
      byteSize: bytes.length,
      wrappedDek: sealed.wrappedDek,
      dekKeyId: sealed.dekKeyId,
      parsedSealed: fields
        ? envelope.sealParsed(sealed, id, Buffer.from(JSON.stringify(fields), 'utf8'))
        : null,
      parsedConfirmedAt: options.confirmed ? CREATED_AT : null,
      uploadState: 'uploaded',
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
  };
}

export interface World {
  /** Live documents the caller's policy lets them see, with their objects. */
  readonly stored?: readonly StoredDocument[];
  /** Ids held by rows the policy hides: another traveller's, or tombstoned. */
  readonly hiddenIds?: readonly string[];
}

/** The caller's own trips; the owner view answers anything else with `TRIP_NOT_FOUND`. */
const OWN_TRIPS: ReadonlySet<string> = new Set([TRIP_ID, OTHER_TRIP_ID]);

function ownTrip(id: string): Trip {
  return {
    id,
    created_at: CREATED_AT.toISOString(),
    updated_at: CREATED_AT.toISOString(),
    title: 'Documents trip',
    home_currency: 'CHF',
    is_public: false,
    cover_photo_id: null,
    status: 'planning',
    stops: [],
  };
}

/** What `INSERT … RETURNING` hands back for an accepted row. */
function insertedRow(document: NewDocument): DocumentRow {
  return {
    id: document.id,
    tripId: document.tripId,
    type: document.type,
    contentType: document.contentType,
    byteSize: document.byteSize,
    wrappedDek: document.wrappedDek,
    dekKeyId: document.dekKeyId,
    parsedSealed: document.parsedSealed,
    parsedConfirmedAt: document.confirmed ? CREATED_AT : null,
    uploadState: 'uploaded',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

/** What `UPDATE … RETURNING` hands back: only what the patch sets changes. */
function patchedRow(current: DocumentRow, patch: DocumentPatch): DocumentRow {
  const confirmedAt = {
    now: UPDATED_AT,
    clear: null,
    keep: current.parsedConfirmedAt,
  }[patch.confirmation];

  return {
    ...current,
    ...(patch.type !== undefined && { type: patch.type }),
    ...(patch.parsedSealed !== undefined && { parsedSealed: patch.parsedSealed }),
    parsedConfirmedAt: confirmedAt,
    updatedAt: UPDATED_AT,
  };
}

function stubRepository(world: World, log: string[]) {
  const live = new Map((world.stored ?? []).map((doc) => [doc.row.id, doc.row]));
  const keys = new Map((world.stored ?? []).map((doc) => [doc.row.id, doc.storageKey]));
  const taken = new Set([...live.keys(), ...(world.hiddenIds ?? [])]);
  const read = (id: string) => Promise.resolve(live.get(id) ?? null);

  return {
    listForTrip: jest.fn((tripId: string) =>
      Promise.resolve([...live.values()].filter((row) => row.tripId === tripId)),
    ),
    findLive: jest.fn(read),
    lockLive: jest.fn(read),
    findContent: jest.fn((id: string) => {
      const row = live.get(id);
      const storageKey = keys.get(id);
      return Promise.resolve(
        row && storageKey
          ? {
              id: row.id,
              contentType: row.contentType,
              storageKey,
              wrappedDek: row.wrappedDek,
              dekKeyId: row.dekKeyId,
            }
          : null,
      );
    }),
    insert: jest.fn((document: NewDocument) => {
      log.push('insert');
      if (taken.has(document.id)) return Promise.resolve(null);
      const row = insertedRow(document);
      live.set(row.id, row);
      keys.set(row.id, document.storageKey);
      taken.add(row.id);
      return Promise.resolve(row);
    }),
    update: jest.fn((id: string, patch: DocumentPatch) => {
      const current = live.get(id);
      if (!current) return Promise.resolve(null);
      const row = patchedRow(current, patch);
      live.set(id, row);
      return Promise.resolve(row);
    }),
    tombstone: jest.fn((id: string) => Promise.resolve(live.delete(id))),
  } satisfies DocumentsRepository;
}

function stubStorage(world: World, log: string[]) {
  const objects = new Map(
    (world.stored ?? []).map((doc) => [doc.storageKey, doc.object] as const),
  );

  const storage = {
    putObject: jest.fn(
      (_bucket: StorageBucket, key: string, body: Buffer, _contentType: string) => {
        log.push('put');
        objects.set(key, body);
        return Promise.resolve();
      },
    ),
    getObject: jest.fn((_bucket: StorageBucket, key: string) =>
      Promise.resolve(objects.get(key) ?? null),
    ),
    deleteObject: jest.fn((_bucket: StorageBucket, key: string) => {
      log.push('delete');
      objects.delete(key);
      return Promise.resolve();
    }),
  } satisfies Pick<StorageService, 'putObject' | 'getObject' | 'deleteObject'>;

  return { storage, objects };
}

export function documentHarness(world: World = {}) {
  /** Every write, in order: 'put', 'insert', 'delete'. */
  const log: string[] = [];
  const envelope = new EnvelopeService();
  const boardingPass = new BoardingPassService(envelope);
  const repository = stubRepository(world, log);
  const { storage, objects } = stubStorage(world, log);
  const trips = {
    loadOwned: jest.fn((tripId: string) =>
      OWN_TRIPS.has(tripId)
        ? Promise.resolve(ownTrip(tripId))
        : Promise.reject(tripNotFound()),
    ),
  };
  const service = new DocumentsService(
    repository,
    trips as unknown as TripsService,
    envelope,
    storage as unknown as StorageService,
    boardingPass,
  );

  return { service, repository, storage, objects, log, envelope, boardingPass, trips };
}

/** Runs `fn` as the owner, as RlsSessionMiddleware would: storage keys need the identity. */
export function asOwner<T>(fn: () => Promise<T>): Promise<T> {
  return runInRlsContext({ tx: {} as TransactionSql, userId: OWNER_ID }, fn);
}

/** The HttpException a call was refused with; a call that succeeds fails the test. */
export async function refusal(
  call: Promise<unknown>,
): Promise<{ status: number; body: unknown }> {
  const outcome: unknown = await call.then(
    () => new Error('Expected a refusal, but the call succeeded.'),
    (error: unknown) => error,
  );
  if (!(outcome instanceof HttpException)) throw outcome;

  return { status: outcome.getStatus(), body: outcome.getResponse() };
}
