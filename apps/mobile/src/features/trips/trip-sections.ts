/**
 * The trips list, composed - feature 005, T539 (FR-029, FR-030, FR-035; data-model section 6;
 * research D5-17). A pure function of the card models: no store, no network, no clock.
 *
 * `composeTripList(trips, filter)` yields, in this order:
 *
 *   1. the HERO: the active trip with the earliest arrival;
 *   2. the TICKET: the planning trip with the earliest start (a planning trip with no stops has
 *      no start and no countdown, so it is never the ticket);
 *   3. further active trips, as rows;
 *   4. year groups, each a `yearHeader` then its rows: first "none" (trips with no stops, the
 *      ones just created, newest created first), then the years of the start of each remaining
 *      trip, newest year first and, inside a year, the newest start first.
 *
 * A header counts the trips and kilometres UNDER it (what the traveller sees below it); the hero
 * and the ticket are not counted again under their year. The filter is applied BEFORE all of
 * this, so a filtered list is composed exactly as if it were the whole list: "Planned" has its
 * own ticket, a header's totals are of the filtered trips.
 *
 * A tie always keeps the order the trips were given in (`useTrips` hands them most recently
 * changed first), so the list never reorders itself for no reason.
 */
import type { TripCardModel } from './trip-card-model';
import type { TripStatus } from './trip-status';

export type TripFilter = 'all' | 'active' | 'planned' | 'past';

/** The year of a header, or `none` for trips with no stops ("No dates yet"). */
export type YearKey = number | 'none';

export type TripListItem =
  | { type: 'hero'; trip: TripCardModel }
  | { type: 'ticket'; trip: TripCardModel }
  | { type: 'row'; trip: TripCardModel }
  | { type: 'yearHeader'; year: YearKey; tripCount: number; distanceKm: number };

/** The status each filter keeps; `all` keeps every one. */
const STATUS_OF_FILTER: Record<Exclude<TripFilter, 'all'>, TripStatus> = {
  active: 'active',
  planned: 'planning',
  past: 'past',
};

function applyFilter(
  trips: readonly TripCardModel[],
  filter: TripFilter,
): readonly TripCardModel[] {
  if (filter === 'all') return trips;
  const status = STATUS_OF_FILTER[filter];
  return trips.filter((trip) => trip.status === status);
}

/** The first day of a trip, or `''` for one with no stops. */
const startOf = (trip: TripCardModel): string => trip.dateRange?.start ?? '';
const endOf = (trip: TripCardModel): string => trip.dateRange?.end ?? '';

/** The calendar year of a trip's first day. */
const yearOf = (trip: TripCardModel): number => Number(startOf(trip).slice(0, 4));

/** A sorted copy; a tie keeps the order the trips came in (the sort is not trusted for it). */
function sorted(
  trips: readonly TripCardModel[],
  compare: (a: TripCardModel, b: TripCardModel) => number,
): TripCardModel[] {
  const position = new Map(trips.map((trip, index) => [trip, index]));
  return [...trips].sort(
    (a, b) => compare(a, b) || (position.get(a) ?? 0) - (position.get(b) ?? 0),
  );
}

/** Text order is calendar order for `YYYY-MM-DD` and for UTC instants. */
const ascending = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const descending = (a: string, b: string) => ascending(b, a);

interface Group {
  year: YearKey;
  trips: TripCardModel[];
}

/** Trips with no stops first, then one group per year, newest year first. */
function groupByYear(trips: readonly TripCardModel[]): Group[] {
  const undated = sorted(
    trips.filter((trip) => trip.dateRange === null),
    (a, b) => descending(a.trip.created_at, b.trip.created_at),
  );
  const years = new Map<number, TripCardModel[]>();
  for (const trip of trips) {
    if (trip.dateRange === null) continue;
    years.set(yearOf(trip), [...(years.get(yearOf(trip)) ?? []), trip]);
  }
  const dated = [...years.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, group]) => ({
      year,
      trips: sorted(
        group,
        (a, b) => descending(startOf(a), startOf(b)) || descending(endOf(a), endOf(b)),
      ),
    }));
  return undated.length > 0
    ? [{ year: 'none' as const, trips: undated }, ...dated]
    : dated;
}

