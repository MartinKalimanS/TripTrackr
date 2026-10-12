/**
 * `TabCapsule` - the tinted capsule that sits behind the selected tab of the pill (feature
 * 005, contract C5-21, research D5-05; FR-022, FR-027).
 *
 * ONE capsule, not one per tab: it is `translateX` by `index x (tabWidth + gap)` and moves
 * with the sheet spring (`Motion.sheetSpring`, ratio .9, settles within 300 ms) when the
 * selection changes, so the pill's selection and the Home sheet settle alike. Under reduced
 * motion `springOf` answers `null` and the capsule jumps to the destination (FR-073). It
 * animates a transform and nothing else: an opacity above or on the glass would make it
 * vanish (expo/expo#41024), and movement and fade are all FR-027 allows anyway.
 *
 * It carries the id `tab-mark-<routeName>` of the SELECTED route, so the id the 004 mark
 * had still exists in the selected tab's place only (`tab-mark-index` while Globe is
 * selected). It is decoration: hidden from assistive technology and from touches, the
 * selection is announced by the tab itself (`selected`).
 *
 * The width of the pill is measured by the caller (`onLayout` of the bar), so before the
 * first layout the capsule uses the window's width less the side margins, which is the
 * pill's width on a phone: it never flashes at nothing.
 */
import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useColors } from '@/components/ui/theme-tokens';
import { useAppearance } from '@/hooks/use-appearance';
import { Radii, springOf } from '@/theme';

import { PillMetrics, capsuleLayout } from './tab-metrics';

export interface TabCapsuleProps {
  /** The selected route's name: the id is `tab-mark-<routeName>`. */
  routeName: string;
  /** The selected tab's position. */
  index: number;
  /** How many tabs the pill holds. */
  count: number;
  /** The pill's measured width, or `null` before the first layout. */
  trackWidth: number | null;
}

const COLOR_KEYS = ['accentTint'] as const;

export function TabCapsule({ routeName, index, count, trackWidth }: TabCapsuleProps) {
  const { prefersLessMotion } = useAppearance();
  const colors = useColors(COLOR_KEYS);
  const { width: windowWidth } = useWindowDimensions();
  const { tabWidth, offsetOf } = capsuleLayout(
    trackWidth ?? windowWidth - 2 * PillMetrics.sideMargin,
    count,
  );
  const target = offsetOf(index);
  const x = useSharedValue(target);

  useEffect(() => {
    const spring = springOf('sheetSpring', prefersLessMotion);
    x.value = spring === null ? target : withSpring(target, spring);
  }, [x, target, prefersLessMotion]);

  const moving = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <Animated.View
      testID={`tab-mark-${routeName}`}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.capsule,
        { width: tabWidth, backgroundColor: colors.accentTint },
        moving,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  capsule: {
    position: 'absolute',
    top: PillMetrics.padding,
    bottom: PillMetrics.padding,
    left: PillMetrics.padding,
    borderRadius: Radii.full,
  },
});
