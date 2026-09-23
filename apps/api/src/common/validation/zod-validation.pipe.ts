import { type ArgumentMetadata, HttpStatus, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

import { apiError } from '@/common/errors/api-error';

/** One problem, as the client sees it: where, and what to tell the traveller. */
export interface ValidationIssue {
  /** Dotted path from the root of the payload; empty for a root-level problem. */
  readonly path: string;
  readonly message: string;
}

/**
 * Validates a body, query, or parameter against a schema from
 * `@triptrackr/contracts` (research D-13) and hands the handler the parsed
 * value — trimmed, lower-cased, coerced, exactly as the contract defines it.
 *
 * ```ts
 * @Body(new ZodValidationPipe(RegisterRequest)) body: RegisterRequest
 * ```
 *
 * A refusal is a 400 in the error envelope, code `VALIDATION_FAILED`, with
 * `details.issues` listing paths and messages and nothing else. Zod's own issue
 * codes, `expected`/`received` pairs and the offending input are implementation
 * detail — and the input can be a password (FR-072).
 *
 * The strict contracts do most of the privacy work here: a `status` on a trip,
 * or a visibility flag on an expense, is an unrecognised key and is refused
 * rather than ignored (FR-013, FR-027, FR-032).
 *
 * Applied per handler rather than globally so that each route names the exact
 * contract it accepts; the global class-validator pipe stays registered and is
 * inert for the plain object types these handlers declare.
 */
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform<
  unknown,
  z.output<TSchema>
> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): z.output<TSchema> {
    const result = this.schema.safeParse(value);

    if (result.success) return result.data;

    throw apiError(
      HttpStatus.BAD_REQUEST,
      'VALIDATION_FAILED',
      'Some of the information provided is not valid. Please check it and try again.',
      { issues: toIssues(result.error) },
    );
  }
}

export function toIssues(error: z.ZodError): readonly ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}
