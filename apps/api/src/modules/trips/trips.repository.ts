import { Injectable } from '@nestjs/common';
import type { PatchTripRequest } from '@triptrackr/contracts';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { rlsDb } from '@/common/db/rls-db';
import { liveOnly } from '@/common/db/soft-delete.scope';
import { requireCurrentUserId, requireRlsTransaction } from '@/common/rls/rls-context';
import { cities, tripStops, trips } from '@/db/schema';

import type { OrderedStop } from './stop-order';

/**
 * Every child of a trip that carries a tombstone and is therefore
 * synchronised (sync-protocol.md §1; research D-16). Deleting a trip tombstones
 * all of them so a device that has not yet pulled learns each is gone rather
 * than finding orphans. Planner tables carry no tombstone and are not mirrored;
 * they go with the trip on hard deletion (ON DELETE CASCADE).
 */
const TOMBSTONED_CHILD_TABLES = [
  'trip_stops',
  'notes',
  'photos',
  'documents',
  'expenses',
] as const;

/**
 * The trip columns the owner view serialises. `status` is deliberately absent:
 * it is derived on read (trip-status.service.ts) and the stored value is a
 * cache that is refreshed, never trusted. `owner_id` and `deleted_at` are
 * absent because the contract has no slot for them (contracts/api/trips.ts).
 */
const TRIP_COLUMNS = {
  id: trips.id,
  title: trips.title,
  homeCurrency: trips.homeCurrency,
  isPublic: trips.isPublic,
  coverPhotoId: trips.coverPhotoId,
  createdAt: trips.createdAt,
  updatedAt: trips.updatedAt,
};

/**
 * Tombstones every live child of a trip that carries a tombstone (FR-039):
 * stops, notes, photos, documents, expenses. Each is a synchronised table and
 * each must be told, on the next pull, that it is gone.
 *
 * Shared by the REST delete ({@link TripsRepository.tombstoneTrip}) and by a
 * trip tombstone arriving through `POST /sync/push`, so that a trip deleted
 * offline takes its children with it exactly as one deleted online does.
 *
 * Dynamic identifiers through postgres.js's `sql(name)`, from a fixed list: one
 * statement shape for five tables, with the policies of each deciding which
 * rows the caller may touch. A generic Drizzle update over a union of table
 * types does not type-check cleanly, and this reads as what it is.
 */
export async function tombstoneTripChildren(tripId: string): Promise<void> {
  const tx = requireRlsTransaction();

  for (const table of TOMBSTONED_CHILD_TABLES) {
    await tx`
      UPDATE ${tx(table)}
      SET deleted_at = now(), updated_at = now()
      WHERE trip_id = ${tripId}::uuid AND deleted_at IS NULL
    `;
  }
}

export type TripRow = Pick<typeof trips.$inferSelect, keyof typeof TRIP_COLUMNS>;

/**
 * A stop with its city, so a list renders without a second request. The
 * geography column is never selected raw — its Drizzle type reads GeoJSON
 * (db/schema/_types.ts) and a raw select yields WKB — so the coordinates come
 * out of PostGIS as two numbers.
 */
const STOP_COLUMNS = {
  id: tripStops.id,
  tripId: tripStops.tripId,
  cityId: tripStops.cityId,
  sortOrder: tripStops.sortOrder,
  arriveDate: tripStops.arriveDate,
  departDate: tripStops.departDate,
  createdAt: tripStops.createdAt,
  updatedAt: tripStops.updatedAt,
  city: {
    id: cities.id,
    countryId: cities.countryId,
    name: cities.name,
    asciiName: cities.asciiName,
    lat: sql<number>`ST_Y(${cities.location}::geometry)`,
    lng: sql<number>`ST_X(${cities.location}::geometry)`,
    timezone: cities.timezone,
    population: cities.population,
  },
};

export interface StopRow {
  readonly id: string;
  readonly tripId: string;
  readonly cityId: number;
  readonly sortOrder: number;
  readonly arriveDate: string;
  readonly departDate: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly city: {
    readonly id: number;
    readonly countryId: number;
    readonly name: string;
    readonly asciiName: string;
    readonly lat: number;
    readonly lng: number;
    readonly timezone: string;
    readonly population: number | null;
  };
}

export interface NewTrip {
  readonly id?: string;
  readonly title: string;
  readonly homeCurrency: string;
}

export interface NewStop {
  readonly id?: string;
  readonly tripId: string;
  readonly cityId: number;
  readonly arriveDate: string;
  readonly departDate: string;
  readonly sortOrder: number;
}

/**
 * Every query against `trips` and `trip_stops`, on the request's RLS
 * transaction (rls-db.ts).
 *
 * Each read and write names the owner and the tombstone in its WHERE clause.
 * That is confirmation, not the guarantee: `trips_owner_all` and
 * `trip_stops_owner_all` (0005) decide what exists for this caller before any
 * of these predicates run, and a forgotten predicate here would return nothing
 * rather than someone else's row (Constitution I). The predicates are here so
 * that a public trip — readable by strangers under `trips_public_read` — is not
 * served through the *owner* view by these routes; the curated public view is
 * a different serialiser and arrives with the social story (FR-055).
 *
 * No statement here can raise on a caller's mistake: unknown cities are
 * checked first, and client-chosen ids use `ON CONFLICT DO NOTHING`. A failed
 * statement would poison the request transaction (see 0008's header).
 */
