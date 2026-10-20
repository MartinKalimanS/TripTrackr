import type { SyncTable } from '@triptrackr/contracts';

/**
 * The sync engine's public vocabulary (sync-protocol.md §3; tasks.md T131-T137).
 *
 * This file is the contract between the engine (`engine.ts`, `push.ts`,
 * `pull.ts`) and everything that drives or displays it (`triggers.ts`,
 * `upload-queue.ts`, the syncing screen, the sign-out guard, the conflict
 * notice). Changing a shape here changes all of them.
 */

/** Why a cycle started. One per row of sync-protocol.md §3. */
export type SyncReason =
  'timer' | 'reconnect' | 'foreground' | 'first-launch' | 'sign-out' | 'manual';

export type SyncPhase = 'idle' | 'pushing' | 'pulling';

/**
 * Why a cycle did not finish. `offline` is an ordinary state (Constitution II),
 * not an error the traveller needs to act on; `unauthorized` means the session
 * is gone and the API client has already signed the device out.
 */
export type SyncFailure = 'offline' | 'unauthorized' | 'server' | 'invalid_response';

export interface SyncCycleResult {
  ok: boolean;
  /** Records the server applied. */
  pushed: number;
  /** Records written to the local store from the pull. */
  pulled: number;
  /** Local edits the server replaced with a newer version. */
  conflicts: number;
  failure: SyncFailure | null;
}

export interface SyncStatus {
  phase: SyncPhase;
  /**
   * True once a full snapshot has been pulled for this account on this device.
   * While false, the traveller sees the explicit "syncing your trips" state,
   * never an empty screen (FR-042).
   */
  firstSyncComplete: boolean;
  /** ISO instant of the last cycle that finished without failure; null before the first. */
  lastSyncedAt: string | null;
  failure: SyncFailure | null;
}

/**
 * Told to the traveller when a newer version replaced content they wrote and
 * the two actually differed (FR-040, sync-protocol.md §2).
 */
export interface ConflictNotice {
  id: string;
  table: SyncTable;
  recordId: string;
  /** The trip the record belongs to, for linking; null for a trip-less record. */
  tripId: string | null;
  /** Plain-language sentence, already written for the traveller. */
  summary: string;
  /** ISO instant the overwrite was applied locally. */
  detectedAt: string;
}
