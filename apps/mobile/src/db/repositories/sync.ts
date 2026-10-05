/**
 * Sync-facing repository operations (tasks.md T131-T133; US6; sync-protocol.md
 * §1-§3; research D-15, D-16).
 *
 * The seven per-story repositories (`trips.ts`, `notes.ts`, ...) are the
 * TRAVELLER's writers: they stamp `updated_at`, set `is_dirty`, and hide
 * tombstones. The sync engine is the other reader and writer of the same
 * tables, and it needs the opposite behaviour: it must see tombstones, it must
 * clean a row without touching `updated_at`, and it must overwrite a row with
 * the server's version. Those operations live here, table-generic, so no
 * traveller-facing repository has to grow a sync back door.
 *
 * Everything is synchronous, like the rest of the Drizzle Expo driver: a
 * `db.transaction` opens `BEGIN`, runs its callback and commits inside one
 * JavaScript turn, so nothing else on the connection can interleave with it.
 *
 * Rules enforced here rather than at each call site:
 *   - a push CLEANS a row with compare-and-set on the `updated_at` the request
 *     was built from (`markPushed`, `replaceIfUnchanged`): an edit made while
 *     the request was in flight keeps the row dirty (Constitution II);
 *   - photos and documents are pushable ONLY once their bytes have arrived
 *     (`upload_state = 'uploaded'`, FR-041); earlier rows stay dirty and are
 *     neither read for push nor counted as unsynced (the upload queue counts
 *     them);
 *   - a PARKED record (`sync_parked`) is not read for push again until its
 *     `updated_at` changes, i.e. until the traveller edits it.
 */
