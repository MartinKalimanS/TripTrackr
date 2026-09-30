import { HttpStatus, Injectable } from '@nestjs/common';
import {
  MAX_PHOTO_BYTES,
  ModerationState,
  UploadState,
  type CreatePhotoUploadRequest,
  type PatchPhotoRequest,
  type Photo,
  type PhotoOriginalResponse,
  type PhotoUploadResponse,
  type RegisterPhotoRequest,
} from '@triptrackr/contracts';

import { loadEnv } from '@/common/config/env.schema';
import { apiError, notFound } from '@/common/errors/api-error';
import { requireCurrentUserId } from '@/common/rls/rls-context';
import { StorageService } from '@/common/storage/storage.service';
import { TripsService } from '@/modules/trips/trips.service';

import { isWireInstant } from './capture';
import { MediaJobProducer } from './media-job.producer';
import { PhotosRepository, type PhotoRow } from './photos.repository';

/** The one not-found for every `/photos/:id` route — contracts/README.md rule 1. */
export const photoNotFound = () => notFound('PHOTO_NOT_FOUND', 'Photo');

const VALIDATION_MESSAGE =
  'Some of the information provided is not valid. Please check it and try again.';

function validationFailed(
  path: string,
  message: string,
  status: HttpStatus = HttpStatus.BAD_REQUEST,
) {
  return apiError(status, 'VALIDATION_FAILED', VALIDATION_MESSAGE, {
    issues: [{ path, message }],
  });
}

const uploadMissing = () =>
  apiError(
    HttpStatus.CONFLICT,
    'PHOTO_UPLOAD_MISSING',
    'The photo has not finished uploading. Please upload it and try again.',
  );

const uploadReused = () =>
  apiError(
    HttpStatus.CONFLICT,
    'PHOTO_UPLOAD_REUSED',
    'That upload is already saved as another photo. Please request a new upload and try again.',
  );

const photoTooLarge = () =>
  apiError(
    HttpStatus.PAYLOAD_TOO_LARGE,
    'PHOTO_TOO_LARGE',
    `That photo is larger than ${MAX_PHOTO_BYTES / (1024 * 1024)} MB. Please choose a smaller one.`,
  );

const photoIdUnavailable = () =>
  apiError(
    HttpStatus.CONFLICT,
    'PHOTO_ID_UNAVAILABLE',
    'That photo id is already in use. Please retry with a new id.',
  );

export interface RegisteredPhoto {
  readonly photo: Photo;
  /** False when a retried registration answered with the photo already stored. */
  readonly created: boolean;
}

/**
 * Photos (rest-api.md §5; FR-028, FR-030, FR-041, FR-056; research D-12, D-34).
 *
 * The bytes never pass through here. The device PUTs them to the private
 * bucket on a URL signed for a key this service chose, then registers the key;
 * registration confirms, in this order, that the key is under the caller's own
 * prefix (422 — one traveller never claims another's object), that no live
 * photo already names it (409), that the object is there (409) and within
 * `MAX_PHOTO_BYTES` — an object over it is deleted (413). Only then is the row
 * written `uploaded` (FR-041), private and `pending`, and the media job
 * enqueued. The key-in-use check precedes the measurement deliberately: a
 * signed PUT can be replayed until it expires, and the oversize branch must
 * never delete bytes a photo that already exists points at.
 *
 * A retried registration with the same client id is the same registration
 * (research D-15): it answers with the stored photo and re-checks nothing.
 *
 * Access rules: the upload URL, registration, list, patch and delete are the
 * owner's — trip-scoped operations load the trip through the owner view first,
 * so a stranger is `TRIP_NOT_FOUND` before any photo is looked at, and
 * row-scoped ones answer `PHOTO_NOT_FOUND` for anything the caller does not
 * own. The original is owner-or-public exactly as far as `photos_public_read`
 * lets a stranger read the row — which, with every photo `pending` until User
 * Story 7 chooses a screener, is nobody. The public list is the curated view of
 * FR-055, which must leave out the EXIF position (data-model.md §5); it
 * arrives with User Story 7, behind the sync gate.
 *
 * `is_public` is accepted at any time, pending screening included (the contract
 * obligation on PATCH): the answer carries `moderation_state`, so the traveller
 * is told plainly that nobody else can see the photo yet.
 */
@Injectable()
export class PhotosService {
  constructor(
    private readonly repository: PhotosRepository,
    private readonly trips: TripsService,
    private readonly storage: StorageService,
    private readonly media: MediaJobProducer,
  ) {}

  async createUploadUrl(
    tripId: string,
    request: CreatePhotoUploadRequest,
  ): Promise<PhotoUploadResponse> {
    await this.trips.loadOwned(tripId);

    const upload = await this.storage.createUploadUrl(
      'photos',
      requireCurrentUserId(),
      request.content_type,
    );

    return {
      upload_url: upload.url,
      storage_key: upload.storageKey,
      expires_in_seconds: upload.expiresInSeconds,
    };
  }

