/**
 * T421 - contract C4-8 (`Chip`, `ChipGroup`, `StatusChip`), FR-005, FR-019, FR-020,
 * FR-025, FR-026, FR-029, FR-030, review rules 2, 3, 5 and 7; 003 FR-017.
 *
 * Jest renders the kit's Chip as a plain Pressable that forwards every prop
 * (test/mocks/heroui-native.tsx), so what is asserted is the adapter's accessibility
 * contract on the host node and what it ASKS of the kit (variant, classes, frame). Real
 * styling is not asserted; `test/ui-kit/field-chip-kit-facts.test.ts` pins the kit facts
 * the adapter relies on and `test/ui-kit/real-render.test.tsx` renders the kit itself.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';

import { Colors, MinTouchTarget } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';
import type { Haptics } from '@/hooks/use-haptics';
import { FocusRing } from '@/theme';

import { glyphNamesIn, glyphsIn } from '../../../test/helpers/icons';
import { Chip, ChipGroup, StatusChip, type ChipOption } from './chip';

jest.mock('@/hooks/use-appearance');
jest.mock('@/hooks/use-haptics');
const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};
const { useHaptics } = jest.requireMock('@/hooks/use-haptics') as {
  useHaptics: jest.Mock<Haptics, []>;
};
const haptics: Haptics = { selection: jest.fn(), success: jest.fn(), warning: jest.fn() };

beforeEach(() => {
  useAppearance.mockReturnValue({
    theme: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    tokens: Colors.light,
  } as AppearanceContext);
  useHaptics.mockReturnValue(haptics);
});
afterEach(() => jest.restoreAllMocks());

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
    expect(flat(chip()).minHeight).toBeUndefined();
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

describe('<Chip> selected is not colour alone - FR-025', () => {
  test('a selected chip is filled, heavier and carries a check glyph', async () => {
    await renderChip({ selected: true });
    expect(chip().props.variant).toBe('primary');
    expect(chip().props.color).toBe('accent');
    expect(classesOf(screen.getByText('EUR'))).toContain('font-semibold');
    expect(symbols()).toEqual([CHECK]);
    expect(screen.getByTestId('currency-eur-check', hidden)).toBeTruthy();
  });

  test('an unselected chip is outlined at 3:1, lighter and has no check', async () => {
    await renderChip({ selected: false });
    expect(chip().props.variant).toBe('tertiary');
    expect(chip().props.color).toBe('default');
    expect(classesOf(chip())).toEqual(
      expect.arrayContaining(['border', 'border-border']),
    );
    expect(classesOf(screen.getByText('EUR'))).not.toContain('font-semibold');
    expect(glyphsIn()).toHaveLength(0);
  });

  test('both keep a border, so selecting never changes the size by a pixel', async () => {
    await renderChip({ selected: true });
    expect(classesOf(chip())).toContain('border');
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

describe('<Chip> touch target - FR-026, FR-029', () => {
  test('an interactive chip is at least the platform floor each way', async () => {
    await renderChip();
    expect(flat(chip()).minHeight).toBe(MinTouchTarget);
    expect(flat(chip()).minWidth).toBe(MinTouchTarget);
  });

  test('and has a little slop around it, for a hand that misses', async () => {
    await renderChip();
    expect(chip().props.hitSlop).toEqual({ top: 4, bottom: 4, left: 4, right: 4 });
  });

  test('lets its label wrap instead of clipping at the largest text size', async () => {
    await renderChip();
    expect(classesOf(screen.getByText('EUR'))).toContain('shrink');
  });

  test('never caps font scaling', async () => {
    await renderChip();
    expect(screen.getByText('EUR').props.maxFontSizeMultiplier).toBeUndefined();
  });
});

describe('<Chip> disabled and feedback - FR-019, FR-024', () => {
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

  test('swaps to a gated fill the instant it is pressed, never the 20% soft hover', async () => {
    await render(
      <>
        <Chip label="A" accessibilityLabel="A" testID="on" selected onPress={jest.fn()} />
        <Chip label="B" accessibilityLabel="B" testID="off" onPress={jest.fn()} />
      </>,
    );
    expect(classesOf(screen.getByTestId('on'))).toContain('active:bg-accent-hover');
    expect(classesOf(screen.getByTestId('off'))).toContain('active:bg-surface-tertiary');
    for (const id of ['on', 'off']) {
      expect(String(screen.getByTestId(id).props.className)).not.toMatch(/soft|\/20/);
    }
  });

  test('a label chip has no pressed fill, because nothing happens when it is pressed', async () => {
    await renderChip({ onPress: undefined });
    expect(String(chip().props.className)).not.toContain('active:');
  });

  test('draws a focus ring outside the chip, and only while focused (FR-026)', async () => {
    await renderChip();
    expect(flat(chip()).outlineWidth).toBeUndefined();
    await fireEvent(chip(), 'focus');
    expect(flat(chip())).toMatchObject({
      outlineWidth: FocusRing.width,
      outlineOffset: FocusRing.offset,
      outlineStyle: 'solid',
    });
    await fireEvent(chip(), 'blur');
    expect(flat(chip()).outlineWidth).toBeUndefined();
  });

  test('is not clipped by the kit overflow, so the ring outside it is drawn', async () => {
    await renderChip();
    expect(classesOf(chip())).toContain('overflow-visible');
  });

  test('requests semantic classes only, never a colour literal (review rule 3)', () => {
    const source = jest
      .requireActual('fs')
      .readFileSync(require.resolve('./chip.tsx'), 'utf8') as string;
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|\[#/);
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

  test('shows the selection by fill, weight and check, not by colour alone', async () => {
    await renderGroup();
    expect(screen.getByTestId('currency-EUR').props.variant).toBe('primary');
    expect(screen.getByTestId('currency-USD').props.variant).toBe('tertiary');
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
    '%s carries text AND an icon, in the two-child shape of StatusPill',
    async (status, label) => {
      await render(<StatusChip status={status} />);
      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.getByTestId(`status-pill-${status}`).children).toHaveLength(2);
      expect(symbols()).toHaveLength(1);
    },
  );

  test('each status has its own icon, so the state survives greyscale (FR-025)', async () => {
    await render(
      <>
        <StatusChip status="planning" />
        <StatusChip status="active" />
        <StatusChip status="past" />
      </>,
    );
    const names = symbols();
    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(3);
  });

  test.each([
    ['planning', 'Planning', 'text-status-planning-ink', 'bg-status-planning-ink/15'],
    ['active', 'Active', 'text-status-active', 'bg-status-active/15'],
    ['past', 'Past', 'text-status-past', 'bg-status-past/15'],
  ] as const)(
    '%s is tinted by the gated ink on its 15%% soft fill',
    async (status, label, text, fill) => {
      await render(<StatusChip status={status} />);
      expect(classesOf(screen.getByText(label))).toContain(text);
      expect(classesOf(screen.getByTestId(`status-pill-${status}`))).toContain(fill);
    },
  );

  test('planning text uses the ink variant, never the mark colour', async () => {
    await render(<StatusChip status="planning" />);
    expect(classesOf(screen.getByText('Planning'))).not.toContain('text-status-planning');
  });

  test('never uses a 20% soft fill under text (review rule 5)', async () => {
    await render(
      <>
        <StatusChip status="planning" />
        <StatusChip status="active" />
        <StatusChip status="past" />
      </>,
    );
    for (const [status] of STATUSES) {
      const node = screen.getByTestId(`status-pill-${status}`);
      expect(String(node.props.className)).not.toMatch(/\/20|soft/);
    }
  });

  test('is not pressable: it is a label, with no press handler', async () => {
    await render(<StatusChip status="active" />);
    expect(screen.getByTestId('status-pill-active').props.onPress).toBeUndefined();
    expect(screen.getByTestId('status-pill-active').props.onClick).toBeUndefined();
  });

  test('its text can grow: no fixed height, no capped scaling', async () => {
    await render(<StatusChip status="active" />);
    const node = screen.getByTestId('status-pill-active');
    expect(flat(node).height).toBeUndefined();
    expect(screen.getByText('Active').props.maxFontSizeMultiplier).toBeUndefined();
  });
});
