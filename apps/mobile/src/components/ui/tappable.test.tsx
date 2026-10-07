/**
 * T417 - contract C4-7 (`Tappable`), FR-019, FR-024, FR-026, FR-029, data-model section 6.
 *
 * `Tappable` is the bare control of Atlas: no fill, no border, only a pressed fill, a
 * focus ring and the guarantees every control makes. Pressable owns its pressed state, so
 * the state-to-style mapping is asserted through the exported pure function, as the
 * retired `PressableSurface` suite did; the rest is asserted on the host node.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useThemeColor } from 'heroui-native';
import { StyleSheet, Text } from 'react-native';

import { Colors, MinTouchTarget } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';
import { FocusRing } from '@/theme';

import { Tappable, tappableStyle } from './tappable';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

function mockAppearance(overrides: Partial<AppearanceContext> = {}) {
  useAppearance.mockReturnValue({
    theme: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    elevationProfile: 'flat',
    tokens: Colors.light,
    ...overrides,
  } as AppearanceContext);
}

beforeEach(() => mockAppearance());

/** The style the host node carries now, flattened. */
const styleNow = () =>
  StyleSheet.flatten(screen.getByLabelText('Open trip').props.style) as Record<
    string,
    unknown
  >;

const renderTappable = (props: Record<string, unknown> = {}) =>
  render(
    <Tappable accessibilityLabel="Open trip" onPress={jest.fn()} {...props}>
      <Text>Open</Text>
    </Tappable>,
  );

describe('<Tappable> identity - contract C4-6 rule 4', () => {
  test('is a button with the given name', async () => {
    await renderTappable();
    const node = screen.getByLabelText('Open trip');
    expect(node.props.accessibilityRole).toBe('button');
    expect(node.props.accessible).not.toBe(false);
  });

  test('forwards testID to the pressable node', async () => {
    await renderTappable({ testID: 'open-trip' });
    expect(screen.getByTestId('open-trip').props.accessibilityLabel).toBe('Open trip');
  });

  test('refuses to render without an accessible name (runtime, development)', async () => {
    await expect(
      render(
        // @ts-expect-error - the label is required by the type as well
        <Tappable onPress={jest.fn()}>
          <Text>Open</Text>
        </Tappable>,
      ),
    ).rejects.toThrow(/accessibilityLabel/);
    await expect(renderTappable({ accessibilityLabel: '  ' })).rejects.toThrow(
      /accessibilityLabel/,
    );
  });

  test('passes hint and the rest of the accessibility props through', async () => {
    await renderTappable({
      accessibilityHint: 'Shows the stops',
      accessibilityActions: [{ name: 'activate' }],
    });
    const node = screen.getByLabelText('Open trip');
    expect(node.props.accessibilityHint).toBe('Shows the stops');
    expect(node.props.accessibilityActions).toEqual([{ name: 'activate' }]);
  });

  test('keeps the caller state (selected) beside disabled and busy', async () => {
    await renderTappable({ accessibilityState: { selected: true } });
    expect(screen.getByLabelText('Open trip').props.accessibilityState).toMatchObject({
      selected: true,
      disabled: false,
      busy: false,
    });
  });

  test('passes hitSlop through', async () => {
    await renderTappable({ hitSlop: 8 });
    expect(screen.getByLabelText('Open trip').props.hitSlop).toBe(8);
  });
});

