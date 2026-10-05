import {
  MAX_PUSH_BATCH,
  PushResponse,
  SYNC_TABLES,
  type PushResult,
  type SyncTable,
} from '@triptrackr/contracts';
import { randomUUID } from 'expo-crypto';

import { nowIso } from '@/db/repositories/shared';
import { syncRepository, type SyncExecutor } from '@/db/repositories/sync';
import { apiFetch } from '@/lib/api-client';

import { noticeForOverwrite, raiseConflicts } from './conflicts';
import { assertCurrent, type SyncContext } from './context';
import { SyncContractError, classifyFailure } from './failure';
import {
  buildPushRequest,
  parsePullRecord,
  toLocalValues,
  toPushRecord,
  utf8Length,
  type WireRecord,
} from './records';
import type { ConflictNotice, SyncFailure } from './types';
import { useSyncWarningsStore } from './warnings';

/**
 * Push: send every dirty row the server has not acknowledged (tasks.md T132;
 * sync-protocol.md §2; FR-036 to FR-040, FR-041; Constitution II, V; research
 * D-02, D-08, D-15, D-16).
 *
 * ORDER AND SIZE. Tables go in `SYNC_TABLES` order — parents before children —
 * one `PushRequest` per batch. A batch holds at most `MAX_PUSH_BATCH` records
 * and about `MAX_PUSH_BYTES` of serialised JSON, so a large offline backlog
 * (a week of photos' metadata) is several bounded requests, and a request that
 * fails costs only itself: rows of a batch that never got an answer stay dirty
 * and the next cycle sends them again (the server is idempotent by `id`).
 *
 * CLEANING IS COMPARE-AND-SET. `applied` clears `is_dirty` only if the row's
 * `updated_at` is still the one the request carried; an edit made while the
 * request was in flight keeps the row dirty and travels next cycle.
 *
 * EVERY VERDICT (`applyResult`):
 *   applied            -> `synced_at` set, `is_dirty` cleared (CAS). With the
 *                         `over_allowance` warning the trip id goes to the
 *                         warnings store for the entitlement flow; the trip is
 *                         not touched, hidden or restricted (Constitution V).
 *   conflict           -> `server_version` is validated against the table's
 *                         PULL schema, then overwrites the local row (CAS,
 *                         clean). A `ConflictNotice` is raised only when the
 *                         traveller's content actually differed (FR-040).
 *   parent_missing     -> nothing; the row stays dirty for the next cycle.
 *   id_unavailable     -> the row gets a new id and every child key is
 *                         re-pointed in ONE transaction, then the table is
 *                         pushed once more this cycle so the children do not
 *                         wait for the next. Photos and documents are the
 *                         exception: their id is also the object-store key and
 *                         the sealed-file binding, so re-keying would orphan
 *                         bytes the server already holds. The server cannot
 *                         actually answer `id_unavailable` for them (it never
 *                         creates those rows from a push), so they are parked.
 *   invalid            -> parked (`sync_parked`): not sent again until edited,
 *                         so a refused record does not cost a request every 30
 *                         seconds forever. It stays on the device, dirty and
 *                         readable, and is listed for a repair surface
 *                         (`warnings.ts`).
 * A row that fails its own push schema before sending is parked the same way
 * and never enters a batch.
 *
 * PHOTOS AND DOCUMENTS travel only once their bytes arrived
 * (`upload_state = 'uploaded'`, FR-041) — the repository's `dirtyRows` enforces
 * it; earlier rows stay dirty and are not touched here.
 *
 * FAILURE. A network failure (or any other) stops the cycle and is reported as
 * the outcome's `failure`, with what was applied before it counted. Nothing
 * needs undoing: every step is idempotent by `id`, and unanswered rows are
 * simply still dirty. The context is re-checked before each request and before
 * applying each answer, so a cycle that outlived its account binding neither
 * sends nor writes (context.ts).
 */

/** Serialised-JSON budget of one push request (the server accepts far more; this is headroom). */
export const MAX_PUSH_BYTES = 800_000;

