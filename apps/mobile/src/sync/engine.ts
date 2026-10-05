import { create } from 'zustand';

import type { AppDatabase } from '@/db/client';
import { nowIso } from '@/db/repositories/shared';
import { syncRepository } from '@/db/repositories/sync';

import { useConflictStore } from './conflicts';
import type { SyncContext } from './context';
import { isFirstSyncComplete, resolveFirstSyncComplete } from './cursor';
import { classifyFailure } from './failure';
import { publishParked, pushDirtyRows } from './push';
import { pullChanges } from './pull';
import type { SyncCycleResult, SyncFailure, SyncReason, SyncStatus } from './types';
import { useSyncWarningsStore } from './warnings';

/**
 * The sync engine's public surface (tasks.md T131; sync-protocol.md §3).
 *
 * - `startSyncEngine(db)` binds the signed-in traveller's database and returns
 *   the function that unbinds it. The database arrives through React context,
 *   so the engine cannot reach for a global. Binding hydrates the status
 *   (`firstSyncComplete`, including the rule for a device that pre-dates the
 *   flag — cursor.ts) and the repair list, synchronously. Unbinding — or
 *   binding another database — clears every in-memory store that carried the
 *   previous traveller's content (status, conflict notices, warnings), and a
 *   cycle still running for the old binding stops at its next checkpoint and
 *   never touches the new one (context.ts).
 * - `syncNow(reason)` runs one cycle. Single-flight: a call made while a cycle
 *   runs joins it when that cycle already does the work the caller needs, and
 *   otherwise waits for it and then runs ONE follow-up cycle shared by every
 *   such caller — the sign-out guard's push must really happen even if a pull
 *   was already in flight. It never rejects; every failure is a
 *   `SyncCycleResult` with `ok: false`.
 * - `countUnsynced(db)` is the number of records the server has not
 *   acknowledged: dirty rows in the seven mirrored tables. Parked (refused)
 *   records count; photos and documents whose bytes have not arrived do not,
 *   because `countPendingUploads` (upload-queue.ts) counts those and the
 *   sign-out guard adds the two.
 *
 * WHAT EACH REASON DOES (sync-protocol.md §3):
 *   timer, reconnect, manual  push, then pull
 *   foreground                pull
 *   first-launch              pull from the stored cursor — a full snapshot when
 *                             there is none — so a device that has never synced
 *                             gets the syncing state (FR-042) and a resumed
 *                             snapshot continues where it stopped
 *   sign-out                  push only: the guard needs to know whether the
 *                             traveller's own records reached the server
 *
 * A cycle stops at its first failure. `SyncCycleResult.pushed` counts records
 * the server applied, `pulled` records written locally, and `conflicts` the
 * local edits replaced by a different newer version (one per notice raised).
 * With nothing bound, `syncNow` answers `failure: 'unauthorized'` and does
 * nothing.
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

// ---------------------------------------------------------------------------
// Binding
// ---------------------------------------------------------------------------

interface Plan {
  push: boolean;
  pull: boolean;
}

interface Flight {
  plan: Plan;
  promise: Promise<SyncCycleResult>;
}

interface Binding {
  readonly db: AppDatabase;
  running: Flight | null;
  /** The follow-up cycle callers with an uncovered plan share. */
  queued: { plan: Plan; promise: Promise<SyncCycleResult> } | null;
}

let bound: Binding | null = null;

const UNBOUND_RESULT: SyncCycleResult = {
  ok: false,
  pushed: 0,
  pulled: 0,
  conflicts: 0,
  failure: 'unauthorized',
};

/** Nothing a previous traveller's session left in memory may reach the next one. */
function resetStores(): void {
  useSyncStatusStore.setState(INITIAL_STATUS);
  useConflictStore.getState().clear();
  useSyncWarningsStore.getState().reset();
}

export function startSyncEngine(db: AppDatabase): () => void {
  resetStores();
  const binding: Binding = { db, running: null, queued: null };
  bound = binding;
  useSyncStatusStore.setState({ firstSyncComplete: resolveFirstSyncComplete(db) });
  publishParked(db);

  return () => {
    // A stale unbind (React strict-mode double effect, a replaced binding) must
    // not tear down the binding that replaced it.
    if (bound !== binding) return;
    bound = null;
    resetStores();
  };
}

