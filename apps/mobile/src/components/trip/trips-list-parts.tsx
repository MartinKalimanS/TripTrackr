/**
 * The parts of the Trips list that are not a card (feature 005, T541; contract C5-32 "Trips";
 * FR-024, FR-029, FR-035, FR-036): the header (how many trips, the filter with its counts, the
 * sync banner), what stands in for the rows (skeleton, error, empty, filtered-empty), the
 * wrapper that gives each kind of item its spacing, and the clearance at the foot that keeps the
 * last card out from behind the pill and the "Plan a trip" button.
 *
 * Presentational: it holds no state and reads nothing; the screen (`app/(tabs)/trips`) owns the
 * data, the filter and the router.
 */
import type { ReactElement } from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';

import { Banner } from '@/components/ui/banner';
import { fabHeightAt } from '@/components/ui/plan-trip-fab';
import { TripListSkeleton } from '@/components/ui/screen-skeletons';
import { SegmentedPill, type SegmentOption } from '@/components/ui/segmented-pill';
import { EmptyState, ErrorState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { tripsCountLine } from '@/features/trips/trip-card-copy';
import type { TripFilter, TripListItem } from '@/features/trips/trip-sections';
import type { TripsBanner } from '@/features/trips/use-trips-sync';
import { Space } from '@/theme';

import { TicketCard } from './ticket-card';
import { TripHeroCard } from './trip-hero-card';
import { TripRow } from './trip-row';
import { YearHeader } from './year-header';

/** The four segments of the filter: the ids are written out so the id extractor reads them. */
const FILTER_SEGMENTS = [
  { key: 'all', label: 'All', testID: 'trips-filter-all' },
  { key: 'active', label: 'Active', testID: 'trips-filter-active' },
  { key: 'planned', label: 'Planned', testID: 'trips-filter-planned' },
  { key: 'past', label: 'Past', testID: 'trips-filter-past' },
] as const satisfies readonly { key: TripFilter; label: string; testID: string }[];

/** The segments with their counts in view and in their names ("Active, 1"); none while loading. */
export function filterOptions(
  counts: Record<TripFilter, number> | null,
): SegmentOption[] {
  return FILTER_SEGMENTS.map((segment) => {
    const count = counts?.[segment.key];
    return {
      ...segment,
      count,
      accessibilityLabel:
        count === undefined ? segment.label : `${segment.label}, ${count}`,
    };
  });
}

export interface TripsListHeaderProps {
  /** `null` while loading: the filter is drawn, with no counts and no line of trips. */
  span: { count: number; sinceYear: number | null } | null;
  counts: Record<TripFilter, number> | null;
  filter: TripFilter;
  onFilter: (filter: TripFilter) => void;
  banner: TripsBanner | null;
}

export function TripsListHeader({
  span,
  counts,
  filter,
  onFilter,
  banner,
}: TripsListHeaderProps) {
  return (
    // 16 dp between the count, the filter and the banner (the prototype's `.list` gap); the count
    // line keeps its 12 dp to the filter (`margin: -8px 0 12px` under the title).
    <View testID="trips-header" style={{ gap: Spacing.three }}>
      {span ? (
        <Text
          variant="label"
          tone="muted"
          testID="trips-count"
          style={{ marginBottom: -Spacing.one }}>
          {tripsCountLine(span)}
        </Text>
      ) : null}
      <SegmentedPill
        options={filterOptions(counts)}
        selectedKey={filter}
        onSelect={(key) => onFilter(key as TripFilter)}
        accessibilityLabel="Filter trips"
        testID="trips-filter"
      />
      {banner ? (
        <Banner
          tone={banner.tone}
          message={banner.message}
          action={
            banner.action ? { ...banner.action, testID: 'trips-sync-retry' } : undefined
          }
          testID="trips-sync-banner"
        />
      ) : null}
    </View>
  );
}

const FILTER_WORDS: Record<TripFilter, string> = {
  all: 'No trips match',
  active: 'No active trips',
  planned: 'No planned trips',
  past: 'No past trips',
};

export interface TripsEmptyProps {
  loading: boolean;
  error: Error | null;
  /** Trips there are, whatever the filter. */
  tripCount: number;
  filter: TripFilter;
  onPlan: () => void;
  onResetFilter: () => void;
}

/** What the list shows instead of rows: the one state that applies. */
export function TripsEmpty({
  loading,
  error,
  tripCount,
  filter,
  onPlan,
  onResetFilter,
}: TripsEmptyProps): ReactElement {
  if (error) {
    return (
      <ErrorState
        title="Couldn’t read your trips"
        detail="The local store did not answer. Restarting the app usually clears this."
      />
    );
  }
  if (loading) return <TripListSkeleton />;
  if (tripCount === 0) {
    return (
      <EmptyState
        testID="trips-empty"
        title="No trips yet"
        detail="Every trip you plan or take will be listed here."
        icon="suitcase"
        action={{
          label: 'Plan a trip',
          onPress: onPlan,
          testID: 'trips-empty-plan-trip',
        }}
      />
    );
  }
  return (
    <EmptyState
      testID="trips-filtered-empty"
      variant="filtered"
      title={FILTER_WORDS[filter]}
      detail="Try another filter to see your other trips."
      action={{
        label: 'Show all trips',
        onPress: onResetFilter,
        testID: 'trips-filter-reset',
      }}
    />
  );
}

/** 16 dp between cards, 12 dp between rows (the contract), and a header sets its own. */
const CARD_GAP = Spacing.three;
const ROW_GAP = Space[3];

export function TripListItemView({
  item,
  onOpen,
}: {
  item: TripListItem;
  onOpen: (tripId: string) => void;
}) {
  switch (item.type) {
    case 'hero':
      return (
        <View style={{ paddingBottom: CARD_GAP }}>
          <TripHeroCard trip={item.trip} onPress={() => onOpen(item.trip.id)} />
        </View>
      );
    case 'ticket':
      return (
        <View style={{ paddingBottom: CARD_GAP }}>
          <TicketCard trip={item.trip} onPress={() => onOpen(item.trip.id)} />
        </View>
      );
    case 'row':
      return (
        <View style={{ paddingBottom: ROW_GAP }}>
          <TripRow trip={item.trip} onPress={() => onOpen(item.trip.id)} />
        </View>
      );
    case 'yearHeader':
      return (
        <YearHeader
          year={item.year}
          tripCount={item.tripCount}
          distanceKm={item.distanceKm}
        />
      );
  }
}

/**
 * The "Plan a trip" button's own height at this text size (52 dp on iOS, 56 dp on Android, a
 * little more once its words reach the 1.3 cap) and the 16 dp above it: with the pill's zone and
 * the 16 dp above that, the list ends 172 dp from the bottom (176 on Android).
 */
export function FabClearance() {
  const { fontScale } = useWindowDimensions();
  const button = fabHeightAt(Platform.OS, fontScale);
  return (
    <View
      testID="trips-fab-clearance"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height: button + Spacing.three }}
    />
  );
}
