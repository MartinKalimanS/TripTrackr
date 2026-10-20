/**
 * The arithmetic that lays the Home out around the globe (feature 005, T537; FR-012, FR-013;
 * contract C5-22 and C5-32): the height of the peek row that sets the sheet's lowest detent,
 * where the map's logo and attribution go so the sheet never covers them (Mapbox's terms:
 * both stay visible), and where the live callout may sit. Pure, so the layout is checked
 * without a renderer and the device check (T509, T547) only has to look.
 */

import { globeFit } from '@/features/globe/globe-fit';

/** The peek card: a 56 dp thumbnail in a card padded 12 dp (data-model section 7). */
const PEEK_THUMB = 56;
const PEEK_PADDING = 12;

/**
 * The height of the live row at peek: the thumbnail is the floor (80 dp), and the text beside it
 * grows with the text size, so a larger text size gives a taller peek instead of a clipped row.
 * An estimate: the card is not measured before the sheet it sits in is sized.
 */
export function peekRowHeight(fontScale: number): number {
  return Math.round(2 * PEEK_PADDING + PEEK_THUMB * Math.max(fontScale, 1));
}

/** The air between the sheet and the logo or the attribution, and from the screen's edge. */
export const ORNAMENT_GAP = 8;

export interface OrnamentOffsets {
  logoPosition: { bottom: number; left: number };
  attributionPosition: { bottom: number; right: number };
}

/**
 * Where the Mapbox logo (bottom left) and attribution (bottom right) go when `coveredBottom` dp
 * of the screen's bottom are covered by the sheet or a card: just above it. Offsets from the
 * edges, in whole dp, as the package takes them.
 */
export function ornamentOffsets(coveredBottom: number): OrnamentOffsets {
  const bottom = Math.round(coveredBottom) + ORNAMENT_GAP;
  return {
    logoPosition: { bottom, left: ORNAMENT_GAP },
    attributionPosition: { bottom, right: ORNAMENT_GAP },
  };
}

/** The sheet's top edge, in dp from the top of the window, for a visible height. */
export function sheetTopOf(windowHeight: number, visibleHeight: number): number {
  return windowHeight - visibleHeight;
}

/** The free space the callout may use: between the header and the sheet, never inverted. */
export function calloutBounds(
  headerBottom: number,
  sheetTop: number,
): { top: number; bottom: number } {
  return { top: headerBottom, bottom: Math.max(sheetTop, headerBottom) };
}

/**
 * How far below the top inset the greeting ends: an estimate (an eyebrow, one line of the display
 * face, the padding) for the loading skeleton, which draws its disc before the real header has
 * been laid out. The globe itself waits for the measure and never uses this.
 */
export const HEADER_ESTIMATE = 88;

/** The disc the loading skeleton stands where the globe will be: the half detent's planet. */
export function skeletonDisc(
  width: number,
  height: number,
  topInset: number,
  detents: { half: number },
): { discRadius: number; discCentreY: number } {
  const fit = globeFit(
    'half',
    width,
    topInset + HEADER_ESTIMATE,
    sheetTopOf(height, detents.half),
    height,
  );
  return { discRadius: fit.radius, discCentreY: fit.centreY };
}
