/**
 * T417 and T519 - contracts C4-7 and C5-15 (`Tappable`), FR-019, FR-024, FR-026, FR-029,
 * FR-063, FR-071, data-model section 6.
 *
 * `Tappable` is the bare control of Sunrise Passport: no fill, no border, only the `pressed`
 * fill (the one palette key only ink text sits on), the focus ring (2.5 dp, 2 dp off) and
 * the guarantees every control makes. Pressable owns its pressed state, so
 * the state-to-style mapping is asserted through the exported pure function; the rest is
 * asserted on the host node.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as HeroUI from 'heroui-native';
import { Dimensions, StyleSheet, Text } from 'react-native';

import { MinTouchTarget } from '@/constants/theme';
import { useAppearance } from '@/hooks/use-appearance';
import { FocusRing, PaletteNames, Palettes, contrastRatio } from '@/theme';

import { asCss, mockThemeColors } from '../../../test/helpers/theme-colors';
import { touchDown } from '../../../test/helpers/touch';
import { TAPPABLE_PRESSED_TOKEN, Tappable, tappableStyle } from './tappable';

// The adapter reads the font scale from the window, not from `useAppearance`: a control
// repeated down a list needs nothing else from that hook, so it skips the hook's
// per-component colour-scheme subscription (research D4-05; tasks.md T461).
jest.mock('@/hooks/use-appearance', () => ({ useAppearance: jest.fn() }));

/** Sets the window font scale `useWindowDimensions` reports. */
function mockFontScale(fontScale: number) {
  jest.spyOn(Dimensions, 'get').mockReturnValue({
    width: 390,
    height: 844,
    scale: 3,
    fontScale,
  });
}

beforeEach(() => mockFontScale(1));
afterEach(() => jest.restoreAllMocks());

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
    mockFontScale(2);
    await renderTappable();
    expect(styleNow().minHeight).toBe(MinTouchTarget * 2);
  });

  test('a caller style may override the minimum (a fixed-height header)', async () => {
    mockFontScale(2);
    await renderTappable({ style: { minHeight: MinTouchTarget } });
    expect(styleNow().minHeight).toBe(MinTouchTarget);
  });
});

describe('<Tappable> cost in a list - research D4-05', () => {
  test('reads the font scale from the window and never subscribes to useAppearance', async () => {
    await renderTappable();
    expect(useAppearance).not.toHaveBeenCalled();
  });

  test('follows a change of the window font scale', async () => {
    mockFontScale(1.5);
    await renderTappable();
    expect(styleNow().minHeight).toBe(MinTouchTarget * 1.5);
  });

  test('asks the theme for its pressed fill: one that is visible on every ground', async () => {
    const spy = jest.spyOn(HeroUI, 'useThemeColor');
    await renderTappable();
    // The kit's `--surface-tertiary` is generated from the palette key `pressed` (C5-6).
    expect(TAPPABLE_PRESSED_TOKEN).toBe('surface-tertiary');
    expect(spy).toHaveBeenCalledWith(TAPPABLE_PRESSED_TOKEN);
    expect(spy).toHaveBeenCalledWith('focus');
  });
});

