/**
 * Trips and stops as live local queries — tasks.md T066/T068 (Constitution II).
 *
 * Screens read the encrypted local store through Drizzle's `useLiveQuery`
 * (https://orm.drizzle.team/docs/connect-expo-sqlite, "Live Queries"), which
 * re-runs a query whenever `expo-sqlite`'s change listener reports a write to
 * its table. Writes go through the repositories and therefore never touch the
 * network; the sync engine (US6) is a separate reconciler.
 *
 * `useLiveQuery` subscribes to the query's FROM table only. The trip list
 * needs both `trips` and `trip_stops` (for counts and the derived status), so
 * it runs one live query per table and joins in memory — a personal journal's
 * stop count is small, and this is what keeps every write instantly visible.
 */
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { useMemo, useState } from 'react';

import { useDatabase } from '@/db/client';
import { photosRepository, type CoverCandidate } from '@/db/repositories/photos';
import {
  stopsRepository,
  type AddStopInput,
  type MoveDirection,
  type StopDates,
  type StopWithPlace,
} from '@/db/repositories/stops';
import { tripsRepository, type CreateTripInput } from '@/db/repositories/trips';
import type { TripRow, TripStopRow } from '@/db/schema';

import { resolveTripCover, type TripCover } from './trip-cover';
import {
  deriveTripStatus,
  tripDateRange,
  type TripDateRange,
  type TripStatus,
} from './trip-status';

export interface TripSummary {
  trip: TripRow;
  stopCount: number;
  status: TripStatus;
  /** Designated or earliest photo's thumbnail, else a typographic mark (FR-012). */
  cover: TripCover;
  /** Earliest arrival to latest departure over the active stops; `null` with none (FR-011). */
  dateRange: TripDateRange | null;
}

export interface LiveResult<T> {
  data: T;
  /** Neither a result nor an error has arrived yet — distinct from "empty" and from "failed". */
  loading: boolean;
  error: Error | null;
}

function groupByTrip<T extends { trip_id: string }>(rows: readonly T[]) {
  const byTrip = new Map<string, T[]>();
  for (const row of rows) {
    const list = byTrip.get(row.trip_id) ?? [];
    list.push(row);
    byTrip.set(row.trip_id, list);
  }
  return byTrip;
}

/**
 * Same keys, strictly equal values. Rows, covers and ranges hold primitives only,
 * which is what makes this enough to say "nothing changed".
 */
