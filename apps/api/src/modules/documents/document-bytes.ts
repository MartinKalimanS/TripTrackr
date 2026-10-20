import { MAX_DOCUMENT_BYTES, type DocumentContentType } from '@triptrackr/contracts';

import { documentInvalid, documentTooLarge } from './documents.errors';

/**
 * What the API accepts as a document's bytes (rest-api.md §6; research D-32;
 * tasks.md T114).
 *
 * An image, and only an image: the device re-encodes a capture as JPEG, which
 * also drops its EXIF, and a picked PNG may pass as it is. The declared
 * `content_type` is checked against the bytes' own signature — a client-declared
 * type is a claim, and the type is served back to the owner's device with the
 * decrypted bytes, so it must be the bytes' real one.
 *
 * Visibility posture: pure functions over bytes already in the request; nothing
 * here stores, logs or reports them.
 */

/** The leading bytes of each accepted type, from the formats' own specifications. */
const SIGNATURES: Readonly<Record<DocumentContentType, readonly number[]>> = {
  // JPEG: SOI marker, then the first byte of the next marker.
  'image/jpeg': [0xff, 0xd8, 0xff],
  // PNG: the eight-byte file signature, which also catches line-ending mangling.
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

const TYPE_NAMES: Readonly<Record<DocumentContentType, string>> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
};

/** True when `bytes` begins with the signature of `contentType`. */
export function matchesSignature(
  contentType: DocumentContentType,
  bytes: Buffer,
): boolean {
  const signature = SIGNATURES[contentType];

  return (
    bytes.length >= signature.length &&
    signature.every((byte, index) => bytes[index] === byte)
  );
}

/**
 * The number of bytes a padded base64 string decodes to — exact for valid
 * input, and cheap enough to ask before decoding anything. The contract's
 * base64 is padded, so the length is a multiple of four.
 */
export function decodedLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;

  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * The document's bytes, once they are known to fit and to be what they claim.
 *
 * Size first: an oversized upload is refused as too large, whatever else is
 * wrong with it. The contract caps the base64 string rather than the decoded
 * length, and an unpadded string at that cap decodes to two bytes more than
 * MAX_DOCUMENT_BYTES — so the ceiling is enforced here, on the bytes.
 */
export function decodeDocument(contentType: DocumentContentType, base64: string): Buffer {
  if (decodedLength(base64) > MAX_DOCUMENT_BYTES) throw documentTooLarge();

  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > MAX_DOCUMENT_BYTES) throw documentTooLarge();

  if (!matchesSignature(contentType, bytes)) {
    throw documentInvalid(
      'content_base64',
      `The file is not a ${TYPE_NAMES[contentType]} image`,
    );
  }

  return bytes;
}
