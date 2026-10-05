import { Injectable } from '@nestjs/common';
import {
  TripPushRecord,
  TripStopPushRecord,
  type PushWarning,
} from '@triptrackr/contracts';
import { and, eq, sql } from 'drizzle-orm';

import { rlsDb } from '@/common/db/rls-db';
import { requireCurrentUserId } from '@/common/rls/rls-context';
import { tripStops, trips } from '@/db/schema';
import { tombstoneTripChildren } from '@/modules/trips/trips.repository';

import { TripAllowancePolicy } from './push-allowance.policy';
import type { PushTableHandler, StoredRow, WriteTimes } from './push-handler';
import {
  inOwnTrips,
  refreshTripStatus,
  requireKnownCity,
  requireOwnTrip,
} from './push-scope';

/**
 * `trips` and `trip_stops` on the push path (tasks.md T128; FR-009..FR-013,
 * FR-039; research D-08, D-15, D-16).
 *
 * **Trips.** Every device-authored column of a trip may change by push
 * (`title`, `home_currency`, `is_public`, `cover_photo_id`); `status` is not one
 * of them, because the contracts' push shape has no such key and the strict
 * schema refuses it — it is derived from the stops (FR-013). The owner is the
 * session's, never the record's. A trip deleted by push takes its children with
 * it, through the same statement the REST delete uses
 * (`tombstoneTripChildren`).
 *
 * A changed `home_currency` leaves every recorded expense as it was: their
 * frozen rate and converted amount stay (data-model.md §6, FR-022).
 * `cover_photo_id` is accepted as sent, as the REST PATCH accepts it: photos are
 * pushed after trips, so the photo it names may not exist yet. The public trip
 * view (FR-055, User Story 7) must therefore join the photo to the trip before
 * it serves one.
 *
 * **Stops.** `trip_id` is fixed when a stop is created (REST has no move
 * either). `sort_order` is stored as the device sent it: the device owns the
 * order under last-write-wins like any other column, and renumbering siblings
 * here would move THEIR `updated_at` and answer a device's pending edit to them
 * with a false conflict. Duplicates and gaps are therefore possible after two
 * devices reorder concurrently; reads order by `(sort_order, created_at, id)`,
 * so the order is still deterministic, and the next REST stop write renumbers to
 * 0..n-1 as before. Departure not before arrival is the contracts' own refine.
 * After every stop change the trip's cached status is refreshed from its live
 * stops, without touching `updated_at` (push-scope.ts).
 *
 * Visibility posture: owner-only.
 */

// ---------------------------------------------------------------------------
// trips
// ---------------------------------------------------------------------------

type TripPush = TripPushRecord;

interface StoredTrip extends StoredRow {
  readonly title: string;
  readonly homeCurrency: string;
  readonly isPublic: boolean;
  readonly coverPhotoId: string | null;
}

@Injectable()
export class TripsPushHandler implements PushTableHandler<TripPush, StoredTrip> {
  readonly table = 'trips' as const;
  readonly schema = TripPushRecord;
  readonly creates = true;

  constructor(private readonly allowance: TripAllowancePolicy) {}

  async lock(id: string): Promise<StoredTrip | null> {
    const [row] = await rlsDb()
      .select({
        id: trips.id,
        updatedAt: trips.updatedAt,
        deletedAt: trips.deletedAt,
        title: trips.title,
        homeCurrency: trips.homeCurrency,
        isPublic: trips.isPublic,
        coverPhotoId: trips.coverPhotoId,
      })
      .from(trips)
      .where(and(eq(trips.id, id), eq(trips.ownerId, requireCurrentUserId())))
      .limit(1)
      .for('update');

    return row ?? null;
  }

  effective(_stored: StoredTrip, incoming: TripPush): TripPush {
    return incoming;
  }

  samePayload(stored: StoredTrip, incoming: TripPush): boolean {
    return (
      stored.title === incoming.title &&
      stored.homeCurrency === incoming.home_currency &&
      stored.isPublic === incoming.is_public &&
      stored.coverPhotoId === incoming.cover_photo_id
    );
  }

  checkReferences(): Promise<void> {
    return Promise.resolve();
  }

  async insert(incoming: TripPush, at: WriteTimes): Promise<boolean> {
    const rows = await rlsDb()
      .insert(trips)
      .values({
        id: incoming.id,
        ownerId: requireCurrentUserId(),
        title: incoming.title,
        homeCurrency: incoming.home_currency,
        isPublic: incoming.is_public,
        coverPhotoId: incoming.cover_photo_id,
        // Derived from the stops as they arrive, never from the device (FR-013).
        status: 'planning',
        // Strictly increasing within a batch, unlike `now()` (the transaction's
        // start), so "created before" has one answer for the allowance policy.
        createdAt: sql`clock_timestamp()`,
        updatedAt: at.updatedAt,
        deletedAt: incoming.deleted ? at.deletedAt : null,
      })
      .onConflictDoNothing()
      .returning({ id: trips.id });

    return rows.length > 0;
  }

