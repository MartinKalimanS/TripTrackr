/**
 * The Countries list's data (feature 005, T536; FR-016, FR-017, FR-084; data-model section 5;
 * research D5-17; owner question Q-2): every country the traveller has a stop in, with its
 * continent, the number of trips, the first and last visit, whether the live trip is there
 * and where to fly the globe, derived on the device from the SAME local rows as the globe's
 * statistics (`GlobeTrip`, whose stops are joined to the `cities` cache) and the `countries`
 * cache. Nothing is stored, sent or added to the schema, and no other person's data is read:
 * the visibility posture is private, local, never transmitted.
 *
 * What counts is exactly what `travelSummary` counts (FR-082): a stop counts for a country
 * only if its city is cached (`isPlaced`) and the city names a country; planned trips count
 * like any other, so a country that is only planned is listed, marked `planned`, and the row
 * says so instead of claiming a visit that has not happened. `worldTotals` takes the countries
 * figure and the distance from `travelSummary` itself, so the numbers above the list and on
 * the Home sheet can never disagree. A country this device has no row for in the `countries`
 * cache (it has never been named here) still counts in the figure but cannot be listed: its
 * name, flag and continent are unknown and the app does not invent them.
 *
 * `continent` is one of the seven names the geography cache stores (GeoNames' continents, as
 * written by `apps/api/src/db/geo-catalogue.ts`); anything else is `'Unknown'`, which is shown
 * under its own header and is never counted as a continent. 195 and 7 are fixed reference
 * numbers (Q-2), not counts of the cache.
 *
 * `isNow` is the live trip's CURRENT stop: on an active trip, the last placed stop whose dates
 * cover today (on a travel day two do, and the later wins, as the globe's resting marker does:
 * `restingCoordinate`). A day between two stops names no country; the app does not guess where
 * the traveller is.
 */
import type { CountryRow } from '@/db/schema';
import { isPlaced, type GlobeTrip, type PlacedStop } from '@/features/globe/globe-data';
import type { LngLat } from '@/features/globe/great-circle';
import { travelSummary } from '@/features/globe/travel-stats';
import { todayIso } from '@/features/trips/stop-dates';

export const CONTINENTS = [
  'Africa',
  'Antarctica',
  'Asia',
  'Europe',
  'North America',
  'Oceania',
  'South America',
] as const;

export type Continent = (typeof CONTINENTS)[number];
export type ContinentName = Continent | 'Unknown';

/** The sovereign states: a fixed reference for "N of 195" (Q-2). */
export const WORLD_COUNTRIES = 195;
/** The continents: a fixed reference for "N of 7" (Q-2). */
export const WORLD_CONTINENTS = 7;

/** What this needs of a `countries` cache row. */
export type CountryInfo = Pick<CountryRow, 'id' | 'iso_code' | 'name' | 'continent'>;

export interface CountryFocus {
  /** Where to centre the globe: [lng, lat], longitude in [-180, 180]. */
  center: LngLat;
  /**
   * The south-west and north-east corners of the places visited there, or `null` when they
   * are all one place. Across the date line the east longitude runs past 180 (the short way
   * round), which Mapbox accepts.
   */
  bounds: [LngLat, LngLat] | null;
}

export interface CountrySummary {
  countryId: number;
  /** ISO 3166-1 alpha-2, upper case. */
  iso2: string;
  name: string;
  continent: ContinentName;
  /** Trips with at least one placed stop here. */
  tripCount: number;
  /** YYYY-MM-DD, the earliest arrival. */
  firstVisit: string;
  /**
   * YYYY-MM-DD, the last day spent there that has happened (a stop that is under way counts
   * up to today); a country with only trips still to come has no visit yet, so this is the
   * latest planned departure and the row says "planned" instead.
   */
  lastVisit: string;
  /** The active trip's current stop is here. */
  isNow: boolean;
  /** Every stop here is still ahead: planned, not yet visited. */
  planned: boolean;
  focus: CountryFocus;
}

export interface ContinentGroup {
  continent: ContinentName;
  countries: CountrySummary[];
}

export interface WorldTotals {
  /** `travelSummary`'s statistic: every country once, planned trips included. */
  countries: number;
  countriesOf: typeof WORLD_COUNTRIES;
  trips: number;
  /** `travelSummary`'s statistic, untouched. */
  distanceKm: number;
  /** Distinct, `Unknown` excluded. */
  continents: number;
  continentsOf: typeof WORLD_CONTINENTS;
}

interface Accumulated {
  tripIds: Set<string>;
  first: string;
  last: string;
  /** The latest day already spent there, or `null` while every stop is still ahead. */
  lastSpent: string | null;
  places: LngLat[];
  isNow: boolean;
}

/** The live trip's current stop: the last placed one whose dates cover today. */
function currentStop(trip: GlobeTrip, today: string): PlacedStop | null {
  if (trip.status !== 'active') return null;
  const covering = trip.stops
    .filter(isPlaced)
    .filter((stop) => stop.arriveDate <= today && today <= stop.departDate);
  return covering.at(-1) ?? null;
}

