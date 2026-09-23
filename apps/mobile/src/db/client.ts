/**
 * Local database client — tasks.md T041 (research D-01; data-model.md §10; FR-033).
 *
 * One SQLCipher-encrypted SQLite file PER ACCOUNT, `triptrackr-<user id>.db`,
 * opened when a traveller signs in and left alone when they sign out. Two
 * constitutional reasons for the per-account file rather than one shared
 * `triptrackr.db`:
 *
 *   - Principle I: on a shared device, traveller B must never see traveller
 *     A's trips. A shared file would list them the moment B's session opened
 *     the live query; separate files make the disclosure impossible rather
 *     than filtered.
 *   - Principle V: signing out must not discard what a traveller recorded.
 *     Wiping the shared file on sign-out would; a per-account file simply
 *     waits, encrypted, for its owner.
 *
 * Verified against https://docs.expo.dev/versions/v57.0.0/sdk/sqlite.md:
 *   - `openDatabaseAsync(name, { enableChangeListener: true })` — the change
 *     listener is what Drizzle's `useLiveQuery` subscribes to
 *     (https://orm.drizzle.team/docs/connect-expo-sqlite, "Live Queries").
 *   - SQLCipher: "Right after you open a database, you need to set a password
 *     for the database using the `PRAGMA key` statement." The v57 page shows
 *     the passphrase form; this file uses SQLCipher's raw-key form
 *     `PRAGMA key = "x'<64 hex>'"` (https://www.zetetic.net/sqlcipher/sqlcipher-api/#key)
 *     because the key is 32 random bytes from the keychain, not a passphrase
 *     — a KDF over already-random bytes adds nothing but startup time.
 *   - `PRAGMA cipher_version` returns a row only on a SQLCipher build. A plain
 *     SQLite build silently ignores `PRAGMA key`, which would store journals
 *     and boarding passes in clear text; the check turns that into a launch
 *     error instead (FR-033, Constitution IV: verify, do not assume).
 *   - `PRAGMA journal_mode = WAL` / `PRAGMA foreign_keys = ON` as in the
 *     page's "Executing PRAGMA queries" example.
 *
 * Migrations run INSIDE the open sequence with `migrate()` — the function
 * Drizzle's `useMigrations` hook wraps (https://orm.drizzle.team/docs/connect-expo-sqlite,
 * "Expo SQLite migrations with Drizzle Kit") — so a database handed to a
 * screen is always migrated, and the root layout can hold the splash until
 * both the session and the schema are settled. A hook per layout would run
 * the migrator concurrently on one connection; one awaited call cannot.
 */
import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { createContext, useContext, useEffect, useState } from 'react';

import { getOrCreateDatabaseKey } from '@/lib/secure-store';

import migrations from './migrations/migrations';
import * as schema from './schema';

export type AppDatabase = ExpoSQLiteDatabase<typeof schema> & { $client: SQLiteDatabase };

const FILE_NAME_SAFE = /^[A-Za-z0-9-]+$/;

/** `triptrackr-<user id>.db`. The id is a UUID, so the name is always filesystem-safe. */
export function databaseFileName(userId: string): string {
  if (!FILE_NAME_SAFE.test(userId)) {
    throw new Error('Refusing to derive a database file name from a malformed user id.');
  }
  return `triptrackr-${userId}.db`;
}

export class UnencryptedDatabaseError extends Error {
  constructor() {
    super(
      'This build of expo-sqlite is not SQLCipher. Refusing to open the local store ' +
        'unencrypted — rebuild with the expo-sqlite plugin option `useSQLCipher: true`.',
    );
    this.name = 'UnencryptedDatabaseError';
  }
}

async function assertEncrypted(client: SQLiteDatabase): Promise<void> {
  const row = await client.getFirstAsync<{ cipher_version?: string }>(
    'PRAGMA cipher_version',
  );
  if (!row?.cipher_version) throw new UnencryptedDatabaseError();
}

/**
 * Open (creating if needed) the signed-in traveller's encrypted database and
 * bring it to the current schema. Resolves only once every bundled migration
 * has been applied.
 */
export async function openDatabase(userId: string): Promise<AppDatabase> {
  const fileName = databaseFileName(userId);
  const key = await getOrCreateDatabaseKey();

  const client = await openDatabaseAsync(fileName, { enableChangeListener: true });
  // Must be the first statement on the connection (SQLCipher API).
  await client.execAsync(`PRAGMA key = "x'${key}'"`);
  await assertEncrypted(client);
  await client.execAsync('PRAGMA journal_mode = WAL');
  await client.execAsync('PRAGMA foreign_keys = ON');

  const db = drizzle(client, { schema });
  await migrate(db, migrations);
  return db;
}

// ---------------------------------------------------------------------------
// React integration
// ---------------------------------------------------------------------------

const DatabaseContext = createContext<AppDatabase | null>(null);

/** Provides an OPEN, MIGRATED database to the signed-in screens. */
export const DatabaseProvider = DatabaseContext.Provider;

/**
 * The open, migrated database. Only reachable inside `<RequireLocalStore>`,
 * which renders its children strictly after the store is ready — so a null
 * here is a programming error, and it says so.
 */
export function useDatabase(): AppDatabase {
  const db = useContext(DatabaseContext);
  if (!db) {
    throw new Error(
      'useDatabase() called outside <DatabaseProvider>; the local store is not open.',
    );
  }
  return db;
}

export interface LocalStoreState {
  /** Non-null once opened AND migrated. */
  db: AppDatabase | null;
  error: Error | null;
  /** Try again after a failure — the traveller's "Try again". */
  retry: () => void;
}

const LocalStoreContext = createContext<LocalStoreState>({
  db: null,
  error: null,
  retry: () => undefined,
});

/** The root layout publishes the open-state here; signed-in layouts gate on it. */
export const LocalStoreProvider = LocalStoreContext.Provider;

export function useLocalStore(): LocalStoreState {
  return useContext(LocalStoreContext);
}

interface OpenAttempt {
  forUser: string;
  attempt: number;
  db: AppDatabase | null;
  error: Error | null;
}

/**
 * Open the database for `userId`, or hold `null` while nobody is signed in.
 * Opening is asynchronous (keychain read + SQLCipher key + migrations), so the
 * result arrives through state; a failure is exposed rather than thrown so
 * the layout can render a designed error state instead of a blank screen.
 */
export function useOpenDatabase(userId: string | null): LocalStoreState {
  const [settled, setSettled] = useState<OpenAttempt | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    openDatabase(userId)
      .then((db) => {
        if (!cancelled) setSettled({ forUser: userId, attempt, db, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSettled({
            forUser: userId,
            attempt,
            db: null,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  // A result for a previous traveller, or for an attempt that has since been
  // retried, is never handed out: it reads as "still opening" instead.
  const current =
    settled && settled.forUser === userId && settled.attempt === attempt
      ? settled
      : { db: null, error: null };

  return { db: current.db, error: current.error, retry: () => setAttempt((n) => n + 1) };
}
