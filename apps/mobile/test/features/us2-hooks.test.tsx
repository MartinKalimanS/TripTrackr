/**
 * User Story 2's hooks against a real SQLite database (tasks.md T206, T085):
 * notes and expenses as live queries, the summary derived from them, the FX
 * snapshot refresh with its offline fallback, and the pure anchor helpers
 * behind the move control.
 */
import { SYSTEM_EXPENSE_CATEGORIES, type FxRatesResponse } from '@triptrackr/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import type { PropsWithChildren } from 'react';

import { DatabaseProvider } from '@/db/client';
import { tripsRepository } from '@/db/repositories/trips';
import { fxRatesRepository } from '@/db/repositories/fx-rates';
import { geographyRepository } from '@/db/repositories/geography';
import type { StopWithPlace } from '@/db/repositories/stops';
import {
  useExpenseActions,
  useExpenseCategories,
  useExpenses,
  useSpendingSummary,
} from '@/features/expenses/use-expenses';
import { fetchFxRates, useFxRates } from '@/features/expenses/use-fx-rates';
import {
  anchorTargets,
  isCurrentAnchor,
  levelOf,
  useMoveNote,
} from '@/features/notes/use-move-note';
import { useNoteActions, useNotes } from '@/features/notes/use-notes';
import { ApiRequestError } from '@/lib/api-client';

import { createTestDatabase, type TestSqlite } from '../db/sqlite-harness';

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return { ...actual, apiFetch: jest.fn() };
});

const { apiFetch } = jest.requireMock('@/lib/api-client') as { apiFetch: jest.Mock };

let sqlite: TestSqlite;
let queryClient: QueryClient;

function wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <DatabaseProvider value={sqlite.db}>{children}</DatabaseProvider>
    </QueryClientProvider>
  );
}

const SNAPSHOT: FxRatesResponse = {
  base: 'USD',
  as_of: '2026-05-01',
  source: 'https://www.exchangerate-api.com',
  rates: { USD: '1.000000', EUR: '0.900000', CHF: '0.800000' },
};

beforeEach(async () => {
  sqlite = await createTestDatabase();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  geographyRepository.cacheCountries(sqlite.db, [
    { id: 1, iso_code: 'IT', name: 'Italy', continent: 'Europe' },
  ]);
  geographyRepository.cacheCities(sqlite.db, [
    {
      id: 100,
      country_id: 1,
      name: 'Roma',
      ascii_name: 'Roma',
      lat: 41.9,
      lng: 12.5,
      timezone: 'Europe/Rome',
      population: 2_800_000,
    },
  ]);
});

afterEach(() => {
  sqlite.close();
  queryClient.clear();
});

function seedTrip(homeCurrency = 'CHF') {
  return tripsRepository.create(sqlite.db, {
    id: randomUUID(),
    title: 'Trip',
    home_currency: homeCurrency,
  });
}

