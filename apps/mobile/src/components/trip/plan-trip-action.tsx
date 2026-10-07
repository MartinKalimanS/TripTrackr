/**
 * "Plan a trip" on the trips screen — tasks.md T430 (contract C4-11 "Trips"; FR-005,
 * FR-026, FR-029, FR-030, FR-037).
 *
 * One action, two places, one id and one name on both: `trips-plan-trip`, "Plan a trip".
 * The screen renders exactly one of them per platform.
 *
 *   - iOS: `PlanTripHeaderAction`, the `headerRight` of the native header. An ICON-ONLY
 *     `text` button (a header holds no filled control): a plus, named "Plan a trip". A
 *     header is a fixed-height bar, so it carries no words that the largest Dynamic Type
 *     size could clip or widen; an icon-only `Button` is a fixed square of the platform
 *     floor (44 pt), which is not scaled with the font scale (unlike a button in a page).
 *     The words are in the empty state's own action, and every state has the plus.
 *   - Android: `PlanTripFab`, an extended floating button, the screen's one `primary`
 *     (FR-005), over the bottom end of the list. The tab bar is in the navigator's flow
 *     below the screen, so the bottom of the screen is already above it and above the
 *     home indicator: the button sits one step (16 dp) above that edge, and clear of the
 *     side insets (a notch in landscape). It is `absolute`, so it takes no room; the
 *     list reserves it with `PlanTripFabClearance` as its footer, which scrolls away
 *     with the list and lets the last card be brought above the button.
 *
 * Both take the same `onPress`, which opens the add-trip sheet.
 */
import { useContext } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { Button, buttonFrame } from '@/components/ui/button';
import type { IconName } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';

const PLUS: IconName = { ios: 'plus', android: 'add' };

/** The kit's `lg` button height, when the frame does not say. */
const FAB_MIN_HEIGHT = 56;

export interface PlanTripActionProps {
  onPress: () => void;
}

/** The iOS action: the `headerRight` of the trips header. */
export function PlanTripHeaderAction({ onPress }: PlanTripActionProps) {
  return (
    <Button
      variant="text"
      size="sm"
      iconOnly
      icon={PLUS}
      accessibilityLabel="Plan a trip"
      testID="trips-plan-trip"
      onPress={onPress}
    />
  );
}

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

/** The Android action: an extended floating button at the bottom end of the screen. */
export function PlanTripFab({ onPress }: PlanTripActionProps) {
  // The provider is expo-router's; outside one (a component test) there is no inset.
  const insets = useContext(SafeAreaInsetsContext) ?? NO_INSETS;
  const end = Spacing.three + Math.max(insets.left, insets.right);

  return (
    <Button
      variant="primary"
      size="lg"
      icon={PLUS}
      accessibilityLabel="Plan a trip"
      testID="trips-plan-trip"
      className="absolute"
      style={{ bottom: Spacing.three, end }}
      onPress={onPress}>
      Plan a trip
    </Button>
  );
}

/**
 * Room for the floating button under the last card: the button's minimum height at this
 * text size, and the margin it keeps above the screen's edge and above the card.
 */
export function PlanTripFabClearance() {
  const { fontScale } = useWindowDimensions();
  const { minHeight } = buttonFrame('lg', false, fontScale);
  const button = typeof minHeight === 'number' ? minHeight : FAB_MIN_HEIGHT;

  return (
    <View
      testID="trips-fab-clearance"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height: button + 2 * Spacing.three }}
    />
  );
}
