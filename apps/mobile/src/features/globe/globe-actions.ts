/**
 * The trips a traveller can step through on the globe without seeing or dragging it (feature
 * 005, T537; FR-017; contract C5-24, `useGlobeActions`): "next trip" and "previous trip" are
 * accessibility actions of the map. The order is chronological (the earliest placed stop of each
 * trip, ties by id), only a trip with a place on the map is in it, and stepping wraps round.
 *
 * Pure, and read-only over `GlobeTrip`: where a trip is on the globe is `restingCoordinate`, the
 * same stop the live callout and the pin use.
 */
import { isPlaced, restingCoordinate, type GlobeTrip } from './globe-data';
import type { LngLat } from './great-circle';

/** One trip as a place to fly to. */
export interface TripPlace {
  tripId: string;
  title: string;
  coordinate: LngLat;
}

/** The first arrival at a placed stop: when the trip begins on the map. */
function firstArrival(trip: GlobeTrip): string {
  return trip.stops.filter(isPlaced)[0]!.arriveDate;
}

/** The trips that have a place on the map, earliest first. */
export function placedTrips(trips: readonly GlobeTrip[], today: string): TripPlace[] {
  return trips
    .filter((trip) => trip.stops.some(isPlaced))
    .sort(
      (a, b) =>
        firstArrival(a).localeCompare(firstArrival(b)) || a.id.localeCompare(b.id),
    )
    .map((trip) => ({
      tripId: trip.id,
      title: trip.title,
      coordinate: restingCoordinate(trip, today)!,
    }));
}

/**
 * The trip after (`1`) or before (`-1`) `currentId`, wrapping at both ends. From no trip, or
 * one that is no longer on the map, next is the first and previous the last. `null` when no
 * trip is on the map.
 */
export function stepTrip(
  list: readonly TripPlace[],
  currentId: string | null,
  direction: 1 | -1,
): TripPlace | null {
  if (list.length === 0) return null;
  const index = list.findIndex((entry) => entry.tripId === currentId);
  if (index === -1) return direction === 1 ? list[0]! : list[list.length - 1]!;
  return list[(index + direction + list.length) % list.length]!;
}
