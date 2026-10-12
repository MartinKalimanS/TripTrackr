/**
 * The sync chip and the banner of the Trips screen - feature 005, T541 (FR-026, FR-065;
 * data-model section 8). A THIN SEAM: `features/sync/use-sync-chip-state.ts` (T529, the chrome
 * branch) will own this derivation for Home, Trips and a trip alike; until it lands, Trips
 * derives the same `SyncChipState` here from the same two facts, so that wiring it is one
 * import swapped (`useTripsSync` returns the chip, the banner and `retry`; the screen reads
 * nothing else).
 *
 * It READS and writes nothing (Constitution I and II; D5-17: private, local, never transmitted):
 *
 * - the number of rows waiting to upload over the seven synchronised tables
 *   (`syncRepository.countUnsynced`: rows with unsent changes, byte-backed rows counted once
 *   their bytes have uploaded), re-read whenever `watch` (the trip list, which changes when a
 *   trip or a stop is written) or the runtime's phase or last success changes;
 * - the sync runtime's own status (`useSyncStatus`).
 *
 * A cycle that is running is `syncing` (it wins over the failure of the last one: a retry
 * shows it is under way); a failure to reach the server is `offline`, which is an ordinary state
 * and not an error (Constitution II); any other failure is `failed`; rows waiting with nothing
 * running is `waiting`; nothing is `synced` and the chip draws nothing. A session that has ended
 * (`unauthorized`) is not for this screen to announce: the sign-in screens speak for it.
 *
 * Known limit of the seam, replaced by T529: the count is re-read when the list changes or a cycle
 * moves, not on every write to a table this screen does not read (a note edited inside a trip
 * is counted at the next cycle).
 */
import { useMemo } from 'react';

import type { BannerTone } from '@/components/ui/banner';
import type { SyncChipState } from '@/components/ui/sync-chip';
import { useDatabase } from '@/db/client';
import { syncRepository } from '@/db/repositories/sync';
import { syncNow, useSyncStatus } from '@/sync/engine';
import type { SyncStatus } from '@/sync/types';

export interface TripsBanner {
  tone: BannerTone;
  message: string;
  /** Only a failure has one: "Retry". */
  action?: { label: string; onPress: () => void };
}

export interface TripsSync {
  chip: SyncChipState;
  /** One slim notice under the filter, or `null`. */
  banner: TripsBanner | null;
  /** Runs a manual cycle: what the chip's and the banner's Retry do. */
  retry: () => void;
}

const SYNCED: SyncChipState = { kind: 'synced' };

function chipOf(status: SyncStatus, count: number): SyncChipState {
  if (status.failure === 'unauthorized') return SYNCED;
  if (status.phase !== 'idle') return { kind: 'syncing', count };
  if (status.failure === 'offline') return { kind: 'offline', count };
  if (status.failure !== null) return { kind: 'failed', count };
  return count > 0 ? { kind: 'waiting', count } : SYNCED;
}

const changes = (count: number) => `${count} ${count === 1 ? 'change' : 'changes'}`;

function bannerOf(chip: SyncChipState, retry: () => void): TripsBanner | null {
  const count = 'count' in chip ? chip.count : 0;
  if (chip.kind === 'offline') {
    return {
      tone: 'offline',
      message:
        count > 0
          ? `Offline. ${changes(count)} will sync when you're back online.`
          : "Offline. Changes you make will sync when you're back online.",
    };
  }
  if (chip.kind === 'failed') {
    return {
      tone: 'error',
      message:
        count > 0
          ? `Couldn't sync ${changes(count)}. Your trips are safe on this phone.`
          : "Couldn't sync. Your trips are safe on this phone.",
      action: { label: 'Retry', onPress: retry },
    };
  }
  return null;
}

function retry(): void {
  void syncNow('manual');
}

export function useTripsSync(watch: unknown): TripsSync {
  const db = useDatabase();
  const status = useSyncStatus();
  const { phase, lastSyncedAt } = status;
  const count = useMemo(
    () => syncRepository.countUnsynced(db),
    // `watch`, `phase` and `lastSyncedAt` are the signals to read again, not inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, watch, phase, lastSyncedAt],
  );
  const chip = chipOf(status, count);
  return { chip, banner: bannerOf(chip, retry), retry };
}
