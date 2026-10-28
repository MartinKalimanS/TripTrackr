/**
 * Feature 008 (T803) - `useDeleteAccount` (FR-004, FR-005, FR-006). The API client and the wipe
 * are doubles; what is pinned is the request (one DELETE /me carrying the password and nothing
 * else), the ORDER (the server first, then the session ends, then this phone's copy goes), and
 * that a refusal changes nothing on the device.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { DeleteMeResponse } from '@triptrackr/contracts';
import type { PropsWithChildren } from 'react';

import { LocalStoreProvider, type AppDatabase } from '@/db/client';
import { useSessionStore } from '@/features/auth/session-store';
import { useDeleteAccount } from '@/features/auth/use-delete-account';
import { wipeLocalAccount } from '@/features/auth/wipe-local-account';
import { ApiRequestError } from '@/lib/api-client';
import { getSession, setSession } from '@/lib/secure-store';

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return { ...actual, apiFetch: jest.fn() };
});
jest.mock('@/features/auth/wipe-local-account', () => ({ wipeLocalAccount: jest.fn() }));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const { apiFetch } = jest.requireMock('@/lib/api-client') as { apiFetch: jest.Mock };
const wipe = wipeLocalAccount as jest.Mock;
const secureStore = jest.requireMock('expo-secure-store') as { __reset: () => void };

const db = { tag: 'db' } as unknown as AppDatabase;

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

const queryClient = new QueryClient({
  defaultOptions: { mutations: { retry: false, gcTime: 0 } },
});

function wrapperFor(store: AppDatabase | null) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <LocalStoreProvider value={{ db: store, error: null, retry: () => undefined }}>
          {children}
        </LocalStoreProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(async () => {
  secureStore.__reset();
  apiFetch.mockReset();
  wipe.mockReset().mockResolvedValue({ filesNamed: 0, failures: 0 });
  await setSession({ accessToken: 'access', refreshToken: 'refresh', user: profile });
  useSessionStore.setState({ status: 'signed-in', user: profile });
});

describe('useDeleteAccount', () => {
  test('sends DELETE /me with the password, and only the password', async () => {
    apiFetch.mockResolvedValue({ status: 'deletion_requested' });
    const { result } = await renderHook(() => useDeleteAccount(), {
      wrapper: wrapperFor(db),
    });

    await act(async () => {
      await result.current.mutateAsync({ password: 'my password' });
    });

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(DeleteMeResponse, '/me', {
      method: 'DELETE',
      body: { password: 'my password' },
    });
  });

  test('with no password (an account that signed in with Google or Apple) sends an empty body', async () => {
    apiFetch.mockResolvedValue({ status: 'deletion_requested' });
    const { result } = await renderHook(() => useDeleteAccount(), {
      wrapper: wrapperFor(db),
    });

    await act(async () => {
      await result.current.mutateAsync({});
    });

    expect(apiFetch.mock.calls[0]?.[2]).toEqual({ method: 'DELETE', body: {} });
  });

  test('once the server accepts: the session ends, then this phone forgets the account', async () => {
    const order: string[] = [];
    apiFetch.mockImplementation(() => {
      order.push('server');
      return Promise.resolve({ status: 'deletion_requested' });
    });
    wipe.mockImplementation(async () => {
      order.push(
        `wipe (session ${(await getSession()) === null ? 'ended' : 'still there'}, ${
          useSessionStore.getState().status
        })`,
      );
      return { filesNamed: 0, failures: 0 };
    });
    const { result } = await renderHook(() => useDeleteAccount(), {
      wrapper: wrapperFor(db),
    });

    await act(async () => {
      await result.current.mutateAsync({ password: 'my password' });
    });

    expect(order).toEqual(['server', 'wipe (session ended, signed-out)']);
    expect(wipe).toHaveBeenCalledWith(db, profile.id);
    expect(await getSession()).toBeNull();
    expect(useSessionStore.getState()).toMatchObject({
      status: 'signed-out',
      user: null,
    });
  });

  test('still signs out when there is no open store: there is nothing local to wipe', async () => {
    apiFetch.mockResolvedValue({ status: 'deletion_requested' });
    const { result } = await renderHook(() => useDeleteAccount(), {
      wrapper: wrapperFor(null),
    });

    await act(async () => {
      await result.current.mutateAsync({});
    });

    expect(wipe).not.toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe('signed-out');
  });

  test.each([
    ['a wrong or missing password', 403, 'REAUTHENTICATION_REQUIRED'],
    ['no connection', 0, 'NETWORK'],
    ['a server fault', 500, 'INTERNAL'],
  ])('%s changes nothing on this phone', async (_name, status, code) => {
    apiFetch.mockRejectedValue(new ApiRequestError(status, { code, message: code }));
    const { result } = await renderHook(() => useDeleteAccount(), {
      wrapper: wrapperFor(db),
    });

    await act(async () => {
      await result.current.mutateAsync({ password: 'x' }).catch(() => undefined);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(wipe).not.toHaveBeenCalled();
    expect(await getSession()).not.toBeNull();
    expect(useSessionStore.getState().status).toBe('signed-in');
  });
});
