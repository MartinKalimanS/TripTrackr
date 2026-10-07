/**
 * A trip's date range in words — tasks.md T430 (FR-011; data-model §5; research D-25).
 *
 * `TripDateRange` is two calendar days (`YYYY-MM-DD`, `trip-status.ts`), formatted by
 * `Intl` in the device locale: "12 Mar – 20 Mar 2026" when both ends are in one year (the
 * year is said once, at the end), "28 Dec 2025 – 3 Jan 2026" when they are not, "12 May
 * 2026" for a single day. The order of day, month and year, the month's spelling and the
 * separators inside a date are the locale's; only the en dash between the ends is ours.
 *
 * The day shown is the day stored, in whatever zone the phone is in (research D-25: a
 * traveller who picked 12 May at 23:30 in Rome means 12 May). A calendar day has no zone,
 * so none is involved: the year, month and day are read out of the string and set on a
 * `Date` at 12:00 UTC, and the formatter is told to read it in UTC, so what it prints is
 * those three numbers and nothing the clock can move. That is NOT the UTC-conversion
 * mistake the rule warns of (`new Date('2026-01-01')`, which is an instant: the evening
 * of 31 Dec west of Greenwich, or `toISOString()` of a local date, which is the day before
 * east of it); both ends of this go through the same UTC, so nothing is converted.
 * `test/features/trip-date-range.*.test.ts` run it in Auckland and Los Angeles and prove,
 * with controls, that both mistakes would show.
 *
 * It also makes the formatters safe to keep. An `Intl.DateTimeFormat` fixes its zone when
 * it is made, so one that formatted LOCAL dates would show the wrong day after the phone
 * changed zone (a traveller landing somewhere new with the app open); these are in UTC
 * whatever the phone does, so one per (language, with or without the year) is built once
 * and kept.
 *
 * It never throws. What it cannot read, or what is backwards (an end before its start:
 * stops are validated not to be, so it is damaged data), is `null`, and the caller shows
 * no date rather than a wrong or a missing one.
 */
import { deviceLocale } from '@/lib/locale';

import { isIsoDate } from './stop-dates';
import type { TripDateRange } from './trip-status';

const DAY = { day: 'numeric', month: 'short', timeZone: 'UTC' } as const;
const DAY_AND_YEAR = { ...DAY, year: 'numeric' } as const;

const formatters = new Map<string, Intl.DateTimeFormat>();

/**
 * The formatter for a language, with the year or without. One per pair, made on first
 * use. A language tag the platform rejects (`RangeError`) formats in the platform's own
 * locale instead, so a bad tag costs the wording, not the screen.
 */
export function dayFormatter(
  languageTag: string,
  withYear: boolean,
): Intl.DateTimeFormat {
  const key = `${languageTag}|${withYear ? 'year' : 'day'}`;
  const known = formatters.get(key);
  if (known) return known;

  const options = withYear ? DAY_AND_YEAR : DAY;
  let made: Intl.DateTimeFormat;
  try {
    made = new Intl.DateTimeFormat(languageTag, options);
  } catch {
    made = new Intl.DateTimeFormat(undefined, options);
  }
  formatters.set(key, made);
  return made;
}

type Day = { year: number; month: number; day: number };

/** The numbers of a `YYYY-MM-DD` that is a day on the calendar, or `null`. */
function dayOf(iso: unknown): Day | null {
  if (typeof iso !== 'string' || !isIsoDate(iso)) return null;
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

/** That day at noon UTC. `setUTCFullYear` because `Date.UTC` maps years 0 to 99 to 19xx. */
function noonUtc({ year, month, day }: Day): Date {
  const date = new Date(Date.UTC(2000, 0, 1, 12));
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

export function formatDateRange(
  range: TripDateRange,
  languageTag: string = deviceLocale().languageTag,
): string | null {
  const start = dayOf(range?.start);
  const end = dayOf(range?.end);
  if (start === null || end === null || range.start > range.end) return null;

  const last = dayFormatter(languageTag, true).format(noonUtc(end));
  if (range.start === range.end) return last;

  const first = dayFormatter(languageTag, start.year !== end.year).format(noonUtc(start));
  return `${first} – ${last}`;
}
