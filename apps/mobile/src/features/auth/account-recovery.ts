/**
 * Account recovery (spec 015 User Story 6; FR-015, FR-016, FR-017; T1511): asking for a password
 * reset, choosing a new password from the emailed link, and confirming an address.
 *
 * All three calls are public (`auth: false`): the traveller of a reset link cannot sign in, and
 * a verification link works signed in or out. The link's token is checked for SHAPE before it is
 * sent (`RECOVERY_TOKEN_SHAPE`; the server issues 32 random bytes as base64url) and is never
 * shown, logged or reported: a refusal is described in fixed words, not with the server's text,
 * and the mutations drop their variables with their screen (`gcTime: 0`).
 */
import {
  PasswordResetConfirm,
  PasswordResetRequest,
  VerifyEmailRequest,
} from '@triptrackr/contracts';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';

import type { FieldErrors } from '@/features/auth/form-validation';
import { ApiRequestError, apiFetch } from '@/lib/api-client';

/** What a link's `token` may look like: base64url, 16 to 200 characters. */
export const RECOVERY_TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,200}$/;

const PASSWORD_FLOOR = 12;
export const PASSWORD_MISMATCH = 'Passwords do not match';

/** The token of a route's search parameters, or `null` when it is absent or malformed. */
export function readRecoveryToken(raw: unknown): string | null {
  const value: unknown = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && RECOVERY_TOKEN_SHAPE.test(value) ? value : null;
}

export function validateResetEmail(email: string): FieldErrors<'email'> {
  return PasswordResetRequest.safeParse({ email }).success
    ? {}
    : { email: 'Enter a valid email address.' };
}

export function validateNewPassword(
  password: string,
  confirmation: string,
): FieldErrors<'password' | 'confirmation'> {
  if (password.length < PASSWORD_FLOOR)
    return { password: 'Use at least 12 characters.' };
  if (confirmation !== password) return { confirmation: PASSWORD_MISMATCH };
  return {};
}

export type RecoveryFailure = {
  /** `invalid-link`: expired, used or malformed, so only a new request helps. */
  kind: 'invalid-link' | 'retry';
  message: string;
};

const INVALID_LINK_CODES = new Set([
  'RESET_TOKEN_INVALID',
  'VERIFICATION_TOKEN_INVALID',
  'INVALID_RECOVERY_TOKEN',
]);

export function describeRecoveryFailure(error: unknown): RecoveryFailure {
  if (error instanceof ApiRequestError) {
    if (INVALID_LINK_CODES.has(error.code)) {
      return {
        kind: 'invalid-link',
        message: 'This link has expired, was already used, or is not valid.',
      };
    }
    if (error.code === 'NETWORK' || error.code === 'TIMEOUT') {
      return {
        kind: 'retry',
        message: 'You seem to be offline. Check your connection and try again.',
      };
    }
    if (error.status === 429) {
      return {
        kind: 'retry',
        message: 'Too many attempts. Please wait a moment and try again.',
      };
    }
  }
  return { kind: 'retry', message: 'Something went wrong. Please try again.' };
}

const DROP_WITH_ITS_SCREEN = { gcTime: 0 } as const;
const NO_BODY = z.unknown();

function invalidLink(): ApiRequestError {
  return new ApiRequestError(400, {
    code: 'INVALID_RECOVERY_TOKEN',
    message: 'This link is not valid.',
  });
}

/** `POST /auth/password-reset/request`: answered the same way for a known address or not. */
export function useRequestPasswordReset() {
  return useMutation({
    ...DROP_WITH_ITS_SCREEN,
    mutationFn: async (input: PasswordResetRequest) => {
      const body = PasswordResetRequest.parse(input);
      await apiFetch(NO_BODY, '/auth/password-reset/request', {
        method: 'POST',
        body,
        auth: false,
      });
    },
  });
}

/** `POST /auth/password-reset/confirm`. */
export function useConfirmPasswordReset() {
  return useMutation({
    ...DROP_WITH_ITS_SCREEN,
    mutationFn: async (input: PasswordResetConfirm) => {
      if (!readRecoveryToken(input.token)) throw invalidLink();
      const body = PasswordResetConfirm.parse(input);
      await apiFetch(NO_BODY, '/auth/password-reset/confirm', {
        method: 'POST',
        body,
        auth: false,
      });
    },
  });
}

/** `POST /auth/verify-email`. */
export function useVerifyEmail() {
  return useMutation({
    ...DROP_WITH_ITS_SCREEN,
    mutationFn: async (input: VerifyEmailRequest) => {
      if (!readRecoveryToken(input.token)) throw invalidLink();
      const body = VerifyEmailRequest.parse(input);
      await apiFetch(NO_BODY, '/auth/verify-email', {
        method: 'POST',
        body,
        auth: false,
      });
    },
  });
}
