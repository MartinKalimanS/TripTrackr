/**
 * T041 — opening the encrypted local database (research D-01, FR-033).
 *
 * `expo-sqlite` is native, so `openDatabaseAsync` is a recorder here, and the
 * migrator is a recorder too (test/db/migrations.test.ts proves the real one
 * against a real database). What is pinned is the protocol the v57 SQLite
 * page and SQLCipher require: the key pragma is the FIRST statement on the
 * connection, the build is verified to be SQLCipher before anything else
 * runs, a plain-SQLite build is refused rather than silently storing boarding
 * passes in clear text, and migrations run before the database is handed out.
 */
import { act, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import * as SQLite from 'expo-sqlite';
import { Text } from 'react-native';

import {
  DatabaseProvider,
  LocalStoreProvider,
  UnencryptedDatabaseError,
  databaseFileName,
  openDatabase,
  useDatabase,
  useLocalStore,
  useOpenDatabase,
} from '@/db/client';
import { SECURE_KEYS } from '@/lib/secure-store';

import { createTestDatabase } from './sqlite-harness';

jest.mock('drizzle-orm/expo-sqlite/migrator', () => ({
  migrate: jest.fn(async () => undefined),
}));

const secureStore = jest.requireMock('expo-secure-store') as {
  setItemAsync: (key: string, value: string) => Promise<void>;
  getItemAsync: jest.Mock;
  __reset: () => void;
};
const openDatabaseAsync = SQLite.openDatabaseAsync as jest.Mock;
const migrateMock = migrate as jest.Mock;

const USER_ID = '6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e4f';
const KEY = 'ab'.repeat(32);

function fakeClient({ cipher = '4.6.1' }: { cipher?: string | null } = {}) {
  return {
    execAsync: jest.fn(async (_sql: string) => undefined),
    getFirstAsync: jest.fn(async (sql: string) =>
      sql === 'PRAGMA cipher_version' && cipher ? { cipher_version: cipher } : null,
    ),
  };
}

beforeEach(async () => {
  secureStore.__reset();
  migrateMock.mockReset().mockResolvedValue(undefined);
  await secureStore.setItemAsync(SECURE_KEYS.dbKey, KEY);
});

describe('databaseFileName', () => {
  test('is one file per account', () => {
    expect(databaseFileName(USER_ID)).toBe(`triptrackr-${USER_ID}.db`);
  });

  test('refuses anything that is not a plain identifier — a path is not a user id', () => {
    expect(() => databaseFileName('../other')).toThrow(/malformed user id/);
  });
});

describe('openDatabase', () => {
  test('opens the per-account file with change listeners on, keys it first, verifies SQLCipher, sets WAL and foreign keys, then migrates', async () => {
    const client = fakeClient();
    openDatabaseAsync.mockResolvedValueOnce(client);

    const db = await openDatabase(USER_ID);

    expect(openDatabaseAsync).toHaveBeenCalledWith(`triptrackr-${USER_ID}.db`, {
      enableChangeListener: true,
    });
    expect(client.execAsync.mock.calls.map(([sql]) => sql)).toEqual([
      `PRAGMA key = "x'${KEY}'"`,
      'PRAGMA journal_mode = WAL',
      'PRAGMA foreign_keys = ON',
    ]);
    // The cipher check sits between the key and the remaining pragmas.
    expect(client.getFirstAsync).toHaveBeenCalledWith('PRAGMA cipher_version');
    const [keyCall, walCall] = client.execAsync.mock.invocationCallOrder;
    const [cipherCall] = client.getFirstAsync.mock.invocationCallOrder;
    expect(cipherCall).toBeGreaterThan(keyCall ?? 0);
    expect(cipherCall).toBeLessThan(walCall ?? 0);
    // Migrations run last, on the drizzle instance that is returned.
    expect(migrateMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ journal: expect.anything() }),
    );
    expect(migrateMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      client.execAsync.mock.invocationCallOrder[2] ?? 0,
    );
    expect(db.$client).toBe(client);
  });

  test('refuses a build without SQLCipher instead of storing private data in clear text (FR-033)', async () => {
    const client = fakeClient({ cipher: null });
    openDatabaseAsync.mockResolvedValueOnce(client);

    await expect(openDatabase(USER_ID)).rejects.toBeInstanceOf(UnencryptedDatabaseError);
    expect(client.execAsync).toHaveBeenCalledTimes(1);
    expect(migrateMock).not.toHaveBeenCalled();
  });

  test('propagates a keychain failure rather than opening with no key', async () => {
    secureStore.getItemAsync.mockRejectedValueOnce(new Error('Keychain unavailable'));

    await expect(openDatabase(USER_ID)).rejects.toThrow('Keychain unavailable');
    expect(openDatabaseAsync).not.toHaveBeenCalled();
  });

  test('a failed migration is a failed open — the database is never handed out half-migrated', async () => {
    openDatabaseAsync.mockResolvedValueOnce(fakeClient());
    migrateMock.mockRejectedValueOnce(new Error('Missing migration: 0001'));

    await expect(openDatabase(USER_ID)).rejects.toThrow('Missing migration: 0001');
  });
});

