/**
 * Fixtures and render helpers of the Home suites (feature 005, T537; not a test file). The
 * mocked world they act on is `home-state.tsx`; a suite names the same mocks:
 *
 *   jest.mock('expo-router', () => require('../helpers/home-state').factories.router());
 *   jest.mock('@/hooks/use-appearance');
 *   ...
 *   beforeEach(() => resetHome());
 *   await renderHome();                      // renders the screen and lays its header out
 *
 * `resetHome()` puts every shared object back, fixes the window at 390 by 844 and gives the
 * appearance of the light theme at the default text size; a test changes what it needs.
 * `renderHome()` lays the header out, which is what lets the globe mount (it is fitted under it).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import HomeScreen from '@/app/(tabs)/index';
import { sheetHeights } from '@/components/ui/sheet-geometry';
import { useSessionStore } from '@/features/auth/session-store';
import type { GlobeTrip } from '@/features/globe/globe-data';
import { globeFit } from '@/features/globe/globe-fit';
import { peekRowHeight } from '@/features/home/home-layout';
import type { HomeTrip } from '@/features/home/home-trips';
import {
  groupByContinent,
  type CountrySummary,
} from '@/features/passport/country-summary';
import { addDays, todayIso } from '@/features/trips/stop-dates';

import { appearance } from './appearance';
import {
  HEADER,
  HEIGHT,
  INSETS,
  TAB_ZONE,
  WIDTH,
  focus,
  globe,
  homeTrips,
  overview,
  router,
  sheet,
  sync,
} from './home-state';

export const DETENTS = sheetHeights(
  {
    windowHeight: HEIGHT,
    topInset: INSETS.top,
    bottomInset: INSETS.bottom,
    tabZone: TAB_ZONE,
    headerBottom: INSETS.top,
  },
  peekRowHeight(1),
);

export const HIDDEN = { includeHiddenElements: true };

/** The Mapbox stand-in's one camera: what the app asked of it is `setCamera.mock.calls`. */
export const camera = () =>
  (jest.requireMock('@rnmapbox/maps') as { __camera: { setCamera: jest.Mock } }).__camera;

export const day = (offset: number) => addDays(todayIso(), offset);

export function trip(
  id: string,
  status: GlobeTrip['status'],
  placed = true,
  from = -30,
  to = -20,
): GlobeTrip {
  return {
    id,
    title: `Trip ${id}`,
    status,
    stops: [
      {
        id: `${id}-stop`,
        cityId: 1,
        countryId: placed ? 39 : null,
        arriveDate: day(from),
        departDate: day(to),
        coordinate: placed ? [12.4964, 41.9028] : null,
      },
    ],
  };
}

export function homeTrip(id: string, status: HomeTrip['status'] = 'active'): HomeTrip {
  return {
    id,
    title: `Trip ${id}`,
    status,
    cover: { kind: 'typographic', initial: 'T', status },
    dayOf: status === 'active' ? { day: 3, of: 8 } : null,
    place: status === 'active' ? 'Sintra' : null,
    strip: ['now'],
    startsOn: day(94),
    daysToGo: status === 'planning' ? 94 : null,
    iso2: 'PT',
  };
}

export const PORTUGAL: CountrySummary = {
  countryId: 351,
  iso2: 'PT',
  name: 'Portugal',
  continent: 'Europe',
  tripCount: 1,
  firstVisit: day(-30),
  lastVisit: day(-20),
  isNow: false,
  planned: false,
  focus: {
    center: [-8, 39.5],
    bounds: [
      [-9.5, 37],
      [-6.2, 42],
    ],
  },
};

/** A traveller with one past trip on the map: the sheet, no live trip. */
export function withPastTrip() {
  globe.data = {
    trips: [trip('past', 'past')],
    focus: [],
    summary: { countriesVisited: 1, distanceKm: 231 },
  };
  overview.data = {
    summaries: [PORTUGAL],
    groups: groupByContinent([PORTUGAL]),
    totals: {
      countries: 1,
      countriesOf: 195,
      trips: 1,
      distanceKm: 231,
      continents: 1,
      continentsOf: 7,
    },
  };
}

/** A traveller whose active trip is on the map: the callout, the live card. */
export function withLiveTrip() {
  withPastTrip();
  globe.data = {
    ...globe.data,
    trips: [trip('live', 'active', true, -2, 5)],
    focus: ['live'],
  };
  homeTrips.data = { now: homeTrip('live'), next: homeTrip('soon', 'planning') };
}

/** Every shared object back to its start, in the window and appearance of the reference phone. */
export function resetHome() {
  jest.spyOn(Dimensions, 'get').mockReturnValue({
    width: WIDTH,
    height: HEIGHT,
    scale: 3,
    fontScale: 1,
  });
  (
    jest.requireMock('@/hooks/use-appearance') as { useAppearance: jest.Mock }
  ).useAppearance.mockReturnValue(appearance());
  globe.data = { trips: [], focus: [], summary: { countriesVisited: 0, distanceKm: 0 } };
  globe.loading = false;
  globe.error = null;
  homeTrips.data = { now: null, next: null };
  homeTrips.covers = {};
  homeTrips.loading = false;
  homeTrips.error = null;
  overview.data = { summaries: [], groups: [], totals: {} };
  overview.loading = false;
  overview.error = null;
  sync.current = { kind: 'synced' };
  sheet.props = null;
  focus.focused = true;
  focus.appActive = true;
  router.push.mockReset();
  router.navigate.mockReset();
  camera().setCamera.mockClear();
  useSessionStore.setState({
    status: 'signed-in',
    user: { display_name: 'Ana' } as never,
  });
}

export function ui() {
  return (
    <SafeAreaInsetsContext.Provider value={INSETS}>
      <HomeScreen />
    </SafeAreaInsetsContext.Provider>
  );
}

export async function layoutHeader(height = HEADER) {
  await fireEvent(screen.getByTestId('home-header'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: WIDTH, height } },
  });
}

/** Renders the Home and lays its header out, which is what lets the globe mount. */
export async function renderHome() {
  const view = await render(ui());
  await layoutHeader();
  return view;
}

type Detent = 'peek' | 'half' | 'full';

/** The sheet came to rest on `detent` (its second report). */
export const settle = (detent: Detent) =>
  act(() => (sheet.props!.onSettle as (d: string) => void)(detent));
/** The traveller moved the sheet to `detent` (its first report). */
export const changeDetent = (detent: Detent) =>
  act(() => (sheet.props!.onDetentChange as (d: string) => void)(detent));
export const sheetDetent = () => sheet.props!.detent;

export const fitFor = (detent: 'peek' | 'half', header = HEADER) =>
  globeFit(detent, WIDTH, header, HEIGHT - DETENTS[detent], HEIGHT);
