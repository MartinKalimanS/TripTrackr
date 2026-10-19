/**
 * The trip card model - feature 005, T539 (FR-030, FR-031, FR-032, FR-034; data-model section 6;
 * research D5-17). What a hero, a ticket and a row draw, derived from the traveller's own local
 * rows and nothing else: the trip, its stops (with the cached city and country), the photographs
 * that could be its cover and the day. Private, local, never transmitted, nothing stored: a card
 * is a function of rows already on the device, recomputed whenever they change.
 *
 * `TripCardModel` extends the 004 `TripSummary`, so every field a screen already read is still
 * there under the same name and a consumer of `TripSummary` takes a card model unchanged. The
 * additions are flat and primitive (plus three small arrays and objects) so `useTrips` can keep
 * every unchanged card reference-equal.
 *
 * Every function here is pure: `today` (a local calendar day, `YYYY-MM-DD`) is always handed in,
 * and date arithmetic is `date-fns` on calendar days, never UTC (research D-25).
 */
import { differenceInCalendarDays } from 'date-fns';

import type { CoverCandidate } from '@/db/repositories/photos';
import type { StopWithCountry } from '@/db/repositories/stops';
import type { TripRow } from '@/db/schema';
import { placedLegs, toGlobeTrips } from '@/features/globe/globe-data';
import { haversineKm } from '@/features/globe/great-circle';
import { fnv1a32 } from '@/lib/fnv1a';

import { fromIsoDate, todayIso } from './stop-dates';
import { resolveTripCover } from './trip-cover';
import {
  deriveTripStatus,
  tripDateRange,
  type TripDateRange,
  type TripStatus,
} from './trip-status';
import type { TripSummary } from './use-trips';

/** One dot of a stop strip: past, here now, the one coming, or further on. */
export type StopDot = 'done' | 'now' | 'next' | 'later';

/** What a trip with no usable photograph is drawn from (data-model section 10). */
export interface GeneratedCoverSpec {
  palette: 0 | 1 | 2;
  iso2: string | null;
  /** The trip's title: the glyph falls back to its first letter with no country. */
  initial: string;
}

export interface TripCountry {
  iso2: string;
  name: string;
}

/** "Day 3 of 8". */
export interface TripDay {
  day: number;
  of: number;
}

export interface TripCardModel extends TripSummary {
  /** `trip.id`, flat as the data model names it. */
  id: string;
  /** `trip.title`. */
  title: string;
  /** Drawn wherever `cover` is not a photograph, or its thumbnail will not draw. */
  generated: GeneratedCoverSpec;
  /** The country of the first stop in a cached city. */
  country: TripCountry | null;
  /** `end - start + 1`, over the stops' range. */
  lengthDays: number | null;
  /** Active trips only. */
  dayOf: TripDay | null;
  /** Planning trips with dates only. */
  daysToGo: number | null;
  /** One dot per stop, in order. */
  strip: StopDot[];
  /** The abbreviation under each dot; empty for a city this device has not cached. */
  stripLabels: string[];
  /** The trip's legs, summed on the sphere as the globe does. */
  distanceKm: number;
  /** The trip or any of its stops has changes the server has not confirmed. */
  pending: boolean;
}

type StopDates = { arrive_date: string; depart_date: string };

function lastIndexWhere<T>(items: readonly T[], test: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (test(items[index] as T)) return index;
  }
  return -1;
}

/**
 * One dot per stop, in the order given. A stop is DONE once its departure day has passed,
 * NOW when today is inside it (on a day of transfer, the later stop), NEXT for the first stop
 * still to come and LATER for the rest. An earlier stop that overlaps the one that is now is
 * done: the traveller has moved on.
 */
export function stopStrip(stops: readonly StopDates[], today: string): StopDot[] {
  const nowIndex = lastIndexWhere(
    stops,
    (stop) => stop.arrive_date <= today && today <= stop.depart_date,
  );
  const nextIndex = stops.findIndex(
    (stop, index) => index > nowIndex && stop.depart_date >= today,
  );
  return stops.map((stop, index) => {
    if (stop.depart_date < today) return 'done';
    if (index === nowIndex) return 'now';
    if (index < nowIndex) return 'done';
    return index === nextIndex ? 'next' : 'later';
  });
}

/** Three characters of a city, accents folded and upper case: "Zürich" is "ZUR". */
function abbreviate(name: string | null): string {
  const folded = (name ?? '').trim().normalize('NFD').replace(/\p{M}/gu, '');
  return Array.from(folded).slice(0, 3).join('').toLocaleUpperCase();
}

/** The label under each dot of a stop strip. */
export function stopLabels(stops: readonly { city_name: string | null }[]): string[] {
  return stops.map((stop) => abbreviate(stop.city_name));
}