function shallowEqual<T extends object>(a: T, b: T): boolean {
  const keys = Object.keys(a) as (keyof T)[];
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/** `previous` itself when `next` says the same thing, so a consumer sees no change. */
function keep<T extends object>(previous: T | undefined, next: T): T {
  return previous !== undefined && shallowEqual(previous, next) ? previous : next;
}

function keepRange(
  previous: TripDateRange | null | undefined,
  next: TripDateRange | null,
): TripDateRange | null {
  return next === null ? null : keep(previous ?? undefined, next);
}

/**
 * Every query re-run hands back fresh row objects, equal or not, so a summary is
 * rebuilt each time. Reuse the previous summary when every part of it is unchanged
 * (and the previous trip row, cover and range when only others changed), so one
 * trip's edit, or a write that moves no cover, re-renders nothing else.
 */
function reuseSummary(previous: TripSummary | undefined, next: TripSummary): TripSummary {
  if (previous === undefined) return next;
  const trip = keep(previous.trip, next.trip);
  const cover = keep<TripCover>(previous.cover, next.cover);
  const dateRange = keepRange(previous.dateRange, next.dateRange);
  const unchanged =
    trip === previous.trip &&
    cover === previous.cover &&
    dateRange === previous.dateRange &&
    next.stopCount === previous.stopCount &&
    next.status === previous.status;
  return unchanged ? previous : { ...next, trip, cover, dateRange };
}

function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/** `next`, with every summary (and part of one) that did not change swapped for `previous`'s. */
function reuseSummaries(previous: TripSummary[], next: TripSummary[]): TripSummary[] {
  const before = new Map(previous.map((summary) => [summary.trip.id, summary]));
  const reused = next.map((summary) =>
    reuseSummary(before.get(summary.trip.id), summary),
  );
  return sameItems(previous, reused) ? previous : reused;
}

/**
 * Candidates are grouped by trip once; each group keeps the query's order, which is
 * what `resolveTripCover` relies on. A group whose trip is not in the list (a
 * removed trip's photos) is never read.
 */
function summarise(
  trips: TripRow[],
  stops: TripStopRow[],
  candidates: CoverCandidate[],
  today?: string,
): TripSummary[] {
  const stopsByTrip = groupByTrip(stops);
  const candidatesByTrip = groupByTrip(candidates);
  return trips.map((trip) => {
    const tripStops = stopsByTrip.get(trip.id) ?? [];
    const status = deriveTripStatus(tripStops, today);
    return {
      trip,
      stopCount: tripStops.length,
      status,
      cover: resolveTripCover(trip, candidatesByTrip.get(trip.id) ?? [], status),
      dateRange: tripDateRange(tripStops),
    };
  });
}

/**
 * Keeps the previous result so equal summaries are reused (`reuseSummary`). It is
 * state, not a ref: React's compiler lint (`react-hooks/refs`) forbids reading a
 * ref while rendering, and this is the documented way to carry a value from the last
 * render (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
 * A new `fresh` re-renders once more with the reused result.
 */
function useReusedSummaries(fresh: TripSummary[]): TripSummary[] {
  const [kept, setKept] = useState({ fresh, reused: fresh });
  if (kept.fresh === fresh) return kept.reused;

  const reused = reuseSummaries(kept.reused, fresh);
  setKept({ fresh, reused });
  return reused;
}

/**
 * Every live trip with its stop count, derived status, cover and date range, most
 * recently changed first. Three live queries (trips, stops, photo cover candidates),
 * joined in memory; read from the traveller's own local rows, never the network.
 *
 * Covers are decorative, so the third query neither holds `loading` nor sets
 * `error`: until it answers (or if it fails) every trip shows its typographic cover,
 * and the photo takes over when candidates arrive. The list is the product.
 */
export function useTrips(today?: string): LiveResult<TripSummary[]> {
  const db = useDatabase();
  const trips = useLiveQuery(tripsRepository.listQuery(db));
  const stops = useLiveQuery(stopsRepository.allActiveQuery(db));
  const covers = useLiveQuery(photosRepository.coverCandidatesQuery(db));

  const fresh = useMemo(
    () => summarise(trips.data, stops.data, covers.data, today),
    [trips.data, stops.data, covers.data, today],
  );
  const data = useReusedSummaries(fresh);

  return {
    data,
    loading: trips.updatedAt === undefined || stops.updatedAt === undefined,
    error: trips.error ?? stops.error ?? null,
  };
}

/**
 * Whether a live read is still waiting for its first answer. Drizzle's `useLiveQuery`
 * sets `updatedAt` only when a result arrives, so a read that FAILS leaves it unset for
 * good: `updatedAt === undefined` alone would call a failed read "loading" for ever, and
 * a screen that checks `loading` first would never show its error. An error is an answer.
 */
function isAwaitingFirstResult(read: { updatedAt?: Date; error?: Error }): boolean {
  return read.updatedAt === undefined && read.error === undefined;
}

/** One trip, or `null` once the store has answered and it is not there. */
export function useTrip(tripId: string): LiveResult<TripRow | null> {
  const db = useDatabase();
  const result = useLiveQuery(tripsRepository.byIdQuery(db, tripId), [tripId]);
  return {
    data: result.data[0] ?? null,
    loading: isAwaitingFirstResult(result),
    error: result.error ?? null,
  };
}

/** A trip's live stops, ordered, with cached place names. */
export function useTripStops(tripId: string): LiveResult<StopWithPlace[]> {
  const db = useDatabase();
  const result = useLiveQuery(stopsRepository.forTripQuery(db, tripId), [tripId]);
  return {
    data: result.data,
    loading: isAwaitingFirstResult(result),
    error: result.error ?? null,
  };
}

export interface TripActions {
  createTrip: (input: Omit<CreateTripInput, 'id'>) => TripRow;
  removeTrip: (tripId: string) => void;
  addStop: (input: Omit<AddStopInput, 'id'>) => TripStopRow;
  updateStopDates: (stopId: string, dates: StopDates) => void;
  moveStop: (stopId: string, direction: MoveDirection) => void;
  /** The whole order at once — what a drag-and-drop yields (T071b). */
  reorderStops: (tripId: string, orderedIds: readonly string[]) => void;
  removeStop: (stopId: string) => void;
}

/**
 * The writes, bound to the open database. Ids are minted here with
 * `expo-crypto`'s `randomUUID()` (https://docs.expo.dev/versions/v57.0.0/sdk/crypto.md)
 * so no screen ever invents an identifier (research D-15).
 */
export function useTripActions(): TripActions {
  const db = useDatabase();
  return useMemo(
    () => ({
      createTrip: (input) => tripsRepository.create(db, { id: randomUUID(), ...input }),
      removeTrip: (tripId) => tripsRepository.remove(db, tripId),
      addStop: (input) => stopsRepository.add(db, { id: randomUUID(), ...input }),
      updateStopDates: (stopId, dates) => stopsRepository.updateDates(db, stopId, dates),
      moveStop: (stopId, direction) => stopsRepository.move(db, stopId, direction),
      reorderStops: (tripId, orderedIds) =>
        stopsRepository.reorder(db, tripId, orderedIds),
      removeStop: (stopId) => stopsRepository.remove(db, stopId),
    }),
    [db],
  );
}
