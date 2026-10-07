/**
 * `useHeaderTheme` - the themed options of a native stack header (feature 004; contract
 * C4-9; FR-006, FR-008; research D4-06).
 *
 *   const theme = useHeaderTheme();
 *   <Stack.Screen name="index" options={{ ...theme, headerShown: true }} />
 *
 * A navigation option is a plain value the native header reads, so it cannot take a
 * class the way a view does. The hook resolves the kit's `background` and `accent` for
 * the ACTIVE theme (`useThemeColor` follows the four themes live) and returns the four
 * options every migrated header shares, so a layout never writes a colour and never goes
 * around the adapter to reach the kit (only `components/ui/**` may import it, C4-6).
 *
 * - `headerStyle` and `contentStyle` both take `background`: the header reads as part of
 *   the canvas, not as a bar laid over it.
 * - `headerTintColor` is `accent`, the ink of the back control, the title and any bar
 *   button.
 * - `headerShadowVisible: false`: no hairline under the header (FR-006: a boundary only
 *   where one is needed to identify a control). A screen whose content scrolls under a
 *   translucent header turns it back on for itself.
 *
 * It sets no title, no title face and no large title: those belong to the first screen
 * that shows a native title (its `headerTitleStyle` and `headerLargeTitleStyle` carry the
 * display face, D4-07). The object is memoised on the two colours, so a layout that
 * re-renders for another reason does not hand the navigator new options.
 */
import type { NativeStackNavigationOptions } from 'expo-router';
import { useThemeColor } from 'heroui-native';
import { useMemo } from 'react';

export type HeaderTheme = Required<
  Pick<
    NativeStackNavigationOptions,
    'headerStyle' | 'headerTintColor' | 'headerShadowVisible' | 'contentStyle'
  >
>;

export function useHeaderTheme(): HeaderTheme {
  const background = useThemeColor('background');
  const accent = useThemeColor('accent');

  return useMemo(
    () => ({
      headerStyle: { backgroundColor: background },
      headerTintColor: accent,
      headerShadowVisible: false,
      contentStyle: { backgroundColor: background },
    }),
    [background, accent],
  );
}
