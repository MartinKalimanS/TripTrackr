import type { PushRejection } from '@triptrackr/contracts';

/**
 * How a record's push fails, and what each failure says to the device
 * (sync-protocol.md §2; tasks.md T128, T199).
 *
 * A record is refused by THROWING, never by returning: every record runs in a
 * SAVEPOINT (push.service.ts), and a throw is what rolls it back. That is how
 * "apply nothing for a rejected record" is kept even when the refusal is
 * discovered after a write — a refused record leaves no partial row, no
 * half-refreshed trip status.
 */

/** A refusal the push itself decided, with the reason the device is told. */
export class RecordRefusal extends Error {
  constructor(readonly reason: PushRejection) {
    super(`Record refused: ${reason}`);
    this.name = 'RecordRefusal';
  }
}

/**
 * A failure nobody chose, reduced to what is safe to log and rethrow.
 *
 * Drizzle's `DrizzleQueryError` carries the failed statement AND its bound
 * parameters in its message — for a note, the traveller's text. This replaces it
 * at the boundary of the push so the stack the exception filter logs names a
 * table, a record id and a SQLSTATE, and nothing the record said. The original
 * error is deliberately not attached as `cause`.
 */
export class PushFailure extends Error {
  constructor(table: string, recordId: string, sqlState: string | undefined) {
    super(`Push of ${table} ${recordId} failed (SQLSTATE ${sqlState ?? 'none'}).`);
    this.name = 'PushFailure';
  }
}

/**
 * The SQLSTATE of a database error, however it is wrapped. postgres.js raises a
 * `PostgresError` with `code`; Drizzle wraps it in a `DrizzleQueryError` whose
 * `cause` is that error.
 */
export function sqlStateOf(error: unknown): string | undefined {
  let current: unknown = error;

  for (
    let depth = 0;
    depth < 4 && typeof current === 'object' && current !== null;
    depth++
  ) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = cause;
  }

  return undefined;
}

/**
 * The reason a failed record is reported with, or null when the failure is not
 * one the device caused and must surface as a server error.
 *
 *   - 23505 unique violation, 42501 RLS violation → `id_unavailable`: the id is
 *     held by a row this traveller cannot see (sync-protocol.md §2, "Identity
 *     cannot be hijacked"). Both map to one answer that names nothing of the
 *     other row. The pre-checks make both rare; this is the backstop for the
 *     race they cannot close.
 *   - class 22 (data exception: a NUL byte in text, a date out of range, a
 *     number out of range), 23502 (not null), 23503 (foreign key), 23514
 *     (check) → `invalid`: the value cannot be stored as sent.
 */
export function refusalFor(error: unknown): PushRejection | null {
  if (error instanceof RecordRefusal) return error.reason;

  const state = sqlStateOf(error);
  if (state === undefined) return null;
  if (state === '23505' || state === '42501') return 'id_unavailable';
  if (state.startsWith('22') || ['23502', '23503', '23514'].includes(state)) {
    return 'invalid';
  }

  return null;
}
