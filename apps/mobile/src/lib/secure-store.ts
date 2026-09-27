/**
 * Typed keychain wrapper — tasks.md T040 (FR-003).
 *
 * Everything that must survive an app restart but must never sit in plain
 * storage goes through here: the token pair, the traveller's own profile (it
 * contains their email), and the key that encrypts the local database. The
 * API client (T039), the session store, and the database client (T041) all
 * import this module rather than `expo-secure-store` directly, so the key
 * names and the "what counts as a session" rule live in exactly one place.
 *
 * Platform notes (https://docs.expo.dev/versions/v57.0.0/sdk/securestore.md):
 *   - Keys may contain alphanumerics, `.`, `-`, `_` only.
 *   - iOS Keychain values persist across an uninstall/reinstall with the same
 *     bundle id; Android Keystore values do not. Neither is relied upon: a
 *     lost session costs a sign-in, a lost database key costs the local
 *     mirror, which the server holds anyway once US6 syncs it.
 *   - Some iOS releases refused values above ~2 KB. The largest value here is
 *     the profile JSON (bounded by the contract to well under that).
 *   - `AFTER_FIRST_UNLOCK` lets the background reconciler (US6) read the
 *     tokens and the database key while the screen is locked; the default
 *     `WHEN_UNLOCKED` would make every background sync fail on a locked phone.
 */
import { UserProfile } from '@triptrackr/contracts';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

export const SECURE_KEYS = {
  accessToken: 'triptrackr.access_token',
  refreshToken: 'triptrackr.refresh_token',
  dbKey: 'triptrackr.db_key',
  user: 'triptrackr.user',
} as const;

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

export interface StoredSession extends StoredTokens {
  user: UserProfile;
}

/** SQLCipher takes a raw 256-bit key; 32 bytes → 64 hex characters. */
const DATABASE_KEY_BYTES = 32;
const DATABASE_KEY_PATTERN = /^[0-9a-f]{64}$/;

const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

function parseStoredProfile(raw: string): UserProfile | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    // Written by this module, so a parse failure is corruption, not input.
    // The caller treats it as "no session" — the traveller signs in again and
    // the value is rewritten.
    return null;
  }
  const parsed = UserProfile.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/**
 * The stored session, or `null` when any part of it is missing or unreadable.
 * Half a session is no session: a token pair without a profile (or the
 * reverse) cannot be acted on, and failing closed costs only a sign-in
 * (Constitution I). Keychain read failures are rethrown — the caller decides
 * how to report them.
 */
export async function getSession(): Promise<StoredSession | null> {
  const [accessToken, refreshToken, rawUser] = await Promise.all([
    SecureStore.getItemAsync(SECURE_KEYS.accessToken, options),
    SecureStore.getItemAsync(SECURE_KEYS.refreshToken, options),
    SecureStore.getItemAsync(SECURE_KEYS.user, options),
  ]);
  if (!accessToken || !refreshToken || !rawUser) return null;

  const user = parseStoredProfile(rawUser);
  if (!user) return null;

  return { accessToken, refreshToken, user };
}

/** Rotate the token pair (refresh path). The profile is untouched. */
export async function setTokens(tokens: StoredTokens): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(SECURE_KEYS.accessToken, tokens.accessToken, options),
    SecureStore.setItemAsync(SECURE_KEYS.refreshToken, tokens.refreshToken, options),
  ]);
}

/** Establish a session after register / login / OAuth. */
export async function setSession(session: StoredSession): Promise<void> {
  await Promise.all([
    setTokens(session),
    SecureStore.setItemAsync(SECURE_KEYS.user, JSON.stringify(session.user), options),
  ]);
}

/**
 * Sign out on this device. The database key is deliberately NOT removed: the
 * local mirror is per-account (`triptrackr-<user id>.db`), stays encrypted on
 * disk, and is reopened when that traveller signs in again (Constitution V —
 * nothing recorded is discarded by a sign-out).
 */
export async function clearSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(SECURE_KEYS.accessToken, options),
    SecureStore.deleteItemAsync(SECURE_KEYS.refreshToken, options),
    SecureStore.deleteItemAsync(SECURE_KEYS.user, options),
  ]);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readOrCreateDatabaseKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(SECURE_KEYS.dbKey, options);
  if (existing !== null) {
    if (!DATABASE_KEY_PATTERN.test(existing)) {
      // Opening SQLCipher with a malformed key would silently produce a
      // database nothing else can read. Refuse loudly instead.
      throw new Error('Stored database key is malformed; refusing to open the database.');
    }
    return existing;
  }

  // https://docs.expo.dev/versions/v57.0.0/sdk/crypto.md — `getRandomBytesAsync`
  // uses the platform CSPRNG (byteCount 0–1024).
  const bytes = await Crypto.getRandomBytesAsync(DATABASE_KEY_BYTES);
  const key = toHex(bytes);
  await SecureStore.setItemAsync(SECURE_KEYS.dbKey, key, options);
  return key;
}

let databaseKeyInFlight: Promise<string> | null = null;

/**
 * The SQLCipher key for this device, created on first use and never rotated.
 *
 * Single-flight: two callers racing on first launch must not each generate a
 * key, or whichever database opened first becomes unreadable the moment the
 * second write lands.
 */
export function getOrCreateDatabaseKey(): Promise<string> {
  if (!databaseKeyInFlight) {
    databaseKeyInFlight = readOrCreateDatabaseKey().finally(() => {
      databaseKeyInFlight = null;
    });
  }
  return databaseKeyInFlight;
}
