/**
 * F13 (T557, T558 for the landing) - the stamps page (feature 005; FR-058, FR-059, FR-060,
 * FR-076, FR-084; UI-SPEC sections 3.9 and 8; research D5-08; Q-2; the pictures `profile.png`
 * and `profile-dark.png`): "Stamps" and "14 of 195", two columns of 124 dp stamps with the second
 * column 20 dp lower, one announced image per stamp, the landing once per session, the empty page
 * with a ghost stamp, and the long passport baked to bitmaps from 100 stamps.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { passportStamps } from '@/features/passport/stamp-spec';
import type { CountrySummary } from '@/features/passport/country-summary';

import { appearance } from '../../../../test/helpers/appearance';
import { clearRasterCache } from '../raster-stamp';
import { resetLanded } from '../stamp-landing';
import { STAMP_RASTER_FROM, STAMP_SIZE, StampsPage } from '../stamps-page';

jest.mock('@/hooks/use-appearance');
jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return { Image: (props: Record<string, unknown>) => React.createElement(Host, props) };
});
jest.mock('@/hooks/use-haptics');
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native') as typeof import('react-native');
  class MockKeyframe {
    duration() {
      return this;
    }
  }
  return {
    __esModule: true,
    default: { View },
    Keyframe: MockKeyframe,
    Easing: { out: (easing: unknown) => ({ out: easing }), cubic: 'cubic' },
  };
});

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};
const { captureRef } = jest.requireMock('react-native-view-shot') as {
  captureRef: jest.Mock;
};

beforeEach(() => {
  (
    jest.requireMock('@/hooks/use-haptics') as { useHaptics: jest.Mock }
  ).useHaptics.mockReturnValue({
    stamp: jest.fn(),
    selection: jest.fn(),
  });
  useAppearance.mockReturnValue(appearance({ prefersLessMotion: true }));
  resetLanded();
  clearRasterCache();
  captureRef.mockClear();
});

const hidden = { includeHiddenElements: true };
const TODAY = '2026-10-14';

function summary(iso2: string, name: string, firstVisit: string): CountrySummary {
  return {
    countryId: iso2.charCodeAt(0) * 100 + iso2.charCodeAt(1),
    iso2,
    name,
    continent: 'Europe',
    tripCount: 1,
    firstVisit,
    lastVisit: firstVisit,
    isNow: false,
    planned: false,
    focus: { center: [0, 0], bounds: null },
  };
}

const FOUR = [
  summary('PT', 'Portugal', '2026-10-12'),
  summary('JP', 'Japan', '2026-03-03'),
  summary('MX', 'Mexico', '2025-11-05'),
  summary('ES', 'Spain', '2025-06-01'),
];

const stampsOf = (list: CountrySummary[], period = 'all') =>
  passportStamps(list, period, TODAY);

const page = (list: CountrySummary[], period = 'all') => (
  <StampsPage stamps={stampsOf(list, period)} period={period} />
);

describe('<StampsPage> - the page', () => {
  test('is `stamps-page` with the heading and the count of stamps over the fixed 195', async () => {
    await render(page(FOUR));
    expect(screen.getByTestId('stamps-page')).toBeOnTheScreen();
    expect(screen.getByText('Stamps')).toBeOnTheScreen();
    expect(screen.getByTestId('stamps-count')).toHaveTextContent('4 of 195');
  });

  test('the heading is announced as a heading', async () => {
    await render(page(FOUR));
    expect(screen.getByText('Stamps').props.accessibilityRole).toBe('header');
  });

  test('cream page with a hairline, radius 24, padding 20 16 24, and the notch at the corner', async () => {
    await render(page(FOUR));
    expect(
      StyleSheet.flatten(screen.getByTestId('stamps-page').props.style),
    ).toMatchObject({
      borderRadius: 24,
      borderWidth: 1,
      paddingTop: 20,
      paddingHorizontal: 16,
      paddingBottom: 24,
    });
    const notch = screen.getByTestId('stamps-notch', hidden);
    expect(StyleSheet.flatten(notch.props.style)).toMatchObject({
      right: -14,
      top: -14,
      width: 40,
      height: 40,
    });
    expect(notch.props.accessibilityElementsHidden).toBe(true);
  });
});

describe('<StampsPage> - two columns', () => {
  test('stamps alternate between the columns, newest first, and the second sits 20 lower', async () => {
    await render(page(FOUR));
    const left = screen.getByTestId('stamps-column-0');
    const right = screen.getByTestId('stamps-column-1');
    expect(
      within(left)
        .getAllByRole('image')
        .map((n) => n.props.testID),
    ).toEqual(['stamp-PT', 'stamp-MX']);
    expect(
      within(right)
        .getAllByRole('image')
        .map((n) => n.props.testID),
    ).toEqual(['stamp-JP', 'stamp-ES']);
    expect(StyleSheet.flatten(right.props.style).paddingTop).toBe(20);
    expect(StyleSheet.flatten(left.props.style).paddingTop).toBe(0);
    expect(
      StyleSheet.flatten(screen.getByTestId('stamps-grid').props.style),
    ).toMatchObject({
      flexDirection: 'row',
      columnGap: 8,
    });
    expect(StyleSheet.flatten(left.props.style).rowGap).toBe(4);
  });

  test('stamps are 124 dp', async () => {
    await render(page(FOUR));
    const art = screen.getByTestId('stamp-art-PT', hidden);
    expect(STAMP_SIZE).toBe(124);
    expect(StyleSheet.flatten(art.props.style)).toMatchObject({
      width: 124,
      height: 124,
    });
  });

  test('each stamp is ONE image named for the country and the day, the art hidden', async () => {
    await render(page(FOUR));
    const cell = screen.getByLabelText('Stamp: Portugal, 12 October 2026');
    expect(cell).toBe(screen.getByTestId('stamp-PT'));
    expect(cell.props.accessible).toBe(true);
    expect(within(cell).getByText('Portugal')).toBeOnTheScreen();
    expect(
      screen.getByTestId('stamp-art-PT', hidden).props.accessibilityElementsHidden,
    ).toBe(true);
  });

  test('the same country and day draw the same stamp every time (SC-016)', async () => {
    await render(page(FOUR));
    const first = JSON.stringify(screen.getByTestId('stamp-art-PT', hidden).props.style);
    await render(page(FOUR));
    const again = JSON.stringify(
      screen.getAllByTestId('stamp-art-PT', hidden).at(-1)?.props.style,
    );
    expect(again).toBe(first);
  });
});

describe('<StampsPage> - the landing (T558)', () => {
  test('a stamp earned in the last seven days comes down, once per session', async () => {
    useAppearance.mockReturnValue(appearance({ prefersLessMotion: false }));
    const first = await render(page(FOUR));
    // Portugal (12 Oct) is recent; Japan is not.
    expect(screen.getByTestId('stamp-in-PT').props.entering).toBeDefined();
    expect(screen.getByTestId('stamp-in-JP').props.entering).toBeUndefined();
    await first.unmount();
    await render(page(FOUR));
    expect(screen.getByTestId('stamp-in-PT').props.entering).toBeUndefined();
  });

  test('nothing moves under reduced motion', async () => {
    await render(page(FOUR));
    expect(screen.getByTestId('stamp-in-PT').props.entering).toBeUndefined();
  });
});

describe('<StampsPage> - nothing to stamp', () => {
  test('draws a ghost stamp and says what to do next, with 0 of 195', async () => {
    await render(page([]));
    expect(screen.getByTestId('stamps-empty')).toBeOnTheScreen();
    expect(screen.getByTestId('stamps-empty-ghost', hidden)).toBeTruthy();
    expect(screen.getByText('No stamps yet')).toBeOnTheScreen();
    expect(screen.getByText(/Add a stop to a trip/)).toBeOnTheScreen();
    expect(screen.getByTestId('stamps-count')).toHaveTextContent('0 of 195');
    expect(screen.queryByTestId('stamps-grid')).toBeNull();
  });

  test('a year with no first arrivals says so', async () => {
    await render(page(FOUR, '2024'));
    expect(screen.getByText('No new stamps in 2024')).toBeOnTheScreen();
  });
});

function many(count: number): CountrySummary[] {
  return Array.from({ length: count }, (_, index) => {
    const a = String.fromCharCode(65 + (index % 26));
    const b = String.fromCharCode(65 + Math.floor(index / 26));
    const day = String((index % 27) + 1).padStart(2, '0');
    return summary(`${a}${b}`, `Land ${a}${b}`, `2024-0${(index % 9) + 1}-${day}`);
  });
}

describe('<StampsPage> - a long passport is baked to bitmaps', () => {
  test('below 100 stamps they are vector stamps and nothing is captured', async () => {
    await render(page(many(STAMP_RASTER_FROM - 1)));
    expect(screen.queryByTestId('stamp-art-AA-placeholder', hidden)).toBeNull();
    expect(captureRef).not.toHaveBeenCalled();
    expect(screen.getByTestId('stamp-art-AA', hidden)).toBeTruthy();
  });

  test('from 100 stamps only a few vector stamps are laid out at once, the rest wait as blanks', async () => {
    await render(page(many(120)));
    expect(screen.getAllByTestId(/^stamp-[A-Z]{2}$/)).toHaveLength(120);
    const stages = screen.queryAllByTestId(/^stamp-art-[A-Z]{2}-stage$/, hidden);
    const blanks = screen.queryAllByTestId(/^stamp-art-[A-Z]{2}-placeholder$/, hidden);
    expect(stages).toHaveLength(3);
    expect(blanks).toHaveLength(117);
  });

  test('a captured stamp becomes a picture, tilted, and frees the slot for the next', async () => {
    await render(page(many(120)));
    const [stage] = screen.getAllByTestId(/^stamp-art-[A-Z]{2}-stage$/, hidden);
    await act(async () => {
      fireEvent(stage!.children[0] as never, 'layout', {
        nativeEvent: { layout: { width: 124, height: 124 } },
      });
    });
    expect(captureRef).toHaveBeenCalledTimes(1);
    const pictures = screen.getAllByTestId(/^stamp-art-[A-Z]{2}$/, hidden);
    expect(pictures).toHaveLength(1);
    expect(pictures[0]!.props.source).toEqual({
      uri: 'file:///cache/ReactNative-snapshot-image.png',
    });
    expect(StyleSheet.flatten(pictures[0]!.props.style)).toMatchObject({
      width: 124,
      height: 124,
    });
    let up = pictures[0]!.parent;
    while (up && !StyleSheet.flatten(up.props.style)?.transform) up = up.parent;
    const holder = StyleSheet.flatten(up!.props.style);
    expect(holder.transform).toEqual([
      { rotate: expect.stringMatching(/^-?[0-9]+deg$/) },
    ]);
    expect(holder.mixBlendMode).toBe('multiply');
    // The slot it held goes to the next stamp in line.
    expect(screen.getAllByTestId(/^stamp-art-[A-Z]{2}-stage$/, hidden)).toHaveLength(3);
  });

  test('a capture that fails leaves the vector stamp: a stamp is never missing', async () => {
    captureRef.mockRejectedValueOnce(new Error('findNodeHandle failed to resolve view'));
    await render(page(many(120)));
    const [stage] = screen.getAllByTestId(/^stamp-art-[A-Z]{2}-stage$/, hidden);
    await act(async () => {
      fireEvent(stage!.children[0] as never, 'layout', {
        nativeEvent: { layout: { width: 124, height: 124 } },
      });
    });
    expect(screen.queryAllByTestId(/^stamp-art-[A-Z]{2}$/, hidden)).toHaveLength(0);
    expect(screen.queryAllByTestId(/^stamp-art-[A-Z]{2}-stage$/, hidden)).toHaveLength(4);
    expect(screen.queryAllByTestId(/^stamp-art-[A-Z]{2}-vector$/, hidden)).toHaveLength(
      4,
    );
  });

  test('a baked stamp is kept: the page drawn again takes no second capture for it', async () => {
    const first = await render(page(many(120)));
    const [stage] = screen.getAllByTestId(/^stamp-art-[A-Z]{2}-stage$/, hidden);
    await act(async () => {
      fireEvent(stage!.children[0] as never, 'layout', {
        nativeEvent: { layout: { width: 124, height: 124 } },
      });
    });
    expect(captureRef).toHaveBeenCalledTimes(1);
    await first.unmount();
    await render(page(many(120)));
    expect(screen.getAllByTestId(/^stamp-art-[A-Z]{2}$/, hidden)).toHaveLength(1);
    expect(captureRef).toHaveBeenCalledTimes(1);
  });
});
