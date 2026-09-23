/**
 * Session state — the auth gate's source of truth (R009, research D-17).
 *
 * The root layout chooses between the `(auth)` and `(tabs)` groups from
 * `status` alone, so this store is deliberately small: it answers "is there a
 * session on this device?" and nothing else. Sign-in, refresh, and sign-out
 * mutations arrive with US1 (T065) and write through this store rather than
 * around it.
 *
 * Hydration is a local keychain read — no network (Principle II). The token is
 * opaque here; only the API client (T039) ever inspects it.
 */
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

/**
 * Keychain / Keystore key. Shared with the API client and the sign-in
 * mutation; changing it signs every traveller out on their next launch.
 * `expo-secure-store` keys may contain letters, digits, `.`, `-`, `_` only
 * (v57 SecureStore reference).
 */
export const SESSION_KEY = 'triptrackr.session';

export type SessionStatus =
  /** The keychain has not answered yet. The gate MUST NOT decide. */
  | 'loading'
  /** No session on this device. */
  | 'signed-out'
  /** A session token is stored. Validity is the API client's concern. */
  | 'signed-in';

export interface SessionState {
  status: SessionStatus;
  /**
   * Read the stored session and settle `status`.
   *
   * If the keychain cannot be read, the store fails CLOSED — `signed-out` — so a
   * fault can only ever cost a traveller a sign-in, never show them a session
   * that is not theirs (Constitution I). The error is then rethrown: settling
   * on a safe state is not the same as the failure being acceptable, and the
   * caller (the root layout) reports it.
   */
  hydrate: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set) => ({
  status: 'loading',

  hydrate: async () => {
    let token: string | null;
    try {
      token = await SecureStore.getItemAsync(SESSION_KEY);
    } catch (error) {
      set({ status: 'signed-out' });
      throw error;
    }
    // An empty string is not a session — it is a bug in whoever wrote it.
    set({ status: token ? 'signed-in' : 'signed-out' });
  },
}));
