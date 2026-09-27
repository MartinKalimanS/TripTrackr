import { Injectable } from '@nestjs/common';
import type { TripStatus } from '@triptrackr/contracts';
import { and, eq, ne, sql } from 'drizzle-orm';

import { rlsDb } from '@/common/db/rls-db';
import { trips } from '@/db/schema';

/** The two dates a status is derived from. `YYYY-MM-DD`, as the wire carries them. */
export interface StopDates {
  readonly arrive_date: string;
  readonly depart_date: string;
}

/**
 * The lifecycle state of a trip, from its dates alone (FR-013).
 *
 * Pure, and the only place the rule lives. The envelope is the earliest arrival
 * to the latest departure — min and max, not first and last by sort order,
 * because overlapping and out-of-order ranges are legitimate itineraries (spec
 * edge cases) and the trip is under way for as long as any stop is. Both
 * boundary days count as travelling: a traveller who lands today is on their
 * trip today.
 *
 * ISO dates compare correctly as strings, so no Date is constructed and no
 * time zone can creep in.
 */
export function deriveTripStatus(stops: readonly StopDates[], today: string): TripStatus {
  if (stops.length === 0) return 'planning';

  const firstArrival = stops.reduce(
    (earliest, stop) => (stop.arrive_date < earliest ? stop.arrive_date : earliest),
    stops[0]?.arrive_date ?? today,
  );
  const lastDeparture = stops.reduce(
    (latest, stop) => (stop.depart_date > latest ? stop.depart_date : latest),
    stops[0]?.depart_date ?? today,
  );

  if (today < firstArrival) return 'planning';
  if (today > lastDeparture) return 'past';

  return 'active';
}

/**
 * Today as a calendar date in UTC.
 *
 * Stop dates are calendar dates with no zone (contracts/scalars.ts), so
 * "today" has to be one too. UTC is the one choice every device and the server
 * agree on; the traveller's local midnight may run up to fourteen hours either
 * side of it, which at worst moves a status change by part of a day at the
 * boundary. A per-traveller zone would need one to be stored, which nothing
 * yet asks for.
 */
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Keeps the materialised `trips.status` column in step with the derived value.
 *
 * The column is a cache for the globe query (data-model.md §3): refreshed on
 * every stop write here, and by a nightly job later, while every read path
 * recomputes and does not trust it. Written only when it actually changes, so
 * `updated_at` — the sync cursor — moves only when a device has something new
 * to pull.
 */
@Injectable()
export class TripStatusService {
  async refreshStoredStatus(
    tripId: string,
    stops: readonly StopDates[],
  ): Promise<TripStatus> {
    const status = deriveTripStatus(stops, todayIsoDate());

    await rlsDb()
      .update(trips)
      .set({ status, updatedAt: sql`now()` })
      .where(and(eq(trips.id, tripId), ne(trips.status, status)));

    return status;
  }
}
