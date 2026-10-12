/**
 * The pressed fills of the adapters, measured (feature 004 T417, rebuilt for feature 005
 * T519; contract C5-15 and design-tokens C5-4 P5, P6, P11, P13, P15; FR-019, FR-063,
 * FR-069; review rules 5, 6 and 7).
 *
 * `Button`, `IconButton` and `Tappable` swap to a fixed fill the moment a press starts
 * (FR-019). The palette gate cannot see them: it lists pairs, not adapters. This file
 * measures the pairs the ADAPTERS choose, in all four themes, over the palette:
 *
 * 1. Distinct. The pressed fill differs from the resting fill by at least 1.08:1 in
 *    luminance. A press is feedback, not a boundary, so it is not held to the 3:1 of a
 *    control's edge; 1.08:1 is the step below which the change cannot be told apart in
 *    daylight.
 * 2. Readable. The label keeps its floor on the pressed fill: 4.5:1, or 7:1 in the
 *    increased-contrast themes, with NO exception list. And ONLY ink is ever placed on a
 *    pressed fill (finding M-4: `muted` is 6.68:1 on `light-contrast`'s pressed sand,
 *    `subtle` 4.32:1 on `light`'s), which is a property of the tables the adapters read,
 *    asserted below.
 *
 * Both are measured against every ground a control can sit on (canvas, paper and overlay;
 * a primary never sits on cream, `FILL_BELOW_FLOOR`), because a transparent resting fill
 * takes its colour from the ground. The 004 version of this file read the kit's derived
 * mixes (`separator-secondary`, `accent-hover`, a 5% danger tint) and carried five
 * enumerated gaps the Sunrise coral caused; the Sunrise adapters paint palette keys, so
 * the mixes and the gaps are gone.
 */
import { BUTTON_VARIANTS, buttonLook } from '@/components/ui/button-look';
import { ICON_BUTTON_VARIANTS, iconButtonLook } from '@/components/ui/icon-button';
import { TAPPABLE_PRESSED_TOKEN } from '@/components/ui/tappable';
import { TOKEN_OF } from '@/components/ui/theme-tokens';
import {
  PaletteNames,
  Palettes,
  contrastRatio,
  type Palette,
  type PaletteName,
} from '@/theme';

import { flatten } from '../theme/palette-gate-support';

/** The smallest luminance step between a resting and a pressed fill. */
const MIN_STEP = 1.08;
const textFloor = (theme: PaletteName) => (theme.endsWith('contrast') ? 7 : 4.5);

const GROUNDS = ['canvas', 'surface', 'overlay'] as const;

const SHOWN = { pressed: false, busy: false, disabled: false };
const HELD = { ...SHOWN, pressed: true };
const BUSY = { ...SHOWN, busy: true };

/** A key's colour over its ground (a tint is composited first); `null` is the ground. */
const colourOf = (palette: Palette, key: keyof Palette | null, ground: string) =>
  key === null ? ground : flatten(palette[key] as string, ground);

describe('the rule: only ink on a pressed fill', () => {
  test.each(BUTTON_VARIANTS)(
    'Button %s: the label on a pressed fill is ink, or navy on the coral press',
    (variant) => {
      const { fill, label } = buttonLook(variant, HELD);
      const allowed: Record<string, string> = {
        accentPress: 'accentInk',
        pressed: 'ink',
        surfaceSecondary: 'ink',
      };
      expect(allowed[fill as string]).toBe(label);
    },
  );

  test.each(ICON_BUTTON_VARIANTS)(
    'IconButton %s: the icon on a pressed fill is ink; the glass disc is ringed, not repainted',
    (variant) => {
      const look = iconButtonLook(variant, HELD);
      if (look.fill === 'pressed') expect(look.icon).toBe('ink');
      else
        expect(look).toMatchObject({ fill: 'scrimButton', icon: 'onPhoto', ring: true });
    },
  );

  test('Tappable paints the kit variable that is generated from the pressed key', () => {
    expect(TOKEN_OF.pressed).toBe(TAPPABLE_PRESSED_TOKEN);
    expect(TAPPABLE_PRESSED_TOKEN).toBe('surface-tertiary');
  });

  test('and nothing but ink is measured there, because nothing else would hold', () => {
    // The reason the rule exists: muted and subtle fall short on a pressed fill in some theme.
    const failing = PaletteNames.flatMap((theme) =>
      (['muted', 'subtle'] as const).filter(
        (key) =>
          contrastRatio(Palettes[theme][key], Palettes[theme].pressed) < textFloor(theme),
      ),
    );
    expect(failing.length).toBeGreaterThan(0);
  });
});

