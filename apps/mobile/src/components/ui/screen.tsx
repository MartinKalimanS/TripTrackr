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
 * default background (Acceptance Scenario 3.2). It is painted twice over, on
 * purpose: the semantic `bg-background` class (so the Atlas themes drive it) AND
 * the canvas token style of `useAppearance().tokens`. Both resolve to the same
 * colour in all four themes, increased contrast included, because the tokens are
 * the palette of `themeName` and `--background` is generated from the same
 * palette (pinned by `test/app/root-layout.test.tsx`), so neither can be seen to
 * disagree with the other, with the header over it, or with the navigator beneath.
 *
 * `underHeader` (feature 004, research D4-06, contract C4-8; opt-in, default
 * off) is for a screen below a NATIVE stack header, which already covers the
 * status bar:
 *
 *   - no top safe-area padding unless `edges` says so (the default edges become
 *     `['bottom']`), so the content does not sit a status bar too low;
 *   - the scroll view gets `contentInsetAdjustmentBehavior="automatic"`, which
 *     on iOS insets the content under a translucent or large-title header and is
 *     what lets a large title collapse as the content scrolls (Android ignores
 *     it: its header is opaque and the content is laid out below it);
 *   - the scroll view stays the FIRST child of the screen root. react-native-
 *     screens links a large title to the scroll view it finds along the chain of
 *     first children (`RNSScrollViewFinder`), so nothing is rendered before it.
 *
 * Everything else (max width, `keyboardAware`, `testID`, `edges`, the style) is
 * as before in both modes.
 */
import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAppearance } from '@/hooks/use-appearance';
import { useTabInset } from '@/hooks/use-tab-inset';

export type ScreenProps = PropsWithChildren<{
  testID?: string;
  /** Layout only — appearance belongs to the canvas (contract C8 obligation). */
  style?: ViewStyle;
  /**
   * Which safe-area edges to pad. Tabs screens omit `bottom` because the tab
   * bar already clears the home indicator; modals omit `top` because the
   * sheet's own chrome does. Defaults to `['top', 'bottom']`, or to `['bottom']`
   * when `underHeader`.
   */
  edges?: Edge[];
  /**
   * The screen holds a form that is filled in place rather than in a sheet:
   * scroll the focused field above the keyboard (research D-24). Off by
   * default — most screens have no input to protect.
   */
  keyboardAware?: boolean;
  /**
   * The screen sits under a native stack header (research D4-06): no top
   * safe-area padding by default, and the scroll view insets its content below
   * the header, so iOS large titles collapse on scroll. Off by default: a
   * screen without a native header keeps its own top padding.
   */
  underHeader?: boolean;
}>;

/**
 * The padding on the left and right of every screen. A row that bleeds to the screen's
 * edges (`marginHorizontal: -SCREEN_GUTTER`, its content padded by `SCREEN_GUTTER`) reads
 * this rather than repeating the number, so it cannot drift from the screen's own.
 */
export const SCREEN_GUTTER = Spacing.four;

const DEFAULT_EDGES: Edge[] = ['top', 'bottom'];
/** The native header already covers the top: only the bottom needs padding. */
const UNDER_HEADER_EDGES: Edge[] = ['bottom'];

export function Screen({
  children,
  testID,
  style,
  edges,
  keyboardAware = false,
  underHeader = false,
}: ScreenProps) {
  const { tokens } = useAppearance();
  // In a tab scene the floating pill runs over the bottom of the screen: end 16 dp above it
  // (FR-024). Zero above the tabs, where there is no pill.
  const tabInset = useTabInset();
  const content = (
    <SafeAreaView
      edges={edges ?? (underHeader ? UNDER_HEADER_EDGES : DEFAULT_EDGES)}
      style={[
        styles.safeArea,
        style,
        tabInset > 0 ? { paddingBottom: Math.max(Spacing.four, tabInset) } : null,
      ]}>
      {children}
    </SafeAreaView>
  );
  const inset = underHeader ? ('automatic' as const) : undefined;

  return (
    <View
      className="bg-background"
      style={[styles.canvas, { backgroundColor: tokens.canvas }]}
      testID={testID}>
      {keyboardAware ? (
        <KeyboardAwareScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          contentInsetAdjustmentBehavior={inset}
          keyboardShouldPersistTaps="handled"
          bottomOffset={Spacing.four}>
          {content}
        </KeyboardAwareScrollView>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          contentInsetAdjustmentBehavior={inset}
          keyboardShouldPersistTaps="handled">
          {content}
        </ScrollView>
      )}
    </View>
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
    paddingHorizontal: SCREEN_GUTTER,
    paddingVertical: Spacing.four,
    gap: Spacing.three,
  },
});
