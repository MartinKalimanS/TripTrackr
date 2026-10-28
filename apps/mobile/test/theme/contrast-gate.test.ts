/**
 * T513 — contract C5-4 (extends 004 C4-3). THE gate that makes SC-002 standing.
 *
 * It is EXHAUSTIVE over the palette in both directions:
 *
 *   1. Every pair class P1 to P23 of C5-4 is measured in each of the four themes. The pair
 *      table is BUILT in `palette-gate-support.ts`, so the keys a pair "covers" are the keys
 *      it really measures.
 *   2. A Palette key that is neither covered by a measured pair nor named in the enumerated
 *      allowlist (`gate-exemptions.ts`) fails the suite, so a token cannot be added
 *      unmeasured. The allowlist is a list, never a skipped assertion, and the two pinned
 *      exceptions (`FILL_BELOW_FLOOR`, `DISPLAY_SIZE_ONLY`) are verified in both directions:
 *      the entry must really fail, and nothing else may.
 *
 * Text and scrim pairs over a photograph are measured over a PURE WHITE photograph
 * (`WHITE_PHOTO`), the worst ground a scrim can sit on. A failing pair retunes the TOKEN,
 * never the floor; every retune is recorded in `contracts/design-tokens.md`.
 *
 * The `Colors` tokens (what code, not a class, hands over: the root and tab scenes, the
 * navigation theme, the canvas of `Screen`, `MediaFrame`'s edge) are gated at the end.
 */
import { Colors, GlobeColors } from '@/constants/theme';
import { blend, ContrastFloor, contrastRatio } from '@/theme/contrast';
import { PaletteKeys, PaletteNames, Palettes, type Palette } from '@/theme/palette';
import { scrimSpec } from '@/theme/scrim';
import { FocusRing, PrimaryEdgeRing } from '@/theme/shape';

import {
  DECORATIVE_IN_BASE_THEMES,
  DECORATIVE_PALETTE_KEYS,
  DISPLAY_SIZE_ONLY,
  FILL_BELOW_FLOOR,
  decorativeKeys,
} from './gate-exemptions';
import {
  ALIASES,
  PAIR_CLASSES,
  WHITE_PHOTO,
  buildPairs,
  classesOf,
  coveredKeys,
  failures,
  flatten,
  globePairs,
  isContrastTheme,
  scrimAlphasUnderText,
  skyGrounds,
  unclassifiedKeys,
  type Pair,
  type PairClass,
} from './palette-gate-support';

/** Classes that are TEXT (4.5:1, 7:1 in the contrast themes); the rest are graphics (3:1). */
const TEXT_CLASSES: PairClass[] = [
  'P1',
  'P2',
  'P3',
  'P4',
  'P5',
  'P6',
  'P7',
  'P8',
  'P9',
  'P10',
  'P23',
];

const GRAPHIC_CLASSES: PairClass[] = [
  'P11',
  'P12',
  'P13',
  'P14',
  'P15',
  'P16',
  'P17',
  'P18',
  'P19',
  'P20',
  'P22',
];

/** Pairs measured per class and theme, written out independently of the builder. */
function expectedCounts(name: (typeof PaletteNames)[number]): Record<string, number> {
  const contrast = isContrastTheme(name);
  const dark = name.startsWith('dark');
  return {
    P1: 9,
    P2: 1,
    P3: 18,
    P4: 10,
    P5: 6,
    P6: 1,
    P7: 2,
    P8: contrast ? 3 : 4,
    P9: 6,
    P10: 8,
    P11: 1,
    P12: 3,
    P13: 3,
    P14: 9,
    // The edge ring, plus the accent fill on three grounds unless it is the pinned exception.
    P15: name === 'light' || name === 'light-contrast' ? 1 : 4,
    P16: 1,
    P17: 1,
    P18: 1,
    P19: contrast ? 2 : 0,
    P20: 4,
    // Three measurements per sky ground: ink, muted, accentText at display size.
    P23: (dark ? 6 : 5) * 3,
  };
}

const countOf = (pairs: Pair[], cls: PairClass) =>
  pairs.filter((pair) => pair.cls === cls).length;

