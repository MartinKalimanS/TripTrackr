/**
 * Photos — local-first repository (tasks.md T211; FR-028, FR-029, FR-041;
 * Constitution II; research D-15, D-34).
 *
 * Same rules as `trips.ts`: every traveller write stamps `updated_at` and sets
 * `is_dirty`, deletes are tombstones, reads filter tombstones out. The row's
 * `id` is minted by the caller with `expo-crypto`'s `randomUUID()` and is the
 * id the photo is registered under (D-15). A capture is written here only
 * once its bytes are on the device (features/photos/capture.ts), with
 * `upload_state = 'pending'` — the gallery shows that state until the upload
 * channel confirms the object (sync-protocol.md §4).
 *
 * The upload channel's marks — `markUploaded`, `markFailed`, `markPending`,
 * `markSynced` — mirror what the SERVER holds (upload and screening state are
 * server-owned columns, absent from the push record), so they neither stamp
 * `updated_at` nor dirty the row. Cleaning is compare-and-set on the
 * `updated_at` the request was built from: a refile made while the request
 * was in flight keeps the row dirty for the sync engine (US6), and no mark
 * ever touches a tombstone.
 *
 * `local_file_uri` holds the staged JPEG's path RELATIVE to the app's
 * documents directory (features/photos/photo-files.ts), because the absolute
 * container path changes across iOS app updates.
 *
 * Visibility posture: owner + explicit public (data-model.md §5). A row is
 * private unless the capture was given the traveller's explicit choice of
 * public (`is_public`, spec 006 FR-009: asked once per pick, per photo, and
 * no answer is private); nothing else writes it, and changing it afterwards
 * is User Story 7. A public photo is still unreachable to everyone but its
 * owner: screening state starts `pending` and is only ever copied from the
 * server (FR-056), and the public-read policy needs `approved`.
 *
 * `coverCandidatesQuery` (feature 004 T429; FR-012; research D4-09) adds one
 * read and no write. Posture: private. It reads the signed-in traveller's own
 * local `photos` rows — five small columns, never bytes or text bodies — so the
 * trip list can pick a cover; only the thumbnail is drawn, on the device, and
 * nothing read is transmitted. No new endpoint, table, column, permission or
 * sync field.
 */
import type { ModerationState } from '@triptrackr/contracts';
import { and, asc, desc, eq, getTableColumns, isNotNull, isNull, sql } from 'drizzle-orm';

import type { AppDatabase } from '@/db/client';
import { cities, countries, photos, type PhotoRow } from '@/db/schema';

import { nowIso } from './shared';

export interface CreatePhotoInput {
  /** Client-generated UUID (D-15); also the id it is registered under. */
  id: string;
  trip_id: string;
  city_id: number | null;
  /** ISO-8601 UTC, read from EXIF before re-encoding (FR-029). */
  taken_at: string | null;
  exif_lat: number | null;
  exif_lng: number | null;
  /** The staged JPEG, relative to the documents directory. */
  local_file_uri: string;
  /** The traveller's explicit choice at capture (spec 006); absent means private (FR-052). */
  is_public?: boolean;
}

/** A photo with its filed city from the geography cache — nulls when never cached. */
export type PhotoWithPlace = PhotoRow & {
  city_name: string | null;
  country_name: string | null;
  city_lat: number | null;
  city_lng: number | null;
  city_timezone: string | null;
};

/** The server-owned state a registration or patch answers with. */
export interface ServerPhotoState {
  moderation_state: ModerationState;
  has_thumbnail: boolean;
}

export interface SyncReceipt {
  /** The row's `updated_at` when the request was built. */
  sentUpdatedAt: string;
  syncedAt: string;
  server?: ServerPhotoState;
}

/** What a registration answers with: the server's state, and the stamp it gave the row. */
export interface UploadReceipt extends SyncReceipt {
  server: ServerPhotoState;
  /** The registered photo's `updated_at` on the server's clock, when the answer carried it. */
  serverUpdatedAt?: string;
}

const live = (id: string) => and(eq(photos.id, id), isNull(photos.deleted_at));

