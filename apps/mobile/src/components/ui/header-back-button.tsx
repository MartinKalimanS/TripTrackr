/**
 * `HeaderBackButton` - the back control of a pushed screen (feature 004; contract C4-9;
 * FR-008, FR-026, FR-030; research D4-06 and "Items to verify" item 7).
 *
 * Native stack headers draw their own back affordance; the Maestro flows say
 * `tapOn: 'Back'` and the contract promises the accessible name "Back" on every pushed
 * screen. Where the native label does not resolve to that name (it is the PREVIOUS
 * screen's title, or empty), a screen uses this as its `headerLeft`:
 *
 *   <Stack.Screen options={{ headerLeft: (props) => <HeaderBackButton {...props} /> }} />
 *
 * - A chevron `Icon` (decorative) and the word "Back", in a `Tappable` named "Back". The
 *   name is fixed: it is never the previous screen's title, which is what the native
 *   button announces and what a flow cannot rely on.
 * - `onPress` defaults to `router.back()` from `expo-router`, or to `router.replace('/')`
 *   when the router has nothing to go back to (the screen was opened by a deep link or a
 *   notification, where `back()` would do nothing). The router is asked when the button
 *   is pressed, not when it renders. `canGoBack` is also what React Navigation passes to
 *   a `headerLeft`; when it is explicitly `false` nothing is drawn, as the native
 *   affordance does. The other props a `headerLeft` receives (`tintColor`, `label`,
 *   `href`) are ignored on purpose: the colour is the accent token and the name is "Back".
 * - It has the platform's minimum touch target (44 dp iOS, 48 dp Android), but is NOT
 *   scaled with the font scale: unlike a button in a page, a header is a fixed-height
 *   bar that would clip or overflow a taller control.
 * - Above a 1.3 font scale the visible word is dropped and the chevron stands alone: the
 *   word would no longer fit the bar (FR-029 forbids clipping it), and the control keeps
 *   its name "Back" and its target. The font scale comes from `useWindowDimensions`, not
 *   `useAppearance` (tappable.tsx).
 * - The chevron is the RTL-aware `chevron.backward` on iOS, which mirrors itself in a
 *   right-to-left layout (this app ships left-to-right only today).
 */
import { useRouter } from 'expo-router';
import { useWindowDimensions } from 'react-native';

import { MinTouchTarget } from '@/constants/theme';

import { Icon, type IconName } from './icon';
import { Tappable } from './tappable';
import { Text } from './text';

export interface HeaderBackButtonProps {
  /** Replaces the default `router.back()`. */
  onPress?: () => void;
  /** From React Navigation's `headerLeft`: `false` means there is nothing to go back to. */
  canGoBack?: boolean;
  testID?: string;
}

const CHEVRON: IconName = { ios: 'chevron.backward', android: 'chevron_left' };

/** Above this font scale the bar has no room for the word beside the chevron. */
const HIDE_WORD_ABOVE = 1.3;

/** A header is a fixed-height bar: the floor, not the floor times the font scale. */
const HEADER_TARGET = { minHeight: MinTouchTarget } as const;

export function HeaderBackButton({ onPress, canGoBack, testID }: HeaderBackButtonProps) {
  const router = useRouter();
  const { fontScale } = useWindowDimensions();
  if (canGoBack === false) return null;

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Tappable
      accessibilityLabel="Back"
      onPress={onPress ?? goBack}
      testID={testID}
      className="flex-row items-center gap-1"
      style={HEADER_TARGET}>
      <Icon
        name={CHEVRON}
        size={24}
        tone="accent"
        testID={testID ? `${testID}-icon` : undefined}
      />
      {fontScale > HIDE_WORD_ABOVE ? null : (
        <Text type="body" tone="accent">
          Back
        </Text>
      )}
    </Tappable>
  );
}
