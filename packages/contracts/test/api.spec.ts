import { ApiError } from '../src';

describe('ApiError', () => {
  it('is a code and a human-readable message (FR-072)', () => {
    expect(
      ApiError.safeParse({
        error: {
          code: 'TRIP_NOT_FOUND',
          message: 'Trip does not exist or you do not have access.',
        },
      }).success,
    ).toBe(true);
  });

  it('may carry structured details the client acts on — the allowance 409 (rest-api.md §3)', () => {
    expect(
      ApiError.safeParse({
        error: {
          code: 'TRIP_ALLOWANCE_REACHED',
          message:
            'You have 5 of 5 trips. Subscribe for unlimited trips, or delete a trip to make room.',
          details: { trips_held: 5, allowance: 5, routes: ['subscribe', 'delete_trip'] },
        },
      }).success,
    ).toBe(true);
  });

  it('refuses anything else on the envelope — internal detail must not cross the boundary', () => {
    for (const leak of [{ stack: 'at …' }, { sql: 'SELECT …' }, { cause: {} }]) {
      expect(
        ApiError.safeParse({ error: { code: 'X', message: 'y', ...leak } }).success,
      ).toBe(false);
    }
    expect(
      ApiError.safeParse({ error: { code: 'X', message: 'y' }, debug: true }).success,
    ).toBe(false);
  });

  it('keeps codes machine-readable: SCREAMING_SNAKE_CASE only', () => {
    expect(
      ApiError.safeParse({ error: { code: 'not-found', message: 'y' } }).success,
    ).toBe(false);
    expect(
      ApiError.safeParse({ error: { code: 'NOT_FOUND', message: 'y' } }).success,
    ).toBe(true);
  });
});
