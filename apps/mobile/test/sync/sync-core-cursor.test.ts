/**
 * T131 — the pull cursor and the first-sync flag (`sync/cursor.ts`): stored in
 * the account's own database, atomic with the page that names them, and safe
 * for a device that pre-dates the flag.
 */
import {
  isFirstSyncComplete,
  markFirstSyncComplete,
  readPullCursor,
  resolveFirstSyncComplete,
  writePullCursor,
} from '@/sync/cursor';

import {
  createTestDatabase,
  seed,
  seedTrip,
  type TestSqlite,
} from './sync-core-fixtures';

let sqlite: TestSqlite;

beforeEach(async () => {
  sqlite = await createTestDatabase();
});

afterEach(() => {
  sqlite.close();
});

describe('the pull cursor', () => {
  test('is null before any page: the next pull is a full snapshot', () => {
    expect(readPullCursor(sqlite.db)).toBeNull();
  });

  test('reads back the last cursor written', () => {
    writePullCursor(sqlite.db, 'opaque-1');
    writePullCursor(sqlite.db, 'opaque-2');
    expect(readPullCursor(sqlite.db)).toBe('opaque-2');
  });

  test('is stored in the account’s own database (sync_state), not in memory', () => {
    writePullCursor(sqlite.db, 'opaque-1');
    const row = sqlite.native
      .prepare("SELECT value FROM sync_state WHERE key = 'pull_cursor'")
      .get() as { value: string };
    expect(row.value).toBe('opaque-1');
  });

  test('written inside a transaction, it advances only if the transaction commits', () => {
    writePullCursor(sqlite.db, 'opaque-1');
    expect(() =>
      sqlite.db.transaction((tx) => {
        writePullCursor(tx, 'opaque-2');
        throw new Error('the page failed to apply');
      }),
    ).toThrow('the page failed to apply');
    expect(readPullCursor(sqlite.db)).toBe('opaque-1');

    sqlite.db.transaction((tx) => writePullCursor(tx, 'opaque-3'));
    expect(readPullCursor(sqlite.db)).toBe('opaque-3');
  });
});

describe('the first-sync flag', () => {
  test('is false until a snapshot marks it, then true', () => {
    expect(isFirstSyncComplete(sqlite.db)).toBe(false);
    markFirstSyncComplete(sqlite.db);
    expect(isFirstSyncComplete(sqlite.db)).toBe(true);
  });

  test('marking twice is harmless', () => {
    markFirstSyncComplete(sqlite.db);
    markFirstSyncComplete(sqlite.db);
    expect(isFirstSyncComplete(sqlite.db)).toBe(true);
  });
});

describe('resolveFirstSyncComplete — a device that pre-dates the flag', () => {
  test('a new device (no flag, no cursor, no rows) waits for its snapshot', () => {
    expect(resolveFirstSyncComplete(sqlite.db)).toBe(false);
    expect(isFirstSyncComplete(sqlite.db)).toBe(false);
  });

  test('a device that already holds rows is never put behind a syncing screen', () => {
    seedTrip(sqlite, { is_dirty: true, synced_at: null });
    expect(resolveFirstSyncComplete(sqlite.db)).toBe(true);
  });

  test('the adoption is persisted, so it stays true if the rows are later gone', () => {
    seedTrip(sqlite, { is_dirty: true });
    resolveFirstSyncComplete(sqlite.db);
    sqlite.native.exec('DELETE FROM trips');
    expect(resolveFirstSyncComplete(sqlite.db)).toBe(true);
    expect(isFirstSyncComplete(sqlite.db)).toBe(true);
  });

  test('rows of any mirrored table count, tombstones included', () => {
    seedTrip(sqlite, { deleted_at: '2026-09-01T10:00:00.000Z' });
    expect(resolveFirstSyncComplete(sqlite.db)).toBe(true);
  });

  test('an interrupted snapshot (cursor stored, no flag) is NOT complete, even with rows', () => {
    seedTrip(sqlite);
    seed(sqlite, 'notes', '00000000-0000-4000-8000-000000000011');
    writePullCursor(sqlite.db, 'page-1');
    expect(resolveFirstSyncComplete(sqlite.db)).toBe(false);
    expect(isFirstSyncComplete(sqlite.db)).toBe(false);
  });

  test('a stored flag wins over everything', () => {
    markFirstSyncComplete(sqlite.db);
    writePullCursor(sqlite.db, 'page-9');
    expect(resolveFirstSyncComplete(sqlite.db)).toBe(true);
  });
});
