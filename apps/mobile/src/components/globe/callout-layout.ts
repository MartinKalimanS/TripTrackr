/**
 * Which side of the pin the callout goes — feature 005, T533 (FR-011; contract C5-24:
 * "flips side near an edge (12 dp margin)").
 *
 * The prototype's rule (`ui-proto/sunrise-v2/app.js`, `draw`): try the card to the LEFT of
 * the pin, then the RIGHT, then ABOVE, then BELOW, and take the first that keeps the whole
 * card 12 dp inside the sides of the screen and 6 dp inside the free area between the header
 * and the sheet. Where none fits, the card takes the side with the most room and is narrowed
 * to it (`maxWidth`, at least `minWidth`), its text ellipsising, so the edge of the screen
 * never cuts it off.
 *
 * Pure: `pin` is the pin's point on the screen, in the same dp as `area`.
 */
import { GlobeLayers } from '@/constants/theme';

export type CalloutSide = 'left' | 'right' | 'above' | 'below';

export interface CalloutArea {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface CalloutPlacement {
  side: CalloutSide;
  /** The width the card may take: its own maximum when it fits, less when it had to be narrowed. */
  maxWidth: number;
}

interface Size {
  width: number;
  height: number;
}

const { maxWidth, minWidth, margin, verticalMargin, gap } = GlobeLayers.callout;

const ORDER: readonly CalloutSide[] = ['left', 'right', 'above', 'below'];

/** The card's rectangle on that side of the pin, `offset` from the pin's middle. */
function rectOf(
  side: CalloutSide,
  pin: { x: number; y: number },
  card: Size,
  offset: number,
) {
  switch (side) {
    case 'left':
      return {
        x0: pin.x - offset - card.width,
        x1: pin.x - offset,
        y0: pin.y - card.height / 2,
        y1: pin.y + card.height / 2,
      };
    case 'right':
      return {
        x0: pin.x + offset,
        x1: pin.x + offset + card.width,
        y0: pin.y - card.height / 2,
        y1: pin.y + card.height / 2,
      };
    case 'above':
      return {
        x0: pin.x - card.width / 2,
        x1: pin.x + card.width / 2,
        y0: pin.y - offset - card.height,
        y1: pin.y - offset,
      };
    case 'below':
      return {
        x0: pin.x - card.width / 2,
        x1: pin.x + card.width / 2,
        y0: pin.y + offset,
        y1: pin.y + offset + card.height,
      };
  }
}

/** The room a card has on that side, sideways: what `maxWidth` may be there. */
function roomOf(
  side: CalloutSide,
  pin: { x: number; y: number },
  area: CalloutArea,
  offset: number,
) {
  const left = area.left + margin;
  const right = area.right - margin;
  if (side === 'left') return pin.x - offset - left;
  if (side === 'right') return right - (pin.x + offset);
  return 2 * Math.min(pin.x - left, right - pin.x);
}

function fits(r: ReturnType<typeof rectOf>, area: CalloutArea): boolean {
  return (
    r.x0 >= area.left + margin &&
    r.x1 <= area.right - margin &&
    r.y0 >= area.top + verticalMargin &&
    r.y1 <= area.bottom - verticalMargin
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Where the card goes. `card` is its natural size (at most `maxWidth` wide, as measured),
 * `ringSize` the width of the ring round the pin.
 */
export function calloutPlacement(
  pin: { x: number; y: number },
  card: Size,
  area: CalloutArea,
  { ringSize }: { ringSize: number },
): CalloutPlacement {
  const offset = ringSize / 2 + gap;
  const sized = { width: Math.min(card.width, maxWidth), height: card.height };
  const first = ORDER.find((side) => fits(rectOf(side, pin, sized, offset), area));
  if (first) return { side: first, maxWidth };

  // Nothing fits: the side with the most room, vertically possible if any is, narrowed to it.
  const vertical = ORDER.filter((side) => {
    const r = rectOf(side, pin, sized, offset);
    return r.y0 >= area.top + verticalMargin && r.y1 <= area.bottom - verticalMargin;
  });
  const candidates = vertical.length > 0 ? vertical : ORDER;
  const best = candidates.reduce((a, b) =>
    roomOf(b, pin, area, offset) > roomOf(a, pin, area, offset) ? b : a,
  );
  return {
    side: best,
    maxWidth: clamp(roomOf(best, pin, area, offset), minWidth, maxWidth),
  };
}
