/**
 * Starts the first-run tour by itself, once per traveller on this device (feature 007, FR-006):
 * when the traveller's trips have been read and there are none, and the keychain has no "seen"
 * flag for them. A traveller who already has trips (an account signed in on a new phone) is
 * marked as having seen it and gets no tour. The decision is taken once per mount; a trip added
 * while the tour is open neither restarts nor ends it.
 */
import { useEffect, useRef } from 'react';

import { Sentry } from '@/lib/sentry';
import { hasSeenTour, markTourSeen } from '@/lib/secure-store';

import { autoStartDecision } from './auto-start';
import { useTourStore } from './tour-store';

export interface FirstRunTourInput {
  /** The signed-in traveller, or `null` before there is one. */
  userId: string | null;
  tripCount: number;
  /** The trips have been read from the local store (an empty list is an answer). */
  loaded: boolean;
}

export function useFirstRunTour({ userId, tripCount, loaded }: FirstRunTourInput): void {
  const decided = useRef(false);

  useEffect(() => {
    if (decided.current || userId === null || !loaded) return;
    decided.current = true;
    hasSeenTour(userId)
      .then((seen) => {
        const decision = autoStartDecision({ seen, tripCount });
        if (decision === 'start') useTourStore.getState().start();
        else if (decision === 'mark-seen') return markTourSeen(userId);
        return undefined;
      })
      .catch((error: unknown) => {
        // A keychain fault costs a tour, never a crash: nothing else depends on this.
        Sentry.captureException(error);
      });
  }, [userId, tripCount, loaded]);
}
