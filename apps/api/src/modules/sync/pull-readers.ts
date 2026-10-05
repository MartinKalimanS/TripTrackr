import { Injectable } from '@nestjs/common';
import type {
  DocumentPullRecord,
  ExpenseCategoryPullRecord,
  ExpensePullRecord,
  NotePullRecord,
  PhotoPullRecord,
  SyncTable,
  TripPullRecord,
  TripStatus,
  TripStopPullRecord,
} from '@triptrackr/contracts';
import { asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable, SelectedFields } from 'drizzle-orm/pg-core';

import { rlsDb } from '@/common/db/rls-db';
import { includingDeleted, liveOnly } from '@/common/db/soft-delete.scope';
import { requireCurrentUserId } from '@/common/rls/rls-context';
import {
  documents,
  expenseCategories,
  expenses,
  notes,
  photos,
  tripStops,
  trips,
} from '@/db/schema';
import { BoardingPassService } from '@/modules/documents/boarding-pass.service';
import { deriveTripStatus, todayIsoDate } from '@/modules/trips/trip-status.service';

import { tieAlreadyServed, type PullCursor } from './pull-cursor';
import {
  CATEGORY_COLUMNS,
  DOCUMENT_COLUMNS,
  EXPENSE_COLUMNS,
  NOTE_COLUMNS,
  PHOTO_COLUMNS,
  STOP_COLUMNS,
  TRIP_COLUMNS,
  toCategoryRecord,
  toDocumentRecord,
  toExpenseRecord,
  toNoteRecord,
  toPhotoRecord,
  toStopRecord,
  toTripRecord,
  type CategoryRow,
  type DocumentRow,
  type ExpenseRow,
  type NoteRow,
  type PhotoRow,
  type StopRow,
  type TripRow,
} from './sync-records';

/**
 * One reader per synchronised table (sync-protocol.md §1; tasks.md T127;
 * research D-16) — the queries behind `GET /sync/pull` and
 * `PullService.readOne`, and nothing else.
 *
 * **Tombstones are read here, and only here.** Every query goes through
 * `includingDeleted(...)`, which does nothing at runtime and says, where a
 * reviewer will see it, that the `deleted_at IS NULL` every other read path
 * applies is deliberately absent (common/db/soft-delete.scope.ts). The one
 * query in this file that does filter — the stops a trip's `status` is derived
 * from — uses `liveOnly`, because a deleted stop is not part of a trip's dates.
 *
 * **RLS is the authority; the owner predicate narrows it.** Every query runs on
 * the request's RLS transaction (`rlsDb()`), so `trips_owner_all` and its
 * children decide what exists for the caller. The policies are permissive and
 * are OR-ed with the public-read ones (0005), so under RLS alone a pull would
 * also carry any other traveller's *public* trip, its stops, its public notes
 * and its approved public photos. A pull is the traveller's own mirror, so each
 * query adds "on a trip I own" (or, for categories, "a category I own") as a
 * further condition — exactly what the owner routes do (trips.repository.ts).
 * That condition is confirmation, never a substitute: removing it would widen
 * the feed to what RLS already lets the caller read, and dropping RLS would
 * still leave every owner policy in place below it.
 *
 * **Paging and identity.** `fetchAfter` returns the rows strictly after the
 * cursor in `(updated_at, id)` order, where "strictly after" for a row tied with
 * the cursor on both keys depends on the table (pull-cursor.ts). `fetchOne` is
 * the same predicate on `id`, which is what makes `readOne` unable to disclose a
 * row the caller does not own: an id held by another traveller matches nothing.
 *
 * Rows are fetched as raw, text-timestamped rows and turned into wire records in
 * a second step, `toRecords`, so the work that needs more than the row — a
 * trip's derived status, a document's unsealed fields — happens only for the
 * rows a page actually serves.
 */

/** The two keys every row is ordered and cursored by. */
export interface KeyedRow {
  readonly id: string;
  /** `updated_at`, UTC text to the microsecond (sync-records.ts `instant`). */
  readonly updatedAt: string;
}

