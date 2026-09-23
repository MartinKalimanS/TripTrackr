import { ApiError } from '../src';

describe('ApiError', () => {
  it('is a code and a human-readable message, nothing else (FR-072)', () => {
    expect(
      ApiError.safeParse({
        error: { code: 'TRIP_NOT_FOUND', message: 'Trip does not exist or you do not have access.' },
      }).success,
    ).toBe(true);
    // Internal detail must not cross the boundary — the shape refuses extra keys.
    expect(
      ApiError.safeParse({
        error: { code: 'X', message: 'y', stack: 'at …' },
      }).success,
    ).toBe(false);
  });
});
