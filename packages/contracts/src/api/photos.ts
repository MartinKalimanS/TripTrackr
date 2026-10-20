import { z } from 'zod';

import { CityId, IsoDateTime, Uuid } from '../scalars';
import { PhotoPullRecord } from '../sync/records';

/**
 * Photos (rest-api.md §5; FR-028..FR-030, FR-041, FR-056; research D-12, D-34).
 *
 * The bytes go straight to the private bucket on a pre-signed PUT for a key
 * the server chose; registration reports that key back once the upload has
 * finished. The device re-encodes before uploading, which drops EXIF, so the
 * time and position it read beforehand travel here as fields (FR-029).
 * Screening state is the server's: a registration cannot set it, and the RLS
 * policy keeps a photo off every public read until it is `approved`.
 */

/** Largest photo the API registers; the device resizes well below it. */
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** `<owner id>/<uuid>` as `StorageService.buildKey` makes it — never client-chosen. */
export const StorageKey = z
  .string()
  .regex(
    new RegExp(`^${UUID_PATTERN}/${UUID_PATTERN}$`),
    'Expected a storage key issued by the API',
  );
export type StorageKey = z.infer<typeof StorageKey>;

/** What the media worker can thumbnail. HEIC is converted to JPEG on the device. */
export const PhotoContentType = z.enum(['image/jpeg', 'image/png', 'image/webp']);
export type PhotoContentType = z.infer<typeof PhotoContentType>;

export const CreatePhotoUploadRequest = z.strictObject({
  content_type: PhotoContentType,
});
export type CreatePhotoUploadRequest = z.infer<typeof CreatePhotoUploadRequest>;

/** The client PUTs with the same `Content-Type`; the signature covers it. */
export const PhotoUploadResponse = z.strictObject({
  upload_url: z.url(),
  storage_key: StorageKey,
  expires_in_seconds: z.int().positive(),
});
export type PhotoUploadResponse = z.infer<typeof PhotoUploadResponse>;

const bothCoordinatesOrNeither = {
  check: (p: { exif_lat: number | null; exif_lng: number | null }) =>
    (p.exif_lat === null) === (p.exif_lng === null),
  params: { message: 'Send both coordinates or neither', path: ['exif_lng'] },
};

/** `id` is optional and client-chosen (research D-15); a retry answers with the stored photo. */
export const RegisterPhotoRequest = z
  .strictObject({
    id: Uuid.optional(),
    storage_key: StorageKey,
    city_id: CityId.nullable().default(null),
    taken_at: IsoDateTime.nullable().default(null),
    exif_lat: z.number().min(-90).max(90).nullable().default(null),
    exif_lng: z.number().min(-180).max(180).nullable().default(null),
  })
  .refine(bothCoordinatesOrNeither.check, bothCoordinatesOrNeither.params);
export type RegisterPhotoRequest = z.infer<typeof RegisterPhotoRequest>;
export type RegisterPhotoInput = z.input<typeof RegisterPhotoRequest>;

/**
 * A REST read never returns a deleted row. `thumbnail_url` is a short-lived
 * signed GET, or null until the worker has made the thumbnail; an original is
 * only ever signed on request (`GET /photos/:id/original`, FR-030).
 */
export const Photo = PhotoPullRecord.omit({ deleted_at: true }).extend({
  thumbnail_url: z.url().nullable(),
});
export type Photo = z.infer<typeof Photo>;

export const PhotoResponse = z.strictObject({ photo: Photo });
export type PhotoResponse = z.infer<typeof PhotoResponse>;

export const PhotosResponse = z.strictObject({ photos: z.array(Photo) });
export type PhotosResponse = z.infer<typeof PhotosResponse>;

export const PhotoOriginalResponse = z.strictObject({
  url: z.url(),
  expires_in_seconds: z.int().positive(),
});
export type PhotoOriginalResponse = z.infer<typeof PhotoOriginalResponse>;

/**
 * Visibility and filing only. Setting `is_public` while screening is pending
 * is accepted (rest-api.md §5): the photo stays unreachable until approved.
 */
export const PatchPhotoRequest = z
  .strictObject({
    is_public: z.boolean().optional(),
    city_id: CityId.nullable().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'A patch must change at least one field',
  });
export type PatchPhotoRequest = z.infer<typeof PatchPhotoRequest>;
