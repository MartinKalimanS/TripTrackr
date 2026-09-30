import { create } from 'zustand';

import type { AppDatabase } from '@/db/client';

import type { SyncCycleResult, SyncReason, SyncStatus } from './types';

/**
 * The sync engine's public surface (tasks.md T131). The bodies below are the
 * seam other modules build against; the engine itself replaces them.
 *
 * - `startSyncEngine(db)` binds the signed-in traveller's database and returns
 *   the function that unbinds it. The database arrives through React context,
 *   so the engine cannot reach for a global.
 * - `syncNow(reason)` runs one push-then-pull cycle. Single-flight: a call made
 *   while a cycle runs joins it. It never rejects; every failure is a
 *   `SyncCycleResult` with `ok: false`.
 * - `countUnsynced(db)` is the number of records the server has not
 *   acknowledged: dirty rows in every mirrored table.
 */
const INITIAL_STATUS: SyncStatus = {
  phase: 'idle',
  firstSyncComplete: false,
  lastSyncedAt: null,
  failure: null,
};

export const useSyncStatusStore = create<SyncStatus>(() => INITIAL_STATUS);

export function useSyncStatus(): SyncStatus {
  return useSyncStatusStore();
}

export function getSyncStatus(): SyncStatus {
  return useSyncStatusStore.getState();
}

export function startSyncEngine(_db: AppDatabase): () => void {
  return () => undefined;
}

export function syncNow(_reason: SyncReason): Promise<SyncCycleResult> {
  return Promise.resolve({
    ok: false,
    pushed: 0,
    pulled: 0,
    conflicts: 0,
    failure: 'offline',
  });
}

export function countUnsynced(_db: AppDatabase): Promise<number> {
  return Promise.resolve(0);
}
