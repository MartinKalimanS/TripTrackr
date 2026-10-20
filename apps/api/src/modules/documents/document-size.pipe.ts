import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import { MAX_DOCUMENT_BYTES } from '@triptrackr/contracts';

import { decodedLength } from './document-bytes';
import { documentTooLarge } from './documents.errors';

/**
 * Answers every document over MAX_DOCUMENT_BYTES with the contract's
 * `413 DOCUMENT_TOO_LARGE` (rest-api.md §6), ahead of schema validation.
 *
 * Without it the answer would depend on how far over the limit a document is:
 * past the upload route's body limit, the parser refuses it (app.setup.ts maps
 * that to the same 413); between the two, `CreateDocumentRequest`'s string
 * ceiling would refuse it as `400 VALIDATION_FAILED`. One condition, one answer.
 *
 * It measures and passes the body on untouched; everything else about the body
 * — including a `content_base64` that is not a string — is the schema's to
 * refuse. Visibility posture: reads a length, keeps nothing.
 */
export class DocumentSizePipe implements PipeTransform<unknown, unknown> {
  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const base64 = contentOf(value);

    if (base64 !== null && decodedLength(base64) > MAX_DOCUMENT_BYTES) {
      throw documentTooLarge();
    }

    return value;
  }
}

function contentOf(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;

  const { content_base64: content } = value as { content_base64?: unknown };
  return typeof content === 'string' ? content : null;
}
