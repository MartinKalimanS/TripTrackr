/**
 * T513 — feature 005, data-model section 1, contract C5-1, C5-3 and C5-5.
 *
 * The palette is the one place a colour is authored. These tests pin its shape (every
 * key in all four themes, the Sunrise key set of data-model section 1), the invariants
 * the spec states for it (white paper in the light themes, the shared values, the
 * aliases that are not separate values, increased contrast raising rather than replacing
 * the hue, status colours shared with the globe) and the `Colors` tokens, which read the
 * palette of each of the four themes (004 T453, research D4-12) and keep their keys.
 */
import { Colors, GlobeColors } from '@/constants/theme';
import { contrastRatio } from '@/theme/contrast';
import {
  PaletteKeys,
  PaletteNames,
  Palettes,
  resolvePaletteName,
  type Palette,
} from '@/theme/palette';

/** data-model section 1, in document order. The independent oracle for the key set. */
const DATA_MODEL_KEYS = [
  // Surfaces
  'canvas',
  'surface',
  'surfaceSecondary',
  'sand',
  'overlay',
  'pressed',
  // Lines
  'hairline',
  'grab',
  'border',
  'focus',
  'backdrop',
  // Ink
  'ink',
  'muted',
  'subtle',
  'onInk',
  // Coral
  'accent',
  'accentInk',
  'accentPress',
  'accentLine',
  'accentText',
  'accentTint',
  // Aqua
  'aqua',
  'aquaLine',
  'aquaInk',
  'aquaTint',
  // Amber
  'amber',
  'amberLine',
  'amberInk',
  'amberTint',
  // States
  'danger',
  'dangerInk',
  'dangerTint',
  'success',
  'successTint',
  // Trip status and sync
  'statusActive',
  'statusPlanning',
  'statusPlanningInk',
  'statusPast',
  'pending',
  'link',
  'placeholder',
  // Over photographs
  'onPhoto',
  'scrimButton',
  'scrimButtonLine',
  'ring',
  // Skeleton and toast
  'skeleton',
  'skeletonHighlight',
  'toastSurface',
  'toastInk',
  // Stamp inks and generated-cover stops
  'stampCoral',
  'stampNavy',
  'stampTeal',
  'stampGreen',
  'cover1Start',
  'cover1End',
  'cover2Start',
  'cover2End',
  'cover3Start',
  'cover3End',
] as const;

/** 004 keys that data-model section 1 removes (a kit variable now reads another key). */
const REMOVED_KEYS = [
  'surfaceTertiary',
  'separator',
  'successInk',
  'warning',
  'warningInk',
] as const;

/** Keys that may carry an alpha channel: tints, scrims and alpha lines (C5-1). */
const TRANSLUCENT_KEYS = [
  'hairline',
  'grab',
  'backdrop',
  'accentTint',
  'aquaTint',
  'amberTint',
  'dangerTint',
  'successTint',
  'scrimButton',
  'scrimButtonLine',
  'skeletonHighlight',
] as const;

/** Translucent in EVERY theme (a scrim or an alpha line), not only where a tint is a wash. */
const ALWAYS_TRANSLUCENT = [
  'hairline',
  'grab',
  'backdrop',
  'scrimButton',
  'scrimButtonLine',
  'skeletonHighlight',
] as const;

/** Tints: an opaque colour in the light themes, an alpha wash in the dark ones. */
const TINTS = [
  ['accentTint', 0x29],
  ['amberTint', 0x29],
  ['aquaTint', 0x24],
  ['dangerTint', 0x24],
  ['successTint', 0x24],
] as const;

/** The values light and dark share by design (a fill on a photograph, a scrim, a cover). */
const SHARED_LIGHT_DARK = [
  'aqua',
  'backdrop',
  'onPhoto',
  'scrimButtonLine',
  'cover1Start',
  'cover1End',
  'cover2Start',
  'cover2End',
  'cover3Start',
  'cover3End',
] as const;

const BASE_THEMES = ['light', 'dark'] as const;
const LIGHT_THEMES = ['light', 'light-contrast'] as const;
const DARK_THEMES = ['dark', 'dark-contrast'] as const;