import type { SyncTable } from '@triptrackr/contracts';
import { SYNC_TABLES } from '@triptrackr/contracts';
import { and, asc, eq, getTableColumns, notExists, sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';

import type { AppDatabase } from '@/db/client';
import {
  documents,
  expenseCategories,
  expenses,
  notes,
  photos,
  syncParked,
  syncState,
  tripStops,
  trips,
} from '@/db/schema';

import { nowIso } from './shared';

/** The database or a transaction on it — both expose the same query surface. */
export type SyncExecutor = Pick<
  AppDatabase,
  'select' | 'insert' | 'update' | 'delete' | 'run' | 'all'
>;

/**
 * A row of any mirrored table, as the engine sees it. The named fields exist
 * on all seven tables; the rest are the table's own columns, which the record
 * mapping (`sync/records.ts`) knows by name.
 */
export interface SyncRow {
  id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  is_dirty: boolean;
  synced_at: string | null;
  [column: string]: unknown;
}

export type ParkReason = 'invalid' | 'id_unavailable';

export interface ParkedEntry {
  table: SyncTable;
  recordId: string;
  reason: ParkReason;
  parkedUpdatedAt: string;
  parkedAt: string;
}

const TABLES = {
  trips,
  trip_stops: tripStops,
  expense_categories: expenseCategories,
  notes,
  expenses,
  photos,
  documents,
} as const satisfies Record<SyncTable, SQLiteTable>;

/** Tables whose rows are pushable only once the bytes have arrived (FR-041). */
const BYTE_BACKED: ReadonlySet<SyncTable> = new Set(['photos', 'documents']);

/** Child tables that name their trip in `trip_id`. */
const TRIP_CHILDREN = [tripStops, notes, expenses, photos, documents] as const;

function tableOf(table: SyncTable): SQLiteTable {
  return TABLES[table];
}

function column(table: SyncTable, name: string): SQLiteColumn {
  const found = getTableColumns(tableOf(table))[name];
  if (!found) throw new Error(`Table ${table} has no column ${name}.`);
  return found;
}

/** Rows a push may send: dirty, not parked at this version, bytes arrived. */
function pushable(table: SyncTable, db: SyncExecutor): SQL {
  const conditions: (SQL | undefined)[] = [
    eq(column(table, 'is_dirty'), true),
    notExists(
      db
        .select({ one: sql`1` })
        .from(syncParked)
        .where(
          and(
            eq(syncParked.table_name, table),
            eq(syncParked.record_id, column(table, 'id')),
            eq(syncParked.parked_updated_at, column(table, 'updated_at')),
          ),
        ),
    ),
  ];
  if (BYTE_BACKED.has(table)) {
    conditions.push(eq(column(table, 'upload_state'), 'uploaded'));
  }
  const clause = and(...conditions);
  if (!clause) throw new Error('Unreachable: a push filter always has conditions.');
  return clause;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Dirty rows of `table` the next push may send, oldest first. Tombstones included. */
function dirtyRows(db: SyncExecutor, table: SyncTable): SyncRow[] {
  return db
    .select()
    .from(tableOf(table))
    .where(pushable(table, db))
    .orderBy(asc(column(table, 'updated_at')), asc(column(table, 'id')))
    .all() as SyncRow[];
}

/** One row by id, tombstone or not. */
function findRow(db: SyncExecutor, table: SyncTable, id: string): SyncRow | null {
  const [row] = db
    .select()
    .from(tableOf(table))
    .where(eq(column(table, 'id'), id))
    .all() as SyncRow[];
  return row ?? null;
}

/**
 * Records the server has not acknowledged: dirty rows in the seven mirrored
 * tables. Parked rows COUNT (they are not on the server, and a traveller
 * about to sign out must hear about them); photos and documents whose bytes
 * have not arrived do NOT (the upload queue counts those, and the sign-out
 * guard adds the two numbers).
 */
function countUnsynced(db: SyncExecutor): number {
  return SYNC_TABLES.reduce((total, table) => {
    const conditions = [eq(column(table, 'is_dirty'), true)];
    if (BYTE_BACKED.has(table)) {
      conditions.push(eq(column(table, 'upload_state'), 'uploaded'));
    }
    const [row] = db
      .select({ n: sql<number>`count(*)` })
      .from(tableOf(table))
      .where(and(...conditions))
      .all() as { n: number }[];
    return total + Number(row?.n ?? 0);
  }, 0);
}

/** True when any mirrored table holds a row, tombstones included. */
function hasAnyRow(db: SyncExecutor): boolean {
  return SYNC_TABLES.some((table) => {
    const [row] = db
      .select({ id: column(table, 'id') })
      .from(tableOf(table))
      .limit(1)
      .all();
    return row !== undefined;
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function insertRow(
  db: SyncExecutor,
  table: SyncTable,
  values: Record<string, unknown>,
): void {
  db.insert(tableOf(table)).values(values).run();
}

function updateRow(
  db: SyncExecutor,
  table: SyncTable,
  id: string,
  values: Record<string, unknown>,
): void {
  db.update(tableOf(table))
    .set(values)
    .where(eq(column(table, 'id'), id))
    .run();
}

/**
 * The server applied the version this request carried: clean the row IF it is
 * still that version. Returns whether it was cleaned; `false` means the row was
 * edited while the request was in flight and stays dirty for the next cycle.
 */
function markPushed(
  db: SyncExecutor,
  table: SyncTable,
  id: string,
  sentUpdatedAt: string,
  syncedAt: string,
): boolean {
  const result = db
    .update(tableOf(table))
    .set({ is_dirty: false, synced_at: syncedAt })
    .where(
      and(eq(column(table, 'id'), id), eq(column(table, 'updated_at'), sentUpdatedAt)),
    )
    .run();
  return result.changes > 0;
}

/**
 * Overwrite a row with the server's version and clean it, IF it is still the
 * version the request carried. Same compare-and-set as `markPushed`: a newer
 * local edit is not replaced by a verdict about an older one.
 */
function replaceIfUnchanged(
  db: SyncExecutor,
  table: SyncTable,
  id: string,
  sentUpdatedAt: string,
  values: Record<string, unknown>,
): boolean {
  const result = db
    .update(tableOf(table))
    .set(values)
    .where(
      and(eq(column(table, 'id'), id), eq(column(table, 'updated_at'), sentUpdatedAt)),
    )
    .run();
  return result.changes > 0;
}

/**
 * Give a row a new identity and re-point everything that names the old one,
 * in ONE transaction (research D-15; sync-protocol.md §2, `id_unavailable`).
 *
 *   trip     -> `trip_id` on its stops, notes, expenses, photos, documents
 *   category -> `expenses.category_id`
 *   photo    -> `trips.cover_photo_id`
 *
 * A trip is re-keyed by inserting the new row, re-pointing the children, then
 * deleting the old row, because `trip_id` is a real foreign key and the parent
 * key cannot be changed in place while children reference it. Re-pointed
 * children stay (or become) dirty so the next push carries the new parent id;
 * `updated_at` is deliberately not stamped anywhere — the content did not
 * change, and last-write-wins must not be perturbed.
 */
function regenerateId(
  db: AppDatabase,
  table: SyncTable,
  oldId: string,
  newId: string,
): void {
  db.transaction((tx) => {
    const old = findRow(tx, table, oldId);
    if (!old) throw new Error(`Cannot re-key ${table} ${oldId}: the row is gone.`);

    if (table === 'trips') rekeyTrip(tx, old, newId);
    else updateRow(tx, table, oldId, { id: newId });

    if (table === 'expense_categories') {
      tx.update(expenses)
        .set({ category_id: newId, is_dirty: true })
        .where(eq(expenses.category_id, oldId))
        .run();
    }
    if (table === 'photos') {
      tx.update(trips)
        .set({ cover_photo_id: newId, is_dirty: true })
        .where(eq(trips.cover_photo_id, oldId))
        .run();
    }
    tx.delete(syncParked)
      .where(and(eq(syncParked.table_name, table), eq(syncParked.record_id, oldId)))
      .run();
  });
}

function rekeyTrip(tx: SyncExecutor, old: SyncRow, newId: string): void {
  insertRow(tx, 'trips', { ...old, id: newId });
  for (const child of TRIP_CHILDREN) {
    tx.update(child)
      .set({ trip_id: newId, is_dirty: true })
      .where(eq(child.trip_id, old.id))
      .run();
  }
  tx.delete(trips).where(eq(trips.id, old.id)).run();
}

// ---------------------------------------------------------------------------
// Parked records
// ---------------------------------------------------------------------------

/** Stop sending this version of the record until the traveller edits it. */
function park(
  db: SyncExecutor,
  table: SyncTable,
  id: string,
  updatedAt: string,
  reason: ParkReason,
): void {
  const entry = {
    table_name: table,
    record_id: id,
    parked_updated_at: updatedAt,
    reason,
    parked_at: nowIso(),
  };
  db.insert(syncParked)
    .values(entry)
    .onConflictDoUpdate({
      target: [syncParked.table_name, syncParked.record_id],
      set: entry,
    })
    .run();
}

function unpark(db: SyncExecutor, table: SyncTable, id: string): void {
  db.delete(syncParked)
    .where(and(eq(syncParked.table_name, table), eq(syncParked.record_id, id)))
    .run();
}

/**
 * The parked records that are still in force: the row is still dirty and still
 * the version that was refused. An entry whose row has since been edited,
 * synced or removed is stale and is deleted here rather than reported.
 */
function listParked(db: SyncExecutor): ParkedEntry[] {
  const entries = db.select().from(syncParked).orderBy(asc(syncParked.parked_at)).all();
  const inForce: ParkedEntry[] = [];
  for (const entry of entries) {
    const table = entry.table_name as SyncTable;
    const row = SYNC_TABLES.includes(table) ? findRow(db, table, entry.record_id) : null;
    if (row && row.is_dirty && row.updated_at === entry.parked_updated_at) {
      inForce.push({
        table,
        recordId: entry.record_id,
        reason: entry.reason,
        parkedUpdatedAt: entry.parked_updated_at,
        parkedAt: entry.parked_at,
      });
    } else {
      db.delete(syncParked)
        .where(
          and(
            eq(syncParked.table_name, entry.table_name),
            eq(syncParked.record_id, entry.record_id),
          ),
        )
        .run();
    }
  }
  return inForce;
}

// ---------------------------------------------------------------------------
// Local-only key/value state
// ---------------------------------------------------------------------------

function getState(db: SyncExecutor, key: string): string | null {
  const [row] = db.select().from(syncState).where(eq(syncState.key, key)).all();
  return row?.value ?? null;
}

function setState(db: SyncExecutor, key: string, value: string): void {
  db.insert(syncState)
    .values({ key, value })
    .onConflictDoUpdate({ target: syncState.key, set: { value } })
    .run();
}

// ---------------------------------------------------------------------------
// Foreign keys
// ---------------------------------------------------------------------------

/**
 * Run `apply` with foreign-key enforcement suspended, restoring the connection's
 * previous setting afterwards.
 *
 * WHY: a pull pages by `(updated_at, id)` across all seven tables, not by
 * dependency, so a note can arrive on an earlier page than the trip it belongs
 * to (the trip was edited later). `PRAGMA foreign_keys` is a no-op INSIDE a
 * transaction and `defer_foreign_keys` still fails the COMMIT of the page that
 * holds the orphan, so the setting is changed around the transaction. The
 * whole sequence is synchronous — the Drizzle Expo driver blocks the JS thread
 * for it — so no other JavaScript on the connection runs while enforcement is
 * off. `foreignKeyViolations` audits the result once the pull is complete.
 */
function withForeignKeysSuspended<T>(db: SyncExecutor, apply: () => T): T {
  const [setting] = db.all(sql`PRAGMA foreign_keys`) as { foreign_keys: number }[];
  const wasOn = Number(setting?.foreign_keys ?? 1) === 1;
  if (wasOn) db.run(sql`PRAGMA foreign_keys = OFF`);
  try {
    return apply();
  } finally {
    if (wasOn) db.run(sql`PRAGMA foreign_keys = ON`);
  }
}

/** Rows whose parent is missing: `PRAGMA foreign_key_check`. */
function foreignKeyViolations(db: SyncExecutor): number {
  return db.all(sql`PRAGMA foreign_key_check`).length;
}

export const syncRepository = {
  dirtyRows,
  findRow,
  countUnsynced,
  hasAnyRow,
  insertRow,
  updateRow,
  markPushed,
  replaceIfUnchanged,
  regenerateId,
  park,
  unpark,
  listParked,
  getState,
  setState,
  withForeignKeysSuspended,
  foreignKeyViolations,
};
