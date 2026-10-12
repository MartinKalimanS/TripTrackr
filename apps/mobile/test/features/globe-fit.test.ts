/**
 * @jest-environment node
 *
 * `globeFit` — feature 005, T531 (FR-013, SC-018; research D5-03; data-model section 7;
 * contract C5-22).
 *
 * The camera's padding and zoom follow the Home sheet, once per settle. The rule is the
 * prototype's `cameraFor`: at peek the planet is centred in the free band with a radius of
 * `clamp((band - 24) / 2, 110, 175)`; at every other detent it hangs from the header with a
 * radius of `clamp(0.95 * band, 150, 286)`. `band` is the height between the bottom of the
 * header and the top of the sheet. A pure function, so the rule is checked here for every
 * phone height of SC-018 and the device check (V3, T509) only has to look.
 */
import { GlobeCamera } from '@/constants/theme';
import {
  FIT_REFERENCE_RADIUS,
  globeFit,
  globeFitCamera,
  type SheetDetent,
} from '@/features/globe/globe-fit';
import { Motion } from '@/theme';

const WIDTH = 390;
const HEIGHT = 844;
const HEADER_BOTTOM = 110;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/** The peek sheet of the contract: 28 + a 64 dp row + the 88 dp tab zone + 16 = 196, drawn as 212. */
const PEEK_SHEET = 212;

describe('globeFit at peek (data-model section 7)', () => {
  test.each([
    // [sheetTop, expected radius]: the band is sheetTop - HEADER_BOTTOM.
    [HEADER_BOTTOM + 180, 110], // (180 - 24) / 2 = 78, raised to the floor
    [HEADER_BOTTOM + 244, 110], // (244 - 24) / 2 = 110 exactly
    [HEADER_BOTTOM + 300, 138], // (300 - 24) / 2
    [HEADER_BOTTOM + 398, 175], // (398 - 24) / 2 = 187, held at the cap
    [HEADER_BOTTOM + 900, 175],
  ])('a sheet top of %d gives a radius of %d', (sheetTop, radius) => {
    expect(globeFit('peek', WIDTH, HEADER_BOTTOM, sheetTop, HEIGHT).radius).toBe(radius);
  });

  test('the radius is clamp((band - 24) / 2, 110, 175) across the whole range', () => {
    for (let band = 100; band <= 700; band += 7) {
      const fit = globeFit('peek', WIDTH, HEADER_BOTTOM, HEADER_BOTTOM + band, HEIGHT);
      expect(fit.radius).toBe(clamp((band - 24) / 2, 110, 175));
    }
  });

  test('the planet is centred in the free band, 4 dp lower, and in the middle of the width', () => {
    const sheetTop = 632;
    const band = sheetTop - HEADER_BOTTOM;
    const fit = globeFit('peek', WIDTH, HEADER_BOTTOM, sheetTop, HEIGHT);
    expect(fit.centreX).toBe(WIDTH / 2);
    expect(fit.centreY).toBe(HEADER_BOTTOM + band / 2 + 4);
  });

  test('on the reference phone the radius is 175 and the margins are 20 dp', () => {
    const fit = globeFit('peek', 390, HEADER_BOTTOM, 844 - PEEK_SHEET, 844);
    expect(fit.radius).toBe(175);
    expect(fit.centreX - fit.radius).toBe(20);
    expect(390 - (fit.centreX + fit.radius)).toBe(20);
  });
});

describe('globeFit at half and full', () => {
  test.each<SheetDetent>(['half', 'full'])(
    '%s: the radius is clamp(0.95 * band, 150, 286) across the whole range',
    (detent) => {
      for (let band = -50; band <= 700; band += 9) {
        const fit = globeFit(detent, WIDTH, HEADER_BOTTOM, HEADER_BOTTOM + band, HEIGHT);
        expect(fit.radius).toBeCloseTo(clamp(0.95 * band, 150, 286), 10);
      }
    },
  );

  test('the planet hangs 28 dp below the header, centred in the width', () => {
    const sheetTop = 405;
    const fit = globeFit('half', WIDTH, HEADER_BOTTOM, sheetTop, HEIGHT);
    expect(fit.radius).toBeCloseTo(0.95 * (sheetTop - HEADER_BOTTOM), 10);
    expect(fit.centreY).toBeCloseTo(HEADER_BOTTOM + 28 + fit.radius, 10);
    expect(fit.centreX).toBe(WIDTH / 2);
  });

  test('a band the sheet has eaten (full) still gives the smallest planet, never a negative one', () => {
    const fit = globeFit('full', WIDTH, HEADER_BOTTOM, 64, HEIGHT);
    expect(fit.radius).toBe(150);
    expect(Number.isFinite(fit.centreY)).toBe(true);
  });
});

