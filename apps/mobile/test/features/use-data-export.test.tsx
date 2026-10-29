/**
 * Spec 009 (S-06 mobile) - `useDataExport`. The API client is a double; what is pinned is the
 * request (one POST /me/export with the password and nothing else), that the answer is polled
 * until it stops being pending, that a daily-limit refusal adopts the earlier export, and that a
 * refusal leaves the sheet where it was.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { useDataExport } from '@/features/account/use-data-export';
import { ApiRequestError } from '@/lib/api-client';

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return { ...actual, apiFetch: jest.fn() };
});

const { apiFetch } = jest.requireMock('@/lib/api-client') as { apiFetch: jest.Mock };

const ID = '6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e4f';
const row = (status: string, url: string | null = null) => ({
  export: {
    id: ID,
    status,
    requested_at: '2026-10-29T10:00:00.000Z',
    expires_at: status === 'ready' ? '2026-10-30T10:00:00.000Z' : null,
    download_url: url,
  },
});

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => apiFetch.mockReset());

describe('useDataExport', () => {
  test('starts in the form phase and asks for nothing', async () => {
    const { result } = await renderHook(() => useDataExport(), { wrapper: wrapper() });
    expect(result.current.phase).toBe('form');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test('POST /me/export carries the password only, then reads pending', async () => {
    apiFetch.mockResolvedValueOnce(row('pending')).mockResolvedValue(row('pending'));
    const { result } = await renderHook(() => useDataExport(), { wrapper: wrapper() });
    await act(async () => result.current.start('secret'));
    await waitFor(() => expect(result.current.phase).toBe('pending'));
    expect(apiFetch.mock.calls[0]?.[1]).toBe('/me/export');
    expect(apiFetch.mock.calls[0]?.[2]).toEqual({
      method: 'POST',
      body: { password: 'secret' },
    });
  });

  test('an empty password sends an empty body (an account with none)', async () => {
    apiFetch.mockResolvedValue(row('pending'));
    const { result } = await renderHook(() => useDataExport(), { wrapper: wrapper() });
    await act(async () => result.current.start(''));
    expect(apiFetch.mock.calls[0]?.[2]).toEqual({ method: 'POST', body: {} });
  });

  test('a ready export carries its link', async () => {
    apiFetch.mockResolvedValue(row('ready', 'https://files.example.com/a.zip'));
    const { result } = await renderHook(() => useDataExport(), { wrapper: wrapper() });
    await act(async () => result.current.start(''));
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(result.current.downloadUrl).toBe('https://files.example.com/a.zip');
  });

  test.each(['failed', 'expired'])(
    '%s ends the export and lets the traveller retry',
    async (status) => {
      apiFetch.mockResolvedValue(row(status));
      const { result } = await renderHook(() => useDataExport(), { wrapper: wrapper() });
      await act(async () => result.current.start(''));
      await waitFor(() => expect(result.current.phase).toBe('ended'));
      await act(async () => result.current.restart());
      expect(result.current.phase).toBe('form');
    },
  );

  test('the daily limit adopts the earlier export named in the refusal', async () => {
    apiFetch.mockRejectedValueOnce(
      new ApiRequestError(429, {
        code: 'EXPORT_RATE_LIMITED',
        message: 'x',
        details: { export_id: ID },
      }),
    );
    apiFetch.mockResolvedValue(row('ready', 'https://files.example.com/a.zip'));
    const { result } = await renderHook(() => useDataExport(), { wrapper: wrapper() });
    await act(async () => result.current.start(''));
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(apiFetch.mock.calls[1]?.[1]).toBe(`/me/export/${ID}`);
  });

  test('another refusal stays in the form with the error', async () => {
    const refusal = new ApiRequestError(403, {
      code: 'REAUTHENTICATION_REQUIRED',
      message: 'x',
    });
    apiFetch.mockRejectedValue(refusal);
    const { result } = await renderHook(() => useDataExport(), { wrapper: wrapper() });
    await act(async () => result.current.start('nope'));
    await waitFor(() => expect(result.current.error).toBe(refusal));
    expect(result.current.phase).toBe('form');
  });
});