describe('contrast gate — contract C5-4, pair classes P1 to P23', () => {
  describe.each(PaletteNames)('%s theme', (name) => {
    const palette = Palettes[name];
    const pairs = buildPairs(palette, name);
    const present = [...TEXT_CLASSES, ...GRAPHIC_CLASSES].filter(
      (cls) => cls !== 'P22' && (cls !== 'P19' || isContrastTheme(name)),
    );

    test.each(present)('every %s pair meets its floor', (cls) => {
      expect(failures(pairs, cls)).toEqual([]);
    });

    test('measures a pair in every class of the C5-4 table (P22 is the globe, below)', () => {
      expect(classesOf(pairs).sort()).toEqual([...present].sort());
    });

    test('measures exactly the pairs the contract lists, no class silently shrinks', () => {
      const expected = expectedCounts(name);
      const found = Object.fromEntries(
        Object.keys(expected).map((cls) => [cls, countOf(pairs, cls as PairClass)]),
      );
      expect(found).toEqual(expected);
    });

    test('text classes are held to 4.5:1, or 7:1 in the contrast themes (FR-068, FR-072)', () => {
      const floor = isContrastTheme(name)
        ? ContrastFloor.increasedContrast
        : ContrastFloor.normalText;
      // The accent word on the sky is DISPLAY-size text: the large-text floor (3:1, and
      // 7:1 in the contrast themes), see DISPLAY_SIZE_ONLY.
      const large = isContrastTheme(name)
        ? ContrastFloor.increasedContrast
        : ContrastFloor.largeText;
      const text = pairs.filter((pair) => TEXT_CLASSES.includes(pair.cls));
      expect(text.length).toBeGreaterThan(0);
      const wrong = text.filter(
        (pair) => pair.floor !== (pair.label.includes('display size') ? large : floor),
      );
      expect(wrong.map((pair) => pair.label)).toEqual([]);
    });

    test('graphic classes are held to 3:1 in every theme (FR-069)', () => {
      const graphic = pairs.filter((pair) => GRAPHIC_CLASSES.includes(pair.cls));
      expect(graphic.length).toBeGreaterThan(0);
      expect(
        graphic
          .filter((pair) => pair.floor !== ContrastFloor.nonText)
          .map((p) => p.label),
      ).toEqual([]);
    });
  });

  test('the class list is P1 to P23: P21 is the aliases, P22 the globe', () => {
    expect([...PAIR_CLASSES]).toEqual([
      ...Array.from({ length: 20 }, (_, index) => `P${index + 1}`),
      'P22',
      'P23',
    ]);
  });
});

describe('P21 — aliases are not separate values', () => {
  test('the alias list is the C5-3 list, nothing added or dropped', () => {
    expect([...ALIASES].map(([alias, base]) => `${alias}=${base}`).sort()).toEqual(
      [
        'link=ink',
        'overlay=surface',
        'pending=amberInk',
        'placeholder=subtle',
        'statusActive=accentLine',
        'statusPast=muted',
        'statusPlanning=amberLine',
        'statusPlanningInk=amberInk',
      ].sort(),
    );
  });

  test.each(PaletteNames)(
    '%s: every alias equals its base, so a status reads the same',
    (name) => {
      for (const [alias, base] of ALIASES) {
        expect({ alias, value: Palettes[name][alias] }).toEqual({
          alias,
          value: Palettes[name][base],
        });
      }
    },
  );
});

describe('P22 — the globe pairs of C5-11', () => {
  test.each(['light', 'dark'] as const)(
    '%s: arc stops clear their casing and keylines clear both lands at 3:1',
    (scheme) => {
      const pairs = globePairs(scheme);
      expect(pairs).toHaveLength(5 + 4);
      expect(failures(pairs, 'P22')).toEqual([]);
    },
  );

  test('the visited fill is a fill only: the keyline carries the meaning (1.37:1 on land)', () => {
    const { visitedFill, land } = GlobeColors.light;
    expect(contrastRatio(visitedFill, land)).toBeLessThan(ContrastFloor.nonText);
  });
});

