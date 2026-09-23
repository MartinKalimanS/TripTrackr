import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * The single error shape (contracts/rest-api.md).
 *
 * ```json
 * { "error": { "code": "TRIP_ALLOWANCE_REACHED", "message": "…", "details": { … } } }
 * ```
 */
export interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: Record<string, unknown>;
  };
}

/** Status codes at or above this are defects rather than considered answers. */
const LOWEST_SERVER_ERROR_STATUS = 500;
const LOWEST_CLIENT_ERROR_STATUS = 400;
const HIGHEST_STATUS = 599;

/** The one sentence an unrecognised failure is allowed to say. */
const GENERIC_MESSAGE = 'Something went wrong on our end. Please try again.';

/**
 * An error raised by Express's own middleware — the body parser's 413, an
 * `http-errors` 415 — rather than by Nest. Not an HttpException, but it carries
 * the status it means and an `expose` flag saying whether its message was
 * written for the caller. Nest maps only JSON `SyntaxError` before handing the
 * rest to this filter, so without recognising the shape a body over the limit
 * would be reported and logged as a 500 defect when it is a considered answer.
 */
interface ExpressHttpError extends Error {
  readonly status: number;
  readonly expose?: boolean;
}

/**
 * Turns every thrown thing into that shape, and nothing else (FR-072).
 *
 * The rule this enforces is one-directional: a message reaches the traveller only
 * if something deliberately wrote it for them. An unrecognised error yields a
 * fixed sentence and nothing more. That matters more here than in most services,
 * because the layer underneath is PostgreSQL RLS — a policy failure surfaces as
 * `unrecognized configuration parameter "app.current_user_id"`, and a filter that
 * helpfully forwarded `error.message` would publish the name of the session
 * variable, the schema, and often a fragment of the failing query. The stack goes
 * to the log, where it is useful; the caller gets a sentence.
 *
 * Registered once, as `APP_FILTER` in AppModule, so the contract suite and the
 * running process share it.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const status = statusOf(exception);
    const body = this.toBody(exception, status);

    // Full detail, server-side only. A 5xx is a defect and needs the stack; a 4xx
    // is a normal outcome and would be noise at error level.
    if (status >= LOWEST_SERVER_ERROR_STATUS) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} -> ${status} ${body.error.code}`,
      );
    }

    response.status(status).json(body);
  }

  private toBody(exception: unknown, status: number): ApiErrorBody {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();

      // A controller that threw the documented envelope deliberately — the
      // allowance 409, for instance — passes through exactly as written.
      if (isApiErrorBody(payload)) return payload;

      // Nest's own shape: { statusCode, message, error }. `message` here is
      // either a stock phrase or class-validator's field errors, both of which
      // are written for the caller and safe to forward.
      if (isNestErrorPayload(payload)) {
        return {
          error: {
            code: codeForStatus(status),
            message: Array.isArray(payload.message)
              ? payload.message.join('; ')
              : (payload.message ?? exception.message),
          },
        };
      }

      return { error: { code: codeForStatus(status), message: exception.message } };
    }

    // Express's own 4xx. `expose` is http-errors' word for "this message was
    // written for the client" — it is true for a 413 and false for anything
    // that wraps an internal failure, and the filter honours it as such.
    if (isExpressHttpError(exception) && status < LOWEST_SERVER_ERROR_STATUS) {
      return {
        error: {
          code: codeForStatus(status),
          message: exception.expose === true ? exception.message : GENERIC_MESSAGE,
        },
      };
    }

    // Anything unrecognised. Deliberately says nothing about what happened —
    // see the class comment.
    return { error: { code: 'INTERNAL_ERROR', message: GENERIC_MESSAGE } };
  }
}

/**
 * Annotated as `number` rather than inferred: `getStatus()` returns a plain
 * number while the fallback is an `HttpStatus` member, and the resulting union
 * cannot be compared against either one without a type complaint.
 */
function statusOf(exception: unknown): number {
  if (exception instanceof HttpException) return exception.getStatus();
  if (isExpressHttpError(exception)) return exception.status;

  return HttpStatus.INTERNAL_SERVER_ERROR;
}

function isExpressHttpError(value: unknown): value is ExpressHttpError {
  if (!(value instanceof Error) || !('status' in value)) return false;

  const { status } = value as { status: unknown };

  return (
    typeof status === 'number' &&
    Number.isInteger(status) &&
    status >= LOWEST_CLIENT_ERROR_STATUS &&
    status <= HIGHEST_STATUS
  );
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;

  const { error } = value;

  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    typeof (error as { message: unknown }).message === 'string'
  );
}

function isNestErrorPayload(
  value: unknown,
): value is { message?: string | string[]; error?: string } {
  return typeof value === 'object' && value !== null && 'message' in value;
}

/**
 * A stable machine-readable code for statuses raised without one, so a client can
 * branch on `error.code` rather than parsing prose.
 */
function codeForStatus(status: number): string {
  const codes: Readonly<Record<number, string>> = {
    [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
    [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
    [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
    [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
    [HttpStatus.CONFLICT]: 'CONFLICT',
    [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
    [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
    [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  };

  return codes[status] ?? 'INTERNAL_ERROR';
}