function accumulate(
  into: Map<number, Accumulated>,
  trips: readonly GlobeTrip[],
  today: string,
): void {
  for (const trip of trips) {
    const now = currentStop(trip, today);
    for (const stop of trip.stops) {
      if (!isPlaced(stop) || stop.countryId === null) continue;
      const entry = into.get(stop.countryId) ?? {
        tripIds: new Set<string>(),
        first: stop.arriveDate,
        last: stop.departDate,
        lastSpent: null,
        places: [],
        isNow: false,
      };
      entry.tripIds.add(trip.id);
      if (stop.arriveDate < entry.first) entry.first = stop.arriveDate;
      if (stop.departDate > entry.last) entry.last = stop.departDate;
      if (stop.arriveDate <= today) {
        const spent = stop.departDate < today ? stop.departDate : today;
        if (entry.lastSpent === null || spent > entry.lastSpent) entry.lastSpent = spent;
      }
      entry.places.push(stop.coordinate);
      if (now !== null && now.id === stop.id) entry.isNow = true;
      into.set(stop.countryId, entry);
    }
  }
}

/**
 * The west and east edges of a set of longitudes: the box that leaves out the widest gap
 * between neighbours, so places either side of the date line give the short way round (east
 * past 180) and not the whole planet.
 */
function longitudeSpan(longitudes: readonly number[]): { west: number; east: number } {
  const sorted = [...new Set(longitudes)].sort((a, b) => a - b);
  const first = sorted[0]!;
  const last = sorted.at(-1)!;
  let widest = first + 360 - last;
  let west = first;
  let east = last;
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = sorted[i]! - sorted[i - 1]!;
    if (gap > widest) {
      widest = gap;
      west = sorted[i]!;
      east = sorted[i - 1]! + 360;
    }
  }
  return { west, east };
}

function wrapLongitude(lng: number): number {
  return lng > 180 ? lng - 360 : lng;
}

/** Where to fly for the places visited in a country. */
export function focusOf(places: readonly LngLat[]): CountryFocus {
  const { west, east } = longitudeSpan(places.map(([lng]) => lng));
  const latitudes = places.map(([, lat]) => lat);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  const center: LngLat = [wrapLongitude((west + east) / 2), (south + north) / 2];
  const onePlace = west === east && south === north;
  return {
    center,
    bounds: onePlace
      ? null
      : [
          [west, south],
          [east, north],
        ],
  };
}

function continentOf(value: string): ContinentName {
  return (CONTINENTS as readonly string[]).includes(value)
    ? (value as Continent)
    : 'Unknown';
}

const nameOrder = new Intl.Collator();

/**
 * One summary per country with a stop, named from the `countries` cache, in name order. Pure.
 */
export function summariseCountries(
  trips: readonly GlobeTrip[],
  countries: readonly CountryInfo[],
  today: string = todayIso(),
): CountrySummary[] {
  const found = new Map<number, Accumulated>();
  accumulate(found, trips, today);
  const summaries: CountrySummary[] = [];
  for (const info of countries) {
    const entry = found.get(info.id);
    if (entry === undefined) continue;
    summaries.push({
      countryId: info.id,
      iso2: info.iso_code.toUpperCase(),
      name: info.name,
      continent: continentOf(info.continent),
      tripCount: entry.tripIds.size,
      firstVisit: entry.first,
      lastVisit: entry.lastSpent ?? entry.last,
      isNow: entry.isNow,
      planned: entry.first > today,
      focus: focusOf(entry.places),
    });
  }
  return summaries.sort((a, b) => nameOrder.compare(a.name, b.name));
}

/** Continents by name, `Unknown` after them; countries by name inside each. No empty group. */
export function groupByContinent(summaries: readonly CountrySummary[]): ContinentGroup[] {
  const groups = new Map<ContinentName, CountrySummary[]>();
  for (const summary of summaries) {
    groups.set(summary.continent, [...(groups.get(summary.continent) ?? []), summary]);
  }
  const rank = (continent: ContinentName) => (continent === 'Unknown' ? 1 : 0);
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || nameOrder.compare(a, b))
    .map(([continent, countries]) => ({
      continent,
      countries: [...countries].sort((a, b) => nameOrder.compare(a.name, b.name)),
    }));
}

/**
 * The countries of the newest stamps: those first visited most recently, newest first, ties by
 * name so the same ones are chosen every time. A country that is only planned has no stamp yet.
 */
export function recentVisits(
  summaries: readonly CountrySummary[],
  count: number,
): CountrySummary[] {
  return summaries
    .filter((summary) => !summary.planned)
    .sort(
      (a, b) =>
        b.firstVisit.localeCompare(a.firstVisit) || nameOrder.compare(a.name, b.name),
    )
    .slice(0, count);
}

/** How many of the seven continents have a listed country; `Unknown` is none of them. */
export function continentsVisited(summaries: readonly CountrySummary[]): number {
  return new Set(
    summaries.map((summary) => summary.continent).filter((c) => c !== 'Unknown'),
  ).size;
}

/** The figures above the list. The countries figure and the distance are `travelSummary`'s. */
export function worldTotals(
  trips: readonly GlobeTrip[],
  summaries: readonly CountrySummary[],
): WorldTotals {
  const { countriesVisited, distanceKm } = travelSummary(trips);
  return {
    countries: countriesVisited,
    countriesOf: WORLD_COUNTRIES,
    trips: trips.length,
    distanceKm,
    continents: continentsVisited(summaries),
    continentsOf: WORLD_CONTINENTS,
  };
}

/** "Zürich" and "zurich" are the same search: fold accents and case. */
function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** The countries whose name contains the query, ignoring case and accents. */
export function filterCountries(
  summaries: readonly CountrySummary[],
  query: string,
): readonly CountrySummary[] {
  const needle = fold(query.trim());
  if (needle === '') return summaries;
  return summaries.filter((summary) => fold(summary.name).includes(needle));
}
