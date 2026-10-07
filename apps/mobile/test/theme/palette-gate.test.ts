/**
 * T410 — contract C4-3. THE gate that keeps SC-002 standing for the Atlas palette.
 *
 * It is exhaustive over the palette in both directions:
 *
 *   1. Every pair of the C4-3 table is measured in each of the four themes. The pair
 *      table is BUILT in `palette-gate-support.ts`, so the keys a pair "covers" are the
 *      keys it really measures.
 *   2. A Palette key that is neither covered by a measured pair nor named in the
 *      enumerated exemption allowlist (`gate-exemptions.ts`) fails the suite, so a token
 *      cannot be added unmeasured. The allowlist is a list, never a skipped assertion.
 *
 * Coloured text, and its 15% soft chip, is measured on EVERY neutral fill it can sit on:
 * canvas, surface, overlay, field fill and surface-tertiary.
 *
 * The focus ring is gated on the NEUTRAL fills it touches only (canvas, surface, field
 * fill). It is drawn with an offset gap of the surrounding neutral between the ring and
 * the control (`FocusRing.offset`), so it never touches an accent fill; a ring between
 * a pale canvas and a mid-tone accent cannot clear 3:1 on both (that needs the accent
 * 9:1 or more from the canvas), which is why the accent is not a ground (C4-3).
 *
 * Derived fills (soft chips, hover, pressed) carry the 0.1 tolerance stated in C4-2.
 */
import { GlobeColors } from '@/constants/theme';
import { ContrastFloor, contrastRatio } from '@/theme/contrast';
import { PaletteKeys, PaletteNames, Palettes, type Palette } from '@/theme/palette';
import { FocusRing } from '@/theme/shape';

import { DECORATIVE_PALETTE_KEYS, PINNED_SOFT_CHIP_EXCEPTIONS } from './gate-exemptions';
import {
  BLEND_TOLERANCE,
  COLOUR_TEXT,
  FOCUS_RING_GROUNDS,
  TEXT_GROUNDS,
  buildPairs,
  classesOf,
  coveredKeys,
  failures,
  isContrastTheme,
  isPinnedSoftChipException,
  softChipPair,
  unclassifiedKeys,
  type PairClass,
} from './palette-gate-support';

const BASE_SURFACES = ['canvas', 'surface'] as const;

/** The classes of the C4-3 table, written out independently of the builder. */
const EXPECTED_CLASSES: PairClass[] = [
  'text on neutral fills',
  'placeholder on field fill',
  'coloured text',
  'coloured text on its 15% soft chip',
  'label on its filled control',
  'text on derived hover and pressed fills',
  'large text',
  'field border',
  'filled control',
  'row cue',
  'focus ring',
  'status mark',
];

/** Classes that are text, not boundaries or marks: the ones held to 7:1 in contrast themes. */
const TEXT_CLASSES: PairClass[] = [
  'text on neutral fills',
  'placeholder on field fill',
  'coloured text',
  'coloured text on its 15% soft chip',
  'label on its filled control',
  'text on derived hover and pressed fills',
  'large text',
];

const ALL_FIVE_GROUNDS = [
  'canvas',
  'overlay',
  'surface',
  'surfaceSecondary',
  'surfaceTertiary',
];

