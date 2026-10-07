/**
 * T410 — data-model §1, contract C4-1 and C4-4.
 *
 * The palette is the one place a colour is authored. These tests pin its shape (every
 * key in all four themes), the invariants the spec states for it (tinted neutrals,
 * status colours shared with the globe, increased contrast raising rather than
 * replacing the hue) and the legacy `Colors` re-pointing, so that an unmigrated screen
 * is already rendered in Atlas colours (research D4-12).
 */
import { Colors, GlobeColors } from '@/constants/theme';
import { contrastRatio } from '@/theme/contrast';
import { PaletteKeys, PaletteNames, Palettes, type Palette } from '@/theme/palette';

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
    expect([...PaletteKeys].sort()).toEqual([...DATA_MODEL_KEYS].sort());
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
    expect(() => {
      (Palettes.light as { canvas: string }).canvas = '#123456';
    }).toThrow(TypeError);
  });
});

describe('Colors is re-pointed at the palette (research D4-12)', () => {
  test('keeps every legacy key so unmigrated screens keep compiling', () => {
    const legacy = [
      'canvas',
      'surface',
      'surfaceSunk',
      'shadowLight',
      'shadowDark',
      'textPrimary',
      'textMuted',
      'border',
      'borderStrong',
      'accent',
      'accentInk',
      'danger',
    ];
    for (const theme of BASE_THEMES) {
      expect(Object.keys(Colors[theme]).sort()).toEqual([...legacy].sort());
    }
  });

  test.each(BASE_THEMES)('%s legacy keys read the Atlas palette', (theme) => {
    const palette = Palettes[theme];
    expect(Colors[theme]).toEqual({
      canvas: palette.canvas,
      surface: palette.surface,
      surfaceSunk: palette.surfaceSecondary,
      shadowLight: palette.canvas,
      shadowDark: palette.canvas,
      textPrimary: palette.ink,
      textMuted: palette.muted,
      border: palette.border,
      borderStrong: palette.border,
      accent: palette.accent,
      accentInk: palette.accentInk,
      danger: palette.danger,
    });
  });

  test.each(BASE_THEMES)(
    '%s leftover shadows are invisible: both tones are the canvas colour',
    (theme) => {
      expect(Colors[theme].shadowLight).toBe(Colors[theme].canvas);
      expect(Colors[theme].shadowDark).toBe(Colors[theme].canvas);
    },
  );
});
