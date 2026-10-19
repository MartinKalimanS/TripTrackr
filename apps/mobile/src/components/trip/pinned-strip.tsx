/**
 * `PinnedStrip` - a strip that scrolls with the content and then stays under the collapsed bar
 * (tasks.md T544; contract C5-20; spec FR-040, US3 scenario 2; research D5-12).
 *
 *   <PinnedStrip anchorY={chipsY} scrollY={scrollY} pinLine={barHeight} onHeight={setHeight}>
 *     <DayChips ... />
 *   </PinnedStrip>
 *
 * A native sticky header cannot sit below a bar of our own, so the strip is laid over a
 * placeholder of the same height at `anchorY` (its place in the content, measured by the
 * screen) and drawn at `pinnedTranslate(anchorY, scrollY, pinLine)`: with the content until it
 * reaches the pin line, then fixed there. It is ONE instance of the strip (one set of ids, one
 * reading order, nothing duplicated for assistive technology), moved on the UI thread by a
 * style that reads the two shared values.
 *
 * The container lets touches through wherever the strip has nothing (`box-none`), and reports
 * its laid-out height (`onHeight`) so the screen can size the placeholder it leaves in the
 * content. The ground is the sheet's `surface` so the content that scrolls under it does not
 * show through between the chips.
 */
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { pinnedTranslate } from './hero-collapse';

export interface PinnedStripProps {
  /** The strip's place in the scrolling content (the placeholder's `y`). */
  anchorY: SharedValue<number>;
  scrollY: SharedValue<number>;
  /** Where it stops: the bottom of the collapsed bar. */
  pinLine: number;
  onHeight?: (height: number) => void;
  children: ReactNode;
}

export function PinnedStrip({
  anchorY,
  scrollY,
  pinLine,
  onHeight,
  children,
}: PinnedStripProps) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: pinnedTranslate(anchorY.value, scrollY.value, pinLine) }],
  }));
  return (
    <Animated.View
      testID="trip-days-pin"
      pointerEvents="box-none"
      className="bg-surface"
      style={[styles.pin, style]}
      onLayout={(event) => onHeight?.(event.nativeEvent.layout.height)}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pin: { position: 'absolute', top: 0, left: 0, right: 0 },
});
