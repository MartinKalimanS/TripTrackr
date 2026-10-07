/**
 * Interactive surface primitive — contract C9.
 *
 * State changes are DISCRETE token swaps, never interpolated (research R-004).
 * That choice pays for itself three times: it lands inside the 100 ms budget
 * with the whole budget unspent (SC-005), it avoids producing new style objects
 * per frame on list-heavy screens (SC-006), and it makes reduced-motion support
 * free (FR-015) — there is no transition to suppress.
 */
import { useState } from 'react';
import { Pressable, type PressableProps, type ViewStyle } from 'react-native';

import { Colors, MinTouchTarget, type DepthLevel, type Radius } from '@/constants/theme';
import { useAppearance } from '@/hooks/use-appearance';
import {
  surfaceStyle,
  type SurfaceOptions,
  type SurfaceTreatment,
} from '@/theme/surfaces';

/**
 * Resting treatments a control may have. `recessed` is the "currently
 * selected" affordance — a tab or segment pressed into its bar — and is the
 * one addition to contract C9's original `raised | flat` (R009, D-17): the tab
 * bar needs a selected state that is still an interactive surface, and faking
 * it with a static `<Surface>` around a flat control would have lost the
 * compliance border and the touch-target guarantee.
 */
export type RestingTreatment = Extract<SurfaceTreatment, 'raised' | 'flat' | 'recessed'>;

export type PressableSurfaceProps = Omit<PressableProps, 'style' | 'disabled'> & {
  treatment?: RestingTreatment;
  depth?: DepthLevel;
  radius?: keyof typeof Radius;
  /** An operation is in flight. Rejects input, announced as in-progress. */
  busy?: boolean;
  /** Unavailable. Flat, inert, announced unavailable. */
  disabled?: boolean;
  /** Required: a soft low-contrast control with no label is the worst case. */
  accessibilityLabel: string;
  /**
   * The control is only its glyph (feature 003, the tab bar): no resting fill,
   * border or shadow, so it blends into what it sits on. The compliance border
   * of FR-009 is then the caller's to replace with something else that is
   * visible — an icon and label at text contrast, a selection mark — and the
   * rest of the contract holds: touch target (FR-011), focus ring (FR-012),
   * discrete press feedback (FR-018), busy and disabled. `treatment` and
   * `depth` are ignored.
   */
  bare?: boolean;
  style?: ViewStyle;
};

/** Focus ring thickness. Deliberately thicker than the hairline compliance border. */
const FocusRingWidth = 2;

/**
 * Resolve the treatment for the current interaction state (data-model §5).
 *
 * Exported so the state machine can be asserted directly: React Native's
 * Pressable owns its pressed state internally and does not expose it through
 * the host node, so testing the mapping is both possible and more precise than
 * trying to observe it through a simulated gesture.
 */
export function treatmentFor(
  resting: RestingTreatment,
  { pressed, busy, disabled }: { pressed: boolean; busy: boolean; disabled: boolean },
): SurfaceTreatment {
  if (disabled) return 'disabled';
  if (busy) return 'busy';
  if (pressed) return 'pressed';
  return resting;
}

/**
 * The recipe behind `bare`: the corner a press fills, the busy/disabled
 * dimming every surface shares, and a sunken fill while held. Nothing at rest.
 * Exported, like `treatmentFor`, so it is asserted directly: Pressable's pressed
 * state is not observable through the host node.
 */
export function bareStyle(
  treatment: SurfaceTreatment,
  options: Pick<SurfaceOptions, 'theme' | 'profile' | 'radius'>,
): ViewStyle {
  const { borderRadius, opacity } = surfaceStyle(treatment, {
    ...options,
    interactive: false,
  });
  return {
    borderRadius,
    ...(opacity === undefined ? {} : { opacity }),
    ...(treatment === 'pressed'
      ? { backgroundColor: Colors[options.theme].surfaceSunk }
      : {}),
  };
}

export function PressableSurface({
  treatment = 'raised',
  depth = 1,
  radius = 'md',
  busy = false,
  disabled = false,
  bare = false,
  accessibilityLabel,
  style,
  onPress,
  ...rest
}: PressableSurfaceProps) {
  const { theme, elevationProfile, fontScale } = useAppearance();
  const [focused, setFocused] = useState(false);

  if (__DEV__ && busy && disabled) {
    throw new Error(
      'PressableSurface: `busy` and `disabled` are mutually exclusive (data-model §5). ' +
        'A control cannot be both working and unavailable.',
    );
  }

  const inert = busy || disabled;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, busy }}
      disabled={inert}
      onPress={inert ? undefined : onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      hitSlop={0}
      style={({ pressed }) => [
        bare
          ? bareStyle(treatmentFor(treatment, { pressed, busy, disabled }), {
              theme,
              profile: elevationProfile,
              radius,
            })
          : surfaceStyle(treatmentFor(treatment, { pressed, busy, disabled }), {
              theme,
              profile: elevationProfile,
              depth,
              radius,
              interactive: true,
            }),
        // FR-011 — the touch target never shrinks to fit the decoration.
        // FR-016 — and it grows with the traveller's text size rather than
        // clipping the label inside a fixed box.
        {
          minHeight: MinTouchTarget * fontScale,
          minWidth: MinTouchTarget,
          justifyContent: 'center',
        },
        // FR-012 — a focus indicator independent of the press depth.
        focused && {
          borderWidth: FocusRingWidth,
          borderColor: Colors[theme].accent,
        },
        style,
      ]}
      {...rest}
    />
  );
}
