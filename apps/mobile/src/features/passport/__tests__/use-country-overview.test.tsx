/**
 * T536 - the Countries list as live local queries, against a real SQLite database (feature 005;
 * FR-016, FR-084; research D5-17, D-30): the trips come from the globe's own data, the names
 * from the `countries` cache, and a country the cache learns later appears without a restart.
 * Nothing here touches the network.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { DatabaseProvider } from '@/db/client';
import { geographyRepository } from '@/db/repositories/geography';
import { toGlobeTrips } from '@/features/globe/globe-data';

import { createTestDatabase, type TestSqlite } from '../../../../test/db/sqlite-harness';
import { useCountryOverview } from '../use-country-overview';

const TODAY = '2026-10-14';

let sqlite: TestSqlite;

function wrapper({ children }: PropsWithChildren) {
  return <DatabaseProvider value={sqlite.db}>{children}</DatabaseProvider>;
}

const trips = toGlobeTrips(
  [{ id: 't', title: 'Trip' }],
  [
    {
      id: 's1',
      trip_id: 't',
      city_id: 1,
      arrive_date: '2026-10-10',
      depart_date: '2026-10-16',
      country_id: 351,
      lat: 38.7223,
      lng: -9.1393,
    },
  ],
  TODAY,
);

const PORTUGAL = { id: 351, iso_code: 'PT', name: 'Portugal', continent: 'Europe' };

beforeEach(async () => {
  sqlite = await createTestDatabase();
});

afterEach(() => {
  sqlite.close();
});

test('is loading until the countries cache has answered, then lists the visited country', async () => {
  geographyRepository.cacheCountries(sqlite.db, [PORTUGAL]);
  const { result } = await renderHook(() => useCountryOverview(trips, TODAY), {
    wrapper,
  });

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBeNull();
  expect(result.current.data.summaries).toHaveLength(1);
  expect(result.current.data.summaries[0]).toMatchObject({
    iso2: 'PT',
    name: 'Portugal',
    continent: 'Europe',
    tripCount: 1,
    isNow: true,
  });
  expect(result.current.data.groups.map((g) => g.continent)).toEqual(['Europe']);
  expect(result.current.data.totals).toMatchObject({
    countries: 1,
    countriesOf: 195,
    trips: 1,
    continents: 1,
    continentsOf: 7,
  });
});

test('with no countries cached the figure still counts, and the list is empty', async () => {
  const { result } = await renderHook(() => useCountryOverview(trips, TODAY), {
    wrapper,
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data.summaries).toEqual([]);
  expect(result.current.data.totals.countries).toBe(1);
});

test('a country the cache learns later appears when the table changes', async () => {
  const { result } = await renderHook(() => useCountryOverview(trips, TODAY), {
    wrapper,
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data.summaries).toEqual([]);

  await act(async () => {
    geographyRepository.cacheCountries(sqlite.db, [PORTUGAL]);
    sqlite.emitChange('countries');
  });
  await waitFor(() => expect(result.current.data.summaries).toHaveLength(1));
});

test('the same trips give the same overview object, so a list does not redraw for nothing', async () => {
  geographyRepository.cacheCountries(sqlite.db, [PORTUGAL]);
  const { result, rerender } = await renderHook(() => useCountryOverview(trips, TODAY), {
    wrapper,
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  const first = result.current.data;
  await rerender({});
  expect(result.current.data).toBe(first);
});
