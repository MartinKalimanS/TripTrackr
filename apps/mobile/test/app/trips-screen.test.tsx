/**
 * T541 - the Trips screen on Sunrise Passport (contract C5-31, C5-32 "Trips"; FR-024, FR-029,
 * FR-030, FR-035, FR-036, FR-065; research D5-12; owner answer Q-4).
 *
 * `useTrips` (its own suites run it against a real database) and the sync seam are mocked, and so
 * is the router: the header belongs to the navigator, so `Stack.Screen` is a stand-in that draws
 * the `headerRight` it is given where the native header would, and records the options. The
 * floating tab pill reports its zone through React Navigation's context, which a test provides.
 *
 * What is pinned: every state is designed (loading is never shown as empty), the mixed list
 * (hero, ticket, rows, year headers) in the order of `composeTripList`, the filter with its counts
 * and its empty answer, one "Plan a trip" button above the pill on both platforms (the iOS header
 * action is gone), the sync chip in the header and the banner under the filter, room at the foot
 * past the pill and the button, a list of 200 trips with its year strip, and that nothing here is
 * built on a retired primitive.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import TripsScreen from '@/app/(tabs)/trips';
import { Spacing } from '@/constants/theme';
import type { TripCardModel } from '@/features/trips/trip-card-model';
import type { TripListItem } from '@/features/trips/trip-sections';
import type { TripsSync } from '@/features/trips/use-trips-sync';

import { cardModel, manyTrips } from '../helpers/trip-card-fixture';

// The first render of a suite pays for transforming every module the screen touches, and a long list
// of cards is heavy under a loaded machine.
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

const hidden = { includeHiddenElements: true };
const INSETS = { top: 47, bottom: 34, left: 0, right: 0 };
const TAB_ZONE = 88;
const flat = (element: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(element.props.style as never) ?? {}) as Record<string, unknown>;

/** Draws the screen as the given platform sees it, inside the providers a tab screen has. */
async function renderOn(os: 'ios' | 'android', tabZone = TAB_ZONE) {
  const platform = jest.replaceProperty(Platform, 'OS', os);
  await render(
    <SafeAreaInsetsContext.Provider value={INSETS}>
      <BottomTabBarHeightContext.Provider value={tabZone}>
        <TripsScreen />
      </BottomTabBarHeightContext.Provider>
    </SafeAreaInsetsContext.Provider>,
  );
  return platform;
}

