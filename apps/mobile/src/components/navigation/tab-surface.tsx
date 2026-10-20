/**
 * `TabSurface` and `tabSurface()` - what the tab pill is made of (feature 005, research
 * D5-05, contract C5-21; FR-022, FR-072, FR-073; Q-10).
 *
 * One pure function chooses, for every combination of its inputs:
 *
 * - `glass`: iOS 26 or later, the glass API present, transparency not reduced, a base theme.
 *   A `GlassView` from `expo-glass-effect` (https://docs.expo.dev/versions/v57.0.0/sdk/glass-effect.md).
 * - `blur`: any other iPhone, with the same three conditions. A `BlurView` from `expo-blur`
 *   (https://docs.expo.dev/versions/v57.0.0/sdk/blur-view.md) under a `surface` tint at 84
 *   percent, with the hairline and the second lift.
 * - `solid`: Android (a blur there needs a `BlurTargetView` around the map, which would be
 *   re-blurred every frame while the globe moves), reduced transparency, and the increased
 *   contrast themes: an OPAQUE `surface` with the hairline (explicit in the contrast themes)
 *   and the second lift. Opaque by construction (FR-072, FR-073, SC-008).
 *
 * `isLiquidGlassAvailable()` only says the app was built with the Liquid Glass design: it
 * may be true while the traveller has limited the effect, hence the reduced-transparency
 * input, and some iOS 26 betas lack the API and crash, hence `isGlassEffectAPIAvailable()`
 * (both are read from the module's documentation; the stand-in under Jest answers `false`).
 *
 * Opacity is NEVER set on the glass or on anything above it: `GlassView` renders nothing
 * under an opacity of 0 (expo/expo#41024). Nothing here animates anything.
 *
 * Whether the real glass renders, adapts to what is behind it and keeps the labels legible
 * on a bright sky is device check V4 (tasks T510); the glass draws no hairline and no lift
 * of its own, which is a one-line change if the device wants them.
 */
import { BlurView } from 'expo-blur';
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { liftStyle } from '@/components/ui/lift-style';
import { useColors } from '@/components/ui/theme-tokens';
import { useAppearance } from '@/hooks/use-appearance';
import { Radii, withAlpha, type PaletteName } from '@/theme';

export type TabSurfaceKind = 'glass' | 'blur' | 'solid';

export interface TabSurfaceFlags {
  /** `Platform.OS`. */
  os: string;
  /** The glass design and its runtime API are both there (iOS 26 or later). */
  liquidGlass: boolean;
  /** The traveller asked for reduced transparency (iOS). */
  reduceTransparency: boolean;
  /** The increased-contrast themes. */
  increasedContrast: boolean;
}

/** The decision of D5-05, pure. */
export function tabSurface({
  os,
  liquidGlass,
  reduceTransparency,
  increasedContrast,
}: TabSurfaceFlags): TabSurfaceKind {
  if (os !== 'ios' || reduceTransparency || increasedContrast) return 'solid';
  return liquidGlass ? 'glass' : 'blur';
}

/** The opacity of the `surface` tint over the blur (C5-21: 84 percent). */
const TINT_OPACITY = 0.84;
/** 1 to 100; a starting value, a device check (V4). */
const BLUR_INTENSITY = 60;

const COLOR_KEYS = ['surface', 'hairline'] as const;

export interface TabSurfaceProps {
  children?: ReactNode;
  /** The pill's layout (padding, gap, minimum height), applied last. */
  style?: StyleProp<ViewStyle>;
}

const SHAPE: ViewStyle = { borderRadius: Radii.full };

/** The hairline and the second lift of every surface that is not glass. */
function edge(hairline: string, theme: PaletteName): ViewStyle {
  return {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: hairline,
    ...liftStyle(theme, 'lift2'),
  };
}

export function TabSurface({ children, style }: TabSurfaceProps) {
  const { theme, themeName, prefersLessTransparency, prefersMoreContrast } =
    useAppearance();
  const colors = useColors(COLOR_KEYS);
  const kind = tabSurface({
    os: Platform.OS,
    liquidGlass: isLiquidGlassAvailable() && isGlassEffectAPIAvailable(),
    reduceTransparency: prefersLessTransparency,
    increasedContrast: prefersMoreContrast,
  });

  if (kind === 'glass') {
    return (
      <GlassView
        testID="tab-surface-glass"
        glassEffectStyle="regular"
        colorScheme={theme}
        style={[SHAPE, style]}>
        {children}
      </GlassView>
    );
  }
  const ring = edge(colors.hairline, themeName);
  if (kind === 'blur') {
    return (
      <BlurView
        testID="tab-surface-blur"
        intensity={BLUR_INTENSITY}
        tint={theme}
        style={[SHAPE, ring, styles.clip, style]}>
        <View
          testID="tab-surface-tint"
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: withAlpha(colors.surface, TINT_OPACITY) },
          ]}
        />
        {children}
      </BlurView>
    );
  }
  return (
    <View
      testID="tab-surface-solid"
      style={[SHAPE, ring, { backgroundColor: colors.surface }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
