/**
 * T042 — the generated local migration, applied to a real SQLite database.
 *
 * Pins the shape data-model.md §10 promises: the seven `SYNC_TABLES` exist
 * with `is_dirty` / `synced_at`, the file-backed tables carry
 * `local_file_uri`, the geography caches and the sync cursor table exist, and
 * — Constitution I — `expenses` and `documents` have no visibility column.
 */
import { SYNC_TABLES } from '@triptrackr/contracts';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';

import migrations from '@/db/migrations/migrations';

import { createTestDatabase, type TestSqlite } from './sqlite-harness';

let sqlite: TestSqlite;

beforeEach(async () => {
  sqlite = await createTestDatabase();
});

afterEach(() => {
  sqlite.close();
});

function columnsOf(table: string): string[] {
  return (
    sqlite.native.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  ).map((row) => row.name);
}

function tables(): string[] {
  return (
    sqlite.native
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[]
  ).map((row) => row.name);
}

describe('local migration 0000', () => {
  test('creates every mirrored table, the two geography caches, and the sync cursor table', () => {
    const created = tables();
    for (const table of SYNC_TABLES) expect(created).toContain(table);
    expect(created).toEqual(
      expect.arrayContaining(['countries', 'cities', 'sync_cursors']),
    );
  });

  test.each([...SYNC_TABLES])(
    '%s carries the wire meta and the local-only sync columns (data-model.md §10)',
    (table) => {
      const columns = columnsOf(table);
      expect(columns).toEqual(
        expect.arrayContaining([
          'id',
          'created_at',
          'updated_at',
          'deleted_at',
          'is_dirty',
          'synced_at',
        ]),
      );
    },
  );

  test.each(['photos', 'documents'])(
    '%s stages its bytes through local_file_uri (FR-041)',
    (table) => {
      expect(columnsOf(table)).toContain('local_file_uri');
    },
  );

  test.each(['expenses', 'documents'])(
    '%s has no visibility column — owner-only, structurally (Constitution I)',
    (table) => {
      expect(columnsOf(table)).not.toContain('is_public');
    },
  );

  test('is_dirty defaults to true so a row written locally is pending until the server confirms', () => {
    sqlite.native
      .prepare(
        "INSERT INTO trips (id, created_at, updated_at, title, home_currency) VALUES ('t1', 'now', 'now', 'Italy', 'EUR')",
      )
      .run();
    const row = sqlite.native.prepare('SELECT is_dirty, synced_at FROM trips').get() as {
      is_dirty: number;
      synced_at: string | null;
    };
    expect(row).toEqual({ is_dirty: 1, synced_at: null });
  });

  test('a stop cannot reference a trip that does not exist (parents before children)', () => {
    expect(() =>
      sqlite.native
        .prepare(
          "INSERT INTO trip_stops (id, created_at, updated_at, trip_id, city_id, sort_order, arrive_date, depart_date) VALUES ('s1', 'now', 'now', 'missing', 1, 0, '2026-05-10', '2026-05-12')",
        )
        .run(),
    ).toThrow(/FOREIGN KEY/i);
  });

  test('is idempotent — running the migrator twice applies nothing new', async () => {
    await expect(migrate(sqlite.db, migrations)).resolves.toBeUndefined();
    const applied = sqlite.native
      .prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations')
      .get() as { n: number };
    // One ledger row per generated migration, however many times the migrator ran.
    expect(applied.n).toBe(Object.keys(migrations.migrations).length);
  });
});

describe('local migration 0001 (US2)', () => {
  test('adds the fx_rates snapshot cache — one row per currency, never pushed (research D-10)', () => {
    expect(tables()).toContain('fx_rates');
    expect(columnsOf('fx_rates')).toEqual(['quote_currency', 'rate', 'as_of', 'source']);
    // Reference data carries no sync bookkeeping.
    expect(columnsOf('fx_rates')).not.toContain('is_dirty');
  });
});
