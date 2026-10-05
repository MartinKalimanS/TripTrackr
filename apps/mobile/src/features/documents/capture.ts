/**
 * Capturing a travel document — tasks.md T118, T211, T212 (FR-031, FR-033,
 * FR-035; research D-32, D-33).
 *
 * Every capture — a camera frame, or an image picked from the library — goes
 * the same way: re-encoded as a JPEG at most 2048 px on its long edge by
 * `expo-image-manipulator`, which also drops its EXIF; sealed into the vault;
 * written to the local store as a `pending` row. The camera's or picker's
 * temporary is deleted as soon as it is re-encoded, and the editor's output as
 * soon as it is sealed — both also when the step fails.
 *
 * A boarding pass's barcode is read on the device (live by `CameraView`, or
 * from a picked image by `scanFromURLAsync`) and parsed by the shared
 * `parseBoardingPass` against the device's local calendar day. Only the three
 * fields FR-035 names leave the parser; the raw payload — which carries the
 * booking reference — is never stored, sent or reported. No barcode, or one
 * that is not a pass, is manual entry, never an error (spec Edge Cases).
 *
 * Verified against the v57 references:
 *   - https://docs.expo.dev/versions/v57.0.0/sdk/imagemanipulator.md — `ImageManipulator.manipulate(uri | ImageRef)`,
 *     `resize` with one dimension keeping the ratio, `renderAsync()` →
 *     `ImageRef` with `width`/`height`, `saveAsync({ format, compress })` into
 *     the cache; contexts and images are shared objects, `release()`d here.
 *   - https://docs.expo.dev/versions/v57.0.0/sdk/camera.md — `scanFromURLAsync(url, barcodeTypes)`;
 *     "Only QR codes are supported on iOS" for a picked image.
 *   - https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker.md — `launchImageLibraryAsync`
 *     answers `{ canceled, assets }`, each asset a copy in the app's cache.
 *
 * Visibility posture: owner-only, structurally, and device-only until the
 * upload (`upload.ts`) hands the bytes to the API over TLS.
 */
import {
  parseBoardingPass,
  type DocumentParsedFields,
  type DocumentType,
} from '@triptrackr/contracts';
import { scanFromURLAsync, type BarcodeType } from 'expo-camera';
import { randomUUID } from 'expo-crypto';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import { launchImageLibraryAsync } from 'expo-image-picker';

import type { AppDatabase } from '@/db/client';
import { documentsRepository } from '@/db/repositories/documents';
import type { DocumentRow } from '@/db/schema';
import {
  StorageFullError,
  hasRoomFor,
  isOutOfSpaceError,
  requireRoomFor,
} from '@/lib/disk-space';
import { Sentry } from '@/lib/sentry';

import { discardTemporary, removeSealedFile, sealTemporaryFile } from './document-vault';

/** BCBP is printed as PDF417 on paper passes; mobile passes use Aztec or QR. */
export const PASS_BARCODE_TYPES: BarcodeType[] = ['pdf417', 'aztec', 'qr'];

/** Long edge of a stored document image (research D-32; the photos' D-34 bound). */
export const MAX_LONG_EDGE = 2048;

/** Legible text at a size far below `MAX_DOCUMENT_BYTES`. */
export const JPEG_QUALITY = 0.85;

type Resize = { width: number } | { height: number };

/** The resize that brings the long edge to `MAX_LONG_EDGE`, or null when it fits. */
export function longEdgeResize(width: number, height: number): Resize | null {
  if (Math.max(width, height) <= MAX_LONG_EDGE) return null;
  return width >= height ? { width: MAX_LONG_EDGE } : { height: MAX_LONG_EDGE };
}

/** The first decoded barcode that is a BCBP boarding pass, parsed for `today`. */
export function fieldsFromScans(
  scans: readonly { data: string }[],
  today: string,
): DocumentParsedFields | null {
  return scans.reduce<DocumentParsedFields | null>(
    (found, scan) => found ?? parseBoardingPass(scan.data, today),
    null,
  );
}

/**
 * Look for a pass barcode in an image file. Never rejects: an image the
 * scanner cannot read leaves the traveller to type the fields.
 */
export async function scanImageForPass(
  uri: string,
  today: string,
): Promise<DocumentParsedFields | null> {
  try {
    return fieldsFromScans(await scanFromURLAsync(uri, PASS_BARCODE_TYPES), today);
  } catch (error) {
    Sentry.captureException(error);
    return null;
  }
}

