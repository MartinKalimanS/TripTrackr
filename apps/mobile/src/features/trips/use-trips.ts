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
import { useMemo } from 'react';

import { useDatabase } from '@/db/client';
import {
  stopsRepository,
  type AddStopInput,
  type MoveDirection,
  type StopDates,
  type StopWithPlace,
} from '@/db/repositories/stops';
import { tripsRepository, type CreateTripInput } from '@/db/repositories/trips';
import type { TripRow, TripStopRow } from '@/db/schema';

import { deriveTripStatus, type TripStatus } from './trip-status';

export interface TripSummary {
  trip: TripRow;
  stopCount: number;
  status: TripStatus;
}

export interface LiveResult<T> {
  data: T;
  /** No result has arrived yet — distinct from "empty". */
  loading: boolean;
  error: Error | null;
}

function summarise(
  trips: TripRow[],
  stops: TripStopRow[],
  today?: string,
): TripSummary[] {
  const byTrip = new Map<string, TripStopRow[]>();
  for (const stop of stops) {
    const list = byTrip.get(stop.trip_id) ?? [];
    list.push(stop);
    byTrip.set(stop.trip_id, list);
  }
  return trips.map((trip) => {
    const tripStops = byTrip.get(trip.id) ?? [];
    return {
      trip,
      stopCount: tripStops.length,
      status: deriveTripStatus(tripStops, today),
    };
  });
}

/** Every live trip with its stop count and derived status, most recently changed first. */
export function useTrips(today?: string): LiveResult<TripSummary[]> {
  const db = useDatabase();
  const trips = useLiveQuery(tripsRepository.listQuery(db));
  const stops = useLiveQuery(stopsRepository.allActiveQuery(db));

  const data = useMemo(
    () => summarise(trips.data, stops.data, today),
    [trips.data, stops.data, today],
  );

  return {
    data,
    loading: trips.updatedAt === undefined || stops.updatedAt === undefined,
    error: trips.error ?? stops.error ?? null,
  };
}

/** One trip, or `null` once the store has answered and it is not there. */
export function useTrip(tripId: string): LiveResult<TripRow | null> {
  const db = useDatabase();
  const result = useLiveQuery(tripsRepository.byIdQuery(db, tripId), [tripId]);
  return {
    data: result.data[0] ?? null,
    loading: result.updatedAt === undefined,
    error: result.error ?? null,
  };
}

/** A trip's live stops, ordered, with cached place names. */
export function useTripStops(tripId: string): LiveResult<StopWithPlace[]> {
  const db = useDatabase();
  const result = useLiveQuery(stopsRepository.forTripQuery(db, tripId), [tripId]);
  return {
    data: result.data,
    loading: result.updatedAt === undefined,
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
