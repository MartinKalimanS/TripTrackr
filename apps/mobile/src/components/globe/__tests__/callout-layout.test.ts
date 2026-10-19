/**
 * Which side of the pin the callout goes — feature 005, T533 (FR-011; contract C5-24:
 * "flips side near an edge (12 dp margin)").
 *
 * The rule is the prototype's (`ui-proto/sunrise-v2/app.js`, `draw`): try the card to the
 * LEFT of the pin, then to the RIGHT, then ABOVE, then BELOW, and take the first that keeps
 * the whole card 12 dp inside the screen's sides and inside the free area between the header
 * and the sheet. Where none fits the card takes the side with the most room and is narrowed
 * to it, its text ellipsising, so it is never cut off by the edge of the screen.
 */
import { GlobeLayers } from '@/constants/theme';

import { calloutPlacement, type CalloutArea } from '../callout-layout';

const AREA: CalloutArea = { left: 0, right: 390, top: 110, bottom: 632 };
const CARD = { width: 163, height: 54 };
const { margin, gap, maxWidth } = GlobeLayers.callout;
const RING = 56;
const RING_GAP = RING / 2 + gap;

const place = (x: number, y: number, card = CARD, area = AREA) =>
  calloutPlacement({ x, y }, card, area, { ringSize: RING });

describe('calloutPlacement', () => {
  test('the contract numbers: a 12 dp margin, a card of at most 220 dp', () => {
    expect(margin).toBe(12);
    expect(maxWidth).toBe(220);
  });

  test('prefers the left of the pin, as the prototype does', () => {
    expect(place(300, 350).side).toBe('left');
  });

  test('flips to the right when the left would leave the screen', () => {
    expect(place(100, 350).side).toBe('right');
  });

  test('goes above the pin when neither side has room', () => {
    // 195 is too far from both edges for a 163 dp card plus the ring gap.
    expect(place(195, 350).side).toBe('above');
  });

  test('goes below the pin when above would run into the header', () => {
    expect(place(195, AREA.top + 40).side).toBe('below');
  });

  test('stays inside the free area at the bottom too: above, never under the sheet', () => {
    expect(place(195, AREA.bottom - 10).side).toBe('above');
  });

  test('a card that just fits on the left stays there; one dp less room flips it', () => {
    const x = margin + CARD.width + RING_GAP;
    expect(place(x, 350).side).toBe('left');
    expect(place(x - 1, 350).side).not.toBe('left');
  });

  test('a card that just fits on the right stays there; one dp less room flips it', () => {
    const x = AREA.right - margin - CARD.width - RING_GAP;
    expect(place(x, 350).side).toBe('right');
    expect(place(x + 1, 350).side).not.toBe('right');
  });

  test('a card that would cross the header or the sheet flips: the vertical edges count as well', () => {
    // Left would fit sideways, but the card is taller than the room above the sheet line.
    const tall = { width: 163, height: 80 };
    expect(place(300, AREA.top + tall.height / 2 - 1, tall).side).not.toBe('left');
    expect(place(300, AREA.bottom - tall.height / 2 + 1, tall).side).not.toBe('left');
    expect(place(300, AREA.top + 6 + tall.height / 2, tall).side).toBe('left');
  });

  test('keeps the whole card inside the screen at every x, for every side it picks', () => {
    for (let x = 0; x <= 390; x += 3) {
      const { side, maxWidth: width } = place(x, 350);
      const cardWidth = Math.min(CARD.width, width);
      const half = RING_GAP;
      const [from, to] =
        side === 'left'
          ? [x - half - cardWidth, x - half]
          : side === 'right'
            ? [x + half, x + half + cardWidth]
            : [x - cardWidth / 2, x + cardWidth / 2];
      if (x >= margin && x <= AREA.right - margin) {
        expect(from).toBeGreaterThanOrEqual(margin - 1e-9);
        expect(to).toBeLessThanOrEqual(AREA.right - margin + 1e-9);
      }
    }
  });

  test('where no side fits, takes the side with the most room and narrows the card to it', () => {
    const wide = { width: maxWidth, height: 54 };
    // 300 dp wide, 60 dp from the left edge: 186 dp to the right, 96 above, 6 to the left.
    const narrow = { ...AREA, right: 300 };
    const result = calloutPlacement({ x: 60, y: 350 }, wide, narrow, { ringSize: RING });
    expect(result.side).toBe('right');
    expect(result.maxWidth).toBe(300 - margin - (60 + RING_GAP));
    expect(result.maxWidth).toBeLessThan(wide.width);
  });

  test('a card is never narrowed below a readable minimum, whatever the pin', () => {
    const wide = { width: maxWidth, height: 54 };
    for (let x = 0; x <= 390; x += 5) {
      expect(place(x, 350, wide).maxWidth).toBeGreaterThanOrEqual(
        GlobeLayers.callout.minWidth,
      );
    }
  });

  test('keeps the full width when it fits: the cap is the contract maximum', () => {
    expect(place(300, 350).maxWidth).toBe(maxWidth);
    expect(place(300, 350, { width: maxWidth, height: 54 }).maxWidth).toBe(maxWidth);
  });

  test('copes with an area that is smaller than the card, or a pin off the screen', () => {
    for (const [x, y] of [
      [-50, 350],
      [500, 350],
      [195, -20],
      [195, 900],
    ] as const) {
      const result = place(x, y);
      expect(['left', 'right', 'above', 'below']).toContain(result.side);
      expect(Number.isFinite(result.maxWidth)).toBe(true);
    }
    const tiny: CalloutArea = { left: 0, right: 100, top: 0, bottom: 40 };
    expect(Number.isFinite(place(50, 20, CARD, tiny).maxWidth)).toBe(true);
  });
});

describe('calloutPlacement — the numbers of the prototype (.tag, app.js draw)', () => {
  const { verticalMargin, ringSize } = GlobeLayers.callout;

  test('the card edge is half the pin plus 14 dp from the pin middle: 42 dp for the live roundel', () => {
    expect(ringSize.roundel).toBe(GlobeLayers.pins.roundelSize.active);
    expect(ringSize.roundel / 2 + gap).toBe(42);
    // Right on the margin: the card's left edge is at 12 when the pin is 42 + 163 + 12 across.
    const x = margin + CARD.width + 42;
    expect(
      calloutPlacement({ x, y: 350 }, CARD, AREA, { ringSize: ringSize.roundel }).side,
    ).toBe('left');
    expect(
      calloutPlacement({ x: x - 1, y: 350 }, CARD, AREA, { ringSize: ringSize.roundel })
        .side,
    ).toBe('above');
  });

  test('stays 6 dp clear of the header and of the sheet', () => {
    expect(verticalMargin).toBe(6);
    const half = CARD.height / 2;
    expect(place(300, AREA.top + verticalMargin + half).side).toBe('left');
    expect(place(300, AREA.top + verticalMargin + half - 1).side).not.toBe('left');
    expect(place(300, AREA.bottom - verticalMargin - half).side).toBe('left');
    expect(place(300, AREA.bottom - verticalMargin - half + 1).side).not.toBe('left');
  });

  test('tries left, right, above, then below, in that order', () => {
    expect(place(300, 350).side).toBe('left');
    expect(place(100, 350).side).toBe('right');
    expect(place(195, 350).side).toBe('above');
    expect(place(195, AREA.top + 20).side).toBe('below');
  });
});
