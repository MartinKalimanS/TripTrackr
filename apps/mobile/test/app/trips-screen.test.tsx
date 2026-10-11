/**
 * T430 - the Trips screen on Atlas (contract C4-10, C4-11 "Trips"; FR-007, FR-011, FR-021,
 * FR-035, FR-037; research D4-06).
 *
 * `useTrips` is mocked (its own suite runs it against a real database) and so is the
 * router: the header belongs to the navigator, so `Stack.Screen` is a stand-in that draws
 * the `headerRight` it is given where the native header would, and records the options.
 * Platform differences are `Platform.OS` swaps.
 *
 * What is pinned: every state is designed (loading is never shown as empty), "Plan a trip"
 * is one control per platform with one id, the list is the scroller and leaves room for the
 * button, the card is the only thing in a row, and nothing here is built on a retired
 * primitive.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Dimensions, Platform } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import TripsScreen from '@/app/(tabs)/trips';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import type { TripSummary } from '@/features/trips/use-trips';

const mockPush = jest.fn();
const mockStackScreen = jest.fn();

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

const mockTrips: { data: TripSummary[]; loading: boolean; error: Error | null } = {
  data: [],
  loading: false,
  error: null,
};

jest.mock('@/features/trips/use-trips', () => ({ useTrips: () => mockTrips }));

function summary(id: string, overrides: Partial<TripSummary> = {}): TripSummary {
  return {
    trip: {
      id,
      title: `Trip ${id}`,
      home_currency: 'EUR',
      is_public: false,
      cover_photo_id: null,
      status: 'planning',
      created_at: 'x',
      updated_at: 'x',
      deleted_at: null,
      is_dirty: false,
      synced_at: 'x',
    },
    stopCount: 2,
    status: 'planning',
    cover: { kind: 'typographic', initial: 'T', status: 'planning' },
    dateRange: { start: '2026-03-12', end: '2026-03-20' },
    ...overrides,
  };
}

const hidden = { includeHiddenElements: true };
const INSETS = { top: 47, bottom: 34, left: 0, right: 0 };

/** Draws the screen as the given platform sees it, inside the safe-area provider. */
async function renderOn(os: 'ios' | 'android', insets = INSETS) {
  const platform = jest.replaceProperty(Platform, 'OS', os);
  await render(
    <SafeAreaInsetsContext.Provider value={insets}>
      <TripsScreen />
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
  mockPush.mockReset();
  mockStackScreen.mockClear();
});