let platform: { restore: () => void } | undefined;
afterEach(() => {
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

describe('<TripsScreen> - the screen and its states (FR-036)', () => {
  test('keeps the ids the flows look for, and lays out no title of its own (the header is the title)', async () => {
    mockTrips.data = MIXED();
    platform = await renderOn('ios');

    expect(screen.getByTestId('trips-screen')).toBeTruthy();
    expect(screen.getByTestId('trips-list')).toBeTruthy();
    expect(screen.queryByText('Trips')).toBeNull();
  });

  test('loading is skeletons shaped like the list, ONE busy region, never the empty state', async () => {
    mockTrips.loading = true;
    platform = await renderOn('ios');

    const region = screen.getByLabelText('Loading trips');
    expect(region.props.accessibilityRole).toBe('progressbar');
    expect(screen.getAllByLabelText('Loading trips')).toHaveLength(1);
    expect(screen.getByTestId('trips-skeleton', hidden)).toBeTruthy();
    expect(screen.queryByText('No trips yet')).toBeNull();
    expect(screen.queryByTestId('trips-list')).toBeNull();
    expect(screen.getByTestId('trips-screen')).toBeTruthy();
  });

  test('an error says what happened in words and shows no list, no filter and no stale card', async () => {
    mockTrips.error = new Error('database is locked');
    mockTrips.data = [past('stale', 2025)];
    platform = await renderOn('ios');

    expect(screen.getByText('Couldn’t read your trips')).toBeTruthy();
    expect(
      screen.getByText(
        'The local store did not answer. Restarting the app usually clears this.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('database is locked')).toBeNull();
    expect(screen.queryByTestId('trip-card-stale')).toBeNull();
    expect(screen.queryByTestId('trips-filter')).toBeNull();
    expect(screen.queryByText('No trips yet')).toBeNull();
  });

  test('empty names the next step: the same words and a secondary "Plan a trip" action of its own', async () => {
    platform = await renderOn('ios');

    expect(screen.getByText('No trips yet')).toBeTruthy();
    expect(
      screen.getByText('Every trip you plan or take will be listed here.'),
    ).toBeTruthy();
    const action = screen.getByTestId('trips-empty-plan-trip');
    expect(action.props.accessibilityLabel).toBe('Plan a trip');
    expect(action.props.variant).toBe('secondary');
    expect(screen.queryByTestId('trips-filter')).toBeNull();
    expect(screen.queryByTestId('trips-list')).toBeNull();

    await fireEvent.press(action);
    expect(mockPush).toHaveBeenCalledWith('/modal/add-trip');
  });

  test('populated is the mixed list', async () => {
    mockTrips.data = MIXED();
    platform = await renderOn('ios');

    const list = screen.getByTestId('trips-list');
    expect(within(list).getByTestId('trip-card-now')).toBeTruthy();
    expect(within(list).getByTestId('trip-card-next')).toBeTruthy();
    expect(within(list).getByTestId('year-header-2026')).toBeTruthy();
    expect(within(list).getByTestId('year-header-2025')).toBeTruthy();
    expect(within(list).getByTestId('trip-card-tokyo')).toBeTruthy();
  });

  test('the list is the scroller and takes the content inset the native header needs (props asserted; the collapse itself is a device check, T408)', async () => {
    mockTrips.data = MIXED();
    platform = await renderOn('ios');

    const list = screen.getByTestId('trips-list');
    expect(list.type).toBe('RCTScrollView');
    expect(list.props.contentInsetAdjustmentBehavior).toBe('automatic');
  });
});

describe('<TripsScreen> - the mixed list (FR-030)', () => {
  test('shows the active trip as the hero, the next planned trip as the ticket, the rest as rows', async () => {
    mockTrips.data = MIXED();
    platform = await renderOn('ios');

    // The hero carries the day, the ticket the stub, a row neither.
    expect(screen.getByText('Active · Day 3 of 8')).toBeTruthy();
    expect(screen.getByTestId('trip-card-next-stub')).toBeTruthy();
    expect(screen.queryByTestId('trip-card-tokyo-stub')).toBeNull();
    expect(screen.getByTestId('trip-card-tokyo-thumb')).toBeTruthy();
    expect(screen.queryByTestId('trip-card-now-thumb')).toBeNull();
  });

  test('each trip opens itself, whatever shape it is drawn in', async () => {
    mockTrips.data = MIXED();
    platform = await renderOn('ios');

    for (const id of ['now', 'next', 'tokyo']) {
      mockPush.mockReset();
      await fireEvent.press(screen.getByTestId(`trip-card-${id}`));
      expect(mockPush).toHaveBeenCalledWith(`/trip/${id}`);
    }
  });

  test('every card is announced "title, status, N stops"', async () => {
    mockTrips.data = MIXED();
    platform = await renderOn('ios');

    expect(screen.getByTestId('trip-card-now').props.accessibilityLabel).toBe(
      'Portugal Road Trip, active, 3 stops',
    );
    expect(screen.getByTestId('trip-card-tokyo').props.accessibilityLabel).toBe(
      'Trip tokyo, past, 3 stops',
    );
  });

  test('says how many trips there are, under the title', async () => {
    mockTrips.data = MIXED();
    platform = await renderOn('ios');
    expect(screen.getByTestId('trips-count')).toHaveTextContent('5 trips');
  });

  test('says since when from 200 trips', async () => {
    mockTrips.data = manyTrips(214);
    platform = await renderOn('ios');
    expect(screen.getByTestId('trips-count')).toHaveTextContent('214 trips · since 2009');
  });
});

describe('<TripsScreen> - what it hands the list (FR-030, FR-035; D5-12)', () => {
  type SeenList = {
    data: TripListItem[];
    getItemType: (item: TripListItem, index: number) => string;
    keyExtractor: (item: TripListItem, index: number) => string;
    stickyHeaderIndices: number[];
  };
  const seen = () => mockListProps.current as unknown as SeenList;

  test('recycles cells by shape: the type of each item is its own kind', async () => {
    mockTrips.data = MIXED();
    platform = await renderOn('ios');

    const { data, getItemType } = seen();
    expect(data.map((item, index) => getItemType(item, index))).toEqual([
      'hero',
      'ticket',
      'yearHeader',
      'row',
      'yearHeader',
      'row',
      'row',
    ]);
  });

  test('sticks the year headers, and only them', async () => {
    mockTrips.data = MIXED();
    platform = await renderOn('ios');

    expect(seen().stickyHeaderIndices).toEqual([2, 4]);
  });

  test('keys every item by its own id (a header by its year), each one once', async () => {
    mockTrips.data = MIXED();
    platform = await renderOn('ios');

    const { data, keyExtractor } = seen();
    const keys = data.map((item, index) => keyExtractor(item, index));
    expect(keys).toEqual([
      'now',
      'next',
      'year-2026',
      'tokyo',
      'year-2025',
      'mexico',
      'lisbon',
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('sticks the headers of 214 trips too: one per year, at the index it sits at', async () => {
    mockTrips.data = manyTrips(214);
    platform = await renderOn('ios');

    const { data, stickyHeaderIndices } = seen();
    expect(stickyHeaderIndices.length).toBe(17);
    expect(stickyHeaderIndices.every((index) => data[index]?.type === 'yearHeader')).toBe(
      true,
    );
  });
});

describe('<TripsScreen> - the filter (FR-029)', () => {
  test('is one pill of All, Active, Planned and Past, each with its count in its name', async () => {
    mockTrips.data = MIXED();
    platform = await renderOn('ios');

    const expected = {
      'trips-filter-all': 'All, 5',
      'trips-filter-active': 'Active, 1',
      'trips-filter-planned': 'Planned, 1',
      'trips-filter-past': 'Past, 3',
    };
    for (const [id, name] of Object.entries(expected)) {
      expect(screen.getByTestId(id).props.accessibilityLabel).toBe(name);
    }
    expect(screen.getByTestId('trips-filter-all').props.accessibilityState).toMatchObject(
      {
        selected: true,
      },
    );
  });

  test('Planned keeps only the planned trips, composed as their own list', async () => {
    mockTrips.data = [
      ...MIXED(),
      planned('later', { dateRange: { start: '2027-06-01', end: '2027-06-05' } }),
    ];
    platform = await renderOn('ios');

    await fireEvent.press(screen.getByTestId('trips-filter-planned'));

    expect(
      screen.getByTestId('trips-filter-planned').props.accessibilityState,
    ).toMatchObject({
      selected: true,
    });
    expect(screen.getByTestId('trip-card-next')).toBeTruthy();
    expect(screen.getByTestId('trip-card-later')).toBeTruthy();
    expect(screen.queryByTestId('trip-card-now')).toBeNull();
    expect(screen.queryByTestId('trip-card-tokyo')).toBeNull();
    // The counts do not move with the filter: they say what each would show.
    expect(screen.getByTestId('trips-filter-past').props.accessibilityLabel).toBe(
      'Past, 3',
    );
  });

  test('Active shows the hero alone, Past the rows under their years', async () => {
    mockTrips.data = MIXED();
    platform = await renderOn('ios');

    await fireEvent.press(screen.getByTestId('trips-filter-active'));
    expect(screen.getByTestId('trip-card-now')).toBeTruthy();
    expect(screen.queryByTestId('trip-card-next')).toBeNull();
    expect(screen.queryByTestId('year-header-2025')).toBeNull();

    await fireEvent.press(screen.getByTestId('trips-filter-past'));
    expect(screen.queryByTestId('trip-card-now')).toBeNull();
    expect(screen.getByTestId('year-header-2025')).toBeTruthy();
    expect(screen.getByTestId('trip-card-mexico')).toBeTruthy();
  });

  test('a filter with no match says so in words and offers the way back', async () => {
    mockTrips.data = [past('only', 2025)];
    platform = await renderOn('ios');

    await fireEvent.press(screen.getByTestId('trips-filter-planned'));

    expect(screen.getByText('No planned trips')).toBeTruthy();
    expect(screen.getByTestId('trips-filter')).toBeTruthy();
    expect(screen.queryByTestId('trips-list')).toBeNull();
    expect(screen.queryByText('No trips yet')).toBeNull();

    await fireEvent.press(screen.getByTestId('trips-filter-reset'));
    expect(screen.getByTestId('trip-card-only')).toBeTruthy();
  });

  test.each([
    ['active', 'No active trips'],
    ['past', 'No past trips'],
  ] as const)('%s says "%s" when nothing matches', async (key, words) => {
    mockTrips.data = [planned('p')];
    platform = await renderOn('ios');
    await fireEvent.press(screen.getByTestId(`trips-filter-${key}`));
    expect(screen.getByText(words)).toBeTruthy();
  });
});

describe('<TripsScreen> - sync (FR-026, FR-065)', () => {
  test('draws no chip and no banner when everything is synchronised', async () => {
    mockTrips.data = MIXED();
    platform = await renderOn('ios');

    expect(screen.queryByTestId('sync-chip', hidden)).toBeNull();
    expect(screen.queryByTestId('trips-sync-banner')).toBeNull();
  });

  test('puts ONE chip in the header, in words, while changes wait', async () => {
    mockTrips.data = MIXED();
    mockSync.current = { chip: { kind: 'waiting', count: 3 }, banner: null };
    platform = await renderOn('ios');

    const chips = screen.getAllByTestId('sync-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0]?.props.accessibilityLabel).toBe('3 changes waiting to sync');
    const options = mockStackScreen.mock.calls.at(-1)?.[0].options;
    expect(typeof options.headerRight).toBe('function');
  });

  test('a failed sync offers Retry on the chip, and Retry runs the retry of the seam', async () => {
    mockTrips.data = MIXED();
    mockSync.current = { chip: { kind: 'failed', count: 2 }, banner: null };
    platform = await renderOn('ios');

    const chip = screen.getByTestId('sync-chip');
    expect(chip.props.accessibilityLabel).toBe('Sync failed, retry');
    await fireEvent.press(chip);
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  test('the offline banner is one slim notice under the filter', async () => {
    mockTrips.data = MIXED();
    mockSync.current = {
      chip: { kind: 'offline', count: 3 },
      banner: {
        tone: 'offline',
        message: "Offline. 3 changes will sync when you're back online.",
      },
    };
    platform = await renderOn('ios');

    expect(screen.getByTestId('trips-sync-banner')).toBeTruthy();
    expect(
      screen.getByText("Offline. 3 changes will sync when you're back online."),
    ).toBeTruthy();
  });

  test('the error banner is calm and carries Retry', async () => {
    mockTrips.data = MIXED();
    const onPress = jest.fn();
    mockSync.current = {
      chip: { kind: 'failed', count: 2 },
      banner: {
        tone: 'error',
        message: "Couldn't sync 2 changes. Your trips are safe on this phone.",
        action: { label: 'Retry', onPress },
      },
    };
    platform = await renderOn('ios');

    expect(
      screen.getByText("Couldn't sync 2 changes. Your trips are safe on this phone."),
    ).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Retry', { exact: true }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('a waiting trip carries its own marker, in words, beside the chip', async () => {
    mockTrips.data = [...MIXED(), past('waiting', 2024, { pending: true })];
    platform = await renderOn('ios');
    expect(screen.getAllByText('Not yet synced')).toHaveLength(1);
  });
});

describe('<TripsScreen> - Plan a trip: one button above the pill, on both platforms (FR-029, Q-4)', () => {
  test.each(['ios', 'android'] as const)(
    'on %s: the one primary, named and worded "Plan a trip", id trips-plan-trip, unique',
    async (os) => {
      mockTrips.data = MIXED();
      platform = await renderOn(os);

      const plan = screen.getAllByTestId('trips-plan-trip', hidden);
      expect(plan).toHaveLength(1);
      expect(plan[0]?.props.accessibilityLabel).toBe('Plan a trip');
      expect(plan[0]?.props.variant).toBe('primary');
      expect(within(plan[0] as never).getByText('Plan a trip')).toBeTruthy();

      await fireEvent.press(screen.getByTestId('trips-plan-trip'));
      expect(mockPush).toHaveBeenCalledWith('/modal/add-trip');
    },
  );

  test('floats 16 dp above the zone the pill takes', async () => {
    mockTrips.data = MIXED();
    platform = await renderOn('ios');
    expect(flat(screen.getByTestId('trips-plan-trip')).bottom).toBe(
      TAB_ZONE + Spacing.three,
    );
  });

  test('the header holds no "Plan a trip" any more: only the sync chip may be there', async () => {
    mockTrips.data = MIXED();
    mockSync.current = { chip: { kind: 'waiting', count: 1 }, banner: null };
    platform = await renderOn('ios');

    const header = mockStackScreen.mock.calls
      .map(([props]) => props.options?.headerRight)
      .filter(Boolean);
    expect(header.length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('trips-plan-trip', hidden)).toHaveLength(1);
  });

  test('is there in every state, empty and loading and failed too (the flows tap it from an empty list)', async () => {
    for (const state of ['empty', 'loading', 'error'] as const) {
      mockTrips.data = [];
      mockTrips.loading = state === 'loading';
      mockTrips.error = state === 'error' ? new Error('x') : null;
      platform = await renderOn('android');
      expect(screen.getAllByTestId('trips-plan-trip', hidden).length).toBeGreaterThan(0);
      platform.restore();
      platform = undefined;
    }
  });

  test('in the empty state there are two ways to plan: the one primary and a secondary action', async () => {
    platform = await renderOn('android');

    const primaries = screen
      .getAllByRole('button', hidden)
      .filter((button) => button.props.variant === 'primary');
    expect(primaries).toHaveLength(1);
    expect(screen.getByTestId('trips-empty-plan-trip').props.variant).toBe('secondary');
  });
});

describe('<TripsScreen> - nothing behind the pill or the button (FR-024)', () => {
  test('the list ends past the pill, then the button, then a margin', async () => {
    mockTrips.data = MIXED();
    platform = await renderOn('ios');

    const content = flat({
      props: { style: screen.getByTestId('trips-list').props.contentContainerStyle },
    });
    const clearance = flat(screen.getByTestId('trips-fab-clearance', hidden));
    // The button is 56 dp at least and floats 16 dp above the pill's zone: the content's
    // foot (its padding and the clearance) is more than all of that.
    const foot = (content.paddingBottom as number) + (clearance.height as number);
    expect(foot).toBeGreaterThanOrEqual(TAB_ZONE + Spacing.three + 56 + Spacing.three);
    expect(
      within(screen.getByTestId('trips-list')).getByTestId('trips-fab-clearance', hidden),
    ).toBeTruthy();
  });

  test('the clearance is decoration, and grows with the text size (a minimum)', async () => {
    mockTrips.data = MIXED();
    platform = await renderOn('ios');
    const clearance = screen.getByTestId('trips-fab-clearance', hidden);
    expect(clearance.props.accessibilityElementsHidden).toBe(true);
    // The jest window reports a font scale of 2: the button is 96 dp, not 56.
    expect(flat(clearance).height).toBeGreaterThan(56 + Spacing.three);
  });

  test('pads the list by the zone of the pill, whatever it is', async () => {
    mockTrips.data = MIXED();
    platform = await renderOn('ios', 120);
    const content = flat({
      props: { style: screen.getByTestId('trips-list').props.contentContainerStyle },
    });
    expect(content.paddingBottom).toBe(Spacing.four + 120);
  });

  test('draws without a tab navigator around it (a component test): no zone, no crash', async () => {
    mockTrips.data = MIXED();
    platform = jest.replaceProperty(Platform, 'OS', 'ios');
    await render(<TripsScreen />);
    expect(screen.getByTestId('trips-list')).toBeTruthy();
    expect(flat(screen.getByTestId('trips-plan-trip')).bottom).toBe(Spacing.three);
  });

  test('the side margin is 20 dp, and 16 dp on an Android list', async () => {
    mockTrips.data = MIXED();
    platform = await renderOn('ios');
    expect(
      flat({
        props: { style: screen.getByTestId('trips-list').props.contentContainerStyle },
      }).paddingHorizontal,
    ).toBe(20);
    platform.restore();

    platform = await renderOn('android');
    expect(
      flat({
        props: {
          style: screen.getAllByTestId('trips-list').at(-1)!.props.contentContainerStyle,
        },
      }).paddingHorizontal,
    ).toBe(16);
  });
});

describe('<TripsScreen> - 200 trips (FR-035; SC-006)', () => {
  test('stays a virtualised list: far fewer cards are drawn than there are trips', async () => {
    mockTrips.data = manyTrips(214);
    platform = await renderOn('ios');

    const cards = screen.queryAllByTestId(/^trip-card-trip-\d+$/);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThan(214);
  });

  test('shows the year strip from 200 trips, as ONE adjustable control', async () => {
    mockTrips.data = manyTrips(214);
    platform = await renderOn('ios');

    const strip = screen.getByTestId('trips-year-scrubber');
    expect(strip.props.accessibilityRole).toBe('adjustable');
    expect(screen.getByTestId('trips-year-scrubber-year-2025', hidden)).toBeTruthy();
  });

  test('leaves the strip its own room: the list takes 44 dp at the end, so no card runs under it', async () => {
    mockTrips.data = manyTrips(214);
    platform = await renderOn('ios');

    const content = flat({
      props: { style: screen.getByTestId('trips-list').props.contentContainerStyle },
    });
    expect(content.paddingEnd).toBe(44);
    expect(content.paddingHorizontal).toBe(20);
  });

  test('shows none below 200: the headers are enough', async () => {
    mockTrips.data = manyTrips(199);
    platform = await renderOn('ios');
    expect(screen.queryByTestId('trips-year-scrubber')).toBeNull();
    expect(
      flat({
        props: { style: screen.getByTestId('trips-list').props.contentContainerStyle },
      }).paddingEnd,
    ).toBeUndefined();
  });

  test('the strip follows the filter: no years in it when a filter leaves none', async () => {
    mockTrips.data = manyTrips(214);
    platform = await renderOn('ios');

    await fireEvent.press(screen.getByTestId('trips-filter-active'));
    expect(screen.queryByTestId('trips-year-scrubber')).toBeNull();
  });

  test('a jump through the strip does not crash the list', async () => {
    mockTrips.data = manyTrips(214);
    platform = await renderOn('ios');

    await fireEvent(screen.getByTestId('trips-year-scrubber'), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });
    expect(screen.getByTestId('trips-list')).toBeTruthy();
  });
});

describe('<TripsScreen> - sources (FR-009, FR-036)', () => {
  const FILES = ['app/(tabs)/trips/index.tsx'];
  const source = (file: string) =>
    readFileSync(path.resolve(__dirname, '..', '..', 'src', file), 'utf8');
  const importsOf = (text: string) =>
    [...text.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);

  test.each(FILES)('%s imports none of the retired primitives', (file) => {
    const specifiers = importsOf(source(file));
    expect(specifiers).not.toContain('@/components/ui/surface');
    expect(specifiers).not.toContain('@/components/ui/pressable-surface');
    expect(specifiers).not.toContain('@/components/themed-text');
    expect(specifiers).not.toContain('@/components/themed-view');
    expect(specifiers).not.toContain('@/components/trip/trip-card');
    expect(specifiers).not.toContain('@/components/trip/plan-trip-action');
  });

  test.each(FILES)('%s has no colour literal and imports no kit', (file) => {
    const text = source(file);
    expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|\[#/);
    expect(importsOf(text).some((from) => /^(heroui-native|uniwind)/.test(from))).toBe(
      false,
    );
  });

  test('the list is a ListScreen (FlashList), never a Screen with the rows nested in it', () => {
    const specifiers = importsOf(source('app/(tabs)/trips/index.tsx'));
    expect(specifiers).toContain('@/components/ui/list-screen');
    expect(specifiers).not.toContain('@/components/ui/screen');
  });
});