describe('useDatabase / DatabaseProvider', () => {
  test('throws outside a provider — a screen that reaches the store before it is open is a bug, not a blank list', async () => {
    await expect(renderHook(() => useDatabase())).rejects.toThrow(
      /outside <DatabaseProvider>/,
    );
  });

  test('returns the provided database inside', async () => {
    const sqlite = await createTestDatabase();
    const Probe = () => {
      const db = useDatabase();
      return <Text>{db === sqlite.db ? 'same-db' : 'other'}</Text>;
    };

    await render(
      <DatabaseProvider value={sqlite.db}>
        <Probe />
      </DatabaseProvider>,
    );

    expect(screen.getByText('same-db')).toBeTruthy();
    sqlite.close();
  });
});

describe('useLocalStore / LocalStoreProvider', () => {
  test('defaults to "not open" with an inert retry outside a provider', async () => {
    const { result } = await renderHook(() => useLocalStore());
    expect(result.current).toMatchObject({ db: null, error: null });
    expect(() => result.current.retry()).not.toThrow();
  });

  test('reads what the root layout published', async () => {
    const value = { db: null, error: new Error('nope'), retry: jest.fn() };
    const { result } = await renderHook(() => useLocalStore(), {
      wrapper: ({ children }) => (
        <LocalStoreProvider value={value}>{children}</LocalStoreProvider>
      ),
    });
    expect(result.current).toBe(value);
  });
});

describe('useOpenDatabase', () => {
  test('holds null while nobody is signed in and never touches the keychain', async () => {
    const { result } = await renderHook(() => useOpenDatabase(null));

    expect(result.current).toMatchObject({ db: null, error: null });
    expect(openDatabaseAsync).not.toHaveBeenCalled();
  });

  test('opens the signed-in traveller’s database', async () => {
    openDatabaseAsync.mockResolvedValueOnce(fakeClient());
    const { result } = await renderHook(() => useOpenDatabase(USER_ID));

    await waitFor(() => expect(result.current.db).not.toBeNull());
    expect(result.current.error).toBeNull();
  });

  test('exposes an open failure and retries on demand', async () => {
    openDatabaseAsync
      .mockResolvedValueOnce(fakeClient({ cipher: null }))
      .mockResolvedValueOnce(fakeClient());
    const { result } = await renderHook(() => useOpenDatabase(USER_ID));

    await waitFor(() =>
      expect(result.current.error).toBeInstanceOf(UnencryptedDatabaseError),
    );
    expect(result.current.db).toBeNull();

    await act(async () => result.current.retry());

    await waitFor(() => expect(result.current.db).not.toBeNull());
    expect(result.current.error).toBeNull();
  });

  test('wraps a non-Error rejection so the layout always has a message to show', async () => {
    openDatabaseAsync.mockRejectedValueOnce('disk full');
    const { result } = await renderHook(() => useOpenDatabase(USER_ID));

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.error?.message).toBe('disk full');
  });

  test('drops the previous traveller’s database the moment they sign out', async () => {
    openDatabaseAsync.mockResolvedValueOnce(fakeClient());
    const { result, rerender } = await renderHook(
      (userId: string | null) => useOpenDatabase(userId),
      { initialProps: USER_ID as string | null },
    );
    await waitFor(() => expect(result.current.db).not.toBeNull());

    await rerender(null);

    expect(result.current.db).toBeNull();
  });
});
