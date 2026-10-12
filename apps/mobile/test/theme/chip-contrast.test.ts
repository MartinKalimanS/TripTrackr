/**
 * The chip family measured in all four themes (feature 005, T520; contract C5-16;
 * design-tokens C5-4 P3, P4, P5, P12, P14, P18; FR-065, FR-068, FR-069, FR-072).
 *
 * `chip-look.ts` names the palette keys each chip paints with. The palette gate measures the
 * pairs of the palette; this file measures the pairs the CHIPS choose, so a look that is
 * changed to a pair nobody gated fails here, with no exception list:
 *
 * - text: every label on its fill, over every ground a chip sits on (canvas, paper, cream),
 *   4.5:1, or 7:1 in the increased-contrast themes. A tint (`#RRGGBBAA`) is composited
 *   over its ground first, as the gate does;
 * - edges and marks that carry a state: 3:1 (the dashed amber and danger edges of a record
 *   waiting to sync, the live dot, a dashed "add" border).
 */
import {
  PRIVACY_LOOK,
  STATUS_LOOKS,
  SYNC_BADGE_LOOKS,
  chipLook,
  segmentLook,
  type SoftLook,
} from '@/components/ui/chip-look';
import {
  PaletteNames,
  Palettes,
  contrastRatio,
  type Palette,
  type PaletteName,
} from '@/theme';

import { flatten } from './palette-gate-support';

const GROUNDS = ['canvas', 'surface', 'surfaceSecondary'] as const;
const textFloor = (theme: PaletteName) => (theme.endsWith('contrast') ? 7 : 4.5);
const GRAPHIC = 3;

/** A key's colour over its ground; `null` is the ground itself. */
const over = (palette: Palette, key: keyof Palette | null, ground: string) =>
  key === null ? ground : flatten(palette[key] as string, ground);

const SOFT: [string, SoftLook][] = [
  ['status planning', STATUS_LOOKS.planning],
  ['status active', STATUS_LOOKS.active],
  ['status past', STATUS_LOOKS.past],
  ['sync badge pending', SYNC_BADGE_LOOKS.pending],
  ['sync badge syncing', SYNC_BADGE_LOOKS.syncing],
  ['sync badge failed', SYNC_BADGE_LOOKS.failed],
  ['privacy', PRIVACY_LOOK],
];

describe.each(PaletteNames)('the soft labels in %s', (theme) => {
  const palette = Palettes[theme];

  test.each(
    SOFT.flatMap(([name, look]) =>
      GROUNDS.map((ground) => [name, look, ground] as const),
    ),
  )('%s on %s: the ink reads on the tint', (_name, look, ground) => {
    const fill = over(palette, look.fill, palette[ground]);
    expect(contrastRatio(palette[look.ink], fill)).toBeGreaterThanOrEqual(
      textFloor(theme),
    );
  });

  test.each(
    SOFT.filter(([, look]) => look.edge !== null && look.dashed).flatMap(([name, look]) =>
      GROUNDS.map((ground) => [name, look, ground] as const),
    ),
  )('%s on %s: a dashed edge carries its state at 3:1', (_name, look, ground) => {
    expect(contrastRatio(palette[look.edge!], palette[ground])).toBeGreaterThanOrEqual(
      GRAPHIC,
    );
  });

  test('the live dot (accentLine) holds 3:1 on the cream of the active chip', () => {
    expect(
      contrastRatio(palette.accentLine, palette.surfaceSecondary),
    ).toBeGreaterThanOrEqual(GRAPHIC);
  });

  test('the glyph-only failed badge: dangerInk on its danger disc (P5)', () => {
    expect(contrastRatio(palette.dangerInk, palette.danger)).toBeGreaterThanOrEqual(
      textFloor(theme),
    );
  });

  test('the sync chip: muted, amberInk and danger read on the paper it floats on', () => {
    for (const ink of ['muted', 'amberInk'] as const) {
      expect(contrastRatio(palette[ink], palette.surface)).toBeGreaterThanOrEqual(
        textFloor(theme),
      );
    }
    const tint = flatten(palette.dangerTint, palette.surface);
    expect(contrastRatio(palette.danger, tint)).toBeGreaterThanOrEqual(textFloor(theme));
    expect(contrastRatio(palette.danger, palette.surface)).toBeGreaterThanOrEqual(
      GRAPHIC,
    );
  });
});

describe.each(PaletteNames)('Chip and SegmentedPill in %s', (theme) => {
  const palette = Palettes[theme];
  const REST = { selected: false, dashed: false, pressed: false };
  const STATES = [
    ['unselected', REST],
    ['selected', { ...REST, selected: true }],
    ['dashed', { ...REST, dashed: true }],
  ] as const;

  test.each(
    STATES.flatMap(([name, state]) =>
      GROUNDS.map((ground) => [name, state, ground] as const),
    ),
  )(
    'a %s chip on %s: the label reads on the fill, at rest and held',
    (_name, state, ground) => {
      for (const pressed of [false, true]) {
        const look = chipLook({ ...state, pressed });
        const fill = over(palette, look.fill, palette[ground]);
        expect(contrastRatio(palette[look.label], fill)).toBeGreaterThanOrEqual(
          textFloor(theme),
        );
      }
    },
  );

  test.each(GROUNDS)(
    'the dashed "add" border (border) holds 3:1 on %s (P12)',
    (ground) => {
      expect(contrastRatio(palette.border, palette[ground])).toBeGreaterThanOrEqual(
        GRAPHIC,
      );
    },
  );

  test.each(GROUNDS)('the selected fill (ink) holds 3:1 on %s (P18)', (ground) => {
    expect(contrastRatio(palette.ink, palette[ground])).toBeGreaterThanOrEqual(GRAPHIC);
  });

  test('the segmented pill: onInk on the thumb, muted on the cream track, ink on the pressed fill', () => {
    const selected = segmentLook({ selected: true, pressed: false });
    expect(contrastRatio(palette[selected.label], palette.ink)).toBeGreaterThanOrEqual(
      textFloor(theme),
    );
    const rest = segmentLook({ selected: false, pressed: false });
    expect(
      contrastRatio(palette[rest.label], palette.surfaceSecondary),
    ).toBeGreaterThanOrEqual(textFloor(theme));
    const held = segmentLook({ selected: false, pressed: true });
    expect(contrastRatio(palette[held.label], palette.pressed)).toBeGreaterThanOrEqual(
      textFloor(theme),
    );
  });
});
