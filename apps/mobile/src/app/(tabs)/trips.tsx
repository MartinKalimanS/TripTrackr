/**
 * Trips — list placeholder (R009). The list itself lands with US1 (T066).
 *
 * Offers the same primary action as the globe so that a traveller who opens
 * the app on this tab is never one screen away from being able to start.
 */
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Screen } from '@/components/ui/screen';
import { EmptyState } from '@/components/ui/state-view';
import { Spacing } from '@/constants/theme';

export default function TripsScreen() {
  const router = useRouter();

  return (
    <Screen testID="trips-screen" edges={['top']}>
      <ThemedText type="subtitle">Trips</ThemedText>
      <View style={styles.body}>
        <EmptyState
          title="No trips yet"
          detail="Every trip you plan or take will be listed here."
        />
        <PressableSurface
          testID="trips-plan-trip"
          accessibilityLabel="Plan a trip"
          depth={2}
          onPress={() => router.push('/modal/add-trip')}
          style={styles.action}>
          <ThemedText type="smallBold" style={styles.centred}>
            Plan a trip
          </ThemedText>
        </PressableSurface>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: Spacing.four,
    marginTop: Spacing.three,
  },
  action: {
    alignSelf: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
  },
  centred: {
    textAlign: 'center',
  },
});
