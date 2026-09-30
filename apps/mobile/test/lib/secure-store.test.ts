/**
 * T040 — the typed keychain wrapper (FR-003); T212 — the device documents key.
 *
 * Everything the API client, the session store, the local database key, and
 * the document vault derive from the keychain goes through this module, so
 * what is pinned here is the contract they rely on: the fixed key names, the
 * round trip of a session, that a half-written session is treated as no
 * session, and that the database and documents keys are each created exactly
 * once and never regenerated.
 */
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import {
  SECURE_KEYS,
  clearOfflineMapsWipePending,
  clearSession,
  getOrCreateDatabaseKey,
  getOrCreateDocumentsKey,
  getSession,
  isOfflineMapsWipePending,
  markOfflineMapsWipePending,
  setSession,
  setTokens,
} from '@/lib/secure-store';

const secureStore = SecureStore as unknown as {
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
  __reset: () => void;
};

const profile = {
  id: '6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e4f',
  email: 'ana@example.com',
  display_name: 'Ana',
  avatar_url: null,
  bio: null,
  home_currency: 'EUR',
  is_profile_public: false,
  email_verified_at: null,
  created_at: '2026-09-01T10:00:00.000Z',
};

beforeEach(() => {
  secureStore.__reset();
});

describe('secure-store — key names', () => {
  test('uses the agreed keychain keys, which may contain only [A-Za-z0-9._-] (v57 SecureStore reference)', () => {
    expect(SECURE_KEYS).toEqual({
      accessToken: 'triptrackr.access_token',
      refreshToken: 'triptrackr.refresh_token',
      dbKey: 'triptrackr.db_key',
      documentsKey: 'triptrackr.documents_key',
      user: 'triptrackr.user',
      offlineMapsWipe: 'triptrackr.offline_maps_wipe',
    });
    for (const key of Object.values(SECURE_KEYS)) {
      expect(key).toMatch(/^[A-Za-z0-9._-]+$/);
    }
  });
});

describe('secure-store — session', () => {
  test('round-trips a session through the keychain', async () => {
    await setSession({ accessToken: 'access', refreshToken: 'refresh', user: profile });

    await expect(getSession()).resolves.toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: profile,
    });
  });

  test('returns null when nothing is stored', async () => {
    await expect(getSession()).resolves.toBeNull();
  });

  test('treats a session missing either token as no session (fails closed)', async () => {
    await SecureStore.setItemAsync(SECURE_KEYS.accessToken, 'access');
    await SecureStore.setItemAsync(SECURE_KEYS.user, JSON.stringify(profile));

    await expect(getSession()).resolves.toBeNull();
  });

  test('treats an unreadable stored profile as no session rather than a crash', async () => {
    await setSession({ accessToken: 'access', refreshToken: 'refresh', user: profile });
    await SecureStore.setItemAsync(SECURE_KEYS.user, '{not json');

    await expect(getSession()).resolves.toBeNull();
  });

  test('treats a profile that no longer matches the contract as no session', async () => {
    await setSession({ accessToken: 'access', refreshToken: 'refresh', user: profile });
    await SecureStore.setItemAsync(SECURE_KEYS.user, JSON.stringify({ id: 'nope' }));

    await expect(getSession()).resolves.toBeNull();
  });

  test('setTokens rotates the pair and keeps the profile', async () => {
    await setSession({ accessToken: 'a1', refreshToken: 'r1', user: profile });

    await setTokens({ accessToken: 'a2', refreshToken: 'r2' });

    await expect(getSession()).resolves.toEqual({
      accessToken: 'a2',
      refreshToken: 'r2',
      user: profile,
    });
  });

  test('clearSession removes every session key but leaves the database key alone', async () => {
    await setSession({ accessToken: 'access', refreshToken: 'refresh', user: profile });
    const dbKey = await getOrCreateDatabaseKey();

    await clearSession();

    await expect(getSession()).resolves.toBeNull();
    await expect(SecureStore.getItemAsync(SECURE_KEYS.dbKey)).resolves.toBe(dbKey);
  });

  test('propagates a keychain failure instead of swallowing it', async () => {
    secureStore.getItemAsync.mockRejectedValueOnce(new Error('Keychain unavailable'));

    await expect(getSession()).rejects.toThrow('Keychain unavailable');
  });
});

