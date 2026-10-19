/**
 * T534 - the arithmetic of the Home sheet (feature 005; FR-012, FR-013, FR-027; data-model
 * section 7; research D5-03). Pure functions, so the gesture code that calls them on the UI
 * thread can be trusted without a device: the three heights, the nearest detent by velocity,
 * the rubber band beyond the ends and the order the handle steps through.
 */
import {
  GRAB_ZONE,
  RUBBER_BAND_LIMIT,
  SHEET_DETENTS,
  cycleDetent,
  detentHeight,
  detentLabel,
  rubberBand,
  settleTarget,
  sheetHeights,
  stepDetent,
  type SheetGeometry,
} from './sheet-geometry';

/** The prototype's reference phone: 390 by 844, top inset 54, bottom inset 34, tab zone 88. */
const PHONE: SheetGeometry = {
  windowHeight: 844,
  topInset: 54,
  bottomInset: 34,
  tabZone: 88,
  headerBottom: 120,
};

/** The peek row: a 56 dp thumbnail in a card padded 12 dp. */
const ROW = 80;

describe('detentHeight', () => {
  test('peek is the grab zone, the live row, the tab zone and 16 dp: 212 dp on the reference phone', () => {
    expect(GRAB_ZONE).toBe(28);
    expect(detentHeight('peek', PHONE, ROW)).toBe(28 + ROW + 88 + 16);
    expect(detentHeight('peek', PHONE, ROW)).toBe(212);
  });

  test('half is 52 percent of the window: 439 dp on the reference phone', () => {
    expect(detentHeight('half', PHONE, ROW)).toBe(439);
  });

  test('half is never less than 120 dp above peek, however short the window', () => {
    const short = { ...PHONE, windowHeight: 500 };
    const peek = detentHeight('peek', short, ROW);
    expect(0.52 * 500).toBeLessThan(peek + 120);
    expect(detentHeight('half', short, ROW)).toBe(peek + 120);
  });

  test('full is the window less the top inset and 10 dp: 780 dp, about 92 percent', () => {
    expect(detentHeight('full', PHONE, ROW)).toBe(780);
    expect(780 / 844).toBeGreaterThan(0.92);
  });

  test('a taller peek row (large text) raises peek and keeps the order', () => {
    const tall = sheetHeights(PHONE, 140);
    expect(tall.peek).toBe(272);
    expect(tall.peek).toBeLessThan(tall.half);
    expect(tall.half).toBeLessThan(tall.full);
  });

  test('every height is a whole number of dp, at every window height from 640 to 932', () => {
    for (let windowHeight = 640; windowHeight <= 932; windowHeight += 7) {
      const heights = sheetHeights({ ...PHONE, windowHeight }, ROW);
      for (const detent of SHEET_DETENTS) {
        expect(Number.isInteger(heights[detent])).toBe(true);
      }
      expect(heights.peek).toBeLessThan(heights.half);
      expect(heights.half).toBeLessThan(heights.full);
    }
  });

  test('sheetHeights is the three detents in one object', () => {
    expect(sheetHeights(PHONE, ROW)).toEqual({ peek: 212, half: 439, full: 780 });
  });
});

describe('the order of the detents', () => {
  test('peek, half, full, and the words a screen reader says', () => {
    expect(SHEET_DETENTS).toEqual(['peek', 'half', 'full']);
    expect(SHEET_DETENTS.map(detentLabel)).toEqual(['Peek', 'Half', 'Full']);
  });

  test('stepping up and down stops at the ends', () => {
    expect(stepDetent('peek', 1)).toBe('half');
    expect(stepDetent('half', 1)).toBe('full');
    expect(stepDetent('full', 1)).toBe('full');
    expect(stepDetent('full', -1)).toBe('half');
    expect(stepDetent('half', -1)).toBe('peek');
    expect(stepDetent('peek', -1)).toBe('peek');
  });

  test('a tap on the handle cycles: peek, half, full and round to peek', () => {
    expect(cycleDetent('peek')).toBe('half');
    expect(cycleDetent('half')).toBe('full');
    expect(cycleDetent('full')).toBe('peek');
  });
});

describe('settleTarget: the nearest detent, by where the sheet would come to rest', () => {
  const heights = { peek: 212, half: 439, full: 780 };

  test('with no velocity it is the nearest detent', () => {
    expect(settleTarget(212, 0, heights)).toBe('peek');
    expect(settleTarget(439, 0, heights)).toBe('half');
    expect(settleTarget(780, 0, heights)).toBe('full');
    expect(settleTarget(300, 0, heights)).toBe('peek');
    expect(settleTarget(330, 0, heights)).toBe('half');
    expect(settleTarget(620, 0, heights)).toBe('full');
  });

  test('a flick carries the sheet on to the next detent in its direction', () => {
    expect(settleTarget(300, 900, heights)).toBe('half');
    expect(settleTarget(212, 2600, heights)).toBe('full');
    expect(settleTarget(600, -900, heights)).toBe('half');
    expect(settleTarget(439, -2600, heights)).toBe('peek');
  });

  test('a gentle drag released past the middle still settles on the nearer detent', () => {
    expect(settleTarget(420, 60, heights)).toBe('half');
    expect(settleTarget(460, -60, heights)).toBe('half');
  });

  test('a fling never carries the sheet back the way it came', () => {
    for (let at = 212; at <= 780; at += 14) {
      const rank = (detent: (typeof SHEET_DETENTS)[number]) =>
        SHEET_DETENTS.indexOf(detent);
      const nearest = rank(settleTarget(at, 0, heights));
      expect(rank(settleTarget(at, 3000, heights))).toBeGreaterThanOrEqual(nearest);
      expect(rank(settleTarget(at, -3000, heights))).toBeLessThanOrEqual(nearest);
    }
  });

  test('beyond the ends it settles on the end', () => {
    expect(settleTarget(830, 0, heights)).toBe('full');
    expect(settleTarget(150, 0, heights)).toBe('peek');
  });
});

describe('rubberBand: resistance beyond peek and full', () => {
  const heights = { peek: 212, half: 439, full: 780 };

  test('between the ends the sheet follows the finger exactly', () => {
    for (const value of [212, 300, 439, 600, 780]) {
      expect(rubberBand(value, heights)).toBe(value);
    }
  });

  test('beyond full it yields, less than the finger moved, and never past the limit', () => {
    const pulled = rubberBand(780 + 100, heights);
    expect(pulled).toBeGreaterThan(780);
    expect(pulled).toBeLessThan(780 + 100);
    expect(rubberBand(780 + 5000, heights)).toBeLessThan(780 + RUBBER_BAND_LIMIT);
  });

  test('beyond peek downward it yields the same way', () => {
    const pulled = rubberBand(212 - 100, heights);
    expect(pulled).toBeLessThan(212);
    expect(pulled).toBeGreaterThan(212 - 100);
    expect(rubberBand(212 - 5000, heights)).toBeGreaterThan(212 - RUBBER_BAND_LIMIT);
  });

  test('it only ever grows: a longer pull never moves the sheet back', () => {
    let last = rubberBand(780, heights);
    for (let over = 1; over <= 400; over += 3) {
      const next = rubberBand(780 + over, heights);
      expect(next).toBeGreaterThanOrEqual(last);
      last = next;
    }
  });
});
