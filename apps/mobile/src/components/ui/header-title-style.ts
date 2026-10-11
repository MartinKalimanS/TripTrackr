/**
 * `useHeaderTitleStyle` - the ink and the face of a pushed screen's native title (feature
 * 004; contract C4-9; FR-003, FR-004, FR-007; research D4-07).
 *
 *   const theme = useHeaderTheme();
 *   const title = useHeaderTitleStyle();
 *   <Stack.Screen name="notes" options={{ ...theme, ...title, headerShown: true, title: 'Notes' }} />
 *
 * `useHeaderTheme` tints the header with the accent, and a native title that sets no
 * colour of its own takes the tint (React Navigation's `titleColor` falls back to
 * `headerTintColor`), so a screen that shows a title would paint it in the ONE accent
 * FR-003 reserves for the primary action, the selected item, links and the active trip.
 * This is the title's own style: the foreground ink, in the display face (`--font-display`,
 * SemiBold, as the `title` text role and the top-level list headers of `stackHeaderOptions`),
 * paired with the weight of that face's own file because React Native picks the nearest
 * weight of a family. `header-title-style.test.tsx` pins it to `stackHeaderOptions`, so the
 * two cannot drift. A face the stylesheet does not declare leaves the platform's.
 *
 * It sets the title style and nothing else: no large title (a sub-screen's title is an
 * ordinary one; large titles are for top-level lists), no colours of the bar, no title.
 * It is an adapter because the colour and the face are the kit's and Uniwind's to read
 * (contract C4-6); the object is memoised on what it reads.
 */
import type { NativeStackNavigationOptions } from 'expo-router';
import { useThemeColor } from 'heroui-native';
import { useMemo } from 'react';
import { useCSSVariable } from 'uniwind';

import { fontFamilyOf } from './stack-header';

export type HeaderTitleStyle = Required<
  Pick<NativeStackNavigationOptions, 'headerTitleStyle'>
>;

/** The weight of the display face's SemiBold file; `stack-header.ts` uses the same. */
const TITLE_WEIGHT = '600';

export function useHeaderTitleStyle(): HeaderTitleStyle {
  const foreground = useThemeColor('foreground');
  const family = fontFamilyOf(useCSSVariable('--font-display'));

  return useMemo(
    () => ({
      headerTitleStyle:
        family === undefined
          ? { color: foreground }
          : { color: foreground, fontFamily: family, fontWeight: TITLE_WEIGHT },
    }),
    [foreground, family],
  );
}
