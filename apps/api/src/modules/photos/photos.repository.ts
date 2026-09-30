import { Injectable } from '@nestjs/common';
import { asc, desc, eq, sql } from 'drizzle-orm';

import { rlsDb } from '@/common/db/rls-db';
import { liveOnly } from '@/common/db/soft-delete.scope';
import { requireCurrentUserId } from '@/common/rls/rls-context';
import { cities, photos, trips } from '@/db/schema';

/**
 * The photo columns the service reads. `deleted_at` has no slot in the
 * contract; `storage_key` and `thumb_key` never leave the server — the service
 * turns them into signed URLs, and only on the routes that may (FR-030).
 */
const PHOTO_COLUMNS = {
  id: photos.id,
  tripId: photos.tripId,
  cityId: photos.cityId,
  storageKey: photos.storageKey,
  thumbKey: photos.thumbKey,
  takenAt: photos.takenAt,
  exifLat: photos.exifLat,
  exifLng: photos.exifLng,
  isPublic: photos.isPublic,
  moderationState: photos.moderationState,
  uploadState: photos.uploadState,
  createdAt: photos.createdAt,
  updatedAt: photos.updatedAt,
};

export type PhotoRow = Pick<typeof photos.$inferSelect, keyof typeof PHOTO_COLUMNS>;

export interface NewPhoto {
  readonly id?: string;
  readonly tripId: string;
  readonly storageKey: string;
  readonly cityId: number | null;
  readonly takenAt: Date | null;
  readonly exifLat: number | null;
  readonly exifLng: number | null;
}

export interface PhotoPatch {
  readonly isPublic?: boolean;
  readonly cityId?: number | null;
}

/**
 * Every query against `photos`, on the request's RLS transaction (rls-db.ts).
 *
 * `photos_owner_all` and `photos_public_read` (0005) decide what exists for the
 * caller before any predicate here runs. The public policy lets a stranger read
 * a photo only when it is public, `approved`, and on a public trip — and no
 * photo is approved before User Story 7 (research D-34) — so a forgotten
 * predicate here would still return nothing of anyone else's.
 *
 * The owner-scoped reads name the owner anyway, through the trip, so that a
 * photo readable under the public policy is never treated as the caller's own
 * by the owner routes. Only {@link findOriginalKey} deliberately lets the
 * policy alone decide: `GET /photos/:id/original` is owner-or-public, and its
 * answer — a signed URL — has no owner-only fields to curate.
 *
 * No statement here can raise on a caller's mistake — cities are checked for
 * existence first and client-chosen ids use `ON CONFLICT DO NOTHING` — because
 * a failed statement poisons the request transaction (0008's header).
 */
@Injectable()
export class PhotosRepository {
  /** Every live photo of the trip, uploaded or not: the gallery shows both (FR-041). */
  listForTrip(tripId: string): Promise<PhotoRow[]> {
    return rlsDb()
      .select(PHOTO_COLUMNS)
      .from(photos)
      .where(liveOnly(photos, eq(photos.tripId, tripId)))
      .orderBy(desc(photos.createdAt), asc(photos.id));
  }

  /** A live photo on one of the caller's own trips, or null. */
  async findOwnedLive(photoId: string): Promise<PhotoRow | null> {
    const [row] = await rlsDb()
      .select(PHOTO_COLUMNS)
      .from(photos)
      .innerJoin(trips, eq(trips.id, photos.tripId))
      .where(
        liveOnly(
          photos,
          eq(photos.id, photoId),
          eq(trips.ownerId, requireCurrentUserId()),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  /**
   * The key of a live photo whose bytes have arrived, if the policy lets the
   * caller read it — the owner always, anyone else only through
   * `photos_public_read`. A photo still waiting for its bytes has no original
   * to sign.
   */
  async findOriginalKey(photoId: string): Promise<string | null> {
    const [row] = await rlsDb()
      .select({ storageKey: photos.storageKey })
      .from(photos)
      .where(liveOnly(photos, eq(photos.id, photoId), eq(photos.uploadState, 'uploaded')))
      .limit(1);

    return row?.storageKey ?? null;
  }

  /**
   * True when a live photo already names this object. The key carries the
   * caller's own prefix by the time this runs, and only its owner can
   * register a key under that prefix, so "visible to the caller" and "exists"
   * are the same question here.
   */
  async storageKeyInUse(storageKey: string): Promise<boolean> {
    const rows = await rlsDb()
      .select({ id: photos.id })
      .from(photos)
      .where(liveOnly(photos, eq(photos.storageKey, storageKey)))
      .limit(1);

    return rows.length > 0;
  }

  /**
   * Null when the id is already taken — the caller decides what that means.
   * Registration is the one writer of `upload_state` and it writes only
   * `uploaded`, after the object store confirmed the bytes (FR-041). A new
   * photo is private and unscreened, whatever the request said: neither value
   * is the traveller's to set here (FR-052, FR-056).
   */
  async insert(photo: NewPhoto): Promise<PhotoRow | null> {
    const [row] = await rlsDb()
      .insert(photos)
      .values({
        ...(photo.id !== undefined && { id: photo.id }),
        tripId: photo.tripId,
        cityId: photo.cityId,
        storageKey: photo.storageKey,
        takenAt: photo.takenAt,
        exifLat: photo.exifLat,
        exifLng: photo.exifLng,
        isPublic: false,
        moderationState: 'pending',
        uploadState: 'uploaded',
      })
      .onConflictDoNothing()
      .returning(PHOTO_COLUMNS);

    return row ?? null;
  }

  /** Visibility and filing only; the policy confines the write to the owner. */
  async update(photoId: string, patch: PhotoPatch): Promise<PhotoRow | null> {
    const [row] = await rlsDb()
      .update(photos)
      .set({
        ...(patch.isPublic !== undefined && { isPublic: patch.isPublic }),
        ...(patch.cityId !== undefined && { cityId: patch.cityId }),
        updatedAt: sql`now()`,
      })
      .where(liveOnly(photos, eq(photos.id, photoId)))
      .returning(PHOTO_COLUMNS);

    return row ?? null;
  }

  /** A tombstone, not a removal (FR-039); the objects are swept later (T188). */
  async tombstone(photoId: string): Promise<boolean> {
    const now = sql`now()`;
    const rows = await rlsDb()
      .update(photos)
      .set({ deletedAt: now, updatedAt: now })
      .where(liveOnly(photos, eq(photos.id, photoId)))
      .returning({ id: photos.id });

    return rows.length > 0;
  }

  async cityExists(cityId: number): Promise<boolean> {
    const rows = await rlsDb()
      .select({ id: cities.id })
      .from(cities)
      .where(eq(cities.id, cityId))
      .limit(1);

    return rows.length > 0;
  }
}
