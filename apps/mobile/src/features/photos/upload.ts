/**
 * Getting a photo's bytes to the server — tasks.md T116 (FR-041; rest-api.md
 * §5; sync-protocol.md §4; research D-34).
 *
 * For one pending photo:
 *
 *   1. `POST /trips/:tripId/photos/upload-url` → a pre-signed PUT for a key the
 *      server chose (`PhotoUploadResponse`);
 *   2. PUT the staged JPEG to it with `Content-Type: image/jpeg` — the header
 *      the signature covers. The native upload streams the file from disk
 *      (`File.upload`, expo-file-system SDK 57, `UploadType.BINARY_CONTENT`),
 *      so no photo is ever read into JavaScript memory;
 *   3. `POST /trips/:tripId/photos` registers it under the photo's OWN id with
 *      its filing and EXIF fields (`RegisterPhotoRequest`); a retried
 *      registration answers with the stored photo, so this is idempotent;
 *   4. mark the row `uploaded` and clean — compare-and-set, so a refile made
 *      meanwhile stays dirty (photos repository).
 *
 * What stops it, and what the traveller sees:
 *   - no connection, a timeout, a busy server, a signed-out device, or a trip
 *     the server has not received yet (trips reach it through User Story 6's
 *     sync, so until then every local trip answers TRIP_NOT_FOUND): the photo
 *     stays `pending`, silently — its "Waiting to upload" badge already says
 *     so, and a dialog would only nag;
 *   - `409 PHOTO_UPLOAD_MISSING`: the object is not in the bucket — upload
 *     again, once;
 *   - `413 PHOTO_TOO_LARGE`, or a staged file that has vanished: `failed`, shown
 *     with a retry. Both are reported: the resize should make the first
 *     impossible, and nothing should delete the second;
 *   - anything else is a defect: reported (FR-073), and the photo stays pending.
 *
 * Retry policy until User Story 6's queue (T134, with Wi-Fi preference and
 * backoff): an attempt right after a capture and whenever the gallery gains
 * focus (use-photos.ts), oldest photo first, one photo at a time, stopping at
 * the first that has to wait. Never two uploads of one photo at once; deleting
 * a photo cancels its upload (sync-protocol.md §4).
 *
 * Visibility posture: the bytes go to the PRIVATE bucket through a signed URL
 * that is never logged; the uploaded JPEG carries no EXIF (reencode.ts), so the
 * position travels only as registration fields to the traveller's own row,
 * which is private and unscreened (`moderation_state = 'pending'`, FR-056).
 */
import {
  PhotoResponse,
  PhotoUploadResponse,
  RegisterPhotoRequest,
  type CreatePhotoUploadRequest,
} from '@triptrackr/contracts';
import { UploadType, type File } from 'expo-file-system';

import type { AppDatabase } from '@/db/client';
import { photosRepository } from '@/db/repositories/photos';
import { nowIso } from '@/db/repositories/shared';
import type { PhotoRow } from '@/db/schema';
import { ApiRequestError, apiFetch } from '@/lib/api-client';
import { Sentry } from '@/lib/sentry';

import { photoFileOf } from './photo-files';

/**
 * The longest one attempt may take, PUT included. A last resort against a
 * connection that never answers — the native stacks time out an idle transfer
 * sooner — and generous enough for a photo on a slow hotel connection.
 */
export const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

/** Every photo is re-encoded as JPEG on the device (reencode.ts). */
const CONTENT_TYPE = 'image/jpeg';

/** The first attempt, plus one more after `409 PHOTO_UPLOAD_MISSING`. */
const MAX_ATTEMPTS = 2;

export type UploadOutcome =
  /** Bytes in the bucket, photo registered, row `uploaded`. */
  | 'uploaded'
  /** Not now — offline, busy, or unexpected; still `pending`. */
  | 'waiting'
  /** Refused for good; `failed`, shown with a retry. */
  | 'failed'
  /** Nothing to do: not pending, gone, or already uploading. */
  | 'skipped';

/** The bucket answered the PUT with something other than success. */
class PutRefusedError extends Error {
  constructor(readonly status: number) {
    // The signed URL is a credential: it never goes into a message or a report.
    super(`The object store refused the photo upload (HTTP ${status}).`);
    this.name = 'PutRefusedError';
  }
}

/** The PUT never got an answer: no connection, a timeout, or a cancellation. */
class PutInterruptedError extends Error {
  constructor(cause?: unknown) {
    super('The photo upload was interrupted.', { cause });
    this.name = 'PutInterruptedError';
  }
}

class MissingFileError extends Error {
  constructor() {
    super('A pending photo’s staged file is missing from the device.');
    this.name = 'MissingFileError';
  }
}

function hasCode(error: unknown, status: number, code: string): error is ApiRequestError {
  return (
    error instanceof ApiRequestError && error.status === status && error.code === code
  );
}

function isWaitingApiError(error: ApiRequestError): boolean {
  if (error.status === 0) return error.code === 'NETWORK' || error.code === 'TIMEOUT';
  // apiFetch has already reported a response that breaks the contract.
  if (error.code === 'INVALID_RESPONSE') return true;
  if (error.status === 401 || error.status === 429 || error.status >= 500) return true;
  return hasCode(error, 404, 'TRIP_NOT_FOUND');
}