/**
 * A trip's live photos, newest first by the time taken, then by when they
 * were added; undated photos last (SQLite sorts NULL lowest). Live-queryable.
 */
function forTripQuery(db: AppDatabase, tripId: string) {
  return db
    .select({
      ...getTableColumns(photos),
      city_name: cities.name,
      country_name: countries.name,
      city_lat: cities.lat,
      city_lng: cities.lng,
      city_timezone: cities.timezone,
    })
    .from(photos)
    .leftJoin(cities, eq(cities.id, photos.city_id))
    .leftJoin(countries, eq(countries.id, cities.country_id))
    .where(and(eq(photos.trip_id, tripId), isNull(photos.deleted_at)))
    .orderBy(desc(photos.taken_at), desc(photos.created_at), desc(photos.id));
}

/**
 * What the cover rule reads from a photo (`features/trips/trip-cover.ts`).
 * Columns only: the path is turned into a thumbnail URI in memory.
 */
export type CoverCandidate = Pick<
  PhotoRow,
  'id' | 'trip_id' | 'taken_at' | 'created_at' | 'local_file_uri'
>;

/**
 * Every live photo that still names a staged file, across all trips, grouped
 * by trip and, within a trip, earliest-taken first: dated before undated, then
 * earliest added, then id. This order IS the "earliest photo" rule:
 * `resolveTripCover` (features/trips/trip-cover.ts) does not sort, it takes the
 * first candidate of a trip whose path yields a thumbnail, so it must receive
 * rows in this order (any subsequence keeps it). Live-queryable: Drizzle
 * subscribes to the `photos` table.
 *
 * Text order is chronological order here because `taken_at` and `created_at` are
 * UTC instants ending in `Z`, the only form ever stored: the device writes
 * `toISOString()` (`nowIso()`, `features/photos/exif.ts`) and the server answers
 * in UTC (`INSTANT_FORMAT`, apps/api sync-records.ts). The contract's
 * `IsoDateTime` (`packages/contracts/src/scalars.ts`, `taken_at:
 * IsoDateTime.nullable()`) admits offsets in syntax, but its own note says
 * "Always UTC"; precision differs (ms on the device, µs from the server), below
 * what a cover needs. The gallery's `forTripQuery` orders on the same assumption.
 * test/db/photo-cover-candidates.test.ts pins the order and the mixed precision.
 */
function coverCandidatesQuery(db: AppDatabase) {
  return db
    .select({
      id: photos.id,
      trip_id: photos.trip_id,
      taken_at: photos.taken_at,
      created_at: photos.created_at,
      local_file_uri: photos.local_file_uri,
    })
    .from(photos)
    .where(and(isNull(photos.deleted_at), isNotNull(photos.local_file_uri)))
    .orderBy(
      asc(photos.trip_id),
      // SQLite sorts NULL lowest: the flag moves undated photos after dated ones.
      sql`${photos.taken_at} IS NULL`,
      asc(photos.taken_at),
      asc(photos.created_at),
      asc(photos.id),
    );
}

function byId(db: AppDatabase, id: string): PhotoRow | null {
  const [row] = db.select().from(photos).where(live(id)).all();
  return row ?? null;
}

/** The trip's live photos still waiting for their bytes to upload, oldest first. */
function pendingUploads(db: AppDatabase, tripId: string): PhotoRow[] {
  return db
    .select()
    .from(photos)
    .where(
      and(
        eq(photos.trip_id, tripId),
        eq(photos.upload_state, 'pending'),
        isNull(photos.deleted_at),
      ),
    )
    .orderBy(asc(photos.created_at), asc(photos.id))
    .all();
}

function create(db: AppDatabase, input: CreatePhotoInput): PhotoRow {
  const now = nowIso();
  const [row] = db
    .insert(photos)
    .values({
      ...input,
      is_public: input.is_public ?? false,
      upload_state: 'pending',
      moderation_state: 'pending',
      has_thumbnail: false,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      is_dirty: true,
      synced_at: null,
    })
    .returning()
    .all();
  if (!row) throw new Error('Photo insert returned no row.');
  return row;
}

