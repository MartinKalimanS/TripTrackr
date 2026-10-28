/**
 * Design tokens - the colour values that code, not a class, has to hand over (feature 004,
 * contract C4-1).
 *
 * Every colour used anywhere in `src/` originates in `src/theme/palette.data.js` (the
 * Sunrise Passport palette, feature 005). Screens and components import tokens or use
 * semantic classes; they never write a literal, and an ESLint rule (eslint.config.js)
 * rejects one that tries.
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

/** Corner radii in points (`MediaFrame`). The Sunrise scale is `Radii`. */
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
 * The globe palette — feature 001 User Story 3, research D-30; the Sunrise values and
 * stops of feature 005 contract C5-11.
 *
 * A separate group from `Colors` because these tones sit on map imagery, not
 * on the canvas, and imagery has no single colour to measure against. Every
 * connection is therefore drawn over a `casing` line, and the gate
 * (test/theme/globe-contrast-gate.test.ts; class P22 of the palette gate) measures each arc
 * stop against that casing: 3:1 for a graphical object (WCAG 1.4.11), whatever lies
 * beneath. A country keyline is measured against both land colours instead.
 * Keys match the trip statuses so a layer can index by status directly; `*End` is the
 * far stop of the gradient arc.
 *
 * Past and active share a hue in the light theme (and a start stop in both): they are told
 * apart by width (`GlobeGeometry.arcWidth`), by the pulse and by the live pin, never by
 * colour alone. `active` and `planning` equal the palette's `statusActive` and
 * `statusPlanning` (the palette test asserts it), so a status reads the same on a card and
 * on the globe. The prototype's bright light arc ends (#FF9A45, #FFB547) are 2.11:1 and
 * 1.76:1 on white (finding M-3), so light ends at the amber line; dark keeps bright ends
 * because its casing is dark. The visited fill is a fill only (1.37:1 on light land): the
 * keyline carries the meaning. The rest of the globe's look (the sea, the atmosphere, the
 * graticule, the callout card) is `GlobeStyle` below.
 */
export const GlobeColors = {
  light: {
    casing: '#FFFFFF',
    active: '#E04A33', // 4.04:1 vs casing
    activeEnd: '#B86E00', // 3.99:1
    planning: '#B86E00', // 3.99:1
    past: '#E04A33', // 4.04:1
    pastEnd: '#B86E00', // 3.99:1
    // The middle of the prototype's two-stop tint (#FFCFBF to #FFB29B).
    visitedFill: '#FFC0AD',
    visitedKeyline: '#E04A33', // 3.64:1 vs land, 3.37:1 vs the shaded land
    plannedKeyline: '#B86E00', // 3.59:1 vs land
    // The middle of the prototype's land gradient (#FFFCF5 to #F6E9D2): the picture's cream.
    land: '#FBF2E3',
    landShade: '#F6E9D2',
  },
  dark: {
    casing: '#101318',
    // Contract C5-11 had #FFA08C here; equal to the palette's dark `statusActive`
    // (`accentLine`) so the status reads the same on a card and on the globe.
    active: '#FF8266',
    activeEnd: '#FFE0A0',
    planning: '#FFC25E',
    past: '#FF8266',
    pastEnd: '#FFC25E',
    visitedFill: '#FFA48E',
    visitedKeyline: '#FFC4B4',
    plannedKeyline: '#FFE3A8',
    land: '#3C6E99',
    landShade: '#2A557E',
  },
} as const;

