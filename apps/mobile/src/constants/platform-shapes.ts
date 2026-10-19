/**
 * The shapes the two platforms draw differently (feature 005, research D5-21, contracts C5-21
 * and C5-22; FR-028): Android gets its own where the platform has one, rather than wearing
 * iOS's. One table, read by the Home sheet, the Trips button and every area button, so none
 * of them writes the numbers again.
 *
 * - The sheet's handle (the grabber): 36 by 5 dp on iOS, 32 by 4 dp on Android, in a 28 dp
 *   zone with a 96 by 48 dp hit area on both (48 dp is Android's minimum target).
 * - The extended action button: a pill 52 dp tall on iOS, a rounded square of radius 16 and
 *   56 dp on Android; collapsed to its icon it is a 56 dp square with the same corner.
 *
 * Heights are MINIMUMS: a button grows with the text size. Pure data and two pure choosers
 * over `Platform.OS`, which a caller passes so a test can ask for either platform.
 */
import { Radii } from '@/theme';

interface HandleShape {
  width: number;
  height: number;
  radius: number;
}

export const SheetHandle = {
  ios: { width: 36, height: 5, radius: 3 } satisfies HandleShape,
  android: { width: 32, height: 4, radius: 2 } satisfies HandleShape,
  /** The zone the handle sits in, from the sheet's top edge. */
  zone: 28,
  /** The area that takes the drag, centred on the handle. */
  hitWidth: 96,
  hitHeight: 48,
} as const;

/** The handle of `os`: Android's own, else iOS's. */
export function sheetHandleOf(os: string): HandleShape {
  return os === 'android' ? SheetHandle.android : SheetHandle.ios;
}

export const FabShape = {
  ios: { minHeight: 52, borderRadius: Radii.full },
  android: { minHeight: 56, borderRadius: Radii.lg },
  /** The collapsed (icon only) button, a square on both platforms. */
  mini: 56,
} as const;

export interface FabStyle {
  minHeight: number;
  minWidth?: number;
  borderRadius: number;
}

/** The size and corner of the extended action button on `os`, or of its collapsed form. */
export function fabShapeOf(os: string, collapsed = false): FabStyle {
  const shape = os === 'android' ? FabShape.android : FabShape.ios;
  return collapsed
    ? {
        minHeight: FabShape.mini,
        minWidth: FabShape.mini,
        borderRadius: shape.borderRadius,
      }
    : { ...shape };
}
