/**
 * A REAL SQLite database for the mobile test suite.
 *
 * Constitution III: "Integration tests MUST run against a real database rather
 * than a mocked one." `expo-sqlite` is native and cannot run under Jest, but
 * Drizzle's Expo driver only needs a handful of synchronous statement methods
 * from the client it is handed. This adapter provides them over Node's
 * built-in `node:sqlite` (unflagged since Node 22.13; `setReturnArrays` since
 * 22.16 — `.nvmrc` pins 22), so every repository test below executes the
 * generated migration and the repository's actual SQL against SQLite itself.
 *
 * What the adapter mirrors, method for method, from the v57 `SQLiteStatement`
 * surface Drizzle touches (node_modules/drizzle-orm/expo-sqlite/session.js):
 *   - `prepareSync(sql)`
 *   - `executeSync(params)` → `{ changes, lastInsertRowId, getAllSync(), getFirstSync() }`
 *   - `executeForRawResultSync(params)` → `{ getAllSync() }` returning arrays
 *
 * Change notifications: the device's `sqlite3_update_hook` fires
 * `addDatabaseChangeListener` after each write. Here a suite calls
 * `emitChange(table)` explicitly, so a live query's re-run is observable and
 * deliberate.
 */
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import type { SQLiteDatabase } from 'expo-sqlite';
import { DatabaseSync, type StatementSync } from 'node:sqlite';

import migrations from '@/db/migrations/migrations';
import * as schema from '@/db/schema';

export type TestDatabase = ReturnType<typeof drizzle<typeof schema>>;

type Params = readonly unknown[];
type BindValue = string | number | bigint | null | Uint8Array;

function bind(params: Params | undefined): BindValue[] {
  return (params ?? []).map((value) => {
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value === undefined) return null;
    return value as BindValue;
  });
}

function prepareArrays(statement: StatementSync): StatementSync {
  if (typeof statement.setReturnArrays !== 'function') {
    throw new Error(
      'node:sqlite StatementSync.setReturnArrays is unavailable — the mobile test suite needs Node >= 22.16.',
    );
  }
  statement.setReturnArrays(true);
  return statement;
}

/**
 * Lazily executes so that Drizzle's `run` path (which reads `changes`) and its
 * `all`/`get` paths (which call `getAllSync`/`getFirstSync`) each execute the
 * statement exactly once — an eager `run()` on an `INSERT … RETURNING` would
 * otherwise insert twice.
 */
function execute(statement: StatementSync, params: Params | undefined) {
  const values = bind(params);
  let result: { changes: number | bigint; lastInsertRowid: number | bigint } | null =
    null;
  const run = () => (result ??= statement.run(...values));
  return {
    get changes() {
      return Number(run().changes);
    },
    get lastInsertRowId() {
      return Number(run().lastInsertRowid);
    },
    getAllSync: () => statement.all(...values),
    getFirstSync: () => statement.get(...values) ?? null,
  };
}

function toClient(native: DatabaseSync): SQLiteDatabase {
  const client = {
    prepareSync(source: string) {
      return {
        executeSync: (params?: Params) => execute(native.prepare(source), params),
        executeForRawResultSync: (params?: Params) => ({
          getAllSync: () => prepareArrays(native.prepare(source)).all(...bind(params)),
        }),
        finalizeSync: () => undefined,
      };
    },
  };
  // Structural subset of the v57 SQLiteDatabase; the cast is the adapter's whole point.
  return client as unknown as SQLiteDatabase;
}

export interface TestSqlite {
  db: TestDatabase;
  native: DatabaseSync;
  /** Fire the change listeners a device would fire after writing `table`. */
  emitChange: (table: string) => void;
  close: () => void;
}

/** An in-memory database with the generated migration applied. */
export async function createTestDatabase(): Promise<TestSqlite> {
  const native = new DatabaseSync(':memory:');
  native.exec('PRAGMA foreign_keys = ON');
  const db = drizzle(toClient(native), { schema });
  await migrate(db, migrations);

  const sqlite = jest.requireMock('expo-sqlite') as {
    __emitChange: (table: string) => void;
  };

  return {
    db,
    native,
    emitChange: (table) => sqlite.__emitChange(table),
    close: () => native.close(),
  };
}
