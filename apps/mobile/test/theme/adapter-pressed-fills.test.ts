/**
 * The pressed fills of the adapters, measured (feature 004, T417; contract C4-7 and
 * design-tokens C4-3; FR-019 and FR-023; review rule 5).
 *
 * `Button` and `Tappable` swap to a fixed fill the moment a press starts (FR-019). The
 * palette gate cannot see them: it lists the pairs the kit derives itself. This file
 * therefore measures the pairs the ADAPTERS choose, in all four themes, with `blend()`
 * (contract C4-2) and the palette, and it fails when a fill is changed without being
 * measured:
 *
 * 1. Distinct. The pressed fill must differ from the resting fill by at least 1.08:1 in
 *    luminance. A press is feedback, not a boundary, so it is not held to the 3:1 of a
 *    control's edge; 1.08:1 is the step below which the change cannot be told apart in
 *    daylight. The kit's own 4% hover (`default-hover`) misses it in the light theme
 *    (1.078, asserted below), which is why `secondary` does not use it.
 * 2. Readable. The label keeps its contrast ON the pressed fill: 4.5:1, or 7:1 in the
 *    increased-contrast themes (FR-023, FR-027), each plus the 0.1 tolerance C4-2 states
 *    for a blend computed in sRGB where the kit mixes in OKLAB.
 *
 * Both are measured against every ground a control can sit on (canvas, surface and
 * overlay: review rule 7 keeps soft fills off the field fill and the tertiary fill),
 * because a transparent resting fill, and a translucent pressed one, take their colour
 * from it. The kit's derivations are read from its stylesheet below, so a kit upgrade
 * that changes one fails here rather than on a device.
 */
import fs from 'node:fs';
import path from 'node:path';

import { PRESSED_CLASS, type ButtonVariant } from '@/components/ui/button';
import { TAPPABLE_PRESSED_TOKEN } from '@/components/ui/tappable';
import {
  PaletteNames,
  Palettes,
  blend,
  contrastRatio,
  type Palette,
  type PaletteName,
} from '@/theme';

/** The smallest luminance step between a resting and a pressed fill. */
const MIN_STEP = 1.08;
/** The text floors of C4-3 (4.5, and 7 in the contrast themes) plus the C4-2 tolerance. */
const TOLERANCE = 0.1;
const textFloor = (theme: PaletteName) =>
  (theme.endsWith('contrast') ? 7 : 4.5) + TOLERANCE;

const GROUNDS = ['canvas', 'surface', 'overlay'] as const;
type Ground = (typeof GROUNDS)[number];

/** What a derivation is composited over: the fill behind the control. */
type Fill = (palette: Palette, ground: string) => string;

/**
 * The kit's derived colours as sRGB blends. Each line names the variable of
 * `heroui-native/src/styles/theme.css` it stands for; `kitStylesheet` pins the formulas.
 */
const KIT: Record<string, Fill> = {
  // --color-default: var(--default); the palette maps --default to surfaceSecondary.
  default: (p) => p.surfaceSecondary,
  // --color-default-hover: mix(default 96%, default-foreground 4%)
  defaultHover: (p) => blend(p.ink, p.surfaceSecondary, 0.04),
  // --color-accent-hover: mix(accent 90%, accent-foreground 10%)
  accentHover: (p) => blend(p.accentInk, p.accent, 0.1),
  // --color-separator-secondary: mix(surface 85%, surface-foreground 15%)
  separatorSecondary: (p) => blend(p.ink, p.surface, 0.15),
  // --color-danger-soft: danger 15% over the ground; -soft-hover is 20%
  dangerSoft: (p, ground) => blend(p.danger, ground, 0.15),
  dangerSoftHover: (p, ground) => blend(p.danger, ground, 0.2),
  // --color-accent-soft-foreground: mix(accent 80%, foreground 20%); danger likewise
  accentSoftForeground: (p) => blend(p.ink, p.accent, 0.2),
  dangerSoftForeground: (p) => blend(p.ink, p.danger, 0.2),
};

/** The resting fill of each variant (the kit's: primary, secondary, ghost, danger-soft). */
const RESTING: Record<ButtonVariant, Fill> = {
  primary: (p) => p.accent,
  secondary: KIT.default,
  text: (_p, ground) => ground,
  destructive: KIT.dangerSoft,
};

/** The label colour of each variant (the kit's `button__label--variant-*`). */
const LABEL: Record<ButtonVariant, (palette: Palette) => string> = {
  primary: (p) => p.accentInk,
  secondary: (p) => KIT.accentSoftForeground(p, p.canvas),
  text: (p) => p.ink,
  destructive: (p) => KIT.dangerSoftForeground(p, p.canvas),
};

/** Every class `PRESSED_CLASS` may hold, with the colour it paints. */
const PRESSED_BY_CLASS: Record<string, Fill> = {
  'active:bg-accent-hover': KIT.accentHover,
  'active:bg-separator-secondary': KIT.separatorSecondary,
  // Danger at 5% over the ground: the soft fill drains rather than deepens, because a
  // deeper one cannot keep 7:1 under the label on an overlay in dark-contrast.
  'active:bg-danger/5': (p, ground) => blend(p.danger, ground, 0.05),
};

/** The `--color-*` token a `Tappable` paints while held, by name. */
const TAPPABLE_BY_TOKEN: Record<string, Fill> = {
  'separator-secondary': KIT.separatorSecondary,
};

