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
import { Field } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { ListScreen, type ListScreenProps } from '@/components/ui/list-screen';
import { PlanTripFab } from '@/components/ui/plan-trip-fab';
import { SyncChip } from '@/components/ui/sync-chip';
import { useToastVisible } from '@/components/ui/toast-zone';
import { Spacing } from '@/constants/theme';
import { OverAllowanceAlert } from '@/components/billing/over-allowance-alert';
import { usePlanTrip } from '@/features/billing/use-plan-trip';
import type { TripCardModel } from '@/features/trips/trip-card-model';
import { searchTrips } from '@/features/trips/trip-search';
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
/** The year strip's top, from the prototype's `.year-scrub` (right 4, top 250). */
const STRIP_TOP = 250;
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
function useTripsList(filter: TripFilter, query: string) {
  const { data, loading, error } = useTrips();
  // A failure or a first load shows its own state, never cards left from before.
  const settled = !loading && !error;
  const cards = settled ? data : NO_CARDS;
  // The search narrows what is listed only: the counts and "No trips yet" read every card.
  const items = useMemo(
    () => composeTripList(searchTrips(cards, query), filter),
    [cards, filter, query],
  );
  const sticky = useMemo(() => headerIndices(items), [items]);
  return { data, cards, items, sticky, loading, error, settled };
}

interface HeaderToolsProps {
  kind: TripsSync['chip']['kind'];
  count: number;
  onRetry: () => void;
  onSearch: () => void;
}

/**
 * The header's trailing controls (trips.png): the sync chip while changes wait, then Search, 8 dp
 * apart. Search opens the search field at the top of the list (spec 015, T1506); it is there in
 * every state, the chip only when there is something to say.
 */
function HeaderTools({ kind, count, onRetry, onSearch }: HeaderToolsProps) {
  return (
    <View
      testID="trips-header-tools"
      style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
      {kind === 'synced' ? null : (
        <SyncChip
          state={{ kind, count }}
          onRetry={kind === 'failed' ? onRetry : undefined}
        />
      )}
      <IconButton
        testID="trips-search"
        icon="search"
        variant="tonal"
        accessibilityLabel="Search"
        accessibilityHint="Find a trip by its name"
        onPress={onSearch}
      />
    </View>
  );
}

/** The header's options: the trailing controls, rebuilt only when the chip changes. */
function useHeaderOptions(sync: TripsSync, onSearch: () => void) {
  const kind = sync.chip.kind;
  const count = 'count' in sync.chip ? sync.chip.count : 0;
  const onRetry = sync.retry;
  return useMemo(
    () => ({
      headerRight: () => (
        <HeaderTools kind={kind} count={count} onRetry={onRetry} onSearch={onSearch} />
      ),
    }),
    [kind, count, onRetry, onSearch],
  );
}

/** The search: whether its field is open and what it holds. Closing it clears it. */
function useTripSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const show = useCallback(() => setOpen(true), []);
  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);
  return { open, query, setQuery, show, close };
}

type TripSearch = ReturnType<typeof useTripSearch>;

/** The search field at the top of the list, with the control that closes it. */
function SearchRow({ search }: { search: TripSearch }) {
  return (
    <View
      testID="trips-search-row"
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two }}>
      <View style={{ flex: 1 }}>
        <Field
          testID="trips-search-field"
          label="Search trips"
          value={search.query}
          onChangeText={search.setQuery}
          placeholder="Trip name"
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>
      <IconButton
        testID="trips-search-clear"
        icon="x"
        variant="tonal"
        accessibilityLabel="Close search"
        onPress={search.close}
      />
    </View>
  );
}

type TripsList = ReturnType<typeof useTripsList>;

interface TripsListViewProps {
  list: TripsList;
  search: TripSearch;
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
  | 'reachAll'
> = {
  underHeader: true,
  // The floating pill runs over the bottom of the screen: `ListScreen` ends the list above it.
  edges: [],
  // Each item spaces itself: 16 dp under a card, 12 dp under a row.
  itemGap: 0,
  keyExtractor: tripItemKey,
  getItemType: tripItemType,
  viewabilityConfig: VIEWABILITY,
  // Every trip is a node a screen reader can reach (SC-015), whatever the length of the list.
  reachAll: true,
};

interface TripsHeaderProps {
  search: TripSearch;
  cards: readonly TripCardModel[];
  settled: boolean;
  filter: TripFilter;
  onFilter: (filter: TripFilter) => void;
  banner: TripsBanner | null;
}

/** The count, the filter and the banner; the counts are read again only when the cards change. */
function TripsHeader({
  search,
  cards,
  settled,
  filter,
  onFilter,
  banner,
}: TripsHeaderProps) {
  const span = useMemo(() => (settled ? tripSpan(cards) : null), [cards, settled]);
  const counts = useMemo(
    () => (settled ? tripFilterCounts(cards) : null),
    [cards, settled],
  );
  return (
    <>
      {search.open ? <SearchRow search={search} /> : null}
      <OverAllowanceAlert />
      <TripsListHeader
        span={span}
        counts={counts}
        filter={filter}
        onFilter={onFilter}
        banner={banner}
      />
    </>
  );
}

function TripsListView(props: TripsListViewProps) {
  const { list, search, strip, sync, filter, onFilter, onOpen } = props;
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
            search={search}
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
          query={search.query}
          onClearSearch={search.close}
        />
      }
      footer={<FabClearance />}
    />
  );
}

export default function TripsScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<TripFilter>('all');
  const search = useTripSearch();
  const list = useTripsList(filter, search.query);
  const sync = useTripsSync();
  const strip = useYearStrip(list.items);
  const tabZone = useTabZone();
  const toastUp = useToastVisible();
  const headerOptions = useHeaderOptions(sync, search.show);

  const onPlan = usePlanTrip();
  const onOpen = useCallback((id: string) => router.push(`/trip/${id}`), [router]);
  const showStrip =
    list.settled &&
    list.cards.length >= YEAR_SCRUBBER_MIN_TRIPS &&
    strip.years.length > 0;

  return (
    <View className="flex-1">
      <TripsListView
        list={list}
        search={search}
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
          testID="trips-year-strip"
          style={{ position: 'absolute', top: STRIP_TOP, end: Spacing.one }}>
          <YearScrubber
            years={strip.years}
            activeYear={strip.activeYear}
            onJump={strip.jump}
          />
        </View>
      ) : null}
      <PlanTripFab onPress={onPlan} bottomInset={tabZone} lifted={toastUp} />
      <Stack.Screen options={headerOptions} />
    </View>
  );
}
