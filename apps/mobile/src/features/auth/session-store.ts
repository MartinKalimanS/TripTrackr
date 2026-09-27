/**
 * Session state — the auth gate's source of truth (R009, research D-17; T065).
 *
 * The root layout chooses between the `(auth)` and `(tabs)` groups from
 * `status` alone, so this store is deliberately small: it answers "is there a
 * session on this device, and whose?" and nothing else. The register / login /
 * OAuth / sign-out mutations (`use-session.ts`) and the API client's refresh
 * path write through `signIn` / `signOut` rather than around them.
 *
 * Hydration is a local keychain read — no network (Principle II). Tokens are
 * never held here; only the API client (T039) reads them, through the T040
 * wrapper.
 */
import type { UserProfile } from '@triptrackr/contracts';
import { create } from 'zustand';

import { getSession } from '@/lib/secure-store';

export type SessionStatus =
  /** The keychain has not answered yet. The gate MUST NOT decide. */
  | 'loading'
  /** No session on this device. */
  | 'signed-out'
  /** A session is stored. Token validity is the API client's concern. */
  | 'signed-in';

export interface SessionState {
  status: SessionStatus;
  /** The signed-in traveller, as last returned by the API. Null when signed out. */
  user: UserProfile | null;
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
  /** A session has been established and persisted; open the signed-in screens. */
  signIn: (user: UserProfile) => void;
  /** The local session is gone (sign-out, or a refresh the server refused). */
  signOut: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  status: 'loading',
  user: null,

  hydrate: async () => {
    let session: Awaited<ReturnType<typeof getSession>>;
    try {
      session = await getSession();
    } catch (error) {
      set({ status: 'signed-out', user: null });
      throw error;
    }
    set(
      session
        ? { status: 'signed-in', user: session.user }
        : { status: 'signed-out', user: null },
    );
  },

  signIn: (user) => set({ status: 'signed-in', user }),

  signOut: () => set({ status: 'signed-out', user: null }),
}));
