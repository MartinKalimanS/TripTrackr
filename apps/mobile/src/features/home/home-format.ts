/**
 * The words and figures of the Home sheet (feature 005, T535; FR-014, FR-060, FR-077): the
 * date line over the globe, plurals, "in N days", the month a trip starts and the notation of
 * a big figure.
 *
 * Everything follows the device's language (`languageTag`, from `deviceLocale()`): dates and
 * numbers come from `Intl`, plurals from `Intl.PluralRules`, and a tag the platform rejects
 * falls back to the platform's own locale, so a bad tag costs the wording and never the
 * screen. Dates are calendar days (`YYYY-MM-DD`, local; `stop-dates.ts`), never instants, so
 * the day over the globe is the traveller's day wherever they are.
 */
import { differenceInCalendarDays } from 'date-fns';

import { fromIsoDate } from '@/features/trips/stop-dates';

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/** An `Intl.DateTimeFormat`, kept per language and options; a rejected tag uses the platform's. */
function dateFormatter(
  languageTag: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${languageTag}|${JSON.stringify(options)}`;
  const known = dateFormatters.get(key);
  if (known) return known;
  let made: Intl.DateTimeFormat;
  try {
    made = new Intl.DateTimeFormat(languageTag, options);
  } catch {
    made = new Intl.DateTimeFormat(undefined, options);
  }
  dateFormatters.set(key, made);
  return made;
}

/** "Wed 14 Oct": the weekday, the day and the month, in the device language. */
export function eyebrowDate(today: string, languageTag: string): string {
  return dateFormatter(languageTag, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(fromIsoDate(today));
}

/** "Jan 2027": the short month and the year a trip starts in. */
export function monthYear(iso: string, languageTag: string): string {
  return dateFormatter(languageTag, { month: 'short', year: 'numeric' }).format(
    fromIsoDate(iso),
  );
}

/** Whole calendar days from `from` to `to`; negative when `to` is earlier. */
export function daysUntil(from: string, to: string): number {
  return differenceInCalendarDays(fromIsoDate(to), fromIsoDate(from));
}

/** A number grouped by the language, with its noun in the singular or the plural form. */
export function countOf(
  count: number,
  singular: string,
  plural: string,
  languageTag: string,
): string {
  let one: boolean;
  let figure: string;
  try {
    one = new Intl.PluralRules(languageTag).select(count) === 'one';
    figure = new Intl.NumberFormat(languageTag).format(count);
  } catch {
    one = new Intl.PluralRules().select(count) === 'one';
    figure = new Intl.NumberFormat().format(count);
  }
  return `${figure} ${one ? singular : plural}`;
}

/** "in 94 days", "in 1 day". */
export function inDays(days: number, languageTag: string): string {
  return `in ${countOf(days, 'day', 'days', languageTag)}`;
}

/** Seven digits and more are shown compact ("1.26M") so a big figure never overflows. */
const COMPACT_FROM = 1_000_000;

/** The `Intl.NumberFormat` options for a figure that counts up: whole, or compact when huge. */
export function figureFormat(value: number): Intl.NumberFormatOptions {
  return value >= COMPACT_FROM
    ? { notation: 'compact', maximumFractionDigits: 2 }
    : { maximumFractionDigits: 0 };
}

/** "Jan 2027 · in 94 days": the month a planned trip starts and the countdown; empty with no date. */
export function plannedLine(
  startsOn: string | null,
  daysToGo: number | null,
  languageTag: string,
): string {
  if (startsOn === null) return '';
  const month = monthYear(startsOn, languageTag);
  return daysToGo === null ? month : `${month} \u00b7 ${inDays(daysToGo, languageTag)}`;
}
