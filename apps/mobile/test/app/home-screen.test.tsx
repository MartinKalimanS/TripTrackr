/**
 * The Home, composed (feature 005, T537; contract C5-32 "Home"; FR-010 to FR-021, FR-081,
 * FR-082, FR-084; research D5-03, D5-04): the ONE globe fills the screen under a transparent
 * header zone (greeting, sync chip and banner); the sheet floats over its lower part with three
 * detents; the camera follows every settle and the choice of a country; an invitation, a
 * skeleton and a notice are the empty, loading and unreadable states. The recentre control, the
 * idle spin, the map's actions and the touches are `home-screen-motion.test.tsx`.
 *
 * The data hooks are mocked (their own suites run them against a real database; the mocked world
 * is `test/helpers/home-state.tsx`). The globe is the REAL `GlobeView` over the Mapbox stand-in
 * of `jest.setup.ts`, so the camera is read from `__camera.setCamera` and the map's props from
 * `globe-map`; the sheet is a double that renders the body it is given and lets the test play its
 * two reports (`onDetentChange`, `onSettle`), because the sheet's own gestures are
 * `ui/sheet.test.tsx`'s.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { GlobeCamera } from '@/constants/theme';
import { globeFitCamera } from '@/features/globe/globe-fit';
import { countryMove } from '@/features/globe/globe-moves';
import { calloutBounds, ornamentOffsets } from '@/features/home/home-layout';

import { appearance } from '../helpers/appearance';
import { captureIntervals } from '../helpers/captured-interval';
import {
  DETENTS,
  HIDDEN,
  camera,
  changeDetent,
  fitFor,
  layoutHeader,
  PORTUGAL,
  renderHome,
  resetHome,
  settle,
  sheetDetent,
  trip,
  ui,
  withLiveTrip,
  withPastTrip,
} from '../helpers/home-harness';
import {
  HEADER,
  HEIGHT,
  TAB_ZONE,
  WIDTH,
  globe,
  homeTrips,
  router,
  sheet,
  sync,
} from '../helpers/home-state';

// The mocks are the shared world of the Home suites: see test/helpers/home-state.tsx.
jest.mock('expo-router', () => require('../helpers/home-state').factories.router());
jest.mock('@/hooks/use-app-active', () =>
  require('../helpers/home-state').factories.appActive(),
);
jest.mock('@/hooks/use-mapbox-ready', () =>
  require('../helpers/home-state').factories.mapboxReady(),
);
jest.mock('@/hooks/use-appearance');
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
jest.mock('@/components/ui/sheet', () =>
  require('../helpers/home-state').factories.sheet(),
);

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};

beforeEach(() => {
  resetHome();
  // The figures count up on a frame timer: held, so nothing ticks after a test has ended.
  captureIntervals();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Home states: the globe is always there, but while loading (FR-021, 003 FR-001)', () => {
  test('loading is the skeleton with the greeting of the last session, and no globe', async () => {
    globe.loading = true;
    await render(ui());
    expect(screen.getByTestId('home-screen')).toBeTruthy();
    expect(screen.getByTestId('home-skeleton')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Loading your globe' })).toBeTruthy();
    // The skeleton hides its shapes and its greeting from assistive technology: ONE region.
    expect(screen.getByText('Ana', HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId('globe-map')).toBeNull();
    expect(screen.queryByTestId('globe-empty-state')).toBeNull();
    expect(screen.queryByTestId('globe-notice')).toBeNull();
  });

  test('loading is drawn as home-loading.png: the day over the greeting, the search disc, a half-height sheet', async () => {
    globe.loading = true;
    await render(ui());
    expect(screen.getByText(/^[A-Za-z]{3} [0-9]{1,2} [A-Za-z]{3}$/, HIDDEN)).toBeTruthy();
    // The pictured search disc is real and stays out of the announced region.
    expect(screen.getByTestId('coming-soon-search')).toBeTruthy();
    expect(screen.getByTestId('home-skeleton')).not.toContainElement(
      screen.getByTestId('coming-soon-search'),
    );
    const sheet = screen.getByTestId('home-skeleton-sheet', HIDDEN);
    expect(StyleSheet.flatten(sheet.props.style)).toMatchObject({
      height: DETENTS.half,
    });
  });

  test('stays the skeleton until the sheet\u2019s trips and the countries have also answered', async () => {
    homeTrips.loading = true;
    await render(ui());
    expect(screen.getByTestId('home-skeleton')).toBeTruthy();
    expect(screen.queryByTestId('globe-map')).toBeNull();
  });

  test('an unreadable store is the globe with ONE plain notice over it, never the raw error', async () => {
    globe.error = new Error('database is locked');
    await renderHome();
    expect(screen.getAllByTestId('globe-map')).toHaveLength(1);
    expect(screen.getByText('Couldn’t read your trips')).toBeTruthy();
    expect(screen.queryByText('database is locked')).toBeNull();
    const notice = screen.getByTestId('globe-notice');
    expect(notice.props.accessibilityRole).toBe('alert');
    expect(notice.props.accessible).toBe(true);
    expect(screen.queryByTestId('home-sheet')).toBeNull();
    expect(screen.queryByTestId('globe-stats')).toBeNull();
    expect(screen.queryByTestId('globe-empty-state')).toBeNull();
    expect(screen.queryByTestId('home-plan-trip-fab')).toBeNull();
  });

  test('with no trips: the globe, the sheet at zero and ONE "Plan a trip" button, no card (feature 007)', async () => {
    await renderHome();
    expect(screen.getAllByTestId('globe-map')).toHaveLength(1);
    expect(screen.queryByTestId('globe-empty-state')).toBeNull();
    expect(screen.queryByText('Your globe is waiting for its first trip')).toBeNull();
    expect(screen.getByTestId('home-sheet')).toBeTruthy();
    const fab = screen.getByTestId('home-plan-trip-fab');
    expect(fab.props.variant).toBe('primary');
    await fireEvent.press(fab);
    expect(router.push).toHaveBeenCalledWith('/modal/add-trip');
  });

  test('with one trip and no stop the card opens that trip; with several it opens the list', async () => {
    globe.data = { ...globe.data, trips: [trip('lonely', 'planning', false)] };
    const view = await renderHome();
    expect(screen.getByText('Your trip needs a first stop')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('home-add-stop'));
    expect(router.push).toHaveBeenCalledWith('/trip/lonely');

    globe.data = {
      ...globe.data,
      trips: [trip('one', 'planning', false), trip('two', 'planning', false)],
    };
    await view.rerender(ui());
    expect(screen.getByText('Your trips need a first stop')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('home-open-trips'));
    expect(router.navigate).toHaveBeenCalledWith('/trips');
    expect(screen.queryByTestId('home-plan-trip-fab')).toBeNull();
  });

  test('keeps every id the screen had and tells the globe in words (FR-081)', async () => {
    withPastTrip();
    await renderHome();
    for (const id of [
      'home-screen',
      'home-overlay',
      'globe-map',
      'globe-stats',
      'globe-stat-countries',
      'globe-stat-distance',
    ]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    expect(screen.getByTestId('globe-map').props.accessibilityLabel).toBe(
      'Globe showing 1 trip across 1 country. Every trip is also listed in the Trips tab.',
    );
    // The figure counts up once; its name is the final value from the first render.
    expect(screen.getByTestId('globe-stat-countries').props.accessibilityLabel).toBe('1');
    expect(screen.getByTestId('home-overlay').props.pointerEvents).toBe('box-none');
  });
});

describe('Home layers and reading order (FR-010, FR-017)', () => {
  test('is ONE map, drawn over the sky, with the header over it and the sheet over that', async () => {
    withPastTrip();
    await renderHome();
    expect(screen.getAllByTestId('globe-map')).toHaveLength(1);
    expect(screen.getByTestId('scrim-sky', HIDDEN)).toBeTruthy();
    const header = StyleSheet.flatten(screen.getByTestId('home-overlay').props.style);
    expect(header.zIndex).toBeGreaterThan(0);
  });

  test('reads in the order: header, globe, sheet', async () => {
    withPastTrip();
    await renderHome();
    const order = screen
      .getAllByTestId(/^(home-overlay|home-globe|home-sheet)$/)
      .map((node) => node.props.testID);
    expect(order).toEqual(['home-overlay', 'home-globe', 'home-sheet']);
  });

  test('the header says hello to the traveller by name and carries the one sync chip', async () => {
    withPastTrip();
    sync.current = { kind: 'waiting', count: 3 };
    await renderHome();
    expect(screen.getByTestId('home-greeting')).toHaveTextContent('Hello, Ana');
    expect(screen.getAllByTestId('sync-chip')).toHaveLength(1);
  });

  test('offline: one chip and one slim banner under the greeting, and the globe keeps working', async () => {
    withPastTrip();
    sync.current = { kind: 'offline', count: 3 };
    await renderHome();
    expect(screen.getAllByTestId('sync-chip')).toHaveLength(1);
    expect(screen.getAllByTestId('sync-banner')).toHaveLength(1);
    expect(screen.getAllByTestId('globe-map')).toHaveLength(1);
  });

  test('offline at half: the banner is the first thing in the sheet, as home-offline.png draws it', async () => {
    withPastTrip();
    sync.current = { kind: 'offline', count: 3 };
    await renderHome();
    const banner = screen.getByTestId('sync-banner');
    expect(screen.getByTestId('home-sheet')).toContainElement(banner);
    expect(screen.getByTestId('home-header')).not.toContainElement(banner);
    expect(screen.getAllByTestId('sync-banner')).toHaveLength(1);
  });

  test('offline at peek: the banner is under the greeting (the peek sheet has no room), still ONE', async () => {
    withLiveTrip();
    sync.current = { kind: 'offline', count: 3 };
    await renderHome();
    await changeDetent('peek');
    expect(screen.getByTestId('home-header')).toContainElement(
      screen.getByTestId('sync-banner'),
    );
    expect(screen.getAllByTestId('sync-banner')).toHaveLength(1);
  });

  test('offline with a trip that has no stop (no sheet): the banner is under the greeting', async () => {
    globe.data = { ...globe.data, trips: [trip('lonely', 'planning', false)] };
    sync.current = { kind: 'offline', count: 3 };
    await renderHome();
    expect(screen.getByTestId('home-header')).toContainElement(
      screen.getByTestId('sync-banner'),
    );
  });

  test('with no trips the header greets as usual: no countries counter, and the search disc is there', async () => {
    await renderHome();
    expect(screen.getByTestId('home-greeting')).toHaveTextContent('Hello, Ana');
    expect(screen.queryByText(/of 195 countries/)).toBeNull();
    expect(screen.getByTestId('coming-soon-search')).toBeTruthy();
  });
});

describe('Home sheet: three positions over the globe (FR-012, FR-014, FR-015, FR-016)', () => {
  test('is given the heights of the window and the tab zone, a handle label and Android back', async () => {
    withPastTrip();
    await renderHome();
    expect(sheet.props!.detents).toEqual(DETENTS);
    expect(DETENTS).toEqual({ peek: 212, half: 439, full: 780 });
    expect(sheet.props!.handleLabel).toBe('Countries and trips');
    expect(sheet.props!.handleBack).not.toBe(false);
    expect(sheetDetent()).toBe('half');
  });

  test('half: the three figures, the live trip and the next planned trip', async () => {
    withLiveTrip();
    await renderHome();
    expect(screen.getByTestId('home-half')).toBeTruthy();
    expect(screen.getByTestId('globe-stats')).toBeTruthy();
    expect(screen.getByTestId('home-now-card')).toBeTruthy();
    expect(screen.getByTestId('home-next-row')).toBeTruthy();
  });

  test('the live card and the next row open their trips; the trips figure opens Trips', async () => {
    withLiveTrip();
    await renderHome();
    await fireEvent.press(screen.getByTestId('home-now-card'));
    expect(router.push).toHaveBeenCalledWith('/trip/live');
    await fireEvent.press(screen.getByTestId('home-next-row'));
    expect(router.push).toHaveBeenCalledWith('/trip/soon');
    await fireEvent.press(screen.getByTestId('globe-stats-trips-tile'));
    expect(router.navigate).toHaveBeenCalledWith('/trips');
  });

  test('the countries figure opens the Countries list: the sheet goes to full', async () => {
    withPastTrip();
    await renderHome();
    await fireEvent.press(screen.getByTestId('globe-stats-countries-tile'));
    expect(sheetDetent()).toBe('full');
    expect(screen.getByTestId('countries-list')).toBeTruthy();
    expect(screen.queryByTestId('home-half')).toBeNull();
  });

  test('peek shows only the live trip', async () => {
    withLiveTrip();
    await renderHome();
    await changeDetent('peek');
    expect(screen.getByTestId('home-peek')).toBeTruthy();
    expect(screen.getByTestId('home-now-card')).toBeTruthy();
    expect(screen.queryByTestId('home-next-row')).toBeNull();
    expect(screen.queryByTestId('globe-stats')).toBeNull();
  });

  test('full is the Countries list, the header is gone and the collapse control lowers it to half', async () => {
    sync.current = { kind: 'waiting', count: 2 };
    withPastTrip();
    await renderHome();
    await changeDetent('full');
    expect(screen.getByTestId('countries-list')).toBeTruthy();
    expect(screen.queryByTestId('home-header')).toBeNull();
    expect(screen.queryByTestId('home-greeting')).toBeNull();
    expect(screen.queryByTestId('sync-chip')).toBeNull();
    await fireEvent.press(screen.getByTestId('countries-collapse'));
    expect(sheetDetent()).toBe('half');
    expect(screen.getByTestId('home-header')).toBeTruthy();
  });
});

describe('Plan a trip: one extended button above the pill (FR-018)', () => {
  test('is shown with trips, opens the form, and is the screen\u2019s only primary', async () => {
    withPastTrip();
    await renderHome();
    const fab = screen.getByTestId('home-plan-trip-fab');
    expect(fab.props.accessibilityLabel).toBe('Plan a trip');
    expect(StyleSheet.flatten(fab.props.style).bottom).toBe(TAB_ZONE + 16);
    await fireEvent.press(fab);
    expect(router.push).toHaveBeenCalledWith('/modal/add-trip');
    expect(screen.queryByTestId('home-plan-trip')).toBeNull();
  });

  test('is hidden at the full detent and back at half', async () => {
    withPastTrip();
    await renderHome();
    await changeDetent('full');
    expect(screen.queryByTestId('home-plan-trip-fab')).toBeNull();
    await changeDetent('half');
    expect(screen.getByTestId('home-plan-trip-fab')).toBeTruthy();
  });

  test('is only the plus at peek, where the live card leaves it room', async () => {
    withLiveTrip();
    await renderHome();
    await changeDetent('peek');
    const fab = screen.getByTestId('home-plan-trip-fab');
    expect(fab.props.accessibilityLabel).toBe('Plan a trip');
    expect(StyleSheet.flatten(fab.props.style).minWidth).toBe(56);
  });
});

describe('The camera follows the sheet, once per settle (FR-013)', () => {
  test('the first frame is already fitted: the camera opens with the fit, and nothing animates', async () => {
    withPastTrip();
    await renderHome();
    const fit = globeFitCamera('half', fitFor('half'), { animated: false })!;
    expect(screen.getByTestId('mapbox-Camera').props.defaultSettings).toMatchObject({
      zoomLevel: fit.zoomLevel,
      padding: fit.padding,
    });
    expect(camera().setCamera).not.toHaveBeenCalled();
  });

  test('the globe does not mount before the header has been measured', async () => {
    withPastTrip();
    await render(ui());
    expect(screen.queryByTestId('globe-map')).toBeNull();
    await layoutHeader();
    expect(screen.getByTestId('globe-map')).toBeTruthy();
  });

  test.each(['peek', 'half'] as const)(
    'settling at %s eases the camera to that fit, once',
    async (detent) => {
      withPastTrip();
      await renderHome();
      await settle(detent);
      expect(camera().setCamera).toHaveBeenCalledTimes(1);
      expect(camera().setCamera).toHaveBeenCalledWith(
        globeFitCamera(detent, fitFor(detent), { animated: true }),
      );
      expect(camera().setCamera.mock.calls[0]![0]).toMatchObject({
        animationMode: 'easeTo',
        animationDuration: 280,
      });
    },
  );

  test('settling at full leaves the camera alone: the map is hidden', async () => {
    withPastTrip();
    await renderHome();
    await settle('full');
    expect(camera().setCamera).not.toHaveBeenCalled();
  });

  test('a traveller who asked for less motion gets a jump, not an ease', async () => {
    useAppearance.mockReturnValue(appearance({ prefersLessMotion: true }));
    withPastTrip();
    await renderHome();
    await settle('peek');
    expect(camera().setCamera.mock.calls[0]![0]).toMatchObject({
      animationMode: 'moveTo',
      animationDuration: 0,
    });
  });

  test('moving the logo and the attribution above the sheet, never hiding them', async () => {
    withPastTrip();
    await renderHome();
    const map = () => screen.getByTestId('globe-map');
    expect(map().props.logoPosition).toEqual(ornamentOffsets(DETENTS.half).logoPosition);
    expect(map().props.attributionPosition).toEqual(
      ornamentOffsets(DETENTS.half).attributionPosition,
    );
    await settle('peek');
    expect(map().props.logoPosition).toEqual(ornamentOffsets(DETENTS.peek).logoPosition);
    expect(map().props.logoEnabled).not.toBe(false);
    expect(map().props.attributionEnabled).not.toBe(false);
  });

  test('fits again when the header changes under a settled sheet (a banner arrived), not at the first measure', async () => {
    withPastTrip();
    await renderHome();
    expect(camera().setCamera).not.toHaveBeenCalled();
    await layoutHeader(HEADER + 48);
    expect(camera().setCamera).toHaveBeenCalledTimes(1);
    expect(camera().setCamera).toHaveBeenCalledWith(
      globeFitCamera('half', fitFor('half', HEADER + 48), { animated: true }),
    );
    await layoutHeader(HEADER + 48);
    expect(camera().setCamera).toHaveBeenCalledTimes(1);
  });

  test('the live trip\u2019s callout may use the space between the header and the sheet', async () => {
    withLiveTrip();
    await renderHome();
    expect(screen.getByTestId('globe-callout-title', HIDDEN).props.children).toBe(
      'Trip live',
    );
    expect(screen.getByTestId('globe-callout-detail', HIDDEN).props.children).toBe(
      'Day 3 of 8 \u00b7 Sintra',
    );
    expect(calloutBounds(HEADER, HEIGHT - DETENTS.half)).toEqual({
      top: HEADER,
      bottom: HEIGHT - DETENTS.half,
    });
  });
});

describe('Choosing a country (FR-016)', () => {
  test('lowers the sheet to half and, once it has come to rest, flies the globe into the free space above it', async () => {
    withPastTrip();
    await renderHome();
    await changeDetent('full');
    camera().setCamera.mockClear();

    await fireEvent.press(screen.getByTestId('country-row-PT'));
    expect(sheetDetent()).toBe('half');
    expect(camera().setCamera).not.toHaveBeenCalled();

    await settle('half');
    expect(camera().setCamera).toHaveBeenCalledTimes(1);
    const floor = GlobeCamera.zoomLevel + fitFor('half').zoomDelta;
    expect(camera().setCamera).toHaveBeenCalledWith(
      countryMove(
        PORTUGAL.focus,
        { top: HEADER, bottom: HEIGHT - DETENTS.half },
        { width: WIDTH, height: HEIGHT },
        floor,
        true,
      ),
    );
  });

  test('the flight takes the place of that settle\u2019s fit, and the next settle fits as usual', async () => {
    withPastTrip();
    await renderHome();
    await changeDetent('full');
    await fireEvent.press(screen.getByTestId('country-row-PT'));
    await settle('half');
    camera().setCamera.mockClear();
    await settle('peek');
    expect(camera().setCamera).toHaveBeenCalledWith(
      globeFitCamera('peek', fitFor('peek'), { animated: true }),
    );
  });

  test('offers the recentre control afterwards: the globe was moved', async () => {
    withPastTrip();
    await renderHome();
    await changeDetent('full');
    await fireEvent.press(screen.getByTestId('country-row-PT'));
    await changeDetent('half');
    expect(screen.getByTestId('home-recentre')).toBeTruthy();
  });
});
