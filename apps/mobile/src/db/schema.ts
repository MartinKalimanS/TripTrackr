/**
 * On-device schema — tasks.md T041 (data-model.md §10, research D-01, D-13, D-15, D-16).
 *
 * The seven tables in `SYNC_TABLES` are mirrored column-for-column from the
 * `*PullRecord` shapes in `@triptrackr/contracts`, plus three local-only
 * columns the sync engine (US6) drives:
 *
 *   - `is_dirty`   set on every local write, cleared when the server confirms
 *   - `synced_at`  when the server last acknowledged the row; null = never pushed
 *   - `local_file_uri` (photos, documents) where the bytes live until uploaded
 *
 * Identity is the client-generated UUID `id` (D-15) — there is no `server_id`.
 * Timestamps and dates are ISO-8601 strings exactly as they travel on the
 * wire, so a row can be pushed without conversion. Booleans are stored as
 * SQLite integers 0/1 and surfaced as booleans by Drizzle's `mode: 'boolean'`.
 *
 * `countries` and `cities` are read-only caches of the lookups endpoints
 * (rest-api.md §11) so the city picker works in aeroplane mode. They are
 * refreshed, never pushed, and nothing declares a foreign key INTO them: a
 * stop pulled from the server may name a city this device has never cached,
 * and that must not be a constraint violation. Foreign keys exist only where
 * the sync protocol guarantees the parent arrives first — `trip_id` → `trips`
 * (sync-protocol.md §2, "parents before children").
 *
 * Migrations are generated from this file with `npx drizzle-kit generate`
 * (drizzle.config.ts → src/db/migrations/) and bundled into the app
 * (https://orm.drizzle.team/docs/connect-expo-sqlite). Never hand-edit a
 * generated migration; change this file and generate the next one.
 *
 * The `LocalMirrorChecks` type at the foot of the file is a compile-time proof
 * that every mirrored row type still satisfies its wire record. Adding a wire
 * column without a local one — or drifting a type — fails `tsc`, not a sync.
 */
import type {
  DocumentParsedFields,
  DocumentPullRecord,
  ExpenseCategoryPullRecord,
  ExpensePullRecord,
  NotePullRecord,
  PhotoPullRecord,
  TripPullRecord,
  TripStopPullRecord,
} from '@triptrackr/contracts';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// Shared column groups
// ---------------------------------------------------------------------------

const wireMeta = {
  id: text().primaryKey(),
  created_at: text().notNull(),
  updated_at: text().notNull(),
  /** Tombstone (FR-039). Every read path except the sync engine filters this. */
  deleted_at: text(),
};

const localMeta = {
  is_dirty: integer({ mode: 'boolean' }).notNull().default(true),
  synced_at: text(),
};

const tripStatus = ['planning', 'active', 'past'] as const;
const uploadState = ['pending', 'uploaded', 'failed'] as const;
const moderationState = ['pending', 'approved', 'rejected'] as const;
const documentType = ['boarding_pass', 'booking', 'other'] as const;

// ---------------------------------------------------------------------------
// Mirrored tables — SYNC_TABLES, in dependency order
// ---------------------------------------------------------------------------

export const trips = sqliteTable(
  'trips',
  {
    ...wireMeta,
    title: text().notNull(),
    home_currency: text().notNull(),
    is_public: integer({ mode: 'boolean' }).notNull().default(false),
    cover_photo_id: text(),
    /**
     * Mirrors the server's materialised cache; the UI derives the live value
     * from the stops (`features/trips/trip-status.ts`, FR-013) and never
     * trusts this column when the two disagree.
     */
    status: text({ enum: tripStatus }).notNull().default('planning'),
    ...localMeta,
  },
  (table) => [index('trips_updated_at_idx').on(table.updated_at)],
);

export const tripStops = sqliteTable(
  'trip_stops',
  {
    ...wireMeta,
    trip_id: text()
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    city_id: integer().notNull(),
    sort_order: integer().notNull(),
    arrive_date: text().notNull(),
    depart_date: text().notNull(),
    ...localMeta,
  },
  (table) => [
    index('trip_stops_trip_sort_idx').on(table.trip_id, table.sort_order),
    index('trip_stops_updated_at_idx').on(table.updated_at),
  ],
);

/** Custom categories only — the six system rows are reference data (sync-protocol.md §1). */
export const expenseCategories = sqliteTable(
  'expense_categories',
  {
    ...wireMeta,
    name: text().notNull(),
    icon: text(),
    ...localMeta,
  },
  (table) => [index('expense_categories_updated_at_idx').on(table.updated_at)],
);

export const notes = sqliteTable(
  'notes',
  {
    ...wireMeta,
    trip_id: text()
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    country_id: integer(),
    city_id: integer(),
    title: text(),
    body: text().notNull(),
    is_public: integer({ mode: 'boolean' }).notNull().default(false),
    ...localMeta,
  },
  (table) => [
    index('notes_trip_idx').on(table.trip_id),
    index('notes_updated_at_idx').on(table.updated_at),
  ],
);

/**
 * Owner-only, structurally (Constitution I, FR-027): there is no visibility
 * column here, and the mirror check below would refuse one that appeared on
 * the wire. Money is a decimal string, never a float (SC-016).
 */