describe('globeFit padding', () => {
  const cases: [SheetDetent, number][] = [
    ['peek', HEIGHT - PEEK_SHEET],
    ['half', Math.round(HEIGHT * 0.48)],
    ['full', 64],
  ];

  test.each(cases)(
    '%s: the middle of the padded viewport is the middle of the planet',
    (detent, sheetTop) => {
      const fit = globeFit(detent, WIDTH, HEADER_BOTTOM, sheetTop, HEIGHT);
      const { top, bottom } = fit.padding;
      expect((top + (HEIGHT - bottom)) / 2).toBeCloseTo(fit.centreY, 10);
    },
  );

  test.each(cases)(
    '%s: padding is never negative and never sideways',
    (detent, sheetTop) => {
      const { padding } = globeFit(detent, WIDTH, HEADER_BOTTOM, sheetTop, HEIGHT);
      expect(padding.top).toBeGreaterThanOrEqual(0);
      expect(padding.bottom).toBeGreaterThanOrEqual(0);
      expect(padding.left).toBe(0);
      expect(padding.right).toBe(0);
    },
  );

  test('a planet above the middle of the window is lifted with bottom padding only', () => {
    const { padding } = globeFit('peek', WIDTH, HEADER_BOTTOM, 500, HEIGHT);
    expect(padding.top).toBe(0);
    expect(padding.bottom).toBeGreaterThan(0);
  });
});

describe('globeFit zoom', () => {
  test('the reference radius is the size of the planet at the default zoom: 512 dp over 2 pi, doubled per zoom', () => {
    expect(FIT_REFERENCE_RADIUS).toBeCloseTo(
      (512 * 2 ** GlobeCamera.zoomLevel) / (2 * Math.PI),
      8,
    );
    expect(FIT_REFERENCE_RADIUS).toBeGreaterThan(200);
    expect(FIT_REFERENCE_RADIUS).toBeLessThan(230);
  });

  test('the zoom change is the base 2 logarithm of the radius over the reference radius', () => {
    const big = globeFit('half', WIDTH, HEADER_BOTTOM, HEADER_BOTTOM + 400, HEIGHT);
    expect(big.radius).toBe(286);
    expect(big.zoomDelta).toBeCloseTo(Math.log2(286 / FIT_REFERENCE_RADIUS), 10);
  });

  test('the planet’s radius doubles per zoom level: the zoom difference is the log of the ratio', () => {
    // Both radii are above the floor the minimum zoom sets (about 163 dp at the default).
    const small = globeFit('half', WIDTH, HEADER_BOTTOM, HEADER_BOTTOM + 190, HEIGHT);
    expect(small.radius).toBeCloseTo(0.95 * 190, 10);
    const large = globeFit('half', WIDTH, HEADER_BOTTOM, HEADER_BOTTOM + 330, HEIGHT);
    expect(large.radius).toBe(286);
    expect(large.zoomDelta - small.zoomDelta).toBeCloseTo(
      Math.log2(large.radius / small.radius),
      10,
    );
  });

  test('never asks the camera for less than its minimum zoom', () => {
    const smallest = globeFit('peek', WIDTH, HEADER_BOTTOM, HEADER_BOTTOM + 220, HEIGHT);
    expect(smallest.radius).toBe(110);
    expect(GlobeCamera.zoomLevel + smallest.zoomDelta).toBe(GlobeCamera.minZoomLevel);
    for (const detent of ['peek', 'half', 'full'] as const) {
      for (let top = 60; top <= 800; top += 20) {
        const fit = globeFit(detent, WIDTH, HEADER_BOTTOM, top, HEIGHT);
        expect(GlobeCamera.zoomLevel + fit.zoomDelta).toBeGreaterThanOrEqual(
          GlobeCamera.minZoomLevel,
        );
      }
    }
  });

  test('a larger planet is a larger zoom: the zoom follows the radius', () => {
    const radii = [110, 140, 175, 250, 286].map((r) => {
      // Reach each radius through the half rule: radius = 0.95 * band.
      const band = r / 0.95;
      return globeFit('half', WIDTH, HEADER_BOTTOM, HEADER_BOTTOM + band, HEIGHT);
    });
    const zooms = radii.map((fit) => fit.zoomDelta);
    expect([...zooms].sort((a, b) => a - b)).toEqual(zooms);
  });
});

