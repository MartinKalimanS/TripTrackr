/**
 * The arithmetic of the Home sheet (feature 005, T534; data-model section 7; contract C5-22;
 * FR-012, FR-013; research D5-03): its three heights, the detent a release settles on, the
 * rubber band beyond the ends and the order the handle steps through.
 *
 * Pure and free of React, so it is tested without a renderer and so the gesture code can call
 * it from the UI thread. The two functions the pan calls while a finger is down or lifting,
 * `settleTarget` and `rubberBand`, carry the `'worklet'` directive: Reanimated's plugin turns
 * them into functions that run on the UI thread, and a function without it cannot be called
 * from one. The heights and the rest are for the JS thread (layout, tests, the camera fit).
 *
 * Heights are the VISIBLE height of the sheet above the bottom edge of the screen, in dp,
 * and whole numbers: a fractional dp height is how a persistent sheet ends up with a hit area
 * a pixel off (research D5-03, the gorhom reports).
 */

export type SheetDetent = 'peek' | 'half' | 'full';

/** Lowest to highest: the order the handle steps through. */
export const SHEET_DETENTS = [
  'peek',
  'half',
  'full',
] as const satisfies readonly SheetDetent[];

export type SheetHeights = Readonly<Record<SheetDetent, number>>;

/** What the heights are made of, measured on the device at run time. */
export interface SheetGeometry {
  windowHeight: number;
  topInset: number;
  bottomInset: number;
  /** The tab pill's height and its bottom offset: 88 dp on a 390 by 844 phone. */
  tabZone: number;
  /** Where the greeting ends; the globe fits between it and the sheet (T531, T537). */
  headerBottom: number;
}

/** The strip the handle sits in, above the content. */
export const GRAB_ZONE = 28;
/** Air between the live row and the tab pill at peek. */
const PEEK_AIR = 16;
/** Half is never closer than this to peek, however short the window. */
const HALF_MIN_ABOVE_PEEK = 120;
/** Half is this share of the window. */
const HALF_SHARE = 0.52;
/** Full leaves this much of the sky above it, under the top inset. */
const FULL_SKY = 10;

/** How far past an end the finger can drag the sheet, at most. Never reached. */
export const RUBBER_BAND_LIMIT = 48;
/** The stiffness of the band: the share of the finger's travel the first dp yields. */
const RUBBER_BAND_STIFFNESS = 0.55;
/** Where the sheet would come to rest: this many seconds of the release velocity ahead. */
const PROJECTION_SECONDS = 0.2;

export function detentHeight(
  detent: SheetDetent,
  geometry: SheetGeometry,
  rowHeight: number,
): number {
  const peek = GRAB_ZONE + rowHeight + geometry.tabZone + PEEK_AIR;
  if (detent === 'peek') return peek;
  if (detent === 'half') {
    return Math.round(
      Math.max(HALF_SHARE * geometry.windowHeight, peek + HALF_MIN_ABOVE_PEEK),
    );
  }
  return Math.round(geometry.windowHeight - (geometry.topInset + FULL_SKY));
}

export function sheetHeights(geometry: SheetGeometry, rowHeight: number): SheetHeights {
  return {
    peek: detentHeight('peek', geometry, rowHeight),
    half: detentHeight('half', geometry, rowHeight),
    full: detentHeight('full', geometry, rowHeight),
  };
}

const LABELS: Readonly<Record<SheetDetent, string>> = {
  peek: 'Peek',
  half: 'Half',
  full: 'Full',
};

/** What a screen reader says for the handle's value. */
export function detentLabel(detent: SheetDetent): string {
  return LABELS[detent];
}

/** One detent up (`1`) or down (`-1`); the ends stay where they are. */
export function stepDetent(detent: SheetDetent, direction: 1 | -1): SheetDetent {
  const index = SHEET_DETENTS.indexOf(detent) + direction;
  return SHEET_DETENTS[Math.min(Math.max(index, 0), SHEET_DETENTS.length - 1)]!;
}

/** A tap on the handle: peek, half, full, and round to peek. */
export function cycleDetent(detent: SheetDetent): SheetDetent {
  return SHEET_DETENTS[(SHEET_DETENTS.indexOf(detent) + 1) % SHEET_DETENTS.length]!;
}

/**
 * The detent a release settles on: the one nearest to where the sheet would come to rest if
 * it kept its velocity for a fifth of a second. `velocityUp` is in dp per second and positive
 * when the finger was moving the sheet UP. A flick therefore carries the sheet on to the next
 * detent in its direction and a slow drag settles on the nearer one; a fling cannot come back
 * the way it came because the projection moves with the velocity, never against it.
 */
export function settleTarget(
  visible: number,
  velocityUp: number,
  heights: SheetHeights,
): SheetDetent {
  'worklet';
  const resting = visible + velocityUp * PROJECTION_SECONDS;
  const toPeek = Math.abs(resting - heights.peek);
  const toHalf = Math.abs(resting - heights.half);
  const toFull = Math.abs(resting - heights.full);
  if (toPeek <= toHalf && toPeek <= toFull) return 'peek';
  return toHalf <= toFull ? 'half' : 'full';
}

/**
 * The height the sheet is DRAWN at for a finger that put it at `visible`: exactly `visible`
 * between peek and full, and beyond either end a resistance that yields less and less, never
 * further than `RUBBER_BAND_LIMIT` (the iOS curve: `(1 - 1 / (x * c / d + 1)) * d`).
 */
export function rubberBand(visible: number, heights: SheetHeights): number {
  'worklet';
  const limit = RUBBER_BAND_LIMIT;
  const give = (over: number) =>
    (1 - 1 / ((over * RUBBER_BAND_STIFFNESS) / limit + 1)) * limit;
  if (visible > heights.full) return heights.full + give(visible - heights.full);
  if (visible < heights.peek) return heights.peek - give(heights.peek - visible);
  return visible;
}
