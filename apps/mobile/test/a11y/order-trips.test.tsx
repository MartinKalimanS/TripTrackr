/**
 * T560 - the reading order of the Trips tab (feature 005; FR-070, FR-075, FR-076, SC-015;
 * UI-SPEC section 5): the count and the sync chip of the header, the filter (each pill a tab
 * that says whether it is selected), the hero card, the ticket, the year headers and rows, then
 * the "Plan a trip" button. The mocked world is `trips-screen.test.tsx`'s.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { Platform } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import TripsScreen from '@/app/(tabs)/trips';
import { TabInsetContext } from '@/hooks/tab-inset-context';
import type { TripCardModel } from '@/features/trips/trip-card-model';
import type { TripsSync } from '@/features/trips/use-trips-sync';

import { resetKeyboard } from '../helpers/keyboard';
import { cardModel } from '../helpers/trip-card-fixture';
import { accessibleNodes, expectReadingOrder, unnamed } from '../helpers/a11y-nodes';

// The first render of a suite pays for transforming every module the screen touches.
jest.setTimeout(60_000);

const mockPush = jest.fn();
const mockStackScreen = jest.fn();
const mockRetry = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react') as typeof import('react');
  return {
    useRouter: () => ({ push: mockPush, navigate: jest.fn(), back: jest.fn() }),
    Stack: {
      Screen: (props: {
        options?: { headerRight?: (arg: Record<string, unknown>) => React.ReactNode };
      }) => {
        mockStackScreen(props);
        return React.createElement(
          React.Fragment,
          null,
          props.options?.headerRight?.({ tintColor: 'tint', canGoBack: false }),
        );
      },
    },
  };
});

jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return { Image: (props: Record<string, unknown>) => React.createElement(Host, props) };
});

// `ListScreen` is the real one; the wrapper only records what the screen hands it, because the
// list the tests run under (`RecyclerView`) does not expose `getItemType` or the sticky indices.
const mockListProps: { current: Record<string, unknown> | null } = { current: null };
jest.mock('@/components/ui/list-screen', () => {
  const MockReact = require('react') as typeof import('react');
  const actual = jest.requireActual(
    '@/components/ui/list-screen',
  ) as typeof import('@/components/ui/list-screen');
  return {
    ...actual,
    ListScreen: (props: Record<string, unknown>) => {
      mockListProps.current = props;
      return MockReact.createElement(actual.ListScreen as never, props);
    },
  };
});

// The toast zone lives in the layout; here the screen only asks whether a toast is up.
const mockToastUp = { current: false };
jest.mock('@/components/ui/toast-zone', () => ({
  ...jest.requireActual('@/components/ui/toast-zone'),
  useToastVisible: () => mockToastUp.current,
}));
const { mockToast } = jest.requireMock('heroui-native') as {
  mockToast: { show: jest.Mock };
};

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
  useTripsSync: () => ({ ...mockSync.current, retry: mockRetry }),
}));

const INSETS = { top: 47, bottom: 34, left: 0, right: 0 };
const TAB_ZONE = 88;

/** Draws the screen as the given platform sees it, inside the providers a tab screen has. */
async function renderOn(os: 'ios' | 'android', tabZone = TAB_ZONE) {
  const platform = jest.replaceProperty(Platform, 'OS', os);
  await render(
    <SafeAreaInsetsContext.Provider value={INSETS}>
      <BottomTabBarHeightContext.Provider value={tabZone}>
        <TabInsetContext.Provider value={tabZone}>
          <TripsScreen />
        </TabInsetContext.Provider>
      </BottomTabBarHeightContext.Provider>
    </SafeAreaInsetsContext.Provider>,
  );
  return platform;
}

let platform: { restore: () => void } | undefined;
afterEach(() => {
  resetKeyboard();
  platform?.restore();
  platform = undefined;
});

beforeEach(() => {
  mockTrips.data = [];
  mockTrips.loading = false;
  mockTrips.error = null;
  mockSync.current = { chip: { kind: 'synced' }, banner: null };
  mockPush.mockReset();
  mockRetry.mockReset();
  mockStackScreen.mockClear();
  mockToastUp.current = false;
  mockToast.show.mockClear();
});

