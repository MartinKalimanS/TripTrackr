/**
 * F13 - the You screen's data as live local queries, against a real SQLite database (feature
 * 005; FR-058, FR-084; research D5-17): the periods offered are the years with a trip, the
 * summaries are the countries of those trips, and nothing touches the network.
 */
import { renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { DatabaseProvider } from '@/db/client';
import { geographyRepository } from '@/db/repositories/geography';
import { tripsRepository } from '@/db/repositories/trips';

import { createTestDatabase, type TestSqlite } from '../../../../test/db/sqlite-harness';
import { usePassport } from '../use-passport';

let sqlite: TestSqlite;

function wrapper({ children }: PropsWithChildren) {
  return <DatabaseProvider value={sqlite.db}>{children}</DatabaseProvider>;
}

beforeEach(async () => {
  sqlite = await createTestDatabase();
});

afterEach(() => {
  sqlite.close();
});

test('with nothing recorded it settles with no countries and only All time', async () => {
  const { result } = await renderHook(() => usePassport('2026-10-14'), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBeNull();
  expect(result.current.data.trips).toEqual([]);
  expect(result.current.data.summaries).toEqual([]);
  expect(result.current.data.periods).toEqual(['all']);
});

test('a trip with no stop is in All time and offers no year', async () => {
  geographyRepository.cacheCountries(sqlite.db, [
    { id: 351, iso_code: 'PT', name: 'Portugal', continent: 'Europe' },
  ]);
  tripsRepository.create(sqlite.db, {
    id: 'a1b2c3d4-0000-4000-8000-000000000001',
    title: 'Someday',
    home_currency: 'EUR',
  });
  const { result } = await renderHook(() => usePassport('2026-10-14'), { wrapper });
  await waitFor(() => expect(result.current.data.trips).toHaveLength(1));
  expect(result.current.data.periods).toEqual(['all']);
});
