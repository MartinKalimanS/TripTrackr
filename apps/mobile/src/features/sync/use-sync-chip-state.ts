/**
 * `useSyncChipState()` - what the global sync chip says (feature 005, data-model section 8,
 * research D5-17, contract C5-16; FR-026, FR-065), derived from three things the app already
 * has and nothing it would have to ask for:
 *
 *   const state = useSyncChipState();          // { kind: 'waiting', count: 3 }, ...
 *   <SyncChip state={state} onRetry={retry} />
 *
 * - the number of rows still marked `is_dirty` across the SEVEN synchronised tables (`trips`,
 *   `trip_stops`, `expense_categories`, `notes`, `expenses`, `photos`, `documents`): the
 *   records the server has not acknowledged, whatever their bytes. A photograph whose bytes
 *   have not arrived counts, and so does a delete still to be sent; the sign-out guard's
 *   `countUnsynced` leaves the first out because the upload queue counts it, but a traveller
 *   looking at the chip is asking "is everything safe", and a photograph that is not uploaded
 *   is not. One live query per table (`useLiveQuery`, https://orm.drizzle.team/docs/connect-expo-sqlite),
 *   so a write moves the number at once and no request is made;
 * - the network (`useNetworkState`, https://docs.expo.dev/versions/v57.0.0/sdk/network.md);
 * - the sync runtime's own status (`useSyncStatusStore`: the phase and the last failure).
 *
 * The chip reads these and writes nothing, queries nothing new and sends nothing: it is a view
 * of local state (Constitution I and II; D5-17 "private, local, never transmitted"). A read
 * that fails leaves that table's count at zero rather than breaking a screen; the sign-out
 * guard counts for itself, so a failed chip read cannot lose a record.
 *
 * Precedence (each is a test): the network being gone is `offline`, an ordinary state and never
 * an error; a cycle running with records waiting is `syncing`, even over the failure it is
 * retrying; a cycle that could not connect is `offline` too; a server failure is `failed`
 * (Retry is offered even with nothing waiting); records waiting is `waiting`; nothing is
 * `synced`, and the chip draws nothing. An ended session (`unauthorized`) is not a failure of
 * the chip's: the sign-out flow speaks.
 */
import { count, eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { NetworkStateType, useNetworkState } from 'expo-network';
import { useMemo } from 'react';

import { useDatabase } from '@/db/client';
import {
  documents,
  expenseCategories,
  expenses,
  notes,
  photos,
  tripStops,
  trips,
} from '@/db/schema';
import { useSyncStatusStore } from '@/sync/engine';
import type { SyncStatus } from '@/sync/types';

/** The synchronisation of the whole screen (data-model section 8), derived by the caller. */
export type SyncChipState =
  | { kind: 'synced' }
  | { kind: 'waiting'; count: number }
  | { kind: 'syncing'; count: number }
  | { kind: 'offline'; count: number }
  | { kind: 'failed'; count: number };

/** The part of `expo-network`'s `NetworkState` the chip reads. */
export interface NetworkReading {
  isConnected?: boolean;
  isInternetReachable?: boolean;
  type?: string;
}

export interface SyncChipInputs {
  /** Rows marked dirty across the seven synchronised tables. */
  dirtyCount: number;
  network: NetworkReading;
  status: Pick<SyncStatus, 'phase' | 'failure'>;
}

/**
 * Whether the network is gone. `false` while it has not answered yet (the hook starts as `{}`):
 * not knowing is not being offline, and a chip that cried wolf on every launch would be ignored
 * when it mattered.
 */
export function isOffline(network: NetworkReading): boolean {
  return (
    network.isConnected === false ||
    network.isInternetReachable === false ||
    network.type === NetworkStateType.NONE
  );
}

/** The chip's state from its inputs. Pure. */
export function deriveSyncChipState({
  dirtyCount,
  network,
  status,
}: SyncChipInputs): SyncChipState {
  const waiting = Math.max(0, Math.trunc(dirtyCount));
  if (isOffline(network)) return { kind: 'offline', count: waiting };
  if (status.phase !== 'idle' && waiting > 0) return { kind: 'syncing', count: waiting };
  if (status.failure === 'offline') return { kind: 'offline', count: waiting };
  if (status.failure === 'server' || status.failure === 'invalid_response') {
    return { kind: 'failed', count: waiting };
  }
  return waiting > 0 ? { kind: 'waiting', count: waiting } : { kind: 'synced' };
}

type SyncedTable =
  | typeof trips
  | typeof tripStops
  | typeof expenseCategories
  | typeof notes
  | typeof expenses
  | typeof photos
  | typeof documents;

/** The live number of dirty rows in one table; zero until it answers, and if it cannot. */
function useDirtyIn(table: SyncedTable): number {
  const db = useDatabase();
  const { data } = useLiveQuery(
    db.select({ n: count() }).from(table).where(eq(table.is_dirty, true)),
  );
  return Number(data[0]?.n ?? 0);
}

/** Dirty rows across the seven synchronised tables, live. */
function useDirtyCount(): number {
  return (
    useDirtyIn(trips) +
    useDirtyIn(tripStops) +
    useDirtyIn(expenseCategories) +
    useDirtyIn(notes) +
    useDirtyIn(expenses) +
    useDirtyIn(photos) +
    useDirtyIn(documents)
  );
}

/**
 * The state of the global chip. The same object until the count, the network or the runtime
 * changes, so a screen that spreads it into props re-renders nothing in between.
 */
export function useSyncChipState(): SyncChipState {
  const dirtyCount = useDirtyCount();
  const { isConnected, isInternetReachable, type } = useNetworkState();
  const phase = useSyncStatusStore((status) => status.phase);
  const failure = useSyncStatusStore((status) => status.failure);

  return useMemo(
    () =>
      deriveSyncChipState({
        dirtyCount,
        network: { isConnected, isInternetReachable, type },
        status: { phase, failure },
      }),
    [dirtyCount, isConnected, isInternetReachable, type, phase, failure],
  );
}

/**
 * Whether a push is running now: what turns a record's "Not yet synced" marker into
 * "Syncing" (`recordSyncState`). A cycle that only pulls moves no local record.
 */
export function useIsPushing(): boolean {
  return useSyncStatusStore((status) => status.phase === 'pushing');
}
