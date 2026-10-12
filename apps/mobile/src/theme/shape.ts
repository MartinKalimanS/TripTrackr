/**
 * Atlas shape and spacing — contract C4-6, data-model section 3.
 *
 * These are separate names on purpose. `Radius` (8, 16, 24, pill) and `Spacing` in
 * `constants/theme.ts` keep their values for the code that reads them (`MediaFrame`, the
 * screen scaffolds); the Atlas components read `AtlasRadius` and `AtlasSpacing`.
 *
 * Pure data and pure helpers.
 */
import type { ViewStyle } from 'react-native';

import { deepFreeze } from './freeze';

/** Corner radii. Continuous curve everywhere except the capsule. */
export const AtlasRadius = deepFreeze({
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const);

export type AtlasRadiusName = keyof typeof AtlasRadius;

/**
 * The legacy 2, 4, 8, 16, 24, 32, 64 steps, unchanged and under the same names, plus 12
 * and 48. The legacy names are ordinals, not pixel values (`three` is 16), so the two new
 * steps are named by their value: `twelve` and `fortyEight`.
 */
export const AtlasSpacing = deepFreeze({
  half: 2,
  one: 4,
  two: 8,
  twelve: 12,
  three: 16,
  four: 24,
  five: 32,
  fortyEight: 48,
  six: 64,
} as const);

export type AtlasSpacingName = keyof typeof AtlasSpacing;

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

/**
 * A corner as a style: the radius, on the continuous (squircle) curve that matches the
 * platform's own corners. The capsule stays circular: a continuous curve on a pill reads
 * as a lopsided end.
 */
export function cornerStyle(name: AtlasRadiusName): ViewStyle {
  const borderRadius = AtlasRadius[name];
  return name === 'pill' ? { borderRadius } : { borderRadius, borderCurve: 'continuous' };
}
