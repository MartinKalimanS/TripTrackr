/**
 * The words and figures of the Home sheet (feature 005, T535; FR-014, FR-060, FR-077): the
 * date line over the globe, plurals, "in N days", the month a trip starts and the notation of
 * a big figure.
 *
 * Everything follows the device's language (`languageTag`, from `deviceLocale()`): dates and
 * numbers come from `Intl`, and a tag the platform rejects falls back to the platform's own
 * locale, so a bad tag costs the wording and never the screen. Plurals use `Intl.PluralRules`
 * where the engine has it; Hermes (the app's engine) does not implement it, so there "one" is
 * a count of exactly 1, which is right for the English nouns the sheet passes in. Dates are calendar days (`YYYY-MM-DD`, local; `stop-dates.ts`), never instants, so
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

/**
 * Whether `count` takes the singular noun. `Intl.PluralRules` is absent from Hermes (a
 * constructor call on it throws "undefined cannot be used as a constructor"), so it is used only
 * when it exists and works; otherwise, and for a tag it rejects, one is exactly 1.
 */
function takesSingular(count: number, languageTag: string): boolean {
  if (typeof Intl.PluralRules !== 'function') return count === 1;
  try {
    return new Intl.PluralRules(languageTag).select(count) === 'one';
  } catch {
    return count === 1;
  }
}

/** A number grouped by the language and its noun in the singular or the plural form, apart. */
export function countParts(
  count: number,
  singular: string,
  plural: string,
  languageTag: string,
): { figure: string; noun: string } {
  let figure: string;
  try {
    figure = new Intl.NumberFormat(languageTag).format(count);
  } catch {
    figure = new Intl.NumberFormat().format(count);
  }
  return { figure, noun: takesSingular(count, languageTag) ? singular : plural };
}

/** "3 trips", "1 trip": a number grouped by the language, with its noun. */
export function countOf(
  count: number,
  singular: string,
  plural: string,
  languageTag: string,
): string {
  const { figure, noun } = countParts(count, singular, plural, languageTag);
  return `${figure} ${noun}`;
}

/** "2021": the year of a calendar day, in the device language. */
export function yearOf(iso: string, languageTag: string): string {
  return dateFormatter(languageTag, { year: 'numeric' }).format(fromIsoDate(iso));
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
