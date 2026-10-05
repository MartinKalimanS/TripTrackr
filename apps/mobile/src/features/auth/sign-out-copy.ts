/**
 * The words the sign-out guard says — tasks.md T137 (Constitution V; FR-004).
 *
 * The consequence paragraph is written from `db/client.ts`, not from hope: the
 * database is one encrypted file PER ACCOUNT and signing out leaves it on the
 * device, so what the traveller typed is neither lost nor visible to anyone
 * who signs in here next. What it is NOT, until it syncs, is anywhere else —
 * and the copy says exactly that, without alarm and without a promise the
 * device cannot keep.
 */
import type { SyncFailure } from '@/sync/types';

/** "1 change" / "3 changes". */
export function countChanges(count: number): string {
  return count === 1 ? '1 change' : `${count} changes`;
}

export const SIGN_OUT_COPY = {
  title: 'Not everything is backed up yet',
  stayLabel: 'Stay signed in',
  anywayLabel: 'Sign out anyway',
  anywayHint:
    'Signs out now. The changes stay on this device and sync when you sign back in.',
  consequence:
    'If you sign out now, they stay on this device, encrypted and private to your account, and sync when you sign back in here. Until then they exist only on this device, so your other devices won’t show them.',
} as const;

/** The sentence that says how much is waiting: "2 changes on this device haven’t reached your account yet." */
export function unsyncedHeadline(remaining: number): string {
  return remaining === 1
    ? '1 change on this device hasn’t reached your account yet.'
    : `${remaining} changes on this device haven’t reached your account yet.`;
}

/** Why, as plainly as it can be said. Offline is an ordinary reason, not a fault. */
export function unsyncedReason(failure: SyncFailure | null): string {
  switch (failure) {
    case 'offline':
      return 'You’re offline right now, so they couldn’t be sent.';
    case 'server':
    case 'invalid_response':
      return 'We couldn’t reach the server just now, so they couldn’t be sent.';
    default:
      return 'They haven’t finished sending yet.';
  }
}
