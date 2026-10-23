/**
 * T562 - the appearance sweep of the `(tabs)` group: Home (the globe, the sheet, the callout),
 * Trips, You, and the tab bar they share, in the four themes and under reduced transparency
 * (FR-072, FR-073, FR-078, FR-079, SC-008). The data hooks are the mocked worlds of the
 * existing suites (`test/helpers/home-state.tsx`, `test/app/tab-screens.test.tsx`); the audit,
 * its exceptions and the render helpers are in `test/appearance/`.
 */
import { fireEvent, screen } from '@testing-library/react-native';
import { Dimensions, Platform } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import HomeScreen from '@/app/(tabs)/index';
import ProfileScreen from '@/app/(tabs)/profile';
import TripsScreen from '@/app/(tabs)/trips';
import { ActiveCallout } from '@/components/globe/active-callout';
import { TabBar } from '@/components/navigation/tab-bar';
import { useSessionStore } from '@/features/auth/session-store';
import { toGlobeTrips } from '@/features/globe/globe-data';
import { summariseCountries } from '@/features/passport/country-summary';
import { periodKeys } from '@/features/passport/passport-totals';

import { captureIntervals } from '../helpers/captured-interval';
import { manyTrips } from '../helpers/trip-card-fixture';
import { withLiveTrip } from '../helpers/home-harness';
import {
  HEADER,
  HEIGHT,
  INSETS,
  WIDTH,
  focus,
  homeTrips,
  sync,
} from '../helpers/home-state';

import { sweepScreen } from './sweep';
import { tabBarProps } from './tab-bar-props';

// The Home sheet and the tab capsule are Reanimated: the live double keeps a shared value
// across renders and answers `.get()` and `.set()` (test/mocks/reanimated-live.ts).
jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => require('../mocks/reanimated-live'));

jest.mock('expo-router', () => ({
  ...require('../helpers/home-state').factories.router(),
  Stack: {
    Screen: ({
      options,
    }: {
      options?: { headerRight?: (props: Record<string, unknown>) => unknown };
    }) => options?.headerRight?.({ tintColor: 'tint', canGoBack: false }) ?? null,
  },
}));
jest.mock('@/hooks/use-app-active', () =>
  require('../helpers/home-state').factories.appActive(),
);
jest.mock('@/hooks/use-mapbox-ready', () =>
  require('../helpers/home-state').factories.mapboxReady(),
);
jest.mock('@/components/trip/use-tab-zone', () =>
  require('../helpers/home-state').factories.tabZone(),
);
jest.mock('@/lib/sentry', () => require('../helpers/home-state').factories.sentry());
jest.mock('expo-image', () => require('../helpers/home-state').factories.image());
jest.mock('@/features/globe/use-globe', () =>
  require('../helpers/home-state').factories.useGlobe(),
);
jest.mock('@/features/home/use-home-trips', () =>
  require('../helpers/home-state').factories.useHomeTrips(),
);
jest.mock('@/features/passport/use-country-overview', () =>
  require('../helpers/home-state').factories.useCountryOverview(),
);
jest.mock('@/features/sync/use-sync-chip-state', () =>
  require('../helpers/home-state').factories.syncChipState(),
);
jest.mock('@/sync/engine', () => require('../helpers/home-state').factories.syncEngine());

const mockTrips: { data: unknown[]; loading: boolean; error: Error | null } = {
  data: [],
  loading: false,
  error: null,
};
jest.mock('@/features/trips/use-trips', () => ({ useTrips: () => mockTrips }));
jest.mock('@/features/trips/use-trips-sync', () => ({
  useTripsSync: () => ({ chip: { kind: 'synced' }, banner: null, retry: jest.fn() }),
}));

const mockPassport: { data: unknown; loading: boolean; error: Error | null } = {
  data: { trips: [], summaries: [], periods: ['all'] },
  loading: false,
  error: null,
};
jest.mock('@/features/passport/use-passport', () => ({
  usePassport: () => mockPassport,
}));
jest.mock('@/features/auth/use-sign-out', () => ({
  ...jest.requireActual('@/features/auth/use-sign-out'),
  useSignOut: () => ({
    mutate: jest.fn(),
    reset: jest.fn(),
    isPending: false,
    error: null,
  }),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.2.3', ios: { buildNumber: '45' } } },
}));

const TODAY = '2026-10-14';
jest.mock('@/features/trips/stop-dates', () => ({
  ...jest.requireActual('@/features/trips/stop-dates'),
  todayIso: () => '2026-10-14',
}));

