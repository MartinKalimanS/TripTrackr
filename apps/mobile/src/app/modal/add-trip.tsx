/**
 * Add trip — placeholder form (R009). US1 (T066, T067) turns this into the
 * real form with the country-filtered city picker and the local-first write.
 *
 * TODO(US1 T066): enable "Save trip", write the trip to the local database
 * first (Principle II), then dismiss with `router.back()`.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';

export default function AddTripScreen() {
  const router = useRouter();
  const [name, setName] = useState('');

  return (
    // No top inset: the sheet's own chrome already clears the status bar.
    <Screen testID="add-trip-screen" edges={['bottom']}>
      <ThemedText type="subtitle">New trip</ThemedText>

      <TextField
        label="Trip name"
        value={name}
        onChangeText={setName}
        placeholder="Porto in May"
        autoCapitalize="words"
        returnKeyType="done"
      />

      <View style={styles.actions}>
        <PressableSurface
          accessibilityLabel="Cancel"
          treatment="flat"
          onPress={() => router.back()}
          style={styles.action}>
          <ThemedText type="smallBold" style={styles.centred}>
            Cancel
          </ThemedText>
        </PressableSurface>
        <PressableSurface accessibilityLabel="Save trip" disabled style={styles.action}>
          <ThemedText type="smallBold" style={styles.centred}>
            Save trip
          </ThemedText>
        </PressableSurface>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  action: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  centred: {
    textAlign: 'center',
  },
});
