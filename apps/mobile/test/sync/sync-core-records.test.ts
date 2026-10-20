/**
 * T132/T133 — the mapping between a local row and the wire record
 * (`sync/records.ts`). Every shape is a contracts schema; these tests prove
 * the mapping carries exactly what the schema names and nothing local.
 */
import { SYNC_TABLES, type SyncTable } from '@triptrackr/contracts';

import type { SyncRow } from '@/db/repositories/sync';
import {
  buildPushRequest,
  contentKeys,
  describeRecord,
  instantMs,
  parsePullRecord,
  toLocalValues,
  toPushRecord,
  tripIdOf,
  utf8Length,
} from '@/sync/records';

import { TRIP, at, uuid, wire } from './sync-core-fixtures';

/** A local row: the wire version plus the local-only columns. */
function localRow(table: SyncTable, overrides: Record<string, unknown> = {}): SyncRow {
  return {
    ...wire(table, uuid(9)),
    is_dirty: true,
    synced_at: null,
    ...(table === 'photos' || table === 'documents' ? { local_file_uri: 'p/x.jpg' } : {}),
    ...overrides,
  } as SyncRow;
}

const LOCAL_ONLY = ['is_dirty', 'synced_at', 'local_file_uri'];
const SERVER_OWNED = [
  'created_at',
  'deleted_at',
  'status',
  'upload_state',
  'moderation_state',
  'has_thumbnail',
  'fx_pending',
];

describe('toPushRecord', () => {
  test.each([...SYNC_TABLES])(
    '%s: a valid row becomes a record with no local-only and no server-owned column',
    (table) => {
      const candidate = toPushRecord(table, localRow(table));
      expect(candidate.ok).toBe(true);
      if (!candidate.ok) return;
      for (const key of [...LOCAL_ONLY, ...SERVER_OWNED]) {
        expect(candidate.record).not.toHaveProperty(key);
      }
      expect(candidate.record).toMatchObject({
        id: uuid(9),
        updated_at: at(1),
        deleted: false,
      });
    },
  );

  test('deleted is exactly deleted_at !== null', () => {
    const live = toPushRecord('notes', localRow('notes'));
    const dead = toPushRecord('notes', localRow('notes', { deleted_at: at(5) }));
    expect(live.ok && live.record.deleted).toBe(false);
    expect(dead.ok && dead.record.deleted).toBe(true);
  });

  test('carries the client-computed FX columns of an expense and none of the server-owned ones', () => {
    const candidate = toPushRecord(
      'expenses',
      localRow('expenses', {
        fx_rate_to_home: '0.920000',
        amount_home: '11.50',
        fx_pending: false,
      }),
    );
    expect(candidate.ok && candidate.record).toMatchObject({
      fx_rate_to_home: '0.920000',
      amount_home: '11.50',
    });
    expect(candidate.ok && candidate.record).not.toHaveProperty('fx_pending');
  });

  test('a row the push schema refuses is reported with its identity, not thrown', () => {
    const blank = toPushRecord('trips', localRow('trips', { title: '   ' }));
    expect(blank).toEqual({ ok: false, id: uuid(9), updatedAt: at(1) });
  });

  test('an unanchored note is refused before it can poison a batch (FR-019)', () => {
    const candidate = toPushRecord(
      'notes',
      localRow('notes', { country_id: null, city_id: null }),
    );
    expect(candidate.ok).toBe(false);
  });

  test('a stop whose dates are out of order is refused (FR-011)', () => {
    const candidate = toPushRecord(
      'trip_stops',
      localRow('trip_stops', { arrive_date: '2026-09-05', depart_date: '2026-09-01' }),
    );
    expect(candidate.ok).toBe(false);
  });

  test('an unknown extra local column can never reach the wire', () => {
    const candidate = toPushRecord(
      'expenses',
      localRow('expenses', { is_public: true, secret: 'x' }),
    );
    expect(candidate.ok && candidate.record).not.toHaveProperty('is_public');
    expect(candidate.ok && candidate.record).not.toHaveProperty('secret');
  });
});

describe('buildPushRequest', () => {
  test('binds the records to their table with the contracts envelope', () => {
    const candidate = toPushRecord('notes', localRow('notes'));
    if (!candidate.ok) throw new Error('fixture');
    expect(buildPushRequest('notes', [candidate.record])).toEqual({
      table: 'notes',
      records: [candidate.record],
    });
  });

  test('refuses a note pushed under expenses', () => {
    const candidate = toPushRecord('notes', localRow('notes'));
    if (!candidate.ok) throw new Error('fixture');
    expect(() => buildPushRequest('expenses', [candidate.record])).toThrow();
  });
});

