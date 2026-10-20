import type { PushWarning, SyncTable } from '@triptrackr/contracts';

import { isWireInstant } from '@/modules/photos/capture';

import { resolveConflict, type ExistingVerdict, type RowVersion } from './push-conflict';
import { RecordRefusal } from './push-errors';
import type {
  PushedRecord,
  PushTableHandler,
  StoredRow,
  WriteTimes,
} from './push-handler';

/**
 * The one driver every table's push runs through (tasks.md T123, T128).
 *
 * Find the caller's own row, ask `resolveConflict` what to do, do it. Seven
 * tables differ in columns and in which columns a push may change; none of them
 * differs in the order of those three steps or in who makes the decision, so
 * none of them has a copy of this function. A test spies on `resolveConflict`
 * and pushes to every table to hold that line.
 *
 * Refusals are thrown (`RecordRefusal`) so the record's savepoint rolls back
 * whatever was written before the refusal was discovered.
 */

export type ApplyOutcome =
  | { readonly status: 'applied'; readonly warnings: readonly PushWarning[] }
  | { readonly status: 'conflict' };

const APPLIED: ApplyOutcome = { status: 'applied', warnings: [] };

/**
 * A record that passed its table's schema, ready to be applied. The record
 * itself stays inside the closure: the service needs only its identity and the
 * instant it claims, to clamp, and then to call `apply`.
 */
export interface PreparedRecord {
  readonly id: string;
  /** What the device claims, before the clock clamp. */
  readonly claimedAt: Date;
  apply(at: WriteTimes): Promise<ApplyOutcome>;
}

/** A table's handler with its record type erased, so seven can live in one map. */
export interface BoundHandler {
  readonly table: SyncTable;
  /** The record if it satisfies the table's strict schema, otherwise null. */
  prepare(raw: unknown): PreparedRecord | null;
}

export function bindHandler<TRecord extends PushedRecord, TStored extends StoredRow>(
  handler: PushTableHandler<TRecord, TStored>,
): BoundHandler {
  return {
    table: handler.table,
    prepare(raw) {
      const parsed = handler.schema.safeParse(raw);
      if (!parsed.success) return null;

      const record = parsed.data;
      const claimedAt = new Date(record.updated_at);
      // A timestamp the database cannot hold (year 0000, say) is an invalid
      // record, not a server error.
      if (!isWireInstant(claimedAt)) return null;

      return {
        id: record.id,
        claimedAt,
        apply: (at) => applyRecord(handler, record, at),
      };
    },
  };
}

/**
 * Applies one validated record. At most two passes: the second happens only
 * when an insert lost a race on the id and the winner's row is now visible.
 */
export async function applyRecord<
  TRecord extends PushedRecord,
  TStored extends StoredRow,
>(
  handler: PushTableHandler<TRecord, TStored>,
  incoming: TRecord,
  at: WriteTimes,
): Promise<ApplyOutcome> {
  let stored = await handler.lock(incoming.id);

  for (let pass = 0; pass < 2; pass += 1) {
    if (stored !== null) {
      const existing = stored;
      const verdict = resolveConflict(
        versionOf(existing),
        { updatedAt: at.updatedAt, deleted: incoming.deleted },
        () => handler.samePayload(existing, handler.effective(existing, incoming)),
      );

      return enact(handler, verdict, existing, incoming, at);
    }

    const created = await insertNew(handler, incoming, at);
    if (created !== null) return created;

    // The id is taken. If the row that took it is this traveller's own — a
    // concurrent retry of this very push, committed a moment ago — decide
    // against it; if it is not visible, it is someone else's.
    stored = await handler.lock(incoming.id);
    if (stored === null) throw new RecordRefusal('id_unavailable');
  }

  throw new RecordRefusal('id_unavailable');
}

function versionOf(stored: StoredRow): RowVersion {
  return { updatedAt: stored.updatedAt, deleted: stored.deletedAt !== null };
}

/** Writes what the verdict allows against an existing row. */
async function enact<TRecord extends PushedRecord, TStored extends StoredRow>(
  handler: PushTableHandler<TRecord, TStored>,
  verdict: ExistingVerdict,
  stored: TStored,
  incoming: TRecord,
  at: WriteTimes,
): Promise<ApplyOutcome> {
  if (verdict.verdict === 'conflict') return { status: 'conflict' };
  if (verdict.verdict === 'noop') return applied(handler, incoming.id, 'unchanged');

  const times = { ...at, updatedAt: verdict.updatedAt };

  if (incoming.deleted) {
    await handler.tombstone(stored, times);
  } else {
    const effective = handler.effective(stored, incoming);
    await handler.checkReferences(effective);
    await handler.update(stored, effective, times);
  }

  return APPLIED;
}

/**
 * The insert branch. Null means the id was taken and the caller must look
 * again; an outcome means the record is settled.
 */
async function insertNew<TRecord extends PushedRecord, TStored extends StoredRow>(
  handler: PushTableHandler<TRecord, TStored>,
  incoming: TRecord,
  at: WriteTimes,
): Promise<ApplyOutcome | null> {
  // No stored row: the rule answers 'insert', keeping the incoming timestamp.
  const verdict = resolveConflict(
    null,
    { updatedAt: at.updatedAt, deleted: incoming.deleted },
    () => false,
  );

  if (!handler.creates) {
    // Push never creates a photo or a document (FR-041). A delete of one that
    // never registered has nothing to delete and the same end state as success;
    // anything else waits, dirty, for its upload to register it.
    if (incoming.deleted) return APPLIED;
    throw new RecordRefusal('parent_missing');
  }

  await handler.checkReferences(incoming);
  const inserted = await handler.insert(incoming, {
    ...at,
    updatedAt: verdict.updatedAt,
  });

  return inserted ? applied(handler, incoming.id, 'inserted') : null;
}

async function applied<TRecord extends PushedRecord, TStored extends StoredRow>(
  handler: PushTableHandler<TRecord, TStored>,
  id: string,
  event: 'inserted' | 'unchanged',
): Promise<ApplyOutcome> {
  const warnings = (await handler.warnings?.(id, event)) ?? [];

  return warnings.length === 0 ? APPLIED : { status: 'applied', warnings };
}
