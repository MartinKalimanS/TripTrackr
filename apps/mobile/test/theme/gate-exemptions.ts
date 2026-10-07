/**
 * The enumerated exemption allowlists of the contrast gate — contract C4-3.
 *
 * "Explicitly exempt (decorative, carry no state or affordance, so WCAG 1.4.11 does not
 * apply)". An exemption is a list in code, never a skipped assertion, so a token cannot
 * become exempt silently:
 *
 *   - `palette-gate.test.ts` fails when a Palette key is neither measured by a pair nor
 *     named in `DECORATIVE_PALETTE_KEYS`;
 *   - `theme-css-sync.test.ts` fails when a generated variable is not a colour mapped from
 *     a palette key that is measured or named above, a shadow named in
 *     `DECORATIVE_GENERATED_VARIABLES`, or a shared non-colour named in
 *     `SHARED_NON_COLOUR_VARIABLES`;
 *   - the one pair exemption (`PINNED_SOFT_CHIP_EXCEPTIONS`) is itself verified: the gate
 *     fails if an excepted pair starts to pass (the entry must then be deleted) or if the
 *     excepted colour is not the pinned one.
 *
 * This is a helper module, not a test file (Jest's `testMatch` only runs `*.test.ts`).
 */
import type { Palette, PaletteName } from '@/theme/palette';

/** Palette keys that are decorative only. Each is asserted to BE decorative in the gate. */
export const DECORATIVE_PALETTE_KEYS = ['separator', 'backdrop'] as const;

/**
 * Shadow tones. They are not Palette keys: the generator derives them from `ink`
 * (research D4-11, no shadow on cards), so they never carry information of their own.
 */
export const DECORATIVE_GENERATED_VARIABLES = [
  '--surface-shadow',
  '--overlay-shadow',
  '--field-shadow',
] as const;

/**
 * Non-colour variables the generator writes OUTSIDE the themes, once, for all four. The
 * kit ships `--field-border-width: 0px` (its fields are borderless); Atlas draws the
 * field boundary that FR-024 requires, so the generated file overrides the width.
 */
export const SHARED_NON_COLOUR_VARIABLES = ['--field-border-width'] as const;

interface SoftChipException {
  theme: PaletteName;
  /** Palette keys that hold the pinned colour (all the same hex). */
  colours: readonly (keyof Palette)[];
  /** Neutral fills a soft chip of that colour cannot be placed on. */
  grounds: readonly (keyof Palette)[];
}

/**
 * The ONE pair exemption: the light accent's 15% soft chip over the field fill and over
 * `surfaceTertiary`.
 *
 * The accent is pinned to the globe's active arc (`#2456C7`, research D4-01: it means
 * "where you are now"), so it cannot be retuned. Its soft chip clears 4.6:1 only over a
 * ground at least as light as `#F4F0E8`, which is the canvas (`#F5F2EB`); a field fill or
 * a skeleton fill that light would erase the neutral ramp. Every other colour, in every
 * theme, is retuned to pass on all five grounds. The adapters never place a soft chip on
 * those two fills (`contracts/components.md`, review rule 7).
 */
export const PINNED_SOFT_CHIP_EXCEPTIONS: readonly SoftChipException[] = [
  {
    theme: 'light',
    colours: ['accent', 'link', 'statusActive'],
    grounds: ['surfaceSecondary', 'surfaceTertiary'],
  },
];
