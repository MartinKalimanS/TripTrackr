/**
 * The line through every place the traveller has been — feature 003, FR-006
 * to FR-009; research D-30.
 *
 * A trip already draws its own consecutive legs (`placedLegs`). The journey
 * adds only what no trip draws: the legs between consecutive VISITED places
 * that belong to different trips, in the order the traveller was there, so the
 * whole history reads as one line. A place is visited when its stop arrives
 * today or earlier (FR-007); planned stops keep their dashed trip connection
 * and are not part of it.
 *
 * Unplaced stops stay in the ordering and only break it: A → ? → C is not a
 * journey from A to C, so no leg is drawn across a visited stop this device
 * cannot place (Constitution IV). Nothing here is stored (001 FR-016).
 */
import { todayIso } from '@/features/trips/stop-dates';

import {
  isPlaced,
  placedLegs,
  type GlobeStop,
  type GlobeTrip,
  type PlacedStop,
} from './globe-data';

export type VisitedPlace = PlacedStop & { tripId: string };

export interface JourneyLeg {
  from: VisitedPlace;
  to: VisitedPlace;
}

interface Visit {
  stop: GlobeStop;
  tripId: string;
  /** Index within the trip, the last tie-break so the order is stable. */
  position: number;
}

function inOrder(a: Visit, b: Visit): number {
  return (
    a.stop.arriveDate.localeCompare(b.stop.arriveDate) ||
    a.stop.departDate.localeCompare(b.stop.departDate) ||
    a.tripId.localeCompare(b.tripId) ||
    a.position - b.position
  );
}

function visitsUpTo(trips: readonly GlobeTrip[], today: string): Visit[] {
  return trips
    .flatMap((trip) =>
      trip.stops.map((stop, position) => ({ stop, tripId: trip.id, position })),
    )
    .filter(({ stop }) => stop.arriveDate <= today)
    .sort(inOrder);
}

/** The pairs a trip draws itself, so the journey never draws one twice. */
function tripLegKeys(trips: readonly GlobeTrip[]): Set<string> {
  return new Set(
    trips.flatMap((trip) =>
      placedLegs(trip).map(({ from, to }) => `${from.id}>${to.id}`),
    ),
  );
}

function placeOf({ stop, tripId }: Visit): VisitedPlace | null {
  return isPlaced(stop) ? { ...stop, tripId } : null;
}

export function journeyLegs(
  trips: readonly GlobeTrip[],
  today: string = todayIso(),
): JourneyLeg[] {
  const ordered = visitsUpTo(trips, today);
  const drawnByTrips = tripLegKeys(trips);
  const legs: JourneyLeg[] = [];

  for (let i = 1; i < ordered.length; i += 1) {
    const from = placeOf(ordered[i - 1]!);
    const to = placeOf(ordered[i]!);
    if (!from || !to) continue;
    if (from.cityId === to.cityId || drawnByTrips.has(`${from.id}>${to.id}`)) continue;
    legs.push({ from, to });
  }
  return legs;
}