/** One image from the library — the picker's temporary copy — or null when cancelled. */
export async function pickDocumentImage(): Promise<string | null> {
  const result = await launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    allowsMultipleSelection: false,
    exif: false,
    base64: false,
    quality: 1,
  });
  if (result.canceled) return null;
  return result.assets[0]?.uri ?? null;
}

interface Releasable {
  release: () => void;
}

/** Decode `uri` and bring its long edge within bounds. Every native object is `hold`-ed. */
async function renderWithinBounds(
  uri: string,
  hold: (native: Releasable) => void,
): Promise<ImageRef> {
  const context = ImageManipulator.manipulate(uri);
  hold(context);
  const decoded = await context.renderAsync();
  hold(decoded);
  const resize = longEdgeResize(decoded.width, decoded.height);
  if (!resize) return decoded;
  const resizing = ImageManipulator.manipulate(decoded).resize(resize);
  hold(resizing);
  const resized = await resizing.renderAsync();
  hold(resized);
  return resized;
}

/**
 * Re-encode a temporary image as JPEG within `MAX_LONG_EDGE`, dropping its
 * EXIF, and delete the temporary. Resolves with the editor's output — itself
 * plaintext in the cache, for `sealTemporaryFile` to seal and delete.
 */
export async function reencodeAsJpeg(temporaryUri: string): Promise<string> {
  const held: Releasable[] = [];
  try {
    const image = await renderWithinBounds(temporaryUri, (native) => held.push(native));
    const saved = await image.saveAsync({
      format: SaveFormat.JPEG,
      compress: JPEG_QUALITY,
    });
    return saved.uri;
  } finally {
    held.forEach((native) => native.release());
    discardTemporary(temporaryUri);
  }
}

export interface StoreDocumentInput {
  tripId: string;
  type: DocumentType;
  /** The camera's or picker's output: plaintext, deleted by this call. */
  temporaryUri: string;
  /** Fields read from a pass's barcode, if any. Ignored for other types. */
  parsed: DocumentParsedFields | null;
}

/**
 * Free space a document needs before it is touched: the editor's JPEG and the
 * sealed file beside it (each about a megabyte, at most `MAX_DOCUMENT_BYTES`
 * in theory), and headroom for the database row. Smaller than a photo's bound
 * because a document writes one file where a photo writes two (T139).
 */
export const MIN_DOCUMENT_FREE_BYTES = 15 * 1024 * 1024;

/** The sealed file of a row that could not be written goes; a leftover is reported, never masks. */
function discardSealed(path: string): void {
  try {
    removeSealedFile(path);
  } catch (error) {
    Sentry.captureException(error);
  }
}

/** Steps: re-encode → seal → row. Each failure undoes what came before it. */
async function saveDocument(
  db: AppDatabase,
  input: StoreDocumentInput,
): Promise<DocumentRow> {
  try {
    requireRoomFor(MIN_DOCUMENT_FREE_BYTES);
  } catch (error) {
    // The capture's plaintext temporary is this call's to delete, room or not.
    discardTemporary(input.temporaryUri);
    throw error;
  }
  const id = randomUUID();
  const jpeg = await reencodeAsJpeg(input.temporaryUri);
  const sealed = await sealTemporaryFile(id, jpeg);
  try {
    return documentsRepository.create(db, {
      id,
      trip_id: input.tripId,
      type: input.type,
      parsed_json: input.type === 'boarding_pass' ? input.parsed : null,
      local_file_uri: sealed.path,
    });
  } catch (error) {
    discardSealed(sealed.path);
    throw error;
  }
}

/**
 * Re-encode, seal and store a captured document, local-first (Constitution
 * II). A capture either produces a row WITH its sealed file or leaves nothing
 * on the disk — no row, no plaintext temporary, no half-written seal — and a
 * device out of space says so with a `StorageFullError` (T139; sync-protocol.md
 * §4; lib/disk-space.ts for how a full disk is recognised).
 *
 * @throws {StorageFullError} when the device is, or has just become, full.
 */
export async function storeDocument(
  db: AppDatabase,
  input: StoreDocumentInput,
): Promise<DocumentRow> {
  try {
    return await saveDocument(db, input);
  } catch (error) {
    if (error instanceof StorageFullError) throw error;
    if (isOutOfSpaceError(error) || !hasRoomFor(MIN_DOCUMENT_FREE_BYTES)) {
      throw new StorageFullError(error);
    }
    throw error;
  }
}