describe('useNotes / useNoteActions / useMoveNote', () => {
  test('a note created through the actions appears after the change event, and a move refiles it', async () => {
    const trip = seedTrip();
    const { result } = await renderHook(
      () => ({
        all: useNotes(trip.id),
        city: useNotes(trip.id, { city_id: 100 }),
        actions: useNoteActions(),
        mover: useMoveNote(),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.all.loading).toBe(false));
    expect(result.current.all.data).toEqual([]);

    let noteId = '';
    await act(async () => {
      noteId = result.current.actions.createNote({
        trip_id: trip.id,
        country_id: 1,
        city_id: null,
        title: 'Cheese',
        body: 'Raclette.',
      }).id;
      sqlite.emitChange('notes');
    });
    await waitFor(() => expect(result.current.all.data).toHaveLength(1));
    expect(result.current.all.data[0]).toMatchObject({
      id: noteId,
      country_name: 'Italy',
      city_name: null,
      is_dirty: true,
    });
    expect(result.current.city.data).toEqual([]);

    // FR-018: move into the city; it now appears under the city filter.
    await act(async () => {
      result.current.mover.move(noteId, { country_id: 1, city_id: 100 });
      sqlite.emitChange('notes');
    });
    await waitFor(() => expect(result.current.city.data).toHaveLength(1));
    expect(result.current.city.data[0]).toMatchObject({
      id: noteId,
      body: 'Raclette.',
      city_name: 'Roma',
    });

    await act(async () => {
      result.current.actions.removeNote(noteId);
      sqlite.emitChange('notes');
    });
    await waitFor(() => expect(result.current.all.data).toHaveLength(0));
  });
});

describe('anchor helpers (FR-017, FR-018)', () => {
  const stop = (overrides: Partial<StopWithPlace>): StopWithPlace => ({
    id: 's',
    trip_id: 't',
    city_id: 100,
    sort_order: 0,
    arrive_date: '2026-05-10',
    depart_date: '2026-05-12',
    created_at: 'x',
    updated_at: 'x',
    deleted_at: null,
    is_dirty: false,
    synced_at: null,
    city_name: 'Roma',
    country_id: 1,
    country_name: 'Italy',
    lat: 41.9,
    lng: 12.5,
    ...overrides,
  });

  test('a single-country trip offers "whole trip" plus each city, once each', () => {
    const targets = anchorTargets([
      stop({ id: 'a' }),
      stop({ id: 'b', city_id: 101, city_name: 'Firenze' }),
      stop({ id: 'c' }),
    ]);
    expect(targets.map((t) => [t.level, t.key, t.label])).toEqual([
      ['trip', 'country:1', 'Whole trip (Italy)'],
      ['city', 'city:100', 'Roma, Italy'],
      ['city', 'city:101', 'Firenze, Italy'],
    ]);
  });

  test('a multi-country trip offers each country by name', () => {
    const targets = anchorTargets([
      stop({ id: 'a' }),
      stop({
        id: 'b',
        city_id: 200,
        city_name: 'Madrid',
        country_id: 2,
        country_name: 'Spain',
      }),
    ]);
    expect(targets.filter((t) => t.level === 'country').map((t) => t.label)).toEqual([
      'Italy',
      'Spain',
    ]);
  });

  test('an uncached city still yields a city target and never an unanchored one', () => {
    const targets = anchorTargets([
      stop({ city_id: 999, city_name: null, country_id: null, country_name: null }),
    ]);
    expect(targets).toEqual([
      expect.objectContaining({ level: 'city', city_id: 999, country_id: null }),
    ]);
    expect(anchorTargets([])).toEqual([]);
  });

  test('levelOf and isCurrentAnchor read the two anchors', () => {
    expect(levelOf({ country_id: 1, city_id: null })).toBe('country');
    expect(levelOf({ country_id: 1, city_id: 100 })).toBe('city');
    expect(
      isCurrentAnchor({ country_id: 1, city_id: 100 }, { country_id: 1, city_id: 100 }),
    ).toBe(true);
    expect(
      isCurrentAnchor({ country_id: 1, city_id: null }, { country_id: 1, city_id: 100 }),
    ).toBe(false);
  });
});

describe('useExpenses / useSpendingSummary / useExpenseActions', () => {
  test('expenses appear after the change event and the summary reconciles exactly (SC-016)', async () => {
    fxRatesRepository.replaceSnapshot(sqlite.db, SNAPSHOT);
    const trip = seedTrip('CHF');
    const { result } = await renderHook(
      () => {
        const expenses = useExpenses(trip.id);
        return {
          expenses,
          categories: useExpenseCategories(),
          summary: useSpendingSummary(expenses, 'CHF'),
          actions: useExpenseActions(),
        };
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.summary.loading).toBe(false));
    expect(result.current.categories.data).toHaveLength(6);

    await act(async () => {
      const base = {
        trip_id: trip.id,
        home_currency: 'CHF',
        city_id: null,
        category_id: SYSTEM_EXPENSE_CATEGORIES[0].id,
        spent_at: '2026-06-02',
        note: null,
      };
      result.current.actions.createExpense({ ...base, amount: '10.00', currency: 'CHF' });
      result.current.actions.createExpense({ ...base, amount: '9.00', currency: 'EUR' });
      result.current.actions.createExpense({ ...base, amount: '5.00', currency: 'XTS' });
      sqlite.emitChange('expenses');
    });

    await waitFor(() => expect(result.current.expenses.data).toHaveLength(3));
    expect(result.current.summary.data).toMatchObject({
      total_home: '18.00',
      rates_applied: [{ currency: 'EUR', rate: '0.888889', count: 1 }],
      rates_source: SNAPSHOT.source,
      pending_conversion: { count: 1 },
    });

    await act(async () => {
      const coffee = result.current.actions.createCategory({ name: 'Coffee' });
      expect(coffee.name).toBe('Coffee');
      sqlite.emitChange('expense_categories');
    });
    await waitFor(() => expect(result.current.categories.data).toHaveLength(7));
  });
});

describe('fetchFxRates / useFxRates (research D-10)', () => {
  test('a successful fetch replaces the local snapshot', async () => {
    apiFetch.mockResolvedValueOnce(SNAPSHOT);

    const result = await fetchFxRates(sqlite.db);

    expect(apiFetch).toHaveBeenCalledWith(expect.anything(), '/fx-rates');
    expect(result).toEqual({
      snapshot: { asOf: '2026-05-01', source: SNAPSHOT.source, rates: SNAPSHOT.rates },
      offline: false,
    });
    expect(fxRatesRepository.snapshot(sqlite.db)?.rates.EUR).toBe('0.900000');
  });

  test('offline, the cached snapshot stays in force and is reported as such', async () => {
    fxRatesRepository.replaceSnapshot(sqlite.db, SNAPSHOT);
    apiFetch.mockRejectedValueOnce(
      new ApiRequestError(0, { code: 'NETWORK', message: 'x' }),
    );

    const { result } = await renderHook(() => useFxRates(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      snapshot: { asOf: '2026-05-01', source: SNAPSHOT.source, rates: SNAPSHOT.rates },
      offline: true,
    });
  });

  test('an auth failure is not masked by the cache', async () => {
    apiFetch.mockRejectedValueOnce(
      new ApiRequestError(401, { code: 'SESSION_EXPIRED', message: 'x' }),
    );
    await expect(fetchFxRates(sqlite.db)).rejects.toBeInstanceOf(ApiRequestError);
  });
});
