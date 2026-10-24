/**
 * `PlanTripFab` - the one extended "Plan a trip" button (feature 005, T541; contract C5-32
 * "Trips" and "Home"; FR-018, FR-024, FR-028, FR-029; owner answer Q-4). It floats at the bottom end
 * of a screen, above the tab pill, on BOTH platforms with the same words (the feature 004
 * iOS header action is gone). The Trips screen and Home share it.
 *
 *   <PlanTripFab screen="trips" onPress={openAddTrip} bottomInset={tabZone} />
 *   <PlanTripFab screen="home" onPress={openAddTrip} bottomInset={tabZone}
 *                hidden={planTripFabHidden({ sheetFull })} />
 *
 * It is a `Button`: `primary` (the screen's one, FR-006), a plus and the words "Plan a trip" (capped
 * at 1.3 times the text size, FR-074), on the second lift, padded 16 dp before the plus and 20
 * after the words. A full pill 52 dp tall on iOS; on Android a rounded square of 16 dp, 56 dp tall
 * (FR-028); both are minimums, so a label that wraps makes it taller. It is `absolute`, 16 dp from the end (and clear
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
 * It goes with the keyboard (UI-SPEC 3.1: it is not drawn while one is open) and rises 68 dp
 * (`FAB_TOAST_LIFT`, `lifted`) while a toast stands above the pill, as `trips-toast.png` draws it.
 * `fabHeightAt` is its height at a text size, for the list's clearance.
 *
 * `hidden` draws nothing at all (not an invisible button an assistive technology could still
 * find). Home hides it at the full detent: `planTripFabHidden` is that rule. Trips never hides it, in the empty
 * state either: the empty state has a secondary action of its own.
 */
import { useContext } from 'react';
import { Platform } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { fabShapeOf } from '@/constants/platform-shapes';
import { Space, cornerOf } from '@/theme';

import { useTourTarget } from '@/components/tour/tour-targets';

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
  /** A toast stands above the pill: the button rises above it (`.fab.is-raised`). */
  lifted?: boolean;
}

/** How far a toast lifts the button: the toast's 52 dp and the 16 dp between them. */
export const FAB_TOAST_LIFT = 68;

/** The line of the button's label (the `callout` role: 17 / 22) and its padding above and below. */
const LABEL_LINE = 22;
const LABEL_CAP = 1.3;

/**
 * The height of the extended button at `fontScale`: its pictured minimum (52 dp pill, 56 dp
 * Android square), or the label's line at the capped scale plus the padding when that is more.
 * What a list needs to leave under its last item, with the 16 dp above the pill.
 */
export function fabHeightAt(os: string, fontScale: number): number {
  const label = Math.ceil(LABEL_LINE * Math.min(Math.max(fontScale, 1), LABEL_CAP));
  return Math.max(fabShapeOf(os).minHeight, label + 2 * Space[3]);
}

/** The id of the button on each screen. */
const FAB_IDS: Record<PlanTripFabScreen, string> = {
  trips: 'trips-plan-trip',
  home: 'home-plan-trip-fab',
};

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * Whether Home leaves the button out: at the full detent (the Countries list fills the sheet).
 * With no trips it is shown: it is the first thing the tour points at (feature 007).
 */
export function planTripFabHidden({
  sheetFull = false,
}: {
  sheetFull?: boolean;
}): boolean {
  return sheetFull;
}

export function PlanTripFab({
  onPress,
  screen = 'trips',
  bottomInset = 0,
  hidden = false,
  collapsed = false,
  lifted = false,
}: PlanTripFabProps) {
  // The provider is expo-router's; outside one (a component test) there is no inset.
  const insets = useContext(SafeAreaInsetsContext) ?? NO_INSETS;
  const lift = useLiftStyle('lift2');
  // The first-run tour lights the Home's button (feature 007); the Trips screen's is not a stop.
  const tourRef = useTourTarget(screen === 'home' ? 'plan-trip' : null);
  // The keyboard takes the room the button floats in: it goes while a field is open.
  const keyboardUp = useKeyboardState((state) => state.isVisible);
  if (hidden || keyboardUp) return null;

  const placement = {
    position: 'absolute',
    bottom: bottomInset + Spacing.three + (lifted ? FAB_TOAST_LIFT : 0),
    end: Spacing.three + Math.max(insets.left, insets.right),
  } as const;

  if (collapsed) {
    return (
      <Button
        ref={tourRef}
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
      ref={tourRef}
      variant="primary"
      size="lg"
      icon="plus"
      accessibilityLabel="Plan a trip"
      testID={FAB_IDS[screen]}
      onPress={onPress}
      // The label stops at 1.3 times the text size (FR-074; home-scale2.png).
      capped
      style={[
        placement,
        // The pictured size (52 dp pill on iOS, 56 dp on Android) and the .fab padding.
        { minHeight: fabShapeOf(Platform.OS).minHeight },
        { paddingStart: Space[4], paddingEnd: Space[5] },
        // A rounded square on Android (FR-028): the button is a full pill otherwise.
        Platform.OS === 'android' ? cornerOf('lg') : null,
        lift,
      ]}>
      Plan a trip
    </Button>
  );
}
