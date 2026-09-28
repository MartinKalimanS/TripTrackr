/**
 * Home — the globe (T099; FR-045, FR-050, FR-051; research D-30).
 *
 * The traveller's own trips as connections on a 3D globe, read from the
 * encrypted local store (Constitution II) — no network is needed to open it.
 * Every state is designed (FR-027): loading, error, no trips (plan the first),
 * trips without a stop (go and add one), and the globe itself with its
 * statistics floating above it. The trip list lives on the Trips tab, which is
 * also the accessible path to every trip the map shows.
 *
 * The populated globe is full-bleed, so it does not sit in `Screen`'s
 * ScrollView — a map inside a scroller fights it for every pan. The message
 * states do, so they still scroll at the largest text size (contract C13).
 */
import { useRouter } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlobeEmptyState } from '@/components/globe/empty-state';
import { GlobeView } from '@/components/globe/globe-view';
import { StatsOverlay } from '@/components/globe/stats-overlay';
import { ThemedView } from '@/components/themed-view';
import { Screen } from '@/components/ui/screen';
import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { Spacing } from '@/constants/theme';
import { hasPlacedStop } from '@/features/globe/globe-data';
import { useGlobe, type GlobeData } from '@/features/globe/use-globe';
import { todayIso } from '@/features/trips/stop-dates';

export default function HomeScreen() {
  const router = useRouter();
  // One calendar day for the whole screen: the statuses and the beacon's
  // resting stop must agree, even across midnight.
  const today = todayIso();
  const { data, loading, error } = useGlobe(today);

  if (error) {
    return (
      <HomeMessage>
        <ErrorState
          title="Couldn’t read your trips"
          detail="The local store did not answer. Restarting the app usually clears this."
        />
      </HomeMessage>
    );
  }
  if (loading) {
    return (
      <HomeMessage>
        <LoadingState title="Loading your globe" />
      </HomeMessage>
    );
  }
  if (!data.trips.some(hasPlacedStop)) {
    const reason = data.trips.length === 0 ? 'no-trips' : 'no-stops';
    const onAction = () =>
      reason === 'no-trips' ? router.push('/modal/add-trip') : router.navigate('/trips');
    return (
      <HomeMessage>
        <GlobeEmptyState reason={reason} onAction={onAction} />
      </HomeMessage>
    );
  }
  return <HomeGlobe data={data} today={today} />;
}

/** The populated home: the globe, full-bleed, with its statistics above it. */
function HomeGlobe({ data, today }: { data: GlobeData; today: string }) {
  return (
    <ThemedView type="canvas" style={styles.fill} testID="home-screen">
      <GlobeView
        trips={data.trips}
        focus={data.focus}
        today={today}
        accessibilityLabel={describeGlobe(
          data.trips.length,
          data.summary.countriesVisited,
        )}
      />
      <SafeAreaView edges={['top']} style={styles.overlay}>
        <StatsOverlay summary={data.summary} />
      </SafeAreaView>
    </ThemedView>
  );
}

function HomeMessage({ children }: PropsWithChildren) {
  return (
    <Screen testID="home-screen" edges={['top']} style={styles.message}>
      <View>{children}</View>
    </Screen>
  );
}

function describeGlobe(tripCount: number, countries: number): string {
  const trips = tripCount === 1 ? '1 trip' : `${tripCount} trips`;
  const places = countries === 1 ? '1 country' : `${countries} countries`;
  return `Globe showing ${trips} across ${places}. Every trip is also listed in the Trips tab.`;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  message: {
    justifyContent: 'center',
  },
  // Lets touches through to the map everywhere except on the panel itself.
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'flex-start',
    padding: Spacing.three,
    pointerEvents: 'box-none',
  },
});
