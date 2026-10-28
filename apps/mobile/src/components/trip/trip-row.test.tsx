/**
 * T540 - `TripRow` (contract C5-19; FR-030, FR-033, FR-034, FR-070, FR-074, FR-075): the compact
 * row of every trip that is not the hero or the ticket. A 64 dp thumbnail (56 at large text), the
 * title on one line (two at large text), the flag, country, month and length, a trailing chevron
 * cue and, while changes wait, the marker in words. A trip that is not over says so with its
 * status chip (a planned or an active trip in a list of years must not read as past); a past one
 * says it in its name.
 *
 * ONE control, named as every trip card is: "title, status, N stops" (FR-075).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as HeroUI from 'heroui-native';
import { Dimensions, StyleSheet } from 'react-native';

import { Radii } from '@/theme';

import { classesOf } from '../../../test/helpers/host-nodes';
import { touchDown } from '../../../test/helpers/touch';
import { cardModel, withPhoto } from '../../../test/helpers/trip-card-fixture';
import { TripRow } from './trip-row';

jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return { Image: (props: Record<string, unknown>) => React.createElement(Host, props) };
});

const hidden = { includeHiddenElements: true };
const flat = (element: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(element.props.style as never) ?? {}) as Record<string, unknown>;

function mockFontScale(fontScale: number) {
  jest
    .spyOn(Dimensions, 'get')
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale });
}

beforeEach(() => mockFontScale(1));
afterEach(() => jest.restoreAllMocks());

const tokyo = cardModel({
  id: 't1',
  title: 'Tokyo & Kyoto',
  status: 'past',
  stopCount: 4,
  country: { iso2: 'JP', name: 'Japan' },
  dateRange: { start: '2026-03-02', end: '2026-03-10' },
  lengthDays: 9,
  dayOf: null,
  strip: ['done', 'done', 'done', 'done'],
  stripLabels: ['TOK', 'KYO', 'OSA', 'NAR'],
});

async function renderRow(trip = tokyo) {
  const onPress = jest.fn();
  await render(<TripRow trip={trip} onPress={onPress} />);
  return onPress;
}

describe('<TripRow> is ONE control, named as every trip card is (FR-030, FR-075)', () => {
  test('is a button named "title, status, stops" with the hint and the id of a trip card', async () => {
    const onPress = await renderRow();

    const row = screen.getByTestId('trip-card-t1');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe('Tokyo & Kyoto, past, 4 stops');
    expect(row.props.accessibilityHint).toBe('Opens the trip');

    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('is named for a trip with no stops', async () => {
    await renderRow(
      cardModel({
        ...tokyo,
        status: 'planning',
        stopCount: 0,
        dateRange: null,
        lengthDays: null,
        country: null,
        strip: [],
        stripLabels: [],
      }),
    );
    expect(screen.getByTestId('trip-card-t1').props.accessibilityLabel).toBe(
      'Tokyo & Kyoto, planning, No stops yet',
    );
  });

  test('has no other control inside it, and its cue is decoration', async () => {
    await renderRow(cardModel({ ...tokyo, pending: true }));

    expect(screen.getAllByRole('button', hidden)).toHaveLength(1);
    const cue = screen.getByTestId('trip-card-t1-cue', hidden);
    expect(cue.props.accessibilityElementsHidden).toBe(true);
  });
});

describe('<TripRow> content (FR-033)', () => {
  test('says the title, the country, the month and the length, with the flag', async () => {
    await renderRow();

    expect(screen.getByText('Tokyo & Kyoto')).toBeTruthy();
    expect(screen.getByText('Japan · Mar 2026 · 9 days')).toBeTruthy();
    expect(screen.getByTestId('trip-card-t1-flag', hidden)).toBeTruthy();
    expect(screen.getByTestId('trip-card-t1-meta-row')).toBeTruthy();
  });

  test('the title is one line; the meta is one line', async () => {
    await renderRow();
    expect(screen.getByText('Tokyo & Kyoto').props.numberOfLines).toBe(1);
    expect(screen.getByText('Japan · Mar 2026 · 9 days').props.numberOfLines).toBe(1);
    expect(screen.getByText('Tokyo & Kyoto').props.accessibilityRole).toBe('text');
  });

  test('a trip with no stops says so, with no flag', async () => {
    await renderRow(
      cardModel({
        ...tokyo,
        status: 'planning',
        stopCount: 0,
        dateRange: null,
        lengthDays: null,
        country: null,
        strip: [],
        stripLabels: [],
      }),
    );
    expect(screen.getByText('No stops yet')).toBeTruthy();
    expect(screen.queryByTestId('trip-card-t1-flag', hidden)).toBeNull();
  });
});

describe('<TripRow> status and pending marker (FR-034, FR-070)', () => {
  test('a past trip has no chip: it is named past, and sits under its year', async () => {
    await renderRow();
    expect(screen.queryByTestId('status-pill-past')).toBeNull();
  });

  test.each([
    ['planning', 'status-pill-planning', 'Planning'],
    ['active', 'status-pill-active', 'Active'],
  ] as const)('a %s trip says so in a chip', async (status, id, words) => {
    await renderRow(cardModel({ ...tokyo, status, dayOf: null }));
    expect(screen.getByTestId(id)).toBeTruthy();
    expect(screen.getByText(words)).toBeTruthy();
  });

  test('a waiting trip says so in words', async () => {
    await renderRow(cardModel({ ...tokyo, pending: true }));
    expect(screen.getByText('Not yet synced')).toBeTruthy();
  });

  test('a synced trip says nothing', async () => {
    await renderRow();
    expect(screen.queryByText('Not yet synced')).toBeNull();
  });
});

describe('<TripRow> thumbnail (FR-033, FR-034)', () => {
  // Picture `core/trips` and `.trip-row .th`: no edge round the thumbnail (the 004 hairline went).
  test('is 64 dp, 16 dp round and clipped, with no edge round it', async () => {
    await renderRow();
    const thumb = screen.getByTestId('trip-card-t1-thumb');

    expect(flat(thumb)).toMatchObject({
      width: 64,
      height: 64,
      borderRadius: Radii.lg,
      overflow: 'hidden',
    });
    expect(classesOf(thumb)).not.toContain('border');
  });

  test('a trip with no photograph shows the thumb form of the generated cover', async () => {
    await renderRow();
    expect(screen.getByTestId('trip-card-t1-generated-glyph', hidden)).toBeTruthy();
    expect(screen.queryByTestId('trip-card-t1-generated-stamp', hidden)).toBeNull();
  });

  test('a trip with a photograph shows its thumbnail, recycled by photo id', async () => {
    await renderRow(withPhoto({ ...tokyo }));
    expect(screen.getByTestId('trip-card-t1-photo', hidden).props.recyclingKey).toBe(
      'photo-1',
    );
  });
});

describe('<TripRow> at large text (FR-074)', () => {
  beforeEach(() => mockFontScale(1.15));

  test('the thumbnail is 56 dp and the title and meta may take two lines', async () => {
    await renderRow();

    expect(flat(screen.getByTestId('trip-card-t1-thumb'))).toMatchObject({
      width: 56,
      height: 56,
    });
    expect(screen.getByText('Tokyo & Kyoto').props.numberOfLines).toBe(2);
    expect(screen.getByText('Japan · Mar 2026 · 9 days').props.numberOfLines).toBe(2);
  });

  test('fixes no height: the row is a minimum of 72 dp and grows', async () => {
    await renderRow();
    const row = flat(screen.getByTestId('trip-card-t1'));
    expect(row.minHeight).toBeGreaterThanOrEqual(72);
    expect(row.height).toBeUndefined();
  });
});

describe('<TripRow> as the picture draws it (core/trips, .trip-row)', () => {
  test('is a row 16 dp apart: thumbnail, text, chevron, with the flag line 6 dp apart', async () => {
    await renderRow();
    expect(flat(screen.getByTestId('trip-card-t1-meta-row')).gap).toBe(6);
    expect(classesOf(screen.getByTestId('trip-card-t1-thumb').parent!)).toEqual(
      expect.arrayContaining(['flex-row', 'items-center', 'gap-4']),
    );
  });

  test('the chevron is the 20 dp subtle ink (ink-3), not the muted one', async () => {
    const spy = jest.spyOn(HeroUI, 'useThemeColor');
    await renderRow();
    expect(spy).toHaveBeenCalledWith('subtle');
    expect(screen.getByTestId('trip-card-t1-cue', hidden)).toBeTruthy();
  });

  test('at text scale 1.5 and 2 the thumbnail is 56 and the lines take two', async () => {
    for (const scale of [1.5, 2]) {
      mockFontScale(scale);
      await render(<TripRow trip={tokyo} onPress={jest.fn()} />);
      expect(flat(screen.getAllByTestId('trip-card-t1-thumb').at(-1)!)).toMatchObject({
        width: 56,
        height: 56,
      });
    }
  });
});

describe('<TripRow> pressed (FR-019, FR-063)', () => {
  test('is at least 72 dp tall and takes the pressed fill at once', async () => {
    await renderRow();
    expect(flat(screen.getByTestId('trip-card-t1')).minHeight).toBeGreaterThanOrEqual(72);

    await touchDown(screen.getByTestId('trip-card-t1'));
    expect(flat(screen.getByTestId('trip-card-t1')).backgroundColor).toBeDefined();
  });
});
