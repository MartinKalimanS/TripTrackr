import { MAX_PHOTO_BYTES, type ModerationState } from '@triptrackr/contracts';
import { UnrecoverableError } from 'bullmq';
import exifr from 'exifr';
import type { Sql } from 'postgres';
import sharp from 'sharp';

import type { StorageService } from '@/common/storage/storage.service';
import { CAPTURE_TAGS, captureFromExif, type Capture } from '@/modules/photos/capture';
import { MediaJobData, thumbnailKeyFor } from '@/modules/photos/media-job';

import type { PhotoScreening } from './photo-screening';

/**
 * The media worker — tasks.md T113 (FR-029, FR-030, FR-056; research D-12,
 * D-34).
 *
 * Runs in the worker process for every job on the `media` queue, each naming
 * one registered photo (`{ photo_id }`, modules/photos/media-job.ts):
 *
 *   1. Reads the photo through `media_photo_for_processing` (migration 0012).
 *      The worker connects as the API role with no traveller identity, so RLS
 *      shows it no photo at all; the keyhole shows it one — live, uploaded, on
 *      a live trip — and only its storage key and whether registration carried
 *      capture data. A photo that is gone finishes the job quietly.
 *   2. Reads the original from the private bucket, measuring it first: a signed
 *      PUT can be replayed until it expires, so the object may have been
 *      replaced since registration measured it, and one over `MAX_PHOTO_BYTES`
 *      is never downloaded.
 *   3. Makes the thumbnail with `sharp`: oriented from EXIF, fitted inside
 *      512×512 without enlargement, JPEG at quality 80, and — `sharp`'s default
 *      when no `withMetadata`/`keep*` is asked for — with every byte of EXIF,
 *      XMP, IPTC and ICC stripped, so a thumbnail never carries a position.
 *   4. Reads EXIF with `exifr` only when registration carried neither a time
 *      nor a position — the device reads EXIF before re-encoding and sends it
 *      as fields (research D-34), so this is the fallback, not the rule.
 *   5. Asks the `PhotoScreening` port (photo-screening.ts), showing it the
 *      thumbnail. Its only implementation answers `pending`.
 *   6. Writes the thumbnail beside the original, then records everything
 *      through `media_record_photo`, which fills only what is empty, files the
 *      photo under the nearest of its trip's live stops within 50 km only when
 *      it has no city, and applies a verdict fail-closed.
 *
 * Idempotent under BullMQ's retries: the thumbnail key is derived, so a rerun
 * overwrites the same object with the same bytes, and every fill in the keyhole
 * is conditional. Failures are sorted by whether a retry can help:
 *
 *   - **Retried** (a plain throw; five attempts with backoff, queue.module.ts):
 *     the original missing or unreadable, the store or the database refusing.
 *     Registration confirmed the object existed, so its absence on a live,
 *     uploaded photo is either a transient store inconsistency — which the
 *     retries outlast — or a real loss, which must end as a failed job, the
 *     durable record that a photo never got its thumbnail, rather than as a
 *     quiet success.
 *   - **Failed at once** (`UnrecoverableError`): malformed job data, an original
 *     over the limit, bytes that are not an image `sharp` can decode. The same
 *     bytes give the same answer on every attempt.
 *
 * Visibility posture: reads one photo's key and bytes and writes its thumbnail
 * and the columns above — through the two keyholes only, never through a plain
 * query on a policed table. It logs a photo id and outcomes, never a key, a
 * time or a position.
 */

/** The longer edge of a thumbnail, at most. */
export const THUMBNAIL_EDGE_PX = 512;
export const THUMBNAIL_QUALITY = 80;

/**
 * Decoding stops beyond this many pixels. It admits a full-resolution frame
 * from a 48-megapixel phone camera — the device itself sends at most 2048 px on
 * the long edge (research D-34) — and bounds what a small, highly compressible
 * file can make `libvips` allocate.
 */
export const MAX_INPUT_PIXELS = 50_000_000;

/** What a transparent PNG is flattened onto: a JPEG has no alpha channel. */
const THUMBNAIL_MATTE = { r: 255, g: 255, b: 255 };

export type MediaStorage = Pick<
  StorageService,
  'objectSize' | 'getObject' | 'putObject' | 'deleteObject'
>;

export interface MediaDeps {
  /** The API role's connection, with no traveller identity (bootstrap.ts). */
  readonly sql: Sql;
  readonly storage: MediaStorage;
  readonly screening: PhotoScreening;
}

/** Whether EXIF was read, and what it gave. */
export type ExifOutcome = 'not_needed' | 'found' | 'absent' | 'unreadable';

export type MediaResult =
  | { readonly photoId: string; readonly outcome: 'skipped' }
  | {
      readonly photoId: string;
      readonly outcome: 'processed';
      readonly exif: ExifOutcome;
      readonly filed: boolean;
      readonly moderationState: string;
    };

interface PhotoToProcess {
  readonly storageKey: string;
  readonly needsExif: boolean;
}

interface Recorded {
  readonly thumbnailKey: string;
  readonly filed: boolean;
  readonly moderation: string;
}

interface ExifReading {
  readonly outcome: ExifOutcome;
  readonly capture: Capture | null;
}

const NOT_NEEDED: ExifReading = { outcome: 'not_needed', capture: null };

