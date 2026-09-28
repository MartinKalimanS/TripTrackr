/**
 * The globe palette's contrast gate — feature 002 contract C3, research D-30.
 *
 * The connections sit on map imagery, not on the canvas, and imagery has no
 * single colour to measure against. So every connection is drawn over a
 * casing line, and the guarantee is made against the casing: each status
 * colour clears the 3:1 floor for graphical objects (WCAG 1.4.11) against it,
 * whatever the basemap beneath. Like the main gate, this one is exhaustive —
 * a globe token nobody classified fails the build.
 */
import { GlobeColors, GlobeGeometry } from '@/constants/theme';
import { ContrastFloor, contrastRatio } from '@/theme/contrast';

const THEMES = ['light', 'dark'] as const;

/** Drawn on top of the casing; each must be findable against it. */
const MARK_TOKENS = ['active', 'planning', 'past'] as const;

/** The halo every mark sits on. Measured against, not measured. */
const CASING_TOKENS = ['casing'] as const;

describe('globe contrast gate', () => {
  describe.each(THEMES)('%s theme', (theme) => {
    const palette = GlobeColors[theme];

    test.each(MARK_TOKENS)(
      '%s clears the 3:1 graphical-object floor on its casing',
      (token) => {
        expect(contrastRatio(palette[token], palette.casing)).toBeGreaterThanOrEqual(
          ContrastFloor.nonText,
        );
      },
    );

    test('the three statuses are three different colours', () => {
      expect(new Set(MARK_TOKENS.map((token) => palette[token])).size).toBe(3);
    });
  });

  test('both themes expose exactly the same globe tokens, and every one is classified', () => {
    const classified = new Set<string>([...MARK_TOKENS, ...CASING_TOKENS]);
    for (const theme of THEMES) {
      expect(
        Object.keys(GlobeColors[theme]).filter((token) => !classified.has(token)),
      ).toEqual([]);
    }
    expect(Object.keys(GlobeColors.light).sort()).toEqual(
      Object.keys(GlobeColors.dark).sort(),
    );
  });

  test('the casing shows on both sides of every line', () => {
    expect(GlobeGeometry.casingWidth).toBeGreaterThan(0);
    for (const status of MARK_TOKENS) {
      expect(GlobeGeometry.arcWidth[status]).toBeGreaterThan(0);
    }
  });
});
