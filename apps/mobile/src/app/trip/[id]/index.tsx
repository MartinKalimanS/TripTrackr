/**
 * Trip overview — placeholder (R009). The real detail screen and stops editor
 * land with US1 (T068).
 *
 * The params flow is the one thing worth getting right now: every sub-screen
 * of the trip stack will read `id` the same way, so this is the pattern they
 * copy. `useLocalSearchParams` is the v57 hook for a screen's own params
 * (https://docs.expo.dev/router/reference/url-parameters.md).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Screen } from '@/components/ui/screen';
import { LoadingState } from '@/components/ui/state-view';
import { Spacing } from '@/constants/theme';

/**
 * A dynamic segment can arrive as an array when the same key appears twice in
 * a URL. A trip has one id, so the first wins rather than the screen crashing
 * on `.length`.
 */
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function TripScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const tripId = firstParam(id) ?? 'unknown';

  return (
    <Screen testID="trip-screen">
      <View style={styles.header}>
        <PressableSurface
          accessibilityLabel="Back"
          treatment="flat"
          onPress={() => router.back()}
          style={styles.back}>
          <ThemedText type="smallBold">Back</ThemedText>
        </PressableSurface>
        <ThemedText type="subtitle">Trip</ThemedText>
      </View>

      {/* TODO(US1 T068): replace with the trip query; the loading state stays
          as its pending presentation (FR-027). */}
      <LoadingState title={`Loading trip ${tripId}`} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.three,
    marginBottom: Spacing.two,
  },
  back: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
