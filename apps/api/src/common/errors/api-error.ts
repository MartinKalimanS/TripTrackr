import { HttpException, HttpStatus } from '@nestjs/common';

import type { ApiErrorBody } from '@/common/filters/http-exception.filter';

/**
 * A refusal in the one error shape (contracts/README.md), thrown as an
 * HttpException so the global filter passes it through exactly as written.
 *
 * Services throw these with a code the client can branch on and a sentence a
 * traveller can read (FR-072). Nothing internal — no SQL, no provider message —
 * belongs in either; `details` carries only structured facts the client acts
 * on, such as a retry window or the fields that failed validation.
 */
export function apiError(
  status: HttpStatus,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): HttpException {
  const body: ApiErrorBody = {
    error: details ? { code, message, details } : { code, message },
  };

  return new HttpException(body, status);
}

/**
 * Not-found and not-permitted are the same response (contracts/README.md,
 * rule 1). A distinguishable 403 confirms the resource exists, which is a
 * disclosure — so every owned-resource lookup that comes back empty, whether
 * because the row is missing, tombstoned, or someone else's, throws this.
 */
export function notFound(code: string, what: string): HttpException {
  return apiError(
    HttpStatus.NOT_FOUND,
    code,
    `${what} does not exist or you do not have access.`,
  );
}