// ---------------------------------------------------------------------------
// Cycles
// ---------------------------------------------------------------------------

function planFor(reason: SyncReason): Plan {
  switch (reason) {
    case 'foreground':
    case 'first-launch':
      return { push: false, pull: true };
    case 'sign-out':
      return { push: true, pull: false };
    default:
      return { push: true, pull: true };
  }
}

function covers(running: Plan, wanted: Plan): boolean {
  return (running.push || !wanted.push) && (running.pull || !wanted.pull);
}

function union(a: Plan, b: Plan): Plan {
  return { push: a.push || b.push, pull: a.pull || b.pull };
}

/** Status is the bound traveller's; a cycle for a binding that is gone must not write it. */
function publish(binding: Binding, patch: Partial<SyncStatus>): void {
  if (bound === binding) useSyncStatusStore.setState(patch);
}

interface Progress {
  pushed: number;
  pulled: number;
  conflicts: number;
  failure: SyncFailure | null;
}

async function runPlan(
  binding: Binding,
  ctx: SyncContext,
  plan: Plan,
  progress: Progress,
): Promise<void> {
  if (plan.push) {
    publish(binding, { phase: 'pushing' });
    const pushed = await pushDirtyRows(ctx);
    progress.pushed += pushed.pushed;
    progress.conflicts += pushed.conflicts;
    progress.failure = pushed.failure;
  }
  if (plan.pull && progress.failure === null) {
    publish(binding, { phase: 'pulling' });
    const pulled = await pullChanges(ctx);
    progress.pulled += pulled.pulled;
    progress.conflicts += pulled.conflicts;
    progress.failure = pulled.failure;
  }
}

/** The stored flag; if the database cannot be read after the cycle, the last known answer stands. */
function readFirstSyncComplete(binding: Binding): boolean {
  try {
    return isFirstSyncComplete(binding.db);
  } catch {
    return getSyncStatus().firstSyncComplete;
  }
}

async function runCycle(binding: Binding, plan: Plan): Promise<SyncCycleResult> {
  const ctx: SyncContext = { db: binding.db, isCurrent: () => bound === binding };
  const progress: Progress = { pushed: 0, pulled: 0, conflicts: 0, failure: null };
  try {
    await runPlan(binding, ctx, plan, progress);
  } catch (error) {
    progress.failure = classifyFailure(error);
  }

  const { failure, ...counts } = progress;
  publish(binding, {
    phase: 'idle',
    failure,
    firstSyncComplete: readFirstSyncComplete(binding),
    ...(failure === null ? { lastSyncedAt: nowIso() } : {}),
  });
  return { ok: failure === null, ...counts, failure };
}

function start(binding: Binding, plan: Plan): Promise<SyncCycleResult> {
  if (bound !== binding) return Promise.resolve(UNBOUND_RESULT);
  const promise = runCycle(binding, plan).finally(() => {
    if (binding.running?.promise === promise) binding.running = null;
  });
  binding.running = { plan, promise };
  return promise;
}

/** Wait for the running cycle, then run one follow-up that every uncovered caller shares. */
function enqueue(
  binding: Binding,
  running: Flight,
  plan: Plan,
): Promise<SyncCycleResult> {
  if (binding.queued) {
    binding.queued.plan = union(binding.queued.plan, plan);
    return binding.queued.promise;
  }
  const queued = {
    plan,
    promise: running.promise.then(() => {
      const followUp = binding.queued?.plan ?? plan;
      binding.queued = null;
      return start(binding, followUp);
    }),
  };
  binding.queued = queued;
  return queued.promise;
}

export function syncNow(reason: SyncReason): Promise<SyncCycleResult> {
  const binding = bound;
  if (!binding) return Promise.resolve(UNBOUND_RESULT);

  const plan = planFor(reason);
  const running = binding.running;
  if (!running) return start(binding, plan);
  if (covers(running.plan, plan)) return running.promise;
  return enqueue(binding, running, plan);
}

export function countUnsynced(db: AppDatabase): Promise<number> {
  return Promise.resolve(syncRepository.countUnsynced(db));
}
