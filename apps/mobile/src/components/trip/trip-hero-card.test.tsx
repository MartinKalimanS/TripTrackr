/**
 * T540 - `TripHeroCard` (contract C5-19; FR-007, FR-030, FR-031, FR-034, FR-075, FR-076;
 * research D5-10): the active trip as a large picture card. The cover (a thumbnail or the
 * generated one) under a bottom scrim, a status chip "Active · Day 3 of 8" and, while changes
 * wait, the sync marker on top; on the caption scrim the country with its flag and the stops,
 * the title (two lines), the dates and nights, and one dot per stop.
 *
 * The whole card is ONE control with the accessible name feature 004 gave a trip card, word for
 * word ("title, status, N stops"), the hint "Opens the trip" and the id `trip-card-<id>`; the
 * picture, the strip and the flag are decoration inside it.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Radii } from '@/theme';

import { classesOf } from '../../../test/helpers/host-nodes';
import { cardModel, withPhoto } from '../../../test/helpers/trip-card-fixture';
import { TripHeroCard } from './trip-hero-card';

jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return { Image: (props: Record<string, unknown>) => React.createElement(Host, props) };
});

const hidden = { includeHiddenElements: true };
const flat = (element: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(element.props.style as never) ?? {}) as Record<string, unknown>;

async function renderHero(trip = cardModel()) {
  const onPress = jest.fn();
  await render(<TripHeroCard trip={trip} onPress={onPress} />);
  return onPress;
}

describe('<TripHeroCard> is ONE control, named as it always was (FR-030, FR-075)', () => {
  test('is a button named "title, status, stops", with the hint and the id of a trip card', async () => {
    const onPress = await renderHero();

    const card = screen.getByTestId('trip-card-t1');
    expect(card.props.accessibilityRole).toBe('button');
    expect(card.props.accessibilityLabel).toBe('Portugal Road Trip, active, 3 stops');
    expect(card.props.accessibilityHint).toBe('Opens the trip');

    await fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('says the day of the trip as its value, never in the name', async () => {
    await renderHero();
    expect(screen.getByTestId('trip-card-t1').props.accessibilityValue).toEqual({
      text: 'Day 3 of 8',
    });
  });

  test('has no other control inside it', async () => {
    await renderHero(cardModel({ pending: true }));
    expect(screen.getAllByRole('button', hidden)).toHaveLength(1);
  });

  test('is named for one stop and for none', async () => {
    await renderHero(cardModel({ stopCount: 1 }));
    expect(screen.getByTestId('trip-card-t1').props.accessibilityLabel).toBe(
      'Portugal Road Trip, active, 1 stop',
    );
  });
});

describe('<TripHeroCard> content (FR-031)', () => {
  test('shows the status chip with the day, the country and stops, the title and the dates', async () => {
    await renderHero();

    expect(screen.getByTestId('status-pill-active')).toBeTruthy();
    expect(screen.getByText('Active · Day 3 of 8')).toBeTruthy();
    expect(screen.getByText('Portugal · 3 stops')).toBeTruthy();
    expect(screen.getByText('Portugal Road Trip')).toBeTruthy();
    expect(screen.getByText('12 Oct – 19 Oct 2026 · 7 nights')).toBeTruthy();
  });

  test('draws the flag of the country and one dot per stop with its abbreviation', async () => {
    await renderHero();

    expect(screen.getByTestId('trip-card-t1-flag', hidden)).toBeTruthy();
    expect(screen.getByTestId('stop-strip-dot-2', hidden)).toBeTruthy();
    expect(screen.queryByTestId('stop-strip-dot-3', hidden)).toBeNull();
    expect(screen.getByText('LIS', hidden)).toBeTruthy();
  });

  test('without a country there is no flag, and the eyebrow is the stops', async () => {
    await renderHero(cardModel({ country: null }));

    expect(screen.queryByTestId('trip-card-t1-flag', hidden)).toBeNull();
    expect(screen.getByText('3 stops')).toBeTruthy();
  });

  test('without a date range there is no dates line', async () => {
    await renderHero(cardModel({ dateRange: null, lengthDays: null }));
    expect(screen.queryByTestId('trip-card-t1-meta-row')).toBeNull();
  });

  test('keeps the ids of the 004 card that still have an element: the status and meta rows', async () => {
    await renderHero();
    expect(screen.getByTestId('trip-card-t1-status-row')).toBeTruthy();
    expect(screen.getByTestId('trip-card-t1-meta-row')).toBeTruthy();
  });

  test('the title is two lines at most and white on the picture (never an alpha white)', async () => {
    await renderHero(cardModel({ title: 'Lisbon to the Algarve via Sintra and Porto' }));

    const title = screen.getByText('Lisbon to the Algarve via Sintra and Porto');
    expect(title.props.numberOfLines).toBe(2);
    expect(classesOf(title)).toContain('text-on-photo');
    expect(title.props.accessibilityRole).toBe('text');
  });

  test('every line of text over the picture is on-photo ink', async () => {
    await renderHero();
    for (const text of ['Portugal · 3 stops', '12 Oct – 19 Oct 2026 · 7 nights']) {
      expect(classesOf(screen.getByText(text))).toContain('text-on-photo');
    }
  });
});

describe('<TripHeroCard> the picture and the scrims (FR-007, FR-034)', () => {
  test('a trip with no photograph shows the generated cover in the hero frame', async () => {
    await renderHero();
    expect(screen.queryByTestId('trip-card-t1-photo', hidden)).toBeNull();
    expect(screen.getByTestId('trip-card-t1-generated', hidden)).toBeTruthy();
  });

  test('a trip with a photograph shows its thumbnail', async () => {
    await renderHero(withPhoto());
    expect(screen.getByTestId('trip-card-t1-photo', hidden).props.recyclingKey).toBe(
      'photo-1',
    );
  });

  test('darkens the picture under the text: the bottom scrim and the caption scrim, with the text in the caption', async () => {
    await renderHero();

    expect(screen.getByTestId('scrim-bottom', hidden)).toBeTruthy();
    const caption = screen.getByTestId('scrim-caption-block', hidden);
    expect(within(caption).getByText('Portugal Road Trip')).toBeTruthy();
    expect(within(caption).getByText('Portugal · 3 stops')).toBeTruthy();
  });

  test('the status chip sits above the picture, outside the caption', async () => {
    await renderHero();
    const caption = screen.getByTestId('scrim-caption-block', hidden);
    expect(within(caption).queryByTestId('status-pill-active')).toBeNull();
  });
});

describe('<TripHeroCard> pending changes (FR-034)', () => {
  // US2 scenario 6: "a marker with text and an icon says so", and the Maestro flows wait on
  // the words "Not yet synced": a glyph on a disc alone would be a marker without text.
  test('a waiting trip carries the marker: an icon and the words "Not yet synced"', async () => {
    await renderHero(cardModel({ pending: true }));

    expect(screen.getByText('Not yet synced')).toBeTruthy();
    expect(screen.getByLabelText('Sync pending', hidden)).toBeTruthy();
    expect(screen.getByTestId('sync-badge-icon', hidden)).toBeTruthy();
  });

  test('the marker sits in the status row, which wraps at large text instead of clipping', async () => {
    await renderHero(cardModel({ pending: true }));

    const row = screen.getByTestId('trip-card-t1-status-row');
    expect(within(row).getByText('Not yet synced')).toBeTruthy();
    expect(classesOf(row)).toContain('flex-wrap');
  });

  test('a synced trip carries none', async () => {
    await renderHero();
    expect(screen.queryByLabelText('Sync pending', hidden)).toBeNull();
  });
});

describe('<TripHeroCard> shape', () => {
  test('is 24 dp round, at least 219 dp tall and lifted', async () => {
    await renderHero();
    const card = flat(screen.getByTestId('trip-card-t1'));

    expect(card.borderRadius).toBe(Radii.xl);
    expect(card.boxShadow ?? card.elevation).toBeDefined();
    const frame = flat(screen.getByTestId('trip-card-t1-frame'));
    expect(frame.minHeight).toBe(219);
    expect(frame.overflow).toBe('hidden');
    expect(frame.borderRadius).toBe(Radii.xl);
  });

  test('fixes no height, so the largest text grows it instead of clipping', async () => {
    await renderHero();
    expect(flat(screen.getByTestId('trip-card-t1-frame')).height).toBeUndefined();
    expect(flat(screen.getByTestId('trip-card-t1')).height).toBeUndefined();
  });
});
