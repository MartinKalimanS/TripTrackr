/**
 * Home — the globe (R009 placeholder).
 *
 * The Mapbox globe arrives in US3 (T093) as `src/components/globe/globe-view.tsx`;
 * this screen deliberately does NOT mount the map yet. Until then the tab
 * shows the designed empty state FR-027 requires and the one action a new
 * traveller needs.
 */
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Screen } from '@/components/ui/screen';
import { EmptyState } from '@/components/ui/state-view';
import { Spacing } from '@/constants/theme';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <Screen testID="home-screen" edges={['top']} style={styles.content}>
      <View style={styles.body}>
        <EmptyState
          title="Your globe is waiting for its first trip"
          detail="Add where you are going and the arcs draw themselves."
        />
        <PressableSurface
          testID="home-plan-trip"
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
  content: {
    justifyContent: 'center',
  },
  body: {
    gap: Spacing.four,
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
