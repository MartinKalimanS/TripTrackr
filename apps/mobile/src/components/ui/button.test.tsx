/**
 * T519 - contract C5-15 (`Button`), FR-006, FR-019, FR-020, FR-026, FR-029, FR-063,
 * FR-069, FR-071, research D5-14, review rules 2, 5 and 7.
 *
 * The button is a React Native `Pressable` painted from tokens (feature 004 wrapped the
 * kit's Button; the Sunrise variants, the primary edge ring and the pressed fills are not
 * the kit's, so the adapter draws them itself). Pressable keeps its pressed state to
 * itself, so a press is driven with `touchDown` and the style the host node carries is
 * read back. `useThemeColor` answers from the generated stylesheet of the theme under
 * test (`test/helpers/theme-colors.ts`), so "the pressed fill" is the real `pressed` key.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as HeroUI from 'heroui-native';
import { Dimensions, StyleSheet } from 'react-native';

import { MinTouchTarget } from '@/constants/theme';
import { useAccessibilityFlags } from '@/hooks/use-accessibility-flags';
import { useAppearance } from '@/hooks/use-appearance';
import type { Haptics } from '@/hooks/use-haptics';
import {
  FocusRing,
  PaletteNames,
  Palettes,
  PrimaryEdgeRing,
  type PaletteName,
} from '@/theme';

import { glyphsIn } from '../../../test/helpers/icons';
import { asCss, mockThemeColors } from '../../../test/helpers/theme-colors';
import { touchDown } from '../../../test/helpers/touch';
import { Button, buttonFrame, buttonStyle } from './button';
import {
  BUTTON_VARIANTS,
  buttonEdgeWidth,
  buttonLook,
  type ButtonVariant,
} from './button-look';

// The adapter reads the font scale from the window, and the two accessibility flags it
// needs from the shared store (`useAccessibilityFlags`), never from `useAppearance`: a
// button repeated down a list adds no per-component colour-scheme subscription.
jest.mock('@/hooks/use-appearance', () => ({ useAppearance: jest.fn() }));
jest.mock('@/hooks/use-accessibility-flags');
jest.mock('@/hooks/use-haptics');

const { useHaptics } = jest.requireMock('@/hooks/use-haptics') as {
  useHaptics: jest.Mock<Haptics, []>;
};
const mockedFlags = useAccessibilityFlags as jest.MockedFunction<
  typeof useAccessibilityFlags
>;
const haptics: Haptics = { selection: jest.fn(), success: jest.fn(), warning: jest.fn() };

const FLAGS = {
  prefersMoreContrast: false,
  prefersLessMotion: false,
  prefersLessTransparency: false,
  ready: true,
};

/** Sets the window font scale `useWindowDimensions` reports. */
function mockFontScale(fontScale: number) {
  jest.spyOn(Dimensions, 'get').mockReturnValue({
    width: 390,
    height: 844,
    scale: 3,
    fontScale,
  });
}

