/**
 * `HomeSheet` over the REAL `Sheet` (feature 005, T537; contract C5-22 and C5-23; FR-012,
 * FR-014 to FR-017): the three positions fill the persistent sheet; what is shown follows the
 * detent the sheet is going to; the handle is the adjustable control "Countries and trips"; the
 * figures and the list move the sheet through the parent; the content ends above the tab pill.
 * The gestures are the real ones (`react-native-gesture-handler/jestSetup`) and the animations
 * those of `test/mocks/reanimated-live.ts`; how a finger feels on a device is T509's.
 */
import 'react-native-gesture-handler/jestSetup';

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import type { HomeTrip } from '@/features/home/home-trips';
import {
  groupByContinent,
  type CountrySummary,
} from '@/features/passport/country-summary';

import { appearance } from '../../../../test/helpers/appearance';
import { HomeSheet, type HomeSheetProps } from '../home-sheet';

jest.mock('react-native-worklets', () => require('../../../../test/mocks/worklets'));
jest.mock('react-native-reanimated', () =>
  require('../../../../test/mocks/reanimated-live'),
);
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) =>
    (require('react') as typeof import('react')).useEffect(effect, [effect]),
}));
jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return { Image: (props: Record<string, unknown>) => React.createElement(Host, props) };
});
jest.mock('@/hooks/use-appearance');
jest.mock('@/hooks/use-haptics');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};
const { useHaptics } = jest.requireMock('@/hooks/use-haptics') as {
  useHaptics: jest.Mock;
};
const live = (
  jest.requireMock('react-native-reanimated') as { __live: { finish: () => void } }
).__live;

beforeEach(() => {
  useAppearance.mockReturnValue(appearance({ prefersLessMotion: true }));
  useHaptics.mockReturnValue({ sheetSnap: jest.fn() });
});

const HEIGHTS = { peek: 212, half: 439, full: 780 } as const;
const TAB_ZONE = 88;

const PORTUGAL: CountrySummary = {
  countryId: 351,
  iso2: 'PT',
  name: 'Portugal',
  continent: 'Europe',
  tripCount: 1,
  firstVisit: '2026-10-12',
  lastVisit: '2026-10-19',
  isNow: true,
  planned: false,
  focus: { center: [-8, 39.5], bounds: null },
};

const NOW: HomeTrip = {
  id: 'live',
  title: 'Portugal Road Trip',
  status: 'active',
  cover: { kind: 'typographic', initial: 'P', status: 'active' },
  dayOf: { day: 3, of: 8 },
  place: 'Sintra',
  strip: ['now'],
  startsOn: '2026-10-12',
  daysToGo: null,
  iso2: 'PT',
};

const NEXT: HomeTrip = {
  ...NOW,
  id: 'soon',
  title: 'Iceland Ring Road',
  status: 'planning',
  dayOf: null,
  place: null,
  daysToGo: 94,
  startsOn: '2027-01-16',
};

const OVERVIEW = {
  summaries: [PORTUGAL],
  groups: groupByContinent([PORTUGAL]),
  totals: {
    countries: 1,
    countriesOf: 195 as const,
    trips: 1,
    distanceKm: 231,
    continents: 1,
    continentsOf: 7 as const,
  },
};

function props(overrides: Partial<HomeSheetProps> = {}): HomeSheetProps {
  return {
    detents: HEIGHTS,
    detent: 'half',
    onDetentChange: jest.fn(),
    onSettle: jest.fn(),
    tabZone: TAB_ZONE,
    overview: OVERVIEW,
    now: NOW,
    next: NEXT,
    onOpenTrip: jest.fn(),
    onOpenTrips: jest.fn(),
    onSelectCountry: jest.fn(),
    ...overrides,
  };
}

async function settle() {
  await act(async () => {
    live.finish();
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
  });
}

describe('<HomeSheet> three positions (FR-012, FR-014, FR-015, FR-016)', () => {
  test('half: the figures, the live trip and the next planned trip', async () => {
    await render(<HomeSheet {...props()} />);
    expect(screen.getByTestId('home-half')).toBeTruthy();
    expect(screen.getByTestId('globe-stats')).toBeTruthy();
    expect(screen.getByTestId('home-now-card')).toBeTruthy();
    expect(screen.getByTestId('home-next-row')).toBeTruthy();
  });

  test('peek: only the live trip', async () => {
    await render(<HomeSheet {...props({ detent: 'peek' })} />);
    expect(screen.getByTestId('home-peek')).toBeTruthy();
    expect(screen.getByTestId('home-now-card')).toBeTruthy();
    expect(screen.queryByTestId('home-next-row')).toBeNull();
    expect(screen.queryByTestId('globe-stats')).toBeNull();
  });

  test('peek with no trip to show is the handle alone', async () => {
    await render(<HomeSheet {...props({ detent: 'peek', now: null, next: null })} />);
    expect(screen.queryByTestId('home-peek')).toBeNull();
    expect(screen.getByTestId('home-sheet-handle')).toBeTruthy();
  });

  test('full: the Countries list, which scrolls once the sheet has come to rest there', async () => {
    const view = await render(<HomeSheet {...props()} />);
    await view.rerender(<HomeSheet {...props({ detent: 'full' })} />);
    expect(screen.getByTestId('countries-list')).toBeTruthy();
    expect(screen.queryByTestId('home-half')).toBeNull();
  });

  test('peek and half end above the tab pill; nothing sits behind it (FR-024)', async () => {
    await render(<HomeSheet {...props()} />);
    const content = screen.getByTestId('home-half').parent!;
    expect(StyleSheet.flatten(content.props.style).paddingBottom).toBe(TAB_ZONE + 16);
  });
});

