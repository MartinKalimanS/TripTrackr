/**
 * Screen scaffold — FR-003, FR-016, contract C13.
 *
 * Every route composes this rather than laying out its own canvas, for two
 * reasons found on a real device (T058, Android, `font_scale 1.8`):
 *
 *   1. Content MUST be able to overflow somewhere. A `flex: 1` column with no
 *      scroll container pushes the lower controls past the bottom edge when the
 *      traveller's text grows, and they become unreachable rather than merely
 *      further down (FR-016).
 *   2. The section must never be squeezed below its own content: `flexGrow: 1`
 *      with `flexShrink: 0`, NOT `flex: 1` — the shrink is what lets a sibling
 *      collapse a heading to nothing once the text below it grows.
 *
 * The canvas is painted here too, so no screen can fall back to a platform
 * default background (Acceptance Scenario 3.2).
 */
import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

export type ScreenProps = PropsWithChildren<{
  testID?: string;
  /** Layout only — appearance belongs to the canvas (contract C8 obligation). */
  style?: ViewStyle;
  /**
   * Which safe-area edges to pad. Tabs screens omit `bottom` because the tab
   * bar already clears the home indicator; modals omit `top` because the
   * sheet's own chrome does.
   */
  edges?: Edge[];
}>;

export function Screen({
  children,
  testID,
  style,
  edges = ['top', 'bottom'],
}: ScreenProps) {
  return (
    <ThemedView type="canvas" style={styles.canvas} testID={testID}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <SafeAreaView edges={edges} style={[styles.safeArea, style]}>
          {children}
        </SafeAreaView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  // `flexGrow` alone, so the content fills the viewport when it is short and
  // extends past it — scrolling — when the traveller's text size makes it tall.
  scrollContent: {
    flexGrow: 1,
  },
  safeArea: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 'auto',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    gap: Spacing.three,
  },
});