export interface PushOutcome {
  /** Records the server applied. */
  pushed: number;
  /** Local edits replaced by a different newer server version — one notice each. */
  conflicts: number;
  failure: SyncFailure | null;
}

interface Prepared {
  id: string;
  /** The `updated_at` the request carried — what cleaning compares against. */
  updatedAt: string;
  record: WireRecord;
  bytes: number;
}

interface Tally {
  pushed: number;
  conflicts: number;
}

/** What applying one batch of verdicts asks of the caller. */
interface BatchEffect {
  regenerated: boolean;
  notices: ConflictNotice[];
  overAllowanceTripIds: string[];
}

/** Everything `applyResult` needs about the batch it is applying. */
interface BatchScope {
  db: SyncContext['db'];
  table: SyncTable;
  now: string;
  effect: BatchEffect;
  tally: Tally;
}

/** Photos and documents keep their id: it is the object key (see the header). */
const KEEPS_ID: ReadonlySet<SyncTable> = new Set(['photos', 'documents']);

// ---------------------------------------------------------------------------
// Preparing batches
// ---------------------------------------------------------------------------

function prepare(db: SyncContext['db'], table: SyncTable): Prepared[] {
  const prepared: Prepared[] = [];
  for (const row of syncRepository.dirtyRows(db, table)) {
    const candidate = toPushRecord(table, row);
    if (!candidate.ok) {
      syncRepository.park(db, table, candidate.id, candidate.updatedAt, 'invalid');
      continue;
    }
    prepared.push({
      id: row.id,
      updatedAt: row.updated_at,
      record: candidate.record,
      bytes: utf8Length(JSON.stringify(candidate.record)),
    });
  }
  return prepared;
}

