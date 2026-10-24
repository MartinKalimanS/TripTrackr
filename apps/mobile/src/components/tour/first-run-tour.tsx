/**
 * `FirstRunTour` - the tour and what starts it, mounted once over the tabs (feature 007).
 *
 * It reads the traveller's trips from the local store (only to count them: nothing is shown or
 * sent), lets `useFirstRunTour` decide whether the tour starts by itself, and draws the overlay.
 * Whenever the tour closes it records that this traveller has seen it, so it never comes back
 * unasked; a replay from You (`profile-take-tour`) opens it again and closing it writes the same
 * flag again, which changes nothing.
 */
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { useDatabase } from '@/db/client';
import { tripsRepository } from '@/db/repositories/trips';
import { useSessionStore } from '@/features/auth/session-store';
import { useFirstRunTour } from '@/features/tour/use-first-run-tour';
import { Sentry } from '@/lib/sentry';
import { markTourSeen } from '@/lib/secure-store';

import { TourOverlay } from './tour-overlay';

export function FirstRunTour() {
  const userId = useSessionStore((session) => session.user?.id ?? null);
  const db = useDatabase();
  const trips = useLiveQuery(tripsRepository.listQuery(db));
  useFirstRunTour({
    userId,
    tripCount: trips.data.length,
    // A failed read never starts it: an unreadable list is not an empty one.
    loaded: trips.updatedAt !== undefined,
  });

  const onClosed = () => {
    if (userId === null) return;
    markTourSeen(userId).catch((error: unknown) => Sentry.captureException(error));
  };

  return <TourOverlay onClosed={onClosed} />;
}
