import { HttpStatus, type HttpException } from '@nestjs/common';
import { MAX_DOCUMENT_BYTES } from '@triptrackr/contracts';

import { apiError, notFound } from '@/common/errors/api-error';

/**
 * The refusals of the document routes (rest-api.md §6), in one place so the
 * controllers, the service and the upload route's body parser (app.setup.ts)
 * answer each case with the same code and the same sentence.
 *
 * Visibility posture: none of these names anything about a row — not whether
 * it exists, not whose it is (contracts/README.md rule 1; FR-072).
 */

const MEGABYTE = 1024 * 1024;

/** Also the answer for a document that is someone else's, or tombstoned. */
export const documentNotFound = (): HttpException =>
  notFound('DOCUMENT_NOT_FOUND', 'Document');

/** Every size above the ceiling, whether the parser or the service measured it. */
export const documentTooLarge = (): HttpException =>
  apiError(
    HttpStatus.PAYLOAD_TOO_LARGE,
    'DOCUMENT_TOO_LARGE',
    `The document is larger than ${MAX_DOCUMENT_BYTES / MEGABYTE} MB. Please use a smaller image.`,
  );

/** An id held by another trip's document, or by a row the caller cannot see. */
export const documentIdUnavailable = (): HttpException =>
  apiError(
    HttpStatus.CONFLICT,
    'DOCUMENT_ID_UNAVAILABLE',
    'That document id is already in use. Please retry with a new id.',
  );

/** `PATCH {confirmed: true}` with no extracted fields on the row. */
export const nothingToConfirm = (): HttpException =>
  apiError(
    HttpStatus.CONFLICT,
    'DOCUMENT_NOTHING_TO_CONFIRM',
    'There are no extracted details to confirm. Please enter them first.',
  );

const VALIDATION_MESSAGE =
  'Some of the information provided is not valid. Please check it and try again.';

/**
 * A request the schema accepted but the document refuses: bytes that are not
 * the declared image type, or fields on something that is not a boarding pass.
 * 422, in the validation pipe's own envelope, so a client handles both alike.
 */
export function documentInvalid(path: string, message: string): HttpException {
  return apiError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    'VALIDATION_FAILED',
    VALIDATION_MESSAGE,
    {
      issues: [{ path, message }],
    },
  );
}
