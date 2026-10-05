import { and, eq, ne, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

import { rlsDb } from '@/common/db/rls-db';
import { liveOnly } from '@/common/db/soft-delete.scope';
import { requireCurrentUserId } from '@/common/rls/rls-context';
import { cities, countries, tripStops, trips } from '@/db/schema';
import { deriveTripStatus, todayIsoDate } from '@/modules/trips/trip-status.service';

import { RecordRefusal } from './push-errors';

/**
 * What every table's push handler asks of the database in the same way.
 *
 * Visibility posture: owner-only. Everything here is scoped to the caller's own
 * trips explicitly, in SQL, and does not lean on row-level security alone: the
 * SELECT policies of `trips`, `trip_stops`, `notes` and `photos` let a stranger
 * read a row once it is public, and a push must never treat a row that is
 * merely READABLE as a row that is the caller's (Constitution I).
 */

/**
 * `column IN (the caller's own trips)`. Used to find a child row through its
 * trip — the only ownership a child has (FR-085: no child carries an owner).
 */
export function inOwnTrips(tripIdColumn: PgColumn): SQL {
  return sql`${tripIdColumn} IN (
    SELECT t.id FROM trips t WHERE t.owner_id = ${requireCurrentUserId()}::uuid
  )`;
}

/** The facts about a parent trip a child's push needs. */
export interface ParentTrip {
  readonly homeCurrency: string;
}

/**
 * The caller's own trip, or a `parent_missing` refusal — one refusal for a trip
 * that does not exist, one that belongs to someone else, and (for a live child)
 * one that has been deleted. The three are indistinguishable on purpose.
 *
 * `live` is false for a record that is itself a tombstone: deleting a child
 * whose trip was deleted meanwhile is still a deletion the device is owed an
 * answer to, and needs only that the trip was once the caller's.
 */
export async function requireOwnTrip(
  tripId: string,
  options: { readonly live: boolean },
): Promise<ParentTrip> {
  const conditions = [eq(trips.id, tripId), eq(trips.ownerId, requireCurrentUserId())];
  const [row] = await rlsDb()
    .select({ homeCurrency: trips.homeCurrency })
    .from(trips)
    .where(options.live ? liveOnly(trips, ...conditions) : and(...conditions))
    .limit(1);

  if (!row) throw new RecordRefusal('parent_missing');

  return { homeCurrency: row.homeCurrency };
}

/** A city the catalogue knows, or an `invalid` refusal (never a foreign-key error). */
export async function requireKnownCity(cityId: number | null): Promise<void> {
  if (cityId === null) return;

  const rows = await rlsDb()
    .select({ id: cities.id })
    .from(cities)
    .where(eq(cities.id, cityId))
    .limit(1);

  if (rows.length === 0) throw new RecordRefusal('invalid');
}

/** A country the catalogue knows, or an `invalid` refusal. */
export async function requireKnownCountry(countryId: number | null): Promise<void> {
  if (countryId === null) return;

  const rows = await rlsDb()
    .select({ id: countries.id })
    .from(countries)
    .where(eq(countries.id, countryId))
    .limit(1);

  if (rows.length === 0) throw new RecordRefusal('invalid');
}

/**
 * Brings the cached `trips.status` in line with the stops the trip now has
 * (FR-013), the way the REST stop routes do — by the same `deriveTripStatus`.
 *
 * Unlike the REST routes it does NOT move `updated_at`. A cache refresh is not
 * an edit: moving the trip's timestamp to "now" would make the trip look newer
 * than the copy on the device that just pushed it, and that device's next
 * rename of the trip would be answered with a false conflict. The status is
 * derived on read anyway (trip-status.service.ts); the column is only the
 * globe query's shortcut.
 */
export async function refreshTripStatus(tripId: string): Promise<void> {
  const stops = await rlsDb()
    .select({ arrive_date: tripStops.arriveDate, depart_date: tripStops.departDate })
    .from(tripStops)
    .where(liveOnly(tripStops, eq(tripStops.tripId, tripId)));

  const status = deriveTripStatus(stops, todayIsoDate());

  await rlsDb()
    .update(trips)
    .set({ status })
    .where(
      and(
        eq(trips.id, tripId),
        eq(trips.ownerId, requireCurrentUserId()),
        ne(trips.status, status),
      ),
    );
}

/** Whether a stored instant and a wire instant name the same millisecond. */
export function sameInstant(stored: Date | null, wire: string | null): boolean {
  if (stored === null || wire === null) return stored === null && wire === null;

  return stored.getTime() === new Date(wire).getTime();
}
