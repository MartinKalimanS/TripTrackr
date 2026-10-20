/**
 * T064 — API failures become sentences a traveller can act on (FR-072).
 */
import { GENERIC_AUTH_ERROR, describeAuthError } from '@/features/auth/auth-errors';
import { ApiRequestError } from '@/lib/api-client';

// The real Sentry SDK starts background timers on import; nothing here reports.
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const apiError = (status: number, code: string, message = 'Server said so.') =>
  new ApiRequestError(status, { code, message });

describe('describeAuthError', () => {
  test.each([
    ['INVALID_CREDENTIALS', "That email and password don't match."],
    ['EMAIL_TAKEN', 'An account with that email already exists. Try signing in instead.'],
    ['RATE_LIMITED', 'Too many attempts. Please wait a moment and try again.'],
    ['NETWORK', 'You seem to be offline. Check your connection and try again.'],
    [
      'TIMEOUT',
      'TripTrackr took too long to answer. Check your connection and try again.',
    ],
  ])('%s has product copy', (code, copy) => {
    expect(describeAuthError(apiError(400, code))).toBe(copy);
  });

  test('a bare 429 from the edge reads as rate limiting', () => {
    expect(describeAuthError(apiError(429, 'TOO_MANY'))).toMatch(/Too many attempts/);
  });

  test('an unmapped API code falls back to the server’s own human-readable message', () => {
    expect(
      describeAuthError(apiError(400, 'VALIDATION', 'Display name is required.')),
    ).toBe('Display name is required.');
  });

  test('UNKNOWN bodies and non-API errors get the generic sentence — never a stack trace', () => {
    expect(describeAuthError(apiError(502, 'UNKNOWN'))).toBe(GENERIC_AUTH_ERROR);
    expect(describeAuthError(new TypeError('x is not a function'))).toBe(
      GENERIC_AUTH_ERROR,
    );
    expect(describeAuthError(undefined)).toBe(GENERIC_AUTH_ERROR);
  });
});