/** The wire record of each table. */
export interface PullRecords {
  readonly trips: TripPullRecord;
  readonly trip_stops: TripStopPullRecord;
  readonly expense_categories: ExpenseCategoryPullRecord;
  readonly notes: NotePullRecord;
  readonly expenses: ExpensePullRecord;
  readonly photos: PhotoPullRecord;
  readonly documents: DocumentPullRecord;
}

export interface TableReader<T extends SyncTable> {
  readonly table: T;
  /** Rows after `cursor` in `(updated_at, id)` order, ascending, at most `limit`. */
  fetchAfter(cursor: PullCursor, limit: number): Promise<KeyedRow[]>;
  /** The caller's own row with this id, tombstone or not — null for anyone else's or none. */
  fetchOne(id: string): Promise<KeyedRow | null>;
  /** Wire records for rows this reader fetched, in the same order. */
  toRecords(rows: readonly KeyedRow[]): Promise<PullRecords[T][]>;
}

/** A table the reader can page: it has `id` and `updated_at` columns. */
type PagedTable = PgTable & { readonly id: PgColumn; readonly updatedAt: PgColumn };

interface ReaderSpec<T extends SyncTable, Row extends KeyedRow> {
  readonly table: T;
  readonly pg: PagedTable;
  readonly columns: SelectedFields;
  /** "This row is the caller's" — built per query, because the caller is per request. */
  readonly scope: () => SQL;
  readonly toRecords: (rows: readonly Row[]) => Promise<PullRecords[T][]>;
}

/**
 * `(updated_at, id)` after the cursor.
 *
 * The leading `updated_at >=` is redundant with the row comparison and is
 * there for the planner: it is a plain range on the `*_updated_at_idx` index
 * every synchronised table has, where a row comparison alone is not.
 *
 * The instant is bound as **text** and cast in SQL: `::text::timestamptz`, not
 * `::timestamptz`. With the latter PostgreSQL infers the parameter's type as
 * `timestamptz`, and postgres.js's own serialiser for that type goes through a
 * JavaScript `Date`, which drops the microseconds this whole cursor exists to
 * keep. Drizzle replaces that serialiser with a pass-through when the pool is
 * built, so the shorter spelling would happen to work under the API — but a
 * guarantee that holds only while a global in another module is set is not
 * one, and the longer spelling holds on any connection.
 */
function keysetAfter(
  { updatedAt, id }: PagedTable,
  cursor: PullCursor,
  table: SyncTable,
): SQL {
  const operator = sql.raw(tieAlreadyServed(cursor, table) ? '>' : '>=');

  return sql`${updatedAt} >= ${cursor.updatedAt}::text::timestamptz
    AND (${updatedAt}, ${id}) ${operator} (${cursor.updatedAt}::text::timestamptz, ${cursor.id}::uuid)`;
}

function defineReader<T extends SyncTable, Row extends KeyedRow>(
  spec: ReaderSpec<T, Row>,
): TableReader<T> {
  const select = () => rlsDb().select(spec.columns).from(spec.pg);

  return {
    table: spec.table,

    async fetchAfter(cursor, limit) {
      const rows = await select()
        .where(includingDeleted(keysetAfter(spec.pg, cursor, spec.table), spec.scope()))
        .orderBy(asc(spec.pg.updatedAt), asc(spec.pg.id))
        .limit(limit);

      // Drizzle types a computed selection as an open record; `columns` is the
      // one selection this reader makes and `Row` is what it selects.
      return rows as unknown as Row[];
    },

    async fetchOne(id) {
      const [row] = await select()
        .where(includingDeleted(eq(spec.pg.id, id), spec.scope()))
        .limit(1);

      return (row as unknown as Row | undefined) ?? null;
    },

    // Only ever handed rows this reader's own `fetchAfter` / `fetchOne` returned.
    toRecords: (rows) => spec.toRecords(rows as readonly Row[]),
  };
}

/** The trips the caller owns — by the predicate, on top of what the policies allow. */
const ownTripIds = () =>
  rlsDb()
    .select({ id: trips.id })
    .from(trips)
    .where(eq(trips.ownerId, requireCurrentUserId()));

const onOwnTrip = (tripId: PgColumn) => () => inArray(tripId, ownTripIds());

