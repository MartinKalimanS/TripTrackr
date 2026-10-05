import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  SYNC_TABLES,
  Uuid,
  type PullChanges,
  type PullQuery,
  type PullResponse,
  type SyncTable,
} from '@triptrackr/contracts';

import { apiError } from '@/common/errors/api-error';

import {
  START_CURSOR,
  decodeCursor,
  encodeCursor,
  tableRank,
  type PullCursor,
} from './pull-cursor';
import { PullReaders, type KeyedRow, type PullRecords } from './pull-readers';

/** Rows per `GET /sync/pull` page (sync-protocol.md §1). */
export const PULL_PAGE_SIZE = 500;

/** DI token for the page size, so a suite can page with three rows instead of 501. */
export const PULL_PAGE_LIMIT = Symbol('PULL_PAGE_LIMIT');

/** One fetched row, tagged with the table it came from, awaiting the merge. */
interface Candidate {
  readonly table: SyncTable;
  readonly row: KeyedRow;
}

const VALIDATION_MESSAGE =
  'Some of the information provided is not valid. Please check it and try again.';

const invalidCursor = () =>
  apiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', VALIDATION_MESSAGE, {
    issues: [{ path: 'cursor', message: 'Unrecognised cursor' }],
  });

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The feed's total order: `(updated_at, id)`, then the table. Instants are
 * fixed-width UTC text and ids are PostgreSQL's lower-case uuid text, so string
 * order is the order the database sorts by.
 */
function byPosition(a: Candidate, b: Candidate): number {
  return (
    compare(a.row.updatedAt, b.row.updatedAt) ||
    compare(a.row.id, b.row.id) ||
    tableRank(a.table) - tableRank(b.table)
  );
}

/** Each requested table once, in dependency order — the order `SYNC_TABLES` states. */
function requestedTables(tables: PullQuery['tables']): SyncTable[] {
  const wanted = new Set(tables ?? SYNC_TABLES);

  return SYNC_TABLES.filter((table) => wanted.has(table));
}

/**
 * `GET /sync/pull` (sync-protocol.md §1; FR-039, FR-042; research D-16;
 * tasks.md T127).
 *
 * **The merge.** Each requested table is asked for the same thing — the rows
 * after the cursor in `(updated_at, id)` order, `limit + 1` of them — and the
 * answers are merged by the same key with the table as the final tie-break. The
 * first `limit` of the merge are the page. `limit + 1` from every table is
 * enough: a table that has more than `limit` rows to give fills the page on its
 * own, and one that has fewer has given everything it has. `has_more` is true
 * exactly when the merge held more than a page, and `next_cursor` is the
 * position of the last row returned — so a client that stores it after every
 * page resumes exactly where it stopped, and a row is neither skipped nor
 * repeated however many share an instant (pull-cursor.ts; SC-011).
 *
 * **Nothing returned.** `next_cursor` is still a non-empty token: the one the
 * caller sent, or the start-of-history sentinel for a snapshot of nothing. A
 * device that polls an idle feed keeps its position and never loses it.
 *
 * **No cursor means a full snapshot**, from the sentinel, through the same code
 * path as every later page — tombstones included in both, because a device
 * coming back after a long absence must be told what was deleted in it too
 * (FR-039, FR-042).
 *
 * `readOne` is the same row, in the same shape, for the push path: the `conflict`
 * verdict's `server_version` (sync-protocol.md §2) is produced by the readers
 * that produce the feed, not by a second serialiser.
 *
 * Visibility posture: owner-only. The readers run under RLS and narrow it to the
 * traveller's own trips (pull-readers.ts); `expenses` and `documents` have no
 * visibility field and no public policy, and this adds neither. The response
 * carries a passenger name from documents, so the controller marks it `no-store`.
 */
@Injectable()
export class PullService {
  constructor(
    private readonly readers: PullReaders,
    @Inject(PULL_PAGE_LIMIT) private readonly pageSize: number,
  ) {}

  async pull(query: PullQuery): Promise<PullResponse> {
    const cursor = this.resolveCursor(query.cursor);
    const tables = requestedTables(query.tables);

    const fetched = await this.fetchAfter(tables, cursor);
    const merged = [...fetched].sort(byPosition);
    const page = merged.slice(0, this.pageSize);
    const last = page.at(-1);

    return {
      changes: await this.materialise(page),
      next_cursor: last
        ? encodeCursor({
            updatedAt: last.row.updatedAt,
            id: last.row.id,
            table: last.table,
          })
        : (query.cursor ?? encodeCursor(START_CURSOR)),
      has_more: merged.length > this.pageSize,
    };
  }

  /**
   * One row of `table`, in that table's pull shape, tombstones included, or null
   * when the caller cannot see it. The push service's `conflict` result carries
   * this as `server_version`, so the wire shape of a stored row is produced in
   * exactly one place.
   *
   * Another traveller's row is not visible: the readers' owner predicate and
   * RLS both hide it, so an id that is someone else's answers exactly as an id
   * that does not exist. An `id` that is not a uuid is null too, rather than a
   * SQL error that would poison the caller's transaction.
   */
  async readOne(table: SyncTable, id: string): Promise<Record<string, unknown> | null> {
    if (!Uuid.safeParse(id).success) return null;

    const reader = this.readers.of(table);
    const row = await reader.fetchOne(id);
    if (!row) return null;

    const [record] = await reader.toRecords([row]);

    return record ?? null;
  }

  private resolveCursor(token: string | undefined): PullCursor {
    if (token === undefined) return START_CURSOR;

    const cursor = decodeCursor(token);
    if (!cursor) throw invalidCursor();

    return cursor;
  }

  /** `limit + 1` rows per table, one table at a time on the request's one connection. */
  private async fetchAfter(
    tables: readonly SyncTable[],
    cursor: PullCursor,
  ): Promise<Candidate[]> {
    const candidates: Candidate[] = [];

    for (const table of tables) {
      const rows = await this.readers.of(table).fetchAfter(cursor, this.pageSize + 1);
      candidates.push(...rows.map((row) => ({ table, row })));
    }

    return candidates;
  }

  /** The page's rows as wire records, grouped by table; a table with none is `[]`. */
  private async materialise(page: readonly Candidate[]): Promise<PullChanges> {
    const records = async <T extends SyncTable>(table: T): Promise<PullRecords[T][]> => {
      const rows = page.filter((c) => c.table === table).map((c) => c.row);

      return rows.length === 0 ? [] : this.readers.of(table).toRecords(rows);
    };

    return {
      trips: await records('trips'),
      trip_stops: await records('trip_stops'),
      expense_categories: await records('expense_categories'),
      notes: await records('notes'),
      expenses: await records('expenses'),
      photos: await records('photos'),
      documents: await records('documents'),
    };
  }
}
