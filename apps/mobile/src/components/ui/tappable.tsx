/**
 * `Tappable` - the bare control of Sunrise Passport (features 004 and 005; contracts C4-7
 * and C5-15; FR-019, FR-024, FR-026, FR-029, FR-063, FR-071; data-model section 6). It is
 * the bare pressable of every screen: the tab bar, the header's back button, a row's own
 * press target, a glyph that is its own control. A control with a fill and a label is a
 * `Button`.
 *
 *   <Tappable accessibilityLabel="Open trip" onPress={open} busy={saving} hitSlop={8}>
 *     ...children...
 *   </Tappable>
 *
 * It is built on React Native's `Pressable` and carries the non-visual contract every
 * control of the app shares:
 * - `accessibilityLabel` is required (a type error, and an error in development when it
 *   is empty); the role is `button`; `accessibilityState` carries `disabled` and `busy`
 *   next to anything the caller adds (`selected`, ...). `testID` and every other
 *   `Pressable` prop reach the host node.
 * - `busy` and `disabled` are mutually exclusive: both set throws in development. Either
 *   one makes the control inert (the press is ignored), and a busy control is announced
 *   busy AND unavailable, because the kit has no busy state of its own. `disabled` is
 *   dimmed with the kit's `opacity-disabled`; `busy` is not, so the work stays readable.
 * - The touch target is `MinTouchTarget` (44 dp iOS, 48 dp Android) scaled by the font
 *   scale, so a large label grows the control instead of clipping (FR-026, FR-029). It
 *   never shrinks below the minimum when the text is made smaller. A caller `style` is
 *   applied last and may override it (the header's back button has a fixed-height bar).
 * - A held press swaps to the `pressed` fill at once: no transition, so it is inside the
 *   100 ms budget (FR-019) and there is nothing for reduced motion to remove. The kit's
 *   `--surface-tertiary` is generated from the palette key `pressed` (C5-6), a SOLID tone
 *   that is a visible step (at least 1.08:1) from canvas, paper and overlay in all four
 *   themes (`test/theme/adapter-pressed-fills.test.ts` measures it). Only ink text is
 *   gated on it (P6: `ink` on `pressed`), so the content of a control that takes this fill
 *   carries ink while held; `muted` and `subtle` are not gated on it (finding M-4).
 * - The font scale comes from `useFontScale` (the window's, unless the dev gallery scopes
 *   another), not from `useAppearance`: a control repeated down a list needs nothing else from
 *   that hook, so it skips the hook's per-component colour-scheme subscription and derived
 *   object. The platform's accessibility settings are one app-wide subscription
 *   (`hooks/appearance-store.ts`), so a consumer adds no listener of its own either way
 *   (tasks.md T461).
 * - A focused control draws the focus ring of `focus-ring.ts`: 2.5 dp thick, 2 dp OUTSIDE it
 *   (an `outline`, which takes no layout space), in the `focus` token. It does not depend
 *   on the pressed appearance, and the offset keeps it off any accent fill (review rule 6).
 *
 * Colours come from the kit's theme (`useThemeColor`) and never from a literal.
 */
import { useThemeColor, type ThemeColor } from 'heroui-native';
import type { Ref } from 'react';
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native';

import { MinTouchTarget } from '@/constants/theme';
import { useFontScale } from '@/hooks/use-font-scale';
import { cornerOf } from '@/theme';

import { assertAccessibleName, assertNotBusyAndDisabled } from './adapter-guards';
import { focusRingStyle, useFocusRing } from './focus-ring';

/**
 * The kit colour a held `Tappable` paints: the palette key `pressed`. Exported so the gate
 * measures what is used.
 */
export const TAPPABLE_PRESSED_TOKEN = 'surface-tertiary' satisfies ThemeColor;

export type TappableProps = Omit<PressableProps, 'style' | 'disabled'> & {
  /** Required: what a screen reader says. */
  accessibilityLabel: string;
  /** An operation is in flight: presses are ignored, announced busy. */
  busy?: boolean;
  /** Unavailable: dimmed, announced unavailable, presses are ignored. */
  disabled?: boolean;
  /**
   * How a held press shows. `fill` (the default) is the pressed fill every control has.
   * `ring` draws the focus ring outside the control instead and paints no fill: for a
   * control around a photograph, where a fill behind an opaque thumbnail would show
   * nowhere and one over it would tint the picture (FR-033).
   */
  feedback?: TappableFeedback;
  style?: StyleProp<ViewStyle>;
  /** The native node (React 19 passes `ref` as a prop): the first-run tour measures with it. */
  ref?: Ref<View>;
};

export type TappableFeedback = 'fill' | 'ring';

export interface TappableState {
  pressed: boolean;
  focused: boolean;
  /** Default `fill`. */
  feedback?: TappableFeedback;
}

export interface TappableColors {
  fontScale: number;
  /** The fill of a held press. */
  pressedColor: string;
  /** The colour of the focus ring. */
  focusColor: string;
}

/**
 * The style of one interaction state. Exported so the mapping is asserted directly:
 * `Pressable` keeps its pressed state to itself, so the host node cannot show it.
 */
export function tappableStyle(
  { pressed, focused, feedback = 'fill' }: TappableState,
  { fontScale, pressedColor, focusColor }: TappableColors,
): ViewStyle {
  const ringed = focused || (pressed && feedback === 'ring');
  return {
    minHeight: MinTouchTarget * Math.max(1, fontScale),
    minWidth: MinTouchTarget,
    justifyContent: 'center',
    ...cornerOf('md'),
    ...(pressed && feedback === 'fill' ? { backgroundColor: pressedColor } : {}),
    ...(ringed ? focusRingStyle(focusColor) : {}),
  };
}

export function Tappable({
  accessibilityLabel,
  accessibilityState,
  busy = false,
  disabled = false,
  onPress,
  onFocus,
  onBlur,
  feedback,
  style,
  className,
  ...rest
}: TappableProps) {
  assertAccessibleName('Tappable', accessibilityLabel);
  assertNotBusyAndDisabled('Tappable', busy, disabled);

  const fontScale = useFontScale();
  const focus = useFocusRing(onFocus, onBlur);
  const pressedColor = useThemeColor(TAPPABLE_PRESSED_TOKEN);
  const focusColor = useThemeColor('focus');
  const inert = busy || disabled;
  const classes = [disabled ? 'opacity-disabled' : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ ...accessibilityState, disabled: inert, busy }}
      disabled={inert}
      onPress={inert ? undefined : onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      className={classes || undefined}
      style={({ pressed }) => [
        tappableStyle(
          { pressed, focused: focus.focused, feedback },
          { fontScale, pressedColor, focusColor },
        ),
        style,
      ]}
      {...rest}
    />
  );
}
