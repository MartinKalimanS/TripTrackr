/**
 * The gallery's grid — tasks.md T117 (research D-23; feature 002 FR-016,
 * contract C13).
 *
 * Pure. The gallery is a `FlashList` through `ListScreen` (D-23) whose rows
 * each hold a few thumbnails — `ListScreen` has no column option, and a row of
 * tiles recycles just as well as a single tile. How many per row follows the
 * width available AND the traveller's text size: a tile never gets narrower
 * than `MIN_TILE_PT` scaled by the font scale, so its status caption stays
 * legible at the largest supported text size — one column if need be.
 */
import { Spacing } from '@/constants/theme';
import { chunk } from '@/db/repositories/shared';

/** The narrowest tile at text scale 1, in points: three across a typical phone. */
export const MIN_TILE_PT = 96;
export const MAX_COLUMNS = 4;
/** The space between tiles and between rows (ListScreen's row gap). */
export const TILE_GAP = Spacing.three;

/** Tiles per row for a list `width` points wide at `fontScale`. At least one. */
export function gridColumns(width: number, fontScale: number): number {
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const fit = Math.floor((width + TILE_GAP) / (MIN_TILE_PT * scale + TILE_GAP));
  return Math.min(MAX_COLUMNS, Math.max(1, fit));
}

/** The photos cut into rows of `columns`; the last row may be short. */
export function toRows<T>(items: readonly T[], columns: number): T[][] {
  return chunk(items, Math.max(1, columns));
}
