/**
 * Shared fixtures and doubles of the trip screen suites (tasks.md T068, T546):
 * `trip-screen.test.tsx` (states, hero, synchronisation, areas, the day strip) and
 * `trip-screen-timeline.test.tsx` (the timeline, no stops, the stop editor, haptics).
 *
 * The live hooks, the derived reads and the actions are replaced by the plain objects below,
 * which a test mutates; each suite installs them with, for example,
 *
 *   jest.mock('@/features/trips/use-trips', () => require('./trip-screen-harness').tripsModule());
 *
 * (`jest.mock` is hoisted above imports, so a factory can only reach this file through
 * `require`). `resetTripScreen()` puts everything back before each test.
 */
import type { StopWithPlace } from '@/db/repositories/stops';
import type { TripRow } from '@/db/schema';

export const router = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
  params: { id: 'trip-42' } as Record<string, string | string[]>,
};

export const live = {
  trip: { data: null as TripRow | null, loading: false, error: null as Error | null },
  stops: {
    data: [] as StopWithPlace[],
    loading: false,
    error: null as Error | null,
  },
};

export const actions = {
  createTrip: jest.fn(),
  removeTrip: jest.fn(),
  addStop: jest.fn(),
  updateStopDates: jest.fn(),
  moveStop: jest.fn(),
  reorderStops: jest.fn(),
  removeStop: jest.fn(),
};

function blankOverview() {
  return {
    counts: { photos: 0, notes: 0, expenses: 0, documents: 0 },
    spendingTotal: '0.00',
    failedPhotos: 0,
    failedPhotoIds: [] as string[],
    pending: 0,
    cityThumbs: new Map<number, string>(),
    cover: { kind: 'typographic', initial: 'I', status: 'planning' } as unknown,
    loading: false,
  };
}
export const overview = blankOverview();

export const sync = {
  state: { kind: 'synced' } as { kind: string; count?: number },
  banner: null as null | { tone: string; message: string; action: string | null },
  retry: jest.fn(),
  retrySync: jest.fn(),
};

/**
 * The screen's scroll view ref. React puts the mounted scroll view into it, so a test that wants
 * to know where the screen scrolled spies on that instance AFTER the render (`spyOnScroll`).
 */
export const scrollRef: { current: { scrollTo: (options: object) => void } | null } = {
  current: null,
};

export function spyOnScroll() {
  const view = scrollRef.current;
  if (view === null) throw new Error('the scroll view is not mounted');
  return jest.spyOn(view, 'scrollTo').mockImplementation(() => undefined);
}

export const trip: TripRow = {
  id: 'trip-42',
  title: 'Italy, spring 2026',
  home_currency: 'EUR',
  is_public: false,
  cover_photo_id: null,
  status: 'planning',
  created_at: '2026-04-01T10:00:00.000Z',
  updated_at: '2026-04-01T10:00:00.000Z',
  deleted_at: null,
  is_dirty: true,
  synced_at: null,
};

export function stop(overrides: Partial<StopWithPlace>): StopWithPlace {
  return {
    id: 'stop-rome',
    trip_id: 'trip-42',
    city_id: 100,
    sort_order: 0,
    arrive_date: '2026-05-10',
    depart_date: '2026-05-12',
    created_at: '2026-04-01T10:00:00.000Z',
    updated_at: '2026-04-01T10:00:00.000Z',
    deleted_at: null,
    is_dirty: false,
    synced_at: '2026-04-01T10:00:00.000Z',
    city_name: 'Roma',
    country_id: 1,
    country_name: 'Italy',
    country_iso: 'IT',
    lat: 41.9,
    lng: 12.5,
    ...overrides,
  };
}

/** The local calendar day `offset` days from now, as the wire's IsoDate. */
export function iso(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Both stops lie ahead, so a node shows its number and the trip is Planning. */
export const rome = stop({ arrive_date: iso(30), depart_date: iso(32) });
export const florence = stop({
  id: 'stop-florence',
  city_id: 101,
  sort_order: 1,
  arrive_date: iso(32),
  depart_date: iso(35),
  city_name: 'Firenze',
  lat: 43.8,
  lng: 11.3,
  is_dirty: true,
  synced_at: null,
});

export function resetTripScreen() {
  router.params = { id: 'trip-42' };
  for (const fn of [router.push, router.back, router.replace]) fn.mockReset();
  live.trip.data = trip;
  live.trip.loading = false;
  live.trip.error = null;
  live.stops.data = [];
  live.stops.loading = false;
  live.stops.error = null;
  for (const action of Object.values(actions)) action.mockReset();
  Object.assign(overview, blankOverview());
  sync.state = { kind: 'synced' };
  sync.banner = null;
  sync.retry.mockReset();
  sync.retrySync.mockReset();
}

// ------------------------------------------------------------------ module factories

export const routerModule = () => ({
  useRouter: () => ({
    push: router.push,
    back: router.back,
    replace: router.replace,
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => router.params,
});

export const tripsModule = () => ({
  useTrip: () => live.trip,
  useTripStops: () => live.stops,
  useTripActions: () => actions,
});

export const overviewModule = () => ({ useTripOverview: () => overview });

export const syncModule = () => ({ useTripSync: () => sync });

/** The library's own double, with the screen's scroll view ref. */
export const reanimatedModule = () => ({
  __esModule: true,
  ...jest.requireActual('../mocks/reanimated-full'),
  useAnimatedRef: () => scrollRef,
});

/** A stand-in that offers one city so the stop editor can be driven end to end. */
export const cityPickerModule = () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    CityPicker: ({
      onSelect,
    }: {
      onSelect: (city: Record<string, unknown>, country: Record<string, unknown>) => void;
    }) => (
      <Pressable
        testID="pick-florence"
        onPress={() =>
          onSelect(
            {
              id: 101,
              country_id: 1,
              name: 'Firenze',
              ascii_name: 'Firenze',
              lat: 43.8,
              lng: 11.3,
              timezone: 'Europe/Rome',
              population: 380_000,
            },
            { id: 1, iso_code: 'IT', name: 'Italy', continent: 'Europe' },
          )
        }>
        <Text>Pick Florence</Text>
      </Pressable>
    ),
  };
};
