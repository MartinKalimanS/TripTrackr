/**
 * Feature 005, T539/T540 review (FR-031) - `useTrips` reads the day from `useToday`, not once at
 * the last change of the store: the hero's "Day 3 of 8" is "Day 4 of 8" the morning after, and a
 * planned trip that starts today becomes the active one, with no write in between. Real SQLite;
 * the clock hook (`use-today.test.ts` runs the real one) is a stand-in whose day the test moves.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { DatabaseProvider } from '@/db/client';
import { tripStops, trips } from '@/db/schema';
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

const mockClock = { today: '2026-10-14', listeners: new Set<() => void>() };
jest.mock('@/features/trips/use-today', () => {
  const MockReact = require('react') as typeof import('react');
  return {
    useToday: () => {
      const [, rerender] = MockReact.useReducer((n: number) => n + 1, 0);
      MockReact.useEffect(() => {
        mockClock.listeners.add(rerender);
        return () => void mockClock.listeners.delete(rerender);
      }, []);
      return mockClock.today;
    },
  };
});

const NOW = '2026-06-01T10:00:00.000Z';
const TRIP = '00000000-0000-4000-8000-000000000001';
const STOP = '00000000-0000-4000-8000-000000000011';
let sqlite: TestSqlite;

function wrapper({ children }: PropsWithChildren) {
  return <DatabaseProvider value={sqlite.db}>{children}</DatabaseProvider>;
}

beforeEach(async () => {
  mockClock.today = '2026-10-14';
  mockClock.listeners.clear();
  sqlite = await createTestDatabase();
  sqlite.db
    .insert(trips)
    .values({
      id: TRIP,
      title: 'Portugal',
      home_currency: 'EUR',
      created_at: NOW,
      updated_at: NOW,
    })
    .run();
  sqlite.db
    .insert(tripStops)
    .values({
      id: STOP,
      trip_id: TRIP,
      city_id: 1,
      sort_order: 0,
      arrive_date: '2026-10-12',
      depart_date: '2026-10-19',
      created_at: NOW,
      updated_at: NOW,
    })
    .run();
});

afterEach(() => sqlite.close());

const moveToDay = (day: string) =>
  act(async () => {
    mockClock.today = day;
    mockClock.listeners.forEach((listener) => listener());
  });

describe('useTrips and the day', () => {
  test('counts the day of an active trip from the clock hook', async () => {
    const { result } = await renderHook(() => useTrips(), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    expect(result.current.data[0]?.dayOf).toEqual({ day: 3, of: 8 });
  });

  test('says "Day 4 of 8" the next morning, with no write to the store', async () => {
    const { result } = await renderHook(() => useTrips(), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    await moveToDay('2026-10-15');
    expect(result.current.data[0]?.dayOf).toEqual({ day: 4, of: 8 });
  });

  test('a planned trip becomes the active one when its first day comes', async () => {
    mockClock.today = '2026-10-11';
    const { result } = await renderHook(() => useTrips(), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.data[0]).toMatchObject({ status: 'planning', daysToGo: 1 });

    await moveToDay('2026-10-12');
    expect(result.current.data[0]).toMatchObject({
      status: 'active',
      daysToGo: null,
      dayOf: { day: 1, of: 8 },
    });
  });

  test('a day given by the caller wins over the clock (the suites that pin a date)', async () => {
    const { result } = await renderHook(() => useTrips('2026-10-13'), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.data[0]?.dayOf).toEqual({ day: 2, of: 8 });
  });
});