const past = (id: string, year: number, overrides: Partial<TripCardModel> = {}) =>
  cardModel({
    id,
    title: `Trip ${id}`,
    status: 'past',
    dateRange: { start: `${year}-03-02`, end: `${year}-03-10` },
    lengthDays: 9,
    dayOf: null,
    strip: ['done'],
    stripLabels: ['TOK'],
    distanceKm: 1000,
    ...overrides,
  });

const planned = (id: string, overrides: Partial<TripCardModel> = {}) =>
  cardModel({
    id,
    title: `Trip ${id}`,
    status: 'planning',
    dateRange: { start: '2027-01-16', end: '2027-01-24' },
    lengthDays: 9,
    dayOf: null,
    daysToGo: 94,
    strip: ['next'],
    stripLabels: ['REY'],
    ...overrides,
  });

const MIXED = () => [
  cardModel({ id: 'now', title: 'Portugal Road Trip' }),
  planned('next'),
  past('tokyo', 2026),
  past('mexico', 2025),
  past('lisbon', 2025),
];

describe('Trips reading order', () => {
  test('the header, the filter, the cards in the order of the list, the button', async () => {
    mockTrips.data = MIXED();
    platform = await renderOn('ios');
    const nodes = accessibleNodes();
    expectReadingOrder(nodes, [
      'trips-count',
      'trips-filter-all',
      'trips-filter-active',
      'trips-filter-planned',
      'trips-filter-past',
      'trip-card-now',
      'trip-card-next',
      'year-header-2026',
      'trip-card-tokyo',
      'year-header-2025',
      'trip-card-mexico',
      'trip-card-lisbon',
      'trips-plan-trip',
    ]);
    expect(unnamed(nodes)).toEqual([]);
  });

  test('every card is one stop that reads "title, status, N stops"', async () => {
    mockTrips.data = MIXED();
    platform = await renderOn('ios');
    const cards = accessibleNodes().filter((node) => node.id?.startsWith('trip-card-'));
    expect(cards.map((node) => node.name)).toEqual([
      'Portugal Road Trip, active, 3 stops',
      'Trip next, planning, 3 stops',
      'Trip tokyo, past, 3 stops',
      'Trip mexico, past, 3 stops',
      'Trip lisbon, past, 3 stops',
    ]);
    expect(cards.every((node) => node.role === 'button')).toBe(true);
  });

  test('the filter says which pill is selected and how many each holds, in words, not colour', async () => {
    mockTrips.data = MIXED();
    platform = await renderOn('ios');
    const pills = accessibleNodes().filter((node) =>
      node.id?.startsWith('trips-filter-'),
    );
    expect(pills.map((node) => [node.name, node.role, node.state])).toEqual([
      ['All, 5', 'tab', ['selected']],
      ['Active, 1', 'tab', []],
      ['Planned, 1', 'tab', []],
      ['Past, 3', 'tab', []],
    ]);
    await fireEvent.press(screen.getByTestId('trips-filter-planned'));
    const after = accessibleNodes().filter((node) =>
      node.id?.startsWith('trips-filter-'),
    );
    expect(after.map((node) => node.state)).toEqual([[], [], ['selected'], []]);
  });

  test('a filter with no answer says so and offers the way back, in order', async () => {
    mockTrips.data = [cardModel({ id: 'now', title: 'Portugal Road Trip' })];
    platform = await renderOn('ios');
    await fireEvent.press(screen.getByTestId('trips-filter-planned'));
    const nodes = accessibleNodes();
    expectReadingOrder(nodes, [
      'trips-filter-planned',
      'No planned trips',
      'Show all trips',
    ]);
    expect(unnamed(nodes)).toEqual([]);
  });

  test('no trips: the words, then the one button; loading: one announced region', async () => {
    platform = await renderOn('ios');
    expectReadingOrder(accessibleNodes(), ['No trips yet', 'trips-empty-plan-trip']);
    platform.restore();

    mockTrips.loading = true;
    platform = await renderOn('ios');
    expect(accessibleNodes().filter((node) => node.role === 'progressbar')).toEqual([
      expect.objectContaining({ name: 'Loading trips' }),
    ]);
  });
});
