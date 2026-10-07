/**
 * T410 — contract C4-3. THE gate that keeps SC-002 standing for the Atlas palette.
 *
 * It is exhaustive over the palette in both directions:
 *
 *   1. Every pair of the C4-3 table is measured in each of the four themes. The pair
 *      list is BUILT here, so the keys a pair "covers" are the keys it really measures.
 *   2. A Palette key that is neither covered by a measured pair nor named in the
 *      enumerated exemption allowlist (`gate-exemptions.ts`) fails the suite, so a token
 *      cannot be added unmeasured. The allowlist is a list, never a skipped assertion.
 *
 * The focus ring is gated on the NEUTRAL fills it touches only (canvas, surface, field
 * fill). It is drawn with an offset gap of the surrounding neutral between the ring and
 * the control (`FocusRing.offset`), so it never touches an accent fill; a ring between
 * a pale canvas and a mid-tone accent cannot clear 3:1 on both (that needs the accent
 * 9:1 or more from the canvas), which is why the accent is not a ground (C4-3).
 *
 * Derived fills (soft chips, hover, pressed) are what the kit computes with
 * `color-mix(in oklab, ...)`; this gate composites them in sRGB with `blend`, so those
 * pairs carry the 0.1 tolerance stated in C4-2 on top of their floor.
 */
import { blend, ContrastFloor, contrastRatio } from '@/theme/contrast';
import {
  PaletteKeys,
  PaletteNames,
  Palettes,
  type Palette,
  type PaletteName,
} from '@/theme/palette';
import { FocusRing } from '@/theme/shape';

import { DECORATIVE_PALETTE_KEYS } from './gate-exemptions';

type Key = keyof Palette;

/** Rounding differences between sRGB compositing and the kit's OKLAB mix (C4-2). */
const BLEND_TOLERANCE = 0.1;
/** The kit's soft chip: `color-mix(in oklab, var(--accent) 15%, transparent)`. */
const SOFT_ALPHA = 0.15;
/** The kit's derived hover (default, 4%) and pressed (accent and field, 10%) mixes. */
const HOVER_ALPHA = 0.04;
const PRESSED_ALPHA = 0.1;

const NEUTRAL_FILLS = [
  'canvas',
  'surface',
  'surfaceSecondary',
  'surfaceTertiary',
  'overlay',
] as const satisfies readonly Key[];
const BASE_SURFACES = ['canvas', 'surface'] as const satisfies readonly Key[];
/** Colours the product sets as text, on canvas and surface (and on their soft chip). */
const COLOUR_TEXT = [
  'accent',
  'link',
  'danger',
  'success',
  'warning',
  'statusActive',
  'statusPast',
  'statusPlanningInk',
  'pending',
] as const satisfies readonly Key[];
/** Filled controls and the label that sits on each. */
const FILLS_WITH_LABEL = [
  ['accent', 'accentInk'],
  ['danger', 'dangerInk'],
  ['success', 'successInk'],
  ['warning', 'warningInk'],
] as const satisfies readonly (readonly [Key, Key])[];

interface Pair {
  cls: string;
  label: string;
  /** Every Palette key this pair measures. Coverage is derived from this. */
  keys: Key[];
  floor: number;
  ratio: number;
}

type PairClass =
  | 'text on neutral fills'
  | 'placeholder on field fill'
  | 'coloured text'
  | 'coloured text on its 15% soft chip'
  | 'label on its filled control'
  | 'text on derived hover and pressed fills'
  | 'large text'
  | 'field border'
  | 'boundary explicit (contrast themes)'
  | 'filled control'
  | 'row cue'
  | 'focus ring'
  | 'status mark';

function isContrastTheme(name: PaletteName): boolean {
  return name.endsWith('-contrast');
}

