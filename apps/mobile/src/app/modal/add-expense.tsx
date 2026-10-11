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
 * closes the sheet.
 *
 * A form sheet since feature 004 (T436; FR-009; research D4-06): the route is presented
 * by the root as a `formSheet` as tall as its contents (`formSheetOptions`), and the body
 * is the shared `FormSheet` (the pattern of add-trip, T434): the title, a scrolling,
 * keyboard-aware body, and a sticky footer (Cancel, Save) that stays above the keyboard.
 * The body is an amount `Field` (a decimal STRING, never a number: SC-016; the
 * placeholder follows the device's decimal separator), the currency and category pickers,
 * the day (`DateField`), the city as ONE sideways chip row, and an optional note `Field`,
 * every refusal in words under its field. The ids and names are unchanged:
 * `add-expense-screen`, `add-expense-amount`, `currency-<CODE>`, `category-<id>`,
 * `add-expense-date`, `add-expense-city-<id|none>`, `add-expense-note`,
 * `add-expense-error`, `add-expense-cancel`, `add-expense-save`.
 *
 * With no form to show (the trip is being read, could not be read, or is not on this
 * device) the same root id carries a designed state and a "Close" action
 * (`add-expense-close`), because a sheet with only a state would have no explicit way out.
 */
import {
  SYSTEM_EXPENSE_CATEGORIES,
  type CreateExpenseRequest,
} from '@triptrackr/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Controller,
  useForm,
  useWatch,
  type Control,
  type UseFormSetValue,
} from 'react-hook-form';
import { View } from 'react-native';

import { CategoryPicker } from '@/components/trip/category-picker';
import { CurrencyPicker } from '@/components/trip/currency-picker';
import { DateField } from '@/components/trip/date-field';
import { describePlace } from '@/components/trip/stop-row';
import { Button } from '@/components/ui/button';
import { ChipGroup, type ChipOption } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { FormSheet } from '@/components/ui/form-sheet';
import { InlineError } from '@/components/ui/inline-error';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
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
import { useHaptics } from '@/hooks/use-haptics';
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

type ExpenseControl = Control<ExpenseFormValues, unknown, CreateExpenseRequest>;

const NO_CITY = 'none';

function cityKey(cityId: number | null): string {
  return cityId === null ? NO_CITY : String(cityId);
}

function cityIdOf(key: string): number | null {
  return key === NO_CITY ? null : Number(key);
}

function initialValues(
  homeCurrency: string,
  stops: readonly StopWithPlace[],
  today: string,
): ExpenseFormValues {
  return {
    amount: '',
    currency: homeCurrency,
    category_id: SYSTEM_EXPENSE_CATEGORIES[0].id,
    spent_at: today,
    city_id: stopOn(stops, today)?.city_id ?? null,
    note: '',
  };
}

function useAddExpenseForm({ tripId, homeCurrency, stops, onDone }: FormProps) {
  const actions = useExpenseActions();
  const haptics = useHaptics();
  const [saveError, setSaveError] = useState<string | null>(null);
  const today = useMemo(() => todayIso(), []);

  const { control, handleSubmit, setValue } = useForm<
    ExpenseFormValues,
    unknown,
    CreateExpenseRequest
  >({
    resolver: expenseFormResolver,
    defaultValues: initialValues(homeCurrency, stops, today),
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
      haptics.success();
      onDone();
    } catch (error) {
      Sentry.captureException(error);
      setSaveError(EXPENSE_FORM_COPY.saveFailed);
    }
  });

  const createCategory = (name: string) => actions.createCategory({ name }).id;

  return { control, setValue, cityId, save, saveError, createCategory };
}