describe('<Tappable> focus ring - FR-071, design-tokens C5-4 P13', () => {
  const focusColor = HeroUI.useThemeColor('focus');

  test('draws a 2.5 dp ring 2 dp outside the control while focused, and drops it on blur', async () => {
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

/**
 * T460 - FR-019 and SC-005: a visual response within 100 ms of touch-down. The pure
 * function above says WHAT a held press looks like; these say WHEN: the responder is
 * granted, no timer is advanced, nothing is released, and the host node already carries
 * the pressed look. `fireEvent.press` cannot show that, because it never enters the state.
 */
describe('<Tappable> touch-down - FR-019, SC-005', () => {
  const pressedColor = HeroUI.useThemeColor(TAPPABLE_PRESSED_TOKEN);
  const host = () => screen.getByLabelText('Open trip');

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('paints the pressed fill as the finger lands, before release and with no timer run', async () => {
    await renderTappable();
    expect(styleNow().backgroundColor).toBeUndefined();

    await touchDown(host());

    expect(styleNow().backgroundColor).toBe(pressedColor);
    expect(styleNow().outlineWidth).toBeUndefined();
  });

  test('a touch-down is not a press: the action waits for the release', async () => {
    const onPress = jest.fn();
    await renderTappable({ onPress });
    await touchDown(host());
    expect(onPress).not.toHaveBeenCalled();
  });

  test('feedback "ring" shows the ring and no fill as the finger lands', async () => {
    await renderTappable({ feedback: 'ring' });
    await touchDown(host());
    expect(styleNow()).toMatchObject({
      outlineWidth: FocusRing.width,
      outlineOffset: FocusRing.offset,
    });
    expect(styleNow().backgroundColor).toBeUndefined();
  });

  test.each([['busy'], ['disabled']])(
    'a %s control shows no pressed state: the touch is ignored',
    async (state) => {
      await renderTappable({ [state]: true });
      await touchDown(host());
      expect(styleNow().backgroundColor).toBeUndefined();
    },
  );
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

/**
 * T442 - `feedback="ring"`: a control over a photograph shows its held press as the focus
 * ring drawn outside it, because a fill behind an opaque thumbnail would show nowhere and
 * one over it would be a tint across the picture (FR-033, 002 C12). Additive: the default
 * is the fill every other control has.
 */
describe('tappableStyle - feedback "ring" for a control over a photograph (FR-019, FR-033)', () => {
  const options = { fontScale: 1, pressedColor: 'pressed', focusColor: 'focus' };
  const ring = { outlineWidth: FocusRing.width, outlineOffset: FocusRing.offset };

  test('a held press draws the focus ring outside the control and paints no fill', () => {
    const style = tappableStyle(
      { pressed: true, focused: false, feedback: 'ring' },
      options,
    );
    expect(style).toMatchObject({ ...ring, outlineColor: 'focus' });
    expect(style.backgroundColor).toBeUndefined();
  });

  test('at rest it draws neither a ring nor a fill, and focus still draws the ring', () => {
    const rest = tappableStyle(
      { pressed: false, focused: false, feedback: 'ring' },
      options,
    );
    expect(rest.outlineWidth).toBeUndefined();
    expect(rest.backgroundColor).toBeUndefined();

    const focused = tappableStyle(
      { pressed: false, focused: true, feedback: 'ring' },
      options,
    );
    expect(focused).toMatchObject(ring);
  });

  test('"fill" is the default: a held press paints the fill and no ring', () => {
    for (const feedback of [undefined, 'fill' as const]) {
      const style = tappableStyle({ pressed: true, focused: false, feedback }, options);
      expect(style.backgroundColor).toBe('pressed');
      expect(style.outlineWidth).toBeUndefined();
    }
  });

  test('the component takes the option and does not hand it to the host node', async () => {
    await renderTappable({ feedback: 'ring' });
    expect(screen.getByLabelText('Open trip').props.feedback).toBeUndefined();
    await fireEvent(screen.getByLabelText('Open trip'), 'focus');
    expect(styleNow().outlineWidth).toBe(FocusRing.width);
  });
});

describe.each(PaletteNames)(
  '<Tappable> in %s - the pressed fill is the pressed key',
  (theme) => {
    beforeEach(() => {
      mockThemeColors(theme);
      jest.useFakeTimers();
    });
    afterEach(() => jest.useRealTimers());

    test('a held press paints Palettes.pressed, and the focus ring is Palettes.focus', async () => {
      await renderTappable();
      await touchDown(screen.getByLabelText('Open trip'));
      expect(styleNow().backgroundColor).toBe(asCss(Palettes[theme].pressed));
      await fireEvent(screen.getByLabelText('Open trip'), 'focus');
      expect(styleNow().outlineColor).toBe(asCss(Palettes[theme].focus));
    });

    test('only ink text is measured on it, and ink reads on it', () => {
      const floor = theme.endsWith('contrast') ? 7 : 4.5;
      expect(
        contrastRatio(Palettes[theme].ink, Palettes[theme].pressed),
      ).toBeGreaterThanOrEqual(floor);
    });
  },
);