describe('secure-store — a pending wipe of the offline maps (research D-06)', () => {
  test('is recorded until it is cleared, and survives a sign-out', async () => {
    await expect(isOfflineMapsWipePending()).resolves.toBe(false);

    await markOfflineMapsWipePending();
    await clearSession();
    await expect(isOfflineMapsWipePending()).resolves.toBe(true);

    await clearOfflineMapsWipePending();
    await expect(isOfflineMapsWipePending()).resolves.toBe(false);
  });

  test('propagates a keychain failure instead of swallowing it', async () => {
    secureStore.setItemAsync.mockRejectedValueOnce(new Error('Keychain unavailable'));

    await expect(markOfflineMapsWipePending()).rejects.toThrow('Keychain unavailable');
  });
});

describe('secure-store — database key', () => {
  test('creates a 32-byte key, hex encoded, from expo-crypto', async () => {
    const key = await getOrCreateDatabaseKey();

    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(Crypto.getRandomBytesAsync).toHaveBeenCalledWith(32);
  });

  test('returns the same key on every subsequent call — a regenerated key is a lost database', async () => {
    const first = await getOrCreateDatabaseKey();
    const second = await getOrCreateDatabaseKey();

    expect(second).toBe(first);
    expect(secureStore.setItemAsync).toHaveBeenCalledTimes(1);
  });

  test('two concurrent first calls share one key', async () => {
    const [a, b] = await Promise.all([
      getOrCreateDatabaseKey(),
      getOrCreateDatabaseKey(),
    ]);

    expect(a).toBe(b);
    expect(Crypto.getRandomBytesAsync).toHaveBeenCalledTimes(1);
  });

  test('refuses a stored key that is not 64 hex characters rather than opening the database with it', async () => {
    await SecureStore.setItemAsync(SECURE_KEYS.dbKey, 'short');

    await expect(getOrCreateDatabaseKey()).rejects.toThrow(/database key/i);
  });
});

describe('secure-store — documents key (T212, research D-32)', () => {
  test('creates a 32-byte key for AES-256, hex encoded, from expo-crypto, kept after first unlock', async () => {
    const key = await getOrCreateDocumentsKey();

    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(Crypto.getRandomBytesAsync).toHaveBeenCalledWith(32);
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(SECURE_KEYS.documentsKey, key, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  });

  test('returns the same key on every subsequent call — a regenerated key is every sealed document lost', async () => {
    const first = await getOrCreateDocumentsKey();
    const second = await getOrCreateDocumentsKey();

    expect(second).toBe(first);
    expect(secureStore.setItemAsync).toHaveBeenCalledTimes(1);
  });

  test('two concurrent first calls share one key', async () => {
    const [a, b] = await Promise.all([
      getOrCreateDocumentsKey(),
      getOrCreateDocumentsKey(),
    ]);

    expect(a).toBe(b);
    expect(Crypto.getRandomBytesAsync).toHaveBeenCalledTimes(1);
  });

  test('is its own key, never the database key, and survives a sign-out', async () => {
    await setSession({ accessToken: 'access', refreshToken: 'refresh', user: profile });
    const databaseKey = await getOrCreateDatabaseKey();
    const documentsKey = await getOrCreateDocumentsKey();

    await clearSession();

    expect(documentsKey).not.toBe(databaseKey);
    await expect(getOrCreateDocumentsKey()).resolves.toBe(documentsKey);
  });

  test('refuses a stored key that is not 64 hex characters rather than sealing with it', async () => {
    await SecureStore.setItemAsync(SECURE_KEYS.documentsKey, 'short');

    await expect(getOrCreateDocumentsKey()).rejects.toThrow(/documents key/i);
  });

  test('propagates a keychain failure, and the next call tries again', async () => {
    secureStore.getItemAsync.mockRejectedValueOnce(new Error('Keychain unavailable'));

    await expect(getOrCreateDocumentsKey()).rejects.toThrow('Keychain unavailable');
    await expect(getOrCreateDocumentsKey()).resolves.toMatch(/^[0-9a-f]{64}$/);
  });
});
