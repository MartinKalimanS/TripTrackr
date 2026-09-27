/**
 * Contract tests for the sync protocol (specs/001-triptrackr-mvp/contracts/sync-protocol.md).
 *
 * These assert the *shape* of the wire format, which is exactly what the client and
 * the server must agree on. They are deliberately adversarial where the constitution
 * is: a visibility field smuggled onto an expense or a document must be refused by
 * the schema itself, before any application code gets a say (Constitution I).
 */
import {
  DocumentPushRecord,
  ExpensePushRecord,
  NotePushRecord,
  PullResponse,
  PushRequest,
  PushResponse,
  SYNC_TABLES,
  TripPushRecord,
  TripStopPushRecord,
  syncTableIndex,
} from '../src';

const TRIP_ID = '0b7e0d2e-2d8c-4a2c-9f9c-3a3d9c0f1a11';
const NOW = '2026-09-23T10:12:03.000Z';

const validExpense = {
  id: '6f1c2c4e-8a1e-4a3b-9c6c-1f2e3d4c5b6a',
  trip_id: TRIP_ID,
  city_id: 3169070,
  category_id: '1c9d0b6a-7e2f-4f1a-8c3d-5e6f7a8b9c0d',
  amount: '12.50',
  currency: 'EUR',
  spent_at: '2026-05-12',
  note: null,
  updated_at: NOW,
  deleted: false,
};

describe('SYNC_TABLES', () => {
  it('lists every mirrored table exactly once, parents before children', () => {
    expect([...SYNC_TABLES]).toEqual([
      'trips',
      'trip_stops',
      'expense_categories',
      'notes',
      'expenses',
      'photos',
      'documents',
    ]);
    expect(new Set(SYNC_TABLES).size).toBe(SYNC_TABLES.length);
  });

  it('orders every child after the parent it references', () => {
    expect(syncTableIndex('trips')).toBeLessThan(syncTableIndex('trip_stops'));
    expect(syncTableIndex('trips')).toBeLessThan(syncTableIndex('notes'));
    expect(syncTableIndex('expense_categories')).toBeLessThan(syncTableIndex('expenses'));
    expect(syncTableIndex('trips')).toBeLessThan(syncTableIndex('photos'));
    expect(syncTableIndex('trips')).toBeLessThan(syncTableIndex('documents'));
  });
});

describe('push records', () => {
  it('accepts a well-formed expense', () => {
    expect(ExpensePushRecord.parse(validExpense)).toEqual(validExpense);
  });

  it('refuses a visibility flag on an expense — there is no such mechanism (FR-027)', () => {
    for (const smuggled of ['is_public', 'visibility', 'public']) {
      const result = ExpensePushRecord.safeParse({ ...validExpense, [smuggled]: true });
      expect(result.success).toBe(false);
    }
  });

  it('refuses a visibility flag on a document (FR-032)', () => {
    const doc = {
      id: '9a8b7c6d-5e4f-4a3b-8c9d-0e1f2a3b4c5d',
      trip_id: TRIP_ID,
      type: 'boarding_pass',
      parsed_json: null,
      parsed_confirmed_at: null,
      updated_at: NOW,
      deleted: false,
    };
    expect(DocumentPushRecord.safeParse(doc).success).toBe(true);
    expect(DocumentPushRecord.safeParse({ ...doc, is_public: false }).success).toBe(
      false,
    );
  });

  it('keeps money as a decimal string, never a float (SC-016)', () => {
    expect(ExpensePushRecord.safeParse({ ...validExpense, amount: 12.5 }).success).toBe(
      false,
    );
    expect(
      ExpensePushRecord.safeParse({ ...validExpense, amount: '12.505' }).success,
    ).toBe(false);
    expect(
      ExpensePushRecord.safeParse({ ...validExpense, amount: '-4.00' }).success,
    ).toBe(true);
    expect(ExpensePushRecord.safeParse({ ...validExpense, amount: '0' }).success).toBe(
      true,
    );
  });

  it('rejects a stop whose departure precedes its arrival (FR-011)', () => {
    const stop = {
      id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
      trip_id: TRIP_ID,
      city_id: 3169070,
      sort_order: 0,
      arrive_date: '2026-05-10',
      depart_date: '2026-05-12',
      updated_at: NOW,
      deleted: false,
    };
    expect(TripStopPushRecord.safeParse(stop).success).toBe(true);
    expect(
      TripStopPushRecord.safeParse({ ...stop, depart_date: '2026-05-09' }).success,
    ).toBe(false);
    // Same-day arrival and departure is legitimate.
    expect(
      TripStopPushRecord.safeParse({ ...stop, depart_date: '2026-05-10' }).success,
    ).toBe(true);
  });

  it('rejects a note anchored to neither a country nor a city (FR-019)', () => {
    const note = {
      id: '3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e7f',
      trip_id: TRIP_ID,
      country_id: 105,
      city_id: null,
      title: null,
      body: 'Pack the adapter',
      is_public: false,
      updated_at: NOW,
      deleted: false,
    };
    expect(NotePushRecord.safeParse(note).success).toBe(true);
    expect(NotePushRecord.safeParse({ ...note, country_id: null }).success).toBe(false);
  });

  it('never accepts a client-supplied trip status — it is derived (FR-013)', () => {
    const trip = {
      id: TRIP_ID,
      title: 'Italy, spring 2026',
      home_currency: 'EUR',
      is_public: false,
      cover_photo_id: null,
      updated_at: NOW,
      deleted: false,
    };
    expect(TripPushRecord.safeParse(trip).success).toBe(true);
    expect(TripPushRecord.safeParse({ ...trip, status: 'active' }).success).toBe(false);
    expect(TripPushRecord.safeParse({ ...trip, owner_id: TRIP_ID }).success).toBe(false);
  });
});