describe('<TripsScreen> - the screen and its states (FR-021, FR-035)', () => {
  test('keeps the ids the flows look for, and lays out no title of its own (the header is the title)', async () => {
    mockTrips.data = [summary('a')];
    platform = await renderOn('ios');

    expect(screen.getByTestId('trips-screen')).toBeTruthy();
    expect(screen.getByTestId('trips-list')).toBeTruthy();
    expect(screen.queryByText('Trips')).toBeNull();
  });

  test('loading is skeleton cards, announced as ONE busy region, never the empty state', async () => {
    mockTrips.loading = true;
    platform = await renderOn('ios');

    const region = screen.getByLabelText('Loading trips');
    expect(region.props.accessibilityRole).toBe('progressbar');
    expect(screen.getAllByLabelText('Loading trips')).toHaveLength(1);
    expect(screen.queryByText('No trips yet')).toBeNull();
    expect(screen.queryByTestId('trips-list')).toBeNull();
    expect(screen.getByTestId('trips-screen')).toBeTruthy();
  });

  test('an error says what happened in words and shows no list', async () => {
    mockTrips.error = new Error('database is locked');
    mockTrips.data = [summary('stale')];
    platform = await renderOn('ios');

    expect(screen.getByText('Couldn’t read your trips')).toBeTruthy();
    expect(
      screen.getByText(
        'The local store did not answer. Restarting the app usually clears this.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('database is locked')).toBeNull();
    expect(screen.queryByTestId('trip-card-stale')).toBeNull();
    expect(screen.queryByText('No trips yet')).toBeNull();
  });

  test('empty names the next step: the same words and a "Plan a trip" action of its own', async () => {
    platform = await renderOn('ios');

    expect(screen.getByText('No trips yet')).toBeTruthy();
    expect(
      screen.getByText('Every trip you plan or take will be listed here.'),
    ).toBeTruthy();
    const action = screen.getByTestId('trips-empty-plan-trip');
    expect(action.props.accessibilityLabel).toBe('Plan a trip');

    await fireEvent.press(action);
    expect(mockPush).toHaveBeenCalledWith('/modal/add-trip');
  });

  test('populated lists a card per trip, each opening its trip', async () => {
    mockTrips.data = [summary('a'), summary('b')];
    platform = await renderOn('ios');

    expect(
      within(screen.getByTestId('trips-list')).getByTestId('trip-card-a'),
    ).toBeTruthy();
    expect(screen.getByTestId('trip-card-b')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('trip-card-b'));
    expect(mockPush).toHaveBeenCalledWith('/trip/b');
  });

  test('the list is the scroller and takes the content inset the native header needs (props asserted; the collapse itself is a device check, T408)', async () => {
    mockTrips.data = [summary('a')];
    platform = await renderOn('ios');

    const list = screen.getByTestId('trips-list');
    expect(list.type).toBe('RCTScrollView');
    expect(list.props.contentInsetAdjustmentBehavior).toBe('automatic');
  });

  test('a tab screen pads no bottom safe area: the tab bar above the home indicator has it', async () => {
    mockTrips.data = [summary('a')];
    platform = await renderOn('ios');

    const content = screen.getByTestId('trips-list').props.contentContainerStyle as {
      paddingTop: number;
      paddingBottom: number;
    };
    expect(content.paddingBottom).toBe(Spacing.four);
    expect(content.paddingTop).toBe(Spacing.four);
  });
});

describe('<TripsScreen> - Plan a trip on iOS: a header action', () => {
  test('is the one "Plan a trip" control, in the header, with the id and name it always had', async () => {
    mockTrips.data = [summary('a')];
    platform = await renderOn('ios');

    const plan = screen.getAllByTestId('trips-plan-trip', hidden);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.props.accessibilityLabel).toBe('Plan a trip');
    expect(plan[0]?.props.accessibilityRole).toBe('button');

    const options = mockStackScreen.mock.calls.at(-1)?.[0].options;
    expect(typeof options.headerRight).toBe('function');
  });

  test('opens the add-trip sheet, and is reachable in every state', async () => {
    platform = await renderOn('ios');
    await fireEvent.press(screen.getByTestId('trips-plan-trip'));
    expect(mockPush).toHaveBeenCalledWith('/modal/add-trip');
  });

  test('is an icon-only text button named "Plan a trip": no words in the header to clip or widen it', async () => {
    mockTrips.data = [summary('a')];
    platform = await renderOn('ios');
    const plan = screen.getByTestId('trips-plan-trip');

    expect(plan.props.variant).toBe('ghost');
    expect(plan.props.isIconOnly).toBe(true);
    expect(plan.props.accessibilityLabel).toBe('Plan a trip');
    expect(within(plan).queryByText('Plan a trip')).toBeNull();
    // The glyph is decorative: the name is the button's own.
    expect(within(plan).getByTestId('trips-plan-trip-icon', hidden)).toBeTruthy();
  });

  test('is a square of the 44 pt floor whatever the text size (a header is a fixed-height bar)', async () => {
    platform = await renderOn('ios');
    // The jest window reports a font scale of 2, as a large Dynamic Type setting would.
    expect(Dimensions.get('window').fontScale).toBeGreaterThan(1);

    const style = Object.assign(
      {},
      ...[screen.getByTestId('trips-plan-trip').props.style]
        .flat(Infinity)
        .filter(Boolean),
    );
    expect(MinTouchTarget).toBe(44);
    expect(style.width).toBe(MinTouchTarget);
    expect(style.height).toBe(MinTouchTarget);
    expect(style.minHeight).toBeUndefined();
  });

  test('in the empty state the words are the empty state action, not drawn twice', async () => {
    platform = await renderOn('ios');
    expect(screen.getAllByText('Plan a trip')).toHaveLength(1);
    expect(screen.getByTestId('trips-empty-plan-trip')).toBeTruthy();
  });

  test('draws no floating button', async () => {
    mockTrips.data = [summary('a')];
    platform = await renderOn('ios');
    expect(screen.queryByTestId('trips-fab-clearance', hidden)).toBeNull();
    expect(screen.queryByTestId('trips-plan-fab', hidden)).toBeNull();
  });
});

describe('<TripsScreen> - Plan a trip on Android: an extended floating button', () => {
  test('is the one "Plan a trip" control, the one primary, with the same id and name', async () => {
    mockTrips.data = [summary('a')];
    platform = await renderOn('android');

    const plan = screen.getAllByTestId('trips-plan-trip', hidden);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.props.accessibilityLabel).toBe('Plan a trip');
    expect(plan[0]?.props.variant).toBe('primary');
    expect(within(plan[0] as never).getByText('Plan a trip')).toBeTruthy();

    // The header is the navigator's own: no action in it.
    const options = mockStackScreen.mock.calls.at(-1)?.[0]?.options;
    expect(options?.headerRight).toBeUndefined();
  });

  test('opens the add-trip sheet', async () => {
    platform = await renderOn('android');
    await fireEvent.press(screen.getByTestId('trips-plan-trip'));
    expect(mockPush).toHaveBeenCalledWith('/modal/add-trip');
  });

  test('floats at the bottom end of the screen, above the list', async () => {
    platform = await renderOn('android');
    const fab = screen.getByTestId('trips-plan-trip');
    const style = Object.assign({}, ...[fab.props.style].flat(Infinity).filter(Boolean));
    expect(String(fab.props.className)).toContain('absolute');
    expect(style.bottom).toBe(Spacing.three);
    expect(style.end).toBe(Spacing.three);
  });

  test('keeps clear of the side insets (a notch in landscape)', async () => {
    platform = await renderOn('android', { ...INSETS, left: 0, right: 48 });
    const fab = screen.getByTestId('trips-plan-trip');
    const style = Object.assign({}, ...[fab.props.style].flat(Infinity).filter(Boolean));
    expect(style.end).toBe(Spacing.three + 48);
  });

  test('the list leaves room under its last card for the button', async () => {
    mockTrips.data = [summary('a')];
    platform = await renderOn('android');

    const room = screen.getByTestId('trips-fab-clearance', hidden);
    const style = Object.assign({}, ...[room.props.style].flat(Infinity).filter(Boolean));
    // The button's minimum height (56 at the default text size) and a margin each side.
    expect(style.height).toBeGreaterThanOrEqual(56 + 2 * Spacing.three);
    // It is part of the list, so it scrolls: the last card can be brought above the button.
    expect(
      within(screen.getByTestId('trips-list')).getByTestId('trips-fab-clearance', hidden),
    ).toBeTruthy();
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

describe('<TripsScreen> - sources (FR-036)', () => {
  const FILES = ['app/(tabs)/trips/index.tsx', 'components/trip/plan-trip-action.tsx'];
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
