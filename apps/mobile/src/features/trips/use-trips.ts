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
 *
 * Feature 005 (T539) adds the card model: `useTrips` returns `TripCardModel`s, the 004
 * `TripSummary` with the day of the trip, the countdown, one dot per stop, the country, the
 * kilometres and the generated cover beside it (`trip-card-model.ts`). The stops are read with
 * their cached city and country; like the globe, the stops read is keyed on when the city
 * cache last changed, because `useLiveQuery` subscribes to the FROM table only.
 */
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { useMemo, useState } from 'react';

import { useDatabase } from '@/db/client';
import { geographyRepository } from '@/db/repositories/geography';
import { photosRepository } from '@/db/repositories/photos';
import {
  stopsRepository,
  type AddStopInput,
  type MoveDirection,
  type StopDates,
  type StopWithPlace,
} from '@/db/repositories/stops';
import { tripsRepository, type CreateTripInput } from '@/db/repositories/trips';
import type { TripRow, TripStopRow } from '@/db/schema';

import type { TripCover } from './trip-cover';
import { buildTripCards, type TripCardModel } from './trip-card-model';
import type { TripDateRange, TripStatus } from './trip-status';

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

/**
 * Plain data, structurally: primitives, arrays and objects of them (rows, covers, ranges,
 * strips). That is what makes a deep comparison enough to say "nothing changed".
 */
function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) =>
      sameData((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    )
  );
}

/** `previous` itself when `next` says the same thing, so a consumer sees no change. */
function keep<T>(previous: T | undefined, next: T): T {
  return previous !== undefined && sameData(previous, next) ? previous : next;
}

/**
 * Every query re-run hands back fresh row objects, equal or not, so a card is rebuilt each
 * time. Reuse each field of the previous card that is unchanged, and the card itself when
 * every field is, so one trip's edit, or a write that moves no cover, re-renders nothing else.
 */
function reuseCard(
  previous: TripCardModel | undefined,
  next: TripCardModel,
): TripCardModel {
  if (previous === undefined) return next;
  const merged = Object.fromEntries(
    Object.entries(next).map(([key, value]) => [
      key,
      keep((previous as unknown as Record<string, unknown>)[key], value),
    ]),
  ) as unknown as TripCardModel;
  const unchanged = (Object.keys(next) as (keyof TripCardModel)[]).every(
    (key) => merged[key] === previous[key],
  );
  return unchanged ? previous : merged;
}

function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/** `next`, with every card (and part of one) that did not change swapped for `previous`'s. */
function reuseCards(previous: TripCardModel[], next: TripCardModel[]): TripCardModel[] {
  const before = new Map(previous.map((card) => [card.id, card]));
  const reused = next.map((card) => reuseCard(before.get(card.id), card));
  return sameItems(previous, reused) ? previous : reused;
}

/**
 * Keeps the previous result so equal cards are reused (`reuseCard`). It is
 * state, not a ref: React's compiler lint (`react-hooks/refs`) forbids reading a
 * ref while rendering, and this is the documented way to carry a value from the last
 * render (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
 * A new `fresh` re-renders once more with the reused result.
 */
function useReusedCards(fresh: TripCardModel[]): TripCardModel[] {
  const [kept, setKept] = useState({ fresh, reused: fresh });
  if (kept.fresh === fresh) return kept.reused;

  const reused = reuseCards(kept.reused, fresh);
  setKept({ fresh, reused });
  return reused;
}

/**
 * Every live trip as a card model (the 004 summary plus the 005 card fields), most recently
 * changed first. Four live queries (trips, stops with their city and country, photo cover
 * candidates, and the city cache's size to know when a city arrives), joined in memory; read
 * from the traveller's own local rows, never the network.
 *
 * Covers and places are decorative, so the third and fourth queries neither hold `loading` nor
 * set `error`: until they answer (or if they fail) every trip shows its generated cover with no
 * flag, and the photo and the country take over when they arrive. The list is the product.
 */
export function useTrips(today?: string): LiveResult<TripCardModel[]> {
  const db = useDatabase();
  const trips = useLiveQuery(tripsRepository.listQuery(db));
  const cityCache = useLiveQuery(geographyRepository.cityCountQuery(db));
  const stops = useLiveQuery(stopsRepository.allActiveWithCountryQuery(db), [
    cityCache.updatedAt?.getTime(),
  ]);
  const covers = useLiveQuery(photosRepository.coverCandidatesQuery(db));

  const fresh = useMemo(
    () => buildTripCards(trips.data, stops.data, covers.data, today),
    [trips.data, stops.data, covers.data, today],
  );
  const data = useReusedCards(fresh);

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