function AmountField({ control }: { control: ExpenseControl }) {
  const { decimalSeparator } = deviceLocale();
  return (
    <Controller
      control={control}
      name="amount"
      render={({ field, fieldState }) => (
        <Field
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
  );
}

function CurrencyField({ control }: { control: ExpenseControl }) {
  return (
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
  );
}

type CategoryFieldProps = {
  control: ExpenseControl;
  onCreate: (name: string) => string;
};

function CategoryField({ control, onCreate }: CategoryFieldProps) {
  const categories = useExpenseCategories();
  return (
    <Controller
      control={control}
      name="category_id"
      render={({ field, fieldState }) => (
        <CategoryPicker
          options={categories.data}
          value={field.value}
          onChange={field.onChange}
          onCreate={onCreate}
          error={fieldMessage(fieldState.error, EXPENSE_FIELD_COPY.category_id)}
        />
      )}
    />
  );
}

type PaidOnFieldProps = {
  control: ExpenseControl;
  stops: readonly StopWithPlace[];
  setValue: UseFormSetValue<ExpenseFormValues>;
};

function PaidOnField({ control, stops, setValue }: PaidOnFieldProps) {
  return (
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
  );
}

type CityFieldProps = {
  stops: readonly StopWithPlace[];
  cityId: number | null;
  onSelect: (cityId: number | null) => void;
};

/** "No city", then each city the trip visits, once, in the order first visited. */
function cityOptions(stops: readonly StopWithPlace[]): ChipOption[] {
  const visited = stops.filter(
    (stop, index) => stops.findIndex((other) => other.city_id === stop.city_id) === index,
  );
  return [{ id: null as number | null, label: 'No city' }]
    .concat(visited.map((stop) => ({ id: stop.city_id, label: describePlace(stop) })))
    .map((option) => ({
      key: cityKey(option.id),
      label: option.label,
      testID: `add-expense-city-${cityKey(option.id)}`,
      accessibilityLabel: option.label,
    }));
}

/** One sideways chip row, like the currency and the category: a long trip never grows the form. */
function CityField({ stops, cityId, onSelect }: CityFieldProps) {
  if (stops.length === 0) return null;

  return (
    <View className="gap-2">
      <Text type="callout">City</Text>
      <ChipGroup
        scroll
        accessibilityLabel="City"
        options={cityOptions(stops)}
        selectedKey={cityKey(cityId)}
        onSelect={(key) => onSelect(cityIdOf(key))}
      />
    </View>
  );
}

function NoteField({ control }: { control: ExpenseControl }) {
  return (
    <Controller
      control={control}
      name="note"
      render={({ field, fieldState }) => (
        <Field
          testID="add-expense-note"
          label="Note (optional)"
          value={field.value}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          placeholder="Lunch by the lake"
          returnKeyType="done"
          maxLength={500}
          error={fieldMessage(fieldState.error, EXPENSE_FIELD_COPY.note)}
        />
      )}
    />
  );
}

function AddExpenseForm(props: FormProps) {
  const { control, setValue, cityId, save, saveError, createCategory } =
    useAddExpenseForm(props);

  return (
    <FormSheet
      testID="add-expense-screen"
      title="New expense"
      actions={{
        testIDPrefix: 'add-expense',
        saveLabel: 'Save expense',
        onCancel: props.onDone,
        onSave: () => void save(),
      }}>
      <AmountField control={control} />

      <CurrencyField control={control} />

      <CategoryField control={control} onCreate={createCategory} />

      <PaidOnField control={control} stops={props.stops} setValue={setValue} />

      <CityField
        stops={props.stops}
        cityId={cityId}
        onSelect={(id) => setValue('city_id', id)}
      />

      <NoteField control={control} />

      <InlineError testID="add-expense-error" message={saveError} />
    </FormSheet>
  );
}

type PlaceholderProps = {
  loading: boolean;
  failed: boolean;
};

/**
 * What stands in for the trip until there is one: unreadable, being read, or not here.
 * The error comes first: a live read that fails can still report `loading` (its first
 * result never arrives), and the words must win over the spinner.
 */
function PlaceholderState({ loading, failed }: PlaceholderProps) {
  if (failed) {
    return (
      <ErrorState
        title="Couldn’t read this trip"
        detail="The local store did not answer."
      />
    );
  }
  if (loading) return <LoadingState title="Loading trip" />;
  return (
    <EmptyState
      title="This trip isn’t on this device"
      detail="It may have been removed, or it has not synced here yet."
    />
  );
}

/**
 * The sheet when there is no form: the same root id, so a flow that waits on it finds
 * either, and a secondary "Close", because a sheet that is only a state has no explicit way
 * out (FR-009) and no primary action to offer (FR-005).
 */
function SheetPlaceholder({
  onClose,
  ...state
}: PlaceholderProps & { onClose: () => void }) {
  return (
    <View testID="add-expense-screen" className="gap-4 bg-background p-6">
      <PlaceholderState {...state} />
      <Button
        testID="add-expense-close"
        variant="secondary"
        accessibilityLabel="Close"
        onPress={onClose}>
        Close
      </Button>
    </View>
  );
}

export default function AddExpenseScreen() {
  const router = useRouter();
  const { tripId: rawTripId } = useLocalSearchParams<{ tripId: string | string[] }>();
  const tripId = firstParam(rawTripId) ?? '';
  const trip = useTrip(tripId);
  const stops = useTripStops(tripId);
  const close = () => router.back();

  if (trip.data) {
    return (
      <AddExpenseForm
        tripId={tripId}
        homeCurrency={trip.data.home_currency}
        stops={stops.data}
        onDone={close}
      />
    );
  }
  return (
    <SheetPlaceholder
      loading={trip.loading}
      failed={trip.error !== null}
      onClose={close}
    />
  );
}
