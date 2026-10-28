/**
 * Feature 007 (T703) - where the tour's dim, ring and card go. Pure arithmetic over rectangles
 * in window coordinates; the overlay only draws what these return.
 */
import {
  CARD_GAP,
  SPOTLIGHT_PAD,
  cardTop,
  dimPanels,
  padRect,
  type Rect,
} from '@/components/tour/tour-geometry';

const WINDOW = { width: 390, height: 844 };
const area = (rects: readonly Rect[]) =>
  rects.reduce((sum, r) => sum + r.width * r.height, 0);

describe('padRect', () => {
  test('grows the target by the padding on every side', () => {
    expect(padRect({ x: 100, y: 200, width: 80, height: 40 }, WINDOW)).toEqual({
      x: 100 - SPOTLIGHT_PAD,
      y: 200 - SPOTLIGHT_PAD,
      width: 80 + 2 * SPOTLIGHT_PAD,
      height: 40 + 2 * SPOTLIGHT_PAD,
    });
  });

  test('never leaves the window', () => {
    const edge = padRect({ x: 2, y: 0, width: 400, height: 860 }, WINDOW);
    expect(edge.x).toBeGreaterThanOrEqual(0);
    expect(edge.y).toBeGreaterThanOrEqual(0);
    expect(edge.x + edge.width).toBeLessThanOrEqual(WINDOW.width);
    expect(edge.y + edge.height).toBeLessThanOrEqual(WINDOW.height);
  });
});

describe('dimPanels', () => {
  const hole: Rect = { x: 100, y: 300, width: 120, height: 60 };

  test('four panels around a hole, which together cover everything but the hole', () => {
    const panels = dimPanels(hole, WINDOW);
    expect(panels).toHaveLength(4);
    expect(area(panels)).toBe(WINDOW.width * WINDOW.height - hole.width * hole.height);
  });

  test('none of them overlaps the hole', () => {
    for (const p of dimPanels(hole, WINDOW)) {
      const overlapX = p.x < hole.x + hole.width && p.x + p.width > hole.x;
      const overlapY = p.y < hole.y + hole.height && p.y + p.height > hole.y;
      expect(overlapX && overlapY).toBe(false);
    }
  });

  test('a hole on the edge leaves no negative panel', () => {
    for (const p of dimPanels({ x: 0, y: 0, width: 50, height: 50 }, WINDOW)) {
      expect(p.width).toBeGreaterThanOrEqual(0);
      expect(p.height).toBeGreaterThanOrEqual(0);
    }
  });

  test('no hole: one panel over the whole window', () => {
    expect(dimPanels(null, WINDOW)).toEqual([{ x: 0, y: 0, ...WINDOW }]);
  });
});

describe('cardTop', () => {
  const CARD = 180;

  test('below a target in the upper part of the window', () => {
    const hole: Rect = { x: 20, y: 200, width: 300, height: 80 };
    expect(cardTop(hole, WINDOW, CARD)).toBe(hole.y + hole.height + CARD_GAP);
  });

  test('above a target near the bottom (the FAB, the tabs)', () => {
    const hole: Rect = { x: 250, y: 700, width: 120, height: 52 };
    expect(cardTop(hole, WINDOW, CARD)).toBe(hole.y - CARD_GAP - CARD);
  });

  test('centred when there is no target', () => {
    expect(cardTop(null, WINDOW, CARD)).toBe((WINDOW.height - CARD) / 2);
  });

  test('centred when it fits neither above nor below (a huge text size)', () => {
    const hole: Rect = { x: 0, y: 150, width: 390, height: 540 };
    expect(cardTop(hole, WINDOW, 400)).toBe((WINDOW.height - 400) / 2);
  });

  test('never above the top edge of the window', () => {
    expect(
      cardTop({ x: 0, y: 10, width: 50, height: 20 }, WINDOW, 900),
    ).toBeGreaterThanOrEqual(0);
  });
});
