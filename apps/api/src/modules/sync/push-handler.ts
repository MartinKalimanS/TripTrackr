import type { PushWarning, SyncTable } from '@triptrackr/contracts';
import type { z } from 'zod';

/**
 * What one table supplies to the push so that the push can be the same for all
 * seven (tasks.md T128).
 *
 * The conflict rule is not in here. A handler knows how to find, compare and
 * write ITS rows; it never decides which of two versions wins. That decision is
 * `resolveConflict` (push-conflict.ts), called once, by the driver in
 * `push-apply.ts`, for every table. Keeping the two apart is what makes "the
 * only implementation of the rule in the system" a structural fact rather than
 * a convention.
 */

/** The three fields every pushed record carries besides its own (contracts `pushMeta`). */
export interface PushedRecord {
  readonly id: string;
  readonly updated_at: string;
  readonly deleted: boolean;
}

/** The facts of a stored row the driver needs, beside the table's own columns. */
export interface StoredRow {
  readonly id: string;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

/**
 * The instants a write stores. `updatedAt` is the verdict's (the incoming value
 * after the clock clamp, or one past a newer row when a tombstone wins over
 * it); `deletedAt` is the server's receipt time, used when the write is a
 * tombstone — the retention window (sync-protocol.md §5) starts when the server
 * learned of the deletion, not when a device that may have been offline for
 * weeks claims to have made it.
 */
export interface WriteTimes {
  readonly updatedAt: Date;
  readonly deletedAt: Date;
}

export interface PushTableHandler<
  TRecord extends PushedRecord,
  TStored extends StoredRow,
> {
  readonly table: SyncTable;

  /** The contracts package's strict `*PushRecord` schema for this table. */
  readonly schema: z.ZodType<TRecord>;

  /**
   * False for `photos` and `documents`: their rows come into being when the
   * object store has confirmed the bytes (FR-041), through the upload channel,
   * and never because a metadata record arrived.
   */
  readonly creates: boolean;

  /**
   * The caller's OWN stored row — tombstones included — locked for the
   * transaction, or null.
   *
   * "Own" is asked for explicitly, through the trip, and not left to RLS: the
   * SELECT policies of `trips`, `trip_stops`, `notes` and `photos` admit rows a
   * stranger may read once they are public, and a stored row that is not the
   * caller's would make the driver answer `conflict` with someone else's fields.
   */
  lock(id: string): Promise<TStored | null>;

  /**
   * The incoming record with the columns a push may not change set back to the
   * stored values (a child's `trip_id`, an expense's `currency`, …), so that
   * comparing, checking and writing all see what will actually be stored.
   */
  effective(stored: TStored, incoming: TRecord): TRecord;

  /** Whether `incoming` would change nothing the device authors on `stored`. */
  samePayload(stored: TStored, incoming: TRecord): boolean;

  /**
   * Refuses, by throwing a `RecordRefusal`, a record whose parents or
   * reference data are missing — before any write. A parent that does not exist
   * and one that is not the caller's are the same refusal.
   */
  checkReferences(incoming: TRecord): Promise<void>;

  /** Inserts; false when the id is already taken (by anyone). */
  insert(incoming: TRecord, at: WriteTimes): Promise<boolean>;

  update(stored: TStored, incoming: TRecord, at: WriteTimes): Promise<void>;

  tombstone(stored: TStored, at: WriteTimes): Promise<void>;

  /** Annotations on an `applied` result. Only trips have any (`over_allowance`). */
  warnings?(id: string, event: 'inserted' | 'unchanged'): Promise<readonly PushWarning[]>;
}
