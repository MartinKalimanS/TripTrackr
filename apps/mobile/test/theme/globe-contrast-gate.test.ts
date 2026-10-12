/**
 * The globe palette's contrast gate — feature 002 contract C3, research D-30; feature 005
 * contract C5-11 (P22) and research D5-22.
 *
 * The connections sit on map imagery, not on the canvas, and imagery has no
 * single colour to measure against. So every connection is drawn over a
 * casing line, and the guarantee is made against the casing: each arc stop
 * clears the 3:1 floor for graphical objects (WCAG 1.4.11) against it,
 * whatever the basemap beneath. The visited-country keyline and the planned keyline are
 * measured against BOTH land colours instead. Like the main gate, this one is exhaustive —
 * a globe token nobody classified fails the build.
 *
 * The same pairs are part of the palette gate as class P22 (`contrast-gate.test.ts`).
 */
import { GlobeColors, GlobeGeometry } from '@/constants/theme';
import { ContrastFloor, contrastRatio } from '@/theme/contrast';

const THEMES = ['light', 'dark'] as const;

/** Drawn on top of the casing; each must be findable against it (the start and end stops). */
const MARK_TOKENS = ['active', 'activeEnd', 'planning', 'past', 'pastEnd'] as const;

/** The status colours a legend or a card shares with the globe, one per status. */
const STATUS_TOKENS = ['active', 'planning', 'past'] as const;

/** Outlines of a country: measured against both land colours, never against the casing. */
const KEYLINE_TOKENS = ['visitedKeyline', 'plannedKeyline'] as const;

/** The two land colours a keyline can sit on. Measured against, not measured. */
const LAND_TOKENS = ['land', 'landShade'] as const;

/** A fill only (1.37:1 on land in light): the keyline carries the meaning. */
const FILL_ONLY_TOKENS = ['visitedFill'] as const;

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

    test.each(KEYLINE_TOKENS)('%s clears 3:1 on both land colours', (token) => {
      for (const land of LAND_TOKENS) {
        expect(contrastRatio(palette[token], palette[land])).toBeGreaterThanOrEqual(
          ContrastFloor.nonText,
        );
      }
    });

    test('the fill alone does not carry the meaning: it is below 3:1 on land', () => {
      for (const token of FILL_ONLY_TOKENS) {
        expect(contrastRatio(palette[token], palette.land)).toBeLessThan(
          ContrastFloor.nonText,
        );
      }
    });

    test('the three statuses are told apart: by colour, or by line width where they share a hue', () => {
      // Past and active share a hue in the light theme (C5-11); they differ by width, by
      // the pulse and by the live pin, never by colour alone.
      const looks = STATUS_TOKENS.map(
        (status) => `${palette[status]}@${GlobeGeometry.arcWidth[status]}`,
      );
      expect(new Set(looks).size).toBe(3);
    });
  });

  test('both themes expose exactly the same globe tokens, and every one is classified', () => {
    const classified = new Set<string>([
      ...MARK_TOKENS,
      ...KEYLINE_TOKENS,
      ...LAND_TOKENS,
      ...FILL_ONLY_TOKENS,
      ...CASING_TOKENS,
    ]);
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
    for (const status of STATUS_TOKENS) {
      expect(GlobeGeometry.arcWidth[status]).toBeGreaterThan(0);
    }
  });

  test('the prototype bright arc ends fail on a white casing, so light ends at amberLine (M-3)', () => {
    // #FF9A45 is 2.11:1 and #FFB547 is 1.76:1 on white; the light gradient ends darker.
    expect(contrastRatio('#FF9A45', GlobeColors.light.casing)).toBeLessThan(
      ContrastFloor.nonText,
    );
    expect(contrastRatio('#FFB547', GlobeColors.light.casing)).toBeLessThan(
      ContrastFloor.nonText,
    );
    expect(GlobeColors.light.activeEnd).toBe(GlobeColors.light.planning);
  });
});
