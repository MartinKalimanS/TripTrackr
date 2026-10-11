/**
 * Design tokens - the colour values that code, not a class, has to hand over (feature 004,
 * contract C4-1).
 *
 * Every colour used anywhere in `src/` originates in `src/theme/palette.data.js` (the
 * Atlas palette). Screens and components import tokens or use semantic classes; they never
 * write a literal, and an ESLint rule (eslint.config.js) rejects one that tries.
 */

import { Platform, StyleSheet } from 'react-native';

import { Palettes, type Palette, type PaletteName } from '@/theme/palette';

/**
 * The colours a consumer outside the kit's classes reads, taken from one palette: the
 * navigation theme, the root and tab scenes, the canvas of `Screen` and `ListScreen`, and
 * `MediaFrame`'s edge. The authoritative values are in `src/theme/palette.ts`; nothing here
 * is authored, so nothing here can drift from the gate.
 *
 *   textPrimary <- ink     textMuted <- muted
 */
function tokensOf(palette: Palette) {
  return {
    canvas: palette.canvas,
    surface: palette.surface,
    textPrimary: palette.ink,
    textMuted: palette.muted,
    border: palette.border,
    accent: palette.accent,
    accentInk: palette.accentInk,
    danger: palette.danger,
  };
}

/**
 * One entry per theme name, increased contrast included: `useAppearance().tokens` is
 * `Colors[themeName]`, so the root stack, the navigation theme and the canvases paint the
 * same colour the kit's `--background` does in every one of the four themes, with no seam.
 */
export const Colors = {
  light: tokensOf(Palettes.light),
  dark: tokensOf(Palettes.dark),
  'light-contrast': tokensOf(Palettes['light-contrast']),
  'dark-contrast': tokensOf(Palettes['dark-contrast']),
} as const satisfies Record<PaletteName, ReturnType<typeof tokensOf>>;

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

/** Corner radii in points (`MediaFrame`). The Atlas scale for the kit's classes is `AtlasRadius`. */
export const Radius = {
  sm: 8,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

/** The thinnest line the platform draws: the tab bar's divider and the edge of a media frame. */
export const BorderHairline = StyleSheet.hairlineWidth;

/**
 * Brand colour for the launch experience.
 *
 * NOT part of the palette and deliberately exempt from the contrast gate: it is
 * the splash identity, and it MUST stay identical to the
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
  /** Where the sphere opens while nothing is placed (feature 003: the map is always mounted). */
  fallbackCenter: [0, 20] as [number, number],
  /** The flight to the first stop that appears (feature 003 FR-004). */
  flyToMs: 1200,
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
