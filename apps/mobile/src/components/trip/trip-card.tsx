/**
 * One row of the trip list — tasks.md T066.
 *
 * Title, derived status (text + icon, FR-010/FR-013), stop count, and the
 * pending-sync marker whenever the row has local changes the server has not
 * confirmed (`is_dirty`; Constitution II, feature 002 contract C11).
 */
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { StatusPill } from '@/components/trip/status-pill';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { SyncBadge } from '@/components/ui/sync-badge';
import { Spacing } from '@/constants/theme';
import type { TripSummary } from '@/features/trips/use-trips';

export type TripCardProps = {
  summary: TripSummary;
  onPress: () => void;
};

export function describeStopCount(count: number): string {
  if (count === 0) return 'No stops yet';
  return count === 1 ? '1 stop' : `${count} stops`;
}

export function TripCard({ summary, onPress }: TripCardProps) {
  const { trip, stopCount, status } = summary;
  const stops = describeStopCount(stopCount);

  return (
    <PressableSurface
      testID={`trip-card-${trip.id}`}
      accessibilityLabel={`${trip.title}, ${status}, ${stops}`}
      accessibilityHint="Opens the trip"
      depth={1}
      radius="lg"
      onPress={onPress}
      style={styles.card}>
      <View style={styles.titleRow}>
        <ThemedText type="default" style={styles.title} numberOfLines={2}>
          {trip.title}
        </ThemedText>
        <StatusPill status={status} />
      </View>
      <View style={styles.metaRow}>
        <ThemedText type="small" themeColor="textMuted">
          {stops} · {trip.home_currency}
        </ThemedText>
        {trip.is_dirty ? <SyncBadge state="pending" /> : null}
      </View>
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'stretch',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  title: {
    flex: 1,
    fontWeight: 600,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
});
