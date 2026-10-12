/**
 * "Day N of M" of an active trip, and the dots that draw it - tasks.md T543 (spec FR-038;
 * data-model section 6 `dayOf`; research D5-17).
 *
 * Pure over two local calendar days (`YYYY-MM-DD`) and today: calendar arithmetic through
 * `date-fns` on dates parsed as local midnight, never an instant converted through UTC, so a
 * 25-hour day (the clock going back) is still one day (research D-25). A derived view of the
 * traveller's own stops: private, local, never transmitted, nothing stored.
 */
import { differenceInCalendarDays } from 'date-fns';

import { fromIsoDate, isIsoDate, todayIso } from './stop-dates';
import type { TripDateRange } from './trip-status';

export interface DayProgress {
  /** 1 on the first day of the trip. */
  day: number;
  /** How many calendar days the trip spans, both ends included. */
  of: number;
}

/**
 * The day of the trip that `today` is, or `null` outside it (a trip that has not started or
 * has ended), with no dates, or with dates that are not a range (damaged data).
 */
export function dayProgress(
  range: TripDateRange | null,
  today: string = todayIso(),
): DayProgress | null {
  if (range === null) return null;
  if (!isIsoDate(range.start) || !isIsoDate(range.end) || !isIsoDate(today)) return null;
  if (range.start > range.end) return null;
  if (today < range.start || today > range.end) return null;

  const start = fromIsoDate(range.start);
  return {
    day: differenceInCalendarDays(fromIsoDate(today), start) + 1,
    of: differenceInCalendarDays(fromIsoDate(range.end), start) + 1,
  };
}

export type ProgressDot = 'done' | 'now' | 'rest';

/** More dots than this stop being dots: a long trip is drawn with a proportional row. */
export const MAX_PROGRESS_DOTS = 14;

/**
 * One dot per day: filled for the days done, one ring for today, empty for the rest. A trip
 * longer than `MAX_PROGRESS_DOTS` days is drawn with that many, in proportion, so the first
 * day is still the first dot and the last day the last (the words carry the exact figure).
 */
export function progressDots({ day, of }: DayProgress): ProgressDot[] {
  if (!Number.isFinite(day) || !Number.isFinite(of) || of < 1) return [];

  const count = Math.min(of, MAX_PROGRESS_DOTS);
  const now =
    of <= MAX_PROGRESS_DOTS
      ? day - 1
      : Math.round(((day - 1) / Math.max(1, of - 1)) * (count - 1));
  return Array.from({ length: count }, (_, index): ProgressDot => {
    if (index < now) return 'done';
    return index === now ? 'now' : 'rest';
  });
}
