/**
 * @jest-environment node
 *
 * The arithmetic that lays the Home out around the globe (feature 005, T537; FR-012, FR-013;
 * contract C5-22, C5-32): the height of the peek row that sets the sheet's lowest detent, where
 * the map's logo and attribution go so the sheet never covers them (Mapbox's terms), and where
 * the live callout may sit. Pure.
 */
import {
  HEADER_ESTIMATE,
  ORNAMENT_GAP,
  calloutBounds,
  ornamentOffsets,
  peekRowHeight,
  sheetTopOf,
  skeletonDisc,
} from '@/features/home/home-layout';
import { sheetHeights } from '@/components/ui/sheet-geometry';
import { globeFit } from '@/features/globe/globe-fit';

describe('peekRowHeight', () => {
  test('is the 80 dp of a 56 dp thumbnail padded 12 at the default text size', () => {
    expect(peekRowHeight(1)).toBe(80);
  });

  test('a smaller text size does not shrink it: the thumbnail sets the floor', () => {
    expect(peekRowHeight(0.85)).toBe(80);
  });

  test('grows with the text size, so the live row is not clipped at peek', () => {
    expect(peekRowHeight(1.5)).toBe(108);
    expect(peekRowHeight(2)).toBe(136);
  });

  test('makes the 212 dp peek of the reference phone with the 88 dp tab zone', () => {
    const heights = sheetHeights(
      {
        windowHeight: 844,
        topInset: 54,
        bottomInset: 34,
        tabZone: 88,
        headerBottom: 150,
      },
      peekRowHeight(1),
    );
    expect(heights).toEqual({ peek: 212, half: 439, full: 780 });
  });
});

describe('sheetTopOf', () => {
  test('is where the sheet\u2019s top edge is, from the top of the window', () => {
    expect(sheetTopOf(844, 439)).toBe(405);
  });
});

describe('ornamentOffsets: the logo and the attribution stay above what covers the bottom', () => {
  test('sit 8 dp above the visible sheet, on their own sides, never hidden', () => {
    expect(ornamentOffsets(439)).toEqual({
      logoPosition: { bottom: 439 + ORNAMENT_GAP, left: ORNAMENT_GAP },
      attributionPosition: { bottom: 439 + ORNAMENT_GAP, right: ORNAMENT_GAP },
    });
    expect(ORNAMENT_GAP).toBe(8);
  });

  test('round to whole dp', () => {
    expect(ornamentOffsets(212.4).logoPosition).toEqual({ bottom: 220, left: 8 });
  });
});

describe('calloutBounds: the free space between the header and the sheet', () => {
  test('is the header\u2019s bottom to the sheet\u2019s top', () => {
    expect(calloutBounds(150, 405)).toEqual({ top: 150, bottom: 405 });
  });

  test('never inverts when the sheet is higher than the header is low', () => {
    expect(calloutBounds(400, 300)).toEqual({ top: 400, bottom: 400 });
  });
});

describe('skeletonDisc: where the loading disc stands, before the header exists', () => {
  const detents = { peek: 212, half: 439, full: 780 };

  test('is the planet of the half detent under an estimate of the greeting', () => {
    const disc = skeletonDisc(390, 844, 54, detents);
    const fit = globeFit('half', 390, 54 + HEADER_ESTIMATE, 844 - 439, 844);
    expect(disc).toEqual({ discRadius: fit.radius, discCentreY: fit.centreY });
  });

  test('is a planet-sized disc the sheet covers the lower part of', () => {
    const disc = skeletonDisc(390, 844, 54, detents);
    expect(disc.discRadius).toBeGreaterThanOrEqual(150);
    expect(disc.discRadius).toBeLessThanOrEqual(286);
    expect(disc.discCentreY + disc.discRadius).toBeGreaterThan(844 - 439);
  });
});