describe('P8 to P11 — the white photograph fixture', () => {
  test('the fixture is a pure white photograph', () => {
    expect(WHITE_PHOTO).toBe('#FFFFFF');
  });

  test.each([
    [false, [0.64, 0.66, 0.68, 0.88]],
    [true, [0.78, 0.8, 0.94]],
  ])(
    'contrast=%s: the alphas that sit under text are the contract stops',
    (contrast, alphas) => {
      expect(scrimAlphasUnderText(contrast).sort()).toEqual(
        expect.arrayContaining(alphas),
      );
      expect([...new Set(scrimAlphasUnderText(contrast))].sort()).toEqual(
        [...alphas].sort(),
      );
    },
  );

  test.each([
    [0.64, 5.33],
    [0.66, 5.68],
    [0.88, 12.44],
  ])(
    'white text on the base scrim at %s over a white photograph is %s:1',
    (alpha, ratio) => {
      const ground = blend(scrimSpec(false).rgb, WHITE_PHOTO, alpha);
      expect(contrastRatio('#FFFFFF', ground)).toBeCloseTo(ratio, 1);
    },
  );

  test.each([
    [0.78, 9.55],
    [0.94, 16.41],
  ])(
    'white text on the contrast scrim at %s over a white photograph is %s:1',
    (alpha, ratio) => {
      const ground = blend(scrimSpec(true).rgb, WHITE_PHOTO, alpha);
      expect(contrastRatio('#FFFFFF', ground)).toBeCloseTo(ratio, 1);
    },
  );

  test('a caption ramp that stays at .64 under a text line is the floor, not a margin', () => {
    const { caption } = scrimSpec(false);
    expect(caption.minUnderText).toBe(0.64);
    expect(caption.rampTo).toBeGreaterThanOrEqual(caption.minUnderText);
    expect(scrimSpec(true).caption.minUnderText).toBe(0.78);
  });

  test('the gate can fail: .50 is not enough for text on a white photograph', () => {
    const ground = blend(scrimSpec(false).rgb, WHITE_PHOTO, 0.5);
    expect(contrastRatio('#FFFFFF', ground)).toBeLessThan(ContrastFloor.normalText);
  });

  test('white is the worst photograph: a mid-grey one gives a higher ratio at every stop', () => {
    for (const alpha of scrimAlphasUnderText(false)) {
      const onWhite = contrastRatio(
        '#FFFFFF',
        blend(scrimSpec(false).rgb, WHITE_PHOTO, alpha),
      );
      const onGrey = contrastRatio(
        '#FFFFFF',
        blend(scrimSpec(false).rgb, '#808080', alpha),
      );
      expect(onGrey).toBeGreaterThan(onWhite);
    }
  });

  test.each(PaletteNames)(
    '%s: the icon button disc is at least .50 (M-5), so white clears 3:1 with a margin',
    (name) => {
      const alpha = parseInt(Palettes[name].scrimButton.slice(7), 16) / 255;
      expect(alpha).toBeGreaterThanOrEqual(0.5);
      const disc = flatten(Palettes[name].scrimButton, WHITE_PHOTO);
      expect(contrastRatio('#FFFFFF', disc)).toBeGreaterThanOrEqual(3.4);
    },
  );
});

describe('P13 and P15 — the ring tokens', () => {
  test('the focus ring is 2.5 dp wide with a 2 dp offset gap (FR-071)', () => {
    expect(FocusRing.width).toBe(2.5);
    expect(FocusRing.offset).toBeGreaterThanOrEqual(2);
  });

  test('the primary edge ring is 1.5 dp, 2 dp in the contrast themes, drawn in accentLine', () => {
    expect(PrimaryEdgeRing).toEqual({
      width: 1.5,
      contrastWidth: 2,
      colourKey: 'accentLine',
    });
  });
});

