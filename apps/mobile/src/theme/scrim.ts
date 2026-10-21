/**
 * Scrims, sky and the passport card as data — feature 005 contract C5-10, research D5-10.
 *
 * The only gradient VALUES of the app live here, as numbers and colour stops. The one
 * consumer that turns them into pixels is `components/ui/scrim.tsx` (an ESLint rule rejects
 * a gradient string anywhere else, C5-1), and the contrast gate measures every stop that
 * sits under text over a PURE WHITE photograph (`test/theme/contrast-gate.test.ts`, P8,
 * P10, P23), so a stop cannot be retuned without the gate seeing it.
 *
 * Pure data and pure helpers.
 */
import { blend } from './contrast';
import { deepFreeze } from './freeze';
import { Palettes } from './palette';

/** One stop of a scrim: its position along the box (0 to 1) and its opacity. */
export interface ScrimStop {
  at: number;
  alpha: number;
}

export interface ScrimSpec {
  /** The scrim colour (`#RRGGBB`); the opacity varies along the box. */
  rgb: string;
  /** The status-bar zone: `alpha` held to `holdTo` (a fraction), then to 0. A 120 dp box. */
  top: { alpha: number; holdTo: number; height: number };
  /** The bottom scrim over a photograph, from 0 to its darkest stop. */
  bottom: readonly ScrimStop[];
  /**
   * The caption scrim (deterministic): a ramp of `rampHeight` dp from 0 to `rampTo`, then a
   * solid block that wraps the text from `rampTo` to `blockTo`, so the opacity under ANY
   * text line is at least `minUnderText` at every text scale.
   */
  caption: { rampHeight: number; rampTo: number; blockTo: number; minUnderText: number };
}

/** The base scrims, and the increased-contrast ones (darker, so white text clears 7:1). */
export const Scrim = deepFreeze({
  base: {
    rgb: '#081A30',
    top: { alpha: 0.68, holdTo: 0.44, height: 120 },
    bottom: [
      { at: 0, alpha: 0 },
      { at: 0.25, alpha: 0.38 },
      { at: 0.55, alpha: 0.66 },
      { at: 1, alpha: 0.88 },
    ],
    caption: { rampHeight: 48, rampTo: 0.66, blockTo: 0.88, minUnderText: 0.64 },
  },
  contrast: {
    rgb: '#061222',
    top: { alpha: 0.8, holdTo: 0.44, height: 120 },
    bottom: [
      { at: 0, alpha: 0 },
      { at: 0.25, alpha: 0.5 },
      { at: 0.55, alpha: 0.78 },
      { at: 1, alpha: 0.94 },
    ],
    caption: { rampHeight: 48, rampTo: 0.78, blockTo: 0.94, minUnderText: 0.78 },
  },
} satisfies Record<'base' | 'contrast', ScrimSpec>);

/** The scrims for a theme: the contrast ones in `light-contrast` and `dark-contrast`. */
export function scrimSpec(contrast: boolean): ScrimSpec {
  return contrast ? Scrim.contrast : Scrim.base;
}

/** `#RRGGBB` and an opacity (0 to 1) as `#RRGGBBAA`, upper case. */
export function withAlpha(rgb: string, alpha: number): string {
  if (!/^#[0-9A-Fa-f]{6}$/.test(rgb)) {
    throw new Error(`Expected a #RRGGBB colour, received "${rgb}".`);
  }
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
    throw new RangeError(`Expected an alpha between 0 and 1, received ${alpha}.`);
  }
  const byte = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0');
  return `${rgb}${byte}`.toUpperCase();
}

/** A colour stop of an opaque linear gradient: its position (0 to 1) and `#RRGGBB`. */
export interface GradientStop {
  at: number;
  colour: string;
}

