/**
 * The pressed fills of `Chip`, `ListRow` and `Card`, measured (feature 004, T460; FR-019,
 * FR-023; review rule 5). `test/theme/adapter-pressed-fills.test.ts` measures the fills
 * `Button` and `Tappable` choose; these three controls choose their own, so the same two
 * questions are asked of them, in all four themes:
 *
 * 1. Distinct. The pressed fill is at least a 1.08:1 luminance step from the resting fill,
 *    so a held press can be told from a resting control in daylight.
 * 2. Readable. Ink and muted text keep their floor (4.5:1, 7:1 in the contrast themes, plus
 *    the 0.1 tolerance of C4-2) on the pressed fill.
 *
 * The grounds are the ones each control sits on: an unselected chip is transparent over the
 * canvas of a sheet or the surface of a card; a row rests on the group's surface; a card IS
 * the surface. None of the three belongs on an overlay (a menu, a popover): there, in the dark
 * themes, `surface-tertiary` IS the overlay colour and a press would show nothing, which is
 * why `Button` and `Tappable` do not use it (adapter-pressed-fills.test.ts, "the tertiary
 * fill vanishes on an overlay in dark"). No screen puts a chip, row or card on one.
 *
 * Folded here rather than into adapter-pressed-fills.test.ts, which belongs to the theme
 * suite; the derivations are the same sRGB blends (C4-2).
 */
import { CHIP_PRESSED_CLASS } from '@/components/ui/chip';
import { cardClasses } from '@/components/ui/card';
import { ROW_PRESSED_CLASS } from '@/components/ui/list-group';
import {
  PaletteNames,
  Palettes,
  blend,
  contrastRatio,
  type Palette,
  type PaletteName,
} from '@/theme';

const MIN_STEP = 1.08;
const TOLERANCE = 0.1;
const textFloor = (theme: PaletteName) =>
  (theme.endsWith('contrast') ? 7 : 4.5) + TOLERANCE;

/** Every class a pressed control may paint, with the colour it resolves to. */
const PAINT: Record<string, (palette: Palette) => string> = {
  'active:bg-accent-hover': (p) => blend(p.accentInk, p.accent, 0.1),
  'active:bg-surface-tertiary': (p) => p.surfaceTertiary,
  'bg-surface-tertiary': (p) => p.surfaceTertiary,
};

const paintOf = (pressedClass: string, palette: Palette) => {
  const paint = PAINT[pressedClass];
  if (!paint) throw new Error(`${pressedClass} has no derivation: measure it here`);
  return paint(palette);
};

/** The pressed class `Card` paints on its surface while held. */
const CARD_PRESSED_CLASS = cardClasses({
  variant: 'raised',
  overMap: false,
  pending: false,
  pressed: true,
});

describe('every pressed fill these controls ask for is modelled here', () => {
  test.each([
    ['Chip selected', CHIP_PRESSED_CLASS.selected],
    ['Chip unselected', CHIP_PRESSED_CLASS.unselected],
    ['ListRow', ROW_PRESSED_CLASS],
  ])('%s', (_name, pressedClass) => {
    expect(Object.keys(PAINT)).toContain(pressedClass);
  });

  test('Card paints a modelled fill, and no other', () => {
    const fills = CARD_PRESSED_CLASS.split(/\s+/).filter((token) =>
      token.startsWith('bg-'),
    );
    expect(fills).toHaveLength(1);
    expect(Object.keys(PAINT)).toContain(fills[0]);
  });
});

describe.each(PaletteNames)('pressed fills of chips, rows and cards in %s', (theme) => {
  const palette = Palettes[theme];

  test('a selected chip: the pressed fill is a visible step from the accent, and its label reads', () => {
    const pressed = paintOf(CHIP_PRESSED_CLASS.selected, palette);
    expect(contrastRatio(palette.accent, pressed)).toBeGreaterThanOrEqual(MIN_STEP);
    expect(contrastRatio(palette.accentInk, pressed)).toBeGreaterThanOrEqual(
      textFloor(theme),
    );
  });

  test.each(['canvas', 'surface'] as const)(
    'an unselected chip on %s: the pressed fill is a visible step, and its label reads',
    (ground) => {
      const pressed = paintOf(CHIP_PRESSED_CLASS.unselected, palette);
      expect(contrastRatio(palette[ground], pressed)).toBeGreaterThanOrEqual(MIN_STEP);
      expect(contrastRatio(palette.ink, pressed)).toBeGreaterThanOrEqual(
        textFloor(theme),
      );
    },
  );

  test('a row on its group: the pressed fill is a visible step from the surface, and its title and description read', () => {
    const pressed = paintOf(ROW_PRESSED_CLASS, palette);
    expect(contrastRatio(palette.surface, pressed)).toBeGreaterThanOrEqual(MIN_STEP);
    expect(contrastRatio(palette.ink, pressed)).toBeGreaterThanOrEqual(textFloor(theme));
    expect(contrastRatio(palette.muted, pressed)).toBeGreaterThanOrEqual(
      textFloor(theme),
    );
  });

  test('a card: the pressed surface is a visible step from the resting one, and its text reads', () => {
    const fill = CARD_PRESSED_CLASS.split(/\s+/).find((token) =>
      token.startsWith('bg-'),
    )!;
    const pressed = paintOf(fill, palette);
    expect(contrastRatio(palette.surface, pressed)).toBeGreaterThanOrEqual(MIN_STEP);
    expect(contrastRatio(palette.ink, pressed)).toBeGreaterThanOrEqual(textFloor(theme));
    expect(contrastRatio(palette.muted, pressed)).toBeGreaterThanOrEqual(
      textFloor(theme),
    );
  });
});
