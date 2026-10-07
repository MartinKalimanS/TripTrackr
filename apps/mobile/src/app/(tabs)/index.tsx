/**
 * Home — the globe (T099; FR-045, FR-050, FR-051; research D-30; feature 003).
 *
 * The traveller's own trips as connections on a 3D globe, read from the
 * encrypted local store (Constitution II) — no network is needed to open it.
 * The globe is ALWAYS here (feature 003 FR-001): with no trips, with trips but
 * no stop, and when the store cannot be read. What differs is the one card
 * floating over it — an invitation to plan the first trip or add the first
 * stop, a plain-words notice, or, once something is drawn, the statistics
 * (FR-050). Only the brief wait for the local store is a message instead of
 * the globe, because a camera's starting position is read once and the globe
 * must open on the traveller's own trip. The trip list lives on the Trips tab,
 * which is also the accessible path to every trip the map shows.
 *
 * The globe is full-bleed, so it does not sit in `Screen`'s ScrollView — a map
 * inside a scroller fights it for every pan. The loading message does, so it
 * still scrolls at the largest text size (contract C13).
 */
import { useRouter } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlobeEmptyState, GlobeNotice } from '@/components/globe/empty-state';
import { GlobeView } from '@/components/globe/globe-view';
import { StatsOverlay } from '@/components/globe/stats-overlay';
import { ThemedView } from '@/components/themed-view';
import { Screen } from '@/components/ui/screen';
import { LoadingState } from '@/components/ui/state-view';
import { Spacing } from '@/constants/theme';
import {
  globeInvitation,
  hasPlacedStop,
  type GlobeInvitation,
} from '@/features/globe/globe-data';
import { useGlobe, type GlobeData } from '@/features/globe/use-globe';
import { todayIso } from '@/features/trips/stop-dates';

export default function HomeScreen() {
  // One calendar day for the whole screen: the statuses and the beacon's
  // resting stop must agree, even across midnight.
  const today = todayIso();
  const { data, loading, error } = useGlobe(today);

  if (loading && !error) {
    return (
      <HomeMessage>
        <LoadingState title="Loading your globe" />
      </HomeMessage>
    );
  }
  return <HomeGlobe data={data} today={today} failed={error !== null} />;
}

/** The home: the globe, full-bleed, with one card above it. */
function HomeGlobe({
  data,
  today,
  failed,
}: {
  data: GlobeData;
  today: string;
  failed: boolean;
}) {
  const drawn = data.trips.some(hasPlacedStop);
  return (
    <ThemedView type="canvas" style={styles.fill} testID="home-screen">
      <GlobeView
        trips={data.trips}
        focus={data.focus}
        today={today}
        accessibilityLabel={describeGlobe(data, drawn)}
      />
      <SafeAreaView edges={['top']} style={styles.overlay}>
        <HomeCard data={data} failed={failed} />
      </SafeAreaView>
    </ThemedView>
  );
}

function HomeCard({ data, failed }: { data: GlobeData; failed: boolean }) {
  const router = useRouter();
  if (failed) {
    return (
      <GlobeNotice
        title="Couldn’t read your trips"
        detail="The local store did not answer. Restarting the app usually clears this."
      />
    );
  }
  const invitation = globeInvitation(data.trips);
  if (!invitation) return <StatsOverlay summary={data.summary} />;

  return (
    <GlobeEmptyState
      reason={invitation.reason}
      tripTitle={invitation.reason === 'no-stops' ? invitation.tripTitle : undefined}
      onAction={invitationAction(router, invitation)}
    />
  );
}

/** Where the card's one action goes (feature 003 FR-002). */
function invitationAction(
  router: ReturnType<typeof useRouter>,
  invitation: GlobeInvitation,
): () => void {
  if (invitation.reason === 'no-trips') return () => router.push('/modal/add-trip');
  const { tripId } = invitation;
  return tripId ? () => router.push(`/trip/${tripId}`) : () => router.navigate('/trips');
}

function HomeMessage({ children }: PropsWithChildren) {
  return (
    <Screen testID="home-screen" edges={['top']} style={styles.message}>
      <View>{children}</View>
    </Screen>
  );
}

function describeGlobe({ trips, summary }: GlobeData, drawn: boolean): string {
  if (!drawn) {
    return 'Globe with nothing drawn yet. Your trips are listed in the Trips tab.';
  }
  const tripCount = trips.length === 1 ? '1 trip' : `${trips.length} trips`;
  const places =
    summary.countriesVisited === 1
      ? '1 country'
      : `${summary.countriesVisited} countries`;
  return `Globe showing ${tripCount} across ${places}. Every trip is also listed in the Trips tab.`;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  message: {
    justifyContent: 'center',
  },
  // Lets touches through to the map everywhere except on the card itself.
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
