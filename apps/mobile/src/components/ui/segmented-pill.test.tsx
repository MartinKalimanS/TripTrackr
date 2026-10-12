/**
 * T520 - contract C5-16 (`SegmentedPill`), FR-025, FR-026, FR-055, FR-063, FR-071, FR-074;
 * used for the trips filter and the passport period.
 *
 * `options[{ key, label, count?, testID, accessibilityLabel }]`, `selectedKey`,
 * `onSelect`: a track with radius full and padding 4, a thumb = the track minus 8 (so
 * concentric), 36 dp at least (32 small), the selected segment an `ink` fill with an
 * `onInk` label, counts in tabular figures that are part of the name ("Active, 1").
 * `tablist` and `tab`, or `radiogroup` and `radio`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { MinTouchTarget } from '@/constants/theme';
import { useAccessibilityFlags } from '@/hooks/use-accessibility-flags';
import type { Haptics } from '@/hooks/use-haptics';
import { FocusRing, PaletteNames, Palettes, Space } from '@/theme';

import { asCss, mockThemeColors } from '../../../test/helpers/theme-colors';
import { touchDown } from '../../../test/helpers/touch';
import { SegmentedPill, type SegmentOption } from './segmented-pill';

jest.mock('@/hooks/use-accessibility-flags');
jest.mock('@/hooks/use-haptics');
const { useHaptics } = jest.requireMock('@/hooks/use-haptics') as {
  useHaptics: jest.Mock<Haptics, []>;
};
const haptics: Haptics = { selection: jest.fn(), success: jest.fn(), warning: jest.fn() };

beforeEach(() => {
  (useAccessibilityFlags as jest.Mock).mockReturnValue({
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    ready: true,
  });
  useHaptics.mockReturnValue(haptics);
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const OPTIONS: readonly SegmentOption[] = [
  { key: 'all', label: 'All', testID: 'filter-all', accessibilityLabel: 'All trips' },
  {
    key: 'active',
    label: 'Active',
    count: 1,
    testID: 'filter-active',
    accessibilityLabel: 'Active, 1',
  },
  {
    key: 'planned',
    label: 'Planned',
    testID: 'filter-planned',
    accessibilityLabel: 'Planned',
  },
];

const flat = (element: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(element.props.style as never) ?? {}) as Record<string, unknown>;
const classesOf = (element: { props: { className?: unknown } }) =>
  String(element.props.className ?? '').split(/\s+/);
const segment = (testID: string) => screen.getByTestId(testID);

async function renderPill(props: Record<string, unknown> = {}) {
  const onSelect = jest.fn();
  await render(
    <SegmentedPill
      options={OPTIONS}
      selectedKey="all"
      onSelect={onSelect}
      testID="trips-filter"
      accessibilityLabel="Trips filter"
      {...props}
    />,
  );
  return { onSelect };
}

describe('<SegmentedPill> roles - C5-16', () => {
  test('is a tablist of tabs by default, named when it is given a name', async () => {
    await renderPill();
    const group = screen.getByTestId('trips-filter');
    expect(group.props.accessibilityRole).toBe('tablist');
    expect(group.props.accessibilityLabel).toBe('Trips filter');
    for (const option of OPTIONS) {
      expect(segment(option.testID).props.accessibilityRole).toBe('tab');
      expect(segment(option.testID).props.accessibilityLabel).toBe(
        option.accessibilityLabel,
      );
    }
  });

  test('announces selected, and only selected, for a tab', async () => {
    await renderPill();
    expect(segment('filter-all').props.accessibilityState).toEqual({ selected: true });
    expect(segment('filter-active').props.accessibilityState).toEqual({
      selected: false,
    });
  });

  test('is a radiogroup of radios on request, announcing selected AND checked', async () => {
    await renderPill({ role: 'radiogroup' });
    expect(screen.getByTestId('trips-filter').props.accessibilityRole).toBe('radiogroup');
    expect(segment('filter-all').props.accessibilityRole).toBe('radio');
    expect(segment('filter-all').props.accessibilityState).toEqual({
      selected: true,
      checked: true,
    });
    expect(segment('filter-active').props.accessibilityState).toEqual({
      selected: false,
      checked: false,
    });
  });

  test('a counted segment says its count in its name: "Active, 1"', async () => {
    await renderPill();
    expect(screen.getByLabelText('Active, 1')).toBe(segment('filter-active'));
  });

  test('a selectedKey that matches nothing selects nothing', async () => {
    await renderPill({ selectedKey: 'none' });
    for (const option of OPTIONS) {
      expect(segment(option.testID).props.accessibilityState).toEqual({
        selected: false,
      });
    }
  });

  test('refuses an unnamed segment, at compile time and in development', async () => {
    await expect(
      renderPill({
        options: [{ key: 'a', label: 'A', testID: 'a', accessibilityLabel: ' ' }],
      }),
    ).rejects.toThrow(/accessibilityLabel/);
    // @ts-expect-error - a segment must carry its accessibilityLabel
    const bad: SegmentOption = { key: 'a', label: 'A', testID: 'a' };
    expect(bad).toBeTruthy();
  });
});

describe('<SegmentedPill> selection - FR-020', () => {
  test('pressing another segment reports its key and plays the selection haptic', async () => {
    const { onSelect } = await renderPill();
    await fireEvent.press(segment('filter-planned'));
    expect(onSelect).toHaveBeenCalledWith('planned');
    expect(haptics.selection).toHaveBeenCalledTimes(1);
  });

  test('pressing the selected one again reports it, as the chip group does, but is silent', async () => {
    const { onSelect } = await renderPill();
    await fireEvent.press(segment('filter-all'));
    expect(onSelect).toHaveBeenCalledWith('all');
    expect(haptics.selection).not.toHaveBeenCalled();
  });
});

describe.each(PaletteNames)('<SegmentedPill> look in %s - C5-16', (theme) => {
  const palette = Palettes[theme];
  beforeEach(() => mockThemeColors(theme));

  test('the track is cream with a hairline, a capsule with padding 4', async () => {
    await renderPill();
    const track = flat(screen.getByTestId('trips-filter'));
    expect(track).toMatchObject({
      backgroundColor: asCss(palette.surfaceSecondary),
      borderColor: asCss(palette.hairline),
      borderWidth: 1,
      padding: Space[1],
      flexDirection: 'row',
    });
    expect(Number(track.borderRadius)).toBeGreaterThanOrEqual(MinTouchTarget);
  });

  test('the selected segment is the ink thumb with an onInk label (P18)', async () => {
    await renderPill();
    expect(flat(segment('filter-all')).backgroundColor).toBe(asCss(palette.ink));
    expect(classesOf(screen.getByText('All'))).toContain('text-on-ink');
  });

  test('an unselected segment has no fill and a muted label', async () => {
    await renderPill();
    expect(flat(segment('filter-planned')).backgroundColor).toBeUndefined();
    expect(classesOf(screen.getByText('Planned'))).toContain('text-muted');
  });

  test('a held press on an unselected segment paints the pressed fill with an ink label', async () => {
    await renderPill();
    await touchDown(segment('filter-planned'));
    expect(flat(segment('filter-planned')).backgroundColor).toBe(asCss(palette.pressed));
    expect(classesOf(screen.getByText('Planned'))).toContain('text-foreground');
  });

  test('a held press on the selected segment leaves the thumb as it is', async () => {
    await renderPill();
    await touchDown(segment('filter-all'));
    expect(flat(segment('filter-all')).backgroundColor).toBe(asCss(palette.ink));
    expect(classesOf(screen.getByText('All'))).toContain('text-on-ink');
  });
});

describe('<SegmentedPill> size and wrapping - FR-026, FR-029, FR-074', () => {
  test('a segment is 36 dp at least, 32 when small, and never a fixed height', async () => {
    await renderPill();
    expect(flat(segment('filter-all')).minHeight).toBe(36);
    expect(flat(segment('filter-all')).height).toBeUndefined();
    await renderPill({ size: 'sm' });
    expect(flat(segment('filter-all')).minHeight).toBe(32);
  });

  test('slop around a segment reaches the platform floor', async () => {
    await renderPill();
    const vertical = (MinTouchTarget - 36) / 2;
    expect(segment('filter-all').props.hitSlop).toEqual({
      top: vertical,
      bottom: vertical,
      left: 0,
      right: 0,
    });
  });

  test('the segments share the track equally, and a label wraps instead of clipping', async () => {
    await renderPill();
    expect(flat(segment('filter-all'))).toMatchObject({ flexGrow: 1, flexBasis: 0 });
    expect(classesOf(screen.getByText('Planned'))).toContain('shrink');
  });

  test('the label is the semibold label role, capped at 1.3 like a pill', async () => {
    await renderPill();
    expect(classesOf(screen.getByText('All'))).toEqual(
      expect.arrayContaining(['text-[14px]', 'font-body-semibold']),
    );
    expect(screen.getByText('All').props.maxFontSizeMultiplier).toBe(1.3);
  });

  test('a count is shown beside its label, in tabular figures', async () => {
    await renderPill();
    const count = screen.getByText('1');
    expect(flat(count).fontVariant).toEqual(expect.arrayContaining(['tabular-nums']));
    expect(screen.queryAllByText('2')).toHaveLength(0);
  });

  test('a segment without a count shows only its label', async () => {
    await renderPill();
    expect(screen.getByLabelText('Planned').children).toHaveLength(1);
  });
});

describe('<SegmentedPill> focus ring - FR-071', () => {
  test('a focused segment draws the 2.5 dp ring 2 dp outside, in the focus colour', async () => {
    mockThemeColors('light');
    await renderPill();
    expect(flat(segment('filter-active')).outlineWidth).toBeUndefined();
    await fireEvent(segment('filter-active'), 'focus');
    expect(flat(segment('filter-active'))).toMatchObject({
      outlineWidth: FocusRing.width,
      outlineOffset: FocusRing.offset,
      outlineColor: asCss(Palettes.light.focus),
    });
    await fireEvent(segment('filter-active'), 'blur');
    expect(flat(segment('filter-active')).outlineWidth).toBeUndefined();
  });
});