function pairBuilder(palette: Palette, name: PaletteName) {
  const contrast = isContrastTheme(name);
  const textFloor = contrast ? ContrastFloor.increasedContrast : ContrastFloor.normalText;
  const largeFloor = contrast ? ContrastFloor.increasedContrast : ContrastFloor.largeText;
  const pairs: Pair[] = [];

  const add = (
    cls: PairClass,
    label: string,
    keys: Key[],
    floor: number,
    foreground: string,
    background: string,
  ) => {
    pairs.push({
      cls,
      label,
      keys,
      floor,
      ratio: contrastRatio(foreground, background),
    });
  };

  const plain = (cls: PairClass, fg: Key, bg: Key, floor: number) =>
    add(cls, `${fg} on ${bg}`, [fg, bg], floor, palette[fg], palette[bg]);

  const derived = (
    cls: PairClass,
    fg: Key,
    mixed: Key,
    fill: Key,
    alpha: number,
    floor: number,
  ) =>
    add(
      cls,
      `${fg} on ${fill} + ${Math.round(alpha * 100)}% ${mixed}`,
      [fg, mixed, fill],
      floor + BLEND_TOLERANCE,
      palette[fg],
      blend(palette[mixed], palette[fill], alpha),
    );

  return { pairs, textFloor, largeFloor, contrast, plain, derived };
}

/** Every pair of contract C4-3 for one theme, with the floor that theme holds. */
function buildPairs(palette: Palette, name: PaletteName): Pair[] {
  const { pairs, textFloor, largeFloor, contrast, plain, derived } = pairBuilder(
    palette,
    name,
  );

  for (const text of ['ink', 'muted'] as const)
    for (const fill of NEUTRAL_FILLS)
      plain('text on neutral fills', text, fill, textFloor);

  plain('placeholder on field fill', 'placeholder', 'surfaceSecondary', textFloor);

  for (const colour of COLOUR_TEXT)
    for (const surface of BASE_SURFACES) {
      plain('coloured text', colour, surface, textFloor);
      derived(
        'coloured text on its 15% soft chip',
        colour,
        colour,
        surface,
        SOFT_ALPHA,
        textFloor,
      );
    }

  for (const [fill, label] of FILLS_WITH_LABEL)
    plain('label on its filled control', label, fill, textFloor);

  for (const alpha of [HOVER_ALPHA, PRESSED_ALPHA]) {
    for (const fill of NEUTRAL_FILLS) {
      derived(
        'text on derived hover and pressed fills',
        'ink',
        'ink',
        fill,
        alpha,
        textFloor,
      );
      derived(
        'text on derived hover and pressed fills',
        'muted',
        'ink',
        fill,
        alpha,
        textFloor,
      );
    }
    derived(
      'text on derived hover and pressed fills',
      'placeholder',
      'ink',
      'surfaceSecondary',
      alpha,
      textFloor,
    );
    for (const [fill, label] of FILLS_WITH_LABEL)
      derived(
        'text on derived hover and pressed fills',
        label,
        label,
        fill,
        alpha,
        textFloor,
      );
  }

  for (const surface of BASE_SURFACES) {
    plain('large text', 'ink', surface, largeFloor);
    plain('large text', 'accent', surface, largeFloor);
  }

  for (const fill of ['canvas', 'surface', 'surfaceSecondary'] as const) {
    plain('field border', 'border', fill, ContrastFloor.nonText);
    // FR-027: "boundaries MUST be explicit" under increased contrast. Stricter than C4-3.
    if (contrast) plain('boundary explicit (contrast themes)', 'border', fill, 4.5);
  }

  for (const surface of BASE_SURFACES)
    plain('filled control', 'accent', surface, ContrastFloor.nonText);
  plain('row cue', 'muted', 'surface', ContrastFloor.nonText);

  for (const ground of ['canvas', 'surface', 'surfaceSecondary'] as const)
    plain('focus ring', 'focus', ground, ContrastFloor.nonText);

  for (const mark of ['statusPlanning', 'statusActive', 'statusPast', 'pending'] as const)
    for (const surface of BASE_SURFACES)
      plain('status mark', mark, surface, ContrastFloor.nonText);

  return pairs;
}

