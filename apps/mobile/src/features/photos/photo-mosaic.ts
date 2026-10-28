/**
 * The mosaic of a day — tasks.md T549 (FR-045; UI-SPEC section 9.2; prototype `.mos`, `.pt`).
 *
 * Pure geometry. Three columns, a gap of 4 dp (114 dp tiles on the 350 dp a 390 dp phone
 * leaves between its 20 dp margins), square cells. The FIRST photograph is the large tile
 * (2 by 2); two small ones stack beside it; every photograph after the third goes three
 * across, row by row. A day alternates which side its large tile is on (`leadSideOf`), as
 * the prototype's second day does. Fewer than three photographs fill the same block without
 * a hole: one is a 3 by 2 tile, two are the large tile and a 1 by 2 tile.
 *
 * A day shows at most six tiles. Past six it shows five photographs and the sixth tile is
 * the `+N` tile: it draws the sixth photograph under a scrim that covers the whole tile and
 * says how many photographs are not shown yet, that photograph included, so a day of 14 says
 * "+9". Opening the `+N` tile shows the whole day (`visibleTiles` with `expanded`); the
 * count is never a made-up number.
 *
 * Pixels come from the width the mosaic is given: `tileSize` divides what is left after
 * the two gaps by three, `frameOf` turns a cell into the box to draw. Nothing here knows
 * about text size: a tile holds no text that has to fit, so the three columns hold at every
 * text scale (`photos-scale1.5.png`).
 */
export const MOSAIC_COLUMNS = 3;
export const MOSAIC_GAP = 4;
export const MOSAIC_MAX_TILES = 6;

export type LeadSide = 'start' | 'end';

export interface MosaicCell {
  /** Which photograph of the day this cell draws (its index in the shown tiles). */
  index: number;
  column: number;
  row: number;
  columns: number;
  rows: number;
  /** The large first tile. */
  lead: boolean;
}

const cell = (
  index: number,
  column: number,
  row: number,
  columns = 1,
  rows = 1,
  lead = false,
): MosaicCell => ({ index, column, row, columns, rows, lead });

/** The side of the large tile on the day at `dayIndex` (0 is the newest): start, end, start... */
export function leadSideOf(dayIndex: number): LeadSide {
  return dayIndex % 2 === 0 ? 'start' : 'end';
}

/** The cells for `count` tiles. The large tile is on `side` for three tiles and more. */
export function mosaicCells(count: number, side: LeadSide = 'start'): MosaicCell[] {
  const total = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  if (total === 0) return [];
  if (total === 1) return [cell(0, 0, 0, MOSAIC_COLUMNS, 2, true)];

  const leadColumn = side === 'start' ? 0 : 1;
  const otherColumn = side === 'start' ? 2 : 0;
  const cells = [cell(0, leadColumn, 0, 2, 2, true)];
  if (total === 2) return [...cells, cell(1, otherColumn, 0, 1, 2)];

  cells.push(cell(1, otherColumn, 0), cell(2, otherColumn, 1));
  for (let index = 3; index < total; index += 1) {
    const place = index - 3;
    cells.push(
      cell(index, place % MOSAIC_COLUMNS, 2 + Math.floor(place / MOSAIC_COLUMNS)),
    );
  }
  return cells;
}

export interface VisibleTiles<T> {
  /** The photographs to draw, in order. */
  tiles: T[];
  /** Photographs behind the `+N` tile, the one it draws included; 0 when there is no such tile. */
  more: number;
}

/**
 * The photographs a day draws: all of them when `expanded` or when they fit in six tiles;
 * otherwise five plus the sixth, which carries `+more`.
 */
export function visibleTiles<T>(items: readonly T[], expanded = false): VisibleTiles<T> {
  if (expanded || items.length <= MOSAIC_MAX_TILES) {
    return { tiles: [...items], more: 0 };
  }
  return {
    tiles: items.slice(0, MOSAIC_MAX_TILES),
    more: items.length - (MOSAIC_MAX_TILES - 1),
  };
}

/** The side of a square tile for a mosaic `width` dp wide. */
export function tileSize(width: number): number {
  const usable = Number.isFinite(width) ? Math.max(0, width) : 0;
  return Math.max(0, (usable - MOSAIC_GAP * (MOSAIC_COLUMNS - 1)) / MOSAIC_COLUMNS);
}

export interface Frame {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The box of `cell` in a mosaic whose tiles are `size` dp square. */
export function frameOf(target: MosaicCell, size: number): Frame {
  const step = size + MOSAIC_GAP;
  return {
    left: target.column * step,
    top: target.row * step,
    width: target.columns * size + (target.columns - 1) * MOSAIC_GAP,
    height: target.rows * size + (target.rows - 1) * MOSAIC_GAP,
  };
}

/** The height of a mosaic made of `cells`. */
export function mosaicHeight(cells: readonly MosaicCell[], size: number): number {
  const rows = cells.reduce((most, entry) => Math.max(most, entry.row + entry.rows), 0);
  return rows === 0 ? 0 : rows * size + (rows - 1) * MOSAIC_GAP;
}