/** File under another of the trip's cities, or none (FR-028). EXIF is untouched. */
function refile(db: AppDatabase, id: string, cityId: number | null): PhotoRow {
  const [row] = db
    .update(photos)
    .set({ city_id: cityId, updated_at: nowIso(), is_dirty: true })
    .where(live(id))
    .returning()
    .all();
  if (!row) throw new Error('Photo not found.');
  return row;
}

/**
 * Tombstone. The row stays until the server has been told (FR-039), but lets go
 * of its staged path: the caller reads it first and deletes the files.
 */
function remove(db: AppDatabase, id: string): void {
  const now = nowIso();
  db.update(photos)
    .set({ deleted_at: now, updated_at: now, is_dirty: true, local_file_uri: null })
    .where(live(id))
    .run();
}

/** Clean the row if it is still what the request carried; never a tombstone. */
function markSynced(db: AppDatabase, id: string, receipt: SyncReceipt): void {
  db.update(photos)
    .set({ is_dirty: false, synced_at: receipt.syncedAt, ...receipt.server })
    .where(and(live(id), eq(photos.updated_at, receipt.sentUpdatedAt)))
    .run();
}

/** Milliseconds since the epoch, reading a stamp with microseconds as the milliseconds it is. */
function instantOf(iso: string): number {
  return Date.parse(iso.replace(/(.d{3})d+/, '$1'));
}

/**
 * The stamp of a change made once the server has registered the photo: the device clock,
 * unless the server's own stamp is as late or later, then one millisecond after it. The
 * server applies an incoming record only when it is strictly newer than the stored one,
 * and a registration stamps the row with the server's clock.
 */
function afterRegistration(
  syncedAt: string,
  serverUpdatedAt: string | undefined,
): string {
  const device = instantOf(syncedAt);
  const server = serverUpdatedAt === undefined ? Number.NaN : instantOf(serverUpdatedAt);
  return new Date(
    Number.isNaN(server) ? device : Math.max(device, server + 1),
  ).toISOString();
}

/**
 * The object store confirmed the bytes and the server registered them (FR-041).
 *
 * A private row is then clean: registration carried everything it holds. A PUBLIC row is
 * not: `RegisterPhotoRequest` has no visibility, the registration made the photo private
 * on the server, and the traveller's choice is a change still to push (spec 006 FR-012).
 * It stays dirty with a new stamp, whatever else happened to it in flight, and travels in
 * the next push cycle like any local edit; the push handler accepts `is_public` for a
 * registered photo at any time, and the photo stays unreachable until screening approves
 * it (FR-056).
 */
function markUploaded(db: AppDatabase, id: string, receipt: UploadReceipt): void {
  db.transaction((tx) => {
    tx.update(photos)
      .set({ upload_state: 'uploaded', ...receipt.server })
      .where(live(id))
      .run();
    tx.update(photos)
      .set({ is_dirty: false, synced_at: receipt.syncedAt })
      .where(
        and(
          live(id),
          eq(photos.is_public, false),
          eq(photos.updated_at, receipt.sentUpdatedAt),
        ),
      )
      .run();
    tx.update(photos)
      .set({
        is_dirty: true,
        updated_at: afterRegistration(receipt.syncedAt, receipt.serverUpdatedAt),
      })
      .where(and(live(id), eq(photos.is_public, true)))
      .run();
  });
}

function setUploadState(db: AppDatabase, id: string, state: 'pending' | 'failed'): void {
  db.update(photos).set({ upload_state: state }).where(live(id)).run();
}

export const photosRepository = {
  forTripQuery,
  coverCandidatesQuery,
  byId,
  pendingUploads,
  create,
  refile,
  remove,
  markUploaded,
  markSynced,
  /** The upload was refused for good (FR-041) — shown with a retry. */
  markFailed: (db: AppDatabase, id: string) => setUploadState(db, id, 'failed'),
  /** A retry: back in the queue. */
  markPending: (db: AppDatabase, id: string) => setUploadState(db, id, 'pending'),
};
