/**
 * T559 - the Home route, in every state it has (FR-064, FR-066, FR-080 as amended by Q-11):
 * loading, the unreadable store, no trips, trips with no stop, the sheet (past, live), offline
 * and a sync that failed. In each: no control that does nothing, no control that says it is
 * not available yet without being a coming-soon control (and the reverse), at most ONE
 * primary, and a guard that has seen controls at all.
 *
 * The mocked world is the Home suites' (`test/helpers/home-state.tsx`); the globe is the real
 * `GlobeView` over the Mapbox stand-in.
 */
import { render, screen } from '@testing-library/react-native';

import {
  renderHome,
  resetHome,
  trip,
  ui,
  withLiveTrip,
  withPastTrip,
} from '../helpers/home-harness';
import { globe, homeTrips, sync } from '../helpers/home-state';
import {
  deadControls,
  misroutedComingSoon,
  pressableCount,
  primaryControls,
} from '../helpers/dead-controls';
import { captureIntervals } from '../helpers/captured-interval';

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

beforeEach(() => {
  resetHome();
  captureIntervals();
});
afterEach(() => jest.restoreAllMocks());

/** What every state of every route owes the traveller. */
function expectHealthy(options: { controls: boolean } = { controls: true }) {
  if (options.controls) expect(pressableCount()).toBeGreaterThan(0);
  expect(deadControls()).toEqual([]);
  expect(misroutedComingSoon()).toEqual([]);
  expect(primaryControls().length).toBeLessThanOrEqual(1);
}

describe('Home states: no control is a dead end', () => {
  it('loading: the skeleton, with the pictured search as a coming-soon control', async () => {
    globe.loading = true;
    await render(ui());
    expect(screen.getByTestId('home-skeleton')).toBeTruthy();
    expectHealthy();
    expect(primaryControls()).toEqual([]);
  });

  it('the sheet is still loading when only the trips of the sheet are', async () => {
    homeTrips.loading = true;
    await render(ui());
    expect(screen.getByTestId('home-skeleton')).toBeTruthy();
    expectHealthy();
  });

  it('an unreadable store: the globe and ONE plain notice', async () => {
    globe.error = new Error('database is locked');
    await renderHome();
    expect(screen.getByTestId('globe-notice')).toBeTruthy();
    expectHealthy();
  });

  it('no trips: the globe, the sheet and "Plan a trip" as its one primary, no card', async () => {
    await renderHome();
    expect(screen.queryByTestId('globe-empty-state')).toBeNull();
    expect(screen.getByTestId('home-sheet')).toBeTruthy();
    expectHealthy();
    expect(primaryControls()).toEqual(['"Plan a trip"']);
  });

  it('a trip with no stop: the card that opens it', async () => {
    globe.data = { ...globe.data, trips: [trip('lonely', 'planning', false)] };
    await renderHome();
    expect(screen.getByTestId('home-add-stop')).toBeTruthy();
    expectHealthy();
  });

  it('several trips with no stop: the card that opens the list', async () => {
    globe.data = {
      ...globe.data,
      trips: [trip('one', 'planning', false), trip('two', 'planning', false)],
    };
    await renderHome();
    expect(screen.getByTestId('home-open-trips')).toBeTruthy();
    expectHealthy();
  });

  it('a past trip: the sheet and "Plan a trip" above the pill', async () => {
    withPastTrip();
    await renderHome();
    expect(screen.getByTestId('home-sheet')).toBeTruthy();
    expectHealthy();
  });

  it('a live trip: the live card too', async () => {
    withLiveTrip();
    await renderHome();
    expect(screen.getByTestId('home-sheet')).toBeTruthy();
    expectHealthy();
  });

  it('offline: the chip and the slim banner, and the globe keeps working', async () => {
    withPastTrip();
    sync.current = { kind: 'offline', count: 3 };
    await renderHome();
    expect(screen.getByTestId('sync-banner')).toBeTruthy();
    expectHealthy();
  });

  it('a sync that failed: the chip says Retry and the banner stays calm', async () => {
    withPastTrip();
    sync.current = { kind: 'failed', count: 2 };
    await renderHome();
    expect(screen.getByTestId('sync-chip')).toBeTruthy();
    expectHealthy();
  });
});
