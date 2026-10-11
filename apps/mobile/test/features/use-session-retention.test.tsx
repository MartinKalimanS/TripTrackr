/**
 * T447 - how long a password stays in memory after Sign in or Create account (AGENTS.md
 * security gate; the light review of the auth screens).
 *
 * TanStack Query keeps the VARIABLES of a mutation, here `{ email, password }`, on the
 * mutation itself, and keeps the mutation in the cache for `gcTime` after its last observer
 * is gone: five minutes by default. A traveller who signs in has the screen unmounted by the
 * session gate straight away, so without an override the password would sit in the mutation
 * cache for five minutes after the request that needed it. `gcTime: 0` on the two credential
 * mutations makes the mutation go the moment nothing observes it.
 *
 * The client here is a DEFAULT one, on purpose: `use-session.test.tsx` builds its client with
 * `gcTime: 0` so a timer does not outlive a test, which would hide this.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { useSessionStore } from '@/features/auth/session-store';
import { useLogin, useRegister } from '@/features/auth/use-session';
import { ApiRequestError } from '@/lib/api-client';

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return { ...actual, apiFetch: jest.fn() };
});

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const { apiFetch } = jest.requireMock('@/lib/api-client') as { apiFetch: jest.Mock };

const SECRET = 'Zq9-never-keep-this-passphrase';

const profile = {
  id: '6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e4f',
  email: 'ana@example.com',
  display_name: 'Ana',
  avatar_url: null,
  bio: null,
  home_currency: 'EUR',
  is_profile_public: false,
  email_verified_at: null,
  created_at: '2026-09-01T10:00:00.000Z',
};
const tokens = { access_token: 'access', refresh_token: 'refresh', user: profile };

let queryClient: QueryClient;

function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** Everything the mutation cache still holds, as text. */
const retained = () =>
  JSON.stringify(
    queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.state),
  );

/** Lets a zero-length garbage-collection timer fire. */
const nextTimer = () => new Promise((resolve) => setTimeout(resolve, 20));

beforeEach(() => {
  // The defaults of the app's own client (`src/app/_layout.tsx`): nothing about mutations.
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
  apiFetch.mockReset();
  useSessionStore.setState({ status: 'signed-out', user: null });
});

afterEach(() => {
  queryClient.getMutationCache().clear();
  queryClient.clear();
});

describe.each([
  ['useLogin', useLogin, { email: 'ana@example.com', password: SECRET }],
  [
    'useRegister',
    useRegister,
    { email: 'ana@example.com', password: SECRET, display_name: 'Ana' },
  ],
] as const)('%s - what stays in memory (T447)', (_name, useMutationHook, input) => {
  test('the mutation, and the password in it, are dropped once the screen is gone', async () => {
    apiFetch.mockResolvedValue(tokens);
    const { result, unmount } = await renderHook(() => useMutationHook(), { wrapper });

    result.current.mutate(input as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // While the screen is there the mutation is observed and kept, as it has to be.
    expect(retained()).toContain(SECRET);

    await unmount();
    await nextTimer();

    expect(queryClient.getMutationCache().getAll()).toEqual([]);
    expect(retained()).not.toContain(SECRET);
  });

  test('a refused attempt does not keep its password once it is retried or the screen leaves', async () => {
    apiFetch.mockRejectedValue(
      new ApiRequestError(401, { code: 'INVALID_CREDENTIALS', message: 'x' }),
    );
    const { result, unmount } = await renderHook(() => useMutationHook(), { wrapper });

    result.current.mutate(input as never);
    await waitFor(() => expect(result.current.isError).toBe(true));
    await unmount();
    await nextTimer();

    expect(retained()).not.toContain(SECRET);
  });

  test('a second attempt on the same screen leaves only one attempt’s password behind, not both', async () => {
    apiFetch.mockRejectedValue(
      new ApiRequestError(401, { code: 'INVALID_CREDENTIALS', message: 'x' }),
    );
    const { result } = await renderHook(() => useMutationHook(), { wrapper });

    result.current.mutate(input as never);
    await waitFor(() => expect(result.current.isError).toBe(true));
    result.current.mutate({ ...input, password: `${SECRET}-second` } as never);
    await waitFor(() =>
      expect(result.current.variables).toMatchObject({ password: `${SECRET}-second` }),
    );
    await nextTimer();

    expect(queryClient.getMutationCache().getAll()).toHaveLength(1);
  });
});
