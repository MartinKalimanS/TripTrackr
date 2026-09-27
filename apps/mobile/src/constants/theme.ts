/**
 * Design tokens — the only source of visual values (feature 002, contract C1).
 *
 * Every colour, radius, depth, and spacing step used anywhere in `src/`
 * originates here. Screens and components import tokens; they never write a
 * literal, and an ESLint rule (eslint.config.js) rejects one that tries.
 */

import { Platform, StyleSheet } from 'react-native';

/**
 * The neumorphic surface ramps (feature 002, data-model §1.1–1.2).
 *
 * Every ratio in the table below was MEASURED, not chosen by eye, and is
 * re-verified on every run by test/theme/contrast-gate.test.ts. Retuning a
 * value is fine; retuning it past its floor fails the build.
 *
 * `canvas` and `surface` are deliberately identical: in neumorphism depth comes
 * entirely from the two shadows, not from a tonal step. `surfaceSunk` exists
 * only for the profiles where inset shadows are unavailable.
 *
 * The shadow tones sit at 1.16–1.52:1 against their canvas and can never reach
 * the 3:1 non-text floor. That is why `border` exists and why it is applied to
 * interactive elements only — see research R-002.
 *
 * The create-expo-app scaffold tokens (`text`, `background`, `backgroundElement`,
 * `backgroundSelected`, `textSecondary`) were removed with the template (R008):
 * every consumer now reads from the ramp, so keeping them would have been two
 * palettes for one product — the half-converted state FR-023 forbids.
 */
export const Colors = {
  light: {
    canvas: '#E3E8EF',
    surface: '#E3E8EF',
    surfaceSunk: '#DCE2EA',
    shadowLight: '#FFFFFF',
    shadowDark: '#B4BECD',
    textPrimary: '#151A21', // 14.19:1 vs canvas
    textMuted: '#4C5666', //  6.03:1 vs canvas
    border: '#767F8C', //  3.29:1 vs canvas, 3.11:1 vs surfaceSunk
    borderStrong: '#6A737F', //  3.90:1 vs canvas, 3.69:1 vs surfaceSunk
    accent: '#2456C7', //  5.28:1 vs canvas
    accentInk: '#FFFFFF', //  6.50:1 vs accent
    danger: '#B3261E', //  5.31:1 vs canvas
  },
  dark: {
    canvas: '#23272F',
    surface: '#23272F',
    surfaceSunk: '#1E222A',
    shadowLight: '#2E343E',
    shadowDark: '#171A20',
    textPrimary: '#EDF0F5', // 13.11:1 vs canvas
    textMuted: '#A3ADBC', //  6.60:1 vs canvas
    border: '#6B7482', //  3.17:1 vs canvas, 3.37:1 vs surfaceSunk
    borderStrong: '#727B89', //  3.50:1 vs canvas, 3.73:1 vs surfaceSunk
    accent: '#7FA8FF', //  6.38:1 vs canvas
    accentInk: '#101318',
    danger: '#FF897D', //  6.51:1 vs canvas
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * System font families. iOS and Android only (research D-14) — the `web`
 * branch that carried CSS variables left with the web target.
 */
export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const MaxContentWidth = 800;

/**
 * Geometry tokens (feature 002, data-model §1.3).
 *
 * `Spacing` above is reused unchanged — FR-001's "spacing steps" was already
 * satisfied by existing code, so this adds only what was missing.
 */

/** Uniform corner softness. FR-001. */
export const Radius = {
  sm: 8,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

/**
 * Exactly three depth levels, so stacking reads as a deliberate hierarchy
 * rather than accumulating arbitrarily (FR-006).
 *
 * Offsets follow the CSS sign convention: positive Y moves the shadow DOWN.
 * Confirmed against the native implementations rather than the documentation
 * page, which states the opposite — see research R-008.1.
 */
export const Depth = {
  1: { offset: 2, blur: 4 },
  2: { offset: 4, blur: 8 },
  3: { offset: 6, blur: 12 },
} as const;

export type DepthLevel = keyof typeof Depth;

/**
 * One light direction across the entire product (FR-005). Raised surfaces are
 * lit from the top-left, so the light shadow goes up-left (negative) and the
 * dark shadow down-right (positive).
 */
export const LightSource = { x: -1, y: -1 } as const;

/** Compliance border on interactive surfaces. research R-002. */
export const BorderHairline = StyleSheet.hairlineWidth;

/**
 * Brand colour for the launch experience.
 *
 * NOT part of the neumorphic ramp and deliberately exempt from the contrast
 * gate: it is the splash identity, and it MUST stay identical to the
 * `expo-splash-screen` plugin's `backgroundColor` in app.config.ts. If the two
 * drift, the launch flashes one colour and then another.
 */
export const SplashBackground = '#208AEF';

/** Platform minimum touch target, independent of visible decoration (FR-011). */
export const MinTouchTarget = Platform.select({ ios: 44, android: 48 }) ?? 44;
