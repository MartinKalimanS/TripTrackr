/**
 * The kit's `useThemeColor`, answering with the colours of a real theme (feature 005,
 * T519; contract C5-6). Not a test file.
 *
 * The suite-wide stand-in for `heroui-native` answers every token with one grey, so a
 * test cannot tell a pressed fill from a resting one. `mockThemeColors('dark')` makes the
 * hook answer from the generated stylesheet instead (`src/theme/generated/theme.css`, the
 * very file Uniwind reads on a device), so an adapter test can say "the fill is
 * `Palettes.dark.pressed`" and mean it, in each of the four themes.
 */
import * as HeroUI from 'heroui-native';

import type { PaletteName } from '@/theme';

import { themeVariable } from './theme-css';

/** The colour of a token (`accent-line`, `foreground`) in `theme`; throws on an unknown one. */
export function tokenColour(theme: PaletteName, token: string): string {
  const value = themeVariable(theme, `--${token}`);
  if (value === '') throw new Error(`theme ${theme} has no --${token}`);
  return value;
}

/** Makes `useThemeColor` (one token or an array) answer with `theme`'s colours. */
export function mockThemeColors(theme: PaletteName): void {
  jest
    .spyOn(HeroUI, 'useThemeColor')
    .mockImplementation(((token: string | string[]) =>
      Array.isArray(token)
        ? token.map((name) => tokenColour(theme, name))
        : tokenColour(theme, token)) as never);
}

/** A palette colour as the stylesheet writes it: lower-case hex. */
export const asCss = (hex: string): string => hex.toLowerCase();