describe('globeFit on every phone of SC-018 (heights 640 to 932)', () => {
  const widths = [360, 375, 390, 412, 430];

  test.each(widths)(
    'at peek, width %d: 220 dp of free space and 20 dp of margin',
    (width) => {
      for (let height = 640; height <= 932; height += 4) {
        const sheetTop = height - PEEK_SHEET;
        const band = sheetTop - HEADER_BOTTOM;
        expect(band).toBeGreaterThanOrEqual(220);

        const fit = globeFit('peek', width, HEADER_BOTTOM, sheetTop, height);
        // Whole planet inside the free band...
        expect(fit.centreY - fit.radius).toBeGreaterThanOrEqual(HEADER_BOTTOM);
        expect(fit.centreY + fit.radius).toBeLessThanOrEqual(sheetTop);
        // ...and 20 dp from both screen edges.
        expect(fit.centreX - fit.radius).toBeGreaterThanOrEqual(20);
        expect(width - (fit.centreX + fit.radius)).toBeGreaterThanOrEqual(20);
      }
    },
  );

  test('narrow phones lose radius rather than margin: 360 dp gives 160, not 175', () => {
    const fit = globeFit('peek', 360, HEADER_BOTTOM, 844 - PEEK_SHEET, 844);
    expect(fit.radius).toBe(160);
  });

  test('a header that grows with the text still leaves the planet inside the band', () => {
    for (const headerBottom of [110, 150, 190]) {
      for (let height = 640; height <= 932; height += 4) {
        const sheetTop = height - PEEK_SHEET;
        const fit = globeFit('peek', 390, headerBottom, sheetTop, height);
        if (sheetTop - headerBottom < 244) continue; // the 110 dp floor wins below this
        expect(fit.centreY - fit.radius).toBeGreaterThanOrEqual(headerBottom);
        expect(fit.centreY + fit.radius).toBeLessThanOrEqual(sheetTop);
      }
    }
  });
});

describe('globeFitCamera: what the sheet hands the camera on each settle', () => {
  test('half: padding in the camera’s own names, the zoom from the default, an ease of 280 ms', () => {
    const fit = globeFit('half', WIDTH, HEADER_BOTTOM, 405, HEIGHT);
    expect(globeFitCamera('half', fit)).toEqual({
      padding: {
        paddingTop: fit.padding.top,
        paddingBottom: fit.padding.bottom,
        paddingLeft: 0,
        paddingRight: 0,
      },
      zoomLevel: GlobeCamera.zoomLevel + fit.zoomDelta,
      animationMode: 'easeTo',
      animationDuration: Motion.cameraFollowMs,
    });
    expect(Motion.cameraFollowMs).toBe(280);
  });

  test('peek moves the camera too', () => {
    const fit = globeFit('peek', WIDTH, HEADER_BOTTOM, 632, HEIGHT);
    expect(globeFitCamera('peek', fit)).not.toBeNull();
  });

  test('full does not move the camera: the map is hidden and rotation pauses', () => {
    const fit = globeFit('full', WIDTH, HEADER_BOTTOM, 64, HEIGHT);
    expect(globeFitCamera('full', fit)).toBeNull();
  });

  test('under reduced motion the camera jumps: no animation, no duration', () => {
    const fit = globeFit('half', WIDTH, HEADER_BOTTOM, 405, HEIGHT);
    expect(globeFitCamera('half', fit, { animated: false })).toMatchObject({
      animationMode: 'moveTo',
      animationDuration: 0,
    });
  });
});

describe('globeFit on bad input', () => {
  test.each<SheetDetent>(['peek', 'half', 'full'])(
    '%s: a sheet above the header, or a zero window, gives finite numbers',
    (detent) => {
      for (const [header, top, height] of [
        [300, 200, 844],
        [0, 0, 0],
        [110, 5000, 844],
      ] as const) {
        const fit = globeFit(detent, WIDTH, header, top, height);
        for (const value of [
          fit.radius,
          fit.centreX,
          fit.centreY,
          fit.zoomDelta,
          fit.padding.top,
          fit.padding.bottom,
        ]) {
          expect(Number.isFinite(value)).toBe(true);
        }
      }
    },
  );
});
