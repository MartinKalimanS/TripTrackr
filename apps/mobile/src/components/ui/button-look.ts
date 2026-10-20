/**
 * The look of a `Button` as data (feature 005, T519; contract C5-15; FR-006, FR-063,
 * FR-069; design-tokens C5-4 P5, P6, P15).
 *
 * `buttonLook(variant, state)` answers WHICH PALETTE KEYS the fill, the label and the
 * edge are, not which colours: the rule "only ink text ever sits on a pressed fill" is then
 * a property of this table that a test states once and the contrast gate measures in all
 * four themes (`button-look.test.ts`, `test/theme/adapter-pressed-fills.test.ts`). The
 * adapter (`button.tsx`) turns the keys into the colours of the active theme.
 *
 *   variant       rest                          pressed                    disabled
 *   primary       accent, accentInk, ring       accentPress, accentInk     sand, subtle, no ring
 *   secondary     none, ink, ink outline        surfaceSecondary, ink      border outline, subtle
 *   tonal         surfaceSecondary, ink, hair   pressed, ink               as secondary
 *   text          none, ink                     pressed, ink               subtle label
 *   destructive   dangerTint, danger            pressed, INK (not danger)  subtle label
 *
 * A destructive label turns to ink while it is pressed because `danger` on `pressed` is a
 * pair nobody gates (P6 measures `ink` on `pressed` and nothing else); the press lasts a
 * hundred milliseconds. A busy button looks like a pressed primary and like its resting self
 * otherwise: the spinner is the sign, so it is neither dimmed nor re-coloured.
 */
import { PrimaryEdgeRing } from '@/theme';

import type { PaletteKey } from './theme-tokens';

export const BUTTON_VARIANTS = [
  'primary',
  'secondary',
  'tonal',
  'text',
  'destructive',
] as const;

export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

export interface ButtonState {
  pressed: boolean;
  busy: boolean;
  disabled: boolean;
}

/** The inks a button label takes: all of them palette keys an `Icon` tone also names. */
export type ButtonLabelKey = 'ink' | 'accentInk' | 'danger' | 'subtle';

export interface ButtonLook {
  /** The fill, or `null` for none (the ground shows through). */
  fill: PaletteKey | null;
  label: ButtonLabelKey;
  /** The edge (the outline or the primary ring), or `null` for none. */
  edge: PaletteKey | null;
}

const REST: Record<ButtonVariant, ButtonLook> = {
  primary: { fill: 'accent', label: 'accentInk', edge: 'accentLine' },
  secondary: { fill: null, label: 'ink', edge: 'ink' },
  tonal: { fill: 'surfaceSecondary', label: 'ink', edge: 'hairline' },
  text: { fill: null, label: 'ink', edge: null },
  destructive: { fill: 'dangerTint', label: 'danger', edge: null },
};

const PRESSED: Record<ButtonVariant, ButtonLook> = {
  primary: { fill: 'accentPress', label: 'accentInk', edge: 'accentLine' },
  secondary: { fill: 'surfaceSecondary', label: 'ink', edge: 'ink' },
  tonal: { fill: 'pressed', label: 'ink', edge: 'hairline' },
  text: { fill: 'pressed', label: 'ink', edge: null },
  destructive: { fill: 'pressed', label: 'ink', edge: null },
};

const OUTLINED_DISABLED: ButtonLook = { fill: null, label: 'subtle', edge: 'border' };
const LABEL_ONLY_DISABLED: ButtonLook = { fill: null, label: 'subtle', edge: null };

const DISABLED: Record<ButtonVariant, ButtonLook> = {
  primary: { fill: 'sand', label: 'subtle', edge: null },
  secondary: OUTLINED_DISABLED,
  tonal: OUTLINED_DISABLED,
  text: LABEL_ONLY_DISABLED,
  destructive: LABEL_ONLY_DISABLED,
};

/** Disabled wins over everything; busy is inert, so a press never shows on it. */
export function buttonLook(
  variant: ButtonVariant,
  { pressed, busy, disabled }: ButtonState,
): ButtonLook {
  if (disabled) return DISABLED[variant];
  if (busy) return variant === 'primary' ? PRESSED.primary : REST[variant];
  return pressed ? PRESSED[variant] : REST[variant];
}

/** The 1.5 dp outline of the secondary and the 1 dp hairline of the tonal (C5-15). */
const OUTLINE_WIDTH = { secondary: 1.5, tonal: 1 } as const;

/**
 * The width of the edge, the same in every state so a press or a disabled state moves no
 * pixel: the primary's ring is 1.5 dp, and 2 dp in the contrast themes (`PrimaryEdgeRing`).
 */
export function buttonEdgeWidth(variant: ButtonVariant, contrast: boolean): number {
  if (variant === 'primary') {
    return contrast ? PrimaryEdgeRing.contrastWidth : PrimaryEdgeRing.width;
  }
  return variant === 'secondary' || variant === 'tonal' ? OUTLINE_WIDTH[variant] : 0;
}