/**
 * The Sunrise globe's own look beyond the connections — feature 005, contract C5-11,
 * research D5-04 and D5-22 (T532).
 *
 * The basemap colours are the configuration of Mapbox Standard (`basemap-config.ts`: the
 * land is `GlobeColors.land`, the rest is here); `atmosphere` is the fog and sky of the
 * `Atmosphere` layer, opaque on purpose (an alpha below 1 on `color` loads more tiles) and
 * without stars; `graticule` is the faint grid over the planet, a colour and the opacity it
 * is drawn at (decoration, so the gate asks only that it shows over the sea and is never a
 * mark that could carry meaning); `visitedCasing` is the solid stroke under each country
 * keyline (the prototype's white edge by day, a navy one by night) at `visitedCasingOpacity`
 * (a number, so no alpha is written into a colour Mapbox may parse differently); `callout` is
 * the white card of the live trip, navy on white in BOTH themes as in the prototype (so it
 * does not follow the adaptive text tones); `pin` is the roundel's ring and the cluster disc
 * (the prototype's `--ring`, `--ink` and `--on-ink`: navy on white by day, a light disc by night).
 * These are STARTING values, tuned over day and night on a device (V2, T508); every one is
 * measured in `test/theme/globe-contrast-gate.test.ts`, and the greeting text that sits over
 * the atmosphere is measured against it in all four palettes.
 *
 * `greenspace` and `adminBoundaries` start at the land shade and `sand` of the palette, as
 * C5-11 says (the "soft sage" of D5-04 is a V2 retune). Keys follow the lighting of the
 * basemap (`GlobeBasemap.lightPreset`), as `GlobeColors` does.
 */
export const GlobeStyle = {
  light: {
    // Mapbox paints ONE flat sea colour; the prototype's sphere runs #DDF3FA (highlight) to
    // #2E9CC4 (limb), so this is the part of that ramp most of the disc shows in the picture.
    water: '#74C6E4',
    greenspace: '#F6E9D2',
    // The prototype's rgba(205,176,130,.55) hairline, flattened over the cream land.
    adminBoundaries: '#DCC7A4',
    graticule: '#FFFFFF',
    graticuleOpacity: 0.34,
    // The halo is the prototype's (rgba(96,196,236,.62) at the rim to rgba(190,233,247,.16)),
    // flattened over the sky and lightened to keep the greeting readable (gate); space is
    // fully transparent (Mapbox: "opacity 0 is a transparent background") so the sky shows.
    atmosphere: {
      color: '#9ADCF3',
      highColor: '#BCE8F5',
      spaceColor: '#FFE6D000',
      horizonBlend: 0.24,
      starIntensity: 0,
    },
    visitedCasing: '#FFFFFF',
    visitedCasingOpacity: 0.9,
    callout: {
      surface: '#FFFFFF',
      title: '#0E2A47',
      detail: '#4A5B6E',
      liveDot: '#E04A33',
    },
    pin: { ring: '#FFFFFF', clusterFill: '#0E2A47', clusterLabel: '#FFFFFF' },
  },
  dark: {
    // The prototype's night sphere runs #2C74AE to #08224A: this is where most of it sits.
    water: '#143F72',
    greenspace: '#2A557E',
    // The prototype's rgba(170,215,245,.20) hairline, flattened over the blue land.
    adminBoundaries: '#4F7BA3',
    graticule: '#AAD7FF',
    graticuleOpacity: 0.11,
    // The prototype's teal halo, darkened until the greeting (muted, 7:1 in the contrast
    // theme) reads on it: the gate, not the picture, caps its brightness.
    atmosphere: {
      color: '#134760',
      highColor: '#0F3A52',
      spaceColor: '#0A162600',
      horizonBlend: 0.2,
      starIntensity: 0,
    },
    visitedCasing: '#0A1626',
    visitedCasingOpacity: 0.55,
    callout: {
      surface: '#F4F7FB',
      title: '#0E2A47',
      detail: '#4A5B6E',
      liveDot: '#E04A33',
    },
    pin: { ring: '#F4F7FB', clusterFill: '#F4F7FB', clusterLabel: '#0A1626' },
  },
} as const;

/** The two lightings of the globe: `GlobeColors`, `GlobeStyle` and `GlobeBasemap` are keyed by it. */
export type GlobeScheme = keyof typeof GlobeColors;

/**
 * What the style layers are made of, in both themes (T532): the tileset the country layers
 * read, the widths and dashes, the graticule's step and the zoom it fades out over.
 *
 * `countries` is Mapbox Countries v1, a free tileset (source layer `country_boundaries`;
 * `iso_3166_1` is the alpha-2 code; `worldview` is `all` or a comma-separated list of the
 * audiences `AR CN IN JP MA RU TR US`). Every layer on it carries a worldview filter, `US`
 * here, so a disputed area is not drawn twice. `worldScaleZoom` is where the basemap's
 * point-of-interest, transit and road labels come on: below it the whole planet is in view.
 */