  async register(
    tripId: string,
    request: RegisterPhotoRequest,
  ): Promise<RegisteredPhoto> {
    await this.trips.loadOwned(tripId);
    assertOwnStorageKey(request.storage_key);
    const takenAt = toCaptureInstant(request.taken_at);

    const replay = await this.findReplay(tripId, request);
    if (replay) return { photo: await this.present(replay), created: false };

    await this.assertUploadUsable(request.storage_key);
    await this.assertCityKnown(request.city_id);

    const row = await this.repository.insert({
      id: request.id,
      tripId,
      storageKey: request.storage_key,
      cityId: request.city_id,
      takenAt,
      exifLat: request.exif_lat,
      exifLng: request.exif_lng,
    });
    if (!row) return this.resolveIdConflict(tripId, request);

    await this.media.enqueue(row.id);
    return { photo: await this.present(row), created: true };
  }

  async list(tripId: string): Promise<Photo[]> {
    await this.trips.loadOwned(tripId);
    const rows = await this.repository.listForTrip(tripId);
    return Promise.all(rows.map((row) => this.present(row)));
  }

  /** A signed GET for the original, only on deliberate viewing (FR-030). */
  async original(photoId: string): Promise<PhotoOriginalResponse> {
    const storageKey = await this.repository.findOriginalKey(photoId);
    if (!storageKey) throw photoNotFound();

    return {
      url: await this.storage.createDownloadUrl('photos', storageKey),
      expires_in_seconds: loadEnv().S3_SIGNED_URL_TTL_SECONDS,
    };
  }

  async patch(photoId: string, patch: PatchPhotoRequest): Promise<Photo> {
    const current = await this.repository.findOwnedLive(photoId);
    if (!current) throw photoNotFound();

    await this.assertCityKnown(patch.city_id ?? null);

    const row = await this.repository.update(photoId, {
      isPublic: patch.is_public,
      cityId: patch.city_id,
    });
    if (!row) throw photoNotFound();

    return this.present(row);
  }

  async remove(photoId: string): Promise<void> {
    const deleted = await this.repository.tombstone(photoId);
    if (!deleted) throw photoNotFound();
  }

  /** The caller's own photo with this id, trip and key: the same registration, again. */
  private async findReplay(
    tripId: string,
    request: RegisterPhotoRequest,
  ): Promise<PhotoRow | null> {
    if (!request.id) return null;
    const existing = await this.repository.findOwnedLive(request.id);
    return existing?.tripId === tripId && existing.storageKey === request.storage_key
      ? existing
      : null;
  }

  /**
   * The insert lost on the id. A concurrent retry of this same registration
   * that committed first is the same registration; anything else holding the
   * id — a stranger's photo, a tombstone, another of the caller's — is refused
   * without saying which.
   */
  private async resolveIdConflict(
    tripId: string,
    request: RegisterPhotoRequest,
  ): Promise<RegisteredPhoto> {
    const raced = await this.findReplay(tripId, request);
    if (raced) return { photo: await this.present(raced), created: false };
    throw photoIdUnavailable();
  }

  /** Not already a photo, landed, not empty, not too large — in that order (see class). */
  private async assertUploadUsable(storageKey: string): Promise<void> {
    if (await this.repository.storageKeyInUse(storageKey)) throw uploadReused();

    const size = await this.storage.objectSize('photos', storageKey);
    // An empty object is a PUT that sent no bytes: nothing has landed (FR-041).
    if (size === null || size === 0) throw uploadMissing();

    if (size > MAX_PHOTO_BYTES) {
      await this.storage.deleteObject('photos', storageKey);
      throw photoTooLarge();
    }
  }

  /** An unknown city is a validation problem, never a foreign-key violation (FR-072). */
  private async assertCityKnown(cityId: number | null): Promise<void> {
    if (cityId !== null && !(await this.repository.cityExists(cityId))) {
      throw validationFailed('city_id', 'Unknown city');
    }
  }

  private async present(row: PhotoRow): Promise<Photo> {
    const thumbnailUrl = row.thumbKey
      ? await this.storage.createDownloadUrl('photos', row.thumbKey)
      : null;
    return toPhoto(row, thumbnailUrl);
  }
}

/**
 * The key must be one this API issued to the caller: `StorageKey` has already
 * checked its shape, and the prefix is the owner's id (`buildKey`). Checked
 * against the caller alone — a foreign key is refused without the bucket ever
 * being asked about it, so the answer says nothing about whether it exists.
 */
function assertOwnStorageKey(storageKey: string): void {
  if (!storageKey.startsWith(`${requireCurrentUserId()}/`)) {
    throw validationFailed(
      'storage_key',
      'Expected a storage key issued to you',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/** The capture time as an instant, refused when the wire could not carry it back. */
function toCaptureInstant(takenAt: string | null): Date | null {
  if (takenAt === null) return null;
  const instant = new Date(takenAt);
  if (!isWireInstant(instant)) {
    throw validationFailed(
      'taken_at',
      'Expected a capture time between the years 0000 and 9999',
    );
  }
  return instant;
}

/**
 * Row → wire shape (contracts/api/photos.ts `Photo`). Never an original's URL:
 * a list is for browsing, and originals are signed only on request (FR-030).
 */
export function toPhoto(row: PhotoRow, thumbnailUrl: string | null): Photo {
  return {
    id: row.id,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    trip_id: row.tripId,
    city_id: row.cityId,
    taken_at: row.takenAt?.toISOString() ?? null,
    exif_lat: row.exifLat,
    exif_lng: row.exifLng,
    is_public: row.isPublic,
    upload_state: UploadState.parse(row.uploadState),
    moderation_state: ModerationState.parse(row.moderationState),
    has_thumbnail: row.thumbKey !== null,
    thumbnail_url: thumbnailUrl,
  };
}
