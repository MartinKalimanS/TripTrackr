import type {
  DocumentParsedFields,
  DocumentPullRecord,
  ExpenseCategoryPullRecord,
  ExpensePullRecord,
  ModerationState,
  NotePullRecord,
  PhotoPullRecord,
  TripPullRecord,
  TripStatus,
  TripStopPullRecord,
  UploadState,
} from '@triptrackr/contracts';
import { sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

import {
  documents,
  expenseCategories,
  expenses,
  notes,
  photos,
  tripStops,
  trips,
} from '@/db/schema';

/**
 * Row → wire record, for the pull feed (sync-protocol.md §1; tasks.md T127) and
 * for `PullService.readOne`, which the push path uses to build a conflict's
 * `server_version` — so the shape of a stored row on the wire is produced in
 * exactly one place.
 *
 * **Timestamps are read as text, not as `Date`s.** {@link instant} asks
 * PostgreSQL to print a `timestamptz` as UTC with six fractional digits
 * (`2026-09-24T10:12:03.123456Z`). A `Date` holds milliseconds, so a cursor or a
 * record that went through one would lose the last three digits, and two rows
 * a few microseconds apart would become indistinguishable at a page boundary
 * (pull-cursor.ts). The same text is the record's `updated_at` and the cursor's
 * `updatedAt`, which is what keeps the two in agreement. `IsoDateTime` admits
 * any fractional precision, so every record stays valid against the contract.
 *
 * **What is never selected.** `storage_key` and `thumb_key` (photos), the object
 * key, wrapped key and key id beyond what the unseal needs (documents), and
 * `owner_id` / `user_id`: a column that is not read cannot be serialised by
 * mistake. A photo says only *whether* it has a thumbnail.
 *
 * The mappers are pure; the two that need more than the row — a trip's derived
 * `status` and a document's unsealed fields — take it as an argument, so the
 * database and the crypto stay in `pull-readers.ts`.
 */

const INSTANT_FORMAT = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`);

/** A `timestamptz` column as UTC text to the microsecond. */
export const instant = (column: PgColumn): SQL<string> =>
  sql<string>`to_char(${column} AT TIME ZONE 'UTC', ${INSTANT_FORMAT})`;

/** The same, for a nullable column: NULL stays NULL. */
export const instantOrNull = (column: PgColumn): SQL<string | null> =>
  sql<string | null>`to_char(${column} AT TIME ZONE 'UTC', ${INSTANT_FORMAT})`;

/** The columns every synchronised table carries (contracts/sync/records.ts `pullMeta`). */
interface MetaRow {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

const metaColumns = (table: {
  id: PgColumn;
  createdAt: PgColumn;
  updatedAt: PgColumn;
  deletedAt: PgColumn;
}) => ({
  id: table.id,
  createdAt: instant(table.createdAt),
  updatedAt: instant(table.updatedAt),
  deletedAt: instantOrNull(table.deletedAt),
});

const meta = (row: MetaRow) => ({
  id: row.id,
  created_at: row.createdAt,
  updated_at: row.updatedAt,
  deleted_at: row.deletedAt,
});

// ---------------------------------------------------------------------------
// trips
// ---------------------------------------------------------------------------

export const TRIP_COLUMNS = {
  ...metaColumns(trips),
  title: trips.title,
  homeCurrency: trips.homeCurrency,
  isPublic: trips.isPublic,
  coverPhotoId: trips.coverPhotoId,
};

export interface TripRow extends MetaRow {
  readonly title: string;
  readonly homeCurrency: string;
  readonly isPublic: boolean;
  readonly coverPhotoId: string | null;
}

/** `status` is derived from the live stops at read time, never taken from the column (FR-013). */
export function toTripRecord(row: TripRow, status: TripStatus): TripPullRecord {
  return {
    ...meta(row),
    title: row.title,
    home_currency: row.homeCurrency,
    is_public: row.isPublic,
    cover_photo_id: row.coverPhotoId,
    status,
  };
}

// ---------------------------------------------------------------------------
// trip_stops
// ---------------------------------------------------------------------------

export const STOP_COLUMNS = {
  ...metaColumns(tripStops),
  tripId: tripStops.tripId,
  cityId: tripStops.cityId,
  sortOrder: tripStops.sortOrder,
  arriveDate: tripStops.arriveDate,
  departDate: tripStops.departDate,
};

export interface StopRow extends MetaRow {
  readonly tripId: string;
  readonly cityId: number;
  readonly sortOrder: number;
  readonly arriveDate: string;
  readonly departDate: string;
}

export function toStopRecord(row: StopRow): TripStopPullRecord {
  return {
    ...meta(row),
    trip_id: row.tripId,
    city_id: row.cityId,
    sort_order: row.sortOrder,
    arrive_date: row.arriveDate,
    depart_date: row.departDate,
  };
}

// ---------------------------------------------------------------------------
// expense_categories — the caller's custom rows only
// ---------------------------------------------------------------------------

export const CATEGORY_COLUMNS = {
  ...metaColumns(expenseCategories),
  name: expenseCategories.name,
  icon: expenseCategories.icon,
};

export interface CategoryRow extends MetaRow {
  readonly name: string;
  readonly icon: string | null;
}

export function toCategoryRecord(row: CategoryRow): ExpenseCategoryPullRecord {
  return { ...meta(row), name: row.name, icon: row.icon };
}

// ---------------------------------------------------------------------------
// notes
// ---------------------------------------------------------------------------

export const NOTE_COLUMNS = {
  ...metaColumns(notes),
  tripId: notes.tripId,
  countryId: notes.countryId,
  cityId: notes.cityId,
  title: notes.title,
  body: notes.body,
  isPublic: notes.isPublic,
};

export interface NoteRow extends MetaRow {
  readonly tripId: string;
  readonly countryId: number | null;
  readonly cityId: number | null;
  readonly title: string | null;
  readonly body: string;
  readonly isPublic: boolean;
}

export function toNoteRecord(row: NoteRow): NotePullRecord {
  return {
    ...meta(row),
    trip_id: row.tripId,
    country_id: row.countryId,
    city_id: row.cityId,
    title: row.title,
    body: row.body,
    is_public: row.isPublic,
  };
}

// ---------------------------------------------------------------------------
// expenses — owner-only, structurally: there is no visibility column to read
// ---------------------------------------------------------------------------

export const EXPENSE_COLUMNS = {
  ...metaColumns(expenses),
  tripId: expenses.tripId,
  cityId: expenses.cityId,
  categoryId: expenses.categoryId,
  amount: expenses.amount,
  currency: expenses.currency,
  spentAt: expenses.spentAt,
  note: expenses.note,
  fxRateToHome: expenses.fxRateToHome,
  amountHome: expenses.amountHome,
  fxPending: expenses.fxPending,
};

export interface ExpenseRow extends MetaRow {
  readonly tripId: string;
  readonly cityId: number | null;
  readonly categoryId: string;
  /** `NUMERIC` text — never widened to a number (research D-26). */
  readonly amount: string;
  readonly currency: string;
  readonly spentAt: string;
  readonly note: string | null;
  readonly fxRateToHome: string | null;
  readonly amountHome: string | null;
  readonly fxPending: boolean;
}

/** The frozen conversion (FR-022) and whether one is still owed (FR-026) travel with the row. */
export function toExpenseRecord(row: ExpenseRow): ExpensePullRecord {
  return {
    ...meta(row),
    trip_id: row.tripId,
    city_id: row.cityId,
    category_id: row.categoryId,
    amount: row.amount,
    currency: row.currency,
    spent_at: row.spentAt,
    note: row.note,
    fx_rate_to_home: row.fxRateToHome,
    amount_home: row.amountHome,
    fx_pending: row.fxPending,
  };
}

// ---------------------------------------------------------------------------
// photos — metadata only; no key of any kind is selected
// ---------------------------------------------------------------------------

export const PHOTO_COLUMNS = {
  ...metaColumns(photos),
  tripId: photos.tripId,
  cityId: photos.cityId,
  takenAt: instantOrNull(photos.takenAt),
  exifLat: photos.exifLat,
  exifLng: photos.exifLng,
  isPublic: photos.isPublic,
  uploadState: photos.uploadState,
  moderationState: photos.moderationState,
  hasThumbnail: sql<boolean>`(${photos.thumbKey} IS NOT NULL)`,
};

export interface PhotoRow extends MetaRow {
  readonly tripId: string;
  readonly cityId: number | null;
  readonly takenAt: string | null;
  readonly exifLat: number | null;
  readonly exifLng: number | null;
  readonly isPublic: boolean;
  readonly uploadState: string;
  readonly moderationState: string;
  readonly hasThumbnail: boolean;
}

export function toPhotoRecord(row: PhotoRow): PhotoPullRecord {
  return {
    ...meta(row),
    trip_id: row.tripId,
    city_id: row.cityId,
    taken_at: row.takenAt,
    exif_lat: row.exifLat,
    exif_lng: row.exifLng,
    is_public: row.isPublic,
    // The CHECK constraints admit exactly these values (0002); the contract
    // re-validates them on the way out.
    upload_state: row.uploadState as UploadState,
    moderation_state: row.moderationState as ModerationState,
    has_thumbnail: row.hasThumbnail,
  };
}

// ---------------------------------------------------------------------------
// documents — owner-only, structurally; the fields are sealed at rest
// ---------------------------------------------------------------------------

export const DOCUMENT_COLUMNS = {
  ...metaColumns(documents),
  tripId: documents.tripId,
  type: documents.type,
  parsedConfirmedAt: instantOrNull(documents.parsedConfirmedAt),
  uploadState: documents.uploadState,
  // Needed only to open `parsedSealed`; neither reaches the wire.
  wrappedDek: documents.wrappedDek,
  dekKeyId: documents.dekKeyId,
  parsedSealed: documents.parsedSealed,
};

export interface DocumentRow extends MetaRow {
  readonly tripId: string;
  readonly type: 'boarding_pass' | 'booking' | 'other';
  readonly parsedConfirmedAt: string | null;
  readonly uploadState: 'pending' | 'uploaded' | 'failed';
  readonly wrappedDek: Buffer;
  readonly dekKeyId: string;
  readonly parsedSealed: Buffer | null;
}

/** `parsed` is the row's sealed fields opened for the owner by BoardingPassService. */
export function toDocumentRecord(
  row: DocumentRow,
  parsed: DocumentParsedFields | null,
): DocumentPullRecord {
  return {
    ...meta(row),
    trip_id: row.tripId,
    type: row.type,
    parsed_json: parsed,
    parsed_confirmed_at: row.parsedConfirmedAt,
    upload_state: row.uploadState,
  };
}
