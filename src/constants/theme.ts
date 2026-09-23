/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

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
 */
export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',

    // --- neumorphic ramp -------------------------------------------------
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
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',

    // --- neumorphic ramp -------------------------------------------------
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
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
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

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
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
 * Brand colours for the launch experience.
 *
 * These are NOT part of the neumorphic ramp and are deliberately exempt from the
 * contrast gate: they are the splash identity, and `SplashBackground` MUST stay
 * identical to `expo.plugins["expo-splash-screen"].backgroundColor` in app.json.
 * If the two drift, the launch flashes one colour and then another.
 */
export const SplashBackground = '#208AEF';
export const SplashGradient = 'linear-gradient(180deg, #3C9FFE, #0274DF)';

/** Platform minimum touch target, independent of visible decoration (FR-011). */
export const MinTouchTarget = Platform.select({ ios: 44, android: 48 }) ?? 44;
