/**
 * T417 - contract C4-7 (`Button`), FR-005, FR-019, FR-020, FR-026, FR-029, review rules
 * 2 and 5.
 *
 * Jest renders the kit's Button as a plain Pressable that forwards every prop
 * (test/mocks/heroui-native.tsx), so what is asserted is the adapter's accessibility
 * contract on the host node and what it ASKS of the kit (variant, size, classes). Real
 * styling is not asserted; `test/ui-kit/real-render.test.tsx` covers the kit itself.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as HeroUI from 'heroui-native';
import { Dimensions, StyleSheet } from 'react-native';

import { MinTouchTarget } from '@/constants/theme';
import { useAppearance } from '@/hooks/use-appearance';
import type { Haptics } from '@/hooks/use-haptics';
import { Motion } from '@/theme';

import { Button, PRESSED_CLASS, buttonFrame, type ButtonVariant } from './button';

// The adapter reads the font scale from the window, not from `useAppearance` (see
// tappable.tsx); `useHaptics` is replaced wholesale, so it cannot reach the real hook.
jest.mock('@/hooks/use-appearance', () => ({ useAppearance: jest.fn() }));
jest.mock('@/hooks/use-haptics');

const { useHaptics } = jest.requireMock('@/hooks/use-haptics') as {
  useHaptics: jest.Mock<Haptics, []>;
};
const haptics: Haptics = { selection: jest.fn(), success: jest.fn(), warning: jest.fn() };

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
  useHaptics.mockReturnValue(haptics);
});
afterEach(() => jest.restoreAllMocks());

const ICON = 'plus';
const hidden = { includeHiddenElements: true };
const node = () => screen.getByLabelText('Save trip');
const classesOf = (element: { props: { className?: unknown } }) =>
  String(element.props.className ?? '').split(/\s+/);
const styleOf = () =>
  StyleSheet.flatten(node().props.style) as Record<string, number | undefined>;

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
    expect(screen.getByLabelText('Add stop').props.isIconOnly).toBe(true);
    expect(screen.getByTestId('add-icon', hidden)).toBeTruthy();
    expect(screen.queryByText('Add stop')).toBeNull();
  });
});

describe('<Button> emphasis - FR-005, C4-7 mapping', () => {
  const KIT: Record<ButtonVariant, string> = {
    primary: 'primary',
    secondary: 'secondary',
    text: 'ghost',
    destructive: 'danger-soft',
  };

  test.each(Object.entries(KIT) as [ButtonVariant, string][])(
    '%s asks the kit for %s',
    async (variant, kitVariant) => {
      await renderButton({ variant });
      expect(node().props.variant).toBe(kitVariant);
    },
  );

  test('is primary unless told otherwise', async () => {
    await renderButton();
    expect(node().props.variant).toBe('primary');
  });

  test.each(['sm', 'md', 'lg'] as const)(
    'passes the %s size to the kit',
    async (size) => {
      await renderButton({ size });
      expect(node().props.size).toBe(size);
    },
  );

  test('is md unless told otherwise', async () => {
    await renderButton();
    expect(node().props.size).toBe('md');
  });

  test('writes no colour literal into its classes (C4-1)', async () => {
    for (const variant of Object.keys(KIT)) {
      await renderButton({ variant, testID: variant, accessibilityLabel: variant });
      expect(String(screen.getByTestId(variant).props.className)).not.toMatch(
        /#[0-9a-f]{3,8}|rgb|hsl|oklch|\[color/i,
      );
    }
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
    expect(node().props.isDisabled).toBe(true);
    expect(screen.getByTestId('save-spinner', hidden)).toBeTruthy();
  });

  test('busy is not dimmed to the disabled opacity: it cancels the kit disabled: class', async () => {
    await renderButton({ busy: true });
    const classes = classesOf(node());
    expect(classes).toContain('disabled:opacity-100');
    await renderButton({ disabled: true, accessibilityLabel: 'Other' });
    expect(classesOf(screen.getByLabelText('Other'))).not.toContain(
      'disabled:opacity-100',
    );
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

  test('disabled ignores presses and is announced unavailable, with no spinner', async () => {
    const onPress = jest.fn();
    await renderButton({ onPress, disabled: true, testID: 'save' });
    await fireEvent.press(node());
    expect(onPress).not.toHaveBeenCalled();
    expect(node().props.accessibilityState).toMatchObject({
      busy: false,
      disabled: true,
    });
    expect(node().props.isDisabled).toBe(true);
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

describe('<Button> haptics - FR-020', () => {
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

  test.each(['secondary', 'text'] as const)(
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

describe('<Button> touch target and wrapping - FR-026, FR-029', () => {
  test('md and lg keep the kit height as a minimum and never go below the floor', async () => {
    for (const size of ['md', 'lg'] as const) {
      await renderButton({ size, testID: size, accessibilityLabel: size });
      const style = StyleSheet.flatten(screen.getByTestId(size).props.style);
      expect(style.minHeight).toBe(size === 'md' ? 48 : 56);
      expect(style.minWidth).toBeGreaterThanOrEqual(MinTouchTarget);
    }
  });

  test('sm is raised to the platform floor, not left at the kit 40 dp', async () => {
    await renderButton({ size: 'sm' });
    expect(styleOf().minHeight).toBeGreaterThanOrEqual(MinTouchTarget);
    expect(styleOf().minHeight).toBe(Math.max(40, MinTouchTarget));
  });

  test('lets the label wrap: no fixed height, a minimum instead', async () => {
    await renderButton();
    expect(classesOf(node())).toContain('h-auto');
    expect(styleOf().height).toBeUndefined();
    expect(classesOf(screen.getByText('Save'))).toEqual(
      expect.arrayContaining(['shrink', 'text-center']),
    );
  });

  test('grows with the text size', async () => {
    mockFontScale(2);
    await renderButton();
    expect(styleOf().minHeight).toBe(Math.max(48, MinTouchTarget * 2));
  });

  test('an icon-only button is a square at least as big as the floor', async () => {
    await render(<Button iconOnly icon={ICON} size="sm" accessibilityLabel="Add stop" />);
    const style = StyleSheet.flatten(screen.getByLabelText('Add stop').props.style);
    expect(style.width).toBe(style.height);
    expect(style.width).toBeGreaterThanOrEqual(MinTouchTarget);
    expect(classesOf(screen.getByLabelText('Add stop'))).not.toContain('h-auto');
  });

  test('a caller style comes last', async () => {
    await renderButton({ style: { alignSelf: 'stretch', minHeight: 99 } });
    expect(styleOf()).toMatchObject({ alignSelf: 'stretch', minHeight: 99 });
  });

  test('passes hitSlop through', async () => {
    await renderButton({ hitSlop: 6 });
    expect(node().props.hitSlop).toBe(6);
  });
});

describe('buttonFrame - the frame behind it', () => {
  test('is the larger of the kit height and the scaled floor', () => {
    expect(buttonFrame('md', false, 1)).toEqual({
      minHeight: Math.max(48, MinTouchTarget),
      minWidth: MinTouchTarget,
    });
    expect(buttonFrame('sm', false, 1).minHeight).toBe(Math.max(40, MinTouchTarget));
    expect(buttonFrame('lg', false, 2).minHeight).toBe(Math.max(56, MinTouchTarget * 2));
  });

  test('never shrinks when the text is made smaller', () => {
    expect(buttonFrame('sm', false, 0.8).minHeight).toBe(Math.max(40, MinTouchTarget));
  });

  test('icon-only is a fixed square that ignores the font scale', () => {
    const one = buttonFrame('md', true, 1);
    expect(one).toEqual({
      width: Math.max(48, MinTouchTarget),
      height: Math.max(48, MinTouchTarget),
    });
    expect(buttonFrame('md', true, 2)).toEqual(one);
  });
});

describe('<Button> pressed state and kit animation - FR-019, FR-022, review rule 5', () => {
  test('turns the kit highlight off: it is a 20% soft fill under the text', async () => {
    for (const variant of ['primary', 'secondary', 'text', 'destructive'] as const) {
      await renderButton({ variant, testID: variant, accessibilityLabel: variant });
      expect(screen.getByTestId(variant).props.animation).toMatchObject({
        highlight: false,
      });
    }
  });

  // T460: the kit's press scale defaults to a 300 ms timing, so the movement it starts at
  // touch-down used to finish (and, on release, return) after FR-022's 200 ms and the
  // 100 ms press budget of the motion tokens. The scale stays (movement only, and the
  // provider removes it for reduced motion); only its duration is the press budget.
  test('keeps the kit press scale but finishes it within the press budget (FR-019, FR-022)', async () => {
    for (const variant of ['primary', 'secondary', 'text', 'destructive'] as const) {
      await renderButton({ variant, testID: variant, accessibilityLabel: variant });
      expect(screen.getByTestId(variant).props.animation).toEqual({
        highlight: false,
        scale: { timingConfig: { duration: Motion.pressMs } },
      });
    }
    expect(Motion.pressMs).toBeLessThanOrEqual(100);
  });

  test('replaces it with a discrete pressed fill, measured in adapter-pressed-fills', async () => {
    // The classes are pinned here; that each is a visible step from the resting fill and
    // keeps the label readable in all four themes is test/theme/adapter-pressed-fills.test.ts.
    const PRESSED: Record<ButtonVariant, string> = {
      primary: 'active:bg-accent-hover',
      secondary: 'active:bg-separator-secondary',
      text: 'active:bg-separator-secondary',
      destructive: 'active:bg-danger/5',
    };
    expect(PRESSED_CLASS).toEqual(PRESSED);
    for (const [variant, expected] of Object.entries(PRESSED)) {
      await renderButton({ variant, testID: variant, accessibilityLabel: variant });
      expect(classesOf(screen.getByTestId(variant))).toContain(expected);
    }
  });

  test('never asks for a soft-hover fill', async () => {
    await renderButton({ variant: 'destructive' });
    expect(String(node().props.className)).not.toMatch(/soft-hover|danger-soft|\/20/);
  });

  test('never pulls in the neutral that vanishes on a dark overlay', async () => {
    for (const variant of ['primary', 'secondary', 'text', 'destructive'] as const) {
      expect(PRESSED_CLASS[variant]).not.toContain('surface-tertiary');
    }
  });
});

describe('<Button> cost in a list - research D4-05', () => {
  test('reads the font scale from the window and never subscribes to useAppearance', async () => {
    await renderButton();
    expect(useAppearance).not.toHaveBeenCalled();
  });
});

describe('<Button> icon - D4-08', () => {
  const TONE_TOKEN: Record<ButtonVariant, string> = {
    primary: 'accent-foreground',
    secondary: 'accent-text',
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

  test('the icon is decorative, beside the label', async () => {
    await renderButton({ icon: ICON, testID: 'save' });
    const icon = screen.getByTestId('save-icon', hidden);
    expect(icon.props.accessible).toBe(false);
    expect(icon.props.accessibilityElementsHidden).toBe(true);
  });
});
