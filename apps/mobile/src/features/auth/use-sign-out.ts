/**
 * Sign out — with the guard that never does it silently (tasks.md T137;
 * FR-004, Constitution V; sync-protocol.md §3 last row, §6 scenario 11).
 *
 * Signing out ends this device's session and leaves the traveller's encrypted,
 * per-account database on disk (`db/client.ts`). Nothing is destroyed — but
 * whatever the server has not acknowledged exists ONLY on this device until
 * the traveller signs back in and it syncs, and a traveller who has been
 * told nothing would be surprised by that. So, before the server is asked to
 * forget the token or the keychain is touched:
 *
 *   1. push: `syncNow('sign-out')`, and a last nudge to the upload queue, both
 *      bounded by `SIGN_OUT_FLUSH_DEADLINE_MS` so a network that never answers
 *      cannot leave the button spinning for ever;
 *   2. count what is left: dirty rows (`countUnsynced`) plus photos and
 *      documents whose bytes have not arrived (`countPendingUploads`) —
 *      metadata without its file is not saved (FR-041);
 *   3. nothing left → sign out exactly as before; something left → stop and
 *      reject with `UnsyncedChangesError`, which the profile turns into an
 *      explicit choice: stay signed in, or sign out anyway (`{ force: true }`).
 *
 * The count is the truth, not the push's result: a push can report success
 * yet have joined a cycle that began before the traveller's latest edit. If
 * rows remain after a cycle that finished cleanly, one more cycle is run.
 *
 * If what is left cannot be counted at all, sign-out does not proceed — we
 * cannot claim nothing is at risk — and the failure is reported and surfaced
 * as an ordinary error. With no open store (only possible outside the signed-in
 * shell) there is no local content this session could lose, so the guard has
 * nothing to count and sign-out goes ahead as it always did.
 */
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';

import { useLocalStore, type AppDatabase } from '@/db/client';
import { useSessionStore } from '@/features/auth/session-store';
import { ApiRequestError, apiFetch } from '@/lib/api-client';
import { clearOfflineMaps } from '@/lib/mapbox';
import { clearSession, getSession } from '@/lib/secure-store';
import { Sentry } from '@/lib/sentry';
import { countUnsynced, syncNow } from '@/sync/engine';
import type { SyncCycleResult, SyncFailure } from '@/sync/types';
import { countPendingUploads, kickUploadQueue } from '@/sync/upload-queue';

import { countChanges } from './sign-out-copy';

/**
 * How long sign-out waits for the final push. Generous enough for a normal
 * cycle on a poor connection, short enough that "Signing out…" never looks
 * hung; whatever is still unsent when it passes is counted and named.
 */
export const SIGN_OUT_FLUSH_DEADLINE_MS = 20_000;

/** The push did not leave the device empty. Carries what is left and why. */
export class UnsyncedChangesError extends Error {
  /** Dirty rows the server has not acknowledged. */
  readonly changes: number;
  /** Photos and documents whose bytes have not reached the object store. */
  readonly uploads: number;
  /** Why the last cycle did not finish; null when it finished or never answered. */
  readonly failure: SyncFailure | null;

  constructor(changes: number, uploads: number, failure: SyncFailure | null) {
    super(`${countChanges(changes + uploads)} not backed up yet.`);
    this.name = 'UnsyncedChangesError';
    this.changes = changes;
    this.uploads = uploads;
    this.failure = failure;
  }

  get remaining(): number {
    return this.changes + this.uploads;
  }
}

export function isUnsyncedChangesError(error: unknown): error is UnsyncedChangesError {
  return error instanceof UnsyncedChangesError;
}

/** What the caller may ask of the mutation. */
export interface SignOutRequest {
  /** "Sign out anyway": the traveller has seen the warning and chosen to go. */
  force?: boolean;
}

interface Remaining {
  changes: number;
  uploads: number;
}

/** Failures that are expected on the way out and change nothing about the outcome. */
const EXPECTED_SIGN_OUT_FAILURES = new Set(['NETWORK', 'TIMEOUT', 'SESSION_EXPIRED']);

function isExpectedSignOutFailure(error: unknown): boolean {
  return error instanceof ApiRequestError && EXPECTED_SIGN_OUT_FAILURES.has(error.code);
}

function report(error: unknown): void {
  Sentry.captureException(error);
}

/** One push and one nudge, or `null` if the deadline won. */
async function flushOnce(): Promise<SyncCycleResult | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), SIGN_OUT_FLUSH_DEADLINE_MS);
  });
  const work = Promise.all([
    syncNow('sign-out'),
    kickUploadQueue('sign-out').catch(report),
  ]).then(([result]) => result);
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

async function countRemaining(db: AppDatabase): Promise<Remaining> {
  try {
    const [changes, uploads] = await Promise.all([
      countUnsynced(db),
      countPendingUploads(db),
    ]);
    return { changes, uploads };
  } catch (error) {
    report(error);
    throw error;
  }
}

/**
 * Push, then decide. Returns the verdict as an error to throw, or `null` when
 * nothing the server has not acknowledged remains on this device.
 */
async function settleBeforeSignOut(
  db: AppDatabase,
): Promise<UnsyncedChangesError | null> {
  let result = await flushOnce();
  // The API client has already ended a session the server refused; there is
  // nobody left to ask, and finishing the sign-out is all that remains.
  if (useSessionStore.getState().status !== 'signed-in') return null;

  let left = await countRemaining(db);
  if (left.changes + left.uploads > 0 && result?.ok) {
    // The cycle finished cleanly yet rows remain: it joined one that began
    // before the newest edit. One more cycle picks those up.
    result = await flushOnce();
    left = await countRemaining(db);
  }

  return left.changes + left.uploads > 0
    ? new UnsyncedChangesError(left.changes, left.uploads, result?.failure ?? null)
    : null;
}

/**
 * FR-004 — end the session on this device. `POST /auth/logout` revokes the
 * presented refresh token; if the device is offline the local session is still
 * ended (the server-side token simply ages out) and anything unexpected is
 * reported rather than swallowed. The traveller's local database is left in
 * place — see `db/client.ts` for why — but the offline city maps are not:
 * Mapbox keeps them device-wide rather than per account (`clearOfflineMaps`).
 * They go first, while the session still stands, so a sign-out cut short leaves
 * either the session or a recorded wipe behind — never an ended session over
 * another account's saved cities.
 */
async function endSession(): Promise<void> {
  const session = await getSession();
  if (session) {
    try {
      await apiFetch(z.unknown(), '/auth/logout', {
        method: 'POST',
        body: { refresh_token: session.refreshToken },
      });
    } catch (error) {
      if (!isExpectedSignOutFailure(error)) report(error);
    }
  }
  await clearOfflineMaps();
  await clearSession();
  useSessionStore.getState().signOut();
}

/**
 * `mutate()` signs out, pushing first; it rejects with `UnsyncedChangesError`
 * when something would be left behind unsynced. `mutate({ force: true })` is
 * the traveller's informed "Sign out anyway"; `reset()` is "Stay signed in".
 */
export function useSignOut() {
  const { db } = useLocalStore();

  return useMutation<void, Error, SignOutRequest | void>({
    mutationFn: async (request) => {
      if (db && !request?.force) {
        const unsynced = await settleBeforeSignOut(db);
        if (unsynced) throw unsynced;
      }
      await endSession();
    },
  });
}
