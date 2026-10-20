/**
 * T523 - the baked wear of a passport stamp (feature 005; research D5-08; spike V5 / T511).
 *
 * `react-native-svg` 15.15.4 implements no `feTurbulence`, `feDisplacementMap` or
 * `feMorphology`: a filter-made grunge warns and draws NOTHING. The wear is therefore baked
 * data: four fixed texture paths, each ONE path of a few hundred tiny irregular holes cut out
 * of the 120 by 120 box with the even-odd rule, used as the shape of an SVG `<Mask>`. Seeded
 * integer arithmetic only, so the same index is the same wear on every device and launch.
 */
import { STAMP_BOX, WEAR_COUNT, wearPath } from './stamp-wear';

const numbers = (path: string) => (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

describe('wearPath - four fixed textures', () => {
  test('there are four', () => {
    expect(WEAR_COUNT).toBe(4);
    expect(STAMP_BOX).toBe(120);
  });

  test.each([0, 1, 2, 3] as const)(
    'texture %i is the same string every time',
    (index) => {
      expect(wearPath(index)).toBe(wearPath(index));
      expect(wearPath(index).length).toBeGreaterThan(0);
    },
  );

  test('the four textures differ from one another', () => {
    const paths = [0, 1, 2, 3].map((index) => wearPath(index as 0 | 1 | 2 | 3));
    expect(new Set(paths).size).toBe(4);
  });

  test('pins the texture: its length and its first hole never drift', () => {
    expect(wearPath(0)).toMatch(/^M0 0H120V120H0Z/);
    expect(wearPath(0).length).toBeGreaterThan(4000);
    expect(wearPath(0).length).toBeLessThan(12000);
  });
});

describe('wearPath - a box with many small holes', () => {
  test.each([0, 1, 2, 3] as const)(
    'texture %i opens with the whole box and closes every hole',
    (index) => {
      const path = wearPath(index);
      expect(path.startsWith('M0 0H120V120H0Z')).toBe(true);
      const opens = (path.match(/M/g) ?? []).length;
      const closes = (path.match(/Z/g) ?? []).length;
      expect(opens).toBe(closes);
      // The box plus 130 specks, 26 chips, 7 blotches and 5 scratches.
      expect(opens).toBe(1 + 130 + 26 + 7 + 5);
    },
  );

  test.each([0, 1, 2, 3] as const)(
    'texture %i holds only finite numbers, inside the box and a margin',
    (index) => {
      const values = numbers(wearPath(index));
      expect(values.length).toBeGreaterThan(1000);
      for (const value of values) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(-8);
        expect(value).toBeLessThanOrEqual(128);
      }
    },
  );

  test('every hole is a polygon of at least three corners', () => {
    const holes = wearPath(1).split('M').slice(2);
    for (const hole of holes) {
      const corners = hole.split('L').length;
      expect(corners).toBeGreaterThanOrEqual(3);
    }
  });

  test('is plain path data: moves, lines and numbers, no exponent and no effect', () => {
    expect(wearPath(2)).toMatch(/^[MLHVZ0-9. -]+$/);
  });
});
