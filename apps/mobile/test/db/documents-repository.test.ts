/**
 * T211 (document half) — the documents repository against a real SQLite
 * database with the generated migrations applied (Constitution III).
 *
 * Pinned for the sync engine and the traveller alike: every write is dirty
 * and stamped; a new document is `pending` until its bytes are uploaded
 * (FR-041) and its fields are a proposal until confirmed (Constitution IV);
 * fields exist only on a boarding pass and only in the wire's own shape, so a
 * row this repository accepts is a row the API accepts; the upload marks
 * clean only what the server actually received; deletes are tombstones the
 * reads never return, and they let go of the sealed file.
 */
import { DocumentPullRecord, type DocumentParsedFields } from '@triptrackr/contracts';
import { randomUUID } from 'expo-crypto';

import {
  DocumentFieldsError,
  documentsRepository,
  type CreateDocumentInput,
} from '@/db/repositories/documents';
import { tripsRepository } from '@/db/repositories/trips';
import { documents } from '@/db/schema';

import { createTestDatabase, type TestSqlite } from './sqlite-harness';

let sqlite: TestSqlite;

const FIELDS: DocumentParsedFields = {
  flight_number: 'AC834',
  flight_date: '2026-11-22',
  passenger_name: 'DESMARAIS/LUC',
};

const STALE = '2000-01-01T00:00:00.000Z';

