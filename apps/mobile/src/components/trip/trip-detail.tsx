/**
 * A trip as a journey - tasks.md T068, 004 T431, 005 T543 to T546 (spec FR-025, FR-037 to
 * FR-043; contract C5-20; screens.md "Trip"; research D5-10, D5-12, D5-17). The body of
 * `app/trip/[id]/index.tsx`, once the trip has been read.
 *
 * Top to bottom, in one scroll view that runs under the transparent native header:
 *
 * 1. The hero (`TripHero`): the cover, the title anchored to its bottom, the country and the
 *    dates. It moves at half the speed of the content and stretches on overscroll.
 * 2. The sheet, overlapping the hero by 28 dp: the status row (`ProgressRow`: the derived
 *    status, "Day N of M", the currency, the pending marker, the one sync chip), the one slim
 *    banner when there is something to say (offline, an upload that failed, a sync that
 *    failed), and the five areas (`AreasStrip`) with their counts, the spending total and the
 *    locks.
 * 3. The day strip (`DayChips`), hidden for a trip with no stops. It is ONE instance laid over a
 *    placeholder of its own height in the content (`PinnedStrip`) so that it scrolls with the
 *    areas and then stays under the collapsed bar. Choosing a day highlights that day's stops
 *    and scrolls to the first of them, below the bar and the strip.
 * 4. The stops: a heading with their count, the timeline with the distance between stops and a
 *    dashed "Add stop" row at its end, or, with none, a ghost stamp, "No stops yet" and the one
 *    primary "Add stop". A failed local write is shown under them (`trip-write-error`).
 *
 * Once the hero has scrolled away the bar (`CollapsedBar`) takes its place, with the title; the
 * Back control is the native header's `headerLeft` at every scroll position, so there is one.
 *
 * Everything is read from the encrypted local store through live queries and written through the
 * repositories; the status is derived from the stops on every render, never the stored column
 * (FR-013). Visibility posture: private, local, never transmitted; the counts, the total and the
 * pictures are the signed-in traveller's own and show no other person's content.
 */
