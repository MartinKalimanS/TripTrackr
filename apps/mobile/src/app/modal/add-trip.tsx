/**
 * Add trip — tasks.md T066 (FR-009; Constitution II); research D-21, D-24.
 *
 * Title and home currency (defaulting to the traveller's own), validated by
 * `react-hook-form` running the contracts' `CreateTripRequest` through
 * `zodResolver`, so the local row is one the server will accept unchanged at
 * sync time. "Save" writes to the encrypted local store FIRST — no network —
 * and then replaces this sheet with the new trip so the traveller can add
 * stops straight away (Acceptance Scenario 1.3).
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CurrencyPicker } from '@/components/trip/currency-picker';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Colors, Spacing } from '@/constants/theme';
import { useSessionStore } from '@/features/auth/session-store';
import {
  TRIP_FIELD_COPY,
  TRIP_FORM_COPY,
  tripFormResolver,
  type TripFormValues,
} from '@/features/trips/trip-form';
import { useTripActions } from '@/features/trips/use-trips';
import { useAppearance } from '@/hooks/use-appearance';
import { fieldMessage } from '@/lib/form-copy';
import { Sentry } from '@/lib/sentry';

export default function AddTripScreen() {
  const router = useRouter();
  const { theme } = useAppearance();
  const homeCurrency = useSessionStore((session) => session.user?.home_currency ?? 'USD');
  const { createTrip } = useTripActions();
  const [saveError, setSaveError] = useState<string | null>(null);

  const { control, handleSubmit } = useForm<TripFormValues>({
    resolver: tripFormResolver,
    defaultValues: { title: '', home_currency: homeCurrency },
  });

  // `values` are the resolver's parsed output — the title already trimmed by
  // the schema — so what is written is exactly what the server would accept.
  const save = handleSubmit((values) => {
    try {
      const trip = createTrip(values);
      router.replace(`/trip/${trip.id}`);
    } catch (error) {
      // A local write failing is a defect worth knowing about (FR-073) AND a
      // message the traveller must see — never a silent no-op.
      Sentry.captureException(error);
      setSaveError(TRIP_FORM_COPY.saveFailed);
    }
  });

  return (
    // No top inset: the sheet's own chrome already clears the status bar.
    <Screen testID="add-trip-screen" edges={['bottom']}>
      <ThemedText type="subtitle">New trip</ThemedText>

      <Controller
        control={control}
        name="title"
        render={({ field, fieldState }) => (
          <TextField
            testID="add-trip-title"
            label="Trip name"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            placeholder="Italy, spring 2026"
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            maxLength={200}
            error={fieldMessage(fieldState.error, TRIP_FIELD_COPY.title)}
          />
        )}
      />

      <Controller
        control={control}
        name="home_currency"
        render={({ field, fieldState }) => (
          <CurrencyPicker
            value={field.value}
            onChange={field.onChange}
            error={fieldMessage(fieldState.error, TRIP_FIELD_COPY.home_currency)}
          />
        )}
      />

      {saveError ? (
        <ThemedText
          testID="add-trip-error"
          type="small"
          accessibilityRole="alert"
          style={{ color: Colors[theme].danger }}>
          {saveError}
        </ThemedText>
      ) : null}

      <View style={styles.actions}>
        <PressableSurface
          testID="add-trip-cancel"
          accessibilityLabel="Cancel"
          treatment="flat"
          onPress={() => router.back()}
          style={styles.action}>
          <ThemedText type="smallBold" style={styles.centred}>
            Cancel
          </ThemedText>
        </PressableSurface>
        <PressableSurface
          testID="add-trip-save"
          accessibilityLabel="Save trip"
          depth={2}
          onPress={() => void save()}
          style={styles.action}>
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
