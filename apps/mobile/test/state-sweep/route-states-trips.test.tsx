/**
 * T559 - the Trips route, in every state it has (FR-064, FR-066, FR-080 as amended by Q-11):
 * loading, an unreadable store, no trips, the list, a filter with no match, the sync chip
 * waiting and failed, and the offline banner. In each: no control that does nothing, no control
 * that says it is not available yet without being a coming-soon control (and the reverse), at
 * most ONE primary ("Plan a trip", above the pill, in every state).
 *
 * The live query and the sync seam are replaced by plain objects, as in the screen's own suite.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import TripsScreen from '@/app/(tabs)/trips';
import { TabInsetContext } from '@/hooks/tab-inset-context';
import type { TripCardModel } from '@/features/trips/trip-card-model';
import type { TripsSync } from '@/features/trips/use-trips-sync';

import {
  deadControls,
  misroutedComingSoon,
  pressableCount,
  primaryControls,
} from '../helpers/dead-controls';
import { cardModel } from '../helpers/trip-card-fixture';

jest.setTimeout(60_000);

jest.mock('expo-router', () => {
  const React = require('react') as typeof import('react');
  return {
    useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), back: jest.fn() }),
    Stack: {
      Screen: (props: {
        options?: { headerRight?: (arg: Record<string, unknown>) => React.ReactNode };
      }) =>
        React.createElement(
          React.Fragment,
          null,
          props.options?.headerRight?.({ tintColor: 'tint', canGoBack: false }),
        ),
    },
  };
});
jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return { Image: (props: Record<string, unknown>) => React.createElement(Host, props) };
});
jest.mock('@/components/ui/toast-zone', () => ({
  ...jest.requireActual('@/components/ui/toast-zone'),
  useToastVisible: () => false,
}));

const mockTrips: { data: TripCardModel[]; loading: boolean; error: Error | null } = {
  data: [],
  loading: false,
  error: null,
};
jest.mock('@/features/trips/use-trips', () => ({ useTrips: () => mockTrips }));

const mockSync: { current: Omit<TripsSync, 'retry'> } = {
  current: { chip: { kind: 'synced' }, banner: null },
};
jest.mock('@/features/trips/use-trips-sync', () => ({
  useTripsSync: () => ({ ...mockSync.current, retry: jest.fn() }),
}));

const INSETS = { top: 47, bottom: 34, left: 0, right: 0 };
const TAB_ZONE = 88;

const renderTrips = () =>
  render(
    <SafeAreaInsetsContext.Provider value={INSETS}>
      <BottomTabBarHeightContext.Provider value={TAB_ZONE}>
        <TabInsetContext.Provider value={TAB_ZONE}>
          <TripsScreen />
        </TabInsetContext.Provider>
      </BottomTabBarHeightContext.Provider>
    </SafeAreaInsetsContext.Provider>,
  );

beforeEach(() => {
  mockTrips.data = [];
  mockTrips.loading = false;
  mockTrips.error = null;
  mockSync.current = { chip: { kind: 'synced' }, banner: null };
});

const MIXED = () => [
  cardModel({ id: 'now', title: 'Portugal Road Trip' }),
  cardModel({
    id: 'next',
    title: 'Iceland',
    status: 'planning',
    dayOf: null,
    daysToGo: 94,
    strip: ['next'],
    stripLabels: ['REY'],
  }),
  cardModel({
    id: 'tokyo',
    title: 'Tokyo',
    status: 'past',
    dayOf: null,
    strip: ['done'],
    stripLabels: ['TOK'],
  }),
];

/** What every state of every route owes the traveller. */
function expectHealthy() {
  expect(pressableCount()).toBeGreaterThan(0);
  expect(deadControls()).toEqual([]);
  expect(misroutedComingSoon()).toEqual([]);
  expect(primaryControls()).toEqual(['"Plan a trip"']);
}

describe('Trips states: no control is a dead end', () => {
  it('loading: skeletons, with "Plan a trip" and the pictured search', async () => {
    mockTrips.loading = true;
    await renderTrips();
    expect(screen.getByLabelText('Loading trips')).toBeTruthy();
    expectHealthy();
  });

  it('an unreadable store: words and an icon, with "Plan a trip"', async () => {
    mockTrips.error = new Error('database is locked');
    await renderTrips();
    expect(screen.getByText('Couldn’t read your trips')).toBeTruthy();
    expectHealthy();
  });

  it('no trips: "No trips yet" names "Plan a trip" and the button above the pill is the same one', async () => {
    await renderTrips();
    expect(screen.getByTestId('trips-empty')).toBeTruthy();
    expect(deadControls()).toEqual([]);
    expect(misroutedComingSoon()).toEqual([]);
    // The empty state's action is a secondary and the button above the pill is the primary.
    expect(primaryControls()).toEqual(['"Plan a trip"']);
    expect(screen.getByTestId('trips-empty-plan-trip').props.variant).toBe('secondary');
  });

  it('the list: a hero, a ticket and a row', async () => {
    mockTrips.data = MIXED();
    await renderTrips();
    expect(screen.getByTestId('trips-list')).toBeTruthy();
    expectHealthy();
  });

  it('a filter with no match: words, and "Show all trips" brings the list back', async () => {
    mockTrips.data = [
      cardModel({ id: 'only', title: 'Only', status: 'past', dayOf: null }),
    ];
    await renderTrips();
    await fireEvent.press(screen.getByTestId('trips-filter-planned'));
    expect(screen.getByTestId('trips-filtered-empty')).toBeTruthy();
    expectHealthy();

    await fireEvent.press(screen.getByTestId('trips-filter-reset'));
    expect(screen.queryByTestId('trips-filtered-empty')).toBeNull();
    expectHealthy();
  });

  it('changes waiting to sync: the chip is a status, not a control that does nothing', async () => {
    mockTrips.data = MIXED();
    mockSync.current = { chip: { kind: 'waiting', count: 2 }, banner: null };
    await renderTrips();
    expectHealthy();
  });

  it('a sync that failed: the chip says Retry and has a handler', async () => {
    mockTrips.data = MIXED();
    mockSync.current = {
      chip: { kind: 'failed', count: 2 },
      banner: {
        tone: 'error',
        message: "Couldn't sync 2 changes. Your trips are safe on this phone.",
        action: { label: 'Retry', onPress: jest.fn() },
      },
    };
    await renderTrips();
    expect(screen.getByTestId('sync-chip')).toBeTruthy();
    expectHealthy();
  });

  it('offline: the slim banner under the filter', async () => {
    mockTrips.data = MIXED();
    mockSync.current = {
      chip: { kind: 'offline', count: 3 },
      banner: { tone: 'offline', message: 'Offline. 3 changes will sync.' },
    };
    await renderTrips();
    expectHealthy();
  });
});