const VARIANTS = ['primary', 'secondary', 'text', 'destructive'] as const;
const groundOf = (palette: Palette, ground: Ground) => palette[ground];

describe('the kit derivations this gate assumes', () => {
  const kitStylesheet = fs.readFileSync(
    path.join(
      path.dirname(require.resolve('heroui-native/package.json')),
      'src',
      'styles',
      'theme.css',
    ),
    'utf8',
  );
  const declared = (name: string) => {
    const match = new RegExp(String.raw`--color-${name}:\s*([^;]+);`).exec(kitStylesheet);
    if (!match) throw new Error(`--color-${name} is not declared by the kit`);
    return match[1].replace(/\s+/g, ' ');
  };

  test.each([
    [
      'accent-hover',
      'color-mix(in oklab, var(--accent) 90%, var(--accent-foreground) 10%)',
    ],
    [
      'separator-secondary',
      'color-mix(in oklab, var(--surface) 85%, var(--surface-foreground) 15%)',
    ],
    [
      'default-hover',
      'color-mix(in oklab, var(--default) 96%, var(--default-foreground) 4%)',
    ],
    ['danger-soft', 'color-mix(in oklab, var(--danger) 15%, transparent)'],
    ['danger-soft-hover', 'color-mix(in oklab, var(--danger) 20%, transparent)'],
    [
      'accent-soft-foreground',
      'color-mix(in oklab, var(--accent) 80%, var(--foreground) 20%)',
    ],
    [
      'danger-soft-foreground',
      'color-mix(in oklab, var(--danger) 80%, var(--foreground) 20%)',
    ],
  ])('--color-%s is %s', (name, formula) => {
    expect(declared(name)).toBe(formula);
  });
});

describe('every pressed fill an adapter asks for is modelled here', () => {
  test('Button: each variant pressed class has a derivation', () => {
    for (const variant of VARIANTS) {
      expect(Object.keys(PRESSED_BY_CLASS)).toContain(PRESSED_CLASS[variant]);
    }
  });

  test('Tappable: its pressed token has a derivation', () => {
    expect(Object.keys(TAPPABLE_BY_TOKEN)).toContain(TAPPABLE_PRESSED_TOKEN);
  });
});

describe.each(PaletteNames)('Button pressed fills in %s', (theme) => {
  const palette = Palettes[theme];

  test.each(
    VARIANTS.flatMap((variant) => GROUNDS.map((ground) => [variant, ground] as const)),
  )(
    '%s on %s: the pressed fill is a visible step from the resting fill',
    (variant, ground) => {
      const base = groundOf(palette, ground);
      const resting = RESTING[variant](palette, base);
      const pressed = PRESSED_BY_CLASS[PRESSED_CLASS[variant]](palette, base);
      expect(contrastRatio(resting, pressed)).toBeGreaterThanOrEqual(MIN_STEP);
    },
  );

  test.each(
    VARIANTS.flatMap((variant) => GROUNDS.map((ground) => [variant, ground] as const)),
  )('%s on %s: the label stays readable on the pressed fill', (variant, ground) => {
    const base = groundOf(palette, ground);
    const pressed = PRESSED_BY_CLASS[PRESSED_CLASS[variant]](palette, base);
    expect(contrastRatio(LABEL[variant](palette), pressed)).toBeGreaterThanOrEqual(
      textFloor(theme),
    );
  });
});

describe.each(PaletteNames)('Tappable pressed fill in %s', (theme) => {
  const palette = Palettes[theme];
  const pressed = TAPPABLE_BY_TOKEN[TAPPABLE_PRESSED_TOKEN](palette, palette.canvas);

  test.each(GROUNDS)('is a visible step from %s', (ground) => {
    expect(contrastRatio(groundOf(palette, ground), pressed)).toBeGreaterThanOrEqual(
      MIN_STEP,
    );
  });

  test.each([
    ['ink', (p: Palette) => p.ink],
    ['muted ink', (p: Palette) => p.muted],
    ['accent', (p: Palette) => p.accent],
  ] as const)('keeps %s text readable on it', (_name, colour) => {
    expect(contrastRatio(colour(palette), pressed)).toBeGreaterThanOrEqual(
      textFloor(theme),
    );
  });
});

describe('the gate has teeth: the fills it rejected', () => {
  test('the kit 4% hover is not a visible step for the secondary button in light', () => {
    const palette = Palettes.light;
    const step = contrastRatio(
      KIT.default(palette, palette.canvas),
      KIT.defaultHover(palette, palette.canvas),
    );
    expect(step).toBeLessThan(MIN_STEP);
  });

  test('the tertiary fill vanishes on an overlay in dark: overlay IS surfaceTertiary', () => {
    for (const theme of ['dark', 'dark-contrast'] as const) {
      const palette = Palettes[theme];
      expect(contrastRatio(palette.overlay, palette.surfaceTertiary)).toBeLessThan(
        MIN_STEP,
      );
    }
  });

  test('the kit soft hover (20%) cannot carry 7:1 under the destructive label on an overlay', () => {
    const palette = Palettes['dark-contrast'];
    const hover = KIT.dangerSoftHover(palette, palette.overlay);
    expect(contrastRatio(LABEL.destructive(palette), hover)).toBeLessThan(
      textFloor('dark-contrast'),
    );
  });

  test('and the destructive button therefore does not use it (review rule 5)', () => {
    expect(PRESSED_CLASS.destructive).not.toMatch(/soft|\/(1[0-9]|[2-9][0-9])$/);
  });
});