import { useRouter } from 'expo-router';
import {
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedRef,
  useScrollOffset,
  useSharedValue,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { Banner } from '@/components/ui/banner';
import { InlineError } from '@/components/ui/inline-error';
import type { StopWithPlace } from '@/db/repositories/stops';
import type { TripRow } from '@/db/schema';
import { stopForDay, tripDays, type TripDay } from '@/features/trips/trip-days';
import { dayProgress } from '@/features/trips/trip-progress';
import { deriveTripStatus, tripDateRange } from '@/features/trips/trip-status';
import { useTripOverview } from '@/features/trips/trip-overview';
import { useTripSync, type TripSync } from '@/features/trips/use-trip-sync';
import { useTripStops } from '@/features/trips/use-trips';
import { useAccessibilityFlags } from '@/hooks/use-accessibility-flags';
import { Radii, Space } from '@/theme';

import { AreasStrip, type AreaSegment } from './areas-strip';
import { CollapsedBar } from './collapsed-bar';
import { DayChips } from './day-chips';
import {
  COLLAPSED_BAR_HEIGHT,
  HERO_MIN_HEIGHT,
  SHEET_OVERLAP,
  useHeroCollapse,
} from './hero-collapse';
import { PinnedStrip } from './pinned-strip';
import { ProgressRow } from './progress-row';
import { StopEditor } from './stop-editor';
import { StopsBody, StopsHeader } from './trip-states';
import { TripHero, type TripHeroCountry } from './trip-hero';
import { useStopEditor, useStopWrites } from './use-stop-editing';

/** The first stop with a known country names the trip's country (its flag is the stop's). */
function countryOf(stops: readonly StopWithPlace[]): TripHeroCountry | null {
  const first = stops.find((stop) => stop.country_name);
  return first
    ? { iso2: first.country_iso ?? null, name: first.country_name as string }
    : null;
}

/** Until the strip has been laid out once: the height of one day chip and its air. */
const CHIPS_GUESS = Space[10] + Space[4];

/** Where each part of the screen sits, which the day strip needs to scroll to a stop. */
interface Measured {
  bodyY: number;
  listY: number;
  offsets: ReadonlyMap<string, number>;
}

/** The scroll offset and what moves with it: the hero's collapse and the pinned strip. */
function useTripScroll(scrollRef: AnimatedRef<Animated.ScrollView>) {
  const insetTop = useContext(SafeAreaInsetsContext)?.top ?? 0;
  const scrollY = useScrollOffset(scrollRef);
  const heroHeight = useSharedValue(HERO_MIN_HEIGHT);
  const chipsY = useSharedValue(0);
  const collapse = useHeroCollapse(scrollY, heroHeight, insetTop);
  return { scrollY, heroHeight, chipsY, collapse, insetTop };
}

interface DayStripTargets {
  scrollRef: AnimatedRef<Animated.ScrollView>;
  /** Where the screen's parts sit, written by their layouts, read when a day is chosen. */
  measuredRef: RefObject<Measured>;
  insetTop: number;
}

/** The chosen day, the stops it highlights, and the scroll to its first stop. */
function useDayStrip(
  days: readonly TripDay[],
  { scrollRef, measuredRef, insetTop }: DayStripTargets,
  chipsHeight: number,
) {
  const { prefersLessMotion } = useAccessibilityFlags();
  const [day, setDay] = useState<number | null>(null);

  const select = useCallback(
    (next: number | null) => {
      setDay(next);
      const stopId = next === null ? null : stopForDay(days, next);
      if (stopId === null) return;
      const { bodyY, listY, offsets } = measuredRef.current;
      const pinned = COLLAPSED_BAR_HEIGHT + insetTop + chipsHeight;
      const y = Math.max(0, bodyY + listY + (offsets.get(stopId) ?? 0) - pinned);
      scrollRef.current?.scrollTo({ y, animated: !prefersLessMotion });
    },
    [days, scrollRef, measuredRef, insetTop, chipsHeight, prefersLessMotion],
  );
  const highlighted = useMemo(() => {
    const chosen = days.find((candidate) => candidate.index === day);
    return chosen ? new Set(chosen.stopIds) : undefined;
  }, [days, day]);
  return { day, select, highlighted };
}

interface SheetHeadProps {
  trip: TripRow;
  stops: readonly StopWithPlace[];
  sync: TripSync;
  overview: ReturnType<typeof useTripOverview>;
  onRetry: () => void;
}

/** The sheet's first block: the status row, the one banner and the five areas. */
function SheetHead({ trip, stops, sync, overview, onRetry }: SheetHeadProps) {
  const router = useRouter();
  const status = deriveTripStatus(stops);
  const dayOf = status === 'active' ? dayProgress(tripDateRange(stops)) : null;
  const open = (segment: AreaSegment) => router.push(`/trip/${trip.id}/${segment}`);
  return (
    <View
      testID="trip-sheet"
      style={styles.sheet}
      className="gap-3 bg-surface px-5 pb-3 pt-4">
      <ProgressRow
        status={status}
        dayOf={dayOf}
        currency={trip.home_currency}
        pending={trip.is_dirty}
        syncState={sync.state}
        onRetry={sync.retrySync}
      />
      {sync.banner ? (
        <Banner
          testID="trip-banner"
          tone={sync.banner.tone}
          message={sync.banner.message}
          action={
            sync.banner.action
              ? { label: 'Retry', onPress: onRetry, testID: 'trip-banner-retry' }
              : undefined
          }
        />
      ) : null}
      <AreasStrip
        counts={overview.counts}
        spending={{ total: overview.spendingTotal, currency: trip.home_currency }}
        warnPhotos={overview.failedPhotos > 0}
        onOpen={open}
      />
    </View>
  );
}

interface StopsSectionProps {
  stops: ReturnType<typeof useTripStops>;
  overview: ReturnType<typeof useTripOverview>;
  writes: ReturnType<typeof useStopWrites>;
  editing: ReturnType<typeof useStopEditor>;
  highlighted: ReadonlySet<string> | undefined;
  measuredRef: RefObject<Measured>;
}

/** The last block of the sheet: the stops with their heading, and what a failed write says. */
function StopsSection({
  stops,
  overview,
  writes,
  editing,
  highlighted,
  measuredRef,
}: StopsSectionProps) {
  const bottom = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  const place = (patch: Partial<Measured>) => {
    measuredRef.current = { ...measuredRef.current, ...patch };
  };
  return (
    <View
      testID="trip-stops-body"
      className="gap-3 bg-surface px-5 pt-2"
      style={{ paddingBottom: bottom + Space[8] }}
      onLayout={(event) => place({ bodyY: event.nativeEvent.layout.y })}>
      <StopsHeader count={stops.data.length} />
      <View
        testID="trip-stops-list"
        className="gap-3"
        onLayout={(event) => place({ listY: event.nativeEvent.layout.y })}>
        <StopsBody
          stops={stops}
          onAdd={editing.openAdd}
          onMove={writes.move}
          onReorder={writes.reorder}
          onEdit={editing.openEdit}
          onRemove={writes.remove}
          thumbs={overview.cityThumbs}
          highlighted={highlighted}
          onOffsets={(offsets) => place({ offsets })}
        />
      </View>
      <InlineError testID="trip-write-error" message={writes.writeError} />
    </View>
  );
}

/** What the screen reads and writes: the stops, the five areas' summary, sync and the editor. */
function useTripData(trip: TripRow) {
  const stops = useTripStops(trip.id);
  const overview = useTripOverview(trip, deriveTripStatus(stops.data));
  const sync = useTripSync({ overview });
  const writes = useStopWrites(trip.id);
  const editing = useStopEditor(stops.data, writes.save);
  const days = useMemo(() => tripDays(stops.data), [stops.data]);
  return { stops, overview, sync, writes, editing, days };
}

/** The place the day strip sits at in the content, kept free at the strip's own height. */
function DaysAnchor({ height, chipsY }: { height: number; chipsY: SharedValue<number> }) {
  return (
    <View
      testID="trip-days-anchor"
      className="bg-surface"
      style={{ height }}
      onLayout={(event) => chipsY.set(event.nativeEvent.layout.y)}
    />
  );
}

interface DaysPinProps {
  days: readonly TripDay[];
  strip: ReturnType<typeof useDayStrip>;
  scroll: ReturnType<typeof useTripScroll>;
  onHeight: (height: number) => void;
}

/** The one day strip, moved over its anchor and then held under the collapsed bar. */
function DaysPin({ days, strip, scroll, onHeight }: DaysPinProps) {
  return (
    <PinnedStrip
      anchorY={scroll.chipsY}
      scrollY={scroll.scrollY}
      pinLine={COLLAPSED_BAR_HEIGHT + scroll.insetTop}
      onHeight={onHeight}>
      <View className="px-5">
        <DayChips days={days} selected={strip.day} onSelect={strip.select} />
      </View>
    </PinnedStrip>
  );
}

function EditorHost({ editing }: { editing: ReturnType<typeof useStopEditor> }) {
  if (!editing.editor) return null;
  return (
    <StopEditor
      visible
      mode={editing.editor.mode}
      onCancel={editing.close}
      onSubmit={editing.submit}
    />
  );
}

interface DetailHeroProps {
  trip: TripRow;
  stops: readonly StopWithPlace[];
  overview: ReturnType<typeof useTripOverview>;
  scroll: ReturnType<typeof useTripScroll>;
}

/** The picture, with the country and dates of the stops; it tells the collapse how tall it is. */
function DetailHero({ trip, stops, overview, scroll }: DetailHeroProps) {
  return (
    <TripHero
      title={trip.title}
      cover={overview.cover}
      tripId={trip.id}
      country={countryOf(stops)}
      dateRange={tripDateRange(stops)}
      imageStyle={scroll.collapse.imageStyle}
      onHeight={(height) => scroll.heroHeight.set(height)}
    />
  );
}

export function TripDetail({ trip }: { trip: TripRow }) {
  const { stops, overview, sync, writes, editing, days } = useTripData(trip);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const measuredRef = useRef<Measured>({ bodyY: 0, listY: 0, offsets: new Map() });
  const scroll = useTripScroll(scrollRef);
  const [chipsHeight, setChipsHeight] = useState(CHIPS_GUESS);
  const targets = { scrollRef, measuredRef, insetTop: scroll.insetTop };
  const strip = useDayStrip(days, targets, chipsHeight);

  return (
    <View testID="trip-screen" className="flex-1 bg-surface">
      <Animated.ScrollView
        ref={scrollRef}
        testID="trip-scroll"
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled">
        <DetailHero trip={trip} stops={stops.data} overview={overview} scroll={scroll} />
        <SheetHead
          trip={trip}
          stops={stops.data}
          sync={sync}
          overview={overview}
          onRetry={() => writes.attempt(sync.retry)}
        />
        {days.length > 0 ? (
          <DaysAnchor height={chipsHeight} chipsY={scroll.chipsY} />
        ) : null}
        <StopsSection
          stops={stops}
          overview={overview}
          writes={writes}
          editing={editing}
          highlighted={strip.highlighted}
          measuredRef={measuredRef}
        />
      </Animated.ScrollView>
      {days.length > 0 ? (
        <DaysPin days={days} strip={strip} scroll={scroll} onHeight={setChipsHeight} />
      ) : null}
      <CollapsedBar title={trip.title} style={scroll.collapse.barStyle} />
      <EditorHost editing={editing} />
    </View>
  );
}

const styles = StyleSheet.create({
  // The sheet's rounded top rides over the hero by its own overlap.
  sheet: {
    marginTop: -SHEET_OVERLAP,
    borderTopLeftRadius: Radii.sheet,
    borderTopRightRadius: Radii.sheet,
    borderCurve: 'continuous',
  },
});
