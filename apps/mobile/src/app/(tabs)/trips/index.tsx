/**
 * Trips — the local trip list (tasks.md T066; restyled for Atlas by T430; FR-010, FR-011,
 * FR-013, FR-021, FR-035; Constitution II; contract C4-11 "Trips").
 *
 * Read from the encrypted local store through a live query, most recently changed
 * first. The title is the navigator's: a large "Trips" on iOS, a standard header on
 * Android (`trips/_layout.tsx`), so the screen lays out no title of its own. The list is
 * a `FlashList` through `ListScreen` (D-23), `underHeader`: the scroller is the first
 * thing the screen renders, which is where react-native-screens looks for it, and it
 * takes `contentInsetAdjustmentBehavior="automatic"`. Those props are asserted in the
 * tests; that the large title then collapses as the list scrolls is a device check
 * (T408), not something Jest can see.
 *
 * Every state is designed (C4-10 rule 2): skeleton cards while the store has not
 * answered (never the empty state), words and an icon when it failed, and for no trips
 * a sentence plus a "Plan a trip" action. "Plan a trip" is one control per platform,
 * with one id (`plan-trip-action.tsx`): an icon-only header action on iOS, an extended
 * floating button on Android, which the list leaves room for.
 *
 * Visibility posture: private. The list is the signed-in traveller's own local rows.
 */
import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Platform, View } from 'react-native';

import {
  PlanTripFab,
  PlanTripFabClearance,
  PlanTripHeaderAction,
} from '@/components/trip/plan-trip-action';
import { TripCard } from '@/components/trip/trip-card';
import type { IconName } from '@/components/ui/icon';
import { ListScreen } from '@/components/ui/list-screen';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/state-view';
import { useTrips, type TripSummary } from '@/features/trips/use-trips';

const SUITCASE: IconName = { ios: 'suitcase', android: 'luggage' };

/** What the list shows instead of rows: the one state that applies. */
function TripsEmpty({
  loading,
  error,
  onPlan,
}: {
  loading: boolean;
  error: Error | null;
  onPlan: () => void;
}) {
  if (error) {
    return (
      <ErrorState
        title="Couldn’t read your trips"
        detail="The local store did not answer. Restarting the app usually clears this."
      />
    );
  }
  if (loading) return <ListSkeleton variant="card" label="Loading trips" />;
  return (
    <EmptyState
      title="No trips yet"
      detail="Every trip you plan or take will be listed here."
      icon={SUITCASE}
      action={{ label: 'Plan a trip', onPress: onPlan, testID: 'trips-empty-plan-trip' }}
    />
  );
}

export default function TripsScreen() {
  const router = useRouter();
  const { data, loading, error } = useTrips();
  const onPlan = useCallback(() => router.push('/modal/add-trip'), [router]);
  const floating = Platform.OS === 'android';
  // A failure or a first load shows its own state, never rows left from before.
  const rows = error || loading ? [] : data;

  const headerOptions = useMemo(
    () => ({ headerRight: () => <PlanTripHeaderAction onPress={onPlan} /> }),
    [onPlan],
  );

  const list = (
    <ListScreen<TripSummary>
      testID="trips-screen"
      listTestID={rows.length > 0 ? 'trips-list' : undefined}
      underHeader
      // The tab bar below the screen already clears the home indicator.
      edges={[]}
      data={rows}
      keyExtractor={(summary) => summary.trip.id}
      renderItem={({ item }) => (
        <TripCard summary={item} onPress={() => router.push(`/trip/${item.trip.id}`)} />
      )}
      empty={<TripsEmpty loading={loading} error={error} onPlan={onPlan} />}
      footer={floating ? <PlanTripFabClearance /> : null}
    />
  );

  if (floating) {
    return (
      <View className="flex-1">
        {list}
        <PlanTripFab onPress={onPlan} />
      </View>
    );
  }
  return (
    <>
      {list}
      <Stack.Screen options={headerOptions} />
    </>
  );
}
