/**
 * Auth mutations and session persistence — tasks.md T065 (FR-001–FR-004).
 *
 * Every way into or out of a session is a TanStack mutation over `apiFetch`:
 * register, email + password login, Google (`id_token`), Apple
 * (`identity_token`), and sign-out. On success the token pair and the profile
 * are written to the keychain FIRST and the session store is flipped SECOND,
 * so a crash between the two can only leave a stored session that the next
 * launch picks up — never a signed-in screen with no tokens behind it.
 *
 * Authentication itself is online (rest-api.md §1); everything the traveller
 * records afterwards is local-first (Constitution II).
 */
import {
  AppleOAuthRequest,
  AuthTokens,
  GoogleOAuthRequest,
  LoginRequest,
  RegisterRequest,
  type UserProfile,
} from '@triptrackr/contracts';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';

import { useSessionStore } from '@/features/auth/session-store';
import { ApiRequestError, apiFetch } from '@/lib/api-client';
import { clearOfflineMaps } from '@/lib/mapbox';
import { clearSession, getSession, setSession } from '@/lib/secure-store';
import { Sentry } from '@/lib/sentry';

async function establishSession(tokens: AuthTokens): Promise<UserProfile> {
  await setSession({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    user: tokens.user,
  });
  useSessionStore.getState().signIn(tokens.user);
  return tokens.user;
}

async function authenticate(path: string, body: unknown): Promise<UserProfile> {
  const tokens = await apiFetch(AuthTokens, path, { method: 'POST', body, auth: false });
  return establishSession(tokens);
}

/** FR-001 — `POST /auth/register`. The input is validated by the form with `RegisterRequest`. */
export function useRegister() {
  return useMutation({
    mutationFn: (input: RegisterRequest) =>
      authenticate('/auth/register', RegisterRequest.parse(input)),
  });
}

/** FR-001 — `POST /auth/login`. */
export function useLogin() {
  return useMutation({
    mutationFn: (input: LoginRequest) =>
      authenticate('/auth/login', LoginRequest.parse(input)),
  });
}

/** FR-002 — `POST /auth/oauth/google` with the `id_token` from expo-auth-session. */
export function useGoogleSignIn() {
  return useMutation({
    mutationFn: (idToken: string) =>
      authenticate('/auth/oauth/google', GoogleOAuthRequest.parse({ id_token: idToken })),
  });
}

export interface AppleSignInInput {
  identityToken: string;
  /** Apple supplies the name only on the very first authorisation. */
  displayName?: string;
}

/** FR-002 — `POST /auth/oauth/apple` with the `identity_token` from expo-apple-authentication. */
export function useAppleSignIn() {
  return useMutation({
    mutationFn: ({ identityToken, displayName }: AppleSignInInput) =>
      authenticate(
        '/auth/oauth/apple',
        AppleOAuthRequest.parse({
          identity_token: identityToken,
          ...(displayName ? { display_name: displayName } : {}),
        }),
      ),
  });
}

/** Failures that are expected on the way out and change nothing about the outcome. */
const EXPECTED_SIGN_OUT_FAILURES = new Set(['NETWORK', 'TIMEOUT', 'SESSION_EXPIRED']);

function isExpectedSignOutFailure(error: unknown): boolean {
  return error instanceof ApiRequestError && EXPECTED_SIGN_OUT_FAILURES.has(error.code);
}

/**
 * FR-004 — sign out on this device. `POST /auth/logout` revokes the presented
 * refresh token; if the device is offline the local session is still ended
 * (the server-side token simply ages out) and anything unexpected is reported
 * rather than swallowed. The traveller's local database is left in place —
 * see `db/client.ts` for why — but the offline city maps are not: Mapbox keeps
 * them device-wide rather than per account (`clearOfflineMaps`). They go
 * first, while the session still stands, so a sign-out cut short leaves either
 * the session or a recorded wipe behind — never an ended session over another
 * account's saved cities.
 */
export function useSignOut() {
  return useMutation({
    mutationFn: async () => {
      const session = await getSession();
      if (session) {
        try {
          await apiFetch(z.unknown(), '/auth/logout', {
            method: 'POST',
            body: { refresh_token: session.refreshToken },
          });
        } catch (error) {
          if (!isExpectedSignOutFailure(error)) Sentry.captureException(error);
        }
      }
      await clearOfflineMaps();
      await clearSession();
      useSessionStore.getState().signOut();
    },
  });
}