function classesOf(pairs: Pair[]): PairClass[] {
  return [...new Set(pairs.map((pair) => pair.cls as PairClass))];
}

function failures(pairs: Pair[], cls: PairClass) {
  return pairs
    .filter((pair) => pair.cls === cls && pair.ratio < pair.floor)
    .map((pair) => ({
      pair: pair.label,
      ratio: Number(pair.ratio.toFixed(2)),
      floor: Number(pair.floor.toFixed(2)),
    }));
}

describe('palette contrast gate — contract C4-3', () => {
  describe.each(PaletteNames)('%s theme', (name) => {
    const palette = Palettes[name];
    const pairs = buildPairs(palette, name);

    test.each(classesOf(pairs))('every "%s" pair meets its floor', (cls) => {
      expect(failures(pairs, cls)).toEqual([]);
    });

    test('measures a pair in every class of the C4-3 table', () => {
      const expected: PairClass[] = [
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
      expect(classesOf(pairs)).toEqual(expect.arrayContaining(expected));
    });
  });

  describe('increased-contrast themes hold the 7:1 text floor (FR-027)', () => {
    test.each(['light-contrast', 'dark-contrast'] as const)(
      '%s: every text pair is gated at 7:1, not 4.5:1',
      (name) => {
        const pairs = buildPairs(Palettes[name], name);
        const textPairs = pairs.filter(
          (pair) =>
            pair.cls !== 'field border' &&
            pair.cls !== 'boundary explicit (contrast themes)' &&
            pair.cls !== 'filled control' &&
            pair.cls !== 'row cue' &&
            pair.cls !== 'focus ring' &&
            pair.cls !== 'status mark',
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

  describe('exhaustiveness — a new token cannot slip through unmeasured', () => {
    const exempt = new Set<string>(DECORATIVE_PALETTE_KEYS);

    test.each(PaletteNames)(
      'every %s key is measured by a pair or allowlisted',
      (name) => {
        const covered = new Set<string>(
          buildPairs(Palettes[name], name).flatMap((pair) => pair.keys),
        );
        const unclassified = PaletteKeys.filter(
          (key) => !covered.has(key) && !exempt.has(key),
        );
        expect(unclassified).toEqual([]);
      },
    );

    test('the allowlist names real keys and hides no measured key', () => {
      for (const name of PaletteNames) {
        const covered = new Set<string>(
          buildPairs(Palettes[name], name).flatMap((pair) => pair.keys),
        );
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
      const covered = new Set<string>(
        buildPairs(Palettes.light, 'light').flatMap((pair) => pair.keys),
      );
      const withNewKey = [...PaletteKeys, 'hypothetical'];
      const unclassified = withNewKey.filter(
        (key) => !covered.has(key) && !exempt.has(key),
      );
      expect(unclassified).toEqual(['hypothetical']);
    });
  });

  describe('the focus ring is drawn with an offset gap (C4-3)', () => {
    test('the ring is separated from the control by a gap of at least 2 dp', () => {
      // The gate does not measure the ring against an accent fill BECAUSE of this gap:
      // if the offset were removed, the exemption would silently become a hole.
      expect(FocusRing.offset).toBeGreaterThanOrEqual(2);
    });

    test.each(PaletteNames)(
      '%s: the focus ring is gated on neutral fills only',
      (name) => {
        const ringPairs = buildPairs(Palettes[name], name).filter(
          (pair) => pair.cls === 'focus ring',
        );
        expect(ringPairs.map((pair) => pair.label).sort()).toEqual([
          'focus on canvas',
          'focus on surface',
          'focus on surfaceSecondary',
        ]);
        expect(ringPairs.every((pair) => !pair.keys.includes('accent'))).toBe(true);
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
