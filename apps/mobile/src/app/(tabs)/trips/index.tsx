/**
 * Trips - the local trip list on Sunrise Passport (tasks.md T066; T430 for Atlas; T541 here;
 * FR-024, FR-029, FR-030, FR-035, FR-036, FR-065; Constitution II; contract C5-32 "Trips";
 * research D5-12; owner answer Q-4).
 *
 * Read from the encrypted local store through a live query (`useTrips`: the trips as card
 * models, most recently changed first). The title is the navigator's: a large "Trips" on iOS, a
 * standard header on Android (`trips/_layout.tsx`), so the screen lays out no title of its own;
 * it adds the sync chip to that header while changes wait. The list is a `FlashList` through
 * `ListScreen` (D-23), `underHeader`: the scroller is the first thing the screen renders, which
 * is where react-native-screens looks for it, and it takes `contentInsetAdjustmentBehavior=
 * "automatic"`. Those props are asserted in the tests; that the large title then collapses as
 * the list scrolls is a device check (T408), not something Jest can see.
 *
 * The list is MIXED (`composeTripList`): the active trip as a hero, the next planned trip as a
 * ticket, every other trip as a row, rows under year headers that stay in view (sticky), each
 * kind of item its own recycled cell (`getItemType`). Under the title: how many trips there are,
 * the filter (All, Active, Planned, Past, each with its count) and, when there is one, the sync
 * banner. From 200 trips a year strip sits on the right edge and jumps to a year.
 *
 * Every state is designed (C5-31 rule 2): skeleton shapes while the store has not answered
 * (never the empty state), words and an icon when it failed, a sentence and a secondary "Plan a
 * trip" for no trips, and a message with the way back for a filter that matches none. "Plan a
 * trip" is ONE extended button above the tab pill on both platforms (`PlanTripFab`, id
 * `trips-plan-trip`; the iOS header action of feature 004 is gone), there in every state. The list
 * pads past the pill and the button (FR-024).
 *
 * Visibility posture: private, local, never transmitted, nothing new stored. The list, the
 * counts, the years and the kilometres are derived from the signed-in traveller's own local
 * rows (D5-17); the filter is component state and is forgotten with the screen.
 */
import type { FlashListRef, ViewToken } from '@shopify/flash-list';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import {
  FabClearance,
  TripListItemView,
  TripsEmpty,
  TripsListHeader,
} from '@/components/trip/trips-list-parts';
import { useTabZone } from '@/components/trip/use-tab-zone';
import { YearScrubber } from '@/components/trip/year-scrubber';
import { ListScreen, type ListScreenProps } from '@/components/ui/list-screen';
import { PlanTripFab } from '@/components/ui/plan-trip-fab';
import { SyncChip } from '@/components/ui/sync-chip';
import { Spacing } from '@/constants/theme';
import type { TripCardModel } from '@/features/trips/trip-card-model';
import {
  YEAR_SCRUBBER_MIN_TRIPS,
  composeTripList,
  listedYears,
  tripFilterCounts,
  tripItemKey,
  tripItemType,
  tripSpan,
  yearHeaderIndex,
  yearOfItems,
  type TripFilter,
  type TripListItem,
} from '@/features/trips/trip-sections';
import { useTrips } from '@/features/trips/use-trips';
import {
  useTripsSync,
  type TripsBanner,
  type TripsSync,
} from '@/features/trips/use-trips-sync';
import { ScreenMargin } from '@/theme';

const NO_CARDS: TripCardModel[] = [];
/** The room the list leaves at its end for the year strip: 28 dp of strip and the margins. */
const STRIP_ROOM = 44;
/** A row is in view as soon as a sliver of it is. */
const VIEWABILITY = { itemVisiblePercentThreshold: 1 } as const;

/** The indices of the year headers: what sticks to the top of the list. */
const headerIndices = (items: readonly TripListItem[]): number[] =>
  items.flatMap((item, index) => (item.type === 'yearHeader' ? [index] : []));

/**
 * The year strip's two halves: the year at the top of the list (from what is in view) and the
 * jump to a year (a scroll to its header). The strip itself exists from 200 trips.
 */
function useYearStrip(items: readonly TripListItem[]) {
  const listRef = useRef<FlashListRef<TripListItem>>(null);
  const [activeYear, setActiveYear] = useState<number | null>(null);
  const years = useMemo(() => listedYears(items), [items]);
  const yearAt = useMemo(() => yearOfItems(items), [items]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<TripListItem>[] }) => {
      const indices = viewableItems.flatMap(({ index }) =>
        index === null ? [] : [index],
      );
      const year = indices.length > 0 ? yearAt[Math.min(...indices)] : null;
      setActiveYear(typeof year === 'number' ? year : null);
    },
    [yearAt],
  );
  const jump = useCallback(
    (year: number) => {
      const index = yearHeaderIndex(items, year);
      if (index < 0) return;
      listRef.current?.scrollToIndex({ index, animated: false });
      setActiveYear(year);
    },
    [items],
  );
  return { listRef, years, activeYear, onViewableItemsChanged, jump };
}

/** What the list shows now: the cards of a settled store, composed for the filter. */
function useTripsList(filter: TripFilter) {
  const { data, loading, error } = useTrips();
  // A failure or a first load shows its own state, never cards left from before.
  const settled = !loading && !error;
  const cards = settled ? data : NO_CARDS;
  const items = useMemo(() => composeTripList(cards, filter), [cards, filter]);
  const sticky = useMemo(() => headerIndices(items), [items]);
  return { data, cards, items, sticky, loading, error, settled };
}

