/**
 * Shared fixtures for the sync-core suites (tasks.md T131-T133): deterministic
 * ids and instants, rows for all seven tables, and pull pages. A REAL SQLite
 * database (test/db/sqlite-harness.ts) holds the rows. The network double is in
 * sync-core-network.ts, kept apart because importing the API client loads
 * Sentry, which suites that never touch the network have no reason to do.
 */
import type { SyncTable } from '@triptrackr/contracts';

import { syncRepository, type SyncRow } from '@/db/repositories/sync';
import {
  documents,
  expenseCategories,
  expenses,
  notes,
  photos,
  tripStops,
  trips,
} from '@/db/schema';
import type { SyncContext } from '@/sync/context';

import { createTestDatabase, type TestSqlite } from '../db/sqlite-harness';

export { createTestDatabase, type TestSqlite };

// ---------------------------------------------------------------------------
// Identity and time
// ---------------------------------------------------------------------------

/** A valid RFC 4122 v4 UUID, deterministic: `uuid(7)`. */
export function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

/** An `IsoDateTime` `minutes` after a fixed morning. */
export function at(minutes: number): string {
  return new Date(Date.UTC(2026, 8, 1, 10, minutes, 0)).toISOString();
}

export const TRIP = uuid(1);
export const CATEGORY = uuid(2);

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

const TABLE_OBJECTS = {
  trips,
  trip_stops: tripStops,
  expense_categories: expenseCategories,
  notes,
  expenses,
  photos,
  documents,
} as const;

/** The columns of a server (pull) version of a record, with sensible defaults. */
export function wire(
  table: SyncTable,
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const meta = { id, created_at: at(0), updated_at: at(1), deleted_at: null };
  const own: Record<SyncTable, Record<string, unknown>> = {
    trips: {
      title: 'Italy',
      home_currency: 'EUR',
      is_public: false,
      cover_photo_id: null,
      status: 'planning',
    },
    trip_stops: {
      trip_id: TRIP,
      city_id: 100,
      sort_order: 0,
      arrive_date: '2026-09-01',
      depart_date: '2026-09-05',
    },
    expense_categories: { name: 'Coffee', icon: null },
    notes: {
      trip_id: TRIP,
      country_id: 1,
      city_id: null,
      title: 'Lisbon',
      body: 'Pastel de nata',
      is_public: false,
    },
    expenses: {
      trip_id: TRIP,
      city_id: null,
      category_id: CATEGORY,
      amount: '12.50',
      currency: 'EUR',
      spent_at: '2026-09-02',
      note: null,
      fx_rate_to_home: null,
      amount_home: null,
      fx_pending: false,
    },
    photos: {
      trip_id: TRIP,
      city_id: null,
      taken_at: null,
      exif_lat: null,
      exif_lng: null,
      is_public: false,
      upload_state: 'uploaded',
      moderation_state: 'pending',
      has_thumbnail: false,
    },
    documents: {
      trip_id: TRIP,
      type: 'boarding_pass',
      parsed_json: null,
      parsed_confirmed_at: null,
      upload_state: 'uploaded',
    },
  };
  return { ...meta, ...own[table], ...overrides };
}

/** Insert a local row: a wire version plus the local-only columns. Clean unless `is_dirty`. */
export function seed(
  sqlite: TestSqlite,
  table: SyncTable,
  id: string,
  overrides: Record<string, unknown> = {},
): SyncRow {
  const local: Record<string, unknown> = {
    ...wire(table, id),
    is_dirty: false,
    synced_at: at(0),
    ...(table === 'photos' || table === 'documents' ? { local_file_uri: null } : {}),
    ...overrides,
  };
  sqlite.db
    .insert(TABLE_OBJECTS[table])
    .values(local as never)
    .run();
  return read(sqlite, table, id);
}

export function read(sqlite: TestSqlite, table: SyncTable, id: string): SyncRow {
  const row = syncRepository.findRow(sqlite.db, table, id);
  if (!row) throw new Error(`fixture: ${table} ${id} not found`);
  return row;
}

export function maybeRead(
  sqlite: TestSqlite,
  table: SyncTable,
  id: string,
): SyncRow | null {
  return syncRepository.findRow(sqlite.db, table, id);
}

/** A parent trip other rows can reference. */
export function seedTrip(sqlite: TestSqlite, overrides: Record<string, unknown> = {}) {
  return seed(sqlite, 'trips', TRIP, overrides);
}

/** The empty page that ends a pull. */
export function emptyChanges(): Record<SyncTable, unknown[]> {
  return {
    trips: [],
    trip_stops: [],
    expense_categories: [],
    notes: [],
    expenses: [],
    photos: [],
    documents: [],
  };
}

/** A `GET /sync/pull` answer holding `changes`. */
export function pullPage(
  changes: Partial<Record<SyncTable, Record<string, unknown>[]>>,
  next: string,
  hasMore: boolean,
) {
  return {
    changes: { ...emptyChanges(), ...changes },
    next_cursor: next,
    has_more: hasMore,
  };
}

export function contextFor(sqlite: TestSqlite, current = () => true): SyncContext {
  return { db: sqlite.db as SyncContext['db'], isCurrent: current };
}
