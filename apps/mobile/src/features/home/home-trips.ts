/**
 * Which trips the Home sheet shows (feature 005, T535; FR-014, FR-015; contract C5-23): the
 * live trip, else the next planned one, as the `NowCard`; the next planned trip beside a live
 * one as the `NextRow`. Derived on the device from the trips (with their covers and date
 * ranges, `useTrips`) and the stops with their cached place names, both read from the local
 * store: private, read-only, nothing stored or sent.
 *
 * - Of several live trips the one that began first leads (ties by id), as the Trips list's
 *   hero will; of several planned trips the one that starts soonest is next. A planned trip
 *   with no stops has no date and is never next; a past trip is never shown.
 * - With no live trip the next planned trip is the card and there is no row (the same trip is
 *   never drawn twice).
 * - "Day N of M" counts calendar days from the first arrival to today and to the last
 *   departure. The place is the city of the stop that covers today (the later of two on a
 *   travel day); a day between two stops names none, and a stop whose city is not cached
 *   names none: the app does not guess where the traveller is.
 * - The strip is one dot per stop: `done` before today, `now` on the current stop, `next` on
 *   the first stop still ahead, `later` after it. A long trip is windowed (`stripWindow`).
 */
import type { TripCover } from '@/features/trips/trip-cover';
import type { TripDateRange, TripStatus } from '@/features/trips/trip-status';
import type { TripSummary } from '@/features/trips/use-trips';

import { daysUntil } from './home-format';

/** A live stop with the names of its cached city and country (null if never cached). */
export interface NamedStop {
  id: string;
  trip_id: string;
  sort_order: number;
  arrive_date: string;
  depart_date: string;
  city_name: string | null;
  country_id: number | null;
  /** ISO 3166-1 alpha-2 of the city's country. */
  iso_code: string | null;
}

export type StripDot = 'done' | 'now' | 'next' | 'later';

export interface HomeTrip {
  id: string;
  title: string;
  status: Extract<TripStatus, 'active' | 'planning'>;
  cover: TripCover;
  /** Live trips only: "Day 3 of 8". */
  dayOf: { day: number; of: number } | null;
  /** Live trips only: the city of the current stop. */
  place: string | null;
  strip: StripDot[];
  /** The first arrival, YYYY-MM-DD. */
  startsOn: string | null;
  /** Planned trips only: calendar days until the first arrival. */
  daysToGo: number | null;
  /** The country of the first stop that has one: the flag and the generated cover's code. */
  iso2: string | null;
}

export interface HomeTrips {
  now: HomeTrip | null;
  next: HomeTrip | null;
}

type StopDates = Pick<NamedStop, 'arrive_date' | 'depart_date'>;

/** The index of the stop the traveller is at: the last one whose dates cover `today`. */
function currentIndex(stops: readonly StopDates[], today: string): number {
  for (let index = stops.length - 1; index >= 0; index -= 1) {
    const stop = stops[index]!;
    if (stop.arrive_date <= today && today <= stop.depart_date) return index;
  }
  return -1;
}

/** One dot per stop, in order. */
export function stopStrip(stops: readonly StopDates[], today: string): StripDot[] {
  const now = currentIndex(stops, today);
  const next = stops.findIndex((stop) => stop.arrive_date > today);
  return stops.map((stop, index) => {
    if (index === now) return 'now';
    if (stop.arrive_date <= today && today <= stop.depart_date) return 'done';
    if (stop.depart_date < today) return 'done';
    return index === next ? 'next' : 'later';
  });
}

/** The first `max` dots of a strip, or the `max` around the traveller; `hidden` are left out. */
export function stripWindow(
  strip: readonly StripDot[],
  max: number,
): { dots: StripDot[]; hidden: number } {
  if (strip.length <= max) return { dots: [...strip], hidden: 0 };
  const focus = Math.max(
    strip.indexOf('now') === -1 ? strip.indexOf('next') : strip.indexOf('now'),
    0,
  );
  const lead = Math.floor(max / 3);
  const start = Math.min(Math.max(focus - lead, 0), strip.length - max);
  return { dots: strip.slice(start, start + max), hidden: strip.length - max };
}

function byStart(a: TripSummary, b: TripSummary): number {
  return (
    (a.dateRange?.start ?? '').localeCompare(b.dateRange?.start ?? '') ||
    a.trip.id.localeCompare(b.trip.id)
  );
}

function groupStops(stops: readonly NamedStop[]): Map<string, NamedStop[]> {
  const byTrip = new Map<string, NamedStop[]>();
  for (const stop of stops) {
    byTrip.set(stop.trip_id, [...(byTrip.get(stop.trip_id) ?? []), stop]);
  }
  return byTrip;
}

function dayOf(range: TripDateRange | null, today: string): HomeTrip['dayOf'] {
  if (range === null) return null;
  return {
    day: daysUntil(range.start, today) + 1,
    of: daysUntil(range.start, range.end) + 1,
  };
}

function modelOf(
  summary: TripSummary,
  stops: readonly NamedStop[],
  today: string,
): HomeTrip {
  const { trip, status, cover, dateRange } = summary;
  const live = status === 'active';
  const current = live ? currentIndex(stops, today) : -1;
  return {
    id: trip.id,
    title: trip.title,
    status: live ? 'active' : 'planning',
    cover,
    dayOf: live ? dayOf(dateRange, today) : null,
    place: current === -1 ? null : (stops[current]?.city_name ?? null),
    strip: stopStrip(stops, today),
    startsOn: dateRange?.start ?? null,
    daysToGo: !live && dateRange !== null ? daysUntil(today, dateRange.start) : null,
    iso2: stops.find((stop) => stop.iso_code !== null)?.iso_code ?? null,
  };
}

export function homeTrips(
  summaries: readonly TripSummary[],
  stops: readonly NamedStop[],
  today: string,
): HomeTrips {
  const byTrip = groupStops(stops);
  const show = (summary: TripSummary) =>
    modelOf(summary, byTrip.get(summary.trip.id) ?? [], today);
  const live = summaries.filter((s) => s.status === 'active' && s.dateRange !== null);
  const planned = summaries.filter(
    (s) => s.status === 'planning' && s.dateRange !== null,
  );
  const [lead] = [...live].sort(byStart);
  const [soonest] = [...planned].sort(byStart);
  if (lead !== undefined) {
    return { now: show(lead), next: soonest === undefined ? null : show(soonest) };
  }
  return { now: soonest === undefined ? null : show(soonest), next: null };
}

/**
 * The cover picture of each trip that has a photograph, by trip id: the globe's pins draw these
 * as roundels when that is switched on (`GlobeLayers.pins.roundelsEnabled`). A typographic
 * cover is not a picture and is left out, so the pin stays a dot.
 */
export function coversOf(
  summaries: readonly Pick<TripSummary, 'trip' | 'cover'>[],
): Record<string, string> {
  const covers: Record<string, string> = {};
  for (const { trip, cover } of summaries) {
    if (cover.kind === 'photo') covers[trip.id] = cover.thumbnailUri;
  }
  return covers;
}
