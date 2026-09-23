/**
 * T067 — geography lookups with an offline fallback (FR-014, Constitution II).
 *
 * `apiFetch` is mocked; the cache is a real SQLite database. What is pinned:
 * every online answer is cached, an unreachable API answers from the cache and
 * says so, and an auth failure is NOT hidden behind cached cities.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { DatabaseProvider } from '@/db/client';
import { geographyRepository } from '@/db/repositories/geography';
import { useCitySearch, useCountries } from '@/features/geography/use-geography';
import { ApiRequestError } from '@/lib/api-client';

import { createTestDatabase, type TestSqlite } from '../db/sqlite-harness';

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return { ...actual, apiFetch: jest.fn() };
});

// The real Sentry SDK starts background timers on import; nothing here reports.
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const { apiFetch } = jest.requireMock('@/lib/api-client') as { apiFetch: jest.Mock };

const italy = { id: 1, iso_code: 'IT', name: 'Italy', continent: 'Europe' };
const rome = {
  id: 100,
  country_id: 1,
  name: 'Roma',
  ascii_name: 'Roma',
  lat: 41.9,
  lng: 12.5,
  timezone: 'Europe/Rome',
  population: 2_800_000,
};
const offline = () => new ApiRequestError(0, { code: 'NETWORK', message: 'Offline' });

let sqlite: TestSqlite;
let queryClient: QueryClient;

function wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <DatabaseProvider value={sqlite.db}>{children}</DatabaseProvider>
    </QueryClientProvider>
  );
}

beforeEach(async () => {
  sqlite = await createTestDatabase();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  apiFetch.mockReset();
});

afterEach(() => {
  queryClient.clear();
  sqlite.close();
});

describe('useCountries', () => {
  test('fetches GET /countries publicly and caches the answer locally', async () => {
    apiFetch.mockResolvedValueOnce({ countries: [italy] });
    const { result } = await renderHook(() => useCountries(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetch).toHaveBeenCalledWith(expect.anything(), '/countries', {
      auth: false,
    });
    expect(result.current.data).toEqual({ items: [italy], offline: false });
    expect(geographyRepository.listCountries(sqlite.db)).toEqual([italy]);
  });

  test('answers from the cache, flagged offline, when the API is unreachable', async () => {
    geographyRepository.cacheCountries(sqlite.db, [italy]);
    apiFetch.mockRejectedValueOnce(offline());
    const { result } = await renderHook(() => useCountries(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ items: [italy], offline: true });
  });

  test('falls back on a server failure too — a 503 is not the traveller’s fault', async () => {
    geographyRepository.cacheCountries(sqlite.db, [italy]);
    apiFetch.mockRejectedValueOnce(
      new ApiRequestError(503, { code: 'UNKNOWN', message: 'x' }),
    );
    const { result } = await renderHook(() => useCountries(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.offline).toBe(true);
  });

  test('does not hide an authentication failure behind the cache', async () => {
    geographyRepository.cacheCountries(sqlite.db, [italy]);
    apiFetch.mockRejectedValueOnce(
      new ApiRequestError(401, { code: 'SESSION_EXPIRED', message: 'Expired' }),
    );
    const { result } = await renderHook(() => useCountries(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: 'SESSION_EXPIRED' });
  });
});

describe('useCitySearch', () => {
  test('is idle until a country is chosen', async () => {
    const { result } = await renderHook(() => useCitySearch(null, 'ro'), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test('queries the country’s cities with the trimmed text and caches them', async () => {
    apiFetch.mockResolvedValueOnce({ cities: [rome] });
    const { result } = await renderHook(() => useCitySearch(1, '  ro '), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetch).toHaveBeenCalledWith(
      expect.anything(),
      '/countries/1/cities?limit=20&q=ro',
      { auth: false },
    );
    expect(result.current.data).toEqual({ items: [rome], offline: false });
    expect(geographyRepository.searchCities(sqlite.db, 1, 'ro')).toEqual([rome]);
  });

  test('an empty query asks for the country’s best-known cities', async () => {
    apiFetch.mockResolvedValueOnce({ cities: [rome] });
    const { result } = await renderHook(() => useCitySearch(1, ''), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetch).toHaveBeenCalledWith(
      expect.anything(),
      '/countries/1/cities?limit=20',
      {
        auth: false,
      },
    );
  });

  test('offline, searches the local cache with the same accent-tolerant rule', async () => {
    geographyRepository.cacheCities(sqlite.db, [rome]);
    apiFetch.mockRejectedValueOnce(offline());
    const { result } = await renderHook(() => useCitySearch(1, 'RÓ'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ items: [rome], offline: true });
  });
});
