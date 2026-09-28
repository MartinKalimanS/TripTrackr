/**
 * T065 — the auth mutations and what they persist.
 *
 * `apiFetch` is mocked (its own suite proves the wire behaviour); what is
 * pinned here is the ordering guarantee — keychain first, gate second — the
 * request each mutation makes, and that sign-out ends the local session even
 * when the server cannot be told.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { useSessionStore } from '@/features/auth/session-store';
import {
  useAppleSignIn,
  useGoogleSignIn,
  useLogin,
  useRegister,
  useSignOut,
} from '@/features/auth/use-session';
import { ApiRequestError } from '@/lib/api-client';
import { getSession, setSession } from '@/lib/secure-store';
import { Sentry } from '@/lib/sentry';

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return { ...actual, apiFetch: jest.fn() };
});

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const { apiFetch } = jest.requireMock('@/lib/api-client') as { apiFetch: jest.Mock };
const secureStore = jest.requireMock('expo-secure-store') as { __reset: () => void };

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

// gcTime 0: a mutation's garbage-collection timer (5 min by default) would
// otherwise outlive the test and keep the Jest worker from exiting cleanly.
const queryClient = new QueryClient({
  defaultOptions: {
    mutations: { retry: false, gcTime: 0 },
    queries: { retry: false, gcTime: 0 },
  },
});

function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  secureStore.__reset();
  useSessionStore.setState({ status: 'signed-out', user: null });
  apiFetch.mockReset();
});

describe('useRegister (FR-001)', () => {
  test('posts the validated payload without a bearer token, persists the session, then flips the gate', async () => {
    apiFetch.mockResolvedValueOnce(tokens);
    const { result } = await renderHook(() => useRegister(), { wrapper });

    result.current.mutate({
      email: '  Ana@Example.com ',
      password: 'correct horse battery',
      display_name: 'Ana',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetch).toHaveBeenCalledWith(expect.anything(), '/auth/register', {
      method: 'POST',
      body: {
        email: 'ana@example.com',
        password: 'correct horse battery',
        display_name: 'Ana',
      },
      auth: false,
    });
    await expect(getSession()).resolves.toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: profile,
    });
    expect(useSessionStore.getState()).toMatchObject({
      status: 'signed-in',
      user: profile,
    });
  });

  test('a refused registration leaves the device signed out with nothing stored', async () => {
    apiFetch.mockRejectedValueOnce(
      new ApiRequestError(409, { code: 'EMAIL_TAKEN', message: 'Taken.' }),
    );
    const { result } = await renderHook(() => useRegister(), { wrapper });

    result.current.mutate({
      email: 'a@b.co',
      password: 'correct horse battery',
      display_name: 'A',
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: 'EMAIL_TAKEN' });
    await expect(getSession()).resolves.toBeNull();
    expect(useSessionStore.getState().status).toBe('signed-out');
  });

  test('a keychain failure after a successful response does not flip the gate', async () => {
    apiFetch.mockResolvedValueOnce(tokens);
    const store = jest.requireMock('expo-secure-store') as { setItemAsync: jest.Mock };
    store.setItemAsync.mockRejectedValueOnce(new Error('Keychain unavailable'));
    const { result } = await renderHook(() => useRegister(), { wrapper });

    result.current.mutate({
      email: 'a@b.co',
      password: 'correct horse battery',
      display_name: 'A',
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(useSessionStore.getState().status).toBe('signed-out');
  });
});

describe('useLogin (FR-001)', () => {
  test('posts to /auth/login and establishes the session', async () => {
    apiFetch.mockResolvedValueOnce(tokens);
    const { result } = await renderHook(() => useLogin(), { wrapper });

    result.current.mutate({ email: 'ana@example.com', password: 'pw' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetch).toHaveBeenCalledWith(expect.anything(), '/auth/login', {
      method: 'POST',
      body: { email: 'ana@example.com', password: 'pw' },
      auth: false,
    });
    expect(useSessionStore.getState().status).toBe('signed-in');
  });
});

describe('OAuth sign-in (FR-002)', () => {
  test('Google sends the id_token', async () => {
    apiFetch.mockResolvedValueOnce(tokens);
    const { result } = await renderHook(() => useGoogleSignIn(), { wrapper });

    result.current.mutate('google-id-token');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetch).toHaveBeenCalledWith(expect.anything(), '/auth/oauth/google', {
      method: 'POST',
      body: { id_token: 'google-id-token' },
      auth: false,
    });
  });

  test('Apple sends the identity_token and the name only when Apple supplied one', async () => {
    apiFetch.mockResolvedValue(tokens);
    const { result } = await renderHook(() => useAppleSignIn(), { wrapper });

    result.current.mutate({ identityToken: 'apple-jwt', displayName: 'Ana' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetch).toHaveBeenLastCalledWith(expect.anything(), '/auth/oauth/apple', {
      method: 'POST',
      body: { identity_token: 'apple-jwt', display_name: 'Ana' },
      auth: false,
    });

    result.current.mutate({ identityToken: 'apple-jwt-2' });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(apiFetch).toHaveBeenLastCalledWith(expect.anything(), '/auth/oauth/apple', {
      method: 'POST',
      body: { identity_token: 'apple-jwt-2' },
      auth: false,
    });
  });
});

describe('useSignOut (FR-004)', () => {
  beforeEach(async () => {
    await setSession({ accessToken: 'access', refreshToken: 'refresh', user: profile });
    useSessionStore.setState({ status: 'signed-in', user: profile });
  });

  test('revokes the refresh token on the server, then clears the keychain and the gate', async () => {
    apiFetch.mockResolvedValueOnce(undefined);
    const { result } = await renderHook(() => useSignOut(), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetch).toHaveBeenCalledWith(expect.anything(), '/auth/logout', {
      method: 'POST',
      body: { refresh_token: 'refresh' },
    });
    await expect(getSession()).resolves.toBeNull();
    expect(useSessionStore.getState()).toMatchObject({
      status: 'signed-out',
      user: null,
    });
  });

  test.each([
    ['offline', 'NETWORK'],
    ['the server never answers', 'TIMEOUT'],
  ])(
    'still signs out locally when %s, without reporting the expected failure',
    async (_case, code) => {
      apiFetch.mockRejectedValueOnce(
        new ApiRequestError(0, { code, message: 'No answer' }),
      );
      const { result } = await renderHook(() => useSignOut(), { wrapper });

      result.current.mutate();

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      await expect(getSession()).resolves.toBeNull();
      expect(useSessionStore.getState().status).toBe('signed-out');
      expect(Sentry.captureException).not.toHaveBeenCalled();
    },
  );

  test('reports an unexpected server failure to Sentry and still signs out — never swallowed, never blocking', async () => {
    apiFetch.mockRejectedValueOnce(
      new ApiRequestError(500, { code: 'UNKNOWN', message: 'Boom' }),
    );
    const { result } = await renderHook(() => useSignOut(), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().status).toBe('signed-out');
  });

  test('with no stored session it skips the server call and just settles the gate', async () => {
    secureStore.__reset();
    const { result } = await renderHook(() => useSignOut(), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetch).not.toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe('signed-out');
  });
});