/** Both ends of the range counted: 12 to 19 October is 8 days. `null` for no range. */
export function lengthInDays(range: TripDateRange | null): number | null {
  if (range === null) return null;
  const days =
    differenceInCalendarDays(fromIsoDate(range.end), fromIsoDate(range.start)) + 1;
  return Number.isFinite(days) && days >= 1 ? days : null;
}

/** "Day 3 of 8": an active trip only. */
export function dayOfTrip(
  range: TripDateRange | null,
  status: TripStatus,
  today: string,
): TripDay | null {
  const length = lengthInDays(range);
  if (status !== 'active' || range === null || length === null) return null;
  const day = differenceInCalendarDays(fromIsoDate(today), fromIsoDate(range.start)) + 1;
  return Number.isFinite(day) ? { day, of: length } : null;
}

/** Calendar days until a planning trip starts. `null` for any other trip, or no dates. */
export function daysToGo(
  range: TripDateRange | null,
  status: TripStatus,
  today: string,
): number | null {
  if (status !== 'planning' || range === null) return null;
  const days = differenceInCalendarDays(fromIsoDate(range.start), fromIsoDate(today));
  return Number.isFinite(days) ? days : null;
}

/** The country of the first stop whose city is cached, else `null`. */
export function tripCountry(
  stops: readonly Pick<StopWithCountry, 'country_iso' | 'country_name'>[],
): TripCountry | null {
  const found = stops.find((stop) => (stop.country_iso ?? '') !== '');
  if (found === undefined || found.country_iso === null) return null;
  return { iso2: found.country_iso, name: found.country_name ?? found.country_iso };
}

/**
 * The kilometres of a trip: its legs between consecutive PLACED stops, summed on the sphere,
 * through the globe's own `placedLegs`, so the list and the globe's statistic can never
 * disagree (FR-082). A leg that touches a stop this device has not placed is left out.
 */
export function tripDistanceKm(stops: readonly StopWithCountry[]): number {
  const first = stops[0];
  if (first === undefined) return 0;
  const [trip] = toGlobeTrips([{ id: first.trip_id, title: '' }], stops);
  return placedLegs(trip!).reduce(
    (km, { from, to }) => km + haversineKm(from.coordinate, to.coordinate),
    0,
  );
}

/**
 * The generated cover of a trip: one of three palettes by the hash of its id (`fnv1a32`, as
 * `coverPalette` of `GeneratedCover` picks, so the same trip has the same cover on every launch
 * and device), the country's code when there is one, and the title to fall back on.
 */
export function generatedCover(
  tripId: string,
  title: string,
  country: TripCountry | null,
): GeneratedCoverSpec {
  return {
    palette: (fnv1a32(tripId) % 3) as GeneratedCoverSpec['palette'],
    iso2: country?.iso2 ?? null,
    initial: title,
  };
}

function groupByTrip<T extends { trip_id: string }>(
  rows: readonly T[],
): Map<string, T[]> {
  const byTrip = new Map<string, T[]>();
  for (const row of rows) {
    const list = byTrip.get(row.trip_id) ?? [];
    list.push(row);
    byTrip.set(row.trip_id, list);
  }
  return byTrip;
}

function cardOf(
  trip: TripRow,
  stops: readonly StopWithCountry[],
  candidates: readonly CoverCandidate[],
  today: string,
): TripCardModel {
  const status = deriveTripStatus(stops, today);
  const dateRange = tripDateRange(stops);
  const country = tripCountry(stops);
  return {
    trip,
    id: trip.id,
    title: trip.title,
    stopCount: stops.length,
    status,
    cover: resolveTripCover(trip, candidates, status),
    generated: generatedCover(trip.id, trip.title, country),
    dateRange,
    lengthDays: lengthInDays(dateRange),
    country,
    dayOf: dayOfTrip(dateRange, status, today),
    daysToGo: daysToGo(dateRange, status, today),
    strip: stopStrip(stops, today),
    stripLabels: stopLabels(stops),
    distanceKm: tripDistanceKm(stops),
    pending: trip.is_dirty || stops.some((stop) => stop.is_dirty),
  };
}

/**
 * One card model per trip, in the order given. Stops and cover candidates are grouped by trip
 * once; a group whose trip is not in the list (a removed trip's rows) is never read. `stops`
 * come from `stopsRepository.allActiveWithCountryQuery` and `candidates` from
 * `photosRepository.coverCandidatesQuery`, in their orders (a trip's stops by `sort_order`,
 * its candidates earliest first: `resolveTripCover` relies on it).
 */
export function buildTripCards(
  trips: readonly TripRow[],
  stops: readonly StopWithCountry[],
  candidates: readonly CoverCandidate[],
  today: string = todayIso(),
): TripCardModel[] {
  const stopsByTrip = groupByTrip(stops);
  const candidatesByTrip = groupByTrip(candidates);
  return trips.map((trip) =>
    cardOf(
      trip,
      stopsByTrip.get(trip.id) ?? [],
      candidatesByTrip.get(trip.id) ?? [],
      today,
    ),
  );
}
