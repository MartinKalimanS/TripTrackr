/**
 * T421 and T520 - contract C5-16 (`Chip`, `ChipGroup`, `StatusChip`), FR-025, FR-026,
 * FR-029, FR-030, FR-055, FR-063, FR-065, FR-070, review rules 2, 3, 5, 6 and 7; 003 FR-017;
 * research D5-16.
 *
 * The chips are React Native `Pressable`s and `View`s painted from tokens (feature 004
 * wrapped the kit's Chip). Pressable keeps its pressed state to itself, so a press is
 * driven with `touchDown` and the style the host node carries is read back, with
 * `useThemeColor` answering from the generated stylesheet of the theme under test.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';

import { MinTouchTarget } from '@/constants/theme';
import { useAccessibilityFlags } from '@/hooks/use-accessibility-flags';
import type { Haptics } from '@/hooks/use-haptics';
import { FocusRing, PaletteNames, Palettes } from '@/theme';

import { glyphNamesIn, glyphsIn } from '../../../test/helpers/icons';
import { asCss, mockThemeColors } from '../../../test/helpers/theme-colors';
import { touchDown } from '../../../test/helpers/touch';
import { Chip, ChipGroup, StatusChip, type ChipOption } from './chip';
import { chipLook } from './chip-look';

jest.mock('@/hooks/use-accessibility-flags');
jest.mock('@/hooks/use-haptics');
const mockedFlags = useAccessibilityFlags as jest.MockedFunction<
  typeof useAccessibilityFlags
>;
const { useHaptics } = jest.requireMock('@/hooks/use-haptics') as {
  useHaptics: jest.Mock<Haptics, []>;
};
const haptics: Haptics = { selection: jest.fn(), success: jest.fn(), warning: jest.fn() };
const FLAGS = {
  prefersMoreContrast: false,
  prefersLessMotion: false,
  prefersLessTransparency: false,
  ready: true,
};

beforeEach(() => {
  mockedFlags.mockReturnValue(FLAGS);
  useHaptics.mockReturnValue(haptics);
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const hidden = { includeHiddenElements: true };
const CHECK = 'check';
const classesOf = (element: { props: { className?: unknown } }) =>
  String(element.props.className ?? '').split(/\s+/);
const flat = (element: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(element.props.style as never) ?? {}) as Record<string, unknown>;
/** The registry key of every glyph drawn, in order. */
const symbols = () => glyphNamesIn();

const chip = () => screen.getByTestId('currency-eur');
const renderChip = (props: Record<string, unknown> = {}) =>
  render(
    <Chip
      label="EUR"
      accessibilityLabel="Euro"
      testID="currency-eur"
      onPress={jest.fn()}
      {...props}
    />,
  );

