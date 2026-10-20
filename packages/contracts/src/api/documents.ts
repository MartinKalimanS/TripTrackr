import { z } from 'zod';

import { IsoDateTime, Uuid } from '../scalars';
import { DocumentParsedFields, DocumentType, UploadState } from '../sync/records';

/**
 * Travel documents (rest-api.md §6; FR-031..FR-035; research D-32, D-33).
 *
 * Owner-only, structurally: every shape here is strict, so a visibility key is
 * a refusal rather than an ignore (FR-032). The bytes travel as base64 to the
 * API, which seals them under a per-document key before anything reaches the
 * bucket — there is no pre-signed URL for a document. Extracted fields are a
 * proposal until the traveller confirms them (Constitution IV).
 */

/** Largest document the API stores, decoded. A boarding-pass photo is far smaller. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Base64 characters needed for `bytes` bytes: four per three, padded. */
export function maxBase64Length(bytes: number): number {
  return 4 * Math.ceil(bytes / 3);
}

/** Images only: the device re-encodes a capture as JPEG, which also drops its EXIF. */
export const DocumentContentType = z.enum(['image/jpeg', 'image/png']);
export type DocumentContentType = z.infer<typeof DocumentContentType>;

export const DocumentBase64 = z
  .base64()
  .min(4)
  .max(maxBase64Length(MAX_DOCUMENT_BYTES), 'The document is larger than 10 MB');

const fieldsOnlyOnBoardingPass = {
  check: (d: { type: DocumentType; parsed_json: DocumentParsedFields | null }) =>
    d.parsed_json === null || d.type === 'boarding_pass',
  params: {
    message: 'Only a boarding pass carries extracted fields',
    path: ['parsed_json'],
  },
};

/**
 * `confirmed: true` — the traveller confirmed the fields on the device before
 * the upload, possibly offline (research D-33). `id` is client-chosen (D-15);
 * it is also the associated data the sealed bytes are bound to.
 */
export const CreateDocumentRequest = z
  .strictObject({
    id: Uuid.optional(),
    type: DocumentType,
    content_type: DocumentContentType,
    content_base64: DocumentBase64,
    parsed_json: DocumentParsedFields.nullable().default(null),
    confirmed: z.boolean().default(false),
  })
  .refine(fieldsOnlyOnBoardingPass.check, fieldsOnlyOnBoardingPass.params)
  .refine((d) => !d.confirmed || d.parsed_json !== null, {
    message: 'There are no fields to confirm',
    path: ['confirmed'],
  });
export type CreateDocumentRequest = z.infer<typeof CreateDocumentRequest>;
export type CreateDocumentInput = z.input<typeof CreateDocumentRequest>;

/** No key, no storage key, no visibility: what the owner's device needs, and nothing else. */
export const Document = z.strictObject({
  id: Uuid,
  trip_id: Uuid,
  type: DocumentType,
  content_type: DocumentContentType,
  byte_size: z.int().positive().max(MAX_DOCUMENT_BYTES),
  parsed_json: DocumentParsedFields.nullable(),
  parsed_confirmed_at: IsoDateTime.nullable(),
  upload_state: UploadState,
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
});
export type Document = z.infer<typeof Document>;

export const DocumentResponse = z.strictObject({ document: Document });
export type DocumentResponse = z.infer<typeof DocumentResponse>;

export const DocumentsResponse = z.strictObject({ documents: z.array(Document) });
export type DocumentsResponse = z.infer<typeof DocumentsResponse>;

/** `GET /documents/:id/content` — decrypted for the owner, served `no-store`. */
export const DocumentContentResponse = z.strictObject({
  id: Uuid,
  content_type: DocumentContentType,
  content_base64: DocumentBase64,
});
export type DocumentContentResponse = z.infer<typeof DocumentContentResponse>;

/**
 * Fields sent with `confirmed: true` are stored as confirmed; fields sent
 * without it replace the proposal and clear any confirmation; `confirmed`
 * alone confirms the stored proposal. That fields belong only on a boarding
 * pass is checked against the row the patch produces.
 */
export const PatchDocumentRequest = z
  .strictObject({
    type: DocumentType.optional(),
    parsed_json: DocumentParsedFields.nullable().optional(),
    confirmed: z.literal(true).optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'A patch must change at least one field',
  })
  .refine((patch) => !(patch.confirmed && patch.parsed_json === null), {
    message: 'Cleared fields cannot be confirmed',
    path: ['confirmed'],
  });
export type PatchDocumentRequest = z.infer<typeof PatchDocumentRequest>;