describe.each(PaletteNames)('Button in %s', (theme) => {
  const palette = Palettes[theme];

  test.each(
    BUTTON_VARIANTS.flatMap((variant) =>
      [
        ['rest', SHOWN],
        ['held', HELD],
        ['busy', BUSY],
      ].flatMap(([name, state]) =>
        GROUNDS.map((ground) => [variant, name, ground, state] as const),
      ),
    ),
  )('%s, %s, on %s: the label reads on its fill', (variant, _name, ground, state) => {
    const look = buttonLook(variant, state as typeof SHOWN);
    const fill = colourOf(palette, look.fill, palette[ground]);
    expect(contrastRatio(palette[look.label], fill)).toBeGreaterThanOrEqual(
      textFloor(theme),
    );
  });

  test.each(
    BUTTON_VARIANTS.flatMap((variant) =>
      GROUNDS.map((ground) => [variant, ground] as const),
    ),
  )('%s on %s: a press is a visible step from rest', (variant, ground) => {
    const base = palette[ground];
    const rest = colourOf(palette, buttonLook(variant, SHOWN).fill, base);
    const held = colourOf(palette, buttonLook(variant, HELD).fill, base);
    expect(contrastRatio(rest, held)).toBeGreaterThanOrEqual(MIN_STEP);
  });

  test('the primary ring (accentLine) holds 3:1 on every ground a primary sits on (P15)', () => {
    for (const ground of GROUNDS) {
      expect(contrastRatio(palette.accentLine, palette[ground])).toBeGreaterThanOrEqual(
        3,
      );
    }
  });
});

describe.each(PaletteNames)('IconButton in %s', (theme) => {
  const palette = Palettes[theme];

  test.each(
    ICON_BUTTON_VARIANTS.filter((variant) => variant !== 'glass').flatMap((variant) =>
      GROUNDS.map((ground) => [variant, ground] as const),
    ),
  )(
    '%s on %s: the held fill is a visible step from rest and ink reads on it',
    (variant, ground) => {
      const base = palette[ground];
      const rest = colourOf(palette, iconButtonLook(variant, SHOWN).fill, base);
      const held = colourOf(palette, iconButtonLook(variant, HELD).fill, base);
      expect(contrastRatio(rest, held)).toBeGreaterThanOrEqual(MIN_STEP);
      expect(contrastRatio(palette.ink, held)).toBeGreaterThanOrEqual(textFloor(theme));
    },
  );
});

describe.each(PaletteNames)('Tappable in %s', (theme) => {
  const palette = Palettes[theme];

  test.each(GROUNDS)('the pressed fill is a visible step from %s', (ground) => {
    expect(contrastRatio(palette[ground], palette.pressed)).toBeGreaterThanOrEqual(
      MIN_STEP,
    );
  });

  test('ink reads on the pressed fill (P6)', () => {
    expect(contrastRatio(palette.ink, palette.pressed)).toBeGreaterThanOrEqual(
      textFloor(theme),
    );
  });
});

describe('the gate has teeth', () => {
  test('there is no exception list: every Button pair of every theme passes', () => {
    // 4 themes x 5 variants x 3 states x 3 grounds, each asserted above with no allow-list.
    expect(PaletteNames).toHaveLength(4);
    expect(BUTTON_VARIANTS).toHaveLength(5);
  });

  test('the pressed fill is its own token, a visible step from every ground (D5-22, M-4)', () => {
    // 004 used the kit tertiary fill, which vanished on a dark overlay; `pressed` has its
    // own value, and a darker one in dark-contrast.
    for (const theme of PaletteNames) {
      for (const ground of GROUNDS) {
        expect(
          contrastRatio(Palettes[theme][ground], Palettes[theme].pressed),
        ).toBeGreaterThanOrEqual(MIN_STEP);
      }
    }
  });

  test('the coral fill alone is the pinned exception (FILL_BELOW_FLOOR), and the ring covers it', () => {
    expect(contrastRatio(Palettes.light.accent, Palettes.light.surface)).toBeLessThan(3);
    expect(
      contrastRatio(
        Palettes['light-contrast'].accent,
        Palettes['light-contrast'].surface,
      ),
    ).toBeLessThan(3);
    for (const theme of ['light', 'light-contrast'] as const) {
      expect(
        contrastRatio(Palettes[theme].accentLine, Palettes[theme].surface),
      ).toBeGreaterThanOrEqual(3);
    }
  });
});
