/**
 * T131/T132 — the sync-facing repository (`db/repositories/sync.ts`) against a
 * real SQLite database with the generated migrations applied.
 */
import { SYNC_TABLES } from '@triptrackr/contracts';
import { sql } from 'drizzle-orm';

import { syncRepository } from '@/db/repositories/sync';
import { syncParked } from '@/db/schema';

import {
  CATEGORY,
  TRIP,
  at,
  createTestDatabase,
  maybeRead,
  read,
  seed,
  seedTrip,
  uuid,
  type TestSqlite,
} from './sync-core-fixtures';

let sqlite: TestSqlite;

beforeEach(async () => {
  sqlite = await createTestDatabase();
});

afterEach(() => {
  sqlite.close();
});

describe('the sync tables exist through the generated migration', () => {
  test('sync_state and sync_parked are local-only tables', () => {
    const names = (
      sqlite.native
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as { name: string }[]
    ).map((row) => row.name);
    expect(names).toEqual(expect.arrayContaining(['sync_state', 'sync_parked']));
  });
});

describe('dirtyRows', () => {
  test('returns dirty rows including tombstones, oldest first, and never a clean row', () => {
    seedTrip(sqlite, { is_dirty: false });
    seed(sqlite, 'notes', uuid(12), { is_dirty: true, updated_at: at(9) });
    seed(sqlite, 'notes', uuid(11), { is_dirty: true, updated_at: at(3) });
    seed(sqlite, 'notes', uuid(13), {
      is_dirty: true,
      updated_at: at(5),
      deleted_at: at(5),
    });
    seed(sqlite, 'notes', uuid(14), { is_dirty: false });
    expect(syncRepository.dirtyRows(sqlite.db, 'notes').map((row) => row.id)).toEqual([
      uuid(11),
      uuid(13),
      uuid(12),
    ]);
  });

  test('photos and documents are read only once their bytes arrived (FR-041)', () => {
    seedTrip(sqlite);
    for (const table of ['photos', 'documents'] as const) {
      seed(sqlite, table, uuid(21), { is_dirty: true, upload_state: 'pending' });
      seed(sqlite, table, uuid(22), { is_dirty: true, upload_state: 'failed' });
      seed(sqlite, table, uuid(23), { is_dirty: true, upload_state: 'uploaded' });
      expect(syncRepository.dirtyRows(sqlite.db, table).map((row) => row.id)).toEqual([
        uuid(23),
      ]);
    }
  });

  test('a parked record is skipped at the parked version and returns once edited', () => {
    seedTrip(sqlite);
    seed(sqlite, 'notes', uuid(11), { is_dirty: true, updated_at: at(3) });
    syncRepository.park(sqlite.db, 'notes', uuid(11), at(3), 'invalid');
    expect(syncRepository.dirtyRows(sqlite.db, 'notes')).toHaveLength(0);

    sqlite.db.run(sql`UPDATE notes SET updated_at = ${at(4)} WHERE id = ${uuid(11)}`);
    expect(syncRepository.dirtyRows(sqlite.db, 'notes')).toHaveLength(1);
  });
});

describe('markPushed (compare-and-set)', () => {
  test('cleans the row and stamps synced_at when it is still the version that was sent', () => {
    seedTrip(sqlite, { is_dirty: true, synced_at: null, updated_at: at(3) });
    expect(syncRepository.markPushed(sqlite.db, 'trips', TRIP, at(3), at(30))).toBe(true);
    expect(read(sqlite, 'trips', TRIP)).toMatchObject({
      is_dirty: false,
      synced_at: at(30),
      updated_at: at(3),
    });
  });

  test('leaves a row edited in flight dirty', () => {
    seedTrip(sqlite, { is_dirty: true, synced_at: null, updated_at: at(4) });
    expect(syncRepository.markPushed(sqlite.db, 'trips', TRIP, at(3), at(30))).toBe(
      false,
    );
    expect(read(sqlite, 'trips', TRIP)).toMatchObject({
      is_dirty: true,
      synced_at: null,
    });
  });

  test('cleans a tombstone too: the deletion was what travelled', () => {
    seedTrip(sqlite, { is_dirty: true, updated_at: at(3), deleted_at: at(3) });
    expect(syncRepository.markPushed(sqlite.db, 'trips', TRIP, at(3), at(30))).toBe(true);
    expect(read(sqlite, 'trips', TRIP).is_dirty).toBe(false);
  });
});

