/**
 * A trip's date range in words — tasks.md T430 (FR-011; data-model §5; research D-25).
 *
 * `TripDateRange` is two local calendar days (`YYYY-MM-DD`, `trip-status.ts`). They are
 * read with `fromIsoDate`, which is local midnight, and formatted by `Intl` in the
 * device locale, so the day a traveller picked is the day shown, never a UTC neighbour.
 *
 * "12 Mar – 20 Mar 2026" when both ends are in one year (the year is said once, at the
 * end), "28 Dec 2025 – 3 Jan 2026" when they are not, "12 May 2026" for a single day.
 * The order of day, month and year, the month's spelling and the separators inside a
 * date are the locale's; only the en dash between the two ends is ours.
 */
import { deviceLocale } from '@/lib/locale';

import { fromIsoDate } from './stop-dates';
import type { TripDateRange } from './trip-status';

const DAY = { day: 'numeric', month: 'short' } as const;
const DAY_AND_YEAR = { ...DAY, year: 'numeric' } as const;

export function formatDateRange(
  range: TripDateRange,
  languageTag: string = deviceLocale().languageTag,
): string {
  const start = fromIsoDate(range.start);
  const end = fromIsoDate(range.end);
  const full = new Intl.DateTimeFormat(languageTag, DAY_AND_YEAR);

  if (range.start === range.end) return full.format(end);

  const sameYear = start.getFullYear() === end.getFullYear();
  const first = new Intl.DateTimeFormat(languageTag, sameYear ? DAY : DAY_AND_YEAR);
  return `${first.format(start)} – ${full.format(end)}`;
}
