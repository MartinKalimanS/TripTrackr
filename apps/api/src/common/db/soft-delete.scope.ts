import { and, isNull, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/**
 * `deleted_at IS NULL`, in one place.
 *
 * Tombstones (FR-039) exist so that a delete on one device propagates to another
 * instead of the row quietly reappearing on the next pull. That makes every
 * ordinary read responsible for hiding them, and
 * [contracts/sync-protocol.md](../../../../specs/001-triptrackr-mvp/contracts/sync-protocol.md) §1
 * is explicit about where the filter belongs:
 *
 *   "Soft-deleted rows are returned here, and only here. Every other read path
 *    filters `deleted_at IS NULL`. That filter belongs in a shared repository
 *    scope rather than being retyped per query — a forgotten one resurrects
 *    deleted content."
 *
 * Retyping the predicate per query is the failure mode this file exists to
 * remove. `GET /sync/pull` is the sole read path that must NOT apply it, and it
 * says so by calling {@link includingDeleted} rather than by omitting a call —
 * an exemption that has to be written down is an exemption a reviewer can see.
 */

/** A table with a tombstone column. */
export interface SoftDeletable {
  readonly deletedAt: PgColumn;
}

/**
 * The live-rows-only predicate, combined with whatever else the caller needs.
 *
 * ```ts
 * db.select().from(notes).where(liveOnly(notes, eq(notes.tripId, tripId)));
 * ```
 */
export function liveOnly(table: SoftDeletable, ...conditions: (SQL | undefined)[]): SQL {
  const predicate = and(isNull(table.deletedAt), ...conditions);

  // `and()` returns undefined only when handed nothing at all, which cannot
  // happen here — isNull() is always present. Narrowing it explicitly keeps the
  // return type honest for callers.
  if (!predicate) {
    throw new Error('liveOnly produced an empty predicate, which should be unreachable.');
  }

  return predicate;
}

/**
 * Marks a read as deliberately including tombstones.
 *
 * Returns the caller's conditions untouched — it does nothing at runtime, and
 * that is the point. Its whole value is that `/sync/pull` reads as an explicit
 * exemption rather than as a query that forgot {@link liveOnly}. There is exactly
 * one legitimate caller; a second one is a bug or a spec change.
 */
export function includingDeleted(...conditions: (SQL | undefined)[]): SQL | undefined {
  return and(...conditions);
}
