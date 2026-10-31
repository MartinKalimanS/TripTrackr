/**
 * Add trip — tasks.md T066 (FR-009; Constitution II); research D-21, D-24.
 *
 * Title and home currency (defaulting to the traveller's own), validated by
 * `react-hook-form` running the contracts' `CreateTripRequest` through
 * `zodResolver`, so the local row is one the server will accept unchanged at
 * sync time. "Save" writes to the encrypted local store FIRST — no network —
 * and then replaces this sheet with the new trip so the traveller can add
 * stops straight away (Acceptance Scenario 1.3).
 *
 * A form sheet since feature 004 (T434; FR-009; research D4-06): the route is presented
 * by the root as a `formSheet` as tall as its contents (`formSheetOptions`), and the body
 * is the shared `FormSheet`: the title, a scrolling body of a label-on-top `Field`
 * (refusals in words) and the home currency as ONE sideways chip row ending in "Other",
 * and a sticky footer (Cancel, Save) that stays above the keyboard. The ids and names are
 * unchanged: `add-trip-screen`, `add-trip-title`, `currency-<CODE>`, `currency-other`,
 * `add-trip-error`, `add-trip-cancel`, `add-trip-save`.
 *
 * As pictured (feature 005, F6; `core/form.png`; owner decision Q-11): Cancel at the left of the
 * header and Save alone in the footer (a hairline above it), 24 dp between the groups, and the
 * pictured "Where to?", "Cover" and "Dates" rows drawn as COMING-SOON controls
 * (`pictured-rows.tsx`: one toast, nothing stored, no invented data: the app keeps the name and
 * the home currency, and a trip's dates come from its stops). "Expenses are only visible to you."
 * sits under the currency row with a lock. The app's words stay ("Home currency", "Save trip").
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm, type Control } from 'react-hook-form';
import { View } from 'react-native';

import { CurrencyPicker } from '@/components/trip/currency-picker';
import {
  PicturedCover,
  PicturedDates,
  PicturedDestination,
} from '@/components/trip/pictured-rows';
import { Field } from '@/components/ui/field';
import { FormSheet } from '@/components/ui/form-sheet';
import { Icon } from '@/components/ui/icon';
import { InlineError } from '@/components/ui/inline-error';
import { Text } from '@/components/ui/text';
import { useSessionStore } from '@/features/auth/session-store';
import {
  TRIP_FIELD_COPY,
  TRIP_FORM_COPY,
  tripFormResolver,
  type TripFormValues,
} from '@/features/trips/trip-form';
import { useTripActions } from '@/features/trips/use-trips';
import { useHaptics } from '@/hooks/use-haptics';
import { fieldMessage } from '@/lib/form-copy';
import { Sentry } from '@/lib/sentry';
import { Space } from '@/theme';

type TripControl = Control<TripFormValues>;

const PRIVACY_LINE = 'Expenses are only visible to you.';

function useAddTripForm() {
  const router = useRouter();
  const homeCurrency = useSessionStore((session) => session.user?.home_currency ?? 'USD');
  const { createTrip } = useTripActions();
  const haptics = useHaptics();
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
      haptics.success();
      router.replace(`/trip/${trip.id}`);
    } catch (error) {
      // A local write failing is a defect worth knowing about (FR-073) AND a
      // message the traveller must see — never a silent no-op.
      Sentry.captureException(error);
      setSaveError(TRIP_FORM_COPY.saveFailed);
    }
  });

  return { control, save, saveError, cancel: () => router.back() };
}

type TitleFieldProps = { control: TripControl; onSubmitEditing: () => void };

function TitleField({ control, onSubmitEditing }: TitleFieldProps) {
  return (
    <Controller
      control={control}
      name="title"
      render={({ field, fieldState }) => (
        <Field
          testID="add-trip-title"
          label="Trip name"
          value={field.value}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          placeholder="Italy, spring 2026"
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={onSubmitEditing}
          maxLength={200}
          error={fieldMessage(fieldState.error, TRIP_FIELD_COPY.title)}
        />
      )}
    />
  );
}

/** The privacy line under the currency row: a lock and the sentence, as pictured. */
function PrivacyHelper() {
  return (
    <View testID="add-trip-privacy" className="flex-row items-center gap-2">
      <Icon name="lock" size={16} tone="aquaInk" />
      <Text variant="caption" tone="muted" className="flex-1">
        {PRIVACY_LINE}
      </Text>
    </View>
  );
}

function HomeCurrencyField({ control }: { control: TripControl }) {
  return (
    <View className="gap-2">
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
      <PrivacyHelper />
    </View>
  );
}

export default function AddTripScreen() {
  const { control, save, saveError, cancel } = useAddTripForm();

  return (
    <FormSheet
      testID="add-trip-screen"
      title="New trip"
      gap={Space[6]}
      footerRule
      actions={{
        testIDPrefix: 'add-trip',
        saveLabel: 'Save trip',
        onCancel: cancel,
        onSave: () => void save(),
      }}>
      <TitleField control={control} onSubmitEditing={() => void save()} />

      <PicturedDestination />

      <PicturedCover />

      <PicturedDates />

      <HomeCurrencyField control={control} />

      <InlineError testID="add-trip-error" message={saveError} />
    </FormSheet>
  );
}
