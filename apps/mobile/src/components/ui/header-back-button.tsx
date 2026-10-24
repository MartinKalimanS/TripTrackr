/**
 * `HeaderBackButton` - the back control of a pushed screen (feature 004, then Sunrise
 * Passport; contracts C4-9 and C5-15; FR-008, FR-025, FR-026, FR-030; research D4-06, D5-12 and
 * "Items to verify" item 7).
 *
 * Native stack headers draw their own back affordance; the Maestro flows say
 * `tapOn: 'Back'` and the contract promises the accessible name "Back" on every pushed
 * screen. Where the native label does not resolve to that name (it is the PREVIOUS
 * screen's title, or empty), a screen uses this as its `headerLeft`:
 *
 *   <Stack.Screen options={{ headerLeft: (props) => <HeaderBackButton {...props} /> }} />
 *   <Stack.Screen options={{ headerLeft: () => <HeaderBackButton variant="glass" /> }} />
 *
 * - A ROUND control (an `IconButton`, 44 dp): a chevron in a cream disc with a hairline on the
 *   canvas (`default`), or in a `scrimButton` disc with an `onPhoto` glyph over a photograph
 *   (`glass`, the trip hero; a fixed look, because the picture does not change with the
 *   theme and the glyph holds 3:1 over a pure white one). There is no visible word: the name
 *   is the label, so a header of any width and any text size holds it, and it is never read
 *   twice. The name is EXACTLY "Back": never the previous screen's title, whichever variant.
 * - `onPress` defaults to `router.back()` from `expo-router`, or to `router.replace('/')`
 *   when the router has nothing to go back to (the screen was opened by a deep link or a
 *   notification, where `back()` would do nothing). The router is asked when the button
 *   is pressed, not when it renders. `canGoBack` is also what React Navigation passes to
 *   a `headerLeft`; when it is explicitly `false` nothing is drawn, as the native
 *   affordance does. The other props a `headerLeft` receives (`tintColor`, `label`,
 *   `href`) are ignored on purpose: the look is the variant's and the name is "Back".
 * - The disc is 44 dp and does NOT scale with the font scale: a header is a fixed-height bar
 *   that would clip or overflow a taller control. Its touch target reaches the platform
 *   minimum (44 pt, 48 dp) with slop around the disc (`IconButton`).
 * - The chevron is the RTL-aware `chevron-left`, which mirrors itself in a right-to-left
 *   layout (this app ships left-to-right only today).
 */
import { useRouter } from 'expo-router';

import { IconButton } from './icon-button';

export type HeaderBackVariant = 'default' | 'glass' | 'ghost';

/** The disc each variant draws: cream on the canvas, glass over a photograph, bare on a bar. */
const LOOK = { default: 'tonal', glass: 'glass', ghost: 'ghost' } as const;

export interface HeaderBackButtonProps {
  /** Replaces the default `router.back()`. */
  onPress?: () => void;
  /** From React Navigation's `headerLeft`: `false` means there is nothing to go back to. */
  canGoBack?: boolean;
  testID?: string;
  /** `default` on the canvas; `glass` over a photograph; `ghost` (no disc) on a solid bar. */
  variant?: HeaderBackVariant;
}

export function HeaderBackButton({
  onPress,
  canGoBack,
  testID,
  variant = 'default',
}: HeaderBackButtonProps) {
  const router = useRouter();
  if (canGoBack === false) return null;

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <IconButton
      icon="chevron-left"
      accessibilityLabel="Back"
      variant={LOOK[variant]}
      onPress={onPress ?? goBack}
      testID={testID}
    />
  );
}
