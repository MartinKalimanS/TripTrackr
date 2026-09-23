/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useAppearance } from '@/hooks/use-appearance';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * The active colour palette.
 *
 * Kept at its original signature so existing consumers (ThemedView, ThemedText)
 * continue to work unchanged; the fuller appearance context — accessibility
 * flags, font scale, elevation profile — is available from `useAppearance`.
 */
export function useTheme() {
  const scheme = useColorScheme();
  const theme = scheme === 'unspecified' ? 'light' : scheme;

  return Colors[theme];
}

/**
 * Theme plus every accessibility signal and the resolved elevation profile.
 * Prefer this in new code — see contract C4.
 */
export { useAppearance };
