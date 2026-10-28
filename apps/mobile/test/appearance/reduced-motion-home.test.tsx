/**
 * T562 - reduced motion on the Home (feature 005; FR-019, FR-073, SC-008): the globe's idle
 * rotation, the beacon travelling a live trip, the live pin's pulse, the figures' count-up and
 * the sheet's spring are all gone, and every destination is still shown. The mocked world is
 * the Home suites' (`test/helpers/home-state.tsx`); the appearance is the real chain (an
 * `AppearanceScope`), so the flag reaches the globe, the callout and the sheet the way it does
 * on a device. Each movement has its control: with motion allowed it IS there.
 */
import { fireEvent, screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import HomeScreen from '@/app/(tabs)/index';
import { ActiveCallout } from '@/components/globe/active-callout';
import { IdleSpin } from '@/features/globe/idle-spin';

import { captureIntervals, type CapturedIntervals } from '../helpers/captured-interval';
import { withLiveTrip, withPastTrip } from '../helpers/home-harness';
import { HEADER, HEIGHT, INSETS, WIDTH, focus, sync } from '../helpers/home-state';

import { installThemeAwareKit, renderIn, treeNow } from './sweep';
import { motionIn } from './motion';

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => require('../mocks/reanimated-live'));
jest.mock('expo-router', () => require('../helpers/home-state').factories.router());
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

const live = () =>
  (
    jest.requireMock('react-native-reanimated') as {
      __live: { springs: unknown[]; reset: () => void };
    }
  ).__live;

let intervals: CapturedIntervals;

beforeEach(() => {
  installThemeAwareKit();
  live().reset();
  jest.spyOn(Dimensions, 'get').mockReturnValue({
    width: WIDTH,
    height: HEIGHT,
    scale: 3,
    fontScale: 1,
  });
  sync.current = { kind: 'synced' };
  focus.focused = true;
  focus.appActive = true;
  intervals = captureIntervals(IdleSpin.stepMs);
});
afterEach(() => jest.restoreAllMocks());

async function renderHome(reduceMotion: boolean) {
  await renderIn(
    <SafeAreaInsetsContext.Provider value={INSETS}>
      <HomeScreen />
    </SafeAreaInsetsContext.Provider>,
    { theme: 'light', reduceMotion },
  );
  await fireEvent(screen.getByTestId('home-header'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: WIDTH, height: HEADER } },
  });
}

const spins = () =>
  intervals.live().filter((interval) => interval.ms === IdleSpin.stepMs);

describe('the idle rotation of the globe (FR-019)', () => {
  test('motion allowed: the globe turns while Home is idle (the control)', async () => {
    withPastTrip();
    await renderHome(false);
    expect(spins()).toHaveLength(1);
  });

  test('reduced motion: it never starts', async () => {
    withPastTrip();
    await renderHome(true);
    expect(
      intervals.all.filter((interval) => interval.ms === IdleSpin.stepMs),
    ).toHaveLength(0);
  });
});

describe('a live trip: the beacon and the count-up', () => {
  test('motion allowed: timers run (the control)', async () => {
    withLiveTrip();
    await renderHome(false);
    expect(intervals.live().length).toBeGreaterThan(0);
  });

  test('reduced motion: no timer runs and nothing animates', async () => {
    withLiveTrip();
    await renderHome(true);
    expect(intervals.live()).toHaveLength(0);
    expect(motionIn(treeNow())).toEqual([]);
  });
});

describe('the live pin: the pulse (FR-073)', () => {
  const PIN = {
    coordinate: [-9.39, 38.8] as [number, number],
    title: 'Portugal Road Trip',
    detail: 'Day 3 of 8 · Sintra',
  };
  const pulse = () => motionIn(treeNow());

  test('motion allowed: the ring grows and fades, repeating (the control)', async () => {
    await renderIn(<ActiveCallout {...PIN} />, { theme: 'light' });
    expect(pulse()).toEqual(
      expect.arrayContaining([
        'View#globe-callout-pulse: animationName',
        'View#globe-callout-pulse: animationIterationCount',
      ]),
    );
  });

  test('reduced motion: a faint still ring, no animation of any kind', async () => {
    await renderIn(<ActiveCallout {...PIN} />, { theme: 'light', reduceMotion: true });
    expect(
      screen.getByTestId('globe-callout-pulse', { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(pulse()).toEqual([]);
  });
});

describe('the sheet (FR-073)', () => {
  test('motion allowed: a tap on the handle springs to the next detent (the control)', async () => {
    withPastTrip();
    await renderHome(false);
    await fireEvent.press(screen.getByTestId('home-sheet-handle'));
    expect(live().springs.length).toBeGreaterThan(0);
  });

  test('reduced motion: the same tap jumps, no spring is started', async () => {
    withPastTrip();
    await renderHome(true);
    await fireEvent.press(screen.getByTestId('home-sheet-handle'));
    expect(live().springs).toHaveLength(0);
  });
});