describe('<Tappable> busy and disabled - FR-019, data-model section 6', () => {
  test('presses when it is available', async () => {
    const onPress = jest.fn();
    await renderTappable({ onPress });
    await fireEvent.press(screen.getByLabelText('Open trip'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('busy ignores presses and is announced busy and unavailable', async () => {
    const onPress = jest.fn();
    await renderTappable({ onPress, busy: true });
    const node = screen.getByLabelText('Open trip');
    await fireEvent.press(node);
    expect(onPress).not.toHaveBeenCalled();
    expect(node.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });

  test('disabled ignores presses, is announced unavailable and is dimmed', async () => {
    const onPress = jest.fn();
    await renderTappable({ onPress, disabled: true });
    const node = screen.getByLabelText('Open trip');
    await fireEvent.press(node);
    expect(onPress).not.toHaveBeenCalled();
    expect(node.props.accessibilityState).toMatchObject({ busy: false, disabled: true });
    expect(node.props.className).toContain('opacity-disabled');
  });

  test('busy is not dimmed: the work in progress stays readable', async () => {
    await renderTappable({ busy: true });
    expect(
      String(screen.getByLabelText('Open trip').props.className ?? ''),
    ).not.toContain('opacity-disabled');
  });

  test('busy and disabled together is a development error', async () => {
    await expect(renderTappable({ busy: true, disabled: true })).rejects.toThrow(
      /mutually exclusive/,
    );
  });
});

describe('<Tappable> touch target - FR-026, FR-029', () => {
  test('is never smaller than the platform minimum', async () => {
    await renderTappable();
    expect(styleNow().minHeight).toBeGreaterThanOrEqual(MinTouchTarget);
    expect(styleNow().minWidth).toBeGreaterThanOrEqual(MinTouchTarget);
  });

  test('grows with the text size instead of clipping the label', async () => {
    mockAppearance({ fontScale: 2 });
    await renderTappable();
    expect(styleNow().minHeight).toBe(MinTouchTarget * 2);
  });

  test('a caller style may override the minimum (a fixed-height header)', async () => {
    mockAppearance({ fontScale: 2 });
    await renderTappable({ style: { minHeight: MinTouchTarget } });
    expect(styleNow().minHeight).toBe(MinTouchTarget);
  });
});

describe('<Tappable> focus ring - FR-024, design-tokens C4-3', () => {
  const focusColor = useThemeColor('focus');

  test('draws a 2 dp ring 2 dp outside the control while focused, and drops it on blur', async () => {
    await renderTappable();
    const node = screen.getByLabelText('Open trip');
    expect(styleNow().outlineWidth).toBeUndefined();

    await fireEvent(node, 'focus');
    expect(styleNow()).toMatchObject({
      outlineWidth: FocusRing.width,
      outlineOffset: FocusRing.offset,
      outlineColor: focusColor,
      outlineStyle: 'solid',
    });

    await fireEvent(node, 'blur');
    expect(styleNow().outlineWidth).toBeUndefined();
  });

  test('keeps the caller focus and blur handlers', async () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    await renderTappable({ onFocus, onBlur });
    const node = screen.getByLabelText('Open trip');
    await fireEvent(node, 'focus');
    await fireEvent(node, 'blur');
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  test('the ring uses the focus token, never a literal colour', async () => {
    await renderTappable();
    await fireEvent(screen.getByLabelText('Open trip'), 'focus');
    expect(styleNow().outlineColor).toBe(focusColor);
  });
});

describe('tappableStyle - FR-019, discrete states', () => {
  const options = { fontScale: 1, pressedColor: 'pressed', focusColor: 'focus' };
  const rest = { pressed: false, focused: false };

  test('rests with no fill and no ring, in a continuous corner so a press has a shape', () => {
    const style = tappableStyle(rest, options);
    expect(style.backgroundColor).toBeUndefined();
    expect(style.outlineWidth).toBeUndefined();
    expect(style.borderCurve).toBe('continuous');
    expect(style.borderRadius).toBeGreaterThan(0);
  });

  test('a held press swaps to the pressed fill at once, with no transition', () => {
    const style = tappableStyle({ ...rest, pressed: true }, options);
    expect(style.backgroundColor).toBe('pressed');
    expect(style).not.toHaveProperty('transitionDuration');
    expect(style).not.toHaveProperty('transform');
  });

  test('the focus ring does not depend on the pressed appearance', () => {
    const focusedOnly = tappableStyle({ pressed: false, focused: true }, options);
    const both = tappableStyle({ pressed: true, focused: true }, options);
    for (const style of [focusedOnly, both]) {
      expect(style).toMatchObject({
        outlineWidth: FocusRing.width,
        outlineOffset: FocusRing.offset,
        outlineColor: 'focus',
      });
    }
  });

  test('the target scales with the font scale and never below the minimum', () => {
    expect(tappableStyle(rest, { ...options, fontScale: 1 }).minHeight).toBe(
      MinTouchTarget,
    );
    expect(tappableStyle(rest, { ...options, fontScale: 2 }).minHeight).toBe(
      MinTouchTarget * 2,
    );
    expect(tappableStyle(rest, { ...options, fontScale: 0.8 }).minHeight).toBe(
      MinTouchTarget,
    );
  });
});
