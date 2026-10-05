/**
 * Saving picked photos into a trip — tasks.md T116, T211 (FR-028, FR-029,
 * FR-041; research D-34; sync-protocol.md §4; Constitution II, IV).
 *
 * For each picked asset, in order, one at a time (decoding several full-size
 * photos at once is how a mid-range phone runs out of memory):
 *
 *   1. make sure the device has room (`MIN_FREE_BYTES`);
 *   2. read EXIF time and position from the picker's asset (exif.ts) — BEFORE
 *      the re-encode drops them;
 *   3. re-encode: an upload JPEG and a thumbnail, in the cache (reencode.ts);
 *   4. move both into app-private storage (photo-files.ts);
 *   5. write the row, `pending`, filed under the nearest trip city within
 *      50 km (city-match.ts) — and if the row fails, delete the files.
 *
 * Files first, row last, and each undone if the next step fails: a capture
 * either produces a row WITH its bytes or leaves nothing (sync-protocol.md §4,
 * "no half-written record"). The picker's cache copy is always discarded.
 * Running out of space is the traveller's circumstance and is only shown; any
 * other failure is also reported, as a defect (FR-073).
 *
 * Visibility posture: every photo is written private (photos repository);
 * nothing here reaches the network — the upload is upload.ts's.
 */
import { randomUUID } from 'expo-crypto';

import type { AppDatabase } from '@/db/client';
import { photosRepository } from '@/db/repositories/photos';
import { stopsRepository, type StopWithPlace } from '@/db/repositories/stops';
import type { PhotoRow } from '@/db/schema';
import {
  StorageFullError,
  hasRoomFor,
  isOutOfSpaceError,
  requireRoomFor,
} from '@/lib/disk-space';
import { Sentry } from '@/lib/sentry';

import { nearestTripCity } from './city-match';
import { readExif } from './exif';
import { PARTIAL_FAILURE_COPY, PHOTO_COPY } from './photo-copy';
import { deletePhotoFiles, discardCached, stagePhotoFiles } from './photo-files';
import { reencodePhoto, UnreadableImageError } from './reencode';

/**
 * Free space a photo needs before it is touched: its cache copies, the
 * staged JPEG and thumbnail (a few MB), and headroom for the database.
 */
export const MIN_FREE_BYTES = 25 * 1024 * 1024;

/** The part of a picker asset a capture reads. */
export interface CaptureAsset {
  uri: string;
  exif?: Record<string, unknown> | null;
}

export type CaptureReason = 'noSpace' | 'unreadable' | 'failed';

export type CaptureOutcome =
  { kind: 'added'; photoId: string } | { kind: 'skipped'; reason: CaptureReason };

export interface CaptureMessage {
  tone: 'info' | 'error';
  text: string;
  /** The fix is in the system's Settings (a permission the system will not ask for again). */
  openSettings?: boolean;
}

/**
 * Why a capture failed (T139). A full disk is recognised by the failure's
 * words, or — a failure whose words say nothing — by the free space now being
 * short (lib/disk-space.ts: the SDK names no error code for it).
 */
function reasonFor(error: unknown): CaptureReason {
  if (error instanceof StorageFullError) return 'noSpace';
  if (error instanceof UnreadableImageError) return 'unreadable';
  return isOutOfSpaceError(error) || !hasRoomFor(MIN_FREE_BYTES) ? 'noSpace' : 'failed';
}

/** Steps 1–5 for one asset. Throws, having undone its own work, on failure. */
async function savePhoto(
  db: AppDatabase,
  tripId: string,
  asset: CaptureAsset,
  stops: readonly StopWithPlace[],
): Promise<PhotoRow> {
  requireRoomFor(MIN_FREE_BYTES);
  const reading = readExif(asset.exif);
  const encoded = await reencodePhoto(asset.uri);
  const id = randomUUID();
  const localFileUri = await stagePhotoFiles(tripId, id, encoded);
  try {
    return photosRepository.create(db, {
      id,
      trip_id: tripId,
      city_id: nearestTripCity(reading, stops),
      taken_at: reading.takenAt,
      exif_lat: reading.lat,
      exif_lng: reading.lng,
      local_file_uri: localFileUri,
    });
  } catch (error) {
    deletePhotoFiles(localFileUri);
    throw error;
  }
}

async function saveOne(
  db: AppDatabase,
  tripId: string,
  asset: CaptureAsset,
  stops: readonly StopWithPlace[],
): Promise<CaptureOutcome> {
  try {
    const row = await savePhoto(db, tripId, asset, stops);
    return { kind: 'added', photoId: row.id };
  } catch (error) {
    const reason = reasonFor(error);
    if (reason !== 'noSpace') Sentry.captureException(error);
    return { kind: 'skipped', reason };
  } finally {
    discardCached(asset.uri);
  }
}

/**
 * Save each asset into the trip, in order. Never rejects: each asset's
 * outcome says whether it was added and, if not, why.
 */
export async function saveCapturedPhotos(
  db: AppDatabase,
  tripId: string,
  assets: readonly CaptureAsset[],
): Promise<CaptureOutcome[]> {
  // Read once, fresh: the stops as they are now, not as a screen last drew them.
  const stops = stopsRepository.forTripQuery(db, tripId).all();
  const outcomes: CaptureOutcome[] = [];
  for (const asset of assets) {
    outcomes.push(await saveOne(db, tripId, asset, stops));
  }
  return outcomes;
}

const REASON_PRIORITY: readonly CaptureReason[] = ['noSpace', 'unreadable', 'failed'];

const FULL_SENTENCE: Record<CaptureReason, string> = {
  noSpace: PHOTO_COPY.noSpace,
  unreadable: PHOTO_COPY.unreadable,
  failed: PHOTO_COPY.saveFailed,
};

/**
 * What to tell the traveller about a capture: how many photos were added and,
 * when some were not, the most actionable reason. Null when nothing was picked.
 */
export function describeCapture(
  outcomes: readonly CaptureOutcome[],
): CaptureMessage | null {
  if (outcomes.length === 0) return null;
  const added = outcomes.filter((outcome) => outcome.kind === 'added').length;
  const skipped = outcomes.length - added;
  if (skipped === 0) {
    return { tone: 'info', text: `${added} ${added === 1 ? 'photo' : 'photos'} added.` };
  }
  const reasons = new Set(
    outcomes.flatMap((outcome) => (outcome.kind === 'skipped' ? [outcome.reason] : [])),
  );
  const reason = REASON_PRIORITY.find((candidate) => reasons.has(candidate)) ?? 'failed';
  if (added > 0) {
    const text = `${added} of ${outcomes.length} photos added. ${skipped} ${PARTIAL_FAILURE_COPY[reason]}`;
    return { tone: 'error', text };
  }
  const text =
    outcomes.length === 1
      ? FULL_SENTENCE[reason]
      : `None of the ${outcomes.length} photos could be added. ${FULL_SENTENCE[reason]}`;
  return { tone: 'error', text };
}