describe('incoming records', () => {
  test('parsePullRecord validates against the PULL schema of the named table', () => {
    expect(parsePullRecord('trips', wire('trips', uuid(1)))).toMatchObject({
      status: 'planning',
    });
    expect(parsePullRecord('trips', { id: uuid(1) })).toBeNull();
    expect(parsePullRecord('trips', 'nonsense')).toBeNull();
    // a note's version is not a valid trip
    expect(parsePullRecord('trips', wire('notes', uuid(1)))).toBeNull();
  });

  test('toLocalValues keeps the server-owned columns and adds no local-only one', () => {
    const values = toLocalValues(wire('expenses', uuid(3), { fx_pending: true }));
    expect(values).toMatchObject({ fx_pending: true, fx_rate_to_home: null });
    for (const key of LOCAL_ONLY) expect(values).not.toHaveProperty(key);
  });

  test('toLocalValues is a copy, not the record', () => {
    const record = wire('trips', uuid(1));
    expect(toLocalValues(record)).not.toBe(record);
  });
});

describe('meaning', () => {
  test('contentKeys are the columns the traveller authors — not identity, not derived FX', () => {
    expect(contentKeys('trips')).toEqual([
      'title',
      'home_currency',
      'is_public',
      'cover_photo_id',
    ]);
    const expenseKeys = contentKeys('expenses');
    expect(expenseKeys).toEqual(
      expect.arrayContaining(['trip_id', 'category_id', 'amount', 'currency', 'note']),
    );
    expect(expenseKeys).not.toContain('fx_rate_to_home');
    expect(expenseKeys).not.toContain('amount_home');
    for (const table of SYNC_TABLES) {
      expect(contentKeys(table)).not.toEqual(expect.arrayContaining(['id']));
      expect(contentKeys(table)).not.toContain('updated_at');
      expect(contentKeys(table)).not.toContain('deleted');
    }
  });

  test.each([
    ['trips', { title: 'Italy' }, 'the trip “Italy”'],
    ['trips', { title: '   ' }, 'a trip'],
    ['trip_stops', {}, 'a stop'],
    ['expense_categories', { name: 'Coffee' }, 'the category “Coffee”'],
    ['notes', { title: 'Lisbon', body: 'x' }, 'the note “Lisbon”'],
    ['notes', { title: null, body: 'Pastel de nata' }, 'the note “Pastel de nata”'],
    ['expenses', { amount: '12.50', currency: 'EUR' }, 'the expense of 12.50 EUR'],
    ['photos', {}, 'a photo'],
    ['documents', {}, 'a document'],
  ] as const)('describeRecord(%s)', (table, record, expected) => {
    expect(describeRecord(table, record)).toBe(expected);
  });

  test('a long title is shortened in a sentence', () => {
    const label = describeRecord('trips', { title: 'x'.repeat(100) });
    expect(label.length).toBeLessThan(60);
    expect(label).toContain('…');
  });

  test('tripIdOf: a trip is its own, a child names it, a category has none', () => {
    expect(tripIdOf('trips', { id: TRIP })).toBe(TRIP);
    expect(tripIdOf('notes', { id: uuid(5), trip_id: TRIP })).toBe(TRIP);
    expect(tripIdOf('expense_categories', { id: uuid(6) })).toBeNull();
    expect(tripIdOf('trips', {})).toBeNull();
  });
});

describe('utf8Length', () => {
  test.each([
    ['', 0],
    ['abc', 3],
    ['é', 2],
    ['€', 3],
    ['😀', 4],
    ['a€😀é', 10],
  ])('%j is %i bytes', (text, bytes) => {
    expect(utf8Length(text)).toBe(bytes);
    expect(utf8Length(text)).toBe(Buffer.byteLength(text, 'utf8'));
  });
});

describe('instantMs', () => {
  test('orders by instant, not by text', () => {
    // As text "…:03Z" sorts AFTER "…:03.500Z"; as instants it is earlier.
    expect(instantMs('2026-09-01T10:00:03Z')).toBeLessThan(
      instantMs('2026-09-01T10:00:03.500Z'),
    );
    // An offset moves the instant: 12:00+02:00 is 10:00Z.
    expect(instantMs('2026-09-01T12:00:00+02:00')).toBe(
      instantMs('2026-09-01T10:00:00Z'),
    );
  });

  test('reads server microseconds by cutting them to milliseconds', () => {
    expect(instantMs('2026-09-01T10:00:03.123456Z')).toBe(
      instantMs('2026-09-01T10:00:03.123Z'),
    );
  });
});