function passportData() {
  const countries = [
    { id: 351, iso_code: 'PT', name: 'Portugal', continent: 'Europe' },
    { id: 81, iso_code: 'JP', name: 'Japan', continent: 'Asia' },
  ];
  const stops = [
    ['t25', 5, 351, -9.14, 38.72, '2025-05-01', '2025-05-03'],
    ['t26', 7, 81, 139.69, 35.69, '2026-03-03', '2026-03-10'],
  ].map(([trip_id, city_id, country_id, lng, lat, arrive_date, depart_date], i) => ({
    id: `s${i}`,
    trip_id,
    city_id,
    country_id,
    lng,
    lat,
    arrive_date,
    depart_date,
  })) as Parameters<typeof toGlobeTrips>[1];
  const trips = toGlobeTrips(
    [
      { id: 't25', title: 'Lisbon' },
      { id: 't26', title: 'Tokyo' },
    ],
    stops,
    TODAY,
  );
  return {
    trips,
    summaries: summariseCountries(trips, countries, TODAY),
    periods: periodKeys(trips),
  };
}

function resetWindow() {
  // The figures count up on a frame timer: held, so nothing ticks after a test has ended.
  captureIntervals();
  jest.spyOn(Dimensions, 'get').mockReturnValue({
    width: WIDTH,
    height: HEIGHT,
    scale: 3,
    fontScale: 1,
  });
  sync.current = { kind: 'synced' };
  focus.focused = true;
  focus.appActive = true;
  useSessionStore.setState({
    status: 'signed-in',
    user: {
      id: '6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e4f',
      email: 'marta@example.com',
      display_name: 'Marta',
      avatar_url: null,
      bio: null,
      home_currency: 'EUR',
      is_profile_public: false,
      email_verified_at: null,
      created_at: '2021-06-15T10:00:00.000Z',
    },
  });
}

// ---- Home: a live trip, so the live card and the sheet draw, and the sync chip says that
// three changes wait (a paper chip over the globe).
sweepScreen(
  'Home',
  () => (
    <SafeAreaInsetsContext.Provider value={INSETS}>
      <HomeScreen />
    </SafeAreaInsetsContext.Provider>
  ),
  () => {
    resetWindow();
    withLiveTrip();
    sync.current = { kind: 'waiting', count: 3 };
  },
  async () => {
    await fireEvent(screen.getByTestId('home-header'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: WIDTH, height: HEADER } },
    });
  },
);

// ---- Home with nothing: the invitation card floats over the globe, and the last sync failed
// (a retry chip with a danger tint).
sweepScreen(
  'Home (no trips)',
  () => (
    <SafeAreaInsetsContext.Provider value={INSETS}>
      <HomeScreen />
    </SafeAreaInsetsContext.Provider>
  ),
  () => {
    resetWindow();
    homeTrips.data = { now: null, next: null };
    sync.current = { kind: 'failed' };
  },
  async () => {
    await fireEvent(screen.getByTestId('home-header'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: WIDTH, height: HEADER } },
    });
  },
);

// ---- Trips: the live trip, a ticket for the planned one, the past cards.
sweepScreen(
  'Trips',
  () => <TripsScreen />,
  () => {
    resetWindow();
    mockTrips.loading = false;
    mockTrips.data = manyTrips(4);
  },
);

// ---- Trips before it has read, and with nothing to show.
sweepScreen(
  'Trips (loading)',
  () => <TripsScreen />,
  () => {
    resetWindow();
    mockTrips.data = [];
    mockTrips.loading = true;
  },
);
sweepScreen(
  'Trips (empty)',
  () => <TripsScreen />,
  () => {
    resetWindow();
    mockTrips.data = [];
    mockTrips.loading = false;
  },
);

// ---- You: the passport card, the stamps page, the groups.
sweepScreen(
  'You',
  () => <ProfileScreen />,
  () => {
    resetWindow();
    mockPassport.data = passportData();
  },
);

// ---- The live pin of the globe: the ring, the pulse and the card that names the trip.
sweepScreen(
  'Live pin callout',
  () => (
    <ActiveCallout
      coordinate={[-9.39, 38.8]}
      title="Portugal Road Trip"
      detail="Day 3 of 8 · Sintra"
    />
  ),
  () => resetWindow(),
);

// ---- The tab bar: a pill (glass or blur on iOS, solid elsewhere), here on iOS.
sweepScreen(
  'Tab bar',
  () => <TabBar {...tabBarProps()} />,
  () => resetWindow(),
);

// ---- The same bar on Android: a Material navigation bar, solid by construction.
sweepScreen(
  'Tab bar (Android)',
  () => <TabBar {...tabBarProps()} />,
  () => {
    resetWindow();
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(34);
  },
);
