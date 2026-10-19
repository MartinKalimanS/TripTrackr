/**
 * Feature 005, T539 (FR-030, FR-031; data-model section 6; research D5-17) - `useTrips` hands
 * every trip its card model: the country and the stop labels from the cached city, the day of
 * the trip, the dots, the kilometres, the pending flag, derived on the device from three local
 * queries and the city cache. Real SQLite, no network.
 *
 * What is pinned beyond the pure derivations (`trip-card-model.test.ts`): the stops are read WITH
 * their city and country, a city that is cached AFTER the first render shows up on the next
 * change event, a card that did not change stays reference-equal, and the 004 summary fields
 * keep their names and values.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { eq } from 'drizzle-orm';
import type { PropsWithChildren } from 'react';

import { DatabaseProvider } from '@/db/client';
import { stopsRepository } from '@/db/repositories/stops';
import { cities, countries, tripStops, trips } from '@/db/schema';
import type { TripCardModel } from '@/features/trips/trip-card-model';
import { useTrips } from '@/features/trips/use-trips';

import { createTestDatabase, type TestSqlite } from '../db/sqlite-harness';

jest.mock('expo-file-system', () => ({
  Paths: { document: { uri: 'file:///data/app/documents/' } },
  File: class {},
  Directory: class {},
}));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NOW = '2026-06-01T10:00:00.000Z';
const TODAY = '2026-10-14';
const TRIP = uuid(1);
const OTHER = uuid(2);

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

function addTrip(id: string, title: string, dirty = false) {
  sqlite.db
    .insert(trips)
    .values({
      id,
      title,
      home_currency: 'EUR',
      created_at: NOW,
      updated_at: NOW,
      is_dirty: dirty,
    })
    .run();
}

function addStop(
  n: number,
  tripId: string,
  cityId: number,
  arrive: string,
  depart: string,
  { dirty = false } = {},
) {
  sqlite.db
    .insert(tripStops)
    .values({
      id: uuid(10 + n),
      trip_id: tripId,
      city_id: cityId,
      sort_order: n,
      arrive_date: arrive,
      depart_date: depart,
      created_at: NOW,
      updated_at: NOW,
      is_dirty: dirty,
    })
    .run();
}

function cacheCity(id: number, name: string, lat: number, lng: number) {
  sqlite.db
    .insert(cities)
    .values({
      id,
      country_id: 1,
      name,
      ascii_name: name.toLowerCase(),
      lat,
      lng,
      timezone: 'Europe/Lisbon',
      population: 1,
    })
    .run();
}

function cacheCountry() {
  sqlite.db
    .insert(countries)
    .values({ id: 1, iso_code: 'PT', name: 'Portugal', continent: 'Europe' })
    .run();
}

async function renderTrips() {
  const view = await renderHook(() => useTrips(TODAY), { wrapper });
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  await act(async () => undefined);
  return view;
}

const cardOf = (data: TripCardModel[], id: string) => {
  const found = data.find((card) => card.id === id);
  if (!found) throw new Error(`No card for ${id}`);
  return found;
};

function seedPortugal() {
  cacheCountry();
  cacheCity(100, 'Lisbon', 38.7223, -9.1393);
  cacheCity(101, 'Porto', 41.1579, -8.6291);
  addTrip(TRIP, 'Portugal Road Trip');
  addStop(0, TRIP, 100, '2026-10-12', '2026-10-15');
  addStop(1, TRIP, 101, '2026-10-15', '2026-10-19');
}

describe('stopsRepository.allActiveWithCountryQuery', () => {
  test('joins each live stop to its cached city and country, and leaves tombstones out', () => {
    seedPortugal();
    addStop(2, TRIP, 999, '2026-10-19', '2026-10-20');
    sqlite.db
      .update(tripStops)
      .set({ deleted_at: NOW })
      .where(eq(tripStops.id, uuid(12)))
      .run();
    addStop(3, TRIP, 999, '2026-10-20', '2026-10-21');

    const rows = stopsRepository.allActiveWithCountryQuery(sqlite.db).all();

    expect(rows.map((row) => row.id)).toEqual([uuid(10), uuid(11), uuid(13)]);
    expect(rows[0]).toMatchObject({
      city_name: 'Lisbon',
      country_id: 1,
      country_iso: 'PT',
      country_name: 'Portugal',
      lat: 38.7223,
      lng: -9.1393,
    });
    // A city this device has not cached: every place column is null.
    expect(rows[2]).toMatchObject({
      city_name: null,
      country_iso: null,
      country_name: null,
      lat: null,
      lng: null,
    });
  });
});

describe('useTrips: the card model', () => {
  test('a trip in cached cities carries its country, labels, dots, day and kilometres', async () => {
    seedPortugal();

    const { result } = await renderTrips();
    const card = cardOf(result.current.data, TRIP);

    expect(card).toMatchObject({
      id: TRIP,
      title: 'Portugal Road Trip',
      status: 'active',
      stopCount: 2,
      country: { iso2: 'PT', name: 'Portugal' },
      stripLabels: ['LIS', 'POR'],
      strip: ['now', 'next'],
      dayOf: { day: 3, of: 8 },
      daysToGo: null,
      lengthDays: 8,
      pending: false,
    });
    expect(card.distanceKm).toBeGreaterThan(250);
    expect(card.generated).toMatchObject({ iso2: 'PT', initial: 'Portugal Road Trip' });
  });

  test('is pending while the trip or a stop has changes the server has not confirmed', async () => {
    seedPortugal();
    sqlite.db
      .update(tripStops)
      .set({ is_dirty: true })
      .where(eq(tripStops.id, uuid(11)))
      .run();

    const { result } = await renderTrips();

    expect(cardOf(result.current.data, TRIP).pending).toBe(true);
  });

  test('keeps the 004 summary fields beside the new ones', async () => {
    seedPortugal();

    const { result } = await renderTrips();

    expect(cardOf(result.current.data, TRIP)).toMatchObject({
      trip: { id: TRIP, title: 'Portugal Road Trip' },
      stopCount: 2,
      status: 'active',
      dateRange: { start: '2026-10-12', end: '2026-10-19' },
      cover: { kind: 'typographic', initial: 'P', status: 'active' },
    });
  });

  test('a city cached after the first render gives the trip its country on the next change', async () => {
    addTrip(TRIP, 'Portugal Road Trip');
    addStop(0, TRIP, 100, '2026-10-12', '2026-10-15');

    const { result } = await renderTrips();
    expect(cardOf(result.current.data, TRIP).country).toBeNull();

    await act(async () => {
      cacheCountry();
      cacheCity(100, 'Lisbon', 38.7223, -9.1393);
      sqlite.emitChange('cities');
    });

    await waitFor(() =>
      expect(cardOf(result.current.data, TRIP).country).toEqual({
        iso2: 'PT',
        name: 'Portugal',
      }),
    );
    expect(cardOf(result.current.data, TRIP).stripLabels).toEqual(['LIS']);
  });

  test('a card that did not change stays reference-equal, field by field', async () => {
    seedPortugal();
    addTrip(OTHER, 'Elsewhere');
    const { result } = await renderTrips();
    const before = result.current.data;

    await act(async () => {
      addStop(5, OTHER, 999, '2027-01-01', '2027-01-03');
      sqlite.emitChange('trip_stops');
    });
    await waitFor(() => expect(cardOf(result.current.data, OTHER).stopCount).toBe(1));

    const after = result.current.data;
    expect(cardOf(after, TRIP)).toBe(cardOf(before, TRIP));
    expect(cardOf(after, OTHER)).not.toBe(cardOf(before, OTHER));
    expect(cardOf(after, OTHER).generated).toBe(cardOf(before, OTHER).generated);
  });

  test('an unrelated change keeps the whole list reference-equal', async () => {
    seedPortugal();
    const { result } = await renderTrips();
    const before = result.current.data;

    await act(async () => {
      sqlite.emitChange('trips');
    });
    await act(async () => undefined);

    expect(result.current.data).toBe(before);
  });
});
