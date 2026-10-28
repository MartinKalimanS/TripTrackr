/**
 * T559 - the trip route, in every state it has (FR-064, FR-066, FR-080 as amended by Q-11):
 * the trip loading, unreadable and not on this device; its stops loading, unreadable, none and
 * listed. In each: no control that does nothing, no control that says it is not available yet
 * without being a coming-soon control (and the reverse), at most ONE primary ("Add stop" when
 * the trip has none).
 *
 * The live queries and the derived reads are the trip suites' (`trip-screen-harness.tsx`).
 */
import { render, screen } from '@testing-library/react-native';

import TripScreen from '@/app/trip/[id]/index';

import {
  deadControls,
  misroutedComingSoon,
  pressableCount,
  primaryControls,
} from '../helpers/dead-controls';
import {
  florence,
  live,
  resetTripScreen,
  rome,
  router,
} from '../app/trip-screen-harness';

jest.mock('expo-router', () => require('../app/trip-screen-harness').routerModule());
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));
jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () =>
  require('../app/trip-screen-harness').reanimatedModule(),
);
jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return {
    Image: (props: Record<string, unknown>) => React.createElement(Host, props),
  };
});
jest.mock('@/components/trip/city-picker', () =>
  require('../app/trip-screen-harness').cityPickerModule(),
);
jest.mock('@/features/trips/use-trips', () =>
  require('../app/trip-screen-harness').tripsModule(),
);
jest.mock('@/features/trips/trip-overview', () =>
  require('../app/trip-screen-harness').overviewModule(),
);
jest.mock('@/features/trips/use-trip-sync', () =>
  require('../app/trip-screen-harness').syncModule(),
);

beforeEach(resetTripScreen);

/** What every state of every route owes the traveller. */
function expectHealthy(primaries: string[]) {
  expect(pressableCount()).toBeGreaterThan(0);
  expect(deadControls()).toEqual([]);
  expect(misroutedComingSoon()).toEqual([]);
  expect(primaryControls()).toEqual(primaries);
}

describe('Trip states: no control is a dead end', () => {
  it('the trip is loading: a skeleton, and the screen is already the trip screen', async () => {
    live.trip.data = null;
    live.trip.loading = true;
    await render(<TripScreen />);
    expect(screen.getByTestId('trip-skeleton')).toBeTruthy();
    // A skeleton has no control; the native header's Back is the navigator's.
    expect(deadControls()).toEqual([]);
    expect(primaryControls()).toEqual([]);
  });

  it('the trip cannot be read: words and an icon', async () => {
    live.trip.data = null;
    live.trip.error = new Error('database is locked');
    await render(<TripScreen />);
    expect(screen.getByText('Couldn’t read this trip')).toBeTruthy();
    expect(deadControls()).toEqual([]);
    expect(primaryControls()).toEqual([]);
  });

  it('the trip is not on this device: it names the way back', async () => {
    live.trip.data = null;
    await render(<TripScreen />);
    expect(screen.getByTestId('trip-missing-back')).toBeTruthy();
    expect(router.params.id).toBe('trip-42');
    expectHealthy([]);
  });

  it('the stops are loading: a skeleton under the trip, which has its controls', async () => {
    live.stops.loading = true;
    await render(<TripScreen />);
    expect(screen.getByTestId('trip-stops-skeleton')).toBeTruthy();
    expectHealthy([]);
  });

  it('the stops cannot be read: words and an icon under the trip', async () => {
    live.stops.error = new Error('database is locked');
    await render(<TripScreen />);
    expect(screen.getByText('Couldn’t read the stops')).toBeTruthy();
    expectHealthy([]);
  });

  it('no stops: a ghost stamp and "Add stop", the one primary', async () => {
    await render(<TripScreen />);
    expect(screen.getByTestId('trip-empty')).toBeTruthy();
    expectHealthy(['"Add stop"']);
  });

  it('stops: the timeline, with the pictured List and Map toggle (Map is coming soon)', async () => {
    live.stops.data = [rome, florence];
    await render(<TripScreen />);
    expect(screen.getByTestId('coming-soon-trip-map')).toBeTruthy();
    expect(deadControls()).toEqual([]);
    expect(misroutedComingSoon()).toEqual([]);
    expect(primaryControls().length).toBeLessThanOrEqual(1);
  });
});
