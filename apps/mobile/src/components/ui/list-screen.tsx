/**
 * List screen scaffold — `Screen`'s sibling for an unbounded list (research D-23).
 *
 * `Screen` is a `ScrollView`; a `FlashList` nested inside one cannot recycle
 * (it would render every row) and cannot scroll on its own, so a screen whose
 * content IS a list uses this instead: the `FlashList` is the scroller, the
 * canvas is painted here exactly as `Screen` paints it, and the safe-area
 * insets become content padding so rows scroll under the status bar rather
 * than stopping short of it. Header, empty state, and footer travel with the
 * list so that they scale with the traveller's text size like everything else
 * (FR-016, contract C13).
 *
 * The canvas is painted twice over, as `Screen` does: the semantic `bg-background`
 * class (feature 004) AND the `ThemedView` canvas token style, which agree because
 * `Colors` is re-pointed at the Atlas palette.
 *
 * `underHeader` (feature 004, research D4-06, contract C4-8; opt-in, default off) is
 * for a list below a NATIVE stack header, exactly as on `Screen`: the default edges
 * become `['bottom']` (no top padding, the header covers the status bar) and the
 * list gets `contentInsetAdjustmentBehavior="automatic"`, which on iOS insets the rows
 * under the header and lets a large title collapse as they scroll. The scroller is the
 * first thing down the chain of first children (`FlashList` renders its own wrapper
 * View above the scroll view, which react-native-screens walks through:
 * `RNSScrollViewFinder`), so nothing is rendered before it.
 */
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { useContext, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext, type Edge } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

export type ListScreenProps<Item> = {
  testID?: string;
  /**
   * The id of the scroller itself, the list apart from the screen root `testID` names
   * (the trips screen's `trips-list`). Optional: most lists have none.
   */
  listTestID?: string;
  data: readonly Item[];
  renderItem: ListRenderItem<Item>;
  keyExtractor: (item: Item, index: number) => string;
  /** Rendered above the first row and scrolls with it. */
  header?: ReactElement | null;
  /** Rendered instead of rows when `data` is empty. */
  empty?: ReactElement | null;
  /** Rendered after the last row. */
  footer?: ReactElement | null;
  /**
   * Which safe-area edges to pad. Tabs screens omit `bottom`; modals omit `top`.
   * Defaults to `['top', 'bottom']`, or to `['bottom']` when `underHeader`.
   */
  edges?: Edge[];
  /**
   * The list sits under a native stack header (research D4-06): no top safe-area
   * padding by default, and the list insets its rows below the header, so iOS large
   * titles collapse on scroll. Off by default.
   */
  underHeader?: boolean;
};

const DEFAULT_EDGES: Edge[] = ['top', 'bottom'];
/** The native header already covers the top: only the bottom needs padding. */
const UNDER_HEADER_EDGES: Edge[] = ['bottom'];

function Gap() {
  return <View style={styles.gap} />;
}

export function ListScreen<Item>({
  testID,
  listTestID,
  data,
  renderItem,
  keyExtractor,
  header = null,
  empty = null,
  footer = null,
  underHeader = false,
  // Read after `underHeader`: a default may use only what is destructured before it.
  edges = underHeader ? UNDER_HEADER_EDGES : DEFAULT_EDGES,
}: ListScreenProps<Item>) {
  // The provider is expo-router's, at the root of every screen; outside one
  // (a component test) there is no inset to honour, not an error to raise.
  const insets = useContext(SafeAreaInsetsContext) ?? {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  };
  const paddingTop = Spacing.four + (edges.includes('top') ? insets.top : 0);
  const paddingBottom = Spacing.four + (edges.includes('bottom') ? insets.bottom : 0);

  return (
    <ThemedView
      type="canvas"
      className="bg-background"
      style={styles.canvas}
      testID={testID}>
      <View style={styles.column}>
        <FlashList
          testID={listTestID}
          data={data as Item[]}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ItemSeparatorComponent={Gap}
          ListHeaderComponent={header}
          ListHeaderComponentStyle={styles.header}
          ListEmptyComponent={empty}
          ListFooterComponent={footer}
          contentContainerStyle={{ ...styles.content, paddingTop, paddingBottom }}
          contentInsetAdjustmentBehavior={underHeader ? 'automatic' : undefined}
          keyboardShouldPersistTaps="handled"
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  column: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  content: {
    paddingHorizontal: Spacing.four,
  },
  header: {
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  gap: {
    height: Spacing.three,
  },
});
