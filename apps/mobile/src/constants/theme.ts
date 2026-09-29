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

/**
 * The globe palette — feature 001 User Story 3, research D-30.
 *
 * A separate group from `Colors` because these tones sit on map imagery, not
 * on the canvas, and imagery has no single colour to measure against. Every
 * connection is therefore drawn over a `casing` line, and the gate
 * (test/theme/globe-contrast-gate.test.ts) measures each status colour against
 * that casing: 3:1 for a graphical object (WCAG 1.4.11), whatever lies beneath.
 * Keys match the trip statuses so a layer can index by status directly.
 */
export const GlobeColors = {
  light: {
    casing: '#FFFFFF',
    active: '#2456C7', //  6.50:1 vs casing
    planning: '#9A5B00', //  5.43:1 vs casing
    past: '#6B7482', //  4.72:1 vs casing
  },
  dark: {
    casing: '#101318',
    active: '#7FA8FF', //  7.93:1 vs casing
    planning: '#F2B45C', // 10.15:1 vs casing
    past: '#8C96A5', //  6.22:1 vs casing
  },
} as const;

/**
 * Globe geometry, in points. Status is carried by more than hue (feature 002
 * FR-010): past trips are the thinnest line, planned trips are dashed, active
 * trips are the thickest — and the one that animates carries the beacon.
 */
export const GlobeGeometry = {
  arcWidth: { past: 1.5, planning: 2.5, active: 3.5 },
  /** Casing visible on EACH side of a line. */
  casingWidth: 1.5,
  /** Dash and gap, in line widths. Round caps take one width out of each gap. */
  planningDash: [2, 2],
  markerRadius: 4,
  markerRing: 1.5,
  beaconRadius: 7,
  beaconRing: 2,
} as const;

/**
 * The basemap (research D-30): Mapbox Standard, `faded` so the connections
 * rather than the map are the subject (feature 002 FR-024), lit to follow the
 * app theme (FR-023). The URL is Mapbox's v11 Standard style; rnmapbox's own
 * `StyleURL` enum still names the v10-era styles.
 */
export const GlobeBasemap = {
  styleURL: 'mapbox://styles/mapbox/standard',
  theme: 'faded',
  lightPreset: { light: 'day', dark: 'night' },
} as const;

/** Where the globe opens: the whole sphere in view, the animated trip centred. */
export const GlobeCamera = {
  zoomLevel: 1.4,
  /** Only when nothing is placed — the home screen does not mount the map then. */
  fallbackCenter: [0, 20] as [number, number],
  /**
   * How far the one camera may travel (FR-048): from the whole sphere down to
   * the streets, where the basemap's buildings stand (FR-049).
   */
  minZoomLevel: 1,
  maxZoomLevel: 18,
  maxPitch: 60,
} as const;

/**
 * The tilt that follows the traveller in (FR-048, FR-049): none on the globe
 * and at country scale, rising through city scale so terrain and buildings
 * read as relief at street level. Applied only once the camera settles, and
 * only to a tilt the app set itself (`components/globe/camera.ts`).
 */
export const GlobePitch = {
  startZoom: 12,
  fullZoom: 16,
  max: 50,
  /** Out at the globe the camera is flattened again, whoever tilted it. */
  flattenBelowZoom: 6,
  durationMs: 600,
} as const;

/**
 * Terrain relief (FR-049): Mapbox's elevation tiles, flat from afar so the
 * globe and country scale stay uncluttered, and full relief from city scale.
 */
export const GlobeTerrain = {
  demURL: 'mapbox://mapbox.mapbox-terrain-dem-v1',
  tileSize: 512,
  /** The tileset's own maximum; the renderer overzooms beyond it. */
  maxZoomLevel: 14,
  startZoom: 9,
  fullZoom: 12,
  exaggeration: 1.2,
} as const;