/**
 * `status` per trip, derived from its live stops as the trips routes derive it
 * (trips.service.ts → `deriveTripStatus`). A trip with no live stop — including
 * a tombstoned trip, whose stops are tombstoned with it — is `planning`.
 */
async function tripStatuses(
  tripIds: readonly string[],
): Promise<Map<string, TripStatus>> {
  if (tripIds.length === 0) return new Map();

  const stops = await rlsDb()
    .select({
      tripId: tripStops.tripId,
      arrive_date: tripStops.arriveDate,
      depart_date: tripStops.departDate,
    })
    .from(tripStops)
    .where(liveOnly(tripStops, inArray(tripStops.tripId, [...tripIds])));

  const today = todayIsoDate();

  return new Map(
    tripIds.map((tripId) => [
      tripId,
      deriveTripStatus(
        stops.filter((stop) => stop.tripId === tripId),
        today,
      ),
    ]),
  );
}

/**
 * The seven readers (tasks.md T127). Injectable for one dependency only:
 * `BoardingPassService` — the existing home of the document fields' crypto — so
 * a sealed passenger name is opened in one place and never by a second
 * implementation of it here.
 */
@Injectable()
export class PullReaders {
  private readonly readers: { readonly [T in SyncTable]: TableReader<T> };

  constructor(boardingPass: BoardingPassService) {
    this.readers = {
      trips: defineReader<'trips', TripRow>({
        table: 'trips',
        pg: trips,
        columns: TRIP_COLUMNS,
        scope: () => eq(trips.ownerId, requireCurrentUserId()),
        toRecords: async (rows) => {
          const statuses = await tripStatuses(rows.map((row) => row.id));
          return rows.map((row) => toTripRecord(row, statuses.get(row.id) ?? 'planning'));
        },
      }),

      trip_stops: defineReader<'trip_stops', StopRow>({
        table: 'trip_stops',
        pg: tripStops,
        columns: STOP_COLUMNS,
        scope: onOwnTrip(tripStops.tripId),
        toRecords: (rows) => Promise.resolve(rows.map(toStopRecord)),
      }),

      // The caller's custom rows only. The six system rows (user_id IS NULL)
      // are reference data, fetched through GET /expense-categories, never
      // through the feed (sync-protocol.md §1).
      expense_categories: defineReader<'expense_categories', CategoryRow>({
        table: 'expense_categories',
        pg: expenseCategories,
        columns: CATEGORY_COLUMNS,
        scope: () => eq(expenseCategories.userId, requireCurrentUserId()),
        toRecords: (rows) => Promise.resolve(rows.map(toCategoryRecord)),
      }),

      notes: defineReader<'notes', NoteRow>({
        table: 'notes',
        pg: notes,
        columns: NOTE_COLUMNS,
        scope: onOwnTrip(notes.tripId),
        toRecords: (rows) => Promise.resolve(rows.map(toNoteRecord)),
      }),

      expenses: defineReader<'expenses', ExpenseRow>({
        table: 'expenses',
        pg: expenses,
        columns: EXPENSE_COLUMNS,
        scope: onOwnTrip(expenses.tripId),
        toRecords: (rows) => Promise.resolve(rows.map(toExpenseRecord)),
      }),

      photos: defineReader<'photos', PhotoRow>({
        table: 'photos',
        pg: photos,
        columns: PHOTO_COLUMNS,
        scope: onOwnTrip(photos.tripId),
        toRecords: (rows) => Promise.resolve(rows.map(toPhotoRecord)),
      }),

      documents: defineReader<'documents', DocumentRow>({
        table: 'documents',
        pg: documents,
        columns: DOCUMENT_COLUMNS,
        scope: onOwnTrip(documents.tripId),
        toRecords: (rows) =>
          Promise.resolve(
            rows.map((row) =>
              toDocumentRecord(
                row,
                boardingPass.open(
                  { wrappedDek: row.wrappedDek, dekKeyId: row.dekKeyId },
                  row.id,
                  row.parsedSealed,
                ),
              ),
            ),
          ),
      }),
    };
  }

  of<T extends SyncTable>(table: T): TableReader<T> {
    return this.readers[table];
  }
}
