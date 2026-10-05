/**
 * T137 — the sign-out guard (Constitution V; sync-protocol.md §3 last row and
 * §6 scenario 11).
 *
 * Signing out must never be silent while the device holds content the server
 * has not acknowledged. The engine and the upload queue are doubles; what is
 * pinned is the ORDER (push first, ask the server to forget the token second),
 * the verdict (count what is left, dirty rows AND bytes still waiting), and
 * that a verdict of "something remains" ends the sign-out with a typed error the
 * profile turns into an explicit warning — while the existing behaviour
 * (offline tolerated, expected failures unreported, no store = nothing to
 * guard) is untouched.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { LocalStoreProvider, type AppDatabase } from '@/db/client';
import { useSessionStore } from '@/features/auth/session-store';
import {
  SIGN_OUT_FLUSH_DEADLINE_MS,
  UnsyncedChangesError,
  isUnsyncedChangesError,
  useSignOut,
} from '@/features/auth/use-sign-out';
import { useSignOut as useSignOutFromSession } from '@/features/auth/use-session';
import { ApiRequestError } from '@/lib/api-client';
import { clearSession, getSession, setSession } from '@/lib/secure-store';
import { Sentry } from '@/lib/sentry';
import { countUnsynced, syncNow } from '@/sync/engine';
import { countPendingUploads, kickUploadQueue } from '@/sync/upload-queue';

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return { ...actual, apiFetch: jest.fn() };
});
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));
jest.mock('@/lib/mapbox', () => ({ clearOfflineMaps: jest.fn(async () => undefined) }));
jest.mock('@/sync/engine', () => ({ syncNow: jest.fn(), countUnsynced: jest.fn() }));
jest.mock('@/sync/upload-queue', () => ({
  kickUploadQueue: jest.fn(),
  countPendingUploads: jest.fn(),
}));

const { apiFetch } = jest.requireMock('@/lib/api-client') as { apiFetch: jest.Mock };
const { clearOfflineMaps } = jest.requireMock('@/lib/mapbox') as {
  clearOfflineMaps: jest.Mock;
};
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

const OK = { ok: true, pushed: 0, pulled: 0, conflicts: 0, failure: null };
const OFFLINE = { ok: false, pushed: 0, pulled: 0, conflicts: 0, failure: 'offline' };

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

function hook(store: AppDatabase | null = db) {
  return renderHook(() => useSignOut(), { wrapper: wrapperFor(store) });
}

function setRemaining({ dirty = 0, uploads = 0 }: { dirty?: number; uploads?: number }) {
  (countUnsynced as jest.Mock).mockResolvedValue(dirty);
  (countPendingUploads as jest.Mock).mockResolvedValue(uploads);
}

beforeEach(async () => {
  secureStore.__reset();
  await setSession({ accessToken: 'access', refreshToken: 'refresh', user: profile });
  useSessionStore.setState({ status: 'signed-in', user: profile });
  apiFetch.mockReset().mockResolvedValue(undefined);
  (syncNow as jest.Mock).mockReset().mockResolvedValue(OK);
  (kickUploadQueue as jest.Mock).mockReset().mockResolvedValue(undefined);
  setRemaining({});
});

describe('the guard — nothing unsynced', () => {
  test('pushes FIRST, then revokes the token, then ends the session', async () => {
    const order: string[] = [];
    (syncNow as jest.Mock).mockImplementation(async () => {
      order.push('push');
      return OK;
    });
    apiFetch.mockImplementation(async () => {
      order.push('logout');
    });
    (clearOfflineMaps as jest.Mock).mockImplementationOnce(async () => {
      order.push('maps');
    });
    const { result } = await hook();

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(order).toEqual(['push', 'logout', 'maps']);
    expect(syncNow).toHaveBeenCalledWith('sign-out');
    await expect(getSession()).resolves.toBeNull();
    expect(useSessionStore.getState().status).toBe('signed-out');
  });

  test('gives the upload queue a last look too, since bytes are part of "saved"', async () => {
    const { result } = await hook();

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(kickUploadQueue).toHaveBeenCalledWith('sign-out');
  });

  test('counts against the traveller’s own database, after the push', async () => {
    const order: string[] = [];
    (syncNow as jest.Mock).mockImplementation(async () => {
      order.push('push');
      return OK;
    });
    (countUnsynced as jest.Mock).mockImplementation(async () => {
      order.push('count');
      return 0;
    });
    const { result } = await hook();

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(countUnsynced).toHaveBeenCalledWith(db);
    expect(countPendingUploads).toHaveBeenCalledWith(db);
    expect(order).toEqual(['push', 'count']);
  });

  test('a cycle that only fails because the device is offline does not matter when nothing is waiting', async () => {
    (syncNow as jest.Mock).mockResolvedValue(OFFLINE);
    const { result } = await hook();

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(useSessionStore.getState().status).toBe('signed-out');
  });
});

describe('the guard — something remains (scenario 11)', () => {
  test('does NOT sign out: no logout call, the session and the offline maps are untouched', async () => {
    (syncNow as jest.Mock).mockResolvedValue(OFFLINE);
    setRemaining({ dirty: 2 });
    const { result } = await hook();

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isSuccess).toBe(false);
    expect(apiFetch).not.toHaveBeenCalled();
    expect(clearOfflineMaps).not.toHaveBeenCalled();
    await expect(getSession()).resolves.toMatchObject({ refreshToken: 'refresh' });
    expect(useSessionStore.getState().status).toBe('signed-in');
  });

  test('says how many, adding unsent records to files still waiting to upload', async () => {
    (syncNow as jest.Mock).mockResolvedValue(OFFLINE);
    setRemaining({ dirty: 2, uploads: 3 });
    const { result } = await hook();

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    const error = result.current.error;
    expect(isUnsyncedChangesError(error)).toBe(true);
    expect(error).toBeInstanceOf(UnsyncedChangesError);
    expect(error).toMatchObject({ changes: 2, uploads: 3, remaining: 5 });
  });

  test('carries why the push could not finish', async () => {
    (syncNow as jest.Mock).mockResolvedValue(OFFLINE);
    setRemaining({ dirty: 1 });
    const { result } = await hook();

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ failure: 'offline' });
  });

  test('uploads alone are enough to stop it', async () => {
    setRemaining({ uploads: 1 });
    const { result } = await hook();

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ changes: 0, uploads: 1, remaining: 1 });
  });

  test('a cycle that joined an earlier one is run again, so a just-made edit is not reported as unsynced', async () => {
    (countUnsynced as jest.Mock).mockResolvedValueOnce(1).mockResolvedValue(0);
    const { result } = await hook();

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(syncNow).toHaveBeenCalledTimes(2);
    expect(syncNow).toHaveBeenNthCalledWith(1, 'sign-out');
    expect(syncNow).toHaveBeenNthCalledWith(2, 'sign-out');
  });

  test('…but asks twice at most, and never when the failure is the network', async () => {
    (syncNow as jest.Mock).mockResolvedValue(OK);
    setRemaining({ dirty: 1 });
    const again = await hook();
    again.result.current.mutate();
    await waitFor(() => expect(again.result.current.isError).toBe(true));
    expect(syncNow).toHaveBeenCalledTimes(2);

    (syncNow as jest.Mock).mockReset().mockResolvedValue(OFFLINE);
    const offline = await hook();
    offline.result.current.mutate();
    await waitFor(() => expect(offline.result.current.isError).toBe(true));
    expect(syncNow).toHaveBeenCalledTimes(1);
  });

  test('"Sign out anyway" skips the guard and signs out', async () => {
    (syncNow as jest.Mock).mockResolvedValue(OFFLINE);
    setRemaining({ dirty: 4 });
    const { result } = await hook();

    result.current.mutate({ force: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(syncNow).not.toHaveBeenCalled();
    expect(apiFetch).toHaveBeenCalledWith(expect.anything(), '/auth/logout', {
      method: 'POST',
      body: { refresh_token: 'refresh' },
    });
    await expect(getSession()).resolves.toBeNull();
    expect(useSessionStore.getState().status).toBe('signed-out');
  });

  test('"Stay signed in" is resetting the mutation: the warning goes, the session stays', async () => {
    setRemaining({ dirty: 1 });
    const { result } = await hook();
    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));

    await act(async () => result.current.reset());

    await waitFor(() => expect(result.current.error).toBeNull());
    expect(useSessionStore.getState().status).toBe('signed-in');
  });

  test('the traveller who asked again after the network returned is let out', async () => {
    (syncNow as jest.Mock).mockResolvedValueOnce(OFFLINE).mockResolvedValue(OK);
    (countUnsynced as jest.Mock).mockResolvedValueOnce(2).mockResolvedValue(0);
    const { result } = await hook();

    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(useSessionStore.getState().status).toBe('signed-out');
  });
});

describe('the guard — edges', () => {
  test('a push that never answers does not hold the traveller hostage: after the deadline the remainder is counted', async () => {
    jest.useFakeTimers();
    try {
      (syncNow as jest.Mock).mockReturnValue(new Promise(() => undefined));
      setRemaining({ dirty: 3 });
      const { result } = await hook();

      result.current.mutate();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(SIGN_OUT_FLUSH_DEADLINE_MS);
      });
      // TanStack batches its notifications through a zero-delay timer.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1);
      });

      expect(result.current.isError).toBe(true);
      expect(result.current.error).toMatchObject({ changes: 3, failure: null });
      expect(apiFetch).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test('a session the API client already ended during the push is not asked about again, and is still wound up', async () => {
    (syncNow as jest.Mock).mockImplementation(async () => {
      // What the API client does when the server refuses the refresh.
      await clearSession();
      useSessionStore.getState().signOut();
      return { ...OFFLINE, failure: 'unauthorized' };
    });
    setRemaining({ dirty: 2 });
    const { result } = await hook();

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetch).not.toHaveBeenCalled();
    expect(countUnsynced).not.toHaveBeenCalled();
    expect(clearOfflineMaps).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  test('if what is left cannot be counted it does not sign out, and says why in a report', async () => {
    const failure = new Error('database is locked');
    (countUnsynced as jest.Mock).mockRejectedValue(failure);
    const { result } = await hook();

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(failure);
    expect(isUnsyncedChangesError(result.current.error)).toBe(false);
    expect(Sentry.captureException).toHaveBeenCalledWith(failure);
    expect(apiFetch).not.toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe('signed-in');
  });

  test('with no open store there is nothing this session can count: it signs out as it always did', async () => {
    const { result } = await hook(null);

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(syncNow).not.toHaveBeenCalled();
    expect(countUnsynced).not.toHaveBeenCalled();
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  test('an offline logout call is still tolerated once the guard is satisfied', async () => {
    apiFetch.mockRejectedValue(
      new ApiRequestError(0, { code: 'NETWORK', message: 'No' }),
    );
    const { result } = await hook();

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe('signed-out');
  });

  test('an unexpected logout failure is reported but does not block sign-out', async () => {
    apiFetch.mockRejectedValue(
      new ApiRequestError(500, { code: 'UNKNOWN', message: 'x' }),
    );
    const { result } = await hook();

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  test('with no stored session it skips the server call and settles the gate', async () => {
    secureStore.__reset();
    const { result } = await hook();

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetch).not.toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe('signed-out');
  });
});

describe('module surface', () => {
  test('use-session.ts still exports useSignOut, and it is the same hook', () => {
    expect(useSignOutFromSession).toBe(useSignOut);
  });

  test('the predicate is false for everything that is not the guard’s error', () => {
    expect(isUnsyncedChangesError(new Error('x'))).toBe(false);
    expect(isUnsyncedChangesError(null)).toBe(false);
    expect(isUnsyncedChangesError(undefined)).toBe(false);
    expect(isUnsyncedChangesError(new UnsyncedChangesError(1, 0, null))).toBe(true);
  });

  test('the error reads as a sentence in a log', () => {
    expect(new UnsyncedChangesError(1, 0, null).message).toMatch(/1 change/);
    expect(new UnsyncedChangesError(2, 1, 'offline').message).toMatch(/3 changes/);
  });
});
