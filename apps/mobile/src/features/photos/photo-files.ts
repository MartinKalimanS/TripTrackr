/**
 * Where a photo's bytes live on the device — tasks.md T116 (FR-041;
 * data-model.md §10; sync-protocol.md §4).
 *
 * Layout, in app-private storage (`Paths.document`: kept by the system, not a
 * cache it may purge):
 *
 *   photos/<trip id>/<photo id>.jpg        the re-encoded JPEG that uploads
 *   photos/<trip id>/<photo id>.thumb.jpg  the ~400 px thumbnail the grid shows
 *
 * The row records the JPEG's path RELATIVE to the documents directory and the
 * absolute URI is resolved at runtime: an iOS app container moves when the
 * app is updated, so an absolute `file://` path stored today points nowhere
 * tomorrow. The thumbnail's path is derived from the JPEG's. One directory
 * per trip, so a trip's files can be found — and removed — together.
 *
 * Paths are validated before they are resolved, so a malformed value can
 * never reach outside `photos/` (security review: file handling).
 *
 * API: `File`, `Directory` and `Paths` from expo-file-system as documented for
 * SDK 57 (https://docs.expo.dev/versions/v57.0.0/sdk/filesystem.md) — `move()`
 * is asynchronous there and updates the instance's `uri`.
 */
import { Directory, File, Paths } from 'expo-file-system';

import { Sentry } from '@/lib/sentry';

export const PHOTOS_DIRECTORY = 'photos';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PHOTO_PATH = new RegExp(`^${PHOTOS_DIRECTORY}/${UUID}/${UUID}\\.jpg$`, 'i');

/** Cache files made on the way (the picker's copy, the manipulator's output). */
export interface EncodedPhoto {
  full: string;
  thumbnail: string;
}

/** `photos/<trip id>/<photo id>.jpg`, relative to the documents directory. */
export function photoPath(tripId: string, photoId: string): string {
  return `${PHOTOS_DIRECTORY}/${tripId}/${photoId}.jpg`;
}

/** The thumbnail beside a photo: `….jpg` → `….thumb.jpg`. */
export function thumbnailPath(relativePath: string): string {
  return relativePath.replace(/\.jpg$/i, '.thumb.jpg');
}

function isPhotoPath(relativePath: string | null): relativePath is string {
  return relativePath !== null && PHOTO_PATH.test(relativePath);
}

function resolve(relativePath: string): File {
  return new File(Paths.document, ...relativePath.split('/'));
}

/** The staged JPEG for a row's `local_file_uri`, or null when there is none to trust. */
export function photoFileOf(relativePath: string | null): File | null {
  return isPhotoPath(relativePath) ? resolve(relativePath) : null;
}

/** The thumbnail for a row's `local_file_uri`, or null when there is none to trust. */
export function thumbnailFileOf(relativePath: string | null): File | null {
  return isPhotoPath(relativePath) ? resolve(thumbnailPath(relativePath)) : null;
}

/**
 * An absolute `file://` URI under the documents directory, joined as a string
 * so that drawing a tile never constructs a native file object.
 */
function documentsUri(relativePath: string): string {
  return `${Paths.document.uri.replace(/\/+$/, '')}/${relativePath}`;
}

/** The staged JPEG's URI for an image source — the photo view only — or null. */
export function photoUri(relativePath: string | null): string | null {
  return isPhotoPath(relativePath) ? documentsUri(relativePath) : null;
}

/** The thumbnail's URI for an image source — what the grid draws — or null. */
export function thumbnailUri(relativePath: string | null): string | null {
  return isPhotoPath(relativePath) ? documentsUri(thumbnailPath(relativePath)) : null;
}

/**
 * Delete a file if it is there. Clean-up must never mask the failure that
 * made it necessary, so its own failure is reported rather than thrown.
 */
function removeIfPresent(file: File): void {
  try {
    if (file.exists) file.delete();
  } catch (error) {
    Sentry.captureException(error);
  }
}

/** Remove a photo's JPEG and thumbnail, whichever exist. */
export function deletePhotoFiles(relativePath: string | null): void {
  for (const file of [photoFileOf(relativePath), thumbnailFileOf(relativePath)]) {
    if (file) removeIfPresent(file);
  }
}

/**
 * Remove a temporary file this app made in its cache directory. Anything
 * outside the cache is left alone: it is not ours to delete.
 */
export function discardCached(uri: string): void {
  const cache = Paths.cache.uri.replace(/\/+$/, '');
  if (!uri.startsWith(`${cache}/`)) return;
  removeIfPresent(new File(uri));
}

/**
 * Move a freshly encoded photo and its thumbnail into place. On any failure
 * — storage full, most likely — whatever already moved is deleted and the
 * cache copies are discarded, then the error is rethrown: no half is left.
 *
 * @returns the JPEG's relative path, for the row's `local_file_uri`.
 */
export async function stagePhotoFiles(
  tripId: string,
  photoId: string,
  encoded: EncodedPhoto,
): Promise<string> {
  const relative = photoPath(tripId, photoId);
  const original = photoFileOf(relative);
  const thumbnail = thumbnailFileOf(relative);
  if (!original || !thumbnail) {
    throw new Error('Refusing to stage a photo outside the photos directory.');
  }
  try {
    new Directory(Paths.document, PHOTOS_DIRECTORY, tripId).create({
      intermediates: true,
      idempotent: true,
    });
    await new File(encoded.full).move(original);
    await new File(encoded.thumbnail).move(thumbnail);
    return relative;
  } catch (error) {
    deletePhotoFiles(relative);
    discardCached(encoded.full);
    discardCached(encoded.thumbnail);
    throw error;
  }
}

/** Whether the device has at least `bytes` free; true when it cannot say. */
export function hasRoomFor(bytes: number): boolean {
  const free = Paths.availableDiskSpace;
  return !(typeof free === 'number' && free > 0 && free < bytes);
}