@Injectable()
export class TripsRepository {
  listOwnedTrips(): Promise<TripRow[]> {
    return rlsDb()
      .select(TRIP_COLUMNS)
      .from(trips)
      .where(liveOnly(trips, eq(trips.ownerId, requireCurrentUserId())))
      .orderBy(desc(trips.createdAt), asc(trips.id));
  }

  async findOwnedTrip(tripId: string): Promise<TripRow | null> {
    const [row] = await rlsDb()
      .select(TRIP_COLUMNS)
      .from(trips)
      .where(this.ownedLive(tripId))
      .limit(1);

    return row ?? null;
  }

  /** Null when the id is already taken — the caller decides what that means. */
  async insertTrip(trip: NewTrip): Promise<TripRow | null> {
    const [row] = await rlsDb()
      .insert(trips)
      .values({
        ...(trip.id !== undefined && { id: trip.id }),
        ownerId: requireCurrentUserId(),
        title: trip.title,
        homeCurrency: trip.homeCurrency,
        status: 'planning',
      })
      .onConflictDoNothing()
      .returning(TRIP_COLUMNS);

    return row ?? null;
  }

  async updateTrip(tripId: string, patch: PatchTripRequest): Promise<TripRow | null> {
    const [row] = await rlsDb()
      .update(trips)
      .set({
        ...(patch.title !== undefined && { title: patch.title }),
        ...(patch.is_public !== undefined && { isPublic: patch.is_public }),
        ...(patch.cover_photo_id !== undefined && { coverPhotoId: patch.cover_photo_id }),
        updatedAt: sql`now()`,
      })
      .where(this.ownedLive(tripId))
      .returning(TRIP_COLUMNS);

    return row ?? null;
  }

  /**
   * Tombstones the trip and every child that carries a tombstone (FR-039):
   * stops, notes, photos, documents, expenses. Each is a synchronised table
   * and each must be told, on the next pull, that it is gone. Returns false
   * when there was no live trip to delete.
   */
  async tombstoneTrip(tripId: string): Promise<boolean> {
    const db = rlsDb();
    const now = sql`now()`;

    const deleted = await db
      .update(trips)
      .set({ deletedAt: now, updatedAt: now })
      .where(this.ownedLive(tripId))
      .returning({ id: trips.id });

    if (deleted.length === 0) return false;

    await tombstoneTripChildren(tripId);

    return true;
  }

  /** Live stops for the given trips, in stop order, each with its city. */
  listStops(tripIds: readonly string[]): Promise<StopRow[]> {
    if (tripIds.length === 0) return Promise.resolve([]);

    return rlsDb()
      .select(STOP_COLUMNS)
      .from(tripStops)
      .innerJoin(cities, eq(cities.id, tripStops.cityId))
      .where(liveOnly(tripStops, inArray(tripStops.tripId, [...tripIds])))
      .orderBy(
        asc(tripStops.tripId),
        asc(tripStops.sortOrder),
        asc(tripStops.createdAt),
        asc(tripStops.id),
      );
  }

  async cityExists(cityId: number): Promise<boolean> {
    const rows = await rlsDb()
      .select({ id: cities.id })
      .from(cities)
      .where(eq(cities.id, cityId))
      .limit(1);

    return rows.length > 0;
  }

  /** The new stop's id, or null when a client-chosen id is already taken. */
  async insertStop(stop: NewStop): Promise<string | null> {
    const [row] = await rlsDb()
      .insert(tripStops)
      .values({
        ...(stop.id !== undefined && { id: stop.id }),
        tripId: stop.tripId,
        cityId: stop.cityId,
        arriveDate: stop.arriveDate,
        departDate: stop.departDate,
        sortOrder: stop.sortOrder,
      })
      .onConflictDoNothing()
      .returning({ id: tripStops.id });

    return row?.id ?? null;
  }

  async updateStopDates(
    stopId: string,
    dates: { arriveDate: string; departDate: string },
  ) {
    await rlsDb()
      .update(tripStops)
      .set({
        arriveDate: dates.arriveDate,
        departDate: dates.departDate,
        updatedAt: sql`now()`,
      })
      .where(and(eq(tripStops.id, stopId), isNull(tripStops.deletedAt)));
  }

  async tombstoneStop(stopId: string): Promise<void> {
    const now = sql`now()`;

    await rlsDb()
      .update(tripStops)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(tripStops.id, stopId), isNull(tripStops.deletedAt)));
  }

  /** Writes the positions stop-order.ts computed — only the rows that moved. */
  async renumberStops(changes: readonly OrderedStop[]): Promise<void> {
    for (const change of changes) {
      await rlsDb()
        .update(tripStops)
        .set({ sortOrder: change.sortOrder, updatedAt: sql`now()` })
        .where(eq(tripStops.id, change.id));
    }
  }

  private ownedLive(tripId: string) {
    return liveOnly(
      trips,
      eq(trips.id, tripId),
      eq(trips.ownerId, requireCurrentUserId()),
    );
  }
}
