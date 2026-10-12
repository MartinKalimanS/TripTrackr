/**
 * T544 - `DayChips` and `PinnedStrip` (contract C5-20; spec FR-040, FR-070, FR-071, FR-074;
 * research D5-12): the strip of days under the areas. "All" first, then D1, D2, ... with their
 * dates; choosing one reports it; the chosen chip is filled and a radio that says it is
 * checked; the strip is not drawn at all for a trip with no stops. `PinnedStrip` is how the
 * one strip scrolls with the content and then stays under the collapsed bar.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import * as HeroUI from 'heroui-native';
import { StyleSheet } from 'react-native';

import { DayChips } from '@/components/trip/day-chips';
import { PinnedStrip } from '@/components/trip/pinned-strip';
import { tripDays } from '@/features/trips/trip-days';

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => require('../mocks/reanimated-full'));

const days = tripDays(
  [
    { id: 'lisbon', arrive_date: '2026-10-12', depart_date: '2026-10-14' },
    { id: 'sintra', arrive_date: '2026-10-14', depart_date: '2026-10-15' },
  ],
  '2026-10-14',
);

function chips(props: Partial<React.ComponentProps<typeof DayChips>> = {}) {
  return <DayChips days={days} selected={null} onSelect={jest.fn()} {...props} />;
}

afterEach(() => jest.restoreAllMocks());

describe('<DayChips>', () => {
  test('is `trip-days`, a radio group, with "All" first and one chip per day', async () => {
    await render(chips());
    const group = screen.getByTestId('trip-days');
    expect(group.props.accessibilityRole).toBe('radiogroup');
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(1 + days.length);
    expect(radios[0]?.props.testID).toBe('trip-day-all');
    expect(radios.slice(1).map((radio) => radio.props.testID)).toEqual([
      'trip-day-1',
      'trip-day-2',
      'trip-day-3',
      'trip-day-4',
    ]);
  });

  test('a chip says "D3" and "14 Oct" and is named "Day 3, 14 October"', async () => {
    await render(chips());
    const chip = screen.getByTestId('trip-day-3');
    expect(within(chip).getByText('D3')).toBeTruthy();
    expect(within(chip).getByText('14 Oct')).toBeTruthy();
    expect(chip.props.accessibilityLabel).toBe('Day 3, 14 October');
  });

  test('"All" is named "All days"', async () => {
    await render(chips());
    expect(screen.getByTestId('trip-day-all').props.accessibilityLabel).toBe('All days');
    expect(within(screen.getByTestId('trip-day-all')).getByText('All')).toBeTruthy();
  });

  test('is not drawn for a trip with no stops (FR-040, FR-042)', async () => {
    await render(chips({ days: [] }));
    expect(screen.queryByTestId('trip-days')).toBeNull();
    expect(screen.queryByTestId('trip-day-all')).toBeNull();
  });

  test('reports the chosen day by its index, and "All" as null', async () => {
    const onSelect = jest.fn();
    await render(chips({ onSelect, selected: 1 }));
    await fireEvent.press(screen.getByTestId('trip-day-3'));
    expect(onSelect).toHaveBeenLastCalledWith(3);
    await fireEvent.press(screen.getByTestId('trip-day-all'));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  test('exactly one radio is checked: the chosen day, or "All"', async () => {
    await render(chips({ selected: 2 }));
    const checked = screen
      .getAllByRole('radio')
      .filter((radio) => radio.props.accessibilityState?.checked === true)
      .map((radio) => radio.props.testID);
    expect(checked).toEqual(['trip-day-2']);

    await screen.rerender(chips({ selected: null }));
    const all = screen
      .getAllByRole('radio')
      .filter((radio) => radio.props.accessibilityState?.checked === true)
      .map((radio) => radio.props.testID);
    expect(all).toEqual(['trip-day-all']);
  });

  test('the chosen chip is the ink fill with the on-ink label; the others are cream (not colour alone: it is also checked)', async () => {
    jest
      .spyOn(HeroUI, 'useThemeColor')
      .mockImplementation(((token: string | string[]) =>
        Array.isArray(token)
          ? token.map((t) => `colour:${t}`)
          : `colour:${token}`) as never);
    await render(chips({ selected: 2 }));
    const fill = (id: string) =>
      StyleSheet.flatten(
        within(screen.getByTestId(id)).getByTestId(`${id}-face`).props.style,
      ).backgroundColor;
    expect(fill('trip-day-2')).toBe('colour:foreground');
    expect(fill('trip-day-1')).toBe('colour:surface-secondary');
  });

  test('every chip is at least 56 dp each way and grows with the text', async () => {
    await render(chips());
    const face = StyleSheet.flatten(
      screen.getByTestId('trip-day-1-face').props.style,
    ) as Record<string, number>;
    expect(face.minWidth).toBeGreaterThanOrEqual(56);
    expect(face.minHeight).toBeGreaterThanOrEqual(56);
    expect(face.height).toBeUndefined();
  });

  test('scrolls sideways with no bar, and is capped at 1.3 like every chip', async () => {
    await render(chips());
    const scroller = screen.getByTestId('trip-days-scroll');
    expect(scroller.props.horizontal).toBe(true);
    expect(scroller.props.showsHorizontalScrollIndicator).toBe(false);
    expect(
      within(screen.getByTestId('trip-day-3')).getByText('D3').props
        .maxFontSizeMultiplier,
    ).toBe(1.3);
  });
});

describe('<PinnedStrip>', () => {
  const shared = (value: number) => ({ value }) as never;

  function pinned(anchor: number, scroll: number, onHeight?: (h: number) => void) {
    return (
      <PinnedStrip
        anchorY={shared(anchor)}
        scrollY={shared(scroll)}
        pinLine={110}
        onHeight={onHeight}>
        <DayChips days={days} selected={null} onSelect={jest.fn()} />
      </PinnedStrip>
    );
  }

  const translate = () =>
    (
      StyleSheet.flatten(screen.getByTestId('trip-days-pin').props.style).transform as {
        translateY: number;
      }[]
    )[0]?.translateY;

  test('lies over its place in the content before the content has scrolled', async () => {
    await render(pinned(500, 0));
    expect(translate()).toBe(500);
  });

  test('stays at the pin line, under the bar, once the content has scrolled past it', async () => {
    await render(pinned(500, 2000));
    expect(translate()).toBe(110);
  });

  test('holds the one strip: one set of ids, in the one reading order', async () => {
    await render(pinned(500, 0));
    expect(screen.getAllByTestId('trip-days')).toHaveLength(1);
  });

  test('is drawn over the content but lets touches through where it has nothing', async () => {
    await render(pinned(500, 0));
    const style = StyleSheet.flatten(screen.getByTestId('trip-days-pin').props.style);
    expect(style.position).toBe('absolute');
    expect(screen.getByTestId('trip-days-pin').props.pointerEvents).toBe('box-none');
  });

  test('reports its laid-out height so the content can leave room for it', async () => {
    const onHeight = jest.fn();
    await render(pinned(500, 0, onHeight));
    await fireEvent(screen.getByTestId('trip-days-pin'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 68 } },
    });
    expect(onHeight).toHaveBeenCalledWith(68);
  });
});