describe('FILL_BELOW_FLOOR — the pinned exception, verified in both directions (D5-22, M-1)', () => {
  const entries = FILL_BELOW_FLOOR.flatMap((entry) =>
    entry.grounds.map((ground) => ({ ...entry, ground })),
  );

  test('it names exactly the coral fill in light and light-contrast', () => {
    expect(
      FILL_BELOW_FLOOR.map(({ theme, fill, pinned }) => ({ theme, fill, pinned })),
    ).toEqual([
      { theme: 'light', fill: 'accent', pinned: '#FF6B4A' },
      { theme: 'light-contrast', fill: 'accent', pinned: '#FF8466' },
    ]);
  });

  test.each(entries)(
    'the excepted pair $theme $fill on $ground really falls below 3:1 (else delete the entry)',
    ({ theme, fill, ground }) => {
      expect(contrastRatio(Palettes[theme][fill], Palettes[theme][ground])).toBeLessThan(
        ContrastFloor.nonText,
      );
    },
  );

  test.each(FILL_BELOW_FLOOR)(
    'the excepted fill is the pinned value in $theme',
    ({ theme, fill, pinned }) => {
      expect(Palettes[theme][fill]).toBe(pinned);
    },
  );

  test.each(FILL_BELOW_FLOOR)(
    'the compensating ring token exists and clears 3:1 in $theme (P15)',
    ({ theme, ring }) => {
      expect(ring).toBe(PrimaryEdgeRing.colourKey);
      for (const ground of ['canvas', 'surface', 'surfaceSecondary'] as const) {
        expect(
          contrastRatio(Palettes[theme][ring], Palettes[theme][ground]),
        ).toBeGreaterThanOrEqual(ContrastFloor.nonText);
      }
    },
  );

  test.each(PaletteNames)(
    '%s: no OTHER accent-fill pair is below 3:1 (the exception is the only one)',
    (name) => {
      const palette = Palettes[name];
      const grounds = ['canvas', 'surface', 'surfaceSecondary'] as const;
      const below = grounds.filter(
        (ground) =>
          contrastRatio(palette.accent, palette[ground]) < ContrastFloor.nonText,
      );
      const excepted = FILL_BELOW_FLOOR.filter((entry) => entry.theme === name).flatMap(
        (entry) => [...entry.grounds],
      );
      expect(below.sort()).toEqual([...excepted].sort());
    },
  );
});

describe('DISPLAY_SIZE_ONLY — accentText on the sky glow, verified in both directions (M-7)', () => {
  test('it names exactly accentText in the light theme', () => {
    expect(DISPLAY_SIZE_ONLY).toEqual([{ theme: 'light', text: 'accentText' }]);
  });

  test.each(DISPLAY_SIZE_ONLY)(
    'the excepted $text really falls below the text floor on a $theme sky ground',
    ({ theme, text }) => {
      const below = skyGrounds(theme).filter(
        ({ colour }) =>
          contrastRatio(Palettes[theme][text], colour) < ContrastFloor.normalText,
      );
      expect(below.map(({ label }) => label)).toHaveLength(1);
    },
  );

  test.each(PaletteNames)(
    '%s: no other sky ground leaves accentText below the text floor',
    (name) => {
      const floor = isContrastTheme(name)
        ? ContrastFloor.increasedContrast
        : ContrastFloor.normalText;
      const excepted = DISPLAY_SIZE_ONLY.some((entry) => entry.theme === name);
      const below = skyGrounds(name).filter(
        ({ colour }) => contrastRatio(Palettes[name].accentText, colour) < floor,
      );
      expect(below).toHaveLength(excepted ? 1 : 0);
    },
  );
});

describe('exhaustiveness — a new token cannot slip through unmeasured', () => {
  test.each(PaletteNames)('every %s key is measured by a pair or allowlisted', (name) => {
    const covered = coveredKeys(buildPairs(Palettes[name], name));
    const exempt = new Set<string>(decorativeKeys(name));
    expect(unclassifiedKeys(PaletteKeys, covered, exempt)).toEqual([]);
  });

  test('the allowlist names real keys and hides no measured key', () => {
    for (const name of PaletteNames) {
      const covered = coveredKeys(buildPairs(Palettes[name], name));
      for (const key of decorativeKeys(name)) {
        expect(PaletteKeys).toContain(key);
        expect({ name, key, measured: covered.has(key) }).toEqual({
          name,
          key,
          measured: false,
        });
      }
    }
  });

  test('the allowlist is exactly the contract list', () => {
    expect([...DECORATIVE_PALETTE_KEYS].sort()).toEqual(
      [
        'sand',
        'backdrop',
        'aqua',
        'amber',
        'ring',
        'skeleton',
        'skeletonHighlight',
        'scrimButtonLine',
      ].sort(),
    );
    expect([...DECORATIVE_IN_BASE_THEMES]).toEqual(['hairline']);
    expect(decorativeKeys('light')).toContain('hairline');
    expect(decorativeKeys('dark')).toContain('hairline');
    expect(decorativeKeys('light-contrast')).not.toContain('hairline');
    expect(decorativeKeys('dark-contrast')).not.toContain('hairline');
  });

  test('a key added to the palette without a pair is reported (the gate can fail)', () => {
    const covered = coveredKeys(buildPairs(Palettes.light, 'light'));
    const exempt = new Set<string>(decorativeKeys('light'));
    expect(unclassifiedKeys([...PaletteKeys, 'hypothetical'], covered, exempt)).toEqual([
      'hypothetical',
    ]);
  });

  describe('unclassifiedKeys', () => {
    const covered = new Set(['a', 'b']);
    const exempt = new Set(['c']);

    test('returns the keys that are neither covered nor exempt, in order', () => {
      expect(unclassifiedKeys(['z', 'a', 'y', 'c', 'b'], covered, exempt)).toEqual([
        'z',
        'y',
      ]);
    });

    test('returns nothing when every key is covered or exempt', () => {
      expect(unclassifiedKeys(['a', 'b', 'c'], covered, exempt)).toEqual([]);
    });

    test('does not mutate its inputs', () => {
      const keys = ['x', 'a'];
      unclassifiedKeys(keys, covered, exempt);
      expect(keys).toEqual(['x', 'a']);
      expect([...covered]).toEqual(['a', 'b']);
      expect([...exempt]).toEqual(['c']);
    });
  });
});