describe('replaceIfUnchanged', () => {
  test('overwrites only the version that was sent', () => {
    seedTrip(sqlite, { is_dirty: true, updated_at: at(3), title: 'Mine' });
    expect(
      syncRepository.replaceIfUnchanged(sqlite.db, 'trips', TRIP, at(2), {
        title: 'Theirs',
      }),
    ).toBe(false);
    expect(read(sqlite, 'trips', TRIP).title).toBe('Mine');

    expect(
      syncRepository.replaceIfUnchanged(sqlite.db, 'trips', TRIP, at(3), {
        title: 'Theirs',
      }),
    ).toBe(true);
    expect(read(sqlite, 'trips', TRIP).title).toBe('Theirs');
  });
});

describe('countUnsynced', () => {
  test('counts dirty rows across all seven tables, tombstones and parked rows included', () => {
    seedTrip(sqlite, { is_dirty: true });
    seed(sqlite, 'trip_stops', uuid(31), { is_dirty: true });
    seed(sqlite, 'expense_categories', CATEGORY, { is_dirty: true });
    seed(sqlite, 'notes', uuid(32), { is_dirty: true, deleted_at: at(2) });
    seed(sqlite, 'expenses', uuid(33), { is_dirty: true });
    seed(sqlite, 'photos', uuid(34), { is_dirty: true, upload_state: 'uploaded' });
    seed(sqlite, 'documents', uuid(35), { is_dirty: true, upload_state: 'uploaded' });
    seed(sqlite, 'notes', uuid(36), { is_dirty: false });
    syncRepository.park(sqlite.db, 'expenses', uuid(33), at(1), 'invalid');
    expect(syncRepository.countUnsynced(sqlite.db)).toBe(7);
  });

  test('does not count photos or documents whose bytes have not arrived — the upload queue does', () => {
    seedTrip(sqlite);
    seed(sqlite, 'photos', uuid(41), { is_dirty: true, upload_state: 'pending' });
    seed(sqlite, 'documents', uuid(42), { is_dirty: true, upload_state: 'failed' });
    expect(syncRepository.countUnsynced(sqlite.db)).toBe(0);
  });
});

describe('hasAnyRow', () => {
  test('is false on an empty store and true once any mirrored table holds a row', () => {
    expect(syncRepository.hasAnyRow(sqlite.db)).toBe(false);
    seedTrip(sqlite, { deleted_at: at(2) });
    expect(syncRepository.hasAnyRow(sqlite.db)).toBe(true);
  });

  test.each([...SYNC_TABLES])('sees a row of %s', (table) => {
    seedTrip(sqlite);
    sqlite.db.run(sql`DELETE FROM trips`);
    expect(syncRepository.hasAnyRow(sqlite.db)).toBe(false);
    if (table === 'trips') seedTrip(sqlite);
    else {
      sqlite.native.exec('PRAGMA foreign_keys = OFF');
      seed(sqlite, table, uuid(51));
    }
    expect(syncRepository.hasAnyRow(sqlite.db)).toBe(true);
  });
});