describe('<HomeSheet> the content as pictured (prototype .sheet-body)', () => {
  test('is padded 20 dp at the sides, 16 dp apart, 4 dp under the grab zone and ends above the pill', async () => {
    await render(<HomeSheet {...props()} />);
    const content = screen.getByTestId('home-half').parent!;
    expect(StyleSheet.flatten(content.props.style)).toMatchObject({
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: TAB_ZONE + 16,
      gap: 16,
    });
  });

  test('the banner slot is the first thing in the half sheet, above the figures', async () => {
    await render(
      <HomeSheet {...props({ banner: <Text testID="slot-banner">Offline</Text> })} />,
    );
    const banner = screen.getByTestId('slot-banner');
    const half = screen.getByTestId('home-half');
    expect(banner.parent).toBe(half.parent);
    expect(banner.parent!.children.indexOf(banner as never)).toBeLessThan(
      banner.parent!.children.indexOf(half as never),
    );
  });

  test('the banner is not in the peek or the full sheet (the header carries it at peek)', async () => {
    const banner = <Text testID="slot-banner">Offline</Text>;
    const view = await render(<HomeSheet {...props({ banner, detent: 'peek' })} />);
    expect(screen.queryByTestId('slot-banner')).toBeNull();
    await view.rerender(<HomeSheet {...props({ banner, detent: 'full' })} />);
    expect(screen.queryByTestId('slot-banner')).toBeNull();
  });
});

describe('<HomeSheet> the handle and the parent (FR-017)', () => {
  test('the handle is the one adjustable control "Countries and trips", valued by the detent', async () => {
    const view = await render(<HomeSheet {...props()} />);
    const handle = screen.getByTestId('home-sheet-handle');
    expect(handle.props.accessibilityRole).toBe('adjustable');
    expect(handle.props.accessibilityLabel).toBe('Countries and trips');
    expect(handle.props.accessibilityValue).toMatchObject({ text: 'Half' });
    await view.rerender(<HomeSheet {...props({ detent: 'peek' })} />);
    expect(
      screen.getByTestId('home-sheet-handle').props.accessibilityValue,
    ).toMatchObject({
      text: 'Peek',
    });
  });

  test('at peek the live trip card raises the sheet to half, as its up chevron says', async () => {
    const onDetentChange = jest.fn();
    const onOpenTrip = jest.fn();
    await render(
      <HomeSheet {...props({ detent: 'peek', onDetentChange, onOpenTrip })} />,
    );
    await fireEvent.press(screen.getByTestId('home-now-card'));
    expect(onDetentChange).toHaveBeenCalledWith('half');
    expect(onOpenTrip).not.toHaveBeenCalled();
  });

  test('a tap on the handle reports the next detent for the parent to pass back', async () => {
    const onDetentChange = jest.fn();
    await render(<HomeSheet {...props({ onDetentChange })} />);
    await fireEvent.press(screen.getByTestId('home-sheet-handle'));
    expect(onDetentChange).toHaveBeenCalledWith('full');
  });

  test('the countries figure raises the sheet to the list, and the trips figure leaves it alone', async () => {
    const onDetentChange = jest.fn();
    const onOpenTrips = jest.fn();
    await render(<HomeSheet {...props({ onDetentChange, onOpenTrips })} />);
    await fireEvent.press(screen.getByTestId('globe-stats-trips-tile'));
    expect(onOpenTrips).toHaveBeenCalledTimes(1);
    expect(onDetentChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('globe-stats-countries-tile'));
    expect(onDetentChange).toHaveBeenCalledWith('full');
  });

  test('the collapse control of the list lowers the sheet to half, and a country is only reported', async () => {
    const onDetentChange = jest.fn();
    const onSelectCountry = jest.fn();
    await render(
      <HomeSheet {...props({ detent: 'full', onDetentChange, onSelectCountry })} />,
    );
    await fireEvent.press(screen.getByTestId('country-row-PT'));
    expect(onSelectCountry).toHaveBeenCalledWith(PORTUGAL);
    expect(onDetentChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('countries-collapse'));
    expect(onDetentChange).toHaveBeenCalledWith('half');
  });

  test('reports the settle once, when the sheet has come to rest, not at mount', async () => {
    const onSettle = jest.fn();
    const view = await render(<HomeSheet {...props({ onSettle })} />);
    await settle();
    expect(onSettle).not.toHaveBeenCalled();
    await view.rerender(<HomeSheet {...props({ onSettle, detent: 'full' })} />);
    await settle();
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onSettle).toHaveBeenCalledWith('full');
  });
});
