/**
 * THE conflict rule of `POST /sync/push` — the only implementation of it in the
 * system (FR-040, Constitution II, research D-02; sync-protocol.md §2).
 *
 * Every table's push path goes through {@link resolveConflict}, via the one
 * driver in `push-apply.ts`. Nothing else in the API compares two `updated_at`
 * values to decide which of two edits survives: the moment a second
 * implementation exists, the two-device outcome depends on which table an edit
 * happened to touch.
 *
 * ## The rule
 *
 *   1. **No stored row** → `insert`, keeping the incoming timestamp.
 *   2. **A live stored row, a live incoming record**
 *        - incoming strictly newer            → `apply`
 *        - equal timestamp, identical payload → `noop` (the lost-response retry
 *          of a push: the same request answered the same way, nothing written,
 *          `updated_at` not re-touched; sync-protocol.md §2 "Idempotent by id")
 *        - equal timestamp, different payload → `conflict` (the stored row wins)
 *        - older                              → `conflict`
 *   3. **A tombstone incoming** (`deleted: true`) **over a live stored row** →
 *      `apply`, *whatever the timestamps*. A delete is an ordinary change
 *      (FR-039) that wins over a concurrent edit.
 *   4. **A tombstoned stored row** is terminal:
 *        - a live incoming record, however new → `conflict` carrying the
 *          tombstone, so the device that edited learns the record is gone;
 *        - a tombstone incoming                → `noop` (already deleted).
 *
 * ## Why a tombstone is terminal and wins (rules 3 and 4)
 *
 * The acceptance suite's scenario 12 — "delete a record on one device while
 * editing it on another" — expects "a deterministic outcome; no resurrection"
 * (sync-protocol.md §6), and FR-039 says a record deleted on one device "does
 * not reappear from another". Plain last-write-wins over the whole row cannot
 * give both:
 *
 * ```
 * device A deletes at 10:00:00     device B edits at 10:00:30
 * A syncs first  → tombstone stored → B's edit: is it newer? yes → resurrects it
 * B syncs first  → edit stored      → A's delete: is it older? yes → refused
 * ```
 *
 * Pure last-write-wins lets the answer depend on who synced first, and letting
 * a newer edit clear a tombstone is precisely the resurrection FR-039 forbids.
 * With rules 3 and 4 the record ends up deleted in both orders. The price is
 * that an edit typed on a device that had not yet seen the deletion is
 * superseded by it — and that device is told (`conflict` on its push; a
 * tombstone on its next pull), which is what FR-040 asks of a superseded
 * device. The alternative loses a deletion the traveller made deliberately;
 * this one loses an edit to a record they chose to remove.
 *
 * ## Timestamps
 *
 * Compared as instants at the wire's millisecond precision: the device echoes
 * back what `/sync/pull` gave it, and a pulled value has been truncated to
 * milliseconds, so a microsecond-precision stored value must not make every
 * echo look older than itself.
 *
 * A tombstone that wins over a newer live row is stored one millisecond after
 * that row ({@link resolveConflict}'s `updatedAt`), never at its own older
 * timestamp: another device's pull cursor may already be past the stored
 * version, and a change that sorts before the cursor is a change it never sees.
 */

/**
 * How far ahead of the server's clock an incoming `updated_at` may be before it
 * is treated as a wrong device clock (sync-protocol.md §2, "Server clock
 * decides, not device clock").
 *
 * The protocol says "a tolerance" and does not give one, so this is the value
 * this implementation chose: five minutes. It is wide enough that ordinary
 * skew — a phone whose network time is a minute or two off, a device that
 * last synced its clock before a long flight — never trips it, and narrow
 * enough that a clock set a day ahead cannot win every conflict it touches.
 * Timestamps in the PAST are never altered: an old clock loses conflicts, which
 * is the conservative direction.
 */
export const SYNC_CLOCK_TOLERANCE_MS = 5 * 60 * 1000;

/** What clamping did to one incoming timestamp. */
export interface ClockClamp {
  /** The value to compare and to store: the incoming one, or the receipt time. */
  readonly updatedAt: Date;
  readonly clamped: boolean;
  /**
   * Incoming minus receipt, in whole seconds — positive when the device claims
   * to be ahead. Reported whether or not it was clamped, for the log line.
   */
  readonly skewSeconds: number;
}

/**
 * Clamps an incoming `updated_at` that is more than `toleranceMs` ahead of the
 * server's receipt time down to the receipt time. Pure; the caller logs.
 */
export function clampToServerClock(
  incoming: Date,
  receivedAt: Date,
  toleranceMs: number = SYNC_CLOCK_TOLERANCE_MS,
): ClockClamp {
  const skewMs = incoming.getTime() - receivedAt.getTime();
  const skewSeconds = Math.round(skewMs / 1000);

  return skewMs > toleranceMs
    ? { updatedAt: receivedAt, clamped: true, skewSeconds }
    : { updatedAt: incoming, clamped: false, skewSeconds };
}

/** The two facts of a row the rule reads. */
export interface RowVersion {
  readonly updatedAt: Date;
  readonly deleted: boolean;
}

/**
 * What the rule decided. `apply` and `insert` carry the `updated_at` to store;
 * `noop` and `conflict` write nothing.
 */
export type InsertVerdict = { readonly verdict: 'insert'; readonly updatedAt: Date };
export type ExistingVerdict =
  | { readonly verdict: 'apply'; readonly updatedAt: Date }
  | { readonly verdict: 'noop' }
  | { readonly verdict: 'conflict' };
export type ConflictVerdict = InsertVerdict | ExistingVerdict;

/**
 * Decides one incoming record against the stored row (or none).
 *
 * `samePayload` is lazy: it is only asked when the timestamps tie, because it
 * can be expensive (a document's sealed fields must be opened to be compared).
 * It compares the columns the device authors, after the table has set aside
 * the ones a push may not change.
 *
 * The overloads say what the body guarantees: no stored row is always an
 * `insert`, and a stored row is never one.
 */
export function resolveConflict(
  stored: null,
  incoming: RowVersion,
  samePayload: () => boolean,
): InsertVerdict;
export function resolveConflict(
  stored: RowVersion,
  incoming: RowVersion,
  samePayload: () => boolean,
): ExistingVerdict;
export function resolveConflict(
  stored: RowVersion | null,
  incoming: RowVersion,
  samePayload: () => boolean,
): ConflictVerdict;
export function resolveConflict(
  stored: RowVersion | null,
  incoming: RowVersion,
  samePayload: () => boolean,
): ConflictVerdict {
  if (stored === null) return { verdict: 'insert', updatedAt: incoming.updatedAt };

  if (stored.deleted) return { verdict: incoming.deleted ? 'noop' : 'conflict' };

  if (incoming.deleted) {
    return {
      verdict: 'apply',
      updatedAt: laterThan(incoming.updatedAt, stored.updatedAt),
    };
  }

  const incomingMs = incoming.updatedAt.getTime();
  const storedMs = stored.updatedAt.getTime();

  if (incomingMs > storedMs) return { verdict: 'apply', updatedAt: incoming.updatedAt };
  if (incomingMs === storedMs && samePayload()) return { verdict: 'noop' };

  return { verdict: 'conflict' };
}

/** `candidate`, or one millisecond after `floor` when `candidate` does not clear it. */
function laterThan(candidate: Date, floor: Date): Date {
  return candidate.getTime() > floor.getTime()
    ? candidate
    : new Date(floor.getTime() + 1);
}
