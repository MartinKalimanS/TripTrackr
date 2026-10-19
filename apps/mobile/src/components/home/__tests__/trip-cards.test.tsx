/**
 * T535 - the trip cards of the Home sheet (feature 005; FR-014, FR-015, FR-008, FR-034,
 * FR-070, FR-076; contract C5-23): `NowCard` (the live trip: a thumbnail, the title,
 * "Day 3 of 8 . Sintra", a stop strip, a chevron; else the next planned trip), `NextRow` (the
 * next planned trip: a 48 dp thumbnail, a flag, "Jan 2027 . in 94 days") and the peek and
 * half contents that compose them with the figures.
 *
 * Each card is ONE control that opens the trip, with a name that carries the whole of what it
 * shows in words; the thumbnail and the strip are decoration, hidden from assistive
 * technology. A trip with no photograph shows the generated cover, never an empty box.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { HomeTrip } from '@/features/home/home-trips';

import { appearance } from '../../../../test/helpers/appearance';
import { HomeHalf } from '../home-half';
import { HomePeek } from '../home-peek';
import { NextRow } from '../next-row';
import { NowCard } from '../now-card';

jest.mock('@/hooks/use-appearance');
// A View that carries every prop, so a test reads the source and fires `error`.
jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return {
    Image: (props: Record<string, unknown>) => React.createElement(Host, props),
  };
});

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};

beforeEach(() => useAppearance.mockReturnValue(appearance({ prefersLessMotion: true })));

const hidden = { includeHiddenElements: true };
const tokens = (className: unknown) =>
  String(className ?? '')
    .split(/\s+/)
    .filter(Boolean);

const LIVE: HomeTrip = {
  id: 'live',
  title: 'Portugal Road Trip',
  status: 'active',
  cover: { kind: 'photo', photoId: 'p1', thumbnailUri: 'file:///thumb.jpg' },
  dayOf: { day: 3, of: 8 },
  place: 'Sintra',
  strip: ['done', 'done', 'now', 'next', 'later', 'later', 'later', 'later'],
  startsOn: '2026-10-12',
  daysToGo: null,
  iso2: 'PT',
};

const PLANNED: HomeTrip = {
  id: 'soon',
  title: 'Iceland Ring Road',
  status: 'planning',
  cover: { kind: 'typographic', initial: 'I', status: 'planning' },
  dayOf: null,
  place: null,
  strip: ['next', 'later'],
  startsOn: '2027-01-16',
  daysToGo: 94,
  iso2: 'IS',
};

describe('<NowCard> a live trip', () => {
  test('is ONE button that opens the trip, named with everything it shows', async () => {
    const onPress = jest.fn();
    await render(<NowCard trip={LIVE} onPress={onPress} />);
    const card = screen.getByTestId('home-now-card');
    expect(card.props.accessibilityRole).toBe('button');
    expect(card.props.accessibilityLabel).toBe(
      'Portugal Road Trip, active, day 3 of 8, in Sintra',
    );
    expect(card.props.accessibilityHint).toBe('Opens the trip');
    await fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('shows the title and "Day 3 of 8 \u00b7 Sintra"', async () => {
    await render(<NowCard trip={LIVE} onPress={jest.fn()} />);
    expect(screen.getByText('Portugal Road Trip')).toBeOnTheScreen();
    expect(screen.getByText('Day 3 of 8 \u00b7 Sintra')).toBeOnTheScreen();
  });

  test('leaves the place out when there is none, and the day stays', async () => {
    await render(<NowCard trip={{ ...LIVE, place: null }} onPress={jest.fn()} />);
    expect(screen.getByText('Day 3 of 8')).toBeOnTheScreen();
    expect(screen.getByTestId('home-now-card').props.accessibilityLabel).toBe(
      'Portugal Road Trip, active, day 3 of 8',
    );
  });

  test('draws one dot per stop, in the shapes of done, now, next and later', async () => {
    await render(<NowCard trip={LIVE} onPress={jest.fn()} />);
    const dots = screen.getAllByTestId('home-now-card-dot', hidden);
    expect(dots).toHaveLength(8);
    expect(new Set(dots.map((dot) => dot.props.className)).size).toBe(4);
  });

  test('the dots of a done and a later stop differ by shape, not by colour alone', async () => {
    await render(<NowCard trip={LIVE} onPress={jest.fn()} />);
    const [done, , now, , later] = screen.getAllByTestId('home-now-card-dot', hidden);
    const filled = (dot: typeof done) =>
      tokens(dot!.props.className).some((c) => /^bg-/.test(c));
    expect(filled(done)).toBe(true);
    expect(filled(later)).toBe(false);
    expect(tokens(now!.props.className)).toEqual(expect.arrayContaining(['border-2']));
  });

  test('a long trip shows a window of dots and says how many are left out', async () => {
    const strip = [
      ...Array.from({ length: 10 }, () => 'done' as const),
      'now' as const,
      ...Array.from({ length: 19 }, () => 'later' as const),
    ];
    await render(<NowCard trip={{ ...LIVE, strip }} onPress={jest.fn()} />);
    expect(screen.getAllByTestId('home-now-card-dot', hidden)).toHaveLength(12);
    expect(screen.getByText('+18', hidden)).toBeOnTheScreen();
  });

  test('has a thumbnail that is a photo when there is one, hidden from assistive technology', async () => {
    await render(<NowCard trip={LIVE} onPress={jest.fn()} />);
    const image = screen.getByTestId('home-now-card-photo', hidden);
    expect(image.props.source).toEqual({ uri: 'file:///thumb.jpg' });
    expect(image.props.recyclingKey).toBe('p1');
    expect(
      screen.getByTestId('home-now-card-thumb', hidden).props.importantForAccessibility,
    ).toBe('no-hide-descendants');
  });

  test('a trip with no photograph shows the generated cover, and so does a photo that will not draw', async () => {
    await render(
      <NowCard
        trip={{ ...LIVE, cover: { kind: 'typographic', initial: 'P', status: 'active' } }}
        onPress={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('home-now-card-photo', hidden)).toBeNull();
    expect(screen.getByTestId('home-now-card-generated', hidden)).toBeOnTheScreen();

    await screen.rerender(<NowCard trip={LIVE} onPress={jest.fn()} />);
    await fireEvent(screen.getByTestId('home-now-card-photo', hidden), 'error', {
      error: 'bad',
    });
    expect(screen.queryByTestId('home-now-card-photo', hidden)).toBeNull();
    expect(screen.getByTestId('home-now-card-generated', hidden)).toBeOnTheScreen();
  });

  test('the thumbnail is 64 dp, and 56 dp at peek', async () => {
    await render(<NowCard trip={LIVE} onPress={jest.fn()} />);
    expect(
      StyleSheet.flatten(screen.getByTestId('home-now-card-thumb', hidden).props.style),
    ).toMatchObject({
      width: 64,
      height: 64,
    });
    await screen.rerender(<NowCard trip={LIVE} compact onPress={jest.fn()} />);
    expect(
      StyleSheet.flatten(screen.getByTestId('home-now-card-thumb', hidden).props.style),
    ).toMatchObject({
      width: 56,
      height: 56,
    });
  });

  test('the title is two lines, one at peek; nothing is clipped at large text', async () => {
    await render(<NowCard trip={LIVE} onPress={jest.fn()} />);
    expect(screen.getByText('Portugal Road Trip').props.numberOfLines).toBe(2);
    await screen.rerender(<NowCard trip={LIVE} compact onPress={jest.fn()} />);
    expect(screen.getByText('Portugal Road Trip').props.numberOfLines).toBe(1);
  });

  test('carries a chevron as its cue, so it reads as tappable', async () => {
    await render(<NowCard trip={LIVE} onPress={jest.fn()} />);
    expect(screen.getByTestId('home-now-card-cue', hidden)).toBeTruthy();
  });
});

describe('<NowCard> with no live trip: the next planned one', () => {
  test('says the month and the days to go, with no strip', async () => {
    await render(<NowCard trip={PLANNED} onPress={jest.fn()} />);
    expect(screen.getByText('Jan 2027 \u00b7 in 94 days')).toBeOnTheScreen();
    expect(screen.queryByTestId('home-now-card-dot', hidden)).toBeNull();
    expect(screen.getByTestId('home-now-card').props.accessibilityLabel).toBe(
      'Iceland Ring Road, planned, Jan 2027, in 94 days',
    );
  });
});

describe('<NextRow>', () => {
  test('is ONE button named with the month and the countdown, that opens the trip', async () => {
    const onPress = jest.fn();
    await render(<NextRow trip={PLANNED} onPress={onPress} />);
    const row = screen.getByTestId('home-next-row');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe(
      'Iceland Ring Road, planned, Jan 2027, in 94 days',
    );
    expect(row.props.accessibilityHint).toBe('Opens the trip');
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('shows the title and "Jan 2027 \u00b7 in 94 days"', async () => {
    await render(<NextRow trip={PLANNED} onPress={jest.fn()} />);
    expect(screen.getByText('Iceland Ring Road')).toBeOnTheScreen();
    expect(screen.getByText('Jan 2027 \u00b7 in 94 days')).toBeOnTheScreen();
  });

  test('has a 48 dp thumbnail and the flag of the country, which is decoration', async () => {
    await render(<NextRow trip={PLANNED} onPress={jest.fn()} />);
    expect(
      StyleSheet.flatten(screen.getByTestId('home-next-row-thumb', hidden).props.style),
    ).toMatchObject({
      width: 48,
      height: 48,
    });
    expect(screen.getByTestId('home-next-row-flag', hidden)).toBeOnTheScreen();
  });

  test('has no flag when the country is not known', async () => {
    await render(<NextRow trip={{ ...PLANNED, iso2: null }} onPress={jest.fn()} />);
    expect(screen.queryByTestId('home-next-row-flag', hidden)).toBeNull();
  });

  test('a trip with no date still has a title and no empty line', async () => {
    await render(
      <NextRow
        trip={{ ...PLANNED, startsOn: null, daysToGo: null }}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText('Iceland Ring Road')).toBeOnTheScreen();
    expect(screen.getByTestId('home-next-row').props.accessibilityLabel).toBe(
      'Iceland Ring Road, planned',
    );
  });

  test('the title is one line, and wraps at the largest text size', async () => {
    await render(<NextRow trip={PLANNED} onPress={jest.fn()} />);
    expect(screen.getByText('Iceland Ring Road').props.numberOfLines).toBe(1);
    useAppearance.mockReturnValue(appearance({ fontScale: 2, prefersLessMotion: true }));
    await screen.rerender(<NextRow trip={PLANNED} onPress={jest.fn()} />);
    expect(screen.getByText('Iceland Ring Road').props.numberOfLines).toBeUndefined();
  });
});

describe('<HomePeek> the peek content', () => {
  test('is the live trip as a compact card', async () => {
    const onOpenTrip = jest.fn();
    await render(<HomePeek now={LIVE} onOpenTrip={onOpenTrip} />);
    await fireEvent.press(screen.getByTestId('home-now-card'));
    expect(onOpenTrip).toHaveBeenCalledWith('live');
    expect(screen.getByText('Portugal Road Trip').props.numberOfLines).toBe(1);
  });

  test('is the next planned trip when nothing is live', async () => {
    const onOpenTrip = jest.fn();
    await render(<HomePeek now={PLANNED} onOpenTrip={onOpenTrip} />);
    await fireEvent.press(screen.getByTestId('home-now-card'));
    expect(onOpenTrip).toHaveBeenCalledWith('soon');
  });

  test('is nothing when there is no trip to show: the invitation is the screen\u2019s', async () => {
    await render(<HomePeek now={null} onOpenTrip={jest.fn()} />);
    expect(screen.queryByTestId('home-peek')).toBeNull();
  });

  test('leaves room at the end for the floating button', async () => {
    await render(<HomePeek now={LIVE} onOpenTrip={jest.fn()} />);
    const style = StyleSheet.flatten(screen.getByTestId('home-peek').props.style);
    expect(style.paddingEnd).toBeGreaterThanOrEqual(56 + 12);
  });
});

describe('<HomeHalf> the half content', () => {
  const props = {
    totals: { countries: 14, trips: 22, distanceKm: 61480.4 },
    onOpenCountries: jest.fn(),
    onOpenTrips: jest.fn(),
    onOpenTrip: jest.fn(),
  };

  test('is the figures, the live trip and the next planned trip, in that order', async () => {
    await render(<HomeHalf {...props} now={LIVE} next={PLANNED} />);
    expect(screen.getByTestId('globe-stats')).toBeOnTheScreen();
    expect(screen.getByTestId('home-now-card')).toBeOnTheScreen();
    expect(screen.getByTestId('home-next-row')).toBeOnTheScreen();
  });

  test('opens the trip that was pressed, by id', async () => {
    await render(<HomeHalf {...props} now={LIVE} next={PLANNED} />);
    await fireEvent.press(screen.getByTestId('home-now-card'));
    expect(props.onOpenTrip).toHaveBeenLastCalledWith('live');
    await fireEvent.press(screen.getByTestId('home-next-row'));
    expect(props.onOpenTrip).toHaveBeenLastCalledWith('soon');
  });

  test('forwards the figures\u2019 presses', async () => {
    await render(<HomeHalf {...props} now={LIVE} next={null} />);
    await fireEvent.press(screen.getByLabelText('14 of 195 countries'));
    expect(props.onOpenCountries).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByLabelText('22 trips'));
    expect(props.onOpenTrips).toHaveBeenCalledTimes(1);
  });

  test('has only the figures when there is no trip to show', async () => {
    await render(<HomeHalf {...props} now={null} next={null} />);
    expect(screen.getByTestId('globe-stats')).toBeOnTheScreen();
    expect(screen.queryByTestId('home-now-card')).toBeNull();
    expect(screen.queryByTestId('home-next-row')).toBeNull();
  });
});
