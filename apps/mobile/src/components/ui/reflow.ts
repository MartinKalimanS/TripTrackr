/**
 * The reflow threshold (feature 005; `contracts/screens.md`, the prototype's `data-bigtext`;
 * FR-074, SC-007): at a font scale of 1.15 and above a figure and its label trade places
 * into a row, the trip's area pills fall from four columns to two, and a ticket stacks.
 * One number, so a stat tile, the areas grid and the ticket cannot disagree about when.
 */

export const REFLOW_FONT_SCALE = 1.15;

/** True from a font scale of 1.15 up. */
export function isLargeText(fontScale: number): boolean {
  return fontScale >= REFLOW_FONT_SCALE;
}

/**
 * The lines a one-line title or meta line may take: one, and two from a font scale of 1.15
 * (the prototype's `:root[data-bigtext] .clamp-1 { -webkit-line-clamp: 2 }`), so a long name is
 * wrapped, not cut, when the text is large.
 */
export function metaLines(fontScale: number): 1 | 2 {
  return isLargeText(fontScale) ? 2 : 1;
}

/** The columns of the trip's areas grid: four, and two at large text. */
export function areaColumns(fontScale: number): 2 | 4 {
  return isLargeText(fontScale) ? 2 : 4;
}
