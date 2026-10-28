/**
 * `CollapsedBar` - the solid bar that takes the hero's place once the picture has scrolled
 * away (tasks.md T543; contract C5-20; spec FR-025, US3 scenario 2; research D5-12).
 *
 *   <CollapsedBar title={trip.title} style={collapse.barStyle} />
 *
 * 56 dp of solid `surface` under the status bar with a hairline below it and the title
 * centred. It fades in with the scroll (`style` is the animated opacity of
 * `useHeroCollapse`), so it is invisible while the picture shows.
 *
 * ONE Back, ONE title. The Back control is the native transparent header's `headerLeft`,
 * which the navigator draws above this bar at every scroll position, so the bar draws none
 * (a second "Back" would be two controls for one action and an ambiguous `tapOn: 'Back'`).
 * The title is already announced by the hero's heading (`trip-title`), so the copy in the
 * bar is hidden from assistive technology and takes no touches.
 *
 * The height is a minimum (the inset plus 56 dp), so a taller status bar or a notch is
 * covered; the title is one line with an ellipsis, as a bar's title is, with room either side
 * for the Back control.
 */
import { useContext } from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { BorderHairline, MinTouchTarget } from '@/constants/theme';
import { Space } from '@/theme';

import { COLLAPSED_BAR_HEIGHT, type AnimatedViewStyle } from './hero-collapse';

export interface CollapsedBarProps {
  title: string;
  /** The scroll-driven style (the fade in). */
  style?: AnimatedViewStyle;
}

/** Back at the start: 16 from the edge, the 44 dp disc and 8 of air (`.td-collapsed`). */
const START_CLEARANCE = Space[4] + MinTouchTarget + Space[2];
/** Share and More at the end: 8 of air, two discs, 8 between them and 16 from the edge. */
const END_CLEARANCE = Space[2] + MinTouchTarget * 2 + Space[2] + Space[4];

export function CollapsedBar({ title, style }: CollapsedBarProps) {
  const insetTop = useContext(SafeAreaInsetsContext)?.top ?? 0;
  return (
    <Animated.View
      testID="trip-collapsed-bar"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="bg-surface border-separator"
      style={[
        styles.bar,
        { minHeight: COLLAPSED_BAR_HEIGHT + insetTop, paddingTop: insetTop },
        style,
      ]}>
      <Text variant="callout" numberOfLines={1} className="text-center">
        {title}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    paddingStart: START_CLEARANCE,
    paddingEnd: END_CLEARANCE,
    borderBottomWidth: BorderHairline,
  },
});