describe('palette contrast gate — contract C4-3', () => {
  describe.each(PaletteNames)('%s theme', (name) => {
    const palette = Palettes[name];
    const pairs = buildPairs(palette, name);

    test.each(classesOf(pairs))('every "%s" pair meets its floor', (cls) => {
      expect(failures(pairs, cls)).toEqual([]);
    });

    test('measures a pair in every class of the C4-3 table', () => {
      expect(classesOf(pairs)).toEqual(expect.arrayContaining(EXPECTED_CLASSES));
    });
  });

  describe('increased-contrast themes hold the 7:1 text floor (FR-027)', () => {
    test.each(['light-contrast', 'dark-contrast'] as const)(
      '%s: every text pair is gated at 7:1, not 4.5:1',
      (name) => {
        const textPairs = buildPairs(Palettes[name], name).filter((pair) =>
          TEXT_CLASSES.includes(pair.cls),
        );
        expect(textPairs.length).toBeGreaterThan(0);
        expect(
          textPairs.every((pair) => pair.floor >= ContrastFloor.increasedContrast),
        ).toBe(true);
      },
    );

    test.each(['light', 'dark'] as const)('%s keeps the 4.5:1 floor, not 7:1', (name) => {
      const textPair = buildPairs(Palettes[name], name).find(
        (pair) => pair.cls === 'text on neutral fills',
      );
      expect(textPair?.floor).toBe(ContrastFloor.normalText);
    });
  });

  describe('derived fills carry the stated blend tolerance (C4-2)', () => {
    test.each(PaletteNames)(
      '%s: soft, hover and pressed pairs are gated 0.1 higher',
      (name) => {
        const pairs = buildPairs(Palettes[name], name);
        const base = isContrastTheme(name)
          ? ContrastFloor.increasedContrast
          : ContrastFloor.normalText;
        const derived = pairs.filter(
          (pair) =>
            pair.cls === 'coloured text on its 15% soft chip' ||
            pair.cls === 'text on derived hover and pressed fills',
        );
        expect(derived.length).toBeGreaterThan(0);
        expect(derived.every((pair) => pair.floor === base + BLEND_TOLERANCE)).toBe(true);
      },
    );
  });

  describe('coloured text is measured on every neutral fill it can sit on', () => {
    test('the ground list is canvas, surface, overlay, field fill and surface-tertiary', () => {
      expect([...TEXT_GROUNDS].sort()).toEqual([...ALL_FIVE_GROUNDS].sort());
    });

    test.each(PaletteNames)(
      '%s: each coloured text is gated on all five grounds',
      (name) => {
        const pairs = buildPairs(Palettes[name], name).filter(
          (pair) => pair.cls === 'coloured text',
        );
        for (const colour of COLOUR_TEXT) {
          const grounds = pairs
            .filter((pair) => pair.keys[0] === colour)
            .map((pair) => pair.ground)
            .sort();
          expect({ colour, grounds }).toEqual({
            colour,
            grounds: [...ALL_FIVE_GROUNDS].sort(),
          });
        }
      },
    );

    test.each(PaletteNames)(
      '%s: each soft chip is gated on all five grounds, bar the pinned exception',
      (name) => {
        const pairs = buildPairs(Palettes[name], name).filter(
          (pair) => pair.cls === 'coloured text on its 15% soft chip',
        );
        for (const colour of COLOUR_TEXT) {
          const expected = ALL_FIVE_GROUNDS.filter(
            (ground) => !isPinnedSoftChipException(name, colour, ground as keyof Palette),
          ).map((ground) => `${ground} + 15% ${colour}`);
          const grounds = pairs
            .filter((pair) => pair.keys[0] === colour)
            .map((pair) => pair.ground)
            .sort();
          expect({ colour, grounds }).toEqual({ colour, grounds: expected.sort() });
        }
      },
    );
  });

  describe('the one pinned soft-chip exception is real and narrow', () => {
    const exceptions = PINNED_SOFT_CHIP_EXCEPTIONS.flatMap((exception) =>
      exception.colours.flatMap((colour) =>
        exception.grounds.map((ground) => ({
          theme: exception.theme,
          colour,
          ground,
        })),
      ),
    );

    test('it names only the light accent family over field fill and surface-tertiary', () => {
      expect(PINNED_SOFT_CHIP_EXCEPTIONS).toEqual([
        {
          theme: 'light',
          colours: ['accent', 'link', 'statusActive'],
          grounds: ['surfaceSecondary', 'surfaceTertiary'],
        },
      ]);
    });

    test.each(exceptions)(
      'the excepted pair $theme $colour on $ground really falls below its floor',
      ({ theme, colour, ground }) => {
        // If this ever passes, the exception is dead weight and must be deleted.
        const pair = softChipPair(Palettes[theme], theme, colour, ground);
        expect(pair.ratio).toBeLessThan(pair.floor);
      },
    );

    test.each(exceptions)(
      'the excepted colour $colour is the pinned globe accent, not a colour that merely failed',
      ({ theme, colour }) => {
        expect(Palettes[theme][colour]).toBe(GlobeColors[theme].active);
      },
    );
  });

  describe('exhaustiveness — a new token cannot slip through unmeasured', () => {
    const exempt = new Set<string>(DECORATIVE_PALETTE_KEYS);

    test.each(PaletteNames)(
      'every %s key is measured by a pair or allowlisted',
      (name) => {
        const covered = coveredKeys(buildPairs(Palettes[name], name));
        expect(unclassifiedKeys(PaletteKeys, covered, exempt)).toEqual([]);
      },
    );

    test('the allowlist names real keys and hides no measured key', () => {
      for (const name of PaletteNames) {
        const covered = coveredKeys(buildPairs(Palettes[name], name));
        for (const key of DECORATIVE_PALETTE_KEYS) {
          expect(PaletteKeys).toContain(key);
          expect(covered.has(key)).toBe(false);
        }
      }
    });

    test('the allowlist is exactly separator and backdrop', () => {
      expect([...DECORATIVE_PALETTE_KEYS]).toEqual(['separator', 'backdrop']);
    });

    test('a key added to the palette without a pair is reported (the gate can fail)', () => {
      // The same function the exhaustiveness check above runs.
      const covered = coveredKeys(buildPairs(Palettes.light, 'light'));
      expect(unclassifiedKeys([...PaletteKeys, 'hypothetical'], covered, exempt)).toEqual(
        ['hypothetical'],
      );
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

      test('returns everything when nothing is covered or exempt', () => {
        expect(unclassifiedKeys(['a', 'b'], new Set(), new Set())).toEqual(['a', 'b']);
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

  describe('the focus ring is drawn with an offset gap (C4-3)', () => {
    test('the ring is separated from the control by a gap of at least 2 dp', () => {
      // The gate does not measure the ring against an accent fill BECAUSE of this gap:
      // if the offset were removed, the exemption would silently become a hole.
      expect(FocusRing.offset).toBeGreaterThanOrEqual(2);
    });

    test('the grounds are canvas, surface and field fill, and the accent is none of them', () => {
      expect([...FOCUS_RING_GROUNDS]).toEqual(['canvas', 'surface', 'surfaceSecondary']);
      expect(FOCUS_RING_GROUNDS).not.toContain('accent');
    });

    test.each(PaletteNames)(
      '%s: the measured focus-ring grounds are exactly those three neutrals',
      (name) => {
        const ringPairs = buildPairs(Palettes[name], name).filter(
          (pair) => pair.cls === 'focus ring',
        );
        expect(ringPairs.map((pair) => pair.ground).sort()).toEqual([
          'canvas',
          'surface',
          'surfaceSecondary',
        ]);
        expect(ringPairs.map((pair) => pair.label).sort()).toEqual([
          'focus on canvas',
          'focus on surface',
          'focus on surfaceSecondary',
        ]);
      },
    );
  });

  describe('the exemptions are confirmed decorative, not quietly failing', () => {
    test.each(PaletteNames)('%s separator identifies nothing (below 3:1)', (name) => {
      const palette = Palettes[name];
      for (const ground of BASE_SURFACES) {
        expect(contrastRatio(palette.separator, palette[ground])).toBeLessThan(
          ContrastFloor.nonText,
        );
      }
    });

    test.each(['light', 'dark'] as const)(
      '%s separator is a hairline: below 1.5:1 on canvas and surface',
      (name) => {
        const palette = Palettes[name];
        for (const ground of BASE_SURFACES) {
          expect(contrastRatio(palette.separator, palette[ground])).toBeLessThan(1.5);
        }
      },
    );

    test.each(PaletteNames)(
      '%s backdrop is a translucent scrim (8-digit hex)',
      (name) => {
        const backdrop = Palettes[name].backdrop;
        expect(backdrop).toMatch(/^#[0-9A-F]{6}[0-9A-F]{2}$/);
        expect(parseInt(backdrop.slice(7), 16)).toBeLessThan(255);
      },
    );
  });

  describe('the gate detects a regression (it is not vacuous)', () => {
    test('a muted colour that fails 4.5:1 on canvas is reported', () => {
      const broken: Palette = { ...Palettes.light, muted: '#B8BFC9' };
      const found = failures(buildPairs(broken, 'light'), 'text on neutral fills');
      expect(found.length).toBeGreaterThan(0);
      expect(found.map((f) => f.pair)).toContain('muted on canvas');
    });

    test('a soft chip that fails only once tinted is reported', () => {
      // #9A5B00 passes on canvas (5.0:1) and fails on its own 15% chip (4.35:1):
      // the planning-ink correction of research D4-01.
      const broken: Palette = { ...Palettes.light, statusPlanningInk: '#9A5B00' };
      const found = failures(
        buildPairs(broken, 'light'),
        'coloured text on its 15% soft chip',
      );
      expect(found.map((f) => f.pair.split(' on ')[0])).toContain('statusPlanningInk');
    });

    test('a coloured text that passes on canvas and fails on the field fill is reported', () => {
      // #666F7B is 4.55:1 on canvas and 4.28:1 on the field fill.
      const broken: Palette = { ...Palettes.light, pending: '#666F7B' };
      const pairs = buildPairs(broken, 'light');
      expect(failures(pairs, 'coloured text').map((f) => f.pair)).toEqual([
        'pending on surfaceSecondary',
        'pending on surfaceTertiary',
      ]);
    });

    test('a pressed fill that swallows its label is reported', () => {
      const broken: Palette = { ...Palettes.light, accentInk: '#9DB4E8' };
      const found = failures(
        buildPairs(broken, 'light'),
        'text on derived hover and pressed fills',
      );
      expect(found.length).toBeGreaterThan(0);
    });

    test('a focus ring too pale to see on the field fill is reported', () => {
      const broken: Palette = { ...Palettes.light, focus: '#E0DCD2' };
      const found = failures(buildPairs(broken, 'light'), 'focus ring');
      expect(found.map((f) => f.pair)).toContain('focus on surfaceSecondary');
    });

    test('a 4.5:1 pair is not enough in a contrast theme', () => {
      const broken: Palette = { ...Palettes['light-contrast'], muted: '#6B7482' };
      const found = failures(
        buildPairs(broken, 'light-contrast'),
        'text on neutral fills',
      );
      expect(found.map((f) => f.pair)).toContain('muted on canvas');
    });
  });
});