describe('palette names and keys', () => {
  test('there are exactly four themes', () => {
    expect([...PaletteNames]).toEqual([
      'light',
      'dark',
      'light-contrast',
      'dark-contrast',
    ]);
    expect(Object.keys(Palettes).sort()).toEqual([...PaletteNames].sort());
  });

  test('the key list is the data-model section 1 list, nothing added or dropped', () => {
    // DATA_MODEL_KEYS is the independent oracle: PaletteKeys is derived from the data, so
    // this is what catches a key added to (or dropped from) the data without the spec.
    expect([...PaletteKeys].sort()).toEqual([...DATA_MODEL_KEYS].sort());
    expect(DATA_MODEL_KEYS).toHaveLength(61);
  });

  test.each(REMOVED_KEYS)('the 004 key %s is gone (data-model section 1)', (key) => {
    expect(PaletteKeys).not.toContain(key);
    for (const name of PaletteNames) expect(Palettes[name]).not.toHaveProperty(key);
  });

  test('PaletteKeys is derived from the palette data, in its order, and is frozen', () => {
    expect([...PaletteKeys]).toEqual(Object.keys(Palettes.light));
    expect(Object.isFrozen(PaletteKeys)).toBe(true);
  });

  test('every theme lists its keys in the same order, so a diff reads across themes', () => {
    for (const name of PaletteNames) {
      expect(Object.keys(Palettes[name])).toEqual([...PaletteKeys]);
    }
  });

  test.each(PaletteNames)('%s defines every key and no other', (name) => {
    expect(Object.keys(Palettes[name]).sort()).toEqual([...PaletteKeys].sort());
  });

  test('the keys that may be translucent are exactly the tints, scrims and alpha lines', () => {
    // The generator's own list is pinned in theme-css-sync.test.ts; this is the palette side.
    const translucent = PaletteKeys.filter((key) =>
      PaletteNames.some((name) => Palettes[name][key].length === 9),
    );
    expect(translucent.sort()).toEqual([...TRANSLUCENT_KEYS].sort());
  });

  test.each(PaletteNames)('%s holds only uppercase hex values', (name) => {
    for (const key of PaletteKeys) {
      const value = Palettes[name][key];
      // An alpha channel (`#RRGGBBAA`) only where C5-1 allows one: tints, scrims, alpha lines.
      const pattern = (TRANSLUCENT_KEYS as readonly string[]).includes(key)
        ? /^#[0-9A-F]{6}(?:[0-9A-F]{2})?$/
        : /^#[0-9A-F]{6}$/;
      expect({ key, value, ok: pattern.test(value) }).toEqual({ key, value, ok: true });
    }
  });

  test.each(PaletteNames)('%s: scrims and alpha lines carry an alpha channel', (name) => {
    for (const key of ALWAYS_TRANSLUCENT) {
      const value = Palettes[name][key];
      expect(value).toMatch(/^#[0-9A-F]{8}$/);
      expect(parseInt(value.slice(7), 16)).toBeLessThan(255);
    }
  });
});

describe('palette invariants (data-model section 1, C5-3)', () => {
  test.each(LIGHT_THEMES)(
    '%s paper is pure white: canvas and surface are #FFFFFF',
    (name) => {
      // The 004 invariant "no pure white in the base themes" is superseded (spec, Amendments).
      expect(Palettes[name].canvas).toBe('#FFFFFF');
      expect(Palettes[name].surface).toBe('#FFFFFF');
    },
  );

  test.each(DARK_THEMES)(
    '%s is Nightfall: canvas #0A1626 over a #0F2037 surface',
    (name) => {
      expect(Palettes[name].canvas).toBe('#0A1626');
      expect(Palettes[name].surface).toBe('#0F2037');
    },
  );

  test.each(PaletteNames)('%s: no key is pure black', (name) => {
    const black = PaletteKeys.filter(
      (key) => Palettes[name][key].slice(0, 7) === '#000000',
    );
    expect(black).toEqual([]);
  });

  test.each(PaletteNames)('%s: onPhoto is #FFFFFF, opaque', (name) => {
    expect(Palettes[name].onPhoto).toBe('#FFFFFF');
  });

  test('the label on an ink fill: white in light-contrast, ink is white in dark-contrast', () => {
    expect(Palettes['light-contrast'].onInk).toBe('#FFFFFF');
    expect(Palettes['dark-contrast'].ink).toBe('#FFFFFF');
  });

  test.each(PaletteNames)('%s: the primary label is navy, never white (M-2)', (name) => {
    const palette = Palettes[name];
    expect(palette.accentInk).not.toBe('#FFFFFF');
    expect(contrastRatio(palette.accentInk, palette.accent)).toBeGreaterThan(
      contrastRatio('#FFFFFF', palette.accent),
    );
  });

  test.each(DARK_THEMES)('%s tints are alpha washes over the ground', (name) => {
    for (const [key, alpha] of TINTS) {
      const value = Palettes[name][key];
      expect({ key, value: value.length }).toEqual({ key, value: 9 });
      expect({ key, alpha: parseInt(value.slice(7), 16) }).toEqual({ key, alpha });
    }
  });

  test.each(LIGHT_THEMES)('%s tints are opaque colours', (name) => {
    for (const [key] of TINTS) {
      expect({ key, value: Palettes[name][key].length }).toEqual({ key, value: 7 });
    }
  });

  test('light and dark share exactly the values that are the same by design', () => {
    const shared = PaletteKeys.filter(
      (key) => Palettes.light[key] === Palettes.dark[key],
    );
    expect(shared.sort()).toEqual([...SHARED_LIGHT_DARK].sort());
  });

  test.each([
    ['light', 'light-contrast'],
    ['dark', 'dark-contrast'],
  ] as const)(
    '%s -> %s raises the ratio of every text and boundary colour on the canvas',
    (base, contrast) => {
      const raised: (keyof Palette)[] = [
        'ink',
        'muted',
        'subtle',
        'accentText',
        'aquaInk',
        'amberInk',
        'danger',
        'success',
        'border',
      ];
      const regressions = raised.filter(
        (key) =>
          contrastRatio(Palettes[contrast][key], Palettes[contrast].canvas) <=
          contrastRatio(Palettes[base][key], Palettes[base].canvas),
      );
      expect(regressions).toEqual([]);
    },
  );

  test('the contrast themes keep the hue of their base: only the coral fill is lightened', () => {
    // M-1: the increased-contrast coral is LIGHTER (#FF8466), not darker, so the label on it
    // gains contrast; the edge ring (accentLine) carries the boundary instead.
    expect(Palettes['light-contrast'].accent).toBe('#FF8466');
    expect(Palettes['dark-contrast'].accent).not.toBe(Palettes.dark.accent);
  });

  test('the palette is deeply frozen: a screen cannot mutate a token', () => {
    expect(Object.isFrozen(Palettes)).toBe(true);
    for (const name of PaletteNames) expect(Object.isFrozen(Palettes[name])).toBe(true);
    const before = Palettes.light.canvas;
    try {
      (Palettes.light as { canvas: string }).canvas = '#123456';
    } catch {
      // Strict mode throws a TypeError; sloppy mode ignores the write. Either is fine.
    }
    expect(Palettes.light.canvas).toBe(before);
  });
});

describe('status colours and the globe (data-model section 1)', () => {
  test.each(BASE_THEMES)(
    '%s statusActive and statusPlanning equal the globe arc colours',
    (name) => {
      // So a status reads the same on a card and on the globe. `statusPast` is `muted`
      // (text) and is not an arc colour: a past arc shares the active hue and is told apart
      // by its width (C5-11).
      expect(Palettes[name].statusActive).toBe(GlobeColors[name].active);
      expect(Palettes[name].statusPlanning).toBe(GlobeColors[name].planning);
    },
  );

  test.each(BASE_THEMES)('%s: the globe past arc starts on the coral line', (name) => {
    expect(GlobeColors[name].past).toBe(Palettes[name].accentLine);
  });
});

describe('resolvePaletteName — contract C4-4', () => {
  test.each([
    ['light', false, 'light'],
    ['dark', false, 'dark'],
    ['light', true, 'light-contrast'],
    ['dark', true, 'dark-contrast'],
  ] as const)('%s with more contrast=%s resolves to %s', (scheme, more, expected) => {
    expect(resolvePaletteName(scheme, more)).toBe(expected);
  });

  test('every resolved name selects a defined palette', () => {
    for (const scheme of BASE_THEMES)
      for (const more of [false, true])
        expect(Palettes[resolvePaletteName(scheme, more)]).toBeDefined();
  });
});

describe('Colors reads the palette of every theme (T453, research D4-12; T514 re-points it)', () => {
  test('keeps exactly the legacy keys a consumer outside the kit reads', () => {
    const keys = [
      'canvas',
      'surface',
      'textPrimary',
      'textMuted',
      'border',
      'accent',
      'accentInk',
      'danger',
    ];
    expect(Object.keys(Colors).sort()).toEqual([...PaletteNames].sort());
    for (const theme of PaletteNames) {
      expect(Object.keys(Colors[theme]).sort()).toEqual([...keys].sort());
    }
  });

  test.each(PaletteNames)('%s keys read the Sunrise palette', (theme) => {
    const palette = Palettes[theme];
    expect(Colors[theme]).toEqual({
      canvas: palette.canvas,
      surface: palette.surface,
      textPrimary: palette.ink,
      textMuted: palette.muted,
      border: palette.border,
      accent: palette.accent,
      accentInk: palette.accentInk,
      danger: palette.danger,
    });
  });
});
