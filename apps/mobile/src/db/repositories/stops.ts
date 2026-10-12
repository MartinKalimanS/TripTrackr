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
  country_id: number | null;
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

/**
 * Pure: the contiguous `sort_order` a trip's live stops should have once the
 * traveller has dragged them into `orderedIds` (T071b, research D-22). Ids
 * that are not live stops of the trip are ignored; live stops the caller did
 * not mention keep their relative order at the end, so a drop from a stale
 * list can never lose a stop. As with `reorderStops`, only the entries whose
 * `sort_order` differs from the current value are returned.
 */
export function reorderStopsTo(
  current: readonly { id: string; sort_order: number }[],
  orderedIds: readonly string[],
): { id: string; sort_order: number }[] {
  const known = new Map(current.map((stop) => [stop.id, stop.sort_order]));
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of orderedIds) {
    if (known.has(id) && !seen.has(id)) {
      next.push(id);
      seen.add(id);
    }
  }
  for (const stop of current) if (!seen.has(stop.id)) next.push(stop.id);

  return next
    .map((id, position) => ({ id, sort_order: position }))
    .filter((entry) => known.get(entry.id) !== entry.sort_order);
}

/** Live stops of a trip, in order, with their cached place names. Live-queryable. */
function forTripQuery(db: AppDatabase, tripId: string) {
  return db
    .select({
      ...getTableColumns(tripStops),
      city_name: cities.name,
      country_id: cities.country_id,
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

/**
 * Every live stop with its cached city's position and country — what the
 * globe draws (research D-30). Ordered as the server pairs stops into arcs
 * (arcs.service.ts: `sort_order, created_at, id`), so both sides draw the same
 * legs even when two stops share a position. Null place columns mean the city
 * is not cached on this device. Live-queryable.
 */
function allWithPlaceQuery(db: AppDatabase) {
  return db
    .select({
      id: tripStops.id,
      trip_id: tripStops.trip_id,
      city_id: tripStops.city_id,
      arrive_date: tripStops.arrive_date,
      depart_date: tripStops.depart_date,
      country_id: cities.country_id,
      lat: cities.lat,
      lng: cities.lng,
    })
    .from(tripStops)
    .leftJoin(cities, eq(cities.id, tripStops.city_id))
    .where(isNull(tripStops.deleted_at))
    .orderBy(
      asc(tripStops.trip_id),
      asc(tripStops.sort_order),
      asc(tripStops.created_at),
      asc(tripStops.id),
    );
}

/**
 * Every live stop with the name of its cached city and the code of that city's country, in
 * trip order then stop order: what the Home sheet names the live trip's place and flag from
 * (feature 005, T535). Null names mean the city is not cached on this device. It reads
 * `trip_stops` live; a change to the geography cache is the caller's to key on, as the
 * globe's query is (`use-globe.ts`).
 */
function allWithNamesQuery(db: AppDatabase) {
  return db
    .select({
      id: tripStops.id,
      trip_id: tripStops.trip_id,
      sort_order: tripStops.sort_order,
      arrive_date: tripStops.arrive_date,
      depart_date: tripStops.depart_date,
      city_name: cities.name,
      country_id: cities.country_id,
      iso_code: countries.iso_code,
    })
    .from(tripStops)
    .leftJoin(cities, eq(cities.id, tripStops.city_id))
    .leftJoin(countries, eq(countries.id, cities.country_id))
    .where(isNull(tripStops.deleted_at))
    .orderBy(
      asc(tripStops.trip_id),
      asc(tripStops.sort_order),
      asc(tripStops.created_at),
      asc(tripStops.id),
    );
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

function writeOrder(
  db: AppDatabase,
  changes: readonly { id: string; sort_order: number }[],
) {
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

/** Move a stop one position within its trip. A no-op at either end. */
function move(db: AppDatabase, id: string, direction: MoveDirection): void {
  const [stop] = db.select().from(tripStops).where(eq(tripStops.id, id)).all();
  if (!stop || stop.deleted_at !== null) return;

  writeOrder(db, reorderStops(liveStopsOf(db, stop.trip_id), id, direction));
}

/** Put a trip's stops in the order the traveller dragged them into (T071b). */
function reorder(db: AppDatabase, tripId: string, orderedIds: readonly string[]): void {
  writeOrder(db, reorderStopsTo(liveStopsOf(db, tripId), orderedIds));
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
  allWithPlaceQuery,
  allWithNamesQuery,
  add,
  updateDates,
  move,
  reorder,
  remove,
};
