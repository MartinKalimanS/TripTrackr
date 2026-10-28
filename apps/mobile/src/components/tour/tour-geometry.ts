/**
 * Where the first-run tour draws its parts (feature 007, FR-003): the dim around the lit control,
 * the ring on it and the card by it. Pure arithmetic over rectangles in window coordinates; the
 * overlay draws what this returns and measures nothing itself.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** The air between the lit control and the ring around it, in dp. */
export const SPOTLIGHT_PAD = 8;
/** The air between the ring and the card. */
export const CARD_GAP = 12;

/** The target grown by `SPOTLIGHT_PAD`, kept inside the window. */
export function padRect(target: Rect, bounds: Size, pad = SPOTLIGHT_PAD): Rect {
  const x = Math.max(target.x - pad, 0);
  const y = Math.max(target.y - pad, 0);
  const right = Math.min(target.x + target.width + pad, bounds.width);
  const bottom = Math.min(target.y + target.height + pad, bounds.height);
  return { x, y, width: Math.max(right - x, 0), height: Math.max(bottom - y, 0) };
}

/**
 * The dim as four rectangles around the hole (top, bottom, left, right) that do not overlap it
 * or each other: plain views, so it works the same on both platforms. With no hole it is one
 * rectangle over the whole window.
 */
export function dimPanels(hole: Rect | null, bounds: Size): Rect[] {
  if (hole === null) return [{ x: 0, y: 0, ...bounds }];
  const top = Math.max(hole.y, 0);
  const bottom = Math.min(hole.y + hole.height, bounds.height);
  const left = Math.max(hole.x, 0);
  const right = Math.min(hole.x + hole.width, bounds.width);
  return [
    { x: 0, y: 0, width: bounds.width, height: top },
    { x: 0, y: bottom, width: bounds.width, height: Math.max(bounds.height - bottom, 0) },
    { x: 0, y: top, width: left, height: Math.max(bottom - top, 0) },
    {
      x: right,
      y: top,
      width: Math.max(bounds.width - right, 0),
      height: Math.max(bottom - top, 0),
    },
  ];
}

/**
 * The card's top edge: under the ring when it fits, over it when it does not, and centred when
 * there is no target or the card fits on neither side (the largest text size). Never above the
 * top of the window.
 */
export function cardTop(hole: Rect | null, bounds: Size, cardHeight: number): number {
  const centred = Math.max((bounds.height - cardHeight) / 2, 0);
  if (hole === null) return centred;
  const below = hole.y + hole.height + CARD_GAP;
  if (below + cardHeight <= bounds.height - CARD_GAP) return below;
  const above = hole.y - CARD_GAP - cardHeight;
  return above >= CARD_GAP ? above : centred;
}
