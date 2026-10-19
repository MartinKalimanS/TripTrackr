/**
 * `PlanTripFab` - the one extended "Plan a trip" button (feature 005, T541; contract C5-32
 * "Trips" and "Home"; FR-018, FR-024, FR-028, FR-029; owner answer Q-4). It floats at the bottom end
 * of a screen, above the tab pill, on BOTH platforms with the same words (the feature 004
 * iOS header action is gone). The Trips screen and Home share it.
 *
 *   <PlanTripFab screen="trips" onPress={openAddTrip} bottomInset={tabZone} />
 *   <PlanTripFab screen="home" onPress={openAddTrip} bottomInset={tabZone}
 *                hidden={planTripFabHidden({ tripCount, sheetFull })} />
 *
 * It is a `Button`: `primary` (the screen's one, FR-006), size `lg` (56 dp at least, growing with
 * the text size), a plus and the words "Plan a trip", on the second lift. A full pill on iOS; on
 * Android a rounded square of 16 dp (FR-028). It is `absolute`, 16 dp from the end (and clear
 * of a side inset, a notch in landscape) and 16 dp above `bottomInset`, which is the zone the
 * floating pill takes (`useBottomTabBarHeight()`; 88 dp on a 390 by 844 phone), so it never sits
 * behind the pill (FR-024). It takes no room in the layout: the list reserves it with its own
 * foot (`trips-fab-clearance`).
 *
 * Its id is the screen's, so there is exactly one `trips-plan-trip` on Trips (the id the Maestro
 * flows tap) and Home's is `home-plan-trip-fab` (Home's `home-plan-trip` is the invitation card's
 * action). The ids are a table, so the id extractor reads each one and nothing is forwarded.
 *
 * `collapsed` (Home at the peek detent) is the same button reduced to its plus: a 56 dp square with
 * the platform's corner (a circle on iOS), still named "Plan a trip" and still `home-plan-trip-fab`,
 * so the live trip's card beside it keeps its room (`HomePeek` leaves 56 dp and a gap for it).
 *
 * `hidden` draws nothing at all (not an invisible button an assistive technology could still
 * find). Home hides it at the full detent and while there are no trips (the invitation card
 * carries the action then): `planTripFabHidden` is that rule. Trips never hides it, in the empty
 * state either: the empty state has a secondary action of its own.
 */
import { useContext } from 'react';
import { Platform } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { fabShapeOf } from '@/constants/platform-shapes';
import { cornerOf } from '@/theme';

import { Button } from './button';
import { useLiftStyle } from './lift';

export type PlanTripFabScreen = 'trips' | 'home';

export interface PlanTripFabProps {
  onPress: () => void;
  /** The screen it floats on: it names the id. Default `trips`. */
  screen?: PlanTripFabScreen;
  /** The zone the floating pill takes at the bottom, in dp; the button floats above it. */
  bottomInset?: number;
  /** Draws nothing at all. */
  hidden?: boolean;
  /** Only the plus, in a 56 dp square: Home at the peek detent. */
  collapsed?: boolean;
}

/** The id of the button on each screen. */
const FAB_IDS: Record<PlanTripFabScreen, string> = {
  trips: 'trips-plan-trip',
  home: 'home-plan-trip-fab',
};

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * Whether Home leaves the button out: at the full detent (the Countries list fills the sheet)
 * and with no trips (the invitation card carries the action, FR-018, FR-020).
 */
export function planTripFabHidden({
  tripCount,
  sheetFull = false,
}: {
  tripCount: number;
  sheetFull?: boolean;
}): boolean {
  return sheetFull || tripCount === 0;
}

export function PlanTripFab({
  onPress,
  screen = 'trips',
  bottomInset = 0,
  hidden = false,
  collapsed = false,
}: PlanTripFabProps) {
  // The provider is expo-router's; outside one (a component test) there is no inset.
  const insets = useContext(SafeAreaInsetsContext) ?? NO_INSETS;
  const lift = useLiftStyle('lift2');
  if (hidden) return null;

  const placement = {
    position: 'absolute',
    bottom: bottomInset + Spacing.three,
    end: Spacing.three + Math.max(insets.left, insets.right),
  } as const;

  if (collapsed) {
    return (
      <Button
        variant="primary"
        size="lg"
        iconOnly
        icon="plus"
        accessibilityLabel="Plan a trip"
        testID={FAB_IDS[screen]}
        onPress={onPress}
        style={[placement, fabShapeOf(Platform.OS, true), lift]}
      />
    );
  }

  return (
    <Button
      variant="primary"
      size="lg"
      icon="plus"
      accessibilityLabel="Plan a trip"
      testID={FAB_IDS[screen]}
      onPress={onPress}
      style={[
        placement,
        // A rounded square on Android (FR-028): the button is a full pill otherwise.
        Platform.OS === 'android' ? cornerOf('lg') : null,
        lift,
      ]}>
      Plan a trip
    </Button>
  );
}
