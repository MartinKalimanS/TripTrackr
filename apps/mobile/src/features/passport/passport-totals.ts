/**
 * The passport card's figures (feature 005, T556; FR-058, FR-082, FR-084; data-model section 5;
 * research D5-17; owner question Q-2): All time or one year, derived on the device from the
 * same local rows as the globe's statistic. Nothing is stored or sent.
 *
 *   - a trip belongs to the year of its FIRST arrival (the earliest stop date); a trip with no
 *     stop belongs to no year and is only in All time;
 *   - the countries figure and the distance are `travelSummary` over the period's trips,
 *     untouched (every country once, planned trips included, legs within trips, a city this
 *     device has not cached counts for nothing), so the card and the Home sheet cannot
 *     disagree for All time;
 *   - continents are the distinct continents of the period's countries, `Unknown` never one;
 *   - 195 and 7 are fixed references, not counts of the cache (Q-2);
 *   - the lap is the real distance over the circumference of the sphere the distance was
 *     measured on (`EARTH_RADIUS_KM`), so 61,480 km is about 1.5 times round it.
 *
 * Pure. Visibility: private, local, never transmitted.
 */
import type { GlobeTrip } from '@/features/globe/globe-data';
import { EARTH_RADIUS_KM } from '@/features/globe/great-circle';
import { travelSummary } from '@/features/globe/travel-stats';

import {
  WORLD_CONTINENTS,
  WORLD_COUNTRIES,
  type CountrySummary,
} from './country-summary';
import type { PassportPeriodKey } from './stamp-spec';

/** One lap round the sphere the distances are measured on, in kilometres. */
export const LAP_KM = 2 * Math.PI * EARTH_RADIUS_KM;

export interface PassportTotals {
  period: PassportPeriodKey;
  countries: number;
  countriesOf: typeof WORLD_COUNTRIES;
  trips: number;
  distanceKm: number;
  continents: number;
  continentsOf: typeof WORLD_CONTINENTS;
  /** Laps round the Earth: 1.5 is a lap and a half. 0 when nothing was travelled. */
  laps: number;
}

/** The earliest day of any stop of the trip, or `null` for a trip with none. */
export function tripFirstArrival(trip: GlobeTrip): string | null {
  let first: string | null = null;
  for (const stop of trip.stops) {
    if (first === null || stop.arriveDate < first) first = stop.arriveDate;
  }
  return first;
}

const yearOf = (trip: GlobeTrip): string | null =>
  tripFirstArrival(trip)?.slice(0, 4) ?? null;

/** `all`, then each year with at least one trip, newest first. */
export function periodKeys(trips: readonly GlobeTrip[]): PassportPeriodKey[] {
  const years = new Set<string>();
  for (const trip of trips) {
    const year = yearOf(trip);
    if (year !== null) years.add(year);
  }
  return ['all', ...[...years].sort((a, b) => b.localeCompare(a))];
}

export function tripsInPeriod(
  trips: readonly GlobeTrip[],
  period: PassportPeriodKey,
): GlobeTrip[] {
  return period === 'all' ? [...trips] : trips.filter((trip) => yearOf(trip) === period);
}

/** Laps for a distance; 0 for anything that is not a positive distance. */
export function lapFraction(distanceKm: number): number {
  return Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm / LAP_KM : 0;
}

function continentsOf(
  trips: readonly GlobeTrip[],
  summaries: readonly CountrySummary[],
): number {
  const ids = new Set<number>();
  for (const trip of trips) {
    for (const stop of trip.stops) {
      if (stop.coordinate !== null && stop.countryId !== null) ids.add(stop.countryId);
    }
  }
  const found = new Set<string>();
  for (const summary of summaries) {
    if (ids.has(summary.countryId) && summary.continent !== 'Unknown') {
      found.add(summary.continent);
    }
  }
  return found.size;
}

export function passportTotals(
  trips: readonly GlobeTrip[],
  summaries: readonly CountrySummary[],
  period: PassportPeriodKey,
): PassportTotals {
  const inside = tripsInPeriod(trips, period);
  const { countriesVisited, distanceKm } = travelSummary(inside);
  return {
    period,
    countries: countriesVisited,
    countriesOf: WORLD_COUNTRIES,
    trips: inside.length,
    distanceKm,
    continents: continentsOf(inside, summaries),
    continentsOf: WORLD_CONTINENTS,
    laps: lapFraction(distanceKm),
  };
}
