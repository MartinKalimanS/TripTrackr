/**
 * The one table from a palette key to the theme variable an adapter asks the kit for
 * (feature 005, T519; contract C5-6).
 *
 * An adapter names its colours by PALETTE KEY (`pressed`, `accentLine`: the words of the
 * contract and of the contrast gate) and `useColors` turns them into the colours of the
 * active theme with the kit's `useThemeColor`, which reads `--color-<name>` from the
 * generated stylesheet and so follows the four themes live. The variable behind a key is
 * generated FROM the key (`scripts/build-theme-css.mjs`): the kit's own names where the
 * kit has one (`foreground` is `ink`, `surface-tertiary` is `pressed`, `separator` is
 * `hairline`, `accent-foreground` is `accentInk`), the app's where it has not.
 * `theme-tokens.test.tsx` reads the stylesheet in all four themes, so a key pointed at the
 * wrong variable fails there and not on a device.
 *
 * There is no way to pass a colour: a key not in this table does not compile.
 */
import { useThemeColor, type ThemeColor } from 'heroui-native';

import type { Palette } from '@/theme';

import { solidOver, useOpaqueSurfaces } from './solid-ground';

export const TOKEN_OF = {
  // Ink
  ink: 'foreground',
  muted: 'muted',
  subtle: 'subtle',
  onInk: 'on-ink',
  onPhoto: 'on-photo',
  // Grounds and lines
  surface: 'surface',
  surfaceSecondary: 'surface-secondary',
  pressed: 'surface-tertiary',
  sand: 'sand',
  hairline: 'separator',
  border: 'border',
  focus: 'focus',
  // Coral
  accent: 'accent',
  accentInk: 'accent-foreground',
  accentPress: 'accent-press',
  accentLine: 'accent-line',
  accentText: 'accent-text',
  accentTint: 'accent-tint',
  // Aqua, amber, danger, success
  aquaInk: 'aqua-ink',
  aquaLine: 'aqua-line',
  aquaTint: 'aqua-tint',
  amberInk: 'amber-ink',
  amberLine: 'amber-line',
  amberTint: 'amber-tint',
  danger: 'danger',
  dangerInk: 'danger-foreground',
  dangerTint: 'danger-tint',
  success: 'success',
  successTint: 'success-tint',
  // A control on a photograph
  scrimButton: 'scrim-button',
  scrimButtonLine: 'scrim-button-line',
} as const satisfies Partial<Record<keyof Palette, string>>;

export type PaletteKey = keyof typeof TOKEN_OF;

/**
 * The keys the dark themes write as translucent colours over the paper. Under increased
 * contrast or reduced transparency `useColors` hands them over as the opaque colour they
 * come to over the `surface` (FR-072, FR-073; `solid-ground.ts`): the light themes' tints
 * are opaque already and come back unchanged.
 */
const TINTS: ReadonlySet<PaletteKey> = new Set<PaletteKey>([
  'accentTint',
  'aquaTint',
  'amberTint',
  'dangerTint',
  'successTint',
]);

/**
 * The colours of `keys` in the active theme, in ONE kit call. Pass a module-level constant
 * array so the call is stable between renders. A tint is opaque under increased contrast or
 * reduced transparency (`TINTS`).
 */
export function useColors<K extends PaletteKey>(keys: readonly K[]): Record<K, string> {
  // The paper rides in the same call, as the last colour: it is what a tint settles onto.
  const tokens = [...keys.map((key) => TOKEN_OF[key]), TOKEN_OF.surface] as ThemeColor[];
  const colours = useThemeColor(tokens) as string[];
  const opaque = useOpaqueSurfaces();
  const ground = colours[keys.length];
  return Object.fromEntries(
    keys.map((key, index) => [
      key,
      opaque && TINTS.has(key) && typeof ground === 'string'
        ? solidOver(colours[index], ground)
        : colours[index],
    ]),
  ) as Record<K, string>;
}
