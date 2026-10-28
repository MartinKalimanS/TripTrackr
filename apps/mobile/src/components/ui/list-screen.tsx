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
 * class AND the canvas token style of `useAppearance().tokens`, which agree in all four
 * themes because the tokens are the palette of `themeName`.
 *
 * `underHeader` (feature 004, research D4-06, contract C4-8; opt-in, default off) is
 * for a list below a NATIVE stack header, exactly as on `Screen`: the default edges
 * become `['bottom']` (no top padding, the header covers the status bar) and the
 * list gets `contentInsetAdjustmentBehavior="automatic"`, which on iOS insets the rows
 * under the header and lets a large title collapse as they scroll. The scroller is the
 * first thing down the chain of first children (`FlashList` renders its own wrapper
 * View above the scroll view, which react-native-screens walks through:
 * `RNSScrollViewFinder`), so nothing is rendered before it.
 *
 * Feature 005 (T541) adds what a MIXED list needs, all optional and additive: `getItemType`
 * (a recycler reuses a cell only for the same shape), `stickyHeaderIndices`, `listRef` and
 * `onViewableItemsChanged` (jump to a year, follow the scroll), `bottomInset` (room at the
 * foot past a floating pill and button), `horizontalInset` (a screen margin of its own),
 * `endInset` (more at the end, for a strip along the edge), `itemGap` (0 where the items
 * space themselves) and `reachAll` (every item stays mounted while a screen reader is on, SC-015).
 * With none of them the list is what it was.
 */
import {
  FlashList,
  type FlashListProps,
  type FlashListRef,
  type ListRenderItem,
} from '@shopify/flash-list';
import { useContext, useMemo, type ReactElement, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext, type Edge } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAppearance } from '@/hooks/use-appearance';
import { useReachAllDistance } from '@/hooks/use-reach-all';
import { useTabInset } from '@/hooks/use-tab-inset';

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
  /** The shape of an item: the list reuses a cell only for the same type. */
  getItemType?: (item: Item, index: number) => string;
  /** The items that stick to the top while the rest scroll under them. */
  stickyHeaderIndices?: number[];
  /** The list's ref, to scroll it. */
  listRef?: Ref<FlashListRef<Item>>;
  onViewableItemsChanged?: FlashListProps<Item>['onViewableItemsChanged'];
  viewabilityConfig?: FlashListProps<Item>['viewabilityConfig'];
  /**
   * Extra room at the foot, added to the safe-area padding: what a floating tab pill and a
   * floating button need so the last item can be brought clear of them (FR-024).
   */
  bottomInset?: number;
  /** The padding at each side. Default `Spacing.four`. */
  horizontalInset?: number;
  /** More room at the END than `horizontalInset` gives, for a strip along that edge. */
  endInset?: number;
  /** The gap between items. Default `Spacing.three`; 0 draws none (the items space themselves). */
  itemGap?: number;
  /**
   * Keep every item mounted while a screen reader is on, so each one can be reached (SC-015:
   * the Trips tab). Off by default: a list of a thousand rows recycles as usual.
   */
  reachAll?: boolean;
};

const DEFAULT_EDGES: Edge[] = ['top', 'bottom'];
/** The native header already covers the top: only the bottom needs padding. */
const UNDER_HEADER_EDGES: Edge[] = ['bottom'];

function Gap() {
  return <View style={styles.gap} />;
}

/** The separator for a gap of `height`: the shared one for the default, a made one for another. */
function separatorOf(height: number | undefined) {
  if (height === undefined || height === Spacing.three) return Gap;
  if (height === 0) return undefined;
  return function CustomGap() {
    return <View style={{ height }} />;
  };
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
  getItemType,
  stickyHeaderIndices,
  listRef,
  onViewableItemsChanged,
  viewabilityConfig,
  bottomInset = 0,
  horizontalInset = Spacing.four,
  endInset,
  itemGap,
  reachAll = false,
  // Read after `underHeader`: a default may use only what is destructured before it.
  edges = underHeader ? UNDER_HEADER_EDGES : DEFAULT_EDGES,
}: ListScreenProps<Item>) {
  const { tokens } = useAppearance();
  const drawDistance = useReachAllDistance(data.length, reachAll);
  // One component per gap, so the list does not remount its separators on every render.
  const Separator = useMemo(() => separatorOf(itemGap), [itemGap]);
  // The provider is expo-router's, at the root of every screen; outside one
  // (a component test) there is no inset to honour, not an error to raise.
  const insets = useContext(SafeAreaInsetsContext) ?? {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  };
  const paddingTop = Spacing.four + (edges.includes('top') ? insets.top : 0);
  // In a tab scene the floating pill runs over the bottom of the screen: the list ends 16 dp
  // above it (FR-024), or at its own padding if that is more; `bottomInset` is room on top of
  // that (a floating button). Zero above the tabs.
  const tabInset = useTabInset();
  const paddingBottom =
    Math.max(Spacing.four + (edges.includes('bottom') ? insets.bottom : 0), tabInset) +
    bottomInset;

  return (
    <View
      className="bg-background"
      style={[styles.canvas, { backgroundColor: tokens.canvas }]}
      testID={testID}>
      <View style={styles.column}>
        <FlashList
          ref={listRef}
          testID={listTestID}
          data={data as Item[]}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ItemSeparatorComponent={Separator}
          getItemType={getItemType}
          stickyHeaderIndices={stickyHeaderIndices}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          ListHeaderComponent={header}
          ListHeaderComponentStyle={styles.header}
          ListEmptyComponent={empty}
          ListFooterComponent={footer}
          contentContainerStyle={{
            ...styles.content,
            paddingHorizontal: horizontalInset,
            ...(endInset === undefined ? null : { paddingEnd: endInset }),
            paddingTop,
            paddingBottom,
          }}
          contentInsetAdjustmentBehavior={underHeader ? 'automatic' : undefined}
          keyboardShouldPersistTaps="handled"
          {...(drawDistance === undefined ? null : { drawDistance })}
        />
      </View>
    </View>
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