  async update(stored: StoredTrip, incoming: TripPush, at: WriteTimes): Promise<void> {
    await rlsDb()
      .update(trips)
      .set({
        title: incoming.title,
        homeCurrency: incoming.home_currency,
        isPublic: incoming.is_public,
        coverPhotoId: incoming.cover_photo_id,
        updatedAt: at.updatedAt,
      })
      .where(and(eq(trips.id, stored.id), eq(trips.ownerId, requireCurrentUserId())));
  }

  async tombstone(stored: StoredTrip, at: WriteTimes): Promise<void> {
    await rlsDb()
      .update(trips)
      .set({ deletedAt: at.deletedAt, updatedAt: at.updatedAt })
      .where(and(eq(trips.id, stored.id), eq(trips.ownerId, requireCurrentUserId())));

    await tombstoneTripChildren(stored.id);
  }

  async warnings(
    id: string,
    _event: 'inserted' | 'unchanged',
  ): Promise<readonly PushWarning[]> {
    return (await this.allowance.isOverAllowance(id)) ? ['over_allowance'] : [];
  }
}

// ---------------------------------------------------------------------------
// trip_stops
// ---------------------------------------------------------------------------

type StopPush = TripStopPushRecord;

interface StoredStop extends StoredRow {
  readonly tripId: string;
  readonly cityId: number;
  readonly sortOrder: number;
  readonly arriveDate: string;
  readonly departDate: string;
}

@Injectable()
export class TripStopsPushHandler implements PushTableHandler<StopPush, StoredStop> {
  readonly table = 'trip_stops' as const;
  readonly schema = TripStopPushRecord;
  readonly creates = true;

  async lock(id: string): Promise<StoredStop | null> {
    const [row] = await rlsDb()
      .select({
        id: tripStops.id,
        updatedAt: tripStops.updatedAt,
        deletedAt: tripStops.deletedAt,
        tripId: tripStops.tripId,
        cityId: tripStops.cityId,
        sortOrder: tripStops.sortOrder,
        arriveDate: tripStops.arriveDate,
        departDate: tripStops.departDate,
      })
      .from(tripStops)
      .where(and(eq(tripStops.id, id), inOwnTrips(tripStops.tripId)))
      .limit(1)
      .for('update');

    return row ?? null;
  }

  effective(stored: StoredStop, incoming: StopPush): StopPush {
    return { ...incoming, trip_id: stored.tripId };
  }

  samePayload(stored: StoredStop, incoming: StopPush): boolean {
    return (
      stored.cityId === incoming.city_id &&
      stored.sortOrder === incoming.sort_order &&
      stored.arriveDate === incoming.arrive_date &&
      stored.departDate === incoming.depart_date
    );
  }

  async checkReferences(incoming: StopPush): Promise<void> {
    await requireOwnTrip(incoming.trip_id, { live: !incoming.deleted });
    await requireKnownCity(incoming.city_id);
  }

  async insert(incoming: StopPush, at: WriteTimes): Promise<boolean> {
    const rows = await rlsDb()
      .insert(tripStops)
      .values({
        id: incoming.id,
        tripId: incoming.trip_id,
        cityId: incoming.city_id,
        sortOrder: incoming.sort_order,
        arriveDate: incoming.arrive_date,
        departDate: incoming.depart_date,
        updatedAt: at.updatedAt,
        deletedAt: incoming.deleted ? at.deletedAt : null,
      })
      .onConflictDoNothing()
      .returning({ id: tripStops.id });

    if (rows.length === 0) return false;

    await refreshTripStatus(incoming.trip_id);

    return true;
  }

  async update(stored: StoredStop, incoming: StopPush, at: WriteTimes): Promise<void> {
    await rlsDb()
      .update(tripStops)
      .set({
        cityId: incoming.city_id,
        sortOrder: incoming.sort_order,
        arriveDate: incoming.arrive_date,
        departDate: incoming.depart_date,
        updatedAt: at.updatedAt,
      })
      .where(and(eq(tripStops.id, stored.id), inOwnTrips(tripStops.tripId)));

    await refreshTripStatus(stored.tripId);
  }

  async tombstone(stored: StoredStop, at: WriteTimes): Promise<void> {
    await rlsDb()
      .update(tripStops)
      .set({ deletedAt: at.deletedAt, updatedAt: at.updatedAt })
      .where(and(eq(tripStops.id, stored.id), inOwnTrips(tripStops.tripId)));

    await refreshTripStatus(stored.tripId);
  }
}
