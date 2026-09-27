/**
 * Add expense — tasks.md T086 (FR-020, FR-021, FR-023, FR-024; Constitution II);
 * research D-21, D-24, D-26, D-27, D-29.
 *
 * A `react-hook-form` whose resolver pipes the form into the wire's
 * `CreateExpenseRequest` (expense-form.ts): the amount as typed is read with
 * `parseAmount` whatever the traveller's keypad produces, the currency
 * defaults to the trip's home currency, the category to Food, the day to
 * today, and the city to the stop whose dates contain that day. "Save"
 * writes to the encrypted local store FIRST — converting from the cached FX
 * snapshot when it can and marking the row pending when it cannot — and then
 * closes the sheet. The whole form sits under a `KeyboardAwareScrollView`.
 */
import {
  SYSTEM_EXPENSE_CATEGORIES,
  type CreateExpenseRequest,
} from '@triptrackr/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CategoryPicker } from '@/components/trip/category-picker';
import { CurrencyPicker } from '@/components/trip/currency-picker';
import { DateField } from '@/components/trip/date-field';
import { describePlace } from '@/components/trip/stop-row';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { EmptyState } from '@/components/ui/state-view';
import { TextField } from '@/components/ui/text-field';
import { Colors, Spacing } from '@/constants/theme';
import type { StopWithPlace } from '@/db/repositories/stops';
import {
  EXPENSE_FIELD_COPY,
  EXPENSE_FORM_COPY,
  expenseFormResolver,
  type ExpenseFormValues,
} from '@/features/expenses/expense-form';
import {
  useExpenseActions,
  useExpenseCategories,
} from '@/features/expenses/use-expenses';
import { todayIso } from '@/features/trips/stop-dates';
import { useTrip, useTripStops } from '@/features/trips/use-trips';
import { useAppearance } from '@/hooks/use-appearance';
import { fieldMessage } from '@/lib/form-copy';
import { deviceLocale } from '@/lib/locale';
import { Sentry } from '@/lib/sentry';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The stop the traveller is at on `day`, if any — the default city for the expense. */
export function stopOn(
  stops: readonly StopWithPlace[],
  day: string,
): StopWithPlace | null {
  return stops.find((stop) => stop.arrive_date <= day && day <= stop.depart_date) ?? null;
}

type FormProps = {
  tripId: string;
  homeCurrency: string;
  stops: readonly StopWithPlace[];
  onDone: () => void;
};

