/**
 * T066/T068 — trips and stops as live local queries, against a real SQLite
 * database. A write through the actions followed by the change event a device
 * would emit must show up in the hook's data without any network.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { DatabaseProvider } from '@/db/client';
import { trips } from '@/db/schema';
import {
  useTrip,
  useTripActions,
  useTripStops,
  useTrips,
} from '@/features/trips/use-trips';

import { createTestDatabase, type TestSqlite } from '../db/sqlite-harness';

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

describe('useTrips', () => {
  test('starts loading, then settles on an empty list', async () => {
    const { result } = await renderHook(() => useTrips(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  test('a trip created through the actions appears with its stop count and derived status after the change event', async () => {
    const { result } = await renderHook(
      () => ({ trips: useTrips('2026-05-11'), actions: useTripActions() }),
      {
        wrapper,
      },
    );
    await waitFor(() => expect(result.current.trips.loading).toBe(false));

    let tripId = '';
    await act(async () => {
      const trip = result.current.actions.createTrip({
        title: 'Italy',
        home_currency: 'EUR',
      });
      tripId = trip.id;
      result.current.actions.addStop({
        trip_id: trip.id,
        city_id: 100,
        arrive_date: '2026-05-10',
        depart_date: '2026-05-12',
      });
      sqlite.emitChange('trips');
      sqlite.emitChange('trip_stops');
    });

    await waitFor(() => expect(result.current.trips.data).toHaveLength(1));
    expect(result.current.trips.data[0]).toMatchObject({
      trip: { id: tripId, title: 'Italy', is_dirty: true },
      stopCount: 1,
      status: 'active',
    });
  });

  test('ignores change events for unrelated tables', async () => {
    const { result } = await renderHook(
      () => ({ trips: useTrips(), actions: useTripActions() }),
      {
        wrapper,
      },
    );
    await waitFor(() => expect(result.current.trips.loading).toBe(false));

    await act(async () => {
      result.current.actions.createTrip({ title: 'Italy', home_currency: 'EUR' });
      sqlite.emitChange('notes');
    });

    expect(result.current.trips.data).toEqual([]);
  });
});

describe('useTrip / useTripStops', () => {
  test('read one trip and its ordered stops, and reflect moves and tombstones', async () => {
    const trip = sqlite.db
      .insert(trips)
      .values({
        id: 'trip-1',
        title: 'Italy',
        home_currency: 'EUR',
        created_at: 'now',
        updated_at: 'now',
      })
      .returning()
      .all()[0]!;

    const { result } = await renderHook(
      () => ({
        trip: useTrip(trip.id),
        stops: useTripStops(trip.id),
        actions: useTripActions(),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.trip.loading).toBe(false));
    expect(result.current.trip.data).toMatchObject({ id: 'trip-1', title: 'Italy' });
    expect(result.current.stops.data).toEqual([]);

    let rome = '';
    let florence = '';
    await act(async () => {
      rome = result.current.actions.addStop({
        trip_id: trip.id,
        city_id: 100,
        arrive_date: '2026-05-10',
        depart_date: '2026-05-12',
      }).id;
      florence = result.current.actions.addStop({
        trip_id: trip.id,
        city_id: 101,
        arrive_date: '2026-05-12',
        depart_date: '2026-05-15',
      }).id;
      sqlite.emitChange('trip_stops');
    });
    await waitFor(() => expect(result.current.stops.data).toHaveLength(2));
    expect(result.current.stops.data.map((s) => s.id)).toEqual([rome, florence]);

    await act(async () => {
      result.current.actions.moveStop(florence, 'up');
      sqlite.emitChange('trip_stops');
    });
    await waitFor(() =>
      expect(result.current.stops.data.map((s) => s.id)).toEqual([florence, rome]),
    );

    await act(async () => {
      result.current.actions.updateStopDates(rome, {
        arrive_date: '2026-05-16',
        depart_date: '2026-05-17',
      });
      result.current.actions.removeStop(florence);
      sqlite.emitChange('trip_stops');
    });
    await waitFor(() => expect(result.current.stops.data).toHaveLength(1));
    expect(result.current.stops.data[0]).toMatchObject({
      id: rome,
      arrive_date: '2026-05-16',
      depart_date: '2026-05-17',
    });
  });

  test('a trip that is removed reads back as null', async () => {
    const { result } = await renderHook(
      () => ({ actions: useTripActions(), trip: useTrip('gone') }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.trip.loading).toBe(false));
    expect(result.current.trip.data).toBeNull();
  });

  test('is loading on the first render, before any error or result, and settles after', async () => {
    const seen: { loading: boolean; error: Error | null }[] = [];
    const { result } = await renderHook(
      () => {
        const read = { trip: useTrip('gone'), stops: useTripStops('gone') };
        seen.push({ loading: read.trip.loading, error: read.trip.error });
        seen.push({ loading: read.stops.loading, error: read.stops.error });
        return read;
      },
      { wrapper },
    );
    expect(seen.slice(0, 2)).toEqual([
      { loading: true, error: null },
      { loading: true, error: null },
    ]);
    await waitFor(() => expect(result.current.trip.loading).toBe(false));
    expect(result.current.stops.loading).toBe(false);
  });

  // Drizzle's `useLiveQuery` sets `updatedAt` only when a result arrives, so a read that
  // FAILS leaves it unset for good. `loading: updatedAt === undefined` alone then reads
  // "still loading" and "failed" together, and a screen that checks `loading` first never
  // shows its error. A dropped table is a read the store cannot answer.
  test.each([
    ['useTrip', 'trips', () => useTrip('trip-1')],
    ['useTripStops', 'trip_stops', () => useTripStops('trip-1')],
  ] as const)(
    '%s reports a failed read as an error and as no longer loading',
    async (_name, table, useRead) => {
      sqlite.native.exec(`DROP TABLE ${table}`);
      const { result } = await renderHook(
        () => {
          const { loading, error } = useRead();
          return { loading, error };
        },
        { wrapper },
      );

      await waitFor(() => expect(result.current.error).not.toBeNull());
      expect(result.current.error?.message).toMatch(/no such table/);
      expect(result.current.loading).toBe(false);
    },
  );

  test('removeTrip tombstones the trip so the list drops it', async () => {
    const { result } = await renderHook(
      () => ({ trips: useTrips(), actions: useTripActions() }),
      {
        wrapper,
      },
    );
    await waitFor(() => expect(result.current.trips.loading).toBe(false));

    await act(async () => {
      const trip = result.current.actions.createTrip({
        title: 'Italy',
        home_currency: 'EUR',
      });
      sqlite.emitChange('trips');
      result.current.actions.removeTrip(trip.id);
      sqlite.emitChange('trips');
    });

    await waitFor(() => expect(result.current.trips.data).toEqual([]));
  });
});
