/**
 * `Tappable` - the bare control of Atlas (feature 004; contract C4-7; FR-019, FR-024,
 * FR-026, FR-029; data-model section 6). It replaces `PressableSurface` `bare` for every
 * migrated screen: the tab bar, the header's back button, a row's own press target, a
 * glyph that is its own control. A control with a fill and a label is a `Button`.
 *
 *   <Tappable accessibilityLabel="Open trip" onPress={open} busy={saving} hitSlop={8}>
 *     ...children...
 *   </Tappable>
 *
 * It is built on React Native's `Pressable` and keeps the non-visual contract of the
 * retired `PressableSurface`:
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
 * - A held press swaps to a pressed fill at once: no transition, so it is inside the
 *   100 ms budget (FR-019) and there is nothing for reduced motion to remove. The fill is
 *   the kit's `separator-secondary` (the surface pulled 15% toward the ink), a SOLID tone
 *   that is a visible step (at least 1.08:1) from canvas, surface and overlay in all four
 *   themes and keeps ink, muted and accent text at 4.5:1 (7:1 in the contrast themes).
 *   `surface-tertiary` is not used: in the dark themes it IS the overlay colour, so a press
 *   on a menu or sheet would show nothing. `test/theme/adapter-pressed-fills.test.ts`
 *   measures it.
 * - The font scale comes from `useWindowDimensions`, not from `useAppearance`: that hook
 *   subscribes to the platform's accessibility settings once per consumer, and a control
 *   repeated down a list must not pay for that (tasks.md T461).
 * - A focused control draws a ring `FocusRing.width` thick, `FocusRing.offset` OUTSIDE it
 *   (an `outline`, which takes no layout space), in the `focus` token. It does not depend
 *   on the pressed appearance, and the offset keeps it off any accent fill (review rule 6).
 *
 * Colours come from the kit's theme (`useThemeColor`) and never from a literal.
 */
import { useThemeColor, type ThemeColor } from 'heroui-native';
import { useState } from 'react';
import {
  Pressable,
  useWindowDimensions,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { MinTouchTarget } from '@/constants/theme';
import { FocusRing, cornerStyle } from '@/theme';

import { assertAccessibleName, assertNotBusyAndDisabled } from './adapter-guards';

/** The kit colour a held `Tappable` paints. Exported so the gate measures what is used. */
export const TAPPABLE_PRESSED_TOKEN = 'separator-secondary' satisfies ThemeColor;

export type TappableProps = Omit<PressableProps, 'style' | 'disabled'> & {
  /** Required: what a screen reader says. */
  accessibilityLabel: string;
  /** An operation is in flight: presses are ignored, announced busy. */
  busy?: boolean;
  /** Unavailable: dimmed, announced unavailable, presses are ignored. */
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export interface TappableState {
  pressed: boolean;
  focused: boolean;
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
  { pressed, focused }: TappableState,
  { fontScale, pressedColor, focusColor }: TappableColors,
): ViewStyle {
  return {
    minHeight: MinTouchTarget * Math.max(1, fontScale),
    minWidth: MinTouchTarget,
    justifyContent: 'center',
    ...cornerStyle('md'),
    ...(pressed ? { backgroundColor: pressedColor } : {}),
    ...(focused
      ? {
          outlineWidth: FocusRing.width,
          outlineOffset: FocusRing.offset,
          outlineColor: focusColor,
          outlineStyle: 'solid' as const,
        }
      : {}),
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
  style,
  className,
  ...rest
}: TappableProps) {
  assertAccessibleName('Tappable', accessibilityLabel);
  assertNotBusyAndDisabled('Tappable', busy, disabled);

  const { fontScale } = useWindowDimensions();
  const [focused, setFocused] = useState(false);
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
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      className={classes || undefined}
      style={({ pressed }) => [
        tappableStyle({ pressed, focused }, { fontScale, pressedColor, focusColor }),
        style,
      ]}
      {...rest}
    />
  );
}
