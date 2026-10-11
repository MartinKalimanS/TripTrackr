/**
 * T410 — data-model §1, contract C4-1 and C4-4.
 *
 * The palette is the one place a colour is authored. These tests pin its shape (every
 * key in all four themes), the invariants the spec states for it (tinted neutrals,
 * status colours shared with the globe, increased contrast raising rather than
 * replacing the hue) and the `Colors` tokens, which read the palette of each of the four
 * themes (T453, research D4-12).
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

/** data-model §1, in document order. */
const DATA_MODEL_KEYS = [
  'canvas',
  'surface',
  'surfaceSecondary',
  'surfaceTertiary',
  'overlay',
  'separator',
  'backdrop',
  'ink',
  'muted',
  'placeholder',
  'accent',
  'accentInk',
  'link',
  'border',
  'focus',
  'danger',
  'dangerInk',
  'success',
  'successInk',
  'warning',
  'warningInk',
  'statusPlanning',
  'statusPlanningInk',
  'statusActive',
  'statusPast',
  'pending',
] as const;

const BASE_THEMES = ['light', 'dark'] as const;

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

  test('the key list is the data-model §1 list, nothing added or dropped', () => {
    // DATA_MODEL_KEYS is the independent oracle: PaletteKeys is derived from the data, so
    // this is what catches a key added to (or dropped from) the data without the spec.
    expect([...PaletteKeys].sort()).toEqual([...DATA_MODEL_KEYS].sort());
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

  test.each(PaletteNames)('%s holds only uppercase hex values', (name) => {
    for (const key of PaletteKeys) {
      const value = Palettes[name][key];
      // `backdrop` is the one token that is translucent by design: a scrim.
      const pattern = key === 'backdrop' ? /^#[0-9A-F]{8}$/ : /^#[0-9A-F]{6}$/;
      expect({ key, value, ok: pattern.test(value) }).toEqual({ key, value, ok: true });
    }
  });
});

describe('palette invariants', () => {
  test.each(PaletteNames)(
    '%s uses no pure #000000 or #FFFFFF (tinted neutrals)',
    (name) => {
      const pure = PaletteKeys.filter((key) =>
        ['#000000', '#FFFFFF'].includes(Palettes[name][key].slice(0, 7)),
      );
      expect(pure).toEqual([]);
    },
  );

  test.each(BASE_THEMES)(
    '%s status colours equal the globe connection hues (data-model §1)',
    (name) => {
      expect(Palettes[name].statusActive).toBe(GlobeColors[name].active);
      expect(Palettes[name].statusPlanning).toBe(GlobeColors[name].planning);
    },
  );

  test.each(BASE_THEMES)(
    '%s accent IS the globe active-arc colour: the accent means "where you are now"',
    (name) => {
      // Atlas (research D4-01): one accent, everywhere. Retune the other pairs, never
      // this one; a focus ring needs no help from it because it is drawn with an offset.
      expect(Palettes[name].accent).toBe(GlobeColors[name].active);
      expect(Palettes[name].statusActive).toBe(GlobeColors[name].active);
    },
  );

  test('the dark accent is #7FA8FF', () => {
    expect(Palettes.dark.accent).toBe('#7FA8FF');
  });

  test('no key holds the same value in light and in dark by accident', () => {
    const shared = PaletteKeys.filter(
      (key) => Palettes.light[key] === Palettes.dark[key],
    );
    expect(shared).toEqual([]);
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
        'placeholder',
        'accent',
        'link',
        'border',
        'danger',
        'success',
        'warning',
        'statusPast',
        'statusPlanningInk',
        'statusActive',
        'pending',
      ];
      const regressions = raised.filter(
        (key) =>
          contrastRatio(Palettes[contrast][key], Palettes[contrast].canvas) <=
          contrastRatio(Palettes[base][key], Palettes[base].canvas),
      );
      expect(regressions).toEqual([]);
    },
  );

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

describe('Colors reads the palette of every theme (T453, research D4-12)', () => {
  test('has exactly the keys a consumer outside the kit reads', () => {
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

  test.each(PaletteNames)('%s keys read the Atlas palette', (theme) => {
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
