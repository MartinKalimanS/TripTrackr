/**
 * `useStackHeaderOptions` - the themed options of a native stack header (feature 004;
 * contract C4-9; research D4-06; FR-007, FR-023).
 *
 *   // src/app/(tabs)/trips/_layout.tsx
 *   const options = useStackHeaderOptions('Trips');
 *   return <Stack screenOptions={options} />;
 *
 * It is an adapter because the colours and the display face are the kit's and Uniwind's
 * to read: `useThemeColor` and `useCSSVariable` may not be imported outside
 * `src/components/ui/` (contract C4-6), and a native header cannot take a className, so
 * the values have to be read in JavaScript and handed over as style.
 *
 * What a top-level list screen gets (`stackHeaderOptions`, the pure half, asserted per
 * platform):
 * - iOS: a large title that collapses as the list scrolls (the list must be the first
 *   child of the screen and set `contentInsetAdjustmentBehavior`: `ListScreen` and
 *   `Screen` do, with `underHeader`), no shadow under either bar, the controls in the
 *   accent and the titles in the foreground ink. The option is `headerLargeTitleEnabled`:
 *   `headerLargeTitle` is deprecated in the installed router (v57 Stack reference). The
 *   header itself is NOT given a background: React Navigation leaves a large-title header
 *   transparent over the content (it is the canvas), and its own note in
 *   `useHeaderConfigProps` says a background colour there makes the title invisible on
 *   iOS 26.
 * - Android: a standard header with the same title, painted with the canvas, no large
 *   title and no shadow.
 * - Both: the scene behind is the canvas (`contentStyle`).
 *
 * The display face (research D4-07): the title uses `--font-display` (SemiBold, as the
 * `title` text role) and the large title `--font-display-bold` (as `largeTitle`), read
 * with `useCSSVariable` from `global.css`, where the iOS block already spells the
 * PostScript names. Each is paired with the weight of its own face, because React
 * Native picks the nearest weight of the family and the router's default weights
 * (bold, heavy) would otherwise choose for it. A variable that is not readable leaves
 * the platform face, with no family and no weight.
 * UNVERIFIED ON A DEVICE: that both headers draw the display face (device check T408).
 */
import type { NativeStackNavigationOptions } from 'expo-router';
import { useThemeColor } from 'heroui-native';
import { useMemo } from 'react';
import { Platform } from 'react-native';
import { useCSSVariable } from 'uniwind';

/** What a header is painted with: three theme colours and, optionally, two families. */
export interface StackHeaderTheme {
  canvas: string;
  foreground: string;
  accent: string;
  /** The display face for the (collapsed) title: SemiBold. */
  titleFont?: string;
  /** The display face for the large title: Bold. */
  largeTitleFont?: string;
}

/** The weight of each display face's own file; see the header. */
const TITLE_WEIGHT = '600';
const LARGE_TITLE_WEIGHT = '700';
type FaceWeight = typeof TITLE_WEIGHT | typeof LARGE_TITLE_WEIGHT;

/**
 * A family name from what `useCSSVariable` returns. The stylesheet writes the name in
 * quotes (`'BricolageGrotesque-Bold'`); a native header wants it bare. Anything that is
 * not a non-blank string is no family.
 */
export function fontFamilyOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const bare = value
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .trim();
  return bare === '' ? undefined : bare;
}

/** The ink, and the family with the weight of its own file when there is a family. */
function titleStyle(color: string, family: string | undefined, weight: FaceWeight) {
  return family === undefined
    ? { color }
    : { color, fontFamily: family, fontWeight: weight };
}

/** The options for a header over the canvas, for `platform`. Pure. */
export function stackHeaderOptions(
  title: string,
  theme: StackHeaderTheme,
  platform: string,
): NativeStackNavigationOptions {
  const { canvas, foreground, accent, titleFont, largeTitleFont } = theme;
  const common: NativeStackNavigationOptions = {
    title,
    headerShadowVisible: false,
    headerLargeTitleShadowVisible: false,
    headerTintColor: accent,
    headerTitleStyle: titleStyle(foreground, titleFont, TITLE_WEIGHT),
    contentStyle: { backgroundColor: canvas },
  };
  if (platform !== 'ios') {
    return { ...common, headerStyle: { backgroundColor: canvas } };
  }
  return {
    ...common,
    headerLargeTitleEnabled: true,
    headerLargeTitleStyle: titleStyle(foreground, largeTitleFont, LARGE_TITLE_WEIGHT),
  };
}

const THEME_COLORS = ['background', 'foreground', 'accent'] as const;

/**
 * `stackHeaderOptions` for the running platform and theme: the same object until the
 * title, a colour or a family changes, so a navigator does not re-apply it every render.
 */
export function useStackHeaderOptions(title: string): NativeStackNavigationOptions {
  const [canvas, foreground, accent] = useThemeColor(THEME_COLORS);
  const titleFont = fontFamilyOf(useCSSVariable('--font-display'));
  const largeTitleFont = fontFamilyOf(useCSSVariable('--font-display-bold'));

  return useMemo(
    () =>
      stackHeaderOptions(
        title,
        { canvas, foreground, accent, titleFont, largeTitleFont },
        Platform.OS,
      ),
    [title, canvas, foreground, accent, titleFont, largeTitleFont],
  );
}
