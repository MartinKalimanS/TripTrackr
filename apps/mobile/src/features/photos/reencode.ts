/**
 * Re-encoding a picked photo on the device — tasks.md T116 (FR-030; research
 * D-34; User Story 5, Acceptance Scenario 6).
 *
 * Every photo is decoded once and written twice, as JPEG, into the cache:
 *
 *   - the upload: at most `FULL_EDGE_PX` on the long edge. Decoding and
 *     re-encoding drops every EXIF tag (Android writes the bitmap with
 *     `Bitmap.compress`, iOS with `UIImage.jpegData`), so the uploaded bytes
 *     carry no position — exif.ts reads the metadata before this runs. A photo
 *     already within the limit is re-encoded all the same, never enlarged.
 *   - the thumbnail: at most `THUMBNAIL_EDGE_PX`, so the gallery never decodes
 *     a full image to draw a tile (Acceptance 5.6).
 *
 * Orientation is applied on load (iOS fixes it in `manipulate`; Android's
 * image loader honours the EXIF orientation), so the pixels are upright.
 * HEIC, PNG and WebP from the library all come out as `image/jpeg`.
 *
 * API: the contextual `ImageManipulator.manipulate(source)` of SDK 57
 * (https://docs.expo.dev/versions/v57.0.0/sdk/imagemanipulator.md): `resize`
 * with one edge keeps the aspect ratio; `renderAsync()` yields an `ImageRef`
 * with its `width`/`height`; `saveAsync({ format, compress })` writes to the
 * cache directory; `manipulate` also accepts an `ImageRef`, so the source is
 * decoded once for both outputs. Native handles are released as soon as they
 * are done with rather than left to the garbage collector.
 */
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';

import { discardCached, type EncodedPhoto } from './photo-files';

export const FULL_EDGE_PX = 2048;
export const THUMBNAIL_EDGE_PX = 400;
/** JPEG quality for the upload: about 0.5–1.5 MB at 2048 px — easy on hotel Wi-Fi. */
export const FULL_QUALITY = 0.85;
export const THUMBNAIL_QUALITY = 0.7;

/** A photo the device could not decode. */
export class UnreadableImageError extends Error {
  constructor(cause?: unknown) {
    super('The image could not be decoded.', { cause });
    this.name = 'UnreadableImageError';
  }
}

/**
 * The resize that brings the long edge down to `maxEdge`, naming only that
 * edge so the manipulator keeps the ratio; null when it already fits.
 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number } | { height: number } | null {
  if (width <= maxEdge && height <= maxEdge) return null;
  return width >= height ? { width: maxEdge } : { height: maxEdge };
}

async function decode(sourceUri: string): Promise<ImageRef> {
  const context = ImageManipulator.manipulate(sourceUri);
  try {
    const image = await context.renderAsync();
    if (image.width > 0 && image.height > 0) return image;
    image.release();
    throw new UnreadableImageError();
  } catch (error) {
    throw error instanceof UnreadableImageError ? error : new UnreadableImageError(error);
  } finally {
    context.release();
  }
}

async function saveScaled(
  source: ImageRef,
  maxEdge: number,
  compress: number,
): Promise<string> {
  const context = ImageManipulator.manipulate(source);
  try {
    const size = fitWithin(source.width, source.height, maxEdge);
    const scaled = await (size ? context.resize(size) : context).renderAsync();
    try {
      const saved = await scaled.saveAsync({ format: SaveFormat.JPEG, compress });
      return saved.uri;
    } finally {
      scaled.release();
    }
  } finally {
    context.release();
  }
}

/**
 * Decode `sourceUri` once and write the upload JPEG and its thumbnail to the
 * cache. If the second write fails the first is discarded, so a failure
 * leaves nothing behind.
 *
 * @throws {UnreadableImageError} when the image cannot be decoded.
 */
export async function reencodePhoto(sourceUri: string): Promise<EncodedPhoto> {
  const source = await decode(sourceUri);
  try {
    const full = await saveScaled(source, FULL_EDGE_PX, FULL_QUALITY);
    try {
      const thumbnail = await saveScaled(source, THUMBNAIL_EDGE_PX, THUMBNAIL_QUALITY);
      return { full, thumbnail };
    } catch (error) {
      discardCached(full);
      throw error;
    }
  } finally {
    source.release();
  }
}
