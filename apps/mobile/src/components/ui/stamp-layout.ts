/**
 * The geometry of a passport stamp (feature 005; research D5-08), in the 120 by 120 box of the
 * prototype's six shapes (`sunrise-v2/app.js`, `stampSVG`): where each line of text sits, how
 * much room it has, and the arcs the circle and the scallop write on. Pure data and two pure
 * functions, so the drawing (`stamp.tsx`) is a table lookup.
 *
 * SVG text does not follow Dynamic Type and a stamp may be asked to hold a long city, so a line
 * is FITTED by arithmetic instead of by measuring a glyph: its width is estimated as
 * characters times (an average advance of Bricolage Bold capitals and figures, in em, plus the
 * letter spacing), the spacing closes up first, and the size shrinks only when the spacing has
 * reached its floor. The estimate is a starting point that device check V5 (T511) confirms
 * against the real face.
 */
import type { StampShape } from './stamp-spec';

/** The average advance of a Bricolage Bold capital or figure, in em (tabular figures: .622). */
export const ADVANCE_EM = 0.64;
/** The tightest letter spacing and the smallest size a fitted line may reach. */
export const MIN_TRACKING = 0.3;
export const MIN_SIZE = 6.5;

/** The estimated width of `count` characters of `size`, spaced by `tracking`. */
export function textWidth(count: number, size: number, tracking: number): number {
  return count * (ADVANCE_EM * size + tracking);
}

export interface FittedLabel {
  size: number;
  tracking: number;
}

/**
 * `text` at `size` and `tracking`, changed only as far as it takes to fit `room`: the spacing
 * closes first (never below `MIN_TRACKING`), then the size shrinks (never below `MIN_SIZE`).
 * A text that cannot fit even then is drawn at the floor and may overrun its room.
 */
export function fitLabel(
  text: string,
  room: number,
  size: number,
  tracking: number,
): FittedLabel {
  const count = Array.from(text).length;
  if (count === 0 || textWidth(count, size, tracking) <= room) return { size, tracking };
  const closed = room / count - ADVANCE_EM * size;
  if (closed >= MIN_TRACKING) return { size, tracking: closed };
  const shrunk = (room / count - MIN_TRACKING) / ADVANCE_EM;
  return { size: Math.max(MIN_SIZE, shrunk), tracking: MIN_TRACKING };
}

/** The corners of a regular octagon of circumradius `radius` about the centre, as `points`. */
export function octagonPoints(radius: number): string {
  return Array.from({ length: 8 }, (_, corner) => {
    const angle = ((22.5 + corner * 45) * Math.PI) / 180;
    const x = (60 + radius * Math.cos(angle)).toFixed(1);
    const y = (60 + radius * Math.sin(angle)).toFixed(1);
    return `${x},${y}`;
  }).join(' ');
}

/**
 * A half circle through the box's centre line that a line of text runs along, with the room
 * the text may take: about 85 percent of its length, so it keeps clear of the ring ends.
 */
export const ARCS = {
  circleTop: { d: 'M 23 60 a 37 37 0 0 1 74 0', room: 100 },
  circleBottom: { d: 'M 15 60 a 45 45 0 0 0 90 0', room: 120 },
  scallopTop: { d: 'M 24 60 a 36 36 0 0 1 72 0', room: 96 },
} as const;

export type ArcName = keyof typeof ARCS;

interface Slot {
  size: number;
  tracking: number;
  room: number;
}

/** A line of text centred on the box, at `y`. */
export interface LineSlot extends Slot {
  kind: 'line';
  y: number;
}

/** A line of text along one of the arcs. */
export interface ArcSlot extends Slot {
  kind: 'arc';
  arc: ArcName;
}

export type TextSlot = LineSlot | ArcSlot;

export interface ShapeLayout {
  top: TextSlot;
  date: TextSlot;
  /** The country code, big, centred on the box at `y`. */
  code: { y: number; size: number };
}

const line = (y: number, size: number, tracking: number, room: number): LineSlot => ({
  kind: 'line',
  y,
  size,
  tracking,
  room,
});

const arc = (name: ArcName, size: number, tracking: number): ArcSlot => ({
  kind: 'arc',
  arc: name,
  size,
  tracking,
  room: ARCS[name].room,
});

/** The sizes, spacings and positions of the prototype, and the room each line has inside its rings. */
export const SHAPE_LAYOUT: Record<StampShape, ShapeLayout> = {
  circle: {
    top: arc('circleTop', 11, 2.2),
    date: arc('circleBottom', 10, 2),
    code: { y: 69, size: 25 },
  },
  rect: {
    top: line(43, 10, 3, 84),
    date: line(90, 10, 2, 84),
    code: { y: 71, size: 30 },
  },
  hex: {
    top: line(38, 10, 2.5, 66),
    date: line(90, 10, 1.6, 62),
    code: { y: 71, size: 29 },
  },
  oct: {
    top: line(40, 10, 2.5, 78),
    date: line(90, 10, 2, 78),
    code: { y: 71, size: 29 },
  },
  scallop: {
    top: arc('scallopTop', 10, 2.4),
    date: line(86, 10, 2, 66),
    code: { y: 69, size: 25 },
  },
  oval: {
    top: line(45, 10, 3, 74),
    date: line(83, 10, 2, 62),
    code: { y: 69, size: 27 },
  },
};