describe('the exemptions are confirmed decorative, not quietly failing', () => {
  test.each(['light', 'dark'] as const)(
    '%s hairline is a divider: below 1.6:1 on surface and cream (a card edge, not a boundary)',
    (name) => {
      for (const ground of ['surface', 'surfaceSecondary'] as const) {
        const line = flatten(Palettes[name].hairline, Palettes[name][ground]);
        expect(contrastRatio(line, Palettes[name][ground])).toBeLessThan(1.6);
      }
    },
  );

  test.each(['light', 'dark'] as const)(
    '%s hairline would FAIL as a boundary: that is why only the contrast themes measure it',
    (name) => {
      const line = flatten(Palettes[name].hairline, Palettes[name].surface);
      expect(contrastRatio(line, Palettes[name].surface)).toBeLessThan(
        ContrastFloor.nonText,
      );
    },
  );

  test('aqua and amber are fills only on paper: never text or a line (2.0 and 1.7 on white)', () => {
    for (const fill of ['aqua', 'amber'] as const) {
      expect(contrastRatio(Palettes.light[fill], Palettes.light.surface)).toBeLessThan(
        ContrastFloor.nonText,
      );
    }
  });

  test.each(PaletteNames)('%s backdrop is a translucent scrim (8-digit hex)', (name) => {
    const backdrop = Palettes[name].backdrop;
    expect(backdrop).toMatch(/^#[0-9A-F]{6}[0-9A-F]{2}$/);
    expect(parseInt(backdrop.slice(7), 16)).toBeLessThan(255);
  });

  test.each(PaletteNames)('%s sand identifies nothing: below 3:1 on paper', (name) => {
    expect(contrastRatio(Palettes[name].sand, Palettes[name].surface)).toBeLessThan(
      ContrastFloor.nonText,
    );
  });
});

describe('the gate reproduces the measured table of C5-3 (documentation cannot drift)', () => {
  const surface = (name: (typeof PaletteNames)[number], key: keyof Palette) =>
    contrastRatio(Palettes[name][key], Palettes[name].surface);

  test.each([
    ['ink', [14.57, 15.24, 18.19, 16.38]],
    ['muted', [6.97, 7.66, 11.41, 11.83]],
    ['subtle', [5.81, 6.5, 8.41, 9.36]],
    ['accentLine', [4.04, 6.74, 7.11, 8.66]],
    ['aquaLine', [3.83, 9.25, 7.25, 10.04]],
    ['amberLine', [3.99, 10.24, 7.62, 11.53]],
    ['border', [4.22, 5.0, 8.41, 9.36]],
    ['focus', [4.57, 9.58, 18.19, 16.38]],
    ['accent', [2.82, 6.74, 2.4, 7.95]],
  ] as const)('%s on surface', (key, expected) => {
    expect(PaletteNames.map((name) => Number(surface(name, key).toFixed(2)))).toEqual([
      ...expected,
    ]);
  });

  test.each([
    ['accentInk', 'accent', [5.17, 7.47, 7.57, 8.82]],
    ['accentInk', 'accentPress', [6.07, 8.81, 8.82, 10.33]],
    ['onInk', 'ink', [14.57, 16.91, 18.19, 18.17]],
    ['ink', 'pressed', [10.84, 9.21, 10.66, 9.9]],
    ['subtle', 'surfaceSecondary', [5.24, 5.45, 7.59, 7.85]],
  ] as const)('%s on %s', (fg, bg, expected) => {
    expect(
      PaletteNames.map((name) =>
        Number(contrastRatio(Palettes[name][fg], Palettes[name][bg]).toFixed(2)),
      ),
    ).toEqual([...expected]);
  });
});

describe('the gate detects a regression (it is not vacuous)', () => {
  const run = (palette: Palette, name: (typeof PaletteNames)[number], cls: PairClass) =>
    failures(buildPairs(palette, name), cls);

  test('a muted colour that fails 4.5:1 on paper is reported', () => {
    const broken: Palette = { ...Palettes.light, muted: '#9AA6B4' };
    expect(run(broken, 'light', 'P1').map((f) => f.pair)).toContain('muted on surface');
  });

  test('a danger text that passes on paper and fails on its own tint is reported', () => {
    const broken: Palette = { ...Palettes.dark, danger: '#C9667D' };
    expect(run(broken, 'dark', 'P4').map((f) => f.pair)).toContain(
      'danger on dangerTint over surfaceSecondary',
    );
  });

  test('a 4.5:1 pair is not enough in a contrast theme', () => {
    const broken: Palette = { ...Palettes['light-contrast'], muted: '#6A7380' };
    expect(run(broken, 'light-contrast', 'P1').map((f) => f.pair)).toContain(
      'muted on surface',
    );
  });

  test('a pale focus ring is reported', () => {
    const broken: Palette = { ...Palettes.light, focus: '#F0C9C3' };
    expect(run(broken, 'light', 'P13').map((f) => f.pair)).toContain('focus on surface');
  });

  test('a scrim button disc that is too thin (.46, M-5) fails the margin test above', () => {
    const disc = flatten('#09182B75', WHITE_PHOTO);
    expect(contrastRatio('#FFFFFF', disc)).toBeLessThan(3.4);
  });

  test('a cover stop that is too light for white text is reported', () => {
    const broken: Palette = { ...Palettes.light, cover2End: '#E0603A' };
    expect(run(broken, 'light', 'P9').map((f) => f.pair)).toContain(
      'onPhoto on cover2End',
    );
  });
});

describe('Colors — what code, not a class, hands over (T453; re-pointed by T514)', () => {
  const tokens = ['canvas', 'surface'] as const;

  describe.each(PaletteNames)('%s theme', (name) => {
    const colors = Colors[name];
    const floor = isContrastTheme(name)
      ? ContrastFloor.increasedContrast
      : ContrastFloor.normalText;

    test.each(['textPrimary', 'textMuted', 'danger'] as const)(
      '%s meets the text floor on the canvas and the surface',
      (token) => {
        for (const ground of tokens) {
          expect(contrastRatio(colors[token], colors[ground])).toBeGreaterThanOrEqual(
            floor,
          );
        }
      },
    );

    test('border meets the 3:1 boundary floor on the canvas and the surface', () => {
      for (const ground of tokens) {
        expect(contrastRatio(colors.border, colors[ground])).toBeGreaterThanOrEqual(
          ContrastFloor.nonText,
        );
      }
    });

    test('accentInk meets the text floor on the accent fill', () => {
      expect(contrastRatio(colors.accentInk, colors.accent)).toBeGreaterThanOrEqual(
        floor,
      );
    });

    test('accent is a FILL: it clears 3:1 on paper, or it is the pinned exception', () => {
      const excepted = FILL_BELOW_FLOOR.some((entry) => entry.theme === name);
      const ratio = contrastRatio(colors.accent, colors.surface);
      expect(ratio >= ContrastFloor.nonText).toBe(!excepted);
    });
  });

  test('every token is classified, and all four themes expose the same tokens', () => {
    const classified = new Set<string>([
      'canvas',
      'surface',
      'textPrimary',
      'textMuted',
      'danger',
      'border',
      'accentInk',
      'accent',
    ]);
    const reference = Object.keys(Colors.light).sort();
    for (const name of PaletteNames) {
      expect(Object.keys(Colors[name]).filter((key) => !classified.has(key))).toEqual([]);
      expect(Object.keys(Colors[name]).sort()).toEqual(reference);
    }
  });
});