/** Split into runs of at most `MAX_PUSH_BATCH` records and `MAX_PUSH_BYTES` bytes. */
function batches(items: readonly Prepared[]): Prepared[][] {
  const runs: Prepared[][] = [];
  let current: Prepared[] = [];
  let bytes = 0;
  for (const item of items) {
    const full =
      current.length >= MAX_PUSH_BATCH ||
      (current.length > 0 && bytes + item.bytes > MAX_PUSH_BYTES);
    if (full) {
      runs.push(current);
      current = [];
      bytes = 0;
    }
    current.push(item);
    bytes += item.bytes;
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

// ---------------------------------------------------------------------------
// Applying verdicts
// ---------------------------------------------------------------------------

/** `conflict`: the server's version replaces ours, unless we have edited since. */
function applyConflict(
  db: SyncExecutor,
  table: SyncTable,
  id: string,
  sentUpdatedAt: string,
  serverVersion: Record<string, unknown>,
  now: string,
): ConflictNotice | null {
  const incoming = parsePullRecord(table, serverVersion);
  if (!incoming || incoming.id !== id) {
    throw new SyncContractError(
      `The server's version of a ${table} record is malformed.`,
    );
  }
  const local = syncRepository.findRow(db, table, id);
  if (!local) return null;

  const values = { ...toLocalValues(incoming), is_dirty: false, synced_at: now };
  const replaced = syncRepository.replaceIfUnchanged(
    db,
    table,
    id,
    sentUpdatedAt,
    values,
  );
  return replaced ? noticeForOverwrite(table, local, incoming, now) : null;
}

function applyRejection(
  db: SyncContext['db'],
  table: SyncTable,
  id: string,
  sentUpdatedAt: string,
  reason: 'parent_missing' | 'id_unavailable' | 'invalid',
): boolean {
  if (reason === 'invalid') {
    syncRepository.park(db, table, id, sentUpdatedAt, 'invalid');
    return false;
  }
  if (reason === 'id_unavailable') {
    if (KEEPS_ID.has(table)) {
      syncRepository.park(db, table, id, sentUpdatedAt, 'id_unavailable');
      return false;
    }
    syncRepository.regenerateId(db, table, id, randomUUID());
    return true;
  }
  return false; // parent_missing: dirty, retried next cycle
}

function applyResult(scope: BatchScope, result: PushResult, sentUpdatedAt: string): void {
  const { db, table, now, effect, tally } = scope;
  if (result.status === 'applied') {
    syncRepository.markPushed(db, table, result.id, sentUpdatedAt, now);
    tally.pushed += 1;
    if (table === 'trips' && result.warnings?.includes('over_allowance')) {
      effect.overAllowanceTripIds.push(result.id);
    }
  } else if (result.status === 'conflict') {
    const notice = applyConflict(
      db,
      table,
      result.id,
      sentUpdatedAt,
      result.server_version,
      now,
    );
    if (notice) {
      effect.notices.push(notice);
      tally.conflicts += 1;
    }
  } else if (applyRejection(db, table, result.id, sentUpdatedAt, result.reason)) {
    effect.regenerated = true;
  }
}

/** Tell the traveller and the entitlement flow, AFTER the writes they describe. */
function announce(effect: BatchEffect): void {
  raiseConflicts(effect.notices);
  const { flagOverAllowance } = useSyncWarningsStore.getState();
  for (const tripId of effect.overAllowanceTripIds) flagOverAllowance(tripId);
}

// ---------------------------------------------------------------------------
// The cycle
// ---------------------------------------------------------------------------

/** Apply one batch's verdicts. What was applied is announced even if a later verdict throws. */
function applyBatch(
  ctx: SyncContext,
  table: SyncTable,
  batch: readonly Prepared[],
  results: readonly PushResult[],
  tally: Tally,
): boolean {
  const effect: BatchEffect = {
    regenerated: false,
    notices: [],
    overAllowanceTripIds: [],
  };
  const scope: BatchScope = { db: ctx.db, table, now: nowIso(), effect, tally };
  const sent = new Map(batch.map((item) => [item.id, item.updatedAt]));
  try {
    for (const result of results) {
      const sentUpdatedAt = sent.get(result.id);
      if (sentUpdatedAt !== undefined) applyResult(scope, result, sentUpdatedAt);
    }
  } finally {
    announce(effect);
  }
  return effect.regenerated;
}

/** Send one table's batches. Returns whether any row was re-keyed. */
async function pushBatches(
  ctx: SyncContext,
  table: SyncTable,
  tally: Tally,
): Promise<boolean> {
  let regenerated = false;
  for (const batch of batches(prepare(ctx.db, table))) {
    assertCurrent(ctx);
    const request = buildPushRequest(
      table,
      batch.map((item) => item.record),
    );
    const response = await apiFetch(PushResponse, '/sync/push', {
      method: 'POST',
      body: request,
    });
    assertCurrent(ctx);
    regenerated = applyBatch(ctx, table, batch, response.results, tally) || regenerated;
  }
  return regenerated;
}

/** One table, once — and once more if rows were re-keyed, so their children need not wait a cycle. */
async function pushTable(
  ctx: SyncContext,
  table: SyncTable,
  tally: Tally,
): Promise<void> {
  for (let pass = 0; pass < 2; pass += 1) {
    if (!(await pushBatches(ctx, table, tally))) return;
  }
}

/** Refresh the repair surface's list from the persisted `sync_parked` table. */
export function publishParked(db: SyncContext['db']): void {
  const parked = syncRepository.listParked(db).map((entry) => ({
    table: entry.table,
    recordId: entry.recordId,
    reason: entry.reason,
    parkedAt: entry.parkedAt,
  }));
  useSyncWarningsStore.getState().setParked(parked);
}

/**
 * Push every dirty row, parents first. Never throws: a failure is the
 * outcome's `failure`, with whatever was applied before it counted.
 */
export async function pushDirtyRows(ctx: SyncContext): Promise<PushOutcome> {
  const tally: Tally = { pushed: 0, conflicts: 0 };
  try {
    for (const table of SYNC_TABLES) await pushTable(ctx, table, tally);
    return { ...tally, failure: null };
  } catch (error) {
    return { ...tally, failure: classifyFailure(error) };
  } finally {
    // The warnings store belongs to whoever is bound NOW; an abandoned cycle leaves it alone.
    if (ctx.isCurrent()) publishParked(ctx.db);
  }
}
