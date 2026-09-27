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
 */
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { useContext, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext, type Edge } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

export type ListScreenProps<Item> = {
  testID?: string;
  data: readonly Item[];
  renderItem: ListRenderItem<Item>;
  keyExtractor: (item: Item, index: number) => string;
  /** Rendered above the first row and scrolls with it. */
  header?: ReactElement | null;
  /** Rendered instead of rows when `data` is empty. */
  empty?: ReactElement | null;
  /** Rendered after the last row. */
  footer?: ReactElement | null;
  /** Which safe-area edges to pad. Tabs screens omit `bottom`; modals omit `top`. */
  edges?: Edge[];
};

function Gap() {
  return <View style={styles.gap} />;
}

export function ListScreen<Item>({
  testID,
  data,
  renderItem,
  keyExtractor,
  header = null,
  empty = null,
  footer = null,
  edges = ['top', 'bottom'],
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
    <ThemedView type="canvas" style={styles.canvas} testID={testID}>
      <View style={styles.column}>
        <FlashList
          data={data as Item[]}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ItemSeparatorComponent={Gap}
          ListHeaderComponent={header}
          ListHeaderComponentStyle={styles.header}
          ListEmptyComponent={empty}
          ListFooterComponent={footer}
          contentContainerStyle={{ ...styles.content, paddingTop, paddingBottom }}
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
