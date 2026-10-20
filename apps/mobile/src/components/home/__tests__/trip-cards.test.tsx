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
import * as HeroUI from 'heroui-native';
import { StyleSheet } from 'react-native';

import type { HomeTrip } from '@/features/home/home-trips';

import { appearance } from '../../../../test/helpers/appearance';
import { glyphsIn } from '../../../../test/helpers/icons';
import { HomeHalf } from '../home-half';
import { HomePeek } from '../home-peek';
import { NextRow } from '../next-row';
import { NowCard, thumbSize } from '../now-card';
import { DOT } from '../stop-dots';

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

  test('draws one dot per stop, in the three looks of the picture: done, now, ahead', async () => {
    await render(<NowCard trip={LIVE} onPress={jest.fn()} />);
    const dots = screen.getAllByTestId('home-now-card-dot', hidden);
    expect(dots).toHaveLength(8);
    // The picture has no fourth look: the next stop is drawn like the ones after it.
    expect(new Set(dots.map((dot) => dot.props.className)).size).toBe(3);
    expect(dots[3]!.props.className).toBe(dots[4]!.props.className);
  });

  test('the dots are 6 dp: done solid coral, now a surface dot with a 2 dp coral ring, ahead sand with a 1 dp border ring', async () => {
    await render(<NowCard trip={LIVE} onPress={jest.fn()} />);
    const [done, , now, , later] = screen.getAllByTestId('home-now-card-dot', hidden);
    expect(tokens(done!.props.className)).toEqual(
      expect.arrayContaining(['size-1.5', 'rounded-full', 'bg-accent-line']),
    );
    expect(tokens(now!.props.className)).toEqual(
      expect.arrayContaining([
        'size-1.5',
        'border-2',
        'border-accent-line',
        'bg-surface',
      ]),
    );
    expect(tokens(later!.props.className)).toEqual(
      expect.arrayContaining(['size-1.5', 'border', 'border-border', 'bg-sand']),
    );
    expect(DOT.done).not.toContain('border');
  });

  test('the dots sit 4 dp apart', async () => {
    await render(<NowCard trip={LIVE} onPress={jest.fn()} />);
    const strip = screen.getAllByTestId('home-now-card-dot', hidden)[0]!.parent!;
    expect(tokens(strip.props.className)).toEqual(expect.arrayContaining(['gap-1']));
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

  test('the thumbnail is 48 dp from a font scale of 1.15, its corner still 16', async () => {
    useAppearance.mockReturnValue(
      appearance({ fontScale: 1.15, prefersLessMotion: true }),
    );
    await render(<NowCard trip={LIVE} onPress={jest.fn()} />);
    const thumb = () =>
      StyleSheet.flatten(screen.getByTestId('home-now-card-thumb', hidden).props.style);
    expect(thumb()).toMatchObject({ width: 48, height: 48, borderRadius: 16 });
    await screen.rerender(<NowCard trip={LIVE} compact onPress={jest.fn()} />);
    expect(thumb()).toMatchObject({ width: 48, height: 48 });
    expect([
      thumbSize(false, false),
      thumbSize(true, false),
      thumbSize(true, true),
    ]).toEqual([64, 56, 48]);
  });

  test('the corner of the 64 dp thumbnail is 16', async () => {
    await render(<NowCard trip={LIVE} onPress={jest.fn()} />);
    expect(
      StyleSheet.flatten(screen.getByTestId('home-now-card-thumb', hidden).props.style),
    ).toMatchObject({ borderRadius: 16 });
  });

  test('the title is one line with an ellipsis, two lines from a font scale of 1.15', async () => {
    await render(<NowCard trip={LIVE} onPress={jest.fn()} />);
    expect(screen.getByText('Portugal Road Trip').props.numberOfLines).toBe(1);
    expect(screen.getByText('Day 3 of 8 \u00b7 Sintra').props.numberOfLines).toBe(1);
    await screen.rerender(<NowCard trip={LIVE} compact onPress={jest.fn()} />);
    expect(screen.getByText('Portugal Road Trip').props.numberOfLines).toBe(1);
    useAppearance.mockReturnValue(
      appearance({ fontScale: 1.15, prefersLessMotion: true }),
    );
    await screen.rerender(<NowCard trip={LIVE} onPress={jest.fn()} />);
    expect(screen.getByText('Portugal Road Trip').props.numberOfLines).toBe(2);
    expect(screen.getByText('Day 3 of 8 \u00b7 Sintra').props.numberOfLines).toBe(2);
  });

  test('is the cream tile with 24 dp corners, 8 dp padding and a hairline', async () => {
    await render(<NowCard trip={LIVE} onPress={jest.fn()} />);
    expect(
      StyleSheet.flatten(screen.getByTestId('home-now-card').props.style),
    ).toMatchObject({ borderRadius: 24 });
    const surface = screen.getByTestId('home-now-card-surface', hidden);
    expect(tokens(surface.props.className)).toEqual(
      expect.arrayContaining([
        'bg-surface-secondary',
        'border',
        'border-separator',
        'p-2',
      ]),
    );
  });

  test('the live line is the muted label with a coral dot: 8 dp, a 3 dp tint halo', async () => {
    await render(<NowCard trip={LIVE} onPress={jest.fn()} />);
    expect(tokens(screen.getByText('Day 3 of 8 \u00b7 Sintra').props.className)).toEqual(
      expect.arrayContaining(['text-muted']),
    );
    const halo = screen.getByTestId('home-now-card-live-dot', hidden);
    expect(tokens(halo.props.className)).toEqual(
      expect.arrayContaining(['size-3.5', 'rounded-full', 'bg-accent-tint']),
    );
    expect(StyleSheet.flatten(halo.props.style)).toMatchObject({ margin: -3 });
    expect(halo.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  test('a planned trip has no live dot', async () => {
    await render(<NowCard trip={PLANNED} onPress={jest.fn()} />);
    expect(screen.queryByTestId('home-now-card-live-dot', hidden)).toBeNull();
  });

  test('carries a 20 dp chevron in the subtle ink as its cue, 8 dp from the edge', async () => {
    jest
      .spyOn(HeroUI, 'useThemeColor')
      .mockImplementation(((token: string) =>
        token === 'subtle' ? 'red' : 'blue') as never);
    await render(<NowCard trip={LIVE} onPress={jest.fn()} />);
    expect(screen.getByTestId('home-now-card-cue', hidden)).toBeTruthy();
    expect(glyphsIn()).toEqual([
      expect.objectContaining({
        name: 'chevron-right',
        size: 20,
        color: 'red',
      }),
    ]);
    const cue = screen.getByTestId('home-now-card-cue', hidden).parent!;
    expect(StyleSheet.flatten(cue.props.style)).toMatchObject({ marginEnd: 8 });
  });

  test('at peek, with onExpand, the cue points up, 2 dp from the edge, and the press raises the sheet', async () => {
    const onPress = jest.fn();
    const onExpand = jest.fn();
    await render(<NowCard trip={LIVE} compact onPress={onPress} onExpand={onExpand} />);
    expect(glyphsIn()).toEqual([
      expect.objectContaining({ name: 'chevron-up', size: 20 }),
    ]);
    const cue = screen.getByTestId('home-now-card-cue', hidden).parent!;
    expect(StyleSheet.flatten(cue.props.style)).toMatchObject({ marginEnd: 2 });
    const card = screen.getByTestId('home-now-card');
    expect(card.props.accessibilityHint).toBe('Shows more');
    await fireEvent.press(card);
    expect(onExpand).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  test('onExpand is for peek only: the half card still opens the trip with a right chevron', async () => {
    const onPress = jest.fn();
    await render(<NowCard trip={LIVE} onPress={onPress} onExpand={jest.fn()} />);
    expect(glyphsIn()).toEqual([expect.objectContaining({ name: 'chevron-right' })]);
    await fireEvent.press(screen.getByTestId('home-now-card'));
    expect(onPress).toHaveBeenCalledTimes(1);
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

  test('the title and the line are one line, and two lines from a font scale of 1.15', async () => {
    await render(<NextRow trip={PLANNED} onPress={jest.fn()} />);
    expect(screen.getByText('Iceland Ring Road').props.numberOfLines).toBe(1);
    expect(screen.getByText('Jan 2027 \u00b7 in 94 days').props.numberOfLines).toBe(1);
    useAppearance.mockReturnValue(appearance({ fontScale: 2, prefersLessMotion: true }));
    await screen.rerender(<NextRow trip={PLANNED} onPress={jest.fn()} />);
    expect(screen.getByText('Iceland Ring Road').props.numberOfLines).toBe(2);
    expect(screen.getByText('Jan 2027 \u00b7 in 94 days').props.numberOfLines).toBe(2);
    // The 48 dp thumbnail does not shrink further.
    expect(
      StyleSheet.flatten(screen.getByTestId('home-next-row-thumb', hidden).props.style),
    ).toMatchObject({ width: 48, height: 48 });
  });

  test('the thumbnail has 12 dp corners, the row is at least 56 dp and the line is muted', async () => {
    await render(<NextRow trip={PLANNED} onPress={jest.fn()} />);
    expect(
      StyleSheet.flatten(screen.getByTestId('home-next-row-thumb', hidden).props.style),
    ).toMatchObject({ borderRadius: 12 });
    const content = screen.getByTestId('home-next-row-thumb', hidden).parent!;
    expect(tokens(content.props.className)).toEqual(
      expect.arrayContaining(['min-h-14', 'gap-3']),
    );
    expect(
      tokens(screen.getByText('Jan 2027 \u00b7 in 94 days').props.className),
    ).toEqual(expect.arrayContaining(['text-muted']));
  });

  test('the cue is a 20 dp chevron in the subtle ink', async () => {
    jest
      .spyOn(HeroUI, 'useThemeColor')
      .mockImplementation(((token: string) =>
        token === 'subtle' ? 'red' : 'blue') as never);
    await render(<NextRow trip={PLANNED} onPress={jest.fn()} />);
    const chevron = glyphsIn().find((glyph) => glyph.name === 'chevron-right');
    expect(chevron).toMatchObject({ size: 20, color: 'red' });
    expect(screen.getByTestId('home-next-row-cue', hidden)).toBeTruthy();
  });

  test('draws no section label above it: the pictures have none', async () => {
    await render(<NextRow trip={PLANNED} onPress={jest.fn()} />);
    expect(screen.queryByText(/up next/i)).toBeNull();
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

  test('raises the sheet from the card when it is given onExpand, as pictured', async () => {
    const onOpenTrip = jest.fn();
    const onExpand = jest.fn();
    await render(<HomePeek now={LIVE} onOpenTrip={onOpenTrip} onExpand={onExpand} />);
    await fireEvent.press(screen.getByTestId('home-now-card'));
    expect(onExpand).toHaveBeenCalledTimes(1);
    expect(onOpenTrip).not.toHaveBeenCalled();
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

  test('is 16 dp between the figures, the card and the row, with no label above the row', async () => {
    await render(<HomeHalf {...props} now={LIVE} next={PLANNED} />);
    expect(tokens(screen.getByTestId('home-half').props.className)).toContain('gap-4');
    expect(screen.queryByText(/up next|happening now/i)).toBeNull();
  });

  test('has only the figures when there is no trip to show', async () => {
    await render(<HomeHalf {...props} now={null} next={null} />);
    expect(screen.getByTestId('globe-stats')).toBeOnTheScreen();
    expect(screen.queryByTestId('home-now-card')).toBeNull();
    expect(screen.queryByTestId('home-next-row')).toBeNull();
  });
});
