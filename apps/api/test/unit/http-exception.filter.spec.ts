import {
  type ArgumentsHost,
  BadRequestException,
  ConflictException,
  HttpException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiError } from '@triptrackr/contracts';

import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';

/**
 * The single error envelope, and what may appear in it (FR-072, T030;
 * contracts/README.md "Error shape").
 *
 * The rule is one-directional: a message reaches the traveller only if
 * something deliberately wrote it for them — a Nest exception's own sentence,
 * class-validator's field errors, an Express 4xx that marks itself `expose`.
 * Anything else — a driver error naming `app.current_user_id`, a thrown
 * string, an object dressed as an HTTP error, an exception carrying arbitrary
 * fields or only a `cause`, an Express error that wraps an internal failure —
 * yields a fixed sentence or a stock phrase, and every body parses as the
 * strict `ApiError` contract. The detail goes to the log instead: a 5xx with
 * its stack at error level, a 4xx as one warning line carrying its code.
 */

const GENERIC = 'Something went wrong on our end. Please try again.';
const REQUEST = { method: 'POST', url: '/v1/trips' };

/** Nest's logger, captured rather than printed. */
let loggedErrors: jest.SpiedFunction<Logger['error']>;
let loggedWarnings: jest.SpiedFunction<Logger['warn']>;

beforeEach(() => {
  loggedErrors = jest
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);
  loggedWarnings = jest
    .spyOn(Logger.prototype, 'warn')
    .mockImplementation(() => undefined);
});

afterEach(() => {
  loggedErrors.mockRestore();
  loggedWarnings.mockRestore();
});

/** Runs the filter over one thrown value and returns what the traveller receives. */
function answer(thrown: unknown): { status?: number; body?: unknown } {
  const sent: { status?: number; body?: unknown } = {};
  const response = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: unknown) {
      sent.body = body;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => REQUEST }),
  } as unknown as ArgumentsHost;

  new HttpExceptionFilter().catch(thrown, host);

  return sent;
}

interface Case {
  readonly label: string;
  readonly thrown: unknown;
  readonly status: number;
  readonly code: string;
  readonly message: string;
}

describe('HttpExceptionFilter — what the traveller may read', () => {
  const writtenForTheCaller: readonly Case[] = [
    {
      label: "a Nest exception's own sentence",
      thrown: new NotFoundException('Trip does not exist or you do not have access.'),
      status: 404,
      code: 'NOT_FOUND',
      message: 'Trip does not exist or you do not have access.',
    },
    {
      label: 'field errors, joined into one sentence',
      thrown: new BadRequestException([
        'name must be a string',
        'start_date must be a date',
      ]),
      status: 400,
      code: 'BAD_REQUEST',
      message: 'name must be a string; start_date must be a date',
    },
    {
      label: 'a bare string response',
      thrown: new HttpException('Trip does not exist or you do not have access.', 404),
      status: 404,
      code: 'NOT_FOUND',
      message: 'Trip does not exist or you do not have access.',
    },
    {
      label: 'an Express 4xx that marks its message exposable',
      thrown: Object.assign(new Error('request entity too large'), {
        status: 413,
        expose: true,
      }),
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'request entity too large',
    },
    {
      label: 'a 5xx sentence under the generic code, its status having none of its own',
      thrown: new ServiceUnavailableException(
        'The planner is busy. Please try again shortly.',
      ),
      status: 503,
      code: 'INTERNAL_ERROR',
      message: 'The planner is busy. Please try again shortly.',
    },
  ];

  it.each(writtenForTheCaller)('forwards $label', ({ thrown, status, code, message }) => {
    const sent = answer(thrown);

    expect(sent).toEqual({ status, body: { error: { code, message } } });
    expect(ApiError.safeParse(sent.body).success).toBe(true);
  });

  it('passes the documented envelope through exactly as the controller wrote it', () => {
    const envelope = {
      error: {
        code: 'TRIP_ALLOWANCE_REACHED',
        message: 'You have reached the number of trips your plan allows.',
        details: { trips_held: 3, allowance: 3 },
      },
    };

    const sent = answer(new ConflictException(envelope));

    expect(sent).toEqual({ status: 409, body: envelope });
    expect(ApiError.safeParse(sent.body).success).toBe(true);
  });
});