describe('push envelope', () => {
  it('binds the record schema to the table name', () => {
    const ok = PushRequest.safeParse({ table: 'expenses', records: [validExpense] });
    expect(ok.success).toBe(true);
    const wrongTable = PushRequest.safeParse({ table: 'notes', records: [validExpense] });
    expect(wrongTable.success).toBe(false);
  });

  it('refuses an empty batch and an oversized one', () => {
    expect(PushRequest.safeParse({ table: 'expenses', records: [] }).success).toBe(false);
    const tooMany = Array.from({ length: 501 }, (_, i) => ({
      ...validExpense,
      id: `6f1c2c4e-8a1e-4a3b-9c6c-${String(i).padStart(12, '0')}`,
    }));
    expect(PushRequest.safeParse({ table: 'expenses', records: tooMany }).success).toBe(
      false,
    );
  });

  it('expresses applied, over-allowance, conflict and rejected results', () => {
    const response = {
      results: [
        { id: validExpense.id, status: 'applied' },
        { id: TRIP_ID, status: 'applied', warnings: ['over_allowance'] },
        { id: validExpense.id, status: 'conflict', server_version: validExpense },
        { id: validExpense.id, status: 'rejected', reason: 'parent_missing' },
        { id: validExpense.id, status: 'rejected', reason: 'id_unavailable' },
      ],
    };
    expect(PushResponse.safeParse(response).success).toBe(true);
    expect(
      PushResponse.safeParse({ results: [{ id: TRIP_ID, status: 'rejected' }] }).success,
    ).toBe(false);
  });
});

describe('pull envelope', () => {
  it('defaults every table to an empty change list so the client never branches on undefined', () => {
    const parsed = PullResponse.parse({
      changes: {},
      next_cursor: 'abc',
      has_more: false,
    });
    for (const table of SYNC_TABLES) {
      expect(parsed.changes[table]).toEqual([]);
    }
  });

  it('carries tombstones as deleted_at, not as absence (FR-039)', () => {
    const parsed = PullResponse.parse({
      changes: {
        notes: [
          {
            id: '3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e7f',
            trip_id: TRIP_ID,
            country_id: 105,
            city_id: null,
            title: null,
            body: '',
            is_public: false,
            created_at: NOW,
            updated_at: NOW,
            deleted_at: NOW,
          },
        ],
      },
      next_cursor: 'abc',
      has_more: true,
    });
    expect(parsed.changes.notes[0]?.deleted_at).toBe(NOW);
  });
});