export async function processPhoto(data: unknown, deps: MediaDeps): Promise<MediaResult> {
  const photoId = parseJob(data);
  const photo = await findPhotoToProcess(deps.sql, photoId);
  if (!photo) return { photoId, outcome: 'skipped' };

  const original = await readOriginal(deps.storage, photoId, photo.storageKey);
  const thumbnail = await makeThumbnail(original, photoId);
  const exif = photo.needsExif ? await readExif(original) : NOT_NEEDED;
  const verdict = await deps.screening.screen({
    photoId,
    image: thumbnail,
    contentType: 'image/jpeg',
  });

  const thumbnailKey = thumbnailKeyFor(photo.storageKey);
  await deps.storage.putObject('photos', thumbnailKey, thumbnail, 'image/jpeg');

  const recorded = await recordPhoto(deps.sql, photoId, exif.capture, verdict);
  if (!recorded) {
    // Tombstoned while the thumbnail was being made: nothing points at the
    // object just written, so it goes rather than waiting for a sweep.
    await deps.storage.deleteObject('photos', thumbnailKey);
    return { photoId, outcome: 'skipped' };
  }
  assertSameThumbnail(recorded, thumbnailKey, photoId);

  return {
    photoId,
    outcome: 'processed',
    exif: exif.outcome,
    filed: recorded.filed,
    moderationState: recorded.moderation,
  };
}

function parseJob(data: unknown): string {
  const parsed = MediaJobData.safeParse(data);
  if (!parsed.success) {
    throw new UnrecoverableError('Media job data is malformed: expected { photo_id }.');
  }
  return parsed.data.photo_id;
}

async function findPhotoToProcess(
  sql: Sql,
  photoId: string,
): Promise<PhotoToProcess | null> {
  const [row] = await sql<{ storage_key: string; needs_exif: boolean }[]>`
    SELECT storage_key, needs_exif FROM media_photo_for_processing(${photoId}::uuid)
  `;
  return row ? { storageKey: row.storage_key, needsExif: row.needs_exif } : null;
}

async function readOriginal(
  storage: MediaStorage,
  photoId: string,
  storageKey: string,
): Promise<Buffer> {
  const size = await storage.objectSize('photos', storageKey);
  if (size === null) {
    throw new Error(`Photo ${photoId}: the original is missing or unreadable; retrying.`);
  }
  if (size > MAX_PHOTO_BYTES) throw replacedOriginal(photoId);

  const bytes = await storage.getObject('photos', storageKey);
  if (bytes === null) {
    throw new Error(`Photo ${photoId}: the original is missing or unreadable; retrying.`);
  }
  // Replaced again between the measurement and the read.
  if (bytes.length > MAX_PHOTO_BYTES) throw replacedOriginal(photoId);

  return bytes;
}

function replacedOriginal(photoId: string): UnrecoverableError {
  return new UnrecoverableError(
    `Photo ${photoId}: the stored original is over MAX_PHOTO_BYTES — replaced after ` +
      'registration — and is not processed.',
  );
}

async function makeThumbnail(original: Buffer, photoId: string): Promise<Buffer> {
  try {
    return await sharp(original, { limitInputPixels: MAX_INPUT_PIXELS })
      // No angle: orient from the EXIF Orientation tag, then drop the tag.
      .rotate()
      .resize({
        width: THUMBNAIL_EDGE_PX,
        height: THUMBNAIL_EDGE_PX,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: THUMBNAIL_MATTE })
      .jpeg({ quality: THUMBNAIL_QUALITY })
      .toBuffer();
  } catch (error: unknown) {
    throw new UnrecoverableError(
      `Photo ${photoId}: the original cannot be thumbnailed (${messageOf(error)}).`,
    );
  }
}

/**
 * Capture time and position from the original's EXIF (FR-029). Metadata that
 * cannot be parsed is metadata the photo does not have: EXIF is best-effort
 * observation, and a malformed block must not cost the photo its thumbnail. The
 * outcome says which it was, for the job's log line.
 */
async function readExif(original: Buffer): Promise<ExifReading> {
  let tags: unknown;
  try {
    tags = await exifr.parse(original, {
      pick: [...CAPTURE_TAGS],
      // The raw strings: `exifr` would otherwise read the camera's wall clock
      // in this server's zone (capture.ts).
      reviveValues: false,
      translateValues: false,
    });
  } catch {
    return { outcome: 'unreadable', capture: null };
  }

  const capture = captureFromExif(tags);
  return capture ? { outcome: 'found', capture } : { outcome: 'absent', capture: null };
}

async function recordPhoto(
  sql: Sql,
  photoId: string,
  capture: Capture | null,
  verdict: ModerationState,
): Promise<Recorded | null> {
  const [row] = await sql<
    { thumbnail_key: string; filed: boolean; moderation: string }[]
  >`
    SELECT thumbnail_key, filed, moderation
    FROM media_record_photo(
      ${photoId}::uuid,
      ${capture?.takenAt ?? null}::timestamptz,
      ${capture?.lat ?? null}::double precision,
      ${capture?.lng ?? null}::double precision,
      ${verdict}::text
    )
  `;
  return row
    ? { thumbnailKey: row.thumbnail_key, filed: row.filed, moderation: row.moderation }
    : null;
}

/**
 * The keyhole derives the thumbnail key in SQL rather than accepting one, and
 * this process derives it to write the object. If the two ever disagreed the
 * row would point at an object that is not there — loudly, then.
 */
function assertSameThumbnail(recorded: Recorded, written: string, photoId: string): void {
  if (recorded.thumbnailKey !== written) {
    throw new UnrecoverableError(
      `Photo ${photoId}: media_record_photo recorded a thumbnail key other than the one ` +
        'written; migration 0012 and thumbnailKeyFor() disagree.',
    );
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
