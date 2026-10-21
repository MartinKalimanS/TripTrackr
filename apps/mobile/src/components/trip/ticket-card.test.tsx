/**
 * T540 - `TicketCard` (contract C5-19; FR-030, FR-032, FR-033, FR-074, FR-075, FR-076): the next
 * planned trip as a ticket. A thumbnail, the "Planning" chip, the title, the country and month,
 * and a STUB counting the days to departure behind a dashed `sand` edge with two notches. At
 * a font scale of 1.15 and above it stacks: the thumbnail on top, the text, the stub as a row
 * under a dashed top edge, the notches gone.
 *
 * ONE control, named as every trip card is ("title, status, N stops", FR-075); the countdown is
 * its value so a screen reader hears it without the name changing.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { Palettes } from '@/theme';

import { classesOf } from '../../../test/helpers/host-nodes';
import { asCss, mockThemeColors } from '../../../test/helpers/theme-colors';
import { touchDown } from '../../../test/helpers/touch';
import { cardModel, withPhoto } from '../../../test/helpers/trip-card-fixture';
import { TicketCard } from './ticket-card';

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

const iceland = cardModel({
  id: 't1',
  title: 'Iceland Ring Road',
  status: 'planning',
  stopCount: 2,
  country: { iso2: 'IS', name: 'Iceland' },
  dateRange: { start: '2027-01-16', end: '2027-01-24' },
  lengthDays: 9,
  dayOf: null,
  daysToGo: 94,
  strip: ['next', 'later'],
  stripLabels: ['REY', 'VIK'],
});

async function renderTicket(trip = iceland) {
  const onPress = jest.fn();
  await render(<TicketCard trip={trip} onPress={onPress} />);
  return onPress;
}

describe('<TicketCard> is ONE control, named as every trip card is (FR-030, FR-075)', () => {
  test('is a button named "title, status, stops" with the hint and the id of a trip card', async () => {
    const onPress = await renderTicket();

    const card = screen.getByTestId('trip-card-t1');
    expect(card.props.accessibilityRole).toBe('button');
    expect(card.props.accessibilityLabel).toBe('Iceland Ring Road, planning, 2 stops');
    expect(card.props.accessibilityHint).toBe('Opens the trip');

    await fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('says the countdown as its value: the name does not change', async () => {
    await renderTicket();
    expect(screen.getByTestId('trip-card-t1').props.accessibilityValue).toEqual({
      text: 'Starts in 94 days',
    });
  });

  test('has no other control inside it, whatever it shows', async () => {
    await renderTicket(cardModel({ ...iceland, pending: true }));
    expect(screen.getAllByRole('button', hidden)).toHaveLength(1);
  });
});

describe('<TicketCard> content (FR-032)', () => {
  test('shows the Planning chip, the title, the country and the month', async () => {
    await renderTicket();

    expect(screen.getByTestId('status-pill-planning')).toBeTruthy();
    expect(screen.getByText('Planning')).toBeTruthy();
    expect(screen.getByText('Iceland Ring Road')).toBeTruthy();
    expect(screen.getByText('Iceland · Jan 2027')).toBeTruthy();
    expect(screen.getByTestId('trip-card-t1-flag', hidden)).toBeTruthy();
    expect(screen.getByTestId('trip-card-t1-meta-row')).toBeTruthy();
  });

  test('the stub counts the days to departure, with its unit under it', async () => {
    await renderTicket();

    const stub = within(screen.getByTestId('trip-card-t1-stub'));
    expect(stub.getByText('94')).toBeTruthy();
    expect(stub.getByText('days')).toBeTruthy();
  });

  test('a single day to go is "1 day"', async () => {
    await renderTicket(cardModel({ ...iceland, daysToGo: 1 }));
    const stub = within(screen.getByTestId('trip-card-t1-stub'));
    expect(stub.getByText('1')).toBeTruthy();
    expect(stub.getByText('day')).toBeTruthy();
    expect(stub.queryByText('days')).toBeNull();
    expect(screen.getByTestId('trip-card-t1').props.accessibilityValue).toEqual({
      text: 'Starts tomorrow',
    });
  });

  test('a ticket with no countdown has no stub (a trip with no days to go)', async () => {
    await renderTicket(cardModel({ ...iceland, daysToGo: null }));
    expect(screen.queryByTestId('trip-card-t1-stub')).toBeNull();
    expect(
      screen.getByTestId('trip-card-t1').props.accessibilityValue?.text,
    ).toBeUndefined();
  });

  test('the title is two lines at most', async () => {
    await renderTicket(
      cardModel({ ...iceland, title: 'Iceland Ring Road and the Westfjords' }),
    );
    expect(
      screen.getByText('Iceland Ring Road and the Westfjords').props.numberOfLines,
    ).toBe(2);
  });

  test('without a country there is no flag, and the line is the month', async () => {
    await renderTicket(cardModel({ ...iceland, country: null }));
    expect(screen.queryByTestId('trip-card-t1-flag', hidden)).toBeNull();
    expect(screen.getByText('Jan 2027')).toBeTruthy();
  });

  test('a waiting trip carries the pending marker in words', async () => {
    await renderTicket(cardModel({ ...iceland, pending: true }));
    expect(screen.getByText('Not yet synced')).toBeTruthy();
  });
});

describe('<TicketCard> the thumbnail (FR-034)', () => {
  test('a trip with no photograph shows the thumb form of the generated cover', async () => {
    await renderTicket();
    expect(screen.queryByTestId('trip-card-t1-photo', hidden)).toBeNull();
    expect(screen.getByTestId('trip-card-t1-generated-glyph', hidden)).toBeTruthy();
    expect(screen.queryByTestId('trip-card-t1-generated-stamp', hidden)).toBeNull();
  });

  test('a trip with a photograph shows its thumbnail', async () => {
    await renderTicket(withPhoto({ ...iceland }));
    expect(screen.getByTestId('trip-card-t1-photo', hidden).props.recyclingKey).toBe(
      'photo-1',
    );
  });
});

describe('<TicketCard> as a row (default text size)', () => {
  test('is a 96 dp minimum card: thumbnail, text, then a stub, 24 dp round with a hairline', async () => {
    await renderTicket();
    const surface = screen.getByTestId('trip-card-t1-surface');

    expect(flat(surface)).toMatchObject({
      flexDirection: 'row',
      minHeight: 96,
      borderRadius: 24,
      overflow: 'hidden',
    });
    expect(classesOf(surface)).toEqual(
      expect.arrayContaining(['bg-surface', 'border', 'border-separator']),
    );
  });

  test('the thumbnail and the stub are 88 dp wide', async () => {
    await renderTicket();
    expect(flat(screen.getByTestId('trip-card-t1-thumb')).width).toBe(88);
    expect(flat(screen.getByTestId('trip-card-t1-stub')).width).toBe(88);
  });

  // Prototype `.stub .v` is `t-title tnum` (28 / 32), not the 36 / 40 numeral.
  test('the stub figure is the 28 / 32 title in tabular figures, over a 13 / 18 unit', async () => {
    await renderTicket();
    const stub = within(screen.getByTestId('trip-card-t1-stub'));
    const figure = stub.getByText('94');
    expect(classesOf(figure)).toEqual(
      expect.arrayContaining(['text-[28px]', 'leading-[32px]']),
    );
    expect(flat(figure).fontVariant).toEqual(['tabular-nums']);
    expect(figure.props.accessibilityRole).toBe('text');
    expect(classesOf(stub.getByText('days'))).toEqual(
      expect.arrayContaining(['text-[13px]', 'text-muted']),
    );
  });

  test('the text block is padded 12, 4 dp apart, the title 2 dp lower, the flag line 6 dp apart', async () => {
    await renderTicket();
    expect(flat(screen.getByText('Iceland Ring Road')).marginTop).toBe(2);
    expect(flat(screen.getByTestId('trip-card-t1-meta-row')).gap).toBe(6);
    const body = screen.getByTestId('trip-card-t1-meta-row').parent!;
    expect(flat(body)).toMatchObject({ padding: 12 });
    expect(classesOf(body)).toEqual(
      expect.arrayContaining(['items-start', 'justify-center', 'gap-1']),
    );
  });

  test('the stub has a 2 dp dashed sand edge and two notches on it', async () => {
    mockThemeColors('light');
    await renderTicket();
    expect(flat(screen.getByTestId('trip-card-t1-stub'))).toMatchObject({
      borderLeftWidth: 2,
      borderStyle: 'dashed',
      borderColor: asCss(Palettes.light.sand),
    });

    for (const id of ['trip-card-t1-notch-top', 'trip-card-t1-notch-bottom']) {
      const notch = screen.getByTestId(id, hidden);
      expect(flat(notch)).toMatchObject({ width: 16, height: 16, borderRadius: 999 });
      // A notch is the canvas showing through the card, with a hairline round it.
      expect(classesOf(notch)).toEqual(
        expect.arrayContaining(['bg-background', 'border', 'border-separator']),
      );
      expect(notch.props.accessibilityElementsHidden).toBe(true);
    }
  });
});

describe('<TicketCard> stacked (a font scale of 1.15 and above, FR-074)', () => {
  beforeEach(() => mockFontScale(1.15));

  test('stacks: a column, the thumbnail 88 dp high across the top', async () => {
    await renderTicket();

    expect(flat(screen.getByTestId('trip-card-t1-surface')).flexDirection).toBe('column');
    const thumb = flat(screen.getByTestId('trip-card-t1-thumb'));
    expect(thumb).toMatchObject({ height: 88 });
    expect(thumb.width).toBeUndefined();
  });

  test('the stub is a row under a dashed top edge, with no notches', async () => {
    mockThemeColors('light');
    await renderTicket();

    expect(flat(screen.getByTestId('trip-card-t1-stub'))).toMatchObject({
      flexDirection: 'row',
      borderTopWidth: 2,
      borderStyle: 'dashed',
      borderColor: asCss(Palettes.light.sand),
    });
    expect(flat(screen.getByTestId('trip-card-t1-stub')).borderLeftWidth).toBeUndefined();
    expect(screen.queryByTestId('trip-card-t1-notch-top', hidden)).toBeNull();
    expect(screen.queryByTestId('trip-card-t1-notch-bottom', hidden)).toBeNull();
  });

  test('the stub row is centred, 8 dp apart, 12 dp in from the sides with 8 dp above and below', async () => {
    await renderTicket();
    expect(flat(screen.getByTestId('trip-card-t1-stub'))).toMatchObject({
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 12,
      paddingVertical: 8,
    });
  });

  test('the title and the line under it may take two lines, and the notches are gone', async () => {
    await renderTicket();
    expect(screen.getByText('Iceland Ring Road').props.numberOfLines).toBe(2);
    expect(screen.getByText('Iceland · Jan 2027').props.numberOfLines).toBe(2);
  });

  test('still says the countdown', async () => {
    await renderTicket();
    expect(within(screen.getByTestId('trip-card-t1-stub')).getByText('94')).toBeTruthy();
  });

  test('stacks at 1.5 and 2 as well, and not just below 1.15', async () => {
    for (const scale of [1.5, 2]) {
      mockFontScale(scale);
      await render(<TicketCard trip={iceland} onPress={jest.fn()} />);
      expect(
        flat(screen.getAllByTestId('trip-card-t1-surface').at(-1)!).flexDirection,
      ).toBe('column');
    }
    mockFontScale(1.14);
    await render(<TicketCard trip={iceland} onPress={jest.fn()} />);
    expect(
      flat(screen.getAllByTestId('trip-card-t1-surface').at(-1)!).flexDirection,
    ).toBe('row');
  });
});

describe('<TicketCard> pressed (FR-019, FR-063)', () => {
  test('takes the pressed fill at once, on its own surface', async () => {
    await renderTicket();
    expect(classesOf(screen.getByTestId('trip-card-t1-surface'))).toContain('bg-surface');

    await touchDown(screen.getByTestId('trip-card-t1'));

    expect(classesOf(screen.getByTestId('trip-card-t1-surface'))).toContain(
      'bg-surface-tertiary',
    );
    expect(classesOf(screen.getByTestId('trip-card-t1-surface'))).not.toContain(
      'bg-surface',
    );
  });
});
