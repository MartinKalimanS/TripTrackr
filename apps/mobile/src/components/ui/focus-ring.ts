/**
 * The focus ring of a control (feature 005, T519; design-tokens C5-4 P13; FR-071), shared
 * by `Tappable`, `Button`, the icon buttons and the chips so the ring cannot drift.
 *
 * It is 2.5 dp wide and drawn 2 dp OUTSIDE the control (`FocusRing`), as an `outline`,
 * which takes no layout space, in the `focus` colour: the neutral that shows in the gap
 * between a control and its ring is what makes the ring readable over a coral or an ink
 * fill (review rule 6), and the gate measures `focus` against canvas, paper and cream.
 */
import { useState } from 'react';
import type { PressableProps, ViewStyle } from 'react-native';

import { FocusRing } from '@/theme';

export function focusRingStyle(color: string): ViewStyle {
  return {
    outlineWidth: FocusRing.width,
    outlineOffset: FocusRing.offset,
    outlineColor: color,
    outlineStyle: 'solid',
  };
}

export interface FocusHandlers {
  focused: boolean;
  onFocus: NonNullable<PressableProps['onFocus']>;
  onBlur: NonNullable<PressableProps['onBlur']>;
}

/** Tracks focus for a control and still calls the caller's own handlers. */
export function useFocusRing(
  onFocus?: PressableProps['onFocus'],
  onBlur?: PressableProps['onBlur'],
): FocusHandlers {
  const [focused, setFocused] = useState(false);
  return {
    focused,
    onFocus: (event) => {
      setFocused(true);
      onFocus?.(event);
    },
    onBlur: (event) => {
      setFocused(false);
      onBlur?.(event);
    },
  };
}