describe('HttpExceptionFilter — what never reaches the traveller', () => {
  const neverForwarded: readonly (Case & { readonly secret: string })[] = [
    {
      label: 'a driver error naming the session variable',
      thrown: new Error('unrecognized configuration parameter "app.current_user_id"'),
      status: 500,
      code: 'INTERNAL_ERROR',
      message: GENERIC,
      secret: 'current_user_id',
    },
    {
      label: 'a thrown string',
      thrown: 'connection terminated unexpectedly',
      status: 500,
      code: 'INTERNAL_ERROR',
      message: GENERIC,
      secret: 'terminated',
    },
    {
      label: 'a plain object dressed as an HTTP error',
      thrown: { status: 404, message: 'relation "trips" does not exist' },
      status: 500,
      code: 'INTERNAL_ERROR',
      message: GENERIC,
      secret: 'relation',
    },
    {
      label: 'an Error whose status is not an error status',
      thrown: Object.assign(new Error('SELECT * FROM documents'), { status: 302 }),
      status: 500,
      code: 'INTERNAL_ERROR',
      message: GENERIC,
      secret: 'documents',
    },
    {
      label: 'an Express 4xx that does not mark its message exposable',
      thrown: Object.assign(new Error('ENOENT: /srv/uploads/tmp-7f3a'), {
        status: 400,
        expose: false,
      }),
      status: 400,
      code: 'BAD_REQUEST',
      message: GENERIC,
      secret: 'ENOENT',
    },
    {
      label: 'an Express 5xx, even one marked exposable',
      thrown: Object.assign(new Error('pool exhausted: 20 of 20 connections busy'), {
        status: 503,
        expose: true,
      }),
      status: 503,
      code: 'INTERNAL_ERROR',
      message: GENERIC,
      secret: 'pool',
    },
    {
      label: 'an HttpException carrying arbitrary fields',
      thrown: new HttpException(
        { query: 'SELECT * FROM trips WHERE owner_id = $1' },
        400,
      ),
      status: 400,
      code: 'BAD_REQUEST',
      message: 'Http Exception',
      secret: 'SELECT',
    },
    {
      label: 'an HttpException thrown with only a cause',
      thrown: new BadRequestException(undefined, {
        cause: new Error(
          'duplicate key value violates unique constraint "users_email_key"',
        ),
      }),
      status: 400,
      code: 'BAD_REQUEST',
      message: 'Bad Request Exception',
      secret: 'users_email_key',
    },
  ];

  it.each(neverForwarded)(
    'does not forward $label',
    ({ thrown, status, code, message, secret }) => {
      const sent = answer(thrown);

      expect(sent).toEqual({ status, body: { error: { code, message } } });
      expect(ApiError.safeParse(sent.body).success).toBe(true);
      expect(JSON.stringify(sent.body)).not.toContain(secret);
    },
  );
});

describe('HttpExceptionFilter — what goes to the log instead', () => {
  const failure = new Error('unrecognized configuration parameter "app.current_user_id"');

  it.each([
    { label: 'an Error, with its stack', thrown: failure, detail: failure.stack },
    {
      label: 'a non-Error, as text',
      thrown: 'connection terminated unexpectedly',
      detail: 'connection terminated unexpectedly',
    },
  ])('logs a 5xx at error level: $label', ({ thrown, detail }) => {
    answer(thrown);

    expect(loggedErrors).toHaveBeenCalledWith('POST /v1/trips -> 500', detail);
    expect(loggedWarnings).not.toHaveBeenCalled();
  });

  it('logs a 4xx as one warning line with its code, and nothing at error level', () => {
    answer(new NotFoundException('Trip does not exist or you do not have access.'));

    expect(loggedWarnings).toHaveBeenCalledWith('POST /v1/trips -> 404 NOT_FOUND');
    expect(loggedErrors).not.toHaveBeenCalled();
  });
});