describe('regenerateId', () => {
  test('re-keys a trip and every child foreign key in one transaction', () => {
    const newId = uuid(99);
    seedTrip(sqlite, { is_dirty: true });
    seed(sqlite, 'trip_stops', uuid(61), { is_dirty: false });
    seed(sqlite, 'notes', uuid(62), { is_dirty: true });
    seed(sqlite, 'expenses', uuid(63));
    seed(sqlite, 'photos', uuid(64));
    seed(sqlite, 'documents', uuid(65));
    seed(sqlite, 'notes', uuid(66), { deleted_at: at(2) });

    syncRepository.regenerateId(sqlite.db, 'trips', TRIP, newId);

    expect(maybeRead(sqlite, 'trips', TRIP)).toBeNull();
    expect(read(sqlite, 'trips', newId)).toMatchObject({
      title: 'Italy',
      is_dirty: true,
      updated_at: at(1),
    });
    for (const [table, id] of [
      ['trip_stops', uuid(61)],
      ['notes', uuid(62)],
      ['expenses', uuid(63)],
      ['photos', uuid(64)],
      ['documents', uuid(65)],
      ['notes', uuid(66)],
    ] as const) {
      expect(read(sqlite, table, id)).toMatchObject({ trip_id: newId, is_dirty: true });
      expect(read(sqlite, table, id).updated_at).toBe(at(1));
    }
    expect(syncRepository.foreignKeyViolations(sqlite.db)).toBe(0);
  });

  test('does not touch another trip’s children', () => {
    seedTrip(sqlite);
    seed(sqlite, 'trips', uuid(7));
    seed(sqlite, 'notes', uuid(71), { trip_id: uuid(7) });
    syncRepository.regenerateId(sqlite.db, 'trips', TRIP, uuid(99));
    expect(read(sqlite, 'notes', uuid(71)).trip_id).toBe(uuid(7));
  });

  test('re-keys a category and expenses.category_id', () => {
    seedTrip(sqlite);
    seed(sqlite, 'expense_categories', CATEGORY, { is_dirty: true });
    seed(sqlite, 'expenses', uuid(81), { category_id: CATEGORY });
    seed(sqlite, 'expenses', uuid(82), { category_id: uuid(3) });

    syncRepository.regenerateId(sqlite.db, 'expense_categories', CATEGORY, uuid(98));

    expect(maybeRead(sqlite, 'expense_categories', CATEGORY)).toBeNull();
    expect(read(sqlite, 'expense_categories', uuid(98)).name).toBe('Coffee');
    expect(read(sqlite, 'expenses', uuid(81))).toMatchObject({
      category_id: uuid(98),
      is_dirty: true,
    });
    expect(read(sqlite, 'expenses', uuid(82)).category_id).toBe(uuid(3));
  });

  test('re-keys a photo and trips.cover_photo_id', () => {
    seed(sqlite, 'trips', TRIP, { cover_photo_id: uuid(91) });
    seed(sqlite, 'photos', uuid(91));
    syncRepository.regenerateId(sqlite.db, 'photos', uuid(91), uuid(97));
    expect(read(sqlite, 'photos', uuid(97)).id).toBe(uuid(97));
    expect(read(sqlite, 'trips', TRIP)).toMatchObject({
      cover_photo_id: uuid(97),
      is_dirty: true,
    });
  });

  test.each(['trip_stops', 'notes', 'expenses', 'documents'] as const)(
    're-keys a plain row of %s in place',
    (table) => {
      seedTrip(sqlite);
      seed(sqlite, table, uuid(92), { is_dirty: true });
      syncRepository.regenerateId(sqlite.db, table, uuid(92), uuid(96));
      expect(maybeRead(sqlite, table, uuid(92))).toBeNull();
      expect(read(sqlite, table, uuid(96)).is_dirty).toBe(true);
    },
  );

  test('forgets a park recorded under the old id', () => {
    seedTrip(sqlite, { is_dirty: true });
    syncRepository.park(sqlite.db, 'trips', TRIP, at(1), 'invalid');
    syncRepository.regenerateId(sqlite.db, 'trips', TRIP, uuid(99));
    expect(sqlite.db.select().from(syncParked).all()).toHaveLength(0);
  });

  test('is atomic: a failure part-way leaves everything as it was', () => {
    seedTrip(sqlite, { is_dirty: true });
    seed(sqlite, 'notes', uuid(62), { is_dirty: true });
    seed(sqlite, 'trips', uuid(99)); // the new id is taken: the insert fails
    expect(() =>
      syncRepository.regenerateId(sqlite.db, 'trips', TRIP, uuid(99)),
    ).toThrow();
    expect(read(sqlite, 'trips', TRIP)).toMatchObject({ is_dirty: true });
    expect(read(sqlite, 'notes', uuid(62)).trip_id).toBe(TRIP);
  });

  test('refuses to re-key a row that is gone', () => {
    expect(() => syncRepository.regenerateId(sqlite.db, 'trips', TRIP, uuid(99))).toThrow(
      /gone/,
    );
  });
});