/** The header's options: the sync chip while changes wait, nothing when all is synchronised. */
function useSyncHeaderOptions(sync: TripsSync) {
  const kind = sync.chip.kind;
  const count = 'count' in sync.chip ? sync.chip.count : 0;
  return useMemo(
    () => ({
      headerRight:
        kind === 'synced'
          ? undefined
          : () => (
              <SyncChip
                state={{ kind, count }}
                onRetry={kind === 'failed' ? sync.retry : undefined}
              />
            ),
    }),
    [kind, count, sync.retry],
  );
}

type TripsList = ReturnType<typeof useTripsList>;

interface TripsListViewProps {
  list: TripsList;
  strip: ReturnType<typeof useYearStrip>;
  sync: TripsSync;
  filter: TripFilter;
  onFilter: (filter: TripFilter) => void;
  /** The year strip is drawn: the list leaves it room at the end. */
  stripShown: boolean;
  onPlan: () => void;
  onOpen: (tripId: string) => void;
}

/** What does not change between renders: the shape of the list and how it recycles. */
const LIST_SHAPE: Pick<
  ListScreenProps<TripListItem>,
  | 'underHeader'
  | 'edges'
  | 'itemGap'
  | 'keyExtractor'
  | 'getItemType'
  | 'viewabilityConfig'
> = {
  underHeader: true,
  // The floating pill runs over the bottom of the screen: `ListScreen` ends the list above it.
  edges: [],
  // Each item spaces itself: 16 dp under a card, 12 dp under a row.
  itemGap: 0,
  keyExtractor: tripItemKey,
  getItemType: tripItemType,
  viewabilityConfig: VIEWABILITY,
};

interface TripsHeaderProps {
  cards: readonly TripCardModel[];
  settled: boolean;
  filter: TripFilter;
  onFilter: (filter: TripFilter) => void;
  banner: TripsBanner | null;
}

/** The count, the filter and the banner; the counts are read again only when the cards change. */
function TripsHeader({ cards, settled, filter, onFilter, banner }: TripsHeaderProps) {
  const span = useMemo(() => (settled ? tripSpan(cards) : null), [cards, settled]);
  const counts = useMemo(
    () => (settled ? tripFilterCounts(cards) : null),
    [cards, settled],
  );
  return (
    <TripsListHeader
      span={span}
      counts={counts}
      filter={filter}
      onFilter={onFilter}
      banner={banner}
    />
  );
}

function TripsListView(props: TripsListViewProps) {
  const { list, strip, sync, filter, onFilter, onOpen } = props;
  const { cards, items, settled, loading, error } = list;
  // A failed store has no list to filter: the error stands alone.
  const showHeader = !error && (loading || cards.length > 0);

  return (
    <ListScreen<TripListItem>
      {...LIST_SHAPE}
      testID="trips-screen"
      listTestID={items.length > 0 ? 'trips-list' : undefined}
      horizontalInset={
        Platform.OS === 'android' ? ScreenMargin.androidList : ScreenMargin.default
      }
      endInset={props.stripShown ? STRIP_ROOM : undefined}
      data={items}
      stickyHeaderIndices={list.sticky}
      listRef={strip.listRef}
      onViewableItemsChanged={strip.onViewableItemsChanged}
      renderItem={({ item }) => <TripListItemView item={item} onOpen={onOpen} />}
      header={
        showHeader ? (
          <TripsHeader
            cards={cards}
            settled={settled}
            filter={filter}
            onFilter={onFilter}
            banner={sync.banner}
          />
        ) : null
      }
      empty={
        <TripsEmpty
          loading={loading}
          error={error}
          tripCount={cards.length}
          filter={filter}
          onPlan={props.onPlan}
          onResetFilter={() => onFilter('all')}
        />
      }
      footer={<FabClearance />}
    />
  );
}

export default function TripsScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<TripFilter>('all');
  const list = useTripsList(filter);
  const sync = useTripsSync();
  const strip = useYearStrip(list.items);
  const tabZone = useTabZone();
  const headerOptions = useSyncHeaderOptions(sync);

  const onPlan = useCallback(() => router.push('/modal/add-trip'), [router]);
  const onOpen = useCallback((id: string) => router.push(`/trip/${id}`), [router]);
  const showStrip =
    list.settled &&
    list.cards.length >= YEAR_SCRUBBER_MIN_TRIPS &&
    strip.years.length > 0;

  return (
    <View className="flex-1">
      <TripsListView
        list={list}
        strip={strip}
        sync={sync}
        filter={filter}
        onFilter={setFilter}
        stripShown={showStrip}
        onPlan={onPlan}
        onOpen={onOpen}
      />
      {showStrip ? (
        <View
          pointerEvents="box-none"
          className="absolute justify-center"
          style={{ top: 0, bottom: tabZone + Spacing.three, end: Spacing.one }}>
          <YearScrubber
            years={strip.years}
            activeYear={strip.activeYear}
            onJump={strip.jump}
          />
        </View>
      ) : null}
      <PlanTripFab onPress={onPlan} bottomInset={tabZone} />
      <Stack.Screen options={headerOptions} />
    </View>
  );
}
