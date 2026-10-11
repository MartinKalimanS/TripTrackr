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
 * The focus indicator (contract C4-3): a ring `width` dp thick, drawn `offset` dp OUTSIDE
 * the control with the surrounding neutral showing in the gap, like the UI kit's ring
 * offset. The ring therefore only ever touches a neutral fill (canvas, surface, field
 * fill), which is why the contrast gate measures it against those and not against an
 * accent fill. Removing the offset would turn that exemption into a hole, so the gate
 * asserts it stays.
 */
export const FocusRing = deepFreeze({ width: 2, offset: 2 } as const);

/**
 * A corner as a style: the radius, on the continuous (squircle) curve that matches the
 * platform's own corners. The capsule stays circular: a continuous curve on a pill reads
 * as a lopsided end.
 */
export function cornerStyle(name: AtlasRadiusName): ViewStyle {
  const borderRadius = AtlasRadius[name];
  return name === 'pill' ? { borderRadius } : { borderRadius, borderCurve: 'continuous' };
}