function AddExpenseForm({ tripId, homeCurrency, stops, onDone }: FormProps) {
  const { theme } = useAppearance();
  const categories = useExpenseCategories();
  const actions = useExpenseActions();
  const [saveError, setSaveError] = useState<string | null>(null);
  const today = useMemo(() => todayIso(), []);
  const { decimalSeparator } = deviceLocale();

  const { control, handleSubmit, setValue } = useForm<
    ExpenseFormValues,
    unknown,
    CreateExpenseRequest
  >({
    resolver: expenseFormResolver,
    defaultValues: {
      amount: '',
      currency: homeCurrency,
      category_id: SYSTEM_EXPENSE_CATEGORIES[0].id,
      spent_at: today,
      city_id: stopOn(stops, today)?.city_id ?? null,
      note: '',
    },
  });
  const cityId = useWatch({ control, name: 'city_id' });

  // `values` are the resolver's parsed output — a DecimalString amount, an
  // upper-cased code, a trimmed-or-null note — exactly what the server accepts.
  const save = handleSubmit((values) => {
    try {
      actions.createExpense({
        trip_id: tripId,
        home_currency: homeCurrency,
        city_id: values.city_id,
        category_id: values.category_id,
        amount: values.amount,
        currency: values.currency,
        spent_at: values.spent_at,
        note: values.note,
      });
      onDone();
    } catch (error) {
      Sentry.captureException(error);
      setSaveError(EXPENSE_FORM_COPY.saveFailed);
    }
  });

  return (
    <View style={styles.form}>
      <ThemedText type="subtitle">New expense</ThemedText>

      <Controller
        control={control}
        name="amount"
        render={({ field, fieldState }) => (
          <TextField
            testID="add-expense-amount"
            label="Amount"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            placeholder={`12${decimalSeparator}50`}
            keyboardType="decimal-pad"
            autoFocus
            error={fieldMessage(fieldState.error, EXPENSE_FIELD_COPY.amount)}
          />
        )}
      />

      <Controller
        control={control}
        name="currency"
        render={({ field, fieldState }) => (
          <CurrencyPicker
            value={field.value}
            onChange={field.onChange}
            error={fieldMessage(fieldState.error, EXPENSE_FIELD_COPY.currency)}
          />
        )}
      />

      <Controller
        control={control}
        name="category_id"
        render={({ field, fieldState }) => (
          <CategoryPicker
            options={categories.data}
            value={field.value}
            onChange={field.onChange}
            onCreate={(name) => actions.createCategory({ name }).id}
            error={fieldMessage(fieldState.error, EXPENSE_FIELD_COPY.category_id)}
          />
        )}
      />

      <Controller
        control={control}
        name="spent_at"
        render={({ field, fieldState }) => (
          <DateField
            testID="add-expense-date"
            label="Paid on"
            value={field.value}
            onChange={(iso) => {
              field.onChange(iso);
              const stop = stopOn(stops, iso);
              if (stop) setValue('city_id', stop.city_id);
            }}
            error={fieldMessage(fieldState.error, EXPENSE_FIELD_COPY.spent_at)}
          />
        )}
      />

      {stops.length > 0 ? (
        <View style={styles.cities}>
          <ThemedText type="small">City</ThemedText>
          <View style={styles.pills} accessibilityRole="radiogroup">
            {[{ id: null as number | null, label: 'No city' }]
              .concat(
                stops.map((stop) => ({ id: stop.city_id, label: describePlace(stop) })),
              )
              .map((option) => {
                const selected = option.id === cityId;
                return (
                  <PressableSurface
                    key={option.id ?? 'none'}
                    testID={`add-expense-city-${option.id ?? 'none'}`}
                    accessibilityLabel={option.label}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, checked: selected }}
                    treatment={selected ? 'recessed' : 'raised'}
                    radius="pill"
                    onPress={() => setValue('city_id', option.id)}
                    style={styles.pill}>
                    <ThemedText type={selected ? 'smallBold' : 'small'}>
                      {option.label}
                    </ThemedText>
                  </PressableSurface>
                );
              })}
          </View>
        </View>
      ) : null}

      <Controller
        control={control}
        name="note"
        render={({ field, fieldState }) => (
          <TextField
            testID="add-expense-note"
            label="Note (optional)"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            placeholder="Lunch by the lake"
            maxLength={500}
            error={fieldMessage(fieldState.error, EXPENSE_FIELD_COPY.note)}
          />
        )}
      />

      {saveError ? (
        <ThemedText
          testID="add-expense-error"
          type="small"
          accessibilityRole="alert"
          style={{ color: Colors[theme].danger }}>
          {saveError}
        </ThemedText>
      ) : null}

      <View style={styles.actions}>
        <PressableSurface
          testID="add-expense-cancel"
          accessibilityLabel="Cancel"
          treatment="flat"
          onPress={onDone}
          style={styles.action}>
          <ThemedText type="smallBold" style={styles.centred}>
            Cancel
          </ThemedText>
        </PressableSurface>
        <PressableSurface
          testID="add-expense-save"
          accessibilityLabel="Save expense"
          depth={2}
          onPress={() => void save()}
          style={styles.action}>
          <ThemedText type="smallBold" style={styles.centred}>
            Save expense
          </ThemedText>
        </PressableSurface>
      </View>
    </View>
  );
}

export default function AddExpenseScreen() {
  const router = useRouter();
  const { tripId: rawTripId } = useLocalSearchParams<{ tripId: string | string[] }>();
  const tripId = firstParam(rawTripId) ?? '';
  const trip = useTrip(tripId);
  const stops = useTripStops(tripId);

  return (
    <ThemedView type="canvas" style={styles.sheet} testID="add-expense-screen">
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        bottomOffset={Spacing.four}>
        <SafeAreaView edges={['bottom']}>
          {trip.data ? (
            <AddExpenseForm
              tripId={tripId}
              homeCurrency={trip.data.home_currency}
              stops={stops.data}
              onDone={() => router.back()}
            />
          ) : trip.loading ? null : (
            <EmptyState
              title="This trip isn’t on this device"
              detail="It may have been removed, or it has not synced here yet."
            />
          )}
        </SafeAreaView>
      </KeyboardAwareScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  scroll: { flexGrow: 1, padding: Spacing.four },
  form: { gap: Spacing.three },
  cities: { gap: Spacing.two },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  pill: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  actions: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.two },
  action: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  centred: { textAlign: 'center' },
});
