/**
 * The globe's data as live local queries, against a real SQLite database —
 * research D-30, Constitution II.
 *
 * Trips, stops and the `cities` cache are three tables; a write to any of them
 * (and the change event the device would emit) must reach the globe without
 * any network. A city cached AFTER its stop was written — a trip that arrived
 * from another device — is placed as soon as the cache learns it.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { DatabaseProvider } from '@/db/client';
import { cities, countries, tripStops, trips } from '@/db/schema';
import { useGlobe } from '@/features/globe/use-globe';

import { createTestDatabase, type TestSqlite } from '../db/sqlite-harness';

const TODAY = '2026-05-10';

let sqlite: TestSqlite;

function wrapper({ children }: PropsWithChildren) {
  return <DatabaseProvider value={sqlite.db}>{children}</DatabaseProvider>;
}

function insertTrip(id: string, title = id, deleted = false) {
  sqlite.db
    .insert(trips)
    .values({
      id,
      title,
      home_currency: 'EUR',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      deleted_at: deleted ? '2026-02-01T00:00:00.000Z' : null,
    })
    .run();
}

function insertStop(
  id: string,
  tripId: string,
  cityId: number,
  sortOrder: number,
  dates: { arrive: string; depart?: string; created?: string; deleted?: boolean },
) {
  sqlite.db
    .insert(tripStops)
    .values({
      id,
      trip_id: tripId,
      city_id: cityId,
      sort_order: sortOrder,
      arrive_date: dates.arrive,
      depart_date: dates.depart ?? dates.arrive,
      created_at: dates.created ?? '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      deleted_at: dates.deleted ? '2026-02-01T00:00:00.000Z' : null,
    })
    .run();
}

function cacheCity(id: number, countryId: number, lng: number, lat: number) {
  sqlite.db
    .insert(cities)
    .values({
      id,
      country_id: countryId,
      name: `City ${id}`,
      ascii_name: `City ${id}`,
      lng,
      lat,
      timezone: 'Europe/Rome',
      population: 1000,
    })
    .run();
}

function cacheCountry(id: number, isoCode: string) {
  sqlite.db
    .insert(countries)
    .values({ id, iso_code: isoCode, name: isoCode, continent: 'Europe' })
    .run();
}

beforeEach(async () => {
  sqlite = await createTestDatabase();
});

afterEach(() => {
  sqlite.close();
});

test('starts loading, then settles on an empty globe', async () => {
  const { result } = await renderHook(() => useGlobe(TODAY), { wrapper });

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBeNull();
  expect(result.current.data).toEqual({
    trips: [],
    focus: [],
    summary: { countriesVisited: 0, distanceKm: 0 },
  });
});

test('derives the trips, the animated trip and the statistics from the local store', async () => {
  cacheCity(1, 39, 12.4964, 41.9028);
  cacheCity(2, 39, 11.2558, 43.7696);
  cacheCity(3, 33, 2.3522, 48.8566);
  insertTrip('italy', 'Italy');
  insertStop('r', 'italy', 1, 0, { arrive: '2026-05-09', depart: '2026-05-11' });
  insertStop('f', 'italy', 2, 1, { arrive: '2026-05-11', depart: '2026-05-13' });
  insertTrip('france', 'France');
  insertStop('p', 'france', 3, 0, { arrive: '2025-04-01' });

  const { result } = await renderHook(() => useGlobe(TODAY), { wrapper });
  await waitFor(() => expect(result.current.data.trips).toHaveLength(2));

  const italy = result.current.data.trips.find((t) => t.id === 'italy')!;
  expect(italy.status).toBe('active');
  expect(italy.stops.map((s) => s.coordinate)).toEqual([
    [12.4964, 41.9028],
    [11.2558, 43.7696],
  ]);
  expect(result.current.data.focus).toEqual(['italy']);
  expect(result.current.data.summary.countriesVisited).toBe(2);
  expect(result.current.data.summary.distanceKm).toBeCloseTo(230.9, 0);
});

test('a city cached after its stop was written is placed once the cache changes', async () => {
  insertTrip('t');
  insertStop('s', 't', 7, 0, { arrive: TODAY });

  const { result } = await renderHook(() => useGlobe(TODAY), { wrapper });
  await waitFor(() => expect(result.current.data.trips).toHaveLength(1));
  expect(result.current.data.trips[0]!.stops[0]!.coordinate).toBeNull();

  await act(async () => {
    cacheCity(7, 81, 139.6917, 35.6895);
    sqlite.emitChange('cities');
  });

  await waitFor(() =>
    expect(result.current.data.trips[0]!.stops[0]!.coordinate).toEqual([
      139.6917, 35.6895,
    ]),
  );
  expect(result.current.data.summary.countriesVisited).toBe(1);
});

test('a stop written after mount appears on the next change event', async () => {
  cacheCity(1, 39, 12.4964, 41.9028);
  insertTrip('t');

  const { result } = await renderHook(() => useGlobe(TODAY), { wrapper });
  await waitFor(() => expect(result.current.data.trips).toHaveLength(1));
  expect(result.current.data.trips[0]!.stops).toEqual([]);

  await act(async () => {
    insertStop('s', 't', 1, 0, { arrive: TODAY });
    sqlite.emitChange('trip_stops');
  });

  await waitFor(() => expect(result.current.data.trips[0]!.stops).toHaveLength(1));
});

test('tombstoned trips and stops are not drawn (FR-039)', async () => {
  cacheCity(1, 39, 12.4964, 41.9028);
  cacheCity(2, 39, 11.2558, 43.7696);
  insertTrip('gone', 'Gone', true);
  insertStop('g', 'gone', 1, 0, { arrive: TODAY });
  insertTrip('kept', 'Kept');
  insertStop('k1', 'kept', 1, 0, { arrive: TODAY });
  insertStop('k2', 'kept', 2, 1, { arrive: TODAY, deleted: true });

  const { result } = await renderHook(() => useGlobe(TODAY), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await waitFor(() =>
    expect(result.current.data.trips.map((t) => t.id)).toEqual(['kept']),
  );
  expect(result.current.data.trips[0]!.stops.map((s) => s.id)).toEqual(['k1']);
});

test('stops sharing a position pair in the server’s order: created, then id', async () => {
  cacheCity(1, 39, 12.4964, 41.9028);
  cacheCity(2, 39, 11.2558, 43.7696);
  insertTrip('t');
  insertStop('b', 't', 2, 0, { arrive: TODAY, created: '2026-01-02T00:00:00.000Z' });
  insertStop('a', 't', 1, 0, { arrive: TODAY, created: '2026-01-02T00:00:00.000Z' });
  insertStop('z', 't', 1, 0, { arrive: TODAY, created: '2026-01-01T00:00:00.000Z' });

  const { result } = await renderHook(() => useGlobe(TODAY), { wrapper });
  await waitFor(() => expect(result.current.data.trips[0]?.stops).toHaveLength(3));
  expect(result.current.data.trips[0]!.stops.map((s) => s.id)).toEqual(['z', 'a', 'b']);
});

test('a stop carries the ISO code of its city’s country, null while the country is not cached (T532)', async () => {
  cacheCountry(39, 'IT');
  cacheCity(1, 39, 12.4964, 41.9028);
  cacheCity(2, 33, 2.3522, 48.8566); // France: its country row is not cached
  insertTrip('t');
  insertStop('a', 't', 1, 0, { arrive: TODAY });
  insertStop('b', 't', 2, 1, { arrive: TODAY });

  const { result } = await renderHook(() => useGlobe(TODAY), { wrapper });
  await waitFor(() => expect(result.current.data.trips).toHaveLength(1));

  expect(result.current.data.trips[0]!.stops.map((s) => s.countryIso)).toEqual([
    'IT',
    null,
  ]);
  // The statistics count by country id and are untouched by the join (FR-082).
  expect(result.current.data.summary.countriesVisited).toBe(2);
});
