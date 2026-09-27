/**
 * Trips — the local trip list (tasks.md T066; FR-010, FR-013; Constitution II).
 *
 * Read from the encrypted local store through a live query, most recently
 * changed first. Each row shows the title, the derived status (text + icon),
 * the stop count, and a pending marker while the row awaits the sync engine.
 * Every state is designed (FR-027): loading, empty, error, and populated.
 */
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { TripCard } from '@/components/trip/trip-card';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { Spacing } from '@/constants/theme';
import { useTrips } from '@/features/trips/use-trips';

export default function TripsScreen() {
  const router = useRouter();
  const { data, loading, error } = useTrips();

  return (
    <Screen testID="trips-screen" edges={['top']}>
      <View style={styles.header}>
        <ThemedText type="subtitle">Trips</ThemedText>
        <PressableSurface
          testID="trips-plan-trip"
          accessibilityLabel="Plan a trip"
          depth={2}
          onPress={() => router.push('/modal/add-trip')}
          style={styles.headerAction}>
          <ThemedText type="smallBold">Plan a trip</ThemedText>
        </PressableSurface>
      </View>

      {error ? (
        <ErrorState
          title="Couldn’t read your trips"
          detail="The local store did not answer. Restarting the app usually clears this."
        />
      ) : loading ? (
        <LoadingState title="Loading trips" />
      ) : data.length === 0 ? (
        <View style={styles.body}>
          <EmptyState
            title="No trips yet"
            detail="Every trip you plan or take will be listed here."
          />
        </View>
      ) : (
        <View style={styles.list} testID="trips-list">
          {data.map((summary) => (
            <TripCard
              key={summary.trip.id}
              summary={summary}
              onPress={() => router.push(`/trip/${summary.trip.id}`)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  headerAction: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  body: {
    gap: Spacing.four,
    marginTop: Spacing.three,
  },
  list: {
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
});