function headerOf({ year, trips }: Group): TripListItem {
  return {
    type: 'yearHeader',
    year,
    tripCount: trips.length,
    distanceKm: trips.reduce((km, trip) => km + trip.distanceKm, 0),
  };
}

export function composeTripList(
  trips: readonly TripCardModel[],
  filter: TripFilter,
): TripListItem[] {
  const shown = applyFilter(trips, filter);
  const [hero, ...moreActive] = sorted(
    shown.filter((trip) => trip.status === 'active'),
    (a, b) => ascending(startOf(a), startOf(b)),
  );
  const planning = sorted(
    shown.filter((trip) => trip.status === 'planning' && trip.dateRange !== null),
    (a, b) => ascending(startOf(a), startOf(b)),
  );
  const [ticket] = planning;

  // Everything that is neither the hero, the ticket nor a further active trip.
  const placed = new Set<TripCardModel>(
    [hero, ticket, ...moreActive].filter((trip) => trip !== undefined),
  );
  const rest = shown.filter((trip) => !placed.has(trip));
  const rows = (list: readonly TripCardModel[]): TripListItem[] =>
    list.map((trip) => ({ type: 'row', trip }));

  return [
    ...(hero ? [{ type: 'hero' as const, trip: hero }] : []),
    ...(ticket ? [{ type: 'ticket' as const, trip: ticket }] : []),
    ...rows(moreActive),
    ...groupByYear(rest).flatMap((group) => [headerOf(group), ...rows(group.trips)]),
  ];
}

/** The count behind each segment of the filter, over the whole list (FR-029). */
export function tripFilterCounts(
  trips: readonly TripCardModel[],
): Record<TripFilter, number> {
  const count = (status: TripStatus) =>
    trips.filter((trip) => trip.status === status).length;
  return {
    all: trips.length,
    active: count('active'),
    planned: count('planning'),
    past: count('past'),
  };
}

/** "214 trips · since 2009": how many, and the earliest year any of them starts. */
export function tripSpan(trips: readonly TripCardModel[]): {
  count: number;
  sinceYear: number | null;
} {
  const years = trips.filter((trip) => trip.dateRange !== null).map(yearOf);
  return {
    count: trips.length,
    sinceYear: years.length > 0 ? Math.min(...years) : null,
  };
}

/** The `FlashList` item type: a recycler reuses a cell only for the same shape (rule 5). */
export function tripItemType(item: TripListItem): TripListItem['type'] {
  return item.type;
}

/** A key unique across the list: the trip's id, or `year-<year>` for a header. */
export function tripItemKey(item: TripListItem): string {
  return item.type === 'yearHeader' ? `year-${item.year}` : item.trip.id;
}

/**
 * The year each item sits under, for a scrubber that follows the scroll: a header's own, then
 * the same for its rows. Before the first header (the hero, the ticket, further active trips)
 * there is none.
 */
export function yearOfItems(items: readonly TripListItem[]): (YearKey | null)[] {
  let current: YearKey | null = null;
  return items.map((item) => {
    if (item.type === 'yearHeader') current = item.year;
    return current;
  });
}

/** The numbered years of the headers, newest first ("none" is not a year to jump to). */
export function listedYears(items: readonly TripListItem[]): number[] {
  return items.flatMap((item) =>
    item.type === 'yearHeader' && item.year !== 'none' ? [item.year] : [],
  );
}

/** The index of a year's header, or -1. */
export function yearHeaderIndex(items: readonly TripListItem[], year: number): number {
  return items.findIndex((item) => item.type === 'yearHeader' && item.year === year);
}
