import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { z } from 'zod';

import { loadEnv } from '@/common/config/env.schema';

/**
 * Raised when a response body does not satisfy the contract it claims to
 * implement. Carries the schema's failing paths and messages — "Unrecognized
 * key: "password_hash"", "Too big: expected string to have <=500 characters" —
 * never the values: a body that leaked a hash must not leak it a second time
 * through the log.
 */
export class ResponseContractViolation extends Error {
  constructor(readonly problems: readonly string[]) {
    super(
      `Response body violates its contract: ${problems.join('; ')}. ` +
        'The serialiser produced a field the shared schema does not allow, or ' +
        'omitted one it requires.',
    );
    this.name = 'ResponseContractViolation';
  }
}

const logger = new Logger('respond');

/**
 * Where a production violation is reported. An object rather than a bare call
 * so a spec can observe the report without reaching into the Sentry SDK, whose
 * exports are not writable.
 */
export const violationTelemetry = {
  capture(violation: ResponseContractViolation): void {
    Sentry.captureException(violation);
  },
};

/**
 * Validates a response body against its `@triptrackr/contracts` schema on the
 * way out.
 *
 * The contracts are strict for a reason spelled out on `UserProfile`: "a
 * serialiser that leaks `password_hash` or `deletion_requested_at` fails the
 * contract test rather than the traveller." That is only true if something
 * runs the schema against the body. Every handler returns through here.
 *
 * A mismatch **always** throws — the request 500s through the exception
 * filter, which answers with the generic error shape and nothing else. This is
 * fail-closed on purpose (Constitution I): the body the contract refused may
 * carry a field it forbids, and sending it anyway would turn a schema bug into
 * a disclosure. A `bio` stored one character over a later-added limit will take
 * `/me` down for that traveller until it is fixed; that is a recoverable
 * failure, and a leaked `password_hash` is not.
 *
 * In production the violation is additionally logged and reported to Sentry
 * (FR-073) so it is fixed quickly; outside production the red contract suite
 * is the report. The values themselves never appear in the log or the event —
 * only the paths and the schema's messages — for the same reason the check
 * exists.
 */
export function respond<TSchema extends z.ZodType>(
  schema: TSchema,
  value: z.input<TSchema>,
): z.output<TSchema> {
  const result = schema.safeParse(value);

  if (result.success) return result.data;

  const violation = new ResponseContractViolation(
    result.error.issues.map(
      (issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`,
    ),
  );

  if (loadEnv().NODE_ENV === 'production') {
    logger.error(violation.message, violation.stack);
    violationTelemetry.capture(violation);
  }

  throw violation;
}
