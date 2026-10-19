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
 *
 * Feature 005, T532 extends it to the rest of the Sunrise globe (research D5-22): every
 * stop of a gradient arc, sampled along the whole ramp; the visited and planned keylines
 * against the greenspace as well as the land; the graticule (decoration: visible, never a
 * mark); the atmosphere and the sea under the greeting and the map labels; and the white
 * callout card of the live trip. A token nobody classified fails here.
 */
import { gradientStops } from '@/components/globe/gradient-arcs';
import { GlobeColors, GlobeGeometry, GlobeStyle } from '@/constants/theme';
import { Palettes, type PaletteName } from '@/theme';
import { blend, ContrastFloor, contrastRatio } from '@/theme/contrast';

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

/** Every Sunrise palette and the globe scheme it is drawn over (the globe has no contrast variant). */
const PALETTES_BY_SCHEME: readonly (readonly [PaletteName, 'light' | 'dark'])[] = [
  ['light', 'light'],
  ['light-contrast', 'light'],
  ['dark', 'dark'],
  ['dark-contrast', 'dark'],
];

/** Text floor of a palette: 7:1 in the two increased-contrast themes (FR-072). */
const textFloor = (name: PaletteName) =>
  name.endsWith('contrast') ? ContrastFloor.increasedContrast : ContrastFloor.normalText;

/** A colour at `t` between two hex colours, channel by channel in sRGB (how a style ramp mixes). */
function along(from: string, to: string, t: number): string {
  return blend(to, from, t);
}

const GRADIENT_STATUSES = ['past', 'active', 'journey'] as const;
const RAMP_SAMPLES = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1] as const;

describe('gradient arcs (C5-11, finding M-3)', () => {
  describe.each(THEMES)('%s theme', (theme) => {
    const palette = GlobeColors[theme];

    test('past and active run from their start stop to their end stop; the legs between trips are past', () => {
      expect(gradientStops('past', palette)).toEqual([
        [0, palette.past],
        [1, palette.pastEnd],
      ]);
      expect(gradientStops('active', palette)).toEqual([
        [0, palette.active],
        [1, palette.activeEnd],
      ]);
      expect(gradientStops('journey', palette)).toEqual(gradientStops('past', palette));
    });

    test.each(GRADIENT_STATUSES)(
      '%s: every point of the ramp, not only its two ends, clears 3:1 on the casing',
      (status) => {
        const [[, start], [, end]] = gradientStops(status, palette);
        for (const t of RAMP_SAMPLES) {
          expect(
            contrastRatio(along(start, end, t), palette.casing),
          ).toBeGreaterThanOrEqual(ContrastFloor.nonText);
        }
      },
    );
  });
});

