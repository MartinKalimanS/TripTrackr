/**
 * What the globe draws, derived on the device — research D-30.
 *
 * Input is exactly what the repositories return: live trips, and every live
 * stop joined to the `cities` cache in `(trip, sort_order, created_at, id)`
 * order, the server's pairing order. Output is one `GlobeTrip` per live trip,
 * its status derived from its stops (FR-013, the same rule as the trip list)
 * and each stop placed only if this device knows where its city is. A stop
 * whose city is not cached has no coordinate — the globe never guesses one
 * (Constitution IV).
 */
import { todayIso } from '@/features/trips/stop-dates';
import { deriveTripStatus, type TripStatus } from '@/features/trips/trip-status';

import type { LngLat } from './great-circle';

/** A live trip, as `tripsRepository.listQuery` returns it (only what the globe reads). */
export interface GlobeTripRow {
  id: string;
  title: string;
}

/** A live stop joined to its cached city — `stopsRepository.allWithPlaceQuery`. */
export interface GlobeStopRow {
  id: string;
  trip_id: string;
  city_id: number;
  arrive_date: string;
  depart_date: string;
  country_id: number | null;
  lat: number | null;
  lng: number | null;
}

export interface GlobeStop {
  id: string;
  cityId: number;
  countryId: number | null;
  arriveDate: string;
  departDate: string;
  /** Null until this device has cached the city. */
  coordinate: LngLat | null;
}

export type PlacedStop = GlobeStop & { coordinate: LngLat };

export interface GlobeTrip {
  id: string;
  title: string;
  status: TripStatus;
  /** Every live stop, in travel order — placed or not. */
  stops: GlobeStop[];
}

export interface PlacedLeg {
  from: PlacedStop;
  to: PlacedStop;
}

/**
 * The cache is written only from contract-validated lookups, but rows will
 * also arrive by sync (User Story 6): a coordinate that is not a real
 * position is treated as unknown rather than handed to the native map.
 */
function toCoordinate(lng: number | null, lat: number | null): LngLat | null {
  if (lng === null || lat === null || !Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }
  return Math.abs(lng) <= 180 && Math.abs(lat) <= 90 ? [lng, lat] : null;
}

function toGlobeStop(row: GlobeStopRow): GlobeStop {
  return {
    id: row.id,
    cityId: row.city_id,
    countryId: row.country_id,
    arriveDate: row.arrive_date,
    departDate: row.depart_date,
    coordinate: toCoordinate(row.lng, row.lat),
  };
}

export function isPlaced(stop: GlobeStop): stop is PlacedStop {
  return stop.coordinate !== null;
}

/** One `GlobeTrip` per live trip, in the order given; stops of unlisted trips are dropped. */
export function toGlobeTrips(
  trips: readonly GlobeTripRow[],
  stops: readonly GlobeStopRow[],
  today: string = todayIso(),
): GlobeTrip[] {
  const byTrip = new Map<string, GlobeStopRow[]>();
  for (const row of stops) {
    const list = byTrip.get(row.trip_id) ?? [];
    list.push(row);
    byTrip.set(row.trip_id, list);
  }
  return trips.map(({ id, title }) => {
    const rows = byTrip.get(id) ?? [];
    return {
      id,
      title,
      status: deriveTripStatus(rows, today),
      stops: rows.map(toGlobeStop),
    };
  });
}

export function hasPlacedStop(trip: GlobeTrip): boolean {
  return trip.stops.some(isPlaced);
}

/**
 * What floats over a globe with nothing to draw (feature 003 FR-002): invite
 * the first trip, or the first stop. With exactly one trip waiting for a stop
 * the invitation names it, so its action can open that trip; with several it
 * points at the list. `null` as soon as anything is placed.
 */
export type GlobeInvitation =
  { reason: 'no-trips' } | { reason: 'no-stops'; tripId?: string; tripTitle?: string };

export function globeInvitation(trips: readonly GlobeTrip[]): GlobeInvitation | null {
  if (trips.length === 0) return { reason: 'no-trips' };
  if (trips.some(hasPlacedStop)) return null;
  const [only] = trips;
  return trips.length === 1
    ? { reason: 'no-stops', tripId: only!.id, tripTitle: only!.title }
    : { reason: 'no-stops' };
}

/**
 * Consecutive pairs of stops, both placed. A leg touching an unplaced stop is
 * left out rather than bridged: A → ? → C is not a journey from A to C.
 */
export function placedLegs(trip: GlobeTrip): PlacedLeg[] {
  const legs: PlacedLeg[] = [];
  for (let i = 1; i < trip.stops.length; i += 1) {
    const from = trip.stops[i - 1]!;
    const to = trip.stops[i]!;
    if (isPlaced(from) && isPlaced(to)) legs.push({ from, to });
  }
  return legs;
}

/** The earliest arrival among a trip's stops — when it starts. */
function startDate(trip: GlobeTrip): string {
  return trip.stops.reduce(
    (earliest, stop) => (stop.arriveDate < earliest ? stop.arriveDate : earliest),
    trip.stops[0]!.arriveDate,
  );
}

/**
 * The trips that animate (FR-046; spec Edge Cases, "Globe"): every active trip
 * with something to draw; with none, the planned trip that starts soonest
 * (ties by id, so the choice is stable). Past trips never move.
 */
export function focusTripIds(trips: readonly GlobeTrip[]): string[] {
  const drawable = trips.filter(hasPlacedStop);
  const active = drawable.filter((trip) => trip.status === 'active');
  if (active.length > 0) return active.map((trip) => trip.id);

  const [next] = drawable
    .filter((trip) => trip.status === 'planning')
    .map((trip) => ({ id: trip.id, start: startDate(trip) }))
    .sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  return next ? [next.id] : [];
}

/**
 * Where an animated trip's marker rests when the traveller has asked for
 * reduced motion: the stop they are at today, else the trip's first placed
 * stop. On a travel day two stops cover today — the one being left and the one
 * being reached — and the later one wins: that is where the day ends.
 */
export function restingCoordinate(trip: GlobeTrip, today: string): LngLat | null {
  const placed = trip.stops.filter(isPlaced);
  const current = placed
    .filter((stop) => stop.arriveDate <= today && today <= stop.departDate)
    .at(-1);
  return (current ?? placed[0])?.coordinate ?? null;
}