describe('<Chip> identity - contract C4-6 rule 4', () => {
  test('is a button with the given name and its label as text', async () => {
    await renderChip();
    expect(chip().props.accessibilityRole).toBe('button');
    expect(screen.getByLabelText('Euro')).toBe(chip());
    expect(screen.getByText('EUR')).toBeTruthy();
  });

  test('forwards testID to the pressable node and presses through it', async () => {
    const onPress = jest.fn();
    await renderChip({ onPress });
    await fireEvent.press(chip());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('takes another role when asked (a radio, a checkbox)', async () => {
    await renderChip({ accessibilityRole: 'radio' });
    expect(chip().props.accessibilityRole).toBe('radio');
  });

  test('without a press handler it is a label, not a button that does nothing', async () => {
    await renderChip({ onPress: undefined });
    expect(chip().props.accessibilityRole).toBe('text');
    expect(chip().props.hitSlop).toBeUndefined();
  });

  test('refuses to render without an accessible name (runtime, development)', async () => {
    await expect(renderChip({ accessibilityLabel: '' })).rejects.toThrow(
      /accessibilityLabel/,
    );
    await expect(
      render(
        // @ts-expect-error - the label is required by the type as well
        <Chip label="EUR" onPress={jest.fn()} />,
      ),
    ).rejects.toThrow(/accessibilityLabel/);
  });
});

describe.each(PaletteNames)('<Chip> look in %s - C5-16', (theme) => {
  const palette = Palettes[theme];
  beforeEach(() => mockThemeColors(theme));

  test('unselected: cream, a hairline, an ink label', async () => {
    await renderChip();
    expect(flat(chip())).toMatchObject({
      backgroundColor: asCss(palette.surfaceSecondary),
      borderColor: asCss(palette.hairline),
      borderWidth: 1,
    });
    expect(classesOf(screen.getByText('EUR'))).toContain('text-foreground');
  });

  test('selected: an ink fill, an onInk label and a check (P18)', async () => {
    await renderChip({ selected: true });
    expect(flat(chip())).toMatchObject({ backgroundColor: asCss(palette.ink) });
    expect(classesOf(screen.getByText('EUR'))).toContain('text-on-ink');
    expect(glyphsIn()).toEqual([
      expect.objectContaining({ name: CHECK, color: asCss(palette.onInk) }),
    ]);
  });

  test('dashed ("add"): no fill and a 1.5 dp dashed border', async () => {
    await renderChip({ dashed: true });
    expect(flat(chip()).backgroundColor).toBeUndefined();
    expect(flat(chip())).toMatchObject({
      borderColor: asCss(palette.border),
      borderWidth: 1.5,
      borderStyle: 'dashed',
    });
  });

  test.each([
    ['unselected', {}],
    ['selected', { selected: true }],
    ['dashed', { dashed: true }],
  ])(
    '%s: a held press paints the pressed fill with an ink label',
    async (_name, props) => {
      await renderChip(props);
      await touchDown(chip());
      const look = chipLook({
        selected: Boolean((props as { selected?: boolean }).selected),
        dashed: Boolean((props as { dashed?: boolean }).dashed),
        pressed: true,
      });
      expect(flat(chip()).backgroundColor).toBe(asCss(palette[look.fill!]));
      expect(flat(chip()).transform).toEqual([{ scale: 0.97 }]);
      expect(classesOf(screen.getByText('EUR'))).toContain('text-foreground');
    },
  );
});

describe('<Chip> selected is not colour alone - FR-025', () => {
  test('a selected chip is filled and carries a check glyph; an unselected one has none', async () => {
    await renderChip({ selected: true });
    expect(symbols()).toEqual([CHECK]);
    expect(screen.getByTestId('currency-eur-check', hidden)).toBeTruthy();
    await renderChip({ selected: false });
    expect(glyphsIn()).toHaveLength(0);
  });

  test('both keep a border of the same width, so selecting never changes the size by a pixel', async () => {
    mockThemeColors('light');
    await renderChip({ selected: true });
    const selected = flat(chip()).borderWidth;
    await renderChip({ selected: false });
    expect(flat(chip()).borderWidth).toBe(selected);
  });

  test('the state is announced as selected', async () => {
    await renderChip({ selected: true });
    expect(chip().props.accessibilityState).toMatchObject({ selected: true });
    await renderChip({ selected: false, testID: 'other' });
    expect(screen.getByTestId('other').props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  test('the check is decorative: the state is announced through the chip', async () => {
    await renderChip({ selected: true });
    expect(screen.getByTestId('currency-eur-check', hidden).props.accessible).toBe(false);
  });
});

describe('<Chip> leading glyph', () => {
  const GLYPH = 'fork-knife';

  test('draws an icon name with the ink of the chip', async () => {
    await renderChip({ leading: GLYPH });
    expect(symbols()).toEqual([GLYPH]);
    expect(screen.getByTestId('currency-eur-icon', hidden)).toBeTruthy();
  });

  test('the check takes its place while selected (the Material filter chip)', async () => {
    await renderChip({ leading: GLYPH, selected: true });
    expect(symbols()).toEqual([CHECK]);
  });

  test('renders any other node as it is', async () => {
    await renderChip({ leading: <View testID="glyph" /> });
    expect(screen.getByTestId('glyph')).toBeTruthy();
    expect(glyphsIn()).toHaveLength(0);
  });
});

describe('<Chip> touch target - FR-026, FR-029, C5-16', () => {
  test('is 40 dp visible, and slop around it reaches the platform floor each way', async () => {
    await renderChip();
    expect(flat(chip()).minHeight).toBe(40);
    const vertical = (MinTouchTarget - 40) / 2;
    expect(chip().props.hitSlop).toEqual({
      top: vertical,
      bottom: vertical,
      left: 4,
      right: 4,
    });
    expect(40 + 2 * vertical).toBeGreaterThanOrEqual(MinTouchTarget);
    expect(flat(chip()).minWidth).toBe(MinTouchTarget);
  });

  test('lets its label wrap instead of clipping at the largest text size', async () => {
    await renderChip();
    expect(classesOf(screen.getByText('EUR'))).toContain('shrink');
    expect(flat(chip()).height).toBeUndefined();
  });

  test('is a capsule, its label capped at 1.3 like every chip (FR-074)', async () => {
    await renderChip();
    expect(Number(flat(chip()).borderRadius)).toBeGreaterThanOrEqual(MinTouchTarget);
    expect(screen.getByText('EUR').props.maxFontSizeMultiplier).toBe(1.3);
  });

  test('its label is the semibold label role', async () => {
    await renderChip();
    expect(classesOf(screen.getByText('EUR'))).toEqual(
      expect.arrayContaining(['text-[14px]', 'leading-[20px]', 'font-body-semibold']),
    );
  });
});

describe('<Chip> disabled and feedback - FR-019, FR-024, FR-071', () => {
  test('is announced unavailable, dimmed and inert', async () => {
    const onPress = jest.fn();
    await renderChip({ disabled: true, onPress, selected: true });
    expect(chip().props.accessibilityState).toMatchObject({
      disabled: true,
      selected: true,
    });
    expect(classesOf(chip())).toContain('opacity-disabled');
    await fireEvent.press(chip());
    expect(onPress).not.toHaveBeenCalled();
  });

  test('is not dimmed, and announces no disabled state, when enabled', async () => {
    await renderChip();
    expect(classesOf(chip())).not.toContain('opacity-disabled');
    expect(chip().props.accessibilityState?.disabled).toBeFalsy();
  });

  test('a disabled chip shows no pressed state', async () => {
    await renderChip({ disabled: true });
    await touchDown(chip());
    expect(flat(chip()).transform).toBeUndefined();
  });

  test('the scale is .97 while held, and none under reduced motion', async () => {
    mockThemeColors('light');
    await renderChip();
    expect(flat(chip()).transform).toBeUndefined();
    await touchDown(chip());
    expect(flat(chip()).transform).toEqual([{ scale: 0.97 }]);

    mockedFlags.mockReturnValue({ ...FLAGS, prefersLessMotion: true });
    await renderChip();
    await touchDown(chip());
    expect(flat(chip()).transform).toBeUndefined();
    expect(flat(chip()).backgroundColor).toBe(asCss(Palettes.light.pressed));
  });

  test('a label chip has no pressed state, because nothing happens when it is pressed', async () => {
    await renderChip({ onPress: undefined });
    await touchDown(chip());
    expect(flat(chip()).transform).toBeUndefined();
  });

  test('draws a 2.5 dp focus ring 2 dp outside the chip, in the focus colour, only while focused', async () => {
    mockThemeColors('dark');
    await renderChip();
    expect(flat(chip()).outlineWidth).toBeUndefined();
    await fireEvent(chip(), 'focus');
    expect(flat(chip())).toMatchObject({
      outlineWidth: FocusRing.width,
      outlineOffset: FocusRing.offset,
      outlineColor: asCss(Palettes.dark.focus),
      outlineStyle: 'solid',
    });
    await fireEvent(chip(), 'blur');
    expect(flat(chip()).outlineWidth).toBeUndefined();
  });

  test('requests tokens only, never a colour literal (review rule 3)', () => {
    for (const file of ['./chip.tsx', './chip-look.ts']) {
      const source = jest
        .requireActual('fs')
        .readFileSync(require.resolve(file), 'utf8') as string;
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|\[#/);
    }
  });
});

describe('<ChipGroup> - radio group parity with the retired PillGroup', () => {
  const OPTIONS: readonly ChipOption[] = [
    { key: 'EUR', label: 'EUR', testID: 'currency-EUR', accessibilityLabel: 'Euro' },
    { key: 'USD', label: 'USD', testID: 'currency-USD', accessibilityLabel: 'US dollar' },
    {
      key: 'other',
      label: 'Other',
      testID: 'currency-other',
      accessibilityLabel: 'Other',
    },
  ];
  async function renderGroup(props: Record<string, unknown> = {}) {
    const onSelect = jest.fn();
    await render(
      <ChipGroup options={OPTIONS} selectedKey="EUR" onSelect={onSelect} {...props} />,
    );
    return { onSelect };
  }

  test('is a radiogroup, named when it is given a name', async () => {
    await renderGroup({ accessibilityLabel: 'Currency', testID: 'currency-group' });
    const group = screen.getByTestId('currency-group');
    expect(group.props.accessibilityRole).toBe('radiogroup');
    expect(group.props.accessibilityLabel).toBe('Currency');
  });

  test('every option is a radio with its own id, name and text', async () => {
    await renderGroup();
    for (const option of OPTIONS) {
      const node = screen.getByTestId(option.testID);
      expect(node.props.accessibilityRole).toBe('radio');
      expect(node.props.accessibilityLabel).toBe(option.accessibilityLabel);
      expect(screen.getByText(option.label)).toBeTruthy();
    }
  });

  test('announces selected AND checked, exactly the state PillGroup did', async () => {
    await renderGroup();
    expect(screen.getByTestId('currency-EUR').props.accessibilityState).toEqual({
      selected: true,
      checked: true,
    });
    expect(screen.getByTestId('currency-USD').props.accessibilityState).toEqual({
      selected: false,
      checked: false,
    });
  });

  test('shows the selection by fill and check, not by colour alone', async () => {
    mockThemeColors('light');
    await renderGroup();
    expect(flat(screen.getByTestId('currency-EUR')).backgroundColor).toBe(
      asCss(Palettes.light.ink),
    );
    expect(flat(screen.getByTestId('currency-USD')).backgroundColor).toBe(
      asCss(Palettes.light.surfaceSecondary),
    );
    expect(screen.getByTestId('currency-EUR-check', hidden)).toBeTruthy();
    expect(screen.queryByTestId('currency-USD-check', hidden)).toBeNull();
  });

  test('selecting another option reports its key and plays the selection haptic', async () => {
    const { onSelect } = await renderGroup();
    await fireEvent.press(screen.getByTestId('currency-USD'));
    expect(onSelect).toHaveBeenCalledWith('USD');
    expect(haptics.selection).toHaveBeenCalledTimes(1);
  });

  test('pressing the selected one again reports it, as before, but is silent', async () => {
    const { onSelect } = await renderGroup();
    await fireEvent.press(screen.getByTestId('currency-EUR'));
    expect(onSelect).toHaveBeenCalledWith('EUR');
    expect(haptics.selection).not.toHaveBeenCalled();
  });

  test('wraps onto the next line by default, without a scroll view', async () => {
    await renderGroup();
    const json = JSON.stringify(screen.toJSON());
    expect(json).not.toContain('RCTScrollView');
  });

  test('scroll turns it into one sideways row, with no scroll bar', async () => {
    await renderGroup({ scroll: true });
    const found = findByType(screen.toJSON(), 'RCTScrollView');
    expect(found?.props.horizontal).toBe(true);
    expect(found?.props.showsHorizontalScrollIndicator).toBe(false);
    expect(found?.props.keyboardShouldPersistTaps).toBe('handled');
  });

  test('keeps the radiogroup role and every radio when it scrolls', async () => {
    await renderGroup({ scroll: true, testID: 'group' });
    expect(screen.getByTestId('group').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getAllByRole('radio')).toHaveLength(OPTIONS.length);
  });

  test('a selectedKey that matches nothing selects nothing', async () => {
    await renderGroup({ selectedKey: 'none' });
    for (const option of OPTIONS) {
      const state = screen.getByTestId(option.testID).props.accessibilityState;
      expect(state).toEqual({ selected: false, checked: false });
    }
  });
});

interface Json {
  type: string;
  props: Record<string, unknown>;
  children?: (Json | string)[] | null;
}

function findByType(node: unknown, type: string): Json | undefined {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    return node.map((child) => findByType(child, type)).find(Boolean);
  }
  const json = node as Json;
  if (json.type === type) return json;
  return findByType(json.children ?? [], type);
}

describe('<StatusChip> - presentation of the trip status', () => {
  const STATUSES = [
    ['planning', 'Planning'],
    ['active', 'Active'],
    ['past', 'Past'],
  ] as const;

  test.each(STATUSES)(
    '%s keeps its id, role and "Status: ..." name',
    async (status, label) => {
      await render(<StatusChip status={status} />);
      const node = screen.getByTestId(`status-pill-${status}`);
      expect(node.props.accessibilityRole).toBe('text');
      expect(node.props.accessibilityLabel).toBe(`Status: ${label}`);
      expect(screen.getByLabelText(`Status: ${label}`)).toBe(node);
    },
  );

  test.each(STATUSES)(
    '%s carries text AND a mark, in the two-child shape of StatusPill',
    async (status, label) => {
      await render(<StatusChip status={status} />);
      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.getByTestId(`status-pill-${status}`).children).toHaveLength(2);
    },
  );

  test('each status has its own shape, so the state survives greyscale (FR-025)', async () => {
    await render(
      <>
        <StatusChip status="planning" />
        <StatusChip status="active" />
        <StatusChip status="past" />
      </>,
    );
    // The two with an icon draw different ones; the live one draws a dot instead.
    expect(symbols()).toEqual(['calendar', 'check-circle']);
    expect(screen.getByTestId('status-pill-active-dot', hidden)).toBeTruthy();
    expect(screen.queryByTestId('status-pill-planning-dot', hidden)).toBeNull();
    expect(screen.queryByTestId('status-pill-past-dot', hidden)).toBeNull();
  });

  describe.each(PaletteNames)('in %s', (theme) => {
    const palette = Palettes[theme];
    beforeEach(() => mockThemeColors(theme));

    test.each([
      ['planning', 'amberTint', 'text-amber-ink'],
      ['active', 'surfaceSecondary', 'text-foreground'],
      ['past', 'surfaceSecondary', 'text-muted'],
    ] as const)('%s: its fill and the gated ink', async (status, fill, ink) => {
      await render(<StatusChip status={status} />);
      const node = screen.getByTestId(`status-pill-${status}`);
      expect(flat(node).backgroundColor).toBe(asCss(palette[fill]));
      expect(
        classesOf(screen.getByText(status[0]!.toUpperCase() + status.slice(1))),
      ).toContain(ink);
    });

    test('active has the cream chip with a hairline and a coral live dot', async () => {
      await render(<StatusChip status="active" />);
      expect(flat(screen.getByTestId('status-pill-active'))).toMatchObject({
        borderColor: asCss(palette.hairline),
      });
      expect(flat(screen.getByTestId('status-pill-active-dot', hidden))).toMatchObject({
        backgroundColor: asCss(palette.accentLine),
        borderColor: asCss(palette.accentTint),
      });
    });
  });

  test('says "Active · Day 3 of 8" in the hero, and announces it', async () => {
    await render(<StatusChip status="active" dayOf={{ day: 3, of: 8 }} />);
    expect(screen.getByText('Active · Day 3 of 8')).toBeTruthy();
    expect(screen.getByTestId('status-pill-active').props.accessibilityLabel).toBe(
      'Status: Active, day 3 of 8',
    );
  });

  test('dayOf is for an active trip only', async () => {
    await render(<StatusChip status="planning" dayOf={{ day: 3, of: 8 }} />);
    expect(screen.getByText('Planning')).toBeTruthy();
    expect(screen.getByTestId('status-pill-planning').props.accessibilityLabel).toBe(
      'Status: Planning',
    );
  });

  test('never uses a 20% soft fill under text or a literal (review rule 5)', async () => {
    await render(
      <>
        <StatusChip status="planning" />
        <StatusChip status="active" />
        <StatusChip status="past" />
      </>,
    );
    for (const [status] of STATUSES) {
      const node = screen.getByTestId(`status-pill-${status}`);
      expect(String(node.props.className ?? '')).not.toMatch(/\/20|soft/);
    }
  });

  test('is not pressable: it is a label, with no press handler', async () => {
    await render(<StatusChip status="active" />);
    expect(screen.getByTestId('status-pill-active').props.onPress).toBeUndefined();
    expect(screen.getByTestId('status-pill-active').props.onClick).toBeUndefined();
  });

  test('its text can grow: no fixed height, capped at 1.3 like a pill (FR-074)', async () => {
    await render(<StatusChip status="active" />);
    const node = screen.getByTestId('status-pill-active');
    expect(flat(node).height).toBeUndefined();
    expect(screen.getByText('Active').props.maxFontSizeMultiplier).toBe(1.3);
  });
});