beforeEach(async () => {
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

function addDocument(tripId: string, overrides: Partial<CreateDocumentInput> = {}) {
  const id = overrides.id ?? randomUUID();
  return documentsRepository.create(sqlite.db, {
    id,
    trip_id: tripId,
    type: 'boarding_pass',
    parsed_json: FIELDS,
    local_file_uri: `document-vault/${id}.sealed`,
    ...overrides,
  });
}

function raw(id: string) {
  return sqlite.db
    .select()
    .from(documents)
    .all()
    .find((row) => row.id === id);
}

describe('documentsRepository.create', () => {
  test('writes local-first: pending upload, unconfirmed fields, dirty, and a valid wire record', () => {
    const trip = newTrip();
    const document = addDocument(trip.id);

    expect(document).toMatchObject({
      trip_id: trip.id,
      type: 'boarding_pass',
      parsed_json: FIELDS,
      parsed_confirmed_at: null,
      upload_state: 'pending',
      is_dirty: true,
      synced_at: null,
      deleted_at: null,
      local_file_uri: `document-vault/${document.id}.sealed`,
    });
    expect(document.created_at).toBe(document.updated_at);
    const {
      is_dirty: _dirty,
      synced_at: _synced,
      local_file_uri: _file,
      ...wire
    } = document;
    expect(DocumentPullRecord.safeParse(wire).success).toBe(true);
  });

  test('a boarding pass whose barcode was unreadable is stored with no fields — not an error', () => {
    const trip = newTrip();
    expect(addDocument(trip.id, { parsed_json: null }).parsed_json).toBeNull();
    expect(addDocument(trip.id, { type: 'booking', parsed_json: null }).type).toBe(
      'booking',
    );
  });

  test('refuses fields on anything but a boarding pass, with the wire’s own rule, and writes nothing', () => {
    const trip = newTrip();
    expect(() => addDocument(trip.id, { type: 'booking' })).toThrow(DocumentFieldsError);
    expect(sqlite.db.select().from(documents).all()).toEqual([]);
  });

  test('refuses fields the wire would refuse', () => {
    const trip = newTrip();
    expect(() =>
      addDocument(trip.id, { parsed_json: { ...FIELDS, flight_number: 'ac 0834' } }),
    ).toThrow(DocumentFieldsError);
    expect(() =>
      addDocument(trip.id, {
        parsed_json: { ...FIELDS, seat: '001A' } as unknown as DocumentParsedFields,
      }),
    ).toThrow(DocumentFieldsError);
    expect(sqlite.db.select().from(documents).all()).toEqual([]);
  });
});

describe('documentsRepository reads', () => {
  test('forTripQuery lists a trip’s live documents newest first, and no other trip’s', () => {
    const trip = newTrip();
    const other = newTrip();
    const first = addDocument(trip.id);
    sqlite.native
      .prepare('UPDATE documents SET created_at = ? WHERE id = ?')
      .run('2026-01-01T00:00:00.000Z', first.id);
    const second = addDocument(trip.id, { type: 'other', parsed_json: null });
    addDocument(other.id);

    const listed = documentsRepository.forTripQuery(sqlite.db, trip.id).all();
    expect(listed.map((row) => row.id)).toEqual([second.id, first.id]);
  });

  test('byId and byIdQuery find a live document and nothing for a missing or deleted one', () => {
    const trip = newTrip();
    const document = addDocument(trip.id);

    expect(documentsRepository.byId(sqlite.db, document.id)?.id).toBe(document.id);
    expect(documentsRepository.byIdQuery(sqlite.db, document.id).all()).toHaveLength(1);
    expect(documentsRepository.byId(sqlite.db, randomUUID())).toBeNull();

    documentsRepository.remove(sqlite.db, document.id);
    expect(documentsRepository.byId(sqlite.db, document.id)).toBeNull();
    expect(documentsRepository.byIdQuery(sqlite.db, document.id).all()).toEqual([]);
  });
});

describe('documentsRepository.confirmFields (FR-035, Constitution IV)', () => {
  test('stores the checked fields as confirmed, and re-dirties the row', () => {
    const trip = newTrip();
    const document = addDocument(trip.id);
    sqlite.native.prepare('UPDATE documents SET is_dirty = 0').run();

    const corrected = { ...FIELDS, passenger_name: 'DESMARAIS/LUC MR' };
    const confirmed = documentsRepository.confirmFields(
      sqlite.db,
      document.id,
      corrected,
    );

    expect(confirmed).toMatchObject({
      parsed_json: corrected,
      parsed_confirmed_at: expect.any(String),
      is_dirty: true,
    });
    expect(confirmed.updated_at >= document.updated_at).toBe(true);
    expect(confirmed.created_at).toBe(document.created_at);
  });

  test('manual entry on a pass whose barcode could not be read is confirmed the same way', () => {
    const trip = newTrip();
    const document = addDocument(trip.id, { parsed_json: null });

    expect(
      documentsRepository.confirmFields(sqlite.db, document.id, FIELDS).parsed_json,
    ).toEqual(FIELDS);
  });

  test('refuses fields on a booking, fields the wire refuses, and a missing document', () => {
    const trip = newTrip();
    const booking = addDocument(trip.id, { type: 'booking', parsed_json: null });
    const pass = addDocument(trip.id);

    expect(() =>
      documentsRepository.confirmFields(sqlite.db, booking.id, FIELDS),
    ).toThrow(DocumentFieldsError);
    expect(() =>
      documentsRepository.confirmFields(sqlite.db, pass.id, {
        ...FIELDS,
        flight_date: '22/11/2026',
      }),
    ).toThrow(DocumentFieldsError);
    expect(raw(pass.id)?.parsed_confirmed_at).toBeNull();
    expect(() =>
      documentsRepository.confirmFields(sqlite.db, randomUUID(), FIELDS),
    ).toThrow(/not found/i);
  });
});

describe('documentsRepository — upload bookkeeping (FR-041)', () => {
  test('markUploaded makes the row uploaded and clean when nothing changed while it travelled', () => {
    const trip = newTrip();
    const document = addDocument(trip.id);

    const uploaded = documentsRepository.markUploaded(
      sqlite.db,
      document.id,
      document.updated_at,
    );

    expect(uploaded).toMatchObject({
      upload_state: 'uploaded',
      is_dirty: false,
      synced_at: expect.any(String),
      updated_at: document.updated_at,
    });
  });

  test('markUploaded keeps a row edited mid-upload dirty, so the edit is sent next', () => {
    const trip = newTrip();
    const document = addDocument(trip.id);

    const uploaded = documentsRepository.markUploaded(sqlite.db, document.id, STALE);

    expect(uploaded).toMatchObject({ upload_state: 'uploaded', is_dirty: true });
  });

  test('markSynced cleans an uploaded row after a patch, unless it changed since', () => {
    const trip = newTrip();
    const document = addDocument(trip.id);
    documentsRepository.markUploaded(sqlite.db, document.id, STALE);

    expect(documentsRepository.markSynced(sqlite.db, document.id, STALE)?.is_dirty).toBe(
      true,
    );
    expect(
      documentsRepository.markSynced(sqlite.db, document.id, document.updated_at)
        ?.is_dirty,
    ).toBe(false);
  });

  test('markUploadFailed records a refusal the device cannot retry its way out of', () => {
    const trip = newTrip();
    const document = addDocument(trip.id);

    documentsRepository.markUploadFailed(sqlite.db, document.id);

    expect(raw(document.id)?.upload_state).toBe('failed');
  });

  test('the bookkeeping never resurrects a deleted document', () => {
    const trip = newTrip();
    const document = addDocument(trip.id);
    documentsRepository.remove(sqlite.db, document.id);

    expect(
      documentsRepository.markUploaded(sqlite.db, document.id, document.updated_at),
    ).toBeNull();
    expect(
      documentsRepository.markSynced(sqlite.db, document.id, document.updated_at),
    ).toBeNull();
    documentsRepository.markUploadFailed(sqlite.db, document.id);
    expect(raw(document.id)).toMatchObject({ upload_state: 'pending', is_dirty: true });
  });

  test('needingUploadIds: pending bytes and unsent confirmations, oldest first — never failed, clean or deleted', () => {
    const trip = newTrip();
    const pending = addDocument(trip.id);
    sqlite.native
      .prepare('UPDATE documents SET created_at = ? WHERE id = ?')
      .run('2026-01-01T00:00:00.000Z', pending.id);
    const clean = addDocument(trip.id);
    documentsRepository.markUploaded(sqlite.db, clean.id, clean.updated_at);
    const edited = addDocument(trip.id);
    documentsRepository.markUploaded(sqlite.db, edited.id, STALE);
    const failed = addDocument(trip.id);
    documentsRepository.markUploadFailed(sqlite.db, failed.id);
    const deleted = addDocument(trip.id);
    documentsRepository.remove(sqlite.db, deleted.id);
    addDocument(newTrip().id);

    expect(documentsRepository.needingUploadIds(sqlite.db, trip.id)).toEqual([
      pending.id,
      edited.id,
    ]);
  });
});

describe('documentsRepository.remove', () => {
  test('is a tombstone that lets go of the sealed file, and says which file that was', () => {
    const trip = newTrip();
    const document = addDocument(trip.id);

    const released = documentsRepository.remove(sqlite.db, document.id);

    expect(released).toBe(`document-vault/${document.id}.sealed`);
    expect(documentsRepository.forTripQuery(sqlite.db, trip.id).all()).toEqual([]);
    expect(raw(document.id)).toMatchObject({
      is_dirty: true,
      deleted_at: expect.any(String),
      local_file_uri: null,
    });
    expect(documentsRepository.remove(sqlite.db, document.id)).toBeNull();
  });
});
