/**
 * T535 - the Home sheet's trips as live local queries, against a real SQLite database
 * (feature 005; FR-014, FR-015; research D5-17): the trips with their covers and ranges, and
 * every live stop with the names of its cached city and country, joined in memory. Nothing
 * here touches the network.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { DatabaseProvider } from '@/db/client';
import { geographyRepository } from '@/db/repositories/geography';
import { stopsRepository } from '@/db/repositories/stops';
import { tripsRepository } from '@/db/repositories/trips';

import { createTestDatabase, type TestSqlite } from '../../../../test/db/sqlite-harness';
import { useHomeTrips } from '../use-home-trips';

const TODAY = '2026-10-14';

let sqlite: TestSqlite;

function wrapper({ children }: PropsWithChildren) {
  return <DatabaseProvider value={sqlite.db}>{children}</DatabaseProvider>;
}

const portugal = { id: 351, iso_code: 'PT', name: 'Portugal', continent: 'Europe' };
const sintra = {
  id: 6,
  country_id: 351,
  name: 'Sintra',
  ascii_name: 'Sintra',
  lat: 38.8029,
  lng: -9.3817,
  timezone: 'Europe/Lisbon',
  population: 30000,
};

function addTrip(id: string, title: string) {
  tripsRepository.create(sqlite.db, { id, title, home_currency: 'EUR' });
}

function addStop(id: string, tripId: string, arrive: string, depart: string) {
  stopsRepository.add(sqlite.db, {
    id,
    trip_id: tripId,
    city_id: sintra.id,
    arrive_date: arrive,
    depart_date: depart,
  });
}

beforeEach(async () => {
  sqlite = await createTestDatabase();
});

afterEach(() => {
  sqlite.close();
});

test('starts loading, then settles on nothing to show', async () => {
  const { result } = await renderHook(() => useHomeTrips(TODAY), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBeNull();
  expect(result.current.data).toEqual({ now: null, next: null });
});

test('shows the live trip with its day, its city and its country, and the next planned trip', async () => {
  geographyRepository.cacheCountries(sqlite.db, [portugal]);
  geographyRepository.cacheCities(sqlite.db, [sintra]);
  addTrip('live', 'Portugal Road Trip');
  addStop('s1', 'live', '2026-10-12', '2026-10-19');
  addTrip('soon', 'Iceland Ring Road');
  addStop('s2', 'soon', '2027-01-16', '2027-01-24');

  const { result } = await renderHook(() => useHomeTrips(TODAY), { wrapper });
  await waitFor(() => expect(result.current.data.now).not.toBeNull());

  expect(result.current.data.now).toMatchObject({
    id: 'live',
    title: 'Portugal Road Trip',
    status: 'active',
    dayOf: { day: 3, of: 8 },
    place: 'Sintra',
    iso2: 'PT',
    strip: ['now'],
  });
  expect(result.current.data.next).toMatchObject({
    id: 'soon',
    status: 'planning',
    daysToGo: 94,
    startsOn: '2027-01-16',
  });
});

test('a city cached later names the place once the cache changes', async () => {
  addTrip('live', 'Trip');
  addStop('s1', 'live', '2026-10-12', '2026-10-19');

  const { result } = await renderHook(() => useHomeTrips(TODAY), { wrapper });
  await waitFor(() => expect(result.current.data.now).not.toBeNull());
  expect(result.current.data.now?.place).toBeNull();

  await act(async () => {
    geographyRepository.cacheCountries(sqlite.db, [portugal]);
    geographyRepository.cacheCities(sqlite.db, [sintra]);
    sqlite.emitChange('cities');
    sqlite.emitChange('countries');
  });
  await waitFor(() => expect(result.current.data.now?.place).toBe('Sintra'));
});

test('gives the globe the cover pictures of the trips that have one, and none for a plain trip', async () => {
  addTrip('plain', 'No photo');
  addStop('s1', 'plain', '2026-10-12', '2026-10-19');

  const { result } = await renderHook(() => useHomeTrips(TODAY), { wrapper });
  await waitFor(() => expect(result.current.data.now).not.toBeNull());
  expect(result.current.covers).toEqual({});
});
