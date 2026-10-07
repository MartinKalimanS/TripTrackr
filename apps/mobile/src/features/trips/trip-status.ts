/**
 * Derived lifecycle status — FR-013 (data-model.md §3 requirement notes).
 *
 * Computed from the stop date range on every read, never stored and never
 * user-set: the spec's edge case is a trip whose dates pass while the app is
 * closed, and a computed value cannot be stale. The `trips.status` column in
 * the local mirror is the server's cache and is deliberately not consulted.
 *
 * The rule is the server's (apps/api trip-status.service, T061): before the
 * earliest arrival → planning; after the latest departure → past; else active.
 * Earliest/latest rather than first/last by `sort_order`, because overlapping
 * or oddly ordered stops are legitimate (spec edge cases) and the status must
 * still be right.
 */
import type { TripStatus } from '@triptrackr/contracts';

import { todayIso } from './stop-dates';

export type { TripStatus };

export interface StopDateRange {
  arrive_date: string;
  depart_date: string;
}

/** The span a trip covers, as local calendar days (`YYYY-MM-DD`). */
export interface TripDateRange {
  start: string;
  end: string;
}

/**
 * Earliest arrival to latest departure over `stops` (the caller passes the
 * active ones), or `null` with none — feature 004 data-model.md §5. Earliest
 * and latest rather than first and last by order, for the reason above.
 */
export function tripDateRange(stops: readonly StopDateRange[]): TripDateRange | null {
  if (stops.length === 0) return null;

  // IsoDate strings compare correctly as text — that is the point of the format.
  let start = stops[0]!.arrive_date;
  let end = stops[0]!.depart_date;
  for (const stop of stops) {
    if (stop.arrive_date < start) start = stop.arrive_date;
    if (stop.depart_date > end) end = stop.depart_date;
  }
  return { start, end };
}

export function deriveTripStatus(
  stops: readonly StopDateRange[],
  today: string = todayIso(),
): TripStatus {
  const range = tripDateRange(stops);
  if (!range) return 'planning';
  if (today < range.start) return 'planning';
  if (today > range.end) return 'past';
  return 'active';
}

/**
 * How each status is shown. Text AND icon, so the state is never conveyed by
 * hue alone (feature 002 FR-010); the pill component adds the colour.
 */
export const STATUS_PRESENTATION: Record<TripStatus, { label: string; icon: string }> = {
  planning: { label: 'Planning', icon: '◇' },
  active: { label: 'Active', icon: '▶' },
  past: { label: 'Past', icon: '✓' },
};
