/**
 * `AreaFab` - the one extended action button of an everyday area (feature 005, T548; FR-044:
 * "one floating add action 16 dp above the screen's bottom"; UI-SPEC sections 3.1 and 9.2;
 * prototype `.fab` in `extra.css`): "Add photos", "New note", "Add expense", "Scan document".
 * Photos, Spending, Notes, Documents and Offline maps adopt it unchanged.
 *
 *   <AreaFab label="Add photos" icon="images" accessibilityLabel="Add photos from your library"
 *            testID="photos-add" onPress={addFromLibrary} busy={capture.busy} />
 *
 *   <ListScreen bottomInset={areaFabClearance(Platform.OS, fontScale)} ... />
 *
 * Props: `label` (the visible words), `icon`, `onPress`, `testID` (required: a flow taps it),
 * `accessibilityLabel` (default `label`: a screen may say more than it shows), `busy` (announced
 * busy, presses ignored), `hidden` (draws nothing at all), `bottomInset` (extra room under it,
 * default 0).
 *
 * It is a `Button`: `primary` (the screen state's one, UI-SPEC principle 2), `lg`, a 20 dp end
 * margin (the screen margin) and 16 dp above the bottom safe area, on the second lift. A full
 * pill 52 dp tall on iOS; a rounded square of 16 dp, 56 dp tall on Android (`fabShapeOf`); both
 * are minimums, the label stops growing at 1.3 times the text size (`capped`, FR-074) and wraps
 * past that. It is `absolute` and takes no room in the layout: the list reserves it with
 * `areaFabClearance`.
 *
 * It goes with the keyboard: it is not drawn while one is open (the rule of `PlanTripFab` and of
 * the forms), and it comes back with the keyboard gone.
 */
import { useContext } from 'react';
import { Platform } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { fabShapeOf } from '@/constants/platform-shapes';
import { Space, cornerOf } from '@/theme';

import { Button } from './button';
import type { IconName } from './icon';
import { useLiftStyle } from './lift';
import { fabHeightAt } from './plan-trip-fab';

export interface AreaFabProps {
  label: string;
  icon: IconName;
  onPress: () => void;
  testID: string;
  /** What a screen reader says; default `label`. */
  accessibilityLabel?: string;
  /** Said after the name: a coming-soon control says "Not available yet" (FR-080). */
  accessibilityHint?: string;
  /** An operation is in flight: announced busy, presses ignored. */
  busy?: boolean;
  /** Draws nothing at all (not an invisible button an assistive technology could find). */
  hidden?: boolean;
  /** Room under the button on top of the bottom safe area and the 16 dp. Default 0. */
  bottomInset?: number;
}

/** The distance from the end edge of the screen: the screen margin. */
export const AREA_FAB_END = Space[5];
/** The distance above the bottom safe area. */
export const AREA_FAB_BOTTOM = Space[4];

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * What a list leaves under its last item so it can be brought clear of the button: the button's
 * height at `fontScale`, the 16 dp above the bottom and a 16 dp gap over the button. The list's
 * own safe-area padding is added by `ListScreen`, so it is not counted here.
 */
export function areaFabClearance(os: string, fontScale: number): number {
  return fabHeightAt(os, fontScale) + AREA_FAB_BOTTOM + Space[4];
}

export function AreaFab({
  label,
  icon,
  onPress,
  testID,
  accessibilityLabel,
  accessibilityHint,
  busy = false,
  hidden = false,
  bottomInset = 0,
}: AreaFabProps) {
  // The provider is expo-router's; outside one (a component test) there is no inset.
  const insets = useContext(SafeAreaInsetsContext) ?? NO_INSETS;
  const lift = useLiftStyle('lift2');
  const keyboardUp = useKeyboardState((state) => state.isVisible);
  if (hidden || keyboardUp) return null;

  return (
    <Button
      variant="primary"
      size="lg"
      icon={icon}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      testID={testID}
      busy={busy}
      onPress={() => onPress()}
      capped
      style={[
        {
          position: 'absolute',
          bottom: insets.bottom + AREA_FAB_BOTTOM + bottomInset,
          end: AREA_FAB_END + Math.max(insets.left, insets.right),
          minHeight: fabShapeOf(Platform.OS).minHeight,
          paddingStart: Space[4],
          paddingEnd: Space[5],
        },
        Platform.OS === 'android' ? cornerOf('lg') : null,
        lift,
      ]}>
      {label}
    </Button>
  );
}