/**
 * True for a failure that only means "not now" and says nothing is wrong with
 * the app: it is waited out quietly. Anything else is worth a report.
 */
export function isWaitingError(error: unknown): boolean {
  if (error instanceof PutInterruptedError) return true;
  if (error instanceof PutRefusedError)
    return error.status === 429 || error.status >= 500;
  return error instanceof ApiRequestError && isWaitingApiError(error);
}

async function putBytes(file: File, url: string, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new PutInterruptedError();
  let status: number;
  try {
    const result = await file.upload(url, {
      httpMethod: 'PUT',
      uploadType: UploadType.BINARY_CONTENT,
      headers: { 'Content-Type': CONTENT_TYPE },
      // Answered while this JS runtime is here to hear it; the next focus retries.
      sessionType: 'foreground',
      signal,
    });
    status = result.status;
  } catch (error) {
    throw new PutInterruptedError(error);
  }
  if (status < 200 || status >= 300) throw new PutRefusedError(status);
}

/** Steps 1–3: a signed PUT, the bytes, the registration. */
async function sendAndRegister(
  row: PhotoRow,
  file: File,
  signal: AbortSignal,
): Promise<PhotoResponse> {
  const body: CreatePhotoUploadRequest = { content_type: CONTENT_TYPE };
  const target = await apiFetch(
    PhotoUploadResponse,
    `/trips/${row.trip_id}/photos/upload-url`,
    { method: 'POST', body, signal },
  );
  await putBytes(file, target.upload_url, signal);
  const registration = RegisterPhotoRequest.parse({
    id: row.id,
    storage_key: target.storage_key,
    city_id: row.city_id,
    taken_at: row.taken_at,
    exif_lat: row.exif_lat,
    exif_lng: row.exif_lng,
  });
  return apiFetch(PhotoResponse, `/trips/${row.trip_id}/photos`, {
    method: 'POST',
    body: registration,
    signal,
  });
}

function failFor(db: AppDatabase, photoId: string, error: Error): 'failed' {
  photosRepository.markFailed(db, photoId);
  Sentry.captureException(error);
  return 'failed';
}

async function attemptUpload(
  db: AppDatabase,
  photoId: string,
  signal: AbortSignal,
): Promise<UploadOutcome> {
  const row = photosRepository.byId(db, photoId);
  if (!row || row.upload_state !== 'pending') return 'skipped';
  const file = photoFileOf(row.local_file_uri);
  if (!file?.exists) return failFor(db, row.id, new MissingFileError());

  for (let attempt = 1; ; attempt += 1) {
    try {
      const { photo } = await sendAndRegister(row, file, signal);
      photosRepository.markUploaded(db, row.id, {
        sentUpdatedAt: row.updated_at,
        syncedAt: nowIso(),
        server: {
          moderation_state: photo.moderation_state,
          has_thumbnail: photo.has_thumbnail,
        },
      });
      return 'uploaded';
    } catch (error) {
      if (hasCode(error, 409, 'PHOTO_UPLOAD_MISSING') && attempt < MAX_ATTEMPTS) continue;
      if (hasCode(error, 413, 'PHOTO_TOO_LARGE')) return failFor(db, row.id, error);
      throw error;
    }
  }
}

/** The photos uploading now, each with the switch that cancels it. */
const inFlight = new Map<string, AbortController>();

/**
 * Upload one pending photo. Never rejects, and never runs twice at once for
 * the same photo: a second call while one is running is `skipped`.
 */
export async function uploadPhoto(
  db: AppDatabase,
  photoId: string,
): Promise<UploadOutcome> {
  if (inFlight.has(photoId)) return 'skipped';
  const controller = new AbortController();
  inFlight.set(photoId, controller);
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    return await attemptUpload(db, photoId, controller.signal);
  } catch (error) {
    if (!isWaitingError(error)) Sentry.captureException(error);
    return 'waiting';
  } finally {
    clearTimeout(timer);
    inFlight.delete(photoId);
  }
}

/** Stop a photo's upload, if one is running — its record is being deleted. */
export function cancelUpload(photoId: string): void {
  inFlight.get(photoId)?.abort();
}

/** Upload a trip's pending photos, oldest first; false once one has to wait. */
async function drainOnce(db: AppDatabase, tripId: string): Promise<boolean> {
  for (const photo of photosRepository.pendingUploads(db, tripId)) {
    if ((await uploadPhoto(db, photo.id)) === 'waiting') return false;
  }
  return true;
}

/** Trips being drained; `again` is set when another drain is asked for meanwhile. */
const draining = new Map<string, { again: boolean }>();

/**
 * Try every pending photo of the trip — after a capture, and whenever the
 * gallery gains focus. One drain per trip at a time: a request that arrives
 * while one runs makes it go round once more, so a photo captured mid-drain is
 * not left waiting for the next focus. Never rejects.
 */
export async function uploadPendingPhotos(
  db: AppDatabase,
  tripId: string,
): Promise<void> {
  const running = draining.get(tripId);
  if (running) {
    running.again = true;
    return;
  }
  const state = { again: true };
  draining.set(tripId, state);
  try {
    while (state.again) {
      state.again = false;
      if (!(await drainOnce(db, tripId))) break;
    }
  } catch (error) {
    Sentry.captureException(error);
  } finally {
    draining.delete(tripId);
  }
}
