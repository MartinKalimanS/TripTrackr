/**
 * Shape, spacing and lift (feature 005 contract C5-8). `Radius` (8, 16, 24, pill) and
 * `Spacing` in `constants/theme.ts` keep their values for the code that reads them
 * (`MediaFrame`, the screen scaffolds); the Sunrise adapters read `Space`, `Radii`, `Lift` and
 * `IconSize`: the data-model's `Radius` is `Radii` here because `constants/theme.ts` already
 * owns that name.
 *
 * Pure data and pure helpers.
 */
import type { BoxShadowValue, ViewStyle } from 'react-native';

import { deepFreeze, type DeepReadonly } from './freeze';
import { Palettes, type PaletteName } from './palette';

/**
 * The focus indicator (contracts C4-3 and C5-4 P13): a ring `width` dp thick (2.5 since
 * feature 005, FR-071), drawn `offset` dp OUTSIDE the control with the surrounding neutral
 * showing in the gap, like the UI kit's ring offset. The ring therefore only ever touches a
 * neutral fill (canvas, surface, field fill), which is why the contrast gate measures it
 * against those and not against an accent fill. Removing the offset would turn that
 * exemption into a hole, so the gate asserts it stays.
 */
export const FocusRing = deepFreeze({ width: 2.5, offset: 2 } as const);

/**
 * The primary control's edge ring (C5-3, D5-22 finding M-1): the coral fill is 2.82:1 on
 * white in `light` and 2.40:1 in `light-contrast`, below the 3:1 of a filled control's edge
 * (FR-069), so the control carries a ring drawn INSIDE the fill's edge, in the palette key
 * `colourKey` (`accentLine`: 4.04:1 and 7.11:1 on paper). `width` is 1.5 dp, `contrastWidth`
 * 2 dp in the contrast themes. The dark themes need none (6.74:1 and 7.95:1), but the
 * adapter draws it in every theme so a control does not change shape between themes.
 * `FILL_BELOW_FLOOR` in the contrast gate names the exception this ring compensates for.
 */
export const PrimaryEdgeRing = deepFreeze({
  width: 1.5,
  contrastWidth: 2,
  colourKey: 'accentLine',
} as const);

// ---------------------------------------------------------------------------------------
// Sunrise (feature 005, contract C5-8)
// ---------------------------------------------------------------------------------------

/** The 4 dp grid under the data-model keys (`Space[5]` is the 20 dp screen margin). */
export const Space = deepFreeze({
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
} as const);

/** The screen margin: 20 dp, and 16 dp on an Android list. */
export const ScreenMargin = deepFreeze({
  default: Space[5],
  androidList: Space[4],
} as const);

/**
 * Sunrise corner radii: 8, 12 (inputs), 16 (thumbnails, tiles), 24 (cards, hero, ticket,
 * passport), 28 (sheets) and full.
 */
export const Radii = deepFreeze({
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  sheet: 28,
  full: 999,
} as const);

export type RadiiName = keyof typeof Radii;

/** `borderCurve: 'continuous'` except the circle, which a continuous curve would lop-side. */
export function cornerOf(name: RadiiName): ViewStyle {
  const borderRadius = Radii[name];
  return name === 'full' ? { borderRadius } : { borderRadius, borderCurve: 'continuous' };
}

/** No inner corner is ever tighter than this (C5-8). */
const MIN_INNER_RADIUS = Radii.sm;

/** The inner radius of a padded child: the outer radius minus the padding, never below 8. */
export function innerRadius(outer: number, padding: number): number {
  return Math.max(outer - padding, MIN_INNER_RADIUS);
}

export type LiftName = 'lift1' | 'lift2';

/** One layer of a `boxShadow` (React Native 0.76 and later, New Architecture). */
export interface LiftLayer {
  offsetX: number;
  offsetY: number;
  blurRadius: number;
  spreadDistance: number;
  color: string;
}

type LiftSet = Record<LiftName, readonly LiftLayer[]>;

/** The navy of the light themes, taken from the palette's ink so the lift is tinted, not black. */
const NAVY = [1, 3, 5].map((index) =>
  parseInt(Palettes.light.ink.slice(index, index + 2), 16),
);

function layer(
  offsetY: number,
  blurRadius: number,
  spreadDistance: number,
  [red, green, blue]: readonly number[],
  alpha: number,
): LiftLayer {
  return {
    offsetX: 0,
    offsetY,
    blurRadius,
    spreadDistance,
    color: `rgba(${red}, ${green}, ${blue}, ${alpha})`,
  };
}

const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];

/** Light and light-contrast: a navy contact shadow and a long soft one. */
const LIGHT_LIFTS: LiftSet = {
  lift1: [layer(1, 2, 0, NAVY, 0.06), layer(8, 24, -8, NAVY, 0.14)],
  lift2: [layer(2, 6, 0, NAVY, 0.1), layer(16, 32, -8, NAVY, 0.28)],
};

/** Dark and dark-contrast: a hairline ring (a shadow cannot read on navy) and a tonal lift. */
const DARK_LIFTS: LiftSet = {
  lift1: [layer(0, 0, 1, WHITE, 0.1), layer(8, 24, -8, BLACK, 0.5)],
  lift2: [
    layer(0, 0, 1, WHITE, 0.1),
    layer(2, 6, 0, BLACK, 0.35),
    layer(16, 32, -8, BLACK, 0.6),
  ],
};

/**
 * Two lifts and nothing else: `lift1` is the card and the tile, `lift2` the floating action
 * button, the pill, the tag, the sheet and the toast. A hairline edge is always drawn with
 * a card too (the contrast themes make it explicit, P19). No other shadow exists.
 */
export const Lift: Readonly<Record<PaletteName, DeepReadonly<LiftSet>>> = deepFreeze({
  light: LIGHT_LIFTS,
  dark: DARK_LIFTS,
  'light-contrast': LIGHT_LIFTS,
  'dark-contrast': DARK_LIFTS,
});

/** The layers of a lift as `boxShadow` values: a copy, so a caller may extend it. */
export function liftOf(theme: PaletteName, name: LiftName): BoxShadowValue[] {
  return Lift[theme][name].map((shadow) => ({ ...shadow }));
}

/**
 * `boxShadow` needs the New Architecture, and an outset shadow Android 9 or later; below
 * that the adapters fall back to an elevation, in dp. Starting values (a device check).
 */
export const LiftElevation = deepFreeze({ lift1: 2, lift2: 6 } as const);

/** Icon sizes in dp; the hit area is always at least the platform minimum. */
export const IconSize = deepFreeze({ sm: 16, md: 20, lg: 24 } as const);

/** `regular` at rest, `fill` for selected and status, `duotone` for the stat tiles. */
export const IconWeights = deepFreeze(['regular', 'fill', 'duotone'] as const);

export type IconWeight = (typeof IconWeights)[number];
