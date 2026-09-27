import { HttpException } from '@nestjs/common';
import {
  ApiError,
  CreateStopRequest,
  CreateTripRequest,
  CitiesQuery,
} from '@triptrackr/contracts';

import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';

/**
 * Inbound validation against the shared contracts (research D-13).
 *
 * The pipe's job is two-sided: hand the handler a value the contract has
 * accepted, and turn a refusal into the one error envelope with paths and
 * messages a traveller can act on — never zod's own issue codes or the
 * expected/received internals, which are implementation detail (FR-072).
 */
describe('ZodValidationPipe', () => {
  const metadata = { type: 'body' as const };

  it('returns the parsed value, with the schema transforms applied', () => {
    const pipe = new ZodValidationPipe(CreateTripRequest);

    const value = pipe.transform(
      { title: '  Italy, spring  ', home_currency: 'EUR' },
      metadata,
    );

    expect(value).toEqual({ title: 'Italy, spring', home_currency: 'EUR' });
  });

  it('coerces query strings the way the contract asks', () => {
    const pipe = new ZodValidationPipe(CitiesQuery);

    expect(pipe.transform({ q: 'par', limit: '5' }, { type: 'query' })).toEqual({
      q: 'par',
      limit: 5,
    });
    expect(pipe.transform({}, { type: 'query' })).toEqual({ limit: 20 });
  });

  it('refuses with 400 VALIDATION_FAILED in the error envelope', () => {
    const pipe = new ZodValidationPipe(CreateTripRequest);

    let thrown: unknown;
    try {
      pipe.transform({ title: '', home_currency: 'euro', status: 'active' }, metadata);
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(HttpException);
    const exception = thrown as HttpException;
    expect(exception.getStatus()).toBe(400);

    const body = exception.getResponse();
    expect(ApiError.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });

  it('reports each problem as a dotted path and a message, and nothing else', () => {
    const pipe = new ZodValidationPipe(CreateTripRequest);

    const body = catchBody(() =>
      pipe.transform({ title: '', home_currency: 'euro', status: 'active' }, metadata),
    );
    const issues = (body.error.details as { issues: unknown[] }).issues;

    expect(issues).toEqual(
      expect.arrayContaining([
        { path: 'title', message: expect.any(String) as unknown },
        { path: 'home_currency', message: expect.any(String) as unknown },
        // The unknown key is reported at the root with the key named in the
        // message, so the client learns what to drop.
        { path: '', message: expect.stringContaining('status') as unknown },
      ]),
    );
    for (const issue of issues as Record<string, unknown>[]) {
      expect(Object.keys(issue).sort()).toEqual(['message', 'path']);
    }
    expect(JSON.stringify(body)).not.toMatch(
      /"code":"(too_small|invalid_format|unrecognized_keys)"/,
    );
    expect(JSON.stringify(body)).not.toMatch(/"expected"|"received"|"input"/);
  });

  it('joins nested paths with dots so a client can address a field', () => {
    const pipe = new ZodValidationPipe(CreateStopRequest);

    const body = catchBody(() =>
      pipe.transform(
        { city_id: 1, arrive_date: '2026-06-10', depart_date: '2026-06-01' },
        metadata,
      ),
    );
    const issues = (body.error.details as { issues: { path: string }[] }).issues;

    // The refinement names depart_date (contracts/sync/records.ts).
    expect(issues.map((i) => i.path)).toContain('depart_date');
  });

  it('refuses a body that is not an object at all', () => {
    const pipe = new ZodValidationPipe(CreateTripRequest);

    expect(() => pipe.transform('a string', metadata)).toThrow(HttpException);
    expect(() => pipe.transform(undefined, metadata)).toThrow(HttpException);
  });
});

function catchBody(fn: () => unknown): ApiError {
  try {
    fn();
  } catch (error: unknown) {
    if (error instanceof HttpException) return error.getResponse() as ApiError;
    throw error;
  }
  throw new Error('expected the pipe to throw');
}
