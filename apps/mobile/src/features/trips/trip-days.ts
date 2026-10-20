/**
 * The day strip's model - tasks.md T544 (spec FR-040; data-model section 9 `TripDay`;
 * research D5-17): the calendar days a trip spans, each with the stops that are somewhere on
 * that day, and which one is today (the "Now" day).
 *
 * Pure over local calendar days (`YYYY-MM-DD`) and the day it is told today is: `date-fns` on
 * dates parsed as local midnight, one `addDays` per day (never 24-hour blocks, which repeat a
 * day when the clocks go back), and chips worded by `Intl` with the formatter pinned to UTC
 * over a date set at noon UTC, so no time zone can move a day (research D-25; the zone
 * suites beside the tests run this east and west of Greenwich). Private, local, never
 * transmitted, nothing stored: a derived view of the traveller's own stops.
 */
import { differenceInCalendarDays } from 'date-fns';

import { deviceLocale } from '@/lib/locale';

import { addDays, fromIsoDate, isIsoDate, todayIso } from './stop-dates';
import { tripDateRange } from './trip-status';

/** The two dates of a stop, with the id the day lists it by. */
export interface DayStop {
  id: string;
  arrive_date: string;
  depart_date: string;
}

export interface TripDay {
  /** 1 on the first day: the chip says "D1". */
  index: number;
  /** `YYYY-MM-DD`, a local calendar day. */
  date: string;
  /** This is the day it is today. */
  isToday: boolean;
  /** The stops that are somewhere on this day, arrival and departure days included. */
  stopIds: string[];
}

/** A strip longer than a year is damaged data, not a trip; the rest is left off. */
export const MAX_TRIP_DAYS = 366;

/** A stop with two real dates in order; anything else is left out rather than thrown on. */
function isDated(stop: DayStop): boolean {
  return (
    isIsoDate(stop.arrive_date) &&
    isIsoDate(stop.depart_date) &&
    stop.arrive_date <= stop.depart_date
  );
}

/**
 * Every calendar day from the earliest arrival to the latest departure (the stops are in
 * the caller's order, which is also the order within a day), or none for a trip with no
 * dated stop, which has no strip (FR-040, FR-042).
 */
export function tripDays(
  stops: readonly DayStop[],
  today: string = todayIso(),
): TripDay[] {
  const dated = stops.filter(isDated);
  const range = tripDateRange(dated);
  if (range === null) return [];

  const span = differenceInCalendarDays(fromIsoDate(range.end), fromIsoDate(range.start));
  return Array.from({ length: Math.min(MAX_TRIP_DAYS, span + 1) }, (_, offset) => {
    const date = addDays(range.start, offset);
    return {
      index: offset + 1,
      date,
      isToday: date === today,
      stopIds: dated
        .filter((stop) => stop.arrive_date <= date && date <= stop.depart_date)
        .map((stop) => stop.id),
    };
  });
}

/** The "Now" day: the one that is today, or `null` when today is not a day of the trip. */
export function currentDay(days: readonly TripDay[]): TripDay | null {
  return days.find((day) => day.isToday) ?? null;
}

/**
 * The stop to bring into view when a day is chosen: that day's first, else the first of the next
 * day that has one (the traveller is between two stops: show where they go next), else the last
 * before it. `null` for a day that is not on the strip.
 */
export function stopForDay(days: readonly TripDay[], index: number): string | null {
  const at = days.findIndex((day) => day.index === index);
  if (at < 0) return null;
  const following = days.slice(at).find((day) => day.stopIds.length > 0);
  if (following) return following.stopIds[0] ?? null;
  const before = days
    .slice(0, at)
    .reverse()
    .find((day) => day.stopIds.length > 0);
  return before?.stopIds[0] ?? null;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Day and month in a language, read in UTC. A tag `Intl` refuses is the platform's own. */
function dayMonthFormatter(
  languageTag: string,
  month: 'short' | 'long',
): Intl.DateTimeFormat {
  const key = `${languageTag}|${month}`;
  const known = formatters.get(key);
  if (known) return known;

  const options = { day: 'numeric', month, timeZone: 'UTC' } as const;
  let made: Intl.DateTimeFormat;
  try {
    made = new Intl.DateTimeFormat(languageTag, options);
  } catch {
    made = new Intl.DateTimeFormat(undefined, options);
  }
  formatters.set(key, made);
  return made;
}

/** That calendar day at noon UTC. `setUTCFullYear` because `Date.UTC` maps 0 to 99 to 19xx. */
function noonUtc(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(2000, 0, 1, 12));
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

export interface DayChipText {
  /** "D3". */
  code: string;
  /** "14 Oct": the locale's order and spelling. */
  date: string;
  /** "Day 3, 14 October": what a screen reader says. */
  name: string;
}

export function dayChipText(
  { index, date }: Pick<TripDay, 'index' | 'date'>,
  languageTag: string = deviceLocale().languageTag,
): DayChipText {
  const at = noonUtc(date);
  return {
    code: `D${index}`,
    date: dayMonthFormatter(languageTag, 'short').format(at),
    name: `Day ${index}, ${dayMonthFormatter(languageTag, 'long').format(at)}`,
  };
}
