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

import { useSessionStore } from '@/features/auth/session-store';
import { apiFetch } from '@/lib/api-client';
import { setSession } from '@/lib/secure-store';

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

/**
 * A mutation keeps its variables, here the password, for as long as it is cached, and by
 * default it stays cached for five minutes after its last observer, which is the screen
 * the session gate unmounts the moment sign-in succeeds. `gcTime: 0` drops the mutation,
 * and the password in it, as soon as nothing observes it (T447; the retry of a refused
 * attempt drops the previous attempt the same way). Pinned by
 * `test/features/use-session-retention.test.tsx`.
 */
const DROP_WITH_ITS_SCREEN = { gcTime: 0 } as const;

/** FR-001 — `POST /auth/register`. The input is validated by the form with `RegisterRequest`. */
export function useRegister() {
  return useMutation({
    ...DROP_WITH_ITS_SCREEN,
    mutationFn: (input: RegisterRequest) =>
      authenticate('/auth/register', RegisterRequest.parse(input)),
  });
}

/** FR-001 — `POST /auth/login`. */
export function useLogin() {
  return useMutation({
    ...DROP_WITH_ITS_SCREEN,
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

/**
 * FR-004 — sign out on this device. The hook lives in `use-sign-out.ts` (T137),
 * beside the guard that pushes first and warns before leaving anything
 * unsynced behind; it is re-exported here so every existing import keeps
 * working.
 */
export { useSignOut } from '@/features/auth/use-sign-out';
