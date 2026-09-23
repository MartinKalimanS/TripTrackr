/**
 * Trip stops — local-first repository (tasks.md T068; FR-010, FR-011, FR-012).
 *
 * Same rules as `trips.ts`: writes stamp `updated_at` and set `is_dirty`,
 * deletes are tombstones, reads filter tombstones out. Two extra invariants
 * live here because the server enforces them too and a local row that the
 * server would refuse is a row that can never sync:
 *
 *   - `depart_date >= arrive_date` (data-model.md §3 CHECK; FR-011) — checked
 *     with the SAME predicate the wire schema uses, `tripStopDatesInOrder`.
 *   - `sort_order` stays within `0..32767` (the wire's `z.int().max(32767)`).
 *
 * Ordering: a stop is appended after the current last one; "move up/down"
 * swaps it with its neighbour and renumbers the trip's live stops
 * contiguously from 0, writing only the rows whose position changed so the
 * fewest possible rows become dirty (each dirty row is a potential sync
 * conflict on another device).
 */
import { tripStopDatesInOrder } from '@triptrackr/contracts';
import { and, asc, eq, getTableColumns, isNull } from 'drizzle-orm';

import type { AppDatabase } from '@/db/client';
import { cities, countries, tripStops, type TripStopRow } from '@/db/schema';

import { nowIso } from './shared';

export interface AddStopInput {
  /** Client-generated UUID (D-15). */
  id: string;
  trip_id: string;
  city_id: number;
  arrive_date: string;
  depart_date: string;
}

export interface StopDates {
  arrive_date: string;
  depart_date: string;
}

export type MoveDirection = 'up' | 'down';

/** A stop with its place names from the geography cache — null if never cached. */
export type StopWithPlace = TripStopRow & {
  city_name: string | null;
  country_name: string | null;
  lat: number | null;
  lng: number | null;
};

export class StopDatesError extends Error {
  constructor() {
    super(tripStopDatesInOrder.params.message);
    this.name = 'StopDatesError';
  }
}

function assertDatesInOrder(dates: StopDates): void {
  if (!tripStopDatesInOrder.check(dates)) throw new StopDatesError();
}

/**
 * Pure: the contiguous `sort_order` a trip's live stops should have after
 * moving `stopId` one step. Input is the current visual order. Returns only
 * the entries whose `sort_order` differs from their current value, so the
 * caller writes (and dirties) nothing that did not move.
 */
export function reorderStops(
  ordered: readonly { id: string; sort_order: number }[],
  stopId: string,
  direction: MoveDirection,
): { id: string; sort_order: number }[] {
  const index = ordered.findIndex((stop) => stop.id === stopId);
  if (index === -1) return [];
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= ordered.length) return [];

  const next = [...ordered];
  [next[index], next[target]] = [next[target]!, next[index]!];

  return next
    .map((stop, position) => ({ id: stop.id, sort_order: position }))
    .filter((entry, position) => entry.sort_order !== next[position]!.sort_order);
}

/** Live stops of a trip, in order, with their cached place names. Live-queryable. */
function forTripQuery(db: AppDatabase, tripId: string) {
  return db
    .select({
      ...getTableColumns(tripStops),
      city_name: cities.name,
      country_name: countries.name,
      lat: cities.lat,
      lng: cities.lng,
    })
    .from(tripStops)
    .leftJoin(cities, eq(cities.id, tripStops.city_id))
    .leftJoin(countries, eq(countries.id, cities.country_id))
    .where(and(eq(tripStops.trip_id, tripId), isNull(tripStops.deleted_at)))
    .orderBy(asc(tripStops.sort_order));
}

/** Every live stop across all trips — the trip list derives counts and status from it. */
function allActiveQuery(db: AppDatabase) {
  return db
    .select()
    .from(tripStops)
    .where(isNull(tripStops.deleted_at))
    .orderBy(asc(tripStops.trip_id), asc(tripStops.sort_order));
}

function liveStopsOf(db: AppDatabase, tripId: string): TripStopRow[] {
  return db
    .select()
    .from(tripStops)
    .where(and(eq(tripStops.trip_id, tripId), isNull(tripStops.deleted_at)))
    .orderBy(asc(tripStops.sort_order))
    .all();
}

function add(db: AppDatabase, input: AddStopInput): TripStopRow {
  assertDatesInOrder(input);
  const now = nowIso();
  const existing = liveStopsOf(db, input.trip_id);
  const last = existing[existing.length - 1];
  const sortOrder = last ? last.sort_order + 1 : 0;
  if (sortOrder > 32767) throw new Error('A trip cannot hold more than 32768 stops.');

  const [row] = db
    .insert(tripStops)
    .values({
      id: input.id,
      trip_id: input.trip_id,
      city_id: input.city_id,
      sort_order: sortOrder,
      arrive_date: input.arrive_date,
      depart_date: input.depart_date,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      is_dirty: true,
      synced_at: null,
    })
    .returning()
    .all();
  if (!row) throw new Error('Stop insert returned no row.');
  return row;
}

function updateDates(db: AppDatabase, id: string, dates: StopDates): void {
  assertDatesInOrder(dates);
  db.update(tripStops)
    .set({ ...dates, updated_at: nowIso(), is_dirty: true })
    .where(and(eq(tripStops.id, id), isNull(tripStops.deleted_at)))
    .run();
}

/** Move a stop one position within its trip. A no-op at either end. */
function move(db: AppDatabase, id: string, direction: MoveDirection): void {
  const [stop] = db.select().from(tripStops).where(eq(tripStops.id, id)).all();
  if (!stop || stop.deleted_at !== null) return;

  const changes = reorderStops(liveStopsOf(db, stop.trip_id), id, direction);
  if (changes.length === 0) return;

  const now = nowIso();
  db.transaction((tx) => {
    for (const change of changes) {
      tx.update(tripStops)
        .set({ sort_order: change.sort_order, updated_at: now, is_dirty: true })
        .where(eq(tripStops.id, change.id))
        .run();
    }
  });
}

/** Tombstone. The row stays until the server has been told (FR-039). */
function remove(db: AppDatabase, id: string): void {
  const now = nowIso();
  db.update(tripStops)
    .set({ deleted_at: now, updated_at: now, is_dirty: true })
    .where(and(eq(tripStops.id, id), isNull(tripStops.deleted_at)))
    .run();
}

export const stopsRepository = {
  forTripQuery,
  allActiveQuery,
  add,
  updateDates,
  move,
  remove,
};
