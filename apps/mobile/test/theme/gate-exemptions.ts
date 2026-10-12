/**
 * The enumerated exemption allowlists of the contrast gate — contract C5-4.
 *
 * "Explicitly exempt (decorative, carry no state or affordance, so WCAG 1.4.11 does not
 * apply)". An exemption is a list in code, never a skipped assertion, so a token cannot
 * become exempt silently:
 *
 *   - `contrast-gate.test.ts` fails when a Palette key is neither measured by a pair nor
 *     named in `decorativeKeys(theme)`, and when an allowlisted key turns out to be measured;
 *   - `theme-css-sync.test.ts` fails when a generated variable is not a colour mapped from
 *     a palette key that is measured or named here, a shadow named in
 *     `DECORATIVE_GENERATED_VARIABLES`, or a shared non-colour named in
 *     `SHARED_NON_COLOUR_VARIABLES`;
 *   - the pair exemptions (`FILL_BELOW_FLOOR`, `DISPLAY_SIZE_ONLY`) are themselves
 *     verified in BOTH directions: the gate fails if an excepted pair starts to pass (the
 *     entry must then be deleted), if the excepted colour is not the pinned one, or if the
 *     compensating token is absent.
 *
 * This is a helper module, not a test file (Jest's `testMatch` only runs `*.test.ts`).
 */
import type { Palette, PaletteName } from '@/theme/palette';

type Key = keyof Palette;

/**
 * Palette keys that are decorative in EVERY theme: dashes and tracks, the scrim behind a
 * sheet, the water and planned fills, the roundel ring, the skeleton and the edge of a
 * floating icon button (the disc itself is measured against a white photograph, P11).
 */
export const DECORATIVE_PALETTE_KEYS = [
  'sand',
  'backdrop',
  'aqua',
  'amber',
  'ring',
  'skeleton',
  'skeletonHighlight',
  'scrimButtonLine',
] as const satisfies readonly Key[];

/**
 * Decorative in the two BASE themes only. The hairline is a divider and a card edge there;
 * the contrast themes make it an explicit boundary and measure it at 3:1 (P19, FR-072).
 */
export const DECORATIVE_IN_BASE_THEMES = ['hairline'] as const satisfies readonly Key[];

/** The allowlist of one theme: what the exhaustiveness check may leave unmeasured. */
export function decorativeKeys(name: PaletteName): readonly Key[] {
  return name.endsWith('-contrast')
    ? DECORATIVE_PALETTE_KEYS
    : [...DECORATIVE_PALETTE_KEYS, ...DECORATIVE_IN_BASE_THEMES];
}

/**
 * Shadow tones. They are not Palette keys: the generator derives them from `ink`
 * (research D4-11), so they never carry information of their own. The Sunrise lifts
 * (`Lift`, C5-8) are style tokens, not generated variables, and no lift identifies
 * anything: a hairline edge is always drawn with the card.
 */
export const DECORATIVE_GENERATED_VARIABLES = [
  '--surface-shadow',
  '--overlay-shadow',
  '--field-shadow',
] as const;

/**
 * Non-colour variables the generator writes OUTSIDE the themes, once, for all four. The
 * kit ships `--field-border-width: 0px` (its fields are borderless); Sunrise draws the
 * field boundary FR-069 requires, so the generated file overrides the width.
 */
export const SHARED_NON_COLOUR_VARIABLES = ['--field-border-width'] as const;

interface FillException {
  /** The theme in which the fill cannot reach 3:1 on its grounds. */
  theme: PaletteName;
  /** The palette key of the fill. */
  fill: Key;
  /** Grounds the fill falls short on. */
  grounds: readonly Key[];
  /** The fill is pinned to this value: a retune that only "fixes" the number is refused. */
  pinned: string;
  /** The compensating token: the edge ring, drawn in this key (P15), passes 3:1. */
  ring: Key;
}

/**
 * The ONE pinned exception (mirrors 004's `PINNED_SOFT_CHIP_EXCEPTIONS`): the coral fill of
 * the primary control against white paper is 2.82:1 in `light` and 2.40:1 in
 * `light-contrast` (D5-22, M-1), below the 3:1 of a filled control's edge (FR-069). The
 * control is identified by its label and its pill shape and carries an edge ring in
 * `accentLine`. The adapters never place the primary button on a ground other than
 * `canvas`, `surface`, `surfaceSecondary` or a photograph under a scrim.
 */
export const FILL_BELOW_FLOOR: readonly FillException[] = [
  {
    theme: 'light',
    fill: 'accent',
    grounds: ['canvas', 'surface', 'surfaceSecondary'],
    pinned: '#FF6B4A',
    ring: 'accentLine',
  },
  {
    theme: 'light-contrast',
    fill: 'accent',
    grounds: ['canvas', 'surface', 'surfaceSecondary'],
    pinned: '#FF8466',
    ring: 'accentLine',
  },
];

/** Whether the fill-on-ground pair is the pinned exception of this theme. */
export function isFillBelowFloor(name: PaletteName, fill: Key, ground: Key): boolean {
  return FILL_BELOW_FLOOR.some(
    (exception) =>
      exception.theme === name &&
      exception.fill === fill &&
      exception.grounds.includes(ground),
  );
}

interface DisplaySizeException {
  theme: PaletteName;
  /** The text colour that is below the TEXT floor on the sky's warmest glow. */
  text: Key;
}

/**
 * The second pinned exception: `accentText` on the warmest glow of the light sky is
 * 4.46:1 (M-7), 0.04 short of the text floor. It is measured at the LARGE-text floor
 * there, and the adapters set the accent word on the sky at display size only. The gate
 * fails if the pair starts to pass the text floor (the entry goes) and the test also
 * measures it at the large floor on every sky stop.
 */
export const DISPLAY_SIZE_ONLY: readonly DisplaySizeException[] = [
  { theme: 'light', text: 'accentText' },
];
