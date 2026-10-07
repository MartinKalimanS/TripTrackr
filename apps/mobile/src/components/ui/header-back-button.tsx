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
 * - `onPress` defaults to `router.back()` from `expo-router`. `canGoBack` is what React
 *   Navigation passes to a `headerLeft`; when it is explicitly `false` there is nothing
 *   to go back to and nothing is drawn, as the native affordance does. The other props a
 *   `headerLeft` receives (`tintColor`, `label`, `href`) are ignored on purpose: the
 *   colour is the accent token and the name is "Back".
 * - It has the platform's minimum touch target (44 dp iOS, 48 dp Android), but is NOT
 *   scaled with the font scale: unlike a button in a page, a header is a fixed-height
 *   bar that would clip or overflow a taller control. The word follows the text size
 *   like any text.
 * - The chevron is the RTL-aware `chevron.backward` on iOS, which mirrors itself in a
 *   right-to-left layout (this app ships left-to-right only today).
 */
import { useRouter } from 'expo-router';

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

/** A header is a fixed-height bar: the floor, not the floor times the font scale. */
const HEADER_TARGET = { minHeight: MinTouchTarget } as const;

export function HeaderBackButton({ onPress, canGoBack, testID }: HeaderBackButtonProps) {
  const router = useRouter();
  if (canGoBack === false) return null;

  return (
    <Tappable
      accessibilityLabel="Back"
      onPress={onPress ?? (() => router.back())}
      testID={testID}
      className="flex-row items-center gap-1"
      style={HEADER_TARGET}>
      <Icon
        name={CHEVRON}
        size={24}
        tone="accent"
        testID={testID ? `${testID}-icon` : undefined}
      />
      <Text type="body" tone="accent">
        Back
      </Text>
    </Tappable>
  );
}