/** A soft radial wash: an alpha-faded ellipse over a gradient, centred in box fractions. */
export interface Glow {
  colour: string;
  /** Opacity at the centre. */
  alpha: number;
  /** Centre as fractions of the box width and height (a centre outside 0..1 is allowed). */
  centre: readonly [number, number];
  /** Radii as fractions of the box width and height. */
  radius: readonly [number, number];
  /** The fraction of the radius at which the wash has faded to nothing. */
  fadeAt: number;
}

export interface SkySpec {
  /** A 180 degree linear gradient, top to bottom. */
  stops: readonly GradientStop[];
  glows: readonly Glow[];
}

/**
 * The sky behind the Home globe and the Welcome backdrop. Text over it is `ink` or
 * `muted`; `accentText` appears on it at display size only (M-7). The contrast themes
 * keep the base sky: their text colours carry the extra contrast.
 */
export const Sky = deepFreeze({
  light: {
    stops: [
      { at: 0, colour: '#FFF1DF' },
      { at: 0.2, colour: '#FFE6D0' },
      { at: 0.56, colour: '#D7F0F6' },
      { at: 1, colour: '#EEF9FC' },
    ],
    glows: [
      {
        colour: '#FFB547',
        alpha: 0.46,
        centre: [0.92, -0.08],
        radius: [1.2, 0.7],
        fadeAt: 0.62,
      },
    ],
  },
  dark: {
    stops: [
      { at: 0, colour: '#0A1626' },
      { at: 0.4, colour: '#0B1D36' },
      { at: 0.72, colour: '#0C2442' },
      { at: 1, colour: '#0F2037' },
    ],
    glows: [
      {
        colour: '#FF8C6E',
        alpha: 0.1,
        centre: [0.94, -0.1],
        radius: [1.1, 0.6],
        fadeAt: 0.6,
      },
      {
        colour: '#35C9D6',
        alpha: 0.12,
        centre: [0.08, 0.38],
        radius: [0.9, 0.6],
        fadeAt: 0.62,
      },
    ],
  },
} satisfies Record<'light' | 'dark', SkySpec>);

/**
 * The passport card: a 135 degree gradient from the first cover's two stops, a faint amber
 * glow in its top right corner, and a secondary white at `base` opacity (fully opaque in the
 * contrast themes). White text is 14.57:1 and 9.51:1 on the stops.
 */
export const Passport = deepFreeze({
  stops: [Palettes.light.cover1Start, Palettes.light.cover1End] as const,
  angle: 135,
  glow: {
    colour: '#FFB547',
    alpha: 0.2,
    centre: [1, 0],
    radius: [0.7, 0.9],
    fadeAt: 0.62,
  } satisfies Glow,
  secondaryAlpha: { base: 0.78, contrast: 1 },
});

/**
 * The amber corner of a GENERATED TRIP COVER (prototype `.cover-gen::after`: an ellipse of 85% by
 * 95% of the box at its top right, 62% amber fading to nothing at 62% of its radius). Stronger
 * than the passport's (the pictures `trips-nocover` and `trip-nocover` show about 55% in the
 * corner). It sits away from the caption, whose block is opaque enough under the text; the gate
 * measures white text on the cover's two stops (P9).
 */
export const CoverGlow = deepFreeze({
  colour: '#FFB547',
  alpha: 0.62,
  centre: [1, 0],
  radius: [0.85, 0.95],
  fadeAt: 0.62,
} satisfies Glow);

function clamp(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/**
 * The colour of an opaque linear gradient at position `at` (0 to 1, clamped), mixing the
 * two stops that bracket it in sRGB: the colour a glow sits over at its centre.
 */
export function colourAt(stops: readonly GradientStop[], at: number): string {
  const position = clamp(at);
  const upper = stops.findIndex((stop) => stop.at >= position);
  if (upper === -1) return stops[stops.length - 1].colour;
  if (upper === 0) return stops[0].colour;
  const from = stops[upper - 1];
  const to = stops[upper];
  const span = to.at - from.at;
  return blend(to.colour, from.colour, span === 0 ? 1 : (position - from.at) / span);
}
