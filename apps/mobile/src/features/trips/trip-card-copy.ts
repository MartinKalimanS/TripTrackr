/**
 * The words of a trip card - feature 005, T540 (FR-030, FR-031, FR-032, FR-033, FR-035,
 * FR-075, FR-077). Pure over a card model: what the hero, the ticket, the row and the year
 * header SAY, and what a screen reader says for each. Numbers, dates and distances follow the
 * device's language and measurement system (`Intl`, `formatDistance`); only the plural of an
 * English noun is written here, as everywhere else in the app.
 *
 * The accessible name of a card is the one feature 004 gave it, word for word: "title, status,
 * N stops", which `describeStopCount` ends. Each card writes the template out where it sets
 * `accessibilityLabel`, so the id parity guard still reads it (`<param>, <param>, <param>`).
 * The rest is additive and visible only.
 */
import { deviceLocale, formatDistance } from '@/lib/locale';

import type { TripCardModel } from './trip-card-model';
import { formatDateRange, formatMonthYear } from './trip-date-range';
import { YEAR_SCRUBBER_MIN_TRIPS, type YearKey } from './trip-sections';

const SEPARATOR = ' · ';

const formatCount = (count: number): string =>
  new Intl.NumberFormat(deviceLocale().languageTag).format(count);

/** "1 stop", "2 stops": the noun in the plural for any count but one. */
const counted = (count: number, noun: string): string =>
  `${formatCount(count)} ${count === 1 ? noun : `${noun}s`}`;

/** "No stops yet", "1 stop", "N stops": the last words of a card's accessible name. */
export function describeStopCount(count: number): string {
  return count === 0 ? 'No stops yet' : counted(count, 'stop');
}

/** The country over a hero's title, then its stops: "Portugal · 3 stops". */
export function eyebrowOf(card: Pick<TripCardModel, 'country' | 'stopCount'>): string {
  const stops = describeStopCount(card.stopCount);
  return card.country ? `${card.country.name}${SEPARATOR}${stops}` : stops;
}

/** "7 nights": the length less one, for a trip of two days or more. */
function nightsOf(lengthDays: number | null): string | null {
  return lengthDays !== null && lengthDays > 1 ? counted(lengthDays - 1, 'night') : null;
}

/** The line under a hero's title: "12 Oct – 19 Oct 2026 · 7 nights". `null` with no range. */
export function heroDates(
  card: Pick<TripCardModel, 'dateRange' | 'lengthDays'>,
): string | null {
  const range = card.dateRange ? formatDateRange(card.dateRange) : null;
  if (range === null) return null;
  const nights = nightsOf(card.lengthDays);
  return nights === null ? range : `${range}${SEPARATOR}${nights}`;
}

/** The month a trip starts in, "Mar 2026", or `null` if the range cannot be read. */
function monthOf(card: Pick<TripCardModel, 'dateRange'>): string | null {
  return card.dateRange ? formatMonthYear(card.dateRange.start) : null;
}

const present = (parts: (string | null | undefined)[]): string[] =>
  parts.filter((part): part is string => part !== null && part !== undefined);

/** The line under a row's title: "Japan · Mar 2026 · 9 days" (FR-033). */
export function rowMeta(
  card: Pick<TripCardModel, 'country' | 'dateRange' | 'lengthDays' | 'stopCount'>,
): string {
  const length = card.lengthDays === null ? null : counted(card.lengthDays, 'day');
  const parts = present([card.country?.name, monthOf(card), length]);
  return parts.length > 0 ? parts.join(SEPARATOR) : describeStopCount(card.stopCount);
}

/** The line under a ticket's title: "Iceland · Jan 2027" (FR-032). */
export function ticketMeta(card: Pick<TripCardModel, 'country' | 'dateRange'>): string {
  return present([card.country?.name, monthOf(card)]).join(SEPARATOR);
}

export interface Countdown {
  /** The figure on the stub. */
  value: string;
  /** Under it: "day" or "days". */
  unit: string;
  /** What a screen reader says of the stub. */
  spoken: string;
}

/** The stub of a ticket: the days to departure (FR-032). */
export function countdownOf(daysToGo: number): Countdown {
  return {
    value: formatCount(daysToGo),
    unit: daysToGo === 1 ? 'day' : 'days',
    spoken:
      daysToGo === 1 ? 'Starts tomorrow' : `Starts in ${formatCount(daysToGo)} days`,
  };
}

export interface YearHeaderCopy {
  title: string;
  count: string;
  /** `null` when the trips under it have no distance to say. */
  distance: string | null;
  /** The distance spelled out for a screen reader ("9,380 kilometres"), or `null`. */
  spoken: string | null;
}

/** A year header: "2026", "1 trip", "9,380 km"; trips with no stops are "No dates yet". */
export function yearHeaderCopy(
  year: YearKey,
  tripCount: number,
  distanceKm: number,
): YearHeaderCopy {
  const title = year === 'none' ? 'No dates yet' : String(year);
  const count = counted(tripCount, 'trip');
  const distance = distanceKm > 0 ? formatDistance(distanceKm) : null;
  return {
    title,
    count,
    distance: distance?.text ?? null,
    spoken: distance?.spoken ?? null,
  };
}

/** Under the title: "22 trips", and from 200 of them "214 trips · since 2009" (FR-029, FR-035). */
export function tripsCountLine(span: {
  count: number;
  sinceYear: number | null;
}): string {
  const count = counted(span.count, 'trip');
  return span.count >= YEAR_SCRUBBER_MIN_TRIPS && span.sinceYear !== null
    ? `${count}${SEPARATOR}since ${span.sinceYear}`
    : count;
}