export const expenses = sqliteTable(
  'expenses',
  {
    ...wireMeta,
    trip_id: text()
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    city_id: integer(),
    category_id: text().notNull(),
    amount: text().notNull(),
    currency: text().notNull(),
    spent_at: text().notNull(),
    note: text(),
    fx_rate_to_home: text(),
    amount_home: text(),
    fx_pending: integer({ mode: 'boolean' }).notNull().default(false),
    ...localMeta,
  },
  (table) => [
    index('expenses_trip_idx').on(table.trip_id),
    index('expenses_updated_at_idx').on(table.updated_at),
  ],
);

/** Metadata only — bytes travel on the upload channel (sync-protocol.md §4). */
export const photos = sqliteTable(
  'photos',
  {
    ...wireMeta,
    trip_id: text()
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    city_id: integer(),
    taken_at: text(),
    exif_lat: real(),
    exif_lng: real(),
    is_public: integer({ mode: 'boolean' }).notNull().default(false),
    upload_state: text({ enum: uploadState }).notNull().default('pending'),
    moderation_state: text({ enum: moderationState }).notNull().default('pending'),
    has_thumbnail: integer({ mode: 'boolean' }).notNull().default(false),
    ...localMeta,
    /** App-private path of the staged file until `upload_state = 'uploaded'` (FR-041). */
    local_file_uri: text(),
  },
  (table) => [
    index('photos_trip_idx').on(table.trip_id),
    index('photos_updated_at_idx').on(table.updated_at),
  ],
);

/** Owner-only, structurally (FR-032). No visibility column, by construction. */
export const documents = sqliteTable(
  'documents',
  {
    ...wireMeta,
    trip_id: text()
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    type: text({ enum: documentType }).notNull(),
    parsed_json: text({ mode: 'json' }).$type<DocumentParsedFields | null>(),
    parsed_confirmed_at: text(),
    upload_state: text({ enum: uploadState }).notNull().default('pending'),
    ...localMeta,
    local_file_uri: text(),
  },
  (table) => [
    index('documents_trip_idx').on(table.trip_id),
    index('documents_updated_at_idx').on(table.updated_at),
  ],
);

// ---------------------------------------------------------------------------
// Reference caches — refreshed from the lookups endpoints, never pushed
// ---------------------------------------------------------------------------

export const countries = sqliteTable('countries', {
  id: integer().primaryKey(),
  iso_code: text().notNull(),
  name: text().notNull(),
  continent: text().notNull(),
});

export const cities = sqliteTable(
  'cities',
  {
    id: integer().primaryKey(),
    country_id: integer().notNull(),
    name: text().notNull(),
    /** Accent-stripped, searched offline the way the server searches it (FR-014). */
    ascii_name: text().notNull(),
    lat: real().notNull(),
    lng: real().notNull(),
    timezone: text().notNull(),
    population: integer().notNull().default(0),
  },
  (table) => [index('cities_country_ascii_idx').on(table.country_id, table.ascii_name)],
);

/**
 * The last FX snapshot from `GET /fx-rates` (rest-api.md §11; research D-10,
 * D-28): one row per currency, how many of it one USD buys, as a rate string.
 * An expense logged in aeroplane mode converts from this through the same
 * `crossRate` the server uses (research D-26) and carries the rate it used;
 * `as_of` and `source` are shown with the conversion so the traveller knows
 * how fresh it is and where it came from.
 */
export const fxRates = sqliteTable('fx_rates', {
  quote_currency: text().primaryKey(),
  rate: text().notNull(),
  as_of: text().notNull(),
  source: text().notNull(),
});

// ---------------------------------------------------------------------------
// Sync bookkeeping (US6)
// ---------------------------------------------------------------------------

/** One opaque `next_cursor` per table, as returned by `GET /sync/pull` (sync-protocol.md §1). */
export const syncCursors = sqliteTable('sync_cursors', {
  table_name: text().primaryKey(),
  cursor: text().notNull(),
});

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type TripRow = typeof trips.$inferSelect;
export type NewTripRow = typeof trips.$inferInsert;
export type TripStopRow = typeof tripStops.$inferSelect;
export type NewTripStopRow = typeof tripStops.$inferInsert;
export type ExpenseCategoryRow = typeof expenseCategories.$inferSelect;
export type NoteRow = typeof notes.$inferSelect;
export type ExpenseRow = typeof expenses.$inferSelect;
export type PhotoRow = typeof photos.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type CountryRow = typeof countries.$inferSelect;
export type CityRow = typeof cities.$inferSelect;
export type FxRateRow = typeof fxRates.$inferSelect;

/**
 * Compile-time proof that a local row still satisfies its wire record: every
 * pull-record field exists on the row with a compatible type. Local-only
 * columns are permitted (structural typing ignores extras); a missing or
 * retyped wire column is a `tsc` error at this line.
 */
type Mirrors<Row extends Wire, Wire> = Row extends Wire ? true : never;

export type LocalMirrorChecks = {
  trips: Mirrors<TripRow, TripPullRecord>;
  trip_stops: Mirrors<TripStopRow, TripStopPullRecord>;
  expense_categories: Mirrors<ExpenseCategoryRow, ExpenseCategoryPullRecord>;
  notes: Mirrors<NoteRow, NotePullRecord>;
  expenses: Mirrors<ExpenseRow, ExpensePullRecord>;
  photos: Mirrors<PhotoRow, PhotoPullRecord>;
  documents: Mirrors<DocumentRow, DocumentPullRecord>;
};