describe('parked records', () => {
  test('listParked reports a record that is still dirty at the refused version', () => {
    seedTrip(sqlite);
    seed(sqlite, 'notes', uuid(11), { is_dirty: true, updated_at: at(3) });
    syncRepository.park(sqlite.db, 'notes', uuid(11), at(3), 'invalid');
    expect(syncRepository.listParked(sqlite.db)).toEqual([
      expect.objectContaining({
        table: 'notes',
        recordId: uuid(11),
        reason: 'invalid',
        parkedUpdatedAt: at(3),
      }),
    ]);
  });

  test('listParked drops an entry whose row was edited, synced or removed', () => {
    seedTrip(sqlite);
    seed(sqlite, 'notes', uuid(11), { is_dirty: true, updated_at: at(4) }); // edited
    seed(sqlite, 'notes', uuid(12), { is_dirty: false, updated_at: at(3) }); // synced
    syncRepository.park(sqlite.db, 'notes', uuid(11), at(3), 'invalid');
    syncRepository.park(sqlite.db, 'notes', uuid(12), at(3), 'invalid');
    syncRepository.park(sqlite.db, 'notes', uuid(13), at(3), 'invalid'); // removed
    expect(syncRepository.listParked(sqlite.db)).toEqual([]);
    expect(sqlite.db.select().from(syncParked).all()).toHaveLength(0);
  });

  test('parking again replaces the entry rather than duplicating it', () => {
    seedTrip(sqlite);
    seed(sqlite, 'notes', uuid(11), { is_dirty: true, updated_at: at(5) });
    syncRepository.park(sqlite.db, 'notes', uuid(11), at(3), 'invalid');
    syncRepository.park(sqlite.db, 'notes', uuid(11), at(5), 'id_unavailable');
    expect(syncRepository.listParked(sqlite.db)).toEqual([
      expect.objectContaining({ reason: 'id_unavailable', parkedUpdatedAt: at(5) }),
    ]);
  });

  test('unpark removes the entry', () => {
    seedTrip(sqlite);
    seed(sqlite, 'notes', uuid(11), { is_dirty: true, updated_at: at(3) });
    syncRepository.park(sqlite.db, 'notes', uuid(11), at(3), 'invalid');
    syncRepository.unpark(sqlite.db, 'notes', uuid(11));
    expect(syncRepository.dirtyRows(sqlite.db, 'notes')).toHaveLength(1);
  });

  test('an entry for a table the app no longer knows is dropped, not trusted', () => {
    sqlite.db.run(
      sql`INSERT INTO sync_parked VALUES ('legacy', 'x', ${at(1)}, 'invalid', ${at(1)})`,
    );
    expect(syncRepository.listParked(sqlite.db)).toEqual([]);
    expect(sqlite.db.select().from(syncParked).all()).toHaveLength(0);
  });
});

describe('key/value state', () => {
  test('reads null before a write, then the last write', () => {
    expect(syncRepository.getState(sqlite.db, 'k')).toBeNull();
    syncRepository.setState(sqlite.db, 'k', 'one');
    syncRepository.setState(sqlite.db, 'k', 'two');
    expect(syncRepository.getState(sqlite.db, 'k')).toBe('two');
  });
});

describe('foreign keys', () => {
  function foreignKeysSetting(): number {
    return (
      sqlite.native.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }
    ).foreign_keys;
  }

  test('suspends enforcement for the work and restores it afterwards', () => {
    expect(foreignKeysSetting()).toBe(1);
    const inside = syncRepository.withForeignKeysSuspended(sqlite.db, foreignKeysSetting);
    expect(inside).toBe(0);
    expect(foreignKeysSetting()).toBe(1);
  });

  test('restores enforcement when the work throws', () => {
    expect(() =>
      syncRepository.withForeignKeysSuspended(sqlite.db, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(foreignKeysSetting()).toBe(1);
  });

  test('leaves enforcement off when the connection already had it off', () => {
    sqlite.native.exec('PRAGMA foreign_keys = OFF');
    syncRepository.withForeignKeysSuspended(sqlite.db, () => undefined);
    expect(foreignKeysSetting()).toBe(0);
  });

  test('foreignKeyViolations counts a child whose parent is missing', () => {
    expect(syncRepository.foreignKeyViolations(sqlite.db)).toBe(0);
    syncRepository.withForeignKeysSuspended(sqlite.db, () =>
      seed(sqlite, 'notes', uuid(11), { trip_id: uuid(404) }),
    );
    expect(syncRepository.foreignKeyViolations(sqlite.db)).toBe(1);
  });

  test('with enforcement on, an orphan is refused — the suspension is what allows it', () => {
    expect(() => seed(sqlite, 'notes', uuid(11), { trip_id: uuid(404) })).toThrow();
  });
});
