/**
 * Plain-language copy for authentication failures (T064; FR-072, feature 002 FR-010).
 *
 * The API's messages are already human-readable (contracts/README.md), but a
 * few codes deserve product wording tuned to the form they appear on — and a
 * network failure needs a sentence the server never got to write.
 */
import { ApiRequestError } from '@/lib/api-client';

export const AUTH_ERROR_COPY: Record<string, string> = {
  INVALID_CREDENTIALS: "That email and password don't match.",
  EMAIL_TAKEN: 'An account with that email already exists. Try signing in instead.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
  NETWORK: 'You seem to be offline. Check your connection and try again.',
  TIMEOUT: 'TripTrackr took too long to answer. Check your connection and try again.',
  SESSION_EXPIRED: 'Your session has expired. Please sign in again.',
  INVALID_RESPONSE:
    'The server sent something this version of the app does not understand. Please update the app.',
  OAUTH_TOKEN_INVALID: 'That sign-in could not be verified. Please try again.',
  OAUTH_PROVIDER_UNAVAILABLE:
    'Google or Apple could not be reached to confirm your sign-in. Please try again in a moment.',
  OAUTH_EMAIL_REQUIRED:
    'Your account needs an email address. Allow email sharing when signing in, or create an account with email.',
};

export const GENERIC_AUTH_ERROR = 'Something went wrong. Please try again.';

/** The sentence to show under the form for `error`. Never a stack trace, never a code. */
export function describeAuthError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    const known = AUTH_ERROR_COPY[error.code];
    if (known) return known;
    // Rate limiting may arrive as a bare 429 from the edge rather than the API.
    if (error.status === 429) return AUTH_ERROR_COPY.RATE_LIMITED!;
    if (error.code !== 'UNKNOWN') return error.message;
  }
  return GENERIC_AUTH_ERROR;
}