describe('the country keylines against the whole basemap (D5-22)', () => {
  describe.each(THEMES)('%s theme', (theme) => {
    const palette = GlobeColors[theme];

    test.each(KEYLINE_TOKENS)(
      '%s clears 3:1 on the greenspace as well as the land',
      (token) => {
        expect(
          contrastRatio(palette[token], GlobeStyle[theme].greenspace),
        ).toBeGreaterThanOrEqual(ContrastFloor.nonText);
      },
    );

    test('the visited fill is a visible tint of the land, not an invisible one', () => {
      // A fill that cannot be told from the land would leave the keyline to do everything.
      expect(contrastRatio(palette.visitedFill, palette.land)).toBeGreaterThanOrEqual(
        1.2,
      );
    });

    test('the basemap tokens are hex colours the gate can measure', () => {
      const { water, greenspace, adminBoundaries } = GlobeStyle[theme];
      for (const colour of [water, greenspace, adminBoundaries]) {
        expect(colour).toMatch(/^#[0-9A-F]{6}$/);
      }
    });
  });
});

describe('the graticule is decoration (D5-04)', () => {
  test.each(THEMES)(
    '%s: visible over the sea, and never a mark that could carry meaning',
    (theme) => {
      const { graticule, graticuleOpacity, water } = GlobeStyle[theme];
      expect(graticuleOpacity).toBeGreaterThan(0);
      expect(graticuleOpacity).toBeLessThan(1);
      const seen = contrastRatio(blend(graticule, water, graticuleOpacity), water);
      expect(seen).toBeGreaterThanOrEqual(1.1);
      expect(seen).toBeLessThan(ContrastFloor.nonText);
    },
  );
});

describe('the atmosphere and the sea (D5-04, finding M-6)', () => {
  test.each(THEMES)(
    '%s: an opaque halo over a fully transparent space, no stars, a horizon blend of .2 to .3',
    (theme) => {
      const { atmosphere } = GlobeStyle[theme];
      for (const colour of [atmosphere.color, atmosphere.highColor]) {
        // Six digits: no alpha, which would load more tiles (research D5-04).
        expect(colour).toMatch(/^#[0-9A-F]{6}$/);
      }
      // Space is the one transparent stop: Mapbox documents "the opacity can be set to 0
      // to have a transparent background", which lets the sky (`Scrim` `sky`) show behind
      // the map as in the pictures. Its colour is the sky's, so a failed see-through still
      // looks like the sky.
      expect(atmosphere.spaceColor).toMatch(/^#[0-9A-F]{6}00$/);
      expect(atmosphere.starIntensity).toBe(0);
      // The prototype halo is a third of the radius wide (1.0 to 1.34 R): wider than the
      // .08 to .14 of the first tuning, which was a guess, not the picture.
      expect(atmosphere.horizonBlend).toBeGreaterThanOrEqual(0.2);
      expect(atmosphere.horizonBlend).toBeLessThanOrEqual(0.3);
    },
  );

  describe.each(PALETTES_BY_SCHEME)('%s over the %s globe', (name, scheme) => {
    const { ink, muted } = Palettes[name];
    const { atmosphere, water } = GlobeStyle[scheme];
    const floor = textFloor(name);

    test.each(['color', 'highColor'] as const)(
      'the greeting (ink and muted) reads on the atmosphere %s',
      (stop) => {
        expect(contrastRatio(ink, atmosphere[stop])).toBeGreaterThanOrEqual(floor);
        expect(contrastRatio(muted, atmosphere[stop])).toBeGreaterThanOrEqual(floor);
      },
    );

    test('a map label over the sea is ink (the muted tone is 4.31:1 there in light)', () => {
      expect(contrastRatio(ink, water)).toBeGreaterThanOrEqual(floor);
    });
  });
});

describe('the keyline casing (prototype: a 1.6 dp wider stroke under each outline)', () => {
  test.each(THEMES)(
    '%s: a hex colour at an opacity that is a tint, not a wall',
    (theme) => {
      const { visitedCasing, visitedCasingOpacity } = GlobeStyle[theme];
      expect(visitedCasing).toMatch(/^#[0-9A-F]{6}$/);
      expect(visitedCasingOpacity).toBeGreaterThan(0.4);
      expect(visitedCasingOpacity).toBeLessThanOrEqual(1);
    },
  );

  test('light casts a white edge on the cream land; dark a navy edge on the blue land', () => {
    expect(
      contrastRatio(GlobeStyle.light.visitedCasing, GlobeColors.light.land),
    ).toBeLessThan(1.2);
    expect(
      contrastRatio(GlobeStyle.dark.visitedCasing, GlobeColors.dark.land),
    ).toBeGreaterThan(1.2);
  });
});

describe('the land, the sea and the borders read as in the pictures (F1)', () => {
  test.each(THEMES)(
    '%s: the border is findable on the land and the sea, and still decoration',
    (theme) => {
      const { adminBoundaries, water } = GlobeStyle[theme];
      const { land } = GlobeColors[theme];
      expect(contrastRatio(adminBoundaries, land)).toBeGreaterThanOrEqual(1.1);
      expect(contrastRatio(adminBoundaries, land)).toBeLessThan(ContrastFloor.nonText);
      expect(contrastRatio(adminBoundaries, water)).toBeGreaterThanOrEqual(1.1);
    },
  );

  test('the light land is cream (the prototype gradient’s middle), not white', () => {
    expect(GlobeColors.light.land).not.toBe('#FFFFFF');
    expect(contrastRatio(GlobeColors.light.land, '#FFFFFF')).toBeGreaterThan(1.03);
  });
});

describe('the callout of the live trip (FR-011)', () => {
  test.each(THEMES)(
    '%s: title and detail read on the white card, the live dot is findable',
    (theme) => {
      const { surface, title, detail, liveDot } = GlobeStyle[theme].callout;
      expect(contrastRatio(title, surface)).toBeGreaterThanOrEqual(
        ContrastFloor.normalText,
      );
      expect(contrastRatio(detail, surface)).toBeGreaterThanOrEqual(
        ContrastFloor.normalText,
      );
      expect(contrastRatio(liveDot, surface)).toBeGreaterThanOrEqual(
        ContrastFloor.nonText,
      );
    },
  );
});

describe('the pins: the cluster count reads on its disc', () => {
  test.each(THEMES)('%s: the count is text on the ink disc', (theme) => {
    const { clusterFill, clusterLabel } = GlobeStyle[theme].pin;
    expect(contrastRatio(clusterLabel, clusterFill)).toBeGreaterThanOrEqual(
      ContrastFloor.normalText,
    );
  });
});

describe('GlobeStyle is classified, like GlobeColors', () => {
  const CLASSIFIED = new Set([
    'water',
    'greenspace',
    'adminBoundaries',
    'graticule',
    'graticuleOpacity',
    'atmosphere',
    'visitedCasing',
    'visitedCasingOpacity',
    'callout',
    'pin',
  ]);

  test('both themes expose the same tokens and every one is classified above', () => {
    for (const theme of THEMES) {
      expect(
        Object.keys(GlobeStyle[theme]).filter((key) => !CLASSIFIED.has(key)),
      ).toEqual([]);
    }
    expect(Object.keys(GlobeStyle.light).sort()).toEqual(
      Object.keys(GlobeStyle.dark).sort(),
    );
  });
});