export const GlobeLayers = {
  countries: {
    url: 'mapbox://mapbox.country-boundaries-v1',
    sourceLayer: 'country_boundaries',
    isoField: 'iso_3166_1',
    worldview: 'US',
    keylineWidth: 1.5,
    plannedKeylineWidth: 2,
    /** Dp the casing under a keyline is wider than the keyline (the prototype's 1.6). */
    casingExtra: 1.6,
    /** Dash and gap, in line widths. */
    plannedDash: [3, 2],
  },
  graticule: {
    /** Degrees between lines; must divide 90. The prototype's `d3.geoGraticule10`. */
    step: 10,
    width: 0.8,
    /** Fully drawn up to the first zoom, gone from the second. */
    fadeStartZoom: 3,
    fadeEndZoom: 4,
  },
  worldScaleZoom: 5,
  /**
   * The pins (T533, FR-011; F1 pins). A pin is a photo roundel: a bitmap baked from a hidden
   * laid-out view with `react-native-view-shot` and drawn by a `SymbolLayer` (a trip with no
   * photograph is drawn as its generated cover). `roundelsEnabled` is the one switch back to
   * plain dots: set it to `false` and nothing is laid out, captured or registered. A pin
   * whose capture fails stays a dot, and dots beyond `roundelLimit` cluster into an ink disc
   * with a count; at most `captureBatch` badges are laid out at once, so sixty photographs
   * are not decoded together.
   *
   * Sizes are dp: the roundel of the live trip is the largest, a planned one smaller, a past
   * one smallest (the prototype's 56, 44 and 40; `clusterSize` is its 40). The white ring is
   * `roundelRing` wide (the `ring` of the palette, `lift2` under it). The status ring is
   * `statusRing` wide and sits `statusRingOutset` dp outside the roundel's edge (the
   * prototype's `inset: -8px` and `-7px` from the padding box, less the 2 dp border). A
   * planned ring is dashed, solid on Android, where a dashed border on a circle is not
   * reliable. `shadowPad` is the transparent margin a bitmap keeps for the lift.
   */
  pins: {
    roundelsEnabled: true as boolean,
    roundelLimit: 60,
    captureBatch: 12,
    dotRadius: { past: 5, planning: 6, active: 8 },
    dotRing: 2,
    roundelSize: { past: 40, planning: 44, active: 56 },
    clusterSize: 40,
    roundelRing: 2,
    statusRing: 2.5,
    statusRingOutset: { active: 6, planning: 5 },
    shadowPad: 24,
    /** Dots this close (px) join one disc, and stop joining from `maxZoom` in. */
    cluster: { radius: 44, maxZoom: 5, textSize: 14 },
    /** The symbol is a little smaller while the whole planet is in view. */
    iconSize: { farZoom: 1, farScale: 0.8, nearZoom: 5, nearScale: 1 },
  },
  /**
   * The callout of the live trip (T533, FR-011): a white card, 220 dp at most, 12 dp inside
   * the sides of the screen, `gap` from the pin; `ringSize` is the pin's width (the dot's
   * ring, or the active roundel, whose own status ring is baked into its bitmap). The pulse
   * of a roundel is `roundelPulse` wide, the outer edge of that baked ring (56 + 2 x 6).
   * The card is never narrowed below `minWidth`.
   */
  callout: {
    maxWidth: 220,
    minWidth: 96,
    margin: 12,
    verticalMargin: 6,
    gap: 14,
    arrow: 12,
    ringSize: { dot: 32, roundel: 56 },
    roundelPulse: 68,
    ringWidth: 2.5,
    pulseWidth: 2,
    /** The live dot's soft ring: the prototype's `0 0 0 2px rgba(224,74,51,.22)`. */
    dotHalo: 2,
    dotHaloAlpha: 0.22,
    /** The prototype's still pulse under reduced motion. */
    stillScale: 1.25,
    stillOpacity: 0.28,
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
