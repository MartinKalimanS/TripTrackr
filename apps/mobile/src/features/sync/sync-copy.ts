/**
 * The words the sync runtime says — tasks.md T133, T136 (FR-040, FR-042).
 *
 * Offline is an ordinary state for this product, not an error (Constitution
 * II): the copy for it says what is true — the traveller's work is safe on
 * this device — and never reaches for the vocabulary of failure.
 */

/** Where the first-sync state says what it is doing, and what it needs from the traveller. */
export const FIRST_SYNC_COPY = {
  /**
   * The moment before the engine has said anything. It is the same wording as
   * the store gate (`RequireLocalStore`), so the two read as one state rather
   * than a flicker between different claims.
   */
  opening: 'Opening your trips',
  syncing: {
    title: 'Syncing your trips',
    // No percentage, count or estimate: the engine reports none, and a number
    // made up to look like progress is the one thing this screen must not do.
    detail:
      'Bringing your trips from your account onto this device. You don’t need to do anything — this screen clears by itself once they’ve arrived.',
  },
  offline: {
    title: 'You’re offline',
    detail:
      'Connect to the internet to load your trips. They’re safe in your account, and this screen clears as soon as they arrive.',
  },
  failed: {
    title: 'Your trips haven’t loaded yet',
    detail:
      'Something went wrong on our side, not with your account. Give it a moment, then try again.',
  },
  sessionEnded: {
    title: 'Please sign in again',
    detail: 'Your session ended before your trips could load. Sign in again to continue.',
  },
  retry: 'Try again',
  ready: 'Your trips are ready.',
} as const;

/** "1 change", "3 changes". */
export function describeChanges(count: number): string {
  return count === 1 ? '1 change' : `${count} changes`;
}

/**
 * The sync banner (feature 005, FR-065): offline is calm and has no action; a failed sync says
 * the data is safe on the phone and offers Retry. Without a count the line speaks of changes in
 * general.
 */
export const SYNC_BANNER_COPY = {
  offline: (count: number): string =>
    count > 0
      ? `Offline. ${describeChanges(count)} will sync when you're back online.`
      : "Offline. Changes will sync when you're back online.",
  failed: (count: number): string =>
    count > 0
      ? `Couldn't sync ${describeChanges(count)}. Your trips are safe on this phone.`
      : "Couldn't sync. Your trips are safe on this phone.",
  retry: 'Retry',
} as const;

export const CONFLICT_COPY = {
  /** Shown above the sentence, so a notice never reads as an unexplained change. */
  heading: 'Updated from another device',
  dismiss: 'Dismiss',
  dismissLabel: 'Dismiss this notice',
  dismissAll: 'Dismiss all',
  dismissAllLabel: 'Dismiss all notices',
  openTrip: 'View trip',
  openTripLabel: 'View the trip this change was made in',
} as const;

/** "and 1 more" / "and 4 more" — the tail of a stack that is capped. */
export function describeMoreNotices(count: number): string {
  return `and ${count} more`;
}
