/**
 * The enumerated exemption allowlist of the contrast gate — contract C4-3.
 *
 * "Explicitly exempt (decorative, carry no state or affordance, so WCAG 1.4.11 does not
 * apply)". The exemption is a list in code, never a skipped assertion, so a token cannot
 * become exempt silently: the palette gate fails when a Palette key is neither measured
 * by a pair nor named here, and `theme-css-sync.test.ts` fails when a generated variable
 * is neither a measured colour nor named here.
 *
 * This is a helper module, not a test file (Jest's `testMatch` only runs `*.test.ts`).
 */

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