beforeEach(() => {
  mockFontScale(1);
  mockedFlags.mockReturnValue(FLAGS);
  useHaptics.mockReturnValue(haptics);
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const ICON = 'plus';
const hidden = { includeHiddenElements: true };
const node = () => screen.getByLabelText('Save trip');
const classesOf = (element: { props: { className?: unknown } }) =>
  String(element.props.className ?? '').split(/\s+/);
const styleOf = () => StyleSheet.flatten(node().props.style) as Record<string, unknown>;

const renderButton = (props: Record<string, unknown> = {}) =>
  render(
    <Button accessibilityLabel="Save trip" onPress={jest.fn()} {...props}>
      Save
    </Button>,
  );

describe('<Button> identity - contract C4-6 rule 4', () => {
  test('is a button with the given name and its label as text', async () => {
    await renderButton({ testID: 'save' });
    expect(node().props.accessibilityRole).toBe('button');
    expect(screen.getByText('Save')).toBeTruthy();
  });

  test('forwards testID to the pressable node', async () => {
    await renderButton({ testID: 'save' });
    expect(screen.getByTestId('save').props.accessibilityLabel).toBe('Save trip');
  });

  test('passes the hint through', async () => {
    await renderButton({ accessibilityHint: 'Saves it to this device' });
    expect(node().props.accessibilityHint).toBe('Saves it to this device');
  });

  test('refuses to render without an accessible name (runtime, development)', async () => {
    await expect(
      render(
        // @ts-expect-error - the label is required by the type as well
        <Button onPress={jest.fn()}>Save</Button>,
      ),
    ).rejects.toThrow(/accessibilityLabel/);
    await expect(renderButton({ accessibilityLabel: '' })).rejects.toThrow(
      /accessibilityLabel/,
    );
  });

  test('an icon-only button is named by its label alone', async () => {
    await render(
      <Button
        iconOnly
        icon={ICON}
        accessibilityLabel="Add stop"
        testID="add"
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('Add stop').props.accessibilityRole).toBe('button');
    expect(screen.getByTestId('add-icon', hidden)).toBeTruthy();
    expect(screen.queryByText('Add stop')).toBeNull();
  });
});

describe('<Button> emphasis marks - the review rule "one primary per screen state"', () => {
  // The screen suites count a screen's primaries by reading the emphasis off the host node
  // (`button.props.variant === 'primary'`), under the names the kit's Button had in feature
  // 004; the marks keep those suites unchanged. Native ignores props a view does not know.
  test.each([
    ['primary', 'primary'],
    ['secondary', 'secondary'],
    ['tonal', 'tertiary'],
    ['text', 'ghost'],
    ['destructive', 'danger-soft'],
  ] as const)('a %s button marks itself %s', async (variant, mark) => {
    await renderButton({ variant });
    expect(node().props.variant).toBe(mark);
  });

  test('marks its size and whether it is icon-only', async () => {
    await renderButton({ size: 'lg' });
    expect(node().props.size).toBe('lg');
    expect(node().props.isIconOnly).toBe(false);
    await render(<Button iconOnly icon={ICON} accessibilityLabel="Add stop" />);
    expect(screen.getByLabelText('Add stop').props.isIconOnly).toBe(true);
  });

  test('is primary and md unless told otherwise', async () => {
    await renderButton();
    expect(node().props.variant).toBe('primary');
    expect(node().props.size).toBe('md');
  });
});

describe('<Button> variants - C5-15, FR-006', () => {
  test('is primary and md unless told otherwise', async () => {
    mockThemeColors('light');
    await renderButton();
    expect(styleOf().backgroundColor).toBe(asCss(Palettes.light.accent));
    expect(styleOf().minHeight).toBe(Math.max(52, MinTouchTarget));
  });

  test('refuses what is not a variant, at compile time (ghost is the contract word for text)', () => {
    // @ts-expect-error - the variant of this adapter is `text`
    const ghost = <Button variant="ghost" accessibilityLabel="x" />;
    expect(ghost).toBeTruthy();
  });

  test('writes no colour literal into its classes (C4-1)', async () => {
    for (const variant of BUTTON_VARIANTS) {
      await renderButton({ variant, testID: variant, accessibilityLabel: variant });
      expect(String(screen.getByTestId(variant).props.className ?? '')).not.toMatch(
        /#[0-9a-f]{3,8}|rgb|hsl|oklch|\[color/i,
      );
    }
  });
});

/** The ground the contract states a theme's look on, in all four themes. */
describe.each(PaletteNames)('<Button> look in %s - C5-15, P15', (theme: PaletteName) => {
  const palette = Palettes[theme];
  const contrast = theme.endsWith('contrast');
  const REST = { pressed: false, busy: false, disabled: false };

  beforeEach(() => {
    mockThemeColors(theme);
    mockedFlags.mockReturnValue({ ...FLAGS, prefersMoreContrast: contrast });
  });

  test.each(BUTTON_VARIANTS)(
    '%s rests on the fill, edge and label buttonLook names',
    async (variant) => {
      await renderButton({ variant });
      const look = buttonLook(variant, REST);
      const style = styleOf();
      expect(style.backgroundColor).toBe(
        look.fill ? asCss(palette[look.fill]) : undefined,
      );
      expect(style.borderColor).toBe(
        look.edge ? asCss(palette[look.edge]) : 'transparent',
      );
      expect(classesOf(screen.getByText('Save'))).toContain(
        {
          ink: 'text-foreground',
          accentInk: 'text-accent-foreground',
          danger: 'text-danger',
          subtle: 'text-subtle',
        }[look.label],
      );
    },
  );

  test('the primary carries the edge ring: accentLine, 1.5 dp (2 dp in a contrast theme)', async () => {
    await renderButton();
    expect(styleOf()).toMatchObject({
      borderColor: asCss(palette.accentLine),
      borderWidth: contrast ? PrimaryEdgeRing.contrastWidth : PrimaryEdgeRing.width,
    });
  });

  test.each(BUTTON_VARIANTS)(
    '%s: a held press paints the pressed look at once',
    async (variant) => {
      await renderButton({ variant });
      await touchDown(node());
      const look = buttonLook(variant, { ...REST, pressed: true });
      expect(look.fill).not.toBeNull();
      expect(styleOf().backgroundColor).toBe(asCss(palette[look.fill!]));
      expect(styleOf().transform).toEqual([{ scale: 0.97 }]);
    },
  );

  test.each(BUTTON_VARIANTS)(
    '%s: only ink is placed on a pressed fill (navy on the coral press)',
    async (variant) => {
      await renderButton({ variant });
      await touchDown(node());
      const label = classesOf(screen.getByText('Save'));
      const fill = String(styleOf().backgroundColor);
      if (fill === asCss(palette.accentPress)) {
        expect(label).toContain('text-accent-foreground');
      } else {
        expect([asCss(palette.pressed), asCss(palette.surfaceSecondary)]).toContain(fill);
        expect(label).toContain('text-foreground');
      }
      for (const forbidden of [
        'text-muted',
        'text-subtle',
        'text-danger',
        'text-accent-text',
      ]) {
        expect(label).not.toContain(forbidden);
      }
    },
  );

  test('a disabled primary is flat sand with a subtle label, and shows no ring', async () => {
    await renderButton({ disabled: true });
    expect(styleOf().backgroundColor).toBe(asCss(palette.sand));
    // The ring is not drawn, but its width stays: the disabled state moves no pixel.
    expect(styleOf().borderColor).toBe('transparent');
    expect(styleOf().borderWidth).toBe(buttonEdgeWidth('primary', contrast));
    expect(classesOf(screen.getByText('Save'))).toContain('text-subtle');
  });
});

describe('<Button> press scale - C5-9', () => {
  test('is .97 while held', async () => {
    await renderButton();
    expect(styleOf().transform).toBeUndefined();
    await touchDown(node());
    expect(styleOf().transform).toEqual([{ scale: 0.97 }]);
  });

  test('keeps the fill and drops the scale under reduced motion', async () => {
    mockedFlags.mockReturnValue({ ...FLAGS, prefersLessMotion: true });
    mockThemeColors('light');
    await renderButton();
    await touchDown(node());
    expect(styleOf().transform).toBeUndefined();
    expect(styleOf().backgroundColor).toBe(asCss(Palettes.light.accentPress));
  });

  test('paints in no time: no transition, nothing to wait for', async () => {
    await renderButton();
    await touchDown(node());
    expect(styleOf()).not.toHaveProperty('transitionDuration');
  });
});

describe('<Button> busy and disabled - FR-019, data-model section 6', () => {
  test('presses when it is available', async () => {
    const onPress = jest.fn();
    await renderButton({ onPress });
    await fireEvent.press(node());
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(node().props.accessibilityState).toMatchObject({
      busy: false,
      disabled: false,
    });
  });

  test('busy is announced busy and unavailable, ignores presses and shows a spinner', async () => {
    const onPress = jest.fn();
    await renderButton({ onPress, busy: true, testID: 'save' });
    await fireEvent.press(node());
    expect(onPress).not.toHaveBeenCalled();
    expect(node().props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(screen.getByTestId('save-spinner', hidden)).toBeTruthy();
  });

  test('busy is not dimmed: the coral press stays, the work stays readable', async () => {
    mockThemeColors('light');
    await renderButton({ busy: true });
    expect(styleOf().opacity).toBeUndefined();
    expect(styleOf().backgroundColor).toBe(asCss(Palettes.light.accentPress));
    expect(String(node().props.className ?? '')).not.toContain('opacity');
  });

  test('busy keeps the label announced and visible', async () => {
    await renderButton({ busy: true });
    expect(node().props.accessibilityLabel).toBe('Save trip');
    expect(screen.getByText('Save')).toBeTruthy();
  });

  test('busy replaces the icon with the spinner', async () => {
    await renderButton({ busy: true, icon: ICON, testID: 'save' });
    expect(screen.getByTestId('save-spinner', hidden)).toBeTruthy();
    expect(screen.queryByTestId('save-icon', hidden)).toBeNull();
  });

  test('a busy button shows no pressed state: the touch is ignored', async () => {
    mockThemeColors('light');
    await renderButton({ busy: true });
    await touchDown(node());
    expect(styleOf().transform).toBeUndefined();
  });

  test('disabled ignores presses and is announced unavailable, with no spinner', async () => {
    const onPress = jest.fn();
    await renderButton({ onPress, disabled: true, testID: 'save' });
    await fireEvent.press(node());
    expect(onPress).not.toHaveBeenCalled();
    expect(node().props.accessibilityState).toMatchObject({
      busy: false,
      disabled: true,
    });
    expect(screen.queryByTestId('save-spinner', hidden)).toBeNull();
  });

  test('busy and disabled together is a development error', async () => {
    await expect(renderButton({ busy: true, disabled: true })).rejects.toThrow(
      /mutually exclusive/,
    );
  });

  test('the spinner is hidden from assistive technology: the state says it all', async () => {
    await renderButton({ busy: true, testID: 'save' });
    const spinner = screen.getByTestId('save-spinner', hidden);
    expect(spinner.props.accessibilityElementsHidden).toBe(true);
    expect(spinner.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});

describe('<Button> haptics - FR-020, D5-14', () => {
  // Today the primary press is the selection tick; T523's semantic map gives it the light
  // impact, which replaces one line (`PRESS_HAPTIC` in button.tsx).
  test.each([
    ['primary', 'selection'],
    ['destructive', 'warning'],
  ] as const)('a %s press plays %s', async (variant, kind) => {
    await renderButton({ variant });
    await fireEvent.press(node());
    expect(haptics[kind]).toHaveBeenCalledTimes(1);
    const others = (['selection', 'success', 'warning'] as const).filter(
      (k) => k !== kind,
    );
    for (const other of others) expect(haptics[other]).not.toHaveBeenCalled();
  });

  test.each(['secondary', 'tonal', 'text'] as const)(
    'a %s press plays nothing',
    async (variant) => {
      await renderButton({ variant });
      await fireEvent.press(node());
      expect(haptics.selection).not.toHaveBeenCalled();
      expect(haptics.warning).not.toHaveBeenCalled();
    },
  );

  test('a blocked press plays nothing', async () => {
    await renderButton({ disabled: true });
    await fireEvent.press(node());
    await renderButton({ busy: true, accessibilityLabel: 'Other' });
    await fireEvent.press(screen.getByLabelText('Other'));
    expect(haptics.selection).not.toHaveBeenCalled();
  });

  test('plays before the caller runs, and still runs the caller', async () => {
    const order: string[] = [];
    (haptics.selection as jest.Mock).mockImplementationOnce(() => order.push('haptic'));
    await renderButton({ onPress: () => order.push('press') });
    await fireEvent.press(node());
    expect(order).toEqual(['haptic', 'press']);
  });
});

describe('<Button> touch target and wrapping - FR-026, FR-029, C5-15', () => {
  test.each([
    ['sm', 44],
    ['md', 52],
    ['lg', 56],
  ] as const)(
    '%s asks for %i dp as a minimum, never below the platform floor',
    async (size, dp) => {
      await renderButton({ size });
      expect(styleOf().minHeight).toBe(Math.max(dp, MinTouchTarget));
      expect(styleOf().minWidth).toBeGreaterThanOrEqual(MinTouchTarget);
    },
  );

  test('lets the label wrap: no fixed height, a minimum instead', async () => {
    await renderButton();
    expect(styleOf().height).toBeUndefined();
    expect(classesOf(screen.getByText('Save'))).toEqual(
      expect.arrayContaining(['shrink', 'text-center']),
    );
  });

  test.each([1.3, 2])('grows with the text size (font scale %s)', async (fontScale) => {
    mockFontScale(fontScale);
    await renderButton();
    expect(styleOf().minHeight).toBe(Math.max(52, MinTouchTarget * fontScale));
  });

  test('its label is the callout role, and the small one the semibold label role', async () => {
    await renderButton();
    expect(classesOf(screen.getByText('Save'))).toEqual(
      expect.arrayContaining(['text-[17px]', 'leading-[22px]', 'font-display']),
    );
    await renderButton({ size: 'sm', accessibilityLabel: 'Other' });
    expect(classesOf(screen.getByText('Save'))).toEqual(
      expect.arrayContaining(['text-[14px]', 'leading-[20px]', 'font-body-semibold']),
    );
  });

  test('`capped` limits the label to 1.3 times the text size (the FAB, FR-074); otherwise it is not capped', async () => {
    await renderButton();
    expect(screen.getByText('Save').props.maxFontSizeMultiplier).toBeUndefined();
    await renderButton({ capped: true, accessibilityLabel: 'Other' });
    expect(screen.getAllByText('Save').at(-1)!.props.maxFontSizeMultiplier).toBe(1.3);
  });

  test('is a full capsule', async () => {
    await renderButton();
    expect(styleOf().borderRadius).toBeGreaterThanOrEqual(MinTouchTarget);
  });

  test('an icon-only button is a square at least as big as the floor, drawn as a circle', async () => {
    await render(<Button iconOnly icon={ICON} size="sm" accessibilityLabel="Add stop" />);
    const style = StyleSheet.flatten(screen.getByLabelText('Add stop').props.style);
    expect(style.width).toBe(style.height);
    expect(style.width).toBeGreaterThanOrEqual(MinTouchTarget);
    expect(style.borderRadius).toBeGreaterThanOrEqual(Number(style.width) / 2);
  });

  test('a caller style comes last', async () => {
    await renderButton({ style: { alignSelf: 'stretch', minHeight: 99 } });
    expect(styleOf()).toMatchObject({ alignSelf: 'stretch', minHeight: 99 });
  });

  test('passes hitSlop through', async () => {
    await renderButton({ hitSlop: 6 });
    expect(node().props.hitSlop).toBe(6);
  });

  test('takes layout classes from the caller', async () => {
    await renderButton({ className: 'self-stretch' });
    expect(classesOf(node())).toContain('self-stretch');
  });
});

describe('buttonFrame - the frame behind it', () => {
  test('is the larger of the size minimum and the scaled floor', () => {
    expect(buttonFrame('md', false, 1)).toEqual({
      minHeight: Math.max(52, MinTouchTarget),
      minWidth: MinTouchTarget,
    });
    expect(buttonFrame('sm', false, 1).minHeight).toBe(Math.max(44, MinTouchTarget));
    expect(buttonFrame('lg', false, 2).minHeight).toBe(Math.max(56, MinTouchTarget * 2));
  });

  test('never shrinks when the text is made smaller', () => {
    expect(buttonFrame('sm', false, 0.8).minHeight).toBe(Math.max(44, MinTouchTarget));
  });

  test('icon-only is a fixed square that ignores the font scale', () => {
    const one = buttonFrame('md', true, 1);
    expect(one).toEqual({
      width: Math.max(52, MinTouchTarget),
      height: Math.max(52, MinTouchTarget),
    });
    expect(buttonFrame('md', true, 2)).toEqual(one);
  });
});

describe('<Button> focus ring - FR-071, P13', () => {
  beforeEach(() => mockThemeColors('light'));

  test('draws a 2.5 dp ring 2 dp outside the control while focused, in the focus colour', async () => {
    await renderButton();
    expect(styleOf().outlineWidth).toBeUndefined();

    await fireEvent(node(), 'focus');
    expect(styleOf()).toMatchObject({
      outlineWidth: FocusRing.width,
      outlineOffset: FocusRing.offset,
      outlineColor: asCss(Palettes.light.focus),
      outlineStyle: 'solid',
    });
    expect(FocusRing).toEqual({ width: 2.5, offset: 2 });

    await fireEvent(node(), 'blur');
    expect(styleOf().outlineWidth).toBeUndefined();
  });

  test('keeps the primary edge ring and adds the focus ring outside it', async () => {
    await renderButton();
    await fireEvent(node(), 'focus');
    expect(styleOf()).toMatchObject({
      borderWidth: PrimaryEdgeRing.width,
      borderColor: asCss(Palettes.light.accentLine),
      outlineWidth: FocusRing.width,
    });
  });

  test('keeps the caller focus and blur handlers', async () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    await renderButton({ onFocus, onBlur });
    await fireEvent(node(), 'focus');
    await fireEvent(node(), 'blur');
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});

describe('<Button> cost in a list - research D4-05', () => {
  test('reads the font scale from the window and never subscribes to useAppearance', async () => {
    await renderButton();
    expect(useAppearance).not.toHaveBeenCalled();
  });

  test('asks the kit for its colours once, in one call', async () => {
    const spy = jest.spyOn(HeroUI, 'useThemeColor');
    await renderButton();
    const calls = spy.mock.calls.filter(([tokens]) => Array.isArray(tokens));
    expect(calls).toHaveLength(1);
  });
});

describe('<Button> icon - D5-07', () => {
  const TONE_TOKEN: Record<ButtonVariant, string> = {
    primary: 'accent-foreground',
    secondary: 'foreground',
    tonal: 'foreground',
    text: 'foreground',
    destructive: 'danger',
  };

  test.each(Object.entries(TONE_TOKEN) as [ButtonVariant, string][])(
    'the %s icon takes the ink that reads on its fill (%s)',
    async (variant, token) => {
      const useThemeColor = jest.spyOn(HeroUI, 'useThemeColor');
      await renderButton({ variant, icon: ICON });
      expect(useThemeColor).toHaveBeenCalledWith(token);
    },
  );

  test('the icon is the one the caller named, decorative, beside the label', async () => {
    await renderButton({ icon: ICON, testID: 'save' });
    const icon = screen.getByTestId('save-icon', hidden);
    expect(icon.props.accessible).toBe(false);
    expect(icon.props.accessibilityElementsHidden).toBe(true);
    expect(glyphsIn().map((glyph) => glyph.name)).toEqual(['plus']);
  });

  test('is 20 dp at md, 16 at sm and 24 at lg', async () => {
    for (const [size, dp] of [
      ['sm', 16],
      ['md', 20],
      ['lg', 24],
    ] as const) {
      await renderButton({ size, icon: ICON, accessibilityLabel: `b-${size}` });
      expect(glyphsIn().at(-1)?.size).toBe(dp);
    }
  });
});

describe('buttonStyle - what the host node carries', () => {
  const base = {
    frame: { minHeight: 52, minWidth: 44 },
    iconOnly: false,
    size: 'md' as const,
    variant: 'primary' as const,
    fill: '#fill',
    edge: '#edge',
    edgeWidth: 1.5,
    scale: 1,
    focusColor: '#focus',
    focused: false,
  };

  test('rests with the fill and the edge', () => {
    expect(buttonStyle(base)).toMatchObject({
      backgroundColor: '#fill',
      borderColor: '#edge',
      borderWidth: 1.5,
      minHeight: 52,
    });
  });

  test('a scale other than 1 is a transform; 1 is none', () => {
    expect(buttonStyle({ ...base, scale: 0.97 }).transform).toEqual([{ scale: 0.97 }]);
    expect(buttonStyle(base).transform).toBeUndefined();
  });

  test('no fill leaves the ground showing; no edge draws a transparent one of the same width', () => {
    const style = buttonStyle({ ...base, fill: undefined, edge: undefined });
    expect(style.backgroundColor).toBeUndefined();
    expect(style.borderColor).toBe('transparent');
    expect(style.borderWidth).toBe(1.5);
  });
});
