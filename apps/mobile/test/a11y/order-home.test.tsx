/**
 * T560 - the reading order of the Home (feature 005; FR-075, FR-076, FR-017, SC-015; contract
 * C5-32 "Home", "Reading order header, globe, sheet"; UI-SPEC section 4): what a screen reader
 * walks, first stop to last, in every state of the screen, and the actions it offers on the globe.
 *
 * The tree order is the one the code gives; iOS and Android may also sort by position on the
 * screen, which only a device shows (the VoiceOver and TalkBack walk in
 * `reference/as-built/f14-a11y.md`). The mocked world is `test/helpers/home-state.tsx`, as in
 * `home-screen.test.tsx`; the sheet is its double (the real sheet's handle is
 * `order-sheet.test.tsx`).
 */
import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { appearance } from '../helpers/appearance';
import { manyCountries, overviewOf, rowLabel } from '../helpers/country-fixture';
import { captureIntervals } from '../helpers/captured-interval';
import {
  changeDetent,
  renderHome,
  resetHome,
  settle,
  ui,
  withLiveTrip,
  withPastTrip,
} from '../helpers/home-harness';
import { globe, overview } from '../helpers/home-state';
import {
  accessibleNodes,
  exposedArt,
  expectReadingOrder,
  unnamed,
  type OrderMatcher,
} from '../helpers/a11y-nodes';

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
  captureIntervals();
  useAppearance.mockReturnValue(appearance({ prefersLessMotion: true }));
});

const HEADER_AND_GLOBE: OrderMatcher[] = [
  'home-greeting-date',
  'home-greeting',
  'coming-soon-search',
  'globe-map',
];

describe('Home reading order: header, globe, sheet (contract C5-32)', () => {
  test('half: the greeting, the globe, the three figures, the live trip, up next, the button', async () => {
    withLiveTrip();
    await renderHome();
    const nodes = accessibleNodes();
    expectReadingOrder(nodes, [
      ...HEADER_AND_GLOBE,
      'globe-stats-countries-tile',
      'globe-stats-trips-tile',
      'coming-soon-distance',
      'home-now-card',
      'home-next-row',
      'home-plan-trip-fab',
    ]);
    expect(unnamed(nodes)).toEqual([]);
    expect(nodes.find((node) => node.id === 'home-greeting')).toMatchObject({
      name: 'Hello, Ana',
      role: 'header',
    });
  });

  test('peek: the greeting, the globe, the live trip and the button', async () => {
    withLiveTrip();
    await renderHome();
    await changeDetent('peek');
    await settle('peek');
    expectReadingOrder(accessibleNodes(), [
      ...HEADER_AND_GLOBE,
      'home-now-card',
      'home-plan-trip-fab',
    ]);
  });

  test('full: the header gives way, and the globe is followed by the Countries list in order', async () => {
    withPastTrip();
    await renderHome();
    await changeDetent('full');
    await settle('full');
    const nodes = accessibleNodes();
    expect(nodes.some((node) => node.id === 'home-greeting')).toBe(false);
    expectReadingOrder(nodes, [
      'globe-map',
      'Countries',
      /^1 of 195/,
      'countries-search-toggle',
      'countries-collapse',
      'countries-header-Europe',
      'country-row-PT',
    ]);
    expect(unnamed(nodes)).toEqual([]);
  });

  test('the globe is one stop that offers the four actions, in the order of the contract', async () => {
    withLiveTrip();
    await renderHome();
    const nodes = accessibleNodes();
    const globeStop = nodes.find((node) => node.id === 'globe-map');
    // The atmosphere, the graticule, the arcs and the pins draw inside this ONE stop.
    expect(nodes.filter((node) => node.id?.startsWith('mapbox-'))).toEqual([]);
    expect(globeStop?.actions).toEqual([
      'Next trip',
      'Previous trip',
      'Recentre the globe',
      'Open countries',
    ]);
    expect(globeStop?.name).toMatch(/Every trip is also listed in the Trips tab/);
  });

  test('no trips: the greeting, the globe, the invitation (its headline, words and buttons), nothing else', async () => {
    await renderHome();
    const nodes = accessibleNodes();
    expectReadingOrder(nodes, [
      'home-greeting',
      'globe-map',
      'Your globe is waiting for its first trip',
      'home-plan-trip',
    ]);
    expect(nodes.filter((node) => node.id === 'home-plan-trip')).toHaveLength(1);
    expect(unnamed(nodes)).toEqual([]);
  });

  test('unreadable store: the globe, then ONE alert, no sheet and no button', async () => {
    globe.error = new Error('store');
    await renderHome();
    const nodes = accessibleNodes();
    expectReadingOrder(nodes, ['home-greeting', 'globe-map', 'globe-notice']);
    expect(nodes.filter((node) => node.role === 'alert')).toHaveLength(1);
    expect(nodes.some((node) => node.id === 'home-plan-trip-fab')).toBe(false);
  });

  test('loading: ONE announced region, and none of the skeleton behind it', async () => {
    globe.loading = true;
    await render(ui());
    const nodes = accessibleNodes();
    expect(nodes.filter((node) => node.role === 'progressbar')).toEqual([
      expect.objectContaining({ name: 'Loading your globe', id: 'home-skeleton' }),
    ]);
    expect(nodes.filter((node) => node.id?.startsWith('home-skeleton'))).toHaveLength(1);
    expect(unnamed(nodes)).toEqual([]);
  });

  test('no drawing is left exposed to assistive technology (FR-076)', async () => {
    withLiveTrip();
    await renderHome();
    expect(exposedArt()).toEqual([]);
  });

  describe('the globe reaches every country (SC-015)', () => {
    const screenReader = (on: boolean) =>
      jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(on);
    afterEach(() => screenReader(false));

    async function openCountries() {
      withPastTrip();
      overview.data = overviewOf(manyCountries(30)) as typeof overview.data;
      await renderHome();
      await act(() =>
        screen.getByTestId('globe-map').props.onAccessibilityAction({
          nativeEvent: { actionName: 'openCountries' },
        }),
      );
      await settle('full');
      await act(() => new Promise<void>((resolve) => setTimeout(resolve, 60)));
      return accessibleNodes().filter((node) => node.id?.startsWith('country-row-'));
    }

    test('"Open countries" raises the list, and with a screen reader on all 30 countries are nodes', async () => {
      screenReader(true);
      const rows = await openCountries();
      expect(rows.map((node) => node.name)).toEqual(
        manyCountries(30)
          .sort(
            (a, b) =>
              a.continent.localeCompare(b.continent) || a.name.localeCompare(b.name),
          )
          .map(rowLabel),
      );
    });

    test('with none, the list stays virtualised', async () => {
      screenReader(false);
      expect((await openCountries()).length).toBeLessThan(30);
    });
  });
});
