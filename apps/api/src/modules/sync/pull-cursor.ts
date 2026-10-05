import { SYNC_TABLES, syncTableIndex, type SyncTable } from '@triptrackr/contracts';
import { z } from 'zod';

/**
 * The opaque cursor of `GET /sync/pull` (sync-protocol.md §1; tasks.md T121,
 * T127; SC-011).
 *
 * **What it wraps.** The position of the last row a page served, in the
 * total order the server pages by: `(updated_at, id)`, then the table the row
 * came from. The table is the third key for one reason — `id` is unique per
 * table, not across them, so two rows of different tables can tie on both of
 * the others, and a cursor that could not say which of the two it stopped at
 * would serve one twice or never serve the other.
 *
 * **Microseconds, as text.** `updated_at` is a PostgreSQL `timestamptz`, which
 * keeps microseconds; a JavaScript `Date` keeps milliseconds. A cursor that
 * has been through a `Date` cannot tell two rows in the same millisecond
 * apart, so one is served twice or dropped at a page boundary — and a dropped
 * row is a note that never reaches the traveller's other phone. The instant
 * therefore travels as the text PostgreSQL produced (`to_char`, UTC, six
 * fractional digits), is validated by shape, and is handed back to PostgreSQL
 * as text. No `Date` is constructed from it anywhere.
 *
 * **Opaque, and not signed.** The token is base64url over a small JSON
 * object, so a client cannot usefully read or build one — `decodeCursor`
 * refuses anything it did not produce, field by field — but it is not a
 * secret and is not authenticated. Forging one is pointless rather than
 * dangerous: a pull is scoped to the caller by RLS, so a forged position can
 * only move the forger's own window over the forger's own rows.
 *
 * **Fixed width.** Every instant has exactly six fractional digits and a
 * `Z`, so comparing two as strings is comparing them as times. The merge in
 * `pull.service.ts` relies on that.
 */

export interface PullCursor {
  /** `updated_at` of the last row served, UTC, to the microsecond. */
  readonly updatedAt: string;
  readonly id: string;
  /** The last row's table. Null only for {@link START_CURSOR}: before every table. */
  readonly table: SyncTable | null;
}

/** `YYYY-MM-DDTHH:MM:SS.ffffffZ`; year 0000 does not exist in PostgreSQL. */
const MICRO_INSTANT =
  /^(?!0000)(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)\.\d{6}Z$/;

/** What PostgreSQL prints for a uuid: lower case, hyphenated. */
const DB_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** A real calendar day: the regex admits 02-30, PostgreSQL would raise on it. */
function isCalendarInstant(text: string): boolean {
  const match = MICRO_INSTANT.exec(text);
  if (!match) return false;

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // Used for the calendar only — its milliseconds and the year-0–99 quirk of
  // Date.UTC are irrelevant to a day-of-month check, and the text is what
  // travels on.
  const probe = new Date(Date.UTC(2000, month - 1, day));
  probe.setUTCFullYear(year);

  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/**
 * Strict: a key the server did not write is a refusal, not an ignore, for the
 * reason every contract object here is (contracts/sync/records.ts).
 */
// sync-guard:allow server-private cursor token payload, not a sync record
const CursorPayload = z.strictObject({
  t: z.string().refine(isCalendarInstant, 'Expected a microsecond instant'),
  i: z.string().regex(DB_UUID),
  k: z.enum(SYNC_TABLES).nullable(),
});

/**
 * Before every row of every table: what "no cursor" means, and what an empty
 * snapshot answers with so `next_cursor` is never empty. `table: null` ranks
 * below every table, so even a row stamped exactly at the sentinel instant is
 * after it.
 */
export const START_CURSOR: PullCursor = {
  updatedAt: '0001-01-01T00:00:00.000000Z',
  id: '00000000-0000-0000-0000-000000000000',
  table: null,
};

export function encodeCursor(cursor: PullCursor): string {
  const payload = { t: cursor.updatedAt, i: cursor.id, k: cursor.table };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/** The cursor a token carries, or null for anything the server did not issue. */
export function decodeCursor(token: string): PullCursor | null {
  if (!BASE64URL.test(token)) return null;

  const bytes = Buffer.from(token, 'base64url');
  // `Buffer.from` tolerates stray bits and trailing junk; only the canonical
  // spelling of what `encodeCursor` produced is accepted back.
  if (bytes.toString('base64url') !== token) return null;

  const payload = CursorPayload.safeParse(parseJson(bytes.toString('utf8')));
  if (!payload.success) return null;

  return { updatedAt: payload.data.t, id: payload.data.i, table: payload.data.k };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Position of a table in the tie-break: lower sorts first, `null` before all. */
export function tableRank(table: SyncTable | null): number {
  return table === null ? -1 : syncTableIndex(table);
}

/**
 * Whether a row of `table` that sits at exactly the cursor's `(updated_at, id)`
 * has already been served. It has when the cursor's table ranks at or after
 * `table`; it has not when `table` ranks after the cursor's.
 */
export function tieAlreadyServed(cursor: PullCursor, table: SyncTable): boolean {
  return tableRank(table) <= tableRank(cursor.table);
}
