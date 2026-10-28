/**
 * A trip's expenses and spending summary - tasks.md T086, T087, 004 T441, restyled by 005 T550
 * (FR-020 to FR-026, FR-044, FR-047, FR-054; 004 FR-007, FR-008, FR-014, FR-015, FR-021, FR-035;
 * Constitution II; research D-23, D-26, D5-15; pictures `more/expenses*.png`).
 *
 * Read from and written to the encrypted local store; the list and the summary are live queries,
 * so logging an expense in aeroplane mode changes the totals at once. The list is a `FlashList`
 * through `ListScreen` (D-23). The summary is derived in memory from the same rows with exact
 * decimal arithmetic (SC-016, `features/expenses/spending-summary.ts`); "Add expense" opens the
 * modal sheet.
 *
 * The screen draws its own header, as the pictures do (the navigator's is hidden for this route:
 * `trip/[id]/_layout.tsx`): the shared `AreaHeader` (`expenses-header.tsx`: Back, "Spending", the
 * trip and the count, "Only you", more), fixed above the list. What scrolls is the picture's page:
 * "Spent so far" with the big amount and the pill, the rate line, the "Per day" bars, the category
 * bar and legend (`spending-summary.tsx`, folded away by the Summary toggle), then the expenses
 * grouped by the day they were spent (FR-014): a `FlashList` item is one day (`ExpenseDayGroup`).
 * "Add expense" is the floating `AreaFab` (`expenses-add`), visible in every state, so the first
 * expense is one tap away; the empty state's own button is the secondary one.
 *
 * Every state is designed (C4-10 rule 2): a skeleton shaped like the page while the first read is
 * pending (never the empty state), an error in words, and an empty state that names the next
 * action and offers it. The error is checked before `loading`: a live read that fails can still
 * report `loading` and the words must win over the placeholder. There is no retry: a live query
 * has nothing to re-run (the same recorded gap as Trips). With nothing logged the page is the
 * empty state alone: a total of nothing and empty bars would say nothing.
 *
 * Visibility posture: expenses have no visibility flag and no public read; the "Only you" chip
 * says so and nothing here offers to change it.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { ExpenseDayGroup } from '@/components/trip/expense-day-group';
import { ExpensesHeader } from '@/components/trip/expenses-header';
import { SpendingSkeleton } from '@/components/trip/spending-skeleton';
import { SpendingSummary } from '@/components/trip/spending-summary';
import { AreaFab, areaFabClearance } from '@/components/ui/area-fab';
import { areaMargin } from '@/components/ui/area-header';
import type { IconName } from '@/components/ui/icon';
import { ListScreen } from '@/components/ui/list-screen';
import { EmptyState, ErrorState } from '@/components/ui/state-view';
import type { ExpenseRow as ExpenseRecord } from '@/db/schema';
import { EXPENSE_FORM_COPY } from '@/features/expenses/expense-form';
import { groupExpensesByDay, type ExpenseDay } from '@/features/expenses/group-by-day';
import { deriveSpendingView } from '@/features/expenses/spending-summary';
import {
  useExpenseActions,
  useExpenseCategories,
  useExpenses,
  useFxSnapshotInfo,
  useSpendingSummary,
} from '@/features/expenses/use-expenses';
import { useFxRates } from '@/features/expenses/use-fx-rates';
import { todayIso } from '@/features/trips/stop-dates';
import { tripDateRange } from '@/features/trips/trip-status';
import { useTrip, useTripStops, type LiveResult } from '@/features/trips/use-trips';
import { useAppearance } from '@/hooks/use-appearance';
import { useFontScale } from '@/hooks/use-font-scale';
import { useWriteAttempt } from '@/hooks/use-write-attempt';
import { Space } from '@/theme';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function useTripSpending(tripId: string) {
  const trip = useTrip(tripId);
  const stops = useTripStops(tripId);
  const homeCurrency = trip.data?.home_currency ?? 'USD';
  const expenses = useExpenses(tripId);
  const categories = useExpenseCategories();
  const summary = useSpendingSummary(expenses, homeCurrency);
  const snapshot = useFxSnapshotInfo();

  // Keeps the cached snapshot fresh while the screen is open; never blocks it.
  useFxRates();

  const category = (categoryId: string) =>
    categories.data.find((option) => option.id === categoryId);
  // Read on every render (a string, so nothing downstream churns): a screen left open past
  // midnight catches up the next time anything redraws.
  const today = todayIso();
  const range = useMemo(() => tripDateRange(stops.data), [stops.data]);
  const view = useMemo(
    () => deriveSpendingView(summary.data, { range, today }),
    [summary.data, range, today],
  );

  return {
    tripTitle: trip.data?.title ?? null,
    homeCurrency,
    expenses,
    summary,
    snapshot,
    view,
    today,
    placeOf: (cityId: number | null) =>
      cityId === null
        ? null
        : (stops.data.find((stop) => stop.city_id === cityId)?.city_name ?? null),
    categoryName: (categoryId: string) => category(categoryId)?.name ?? 'Other',
    categoryIcon: (categoryId: string) => category(categoryId)?.icon ?? null,
  };
}

type TripSpending = ReturnType<typeof useTripSpending>;

function useExpenseRemoval() {
  const actions = useExpenseActions();
  const { writeError, attemptRemoval } = useWriteAttempt(EXPENSE_FORM_COPY.saveFailed);

  const confirmRemove = (expense: ExpenseRecord) => {
    Alert.alert('Delete this expense?', 'It is removed from this trip.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => attemptRemoval(() => actions.removeExpense(expense.id)),
      },
    ]);
  };

  return { writeError, confirmRemove };
}

const SPENDING_ICON: IconName = 'wallet';

type ExpensesEmptyProps = {
  expenses: LiveResult<ExpenseRecord[]>;
  onAdd: () => void;
};

/** What stands in for the rows: unreadable, reading, or nothing logged yet. */
function ExpensesEmpty({ expenses, onAdd }: ExpensesEmptyProps) {
  if (expenses.error) {
    return (
      <ErrorState
        title="Couldn’t read the expenses"
        detail="The local store did not answer."
      />
    );
  }
  if (expenses.loading) return <SpendingSkeleton label="Loading expenses" />;
  return (
    <EmptyState
      icon={SPENDING_ICON}
      title="Nothing logged yet"
      detail="Tap Add expense to log the first one — it stays on this device until it syncs."
      action={{ label: 'Add expense', onPress: onAdd, testID: 'expenses-empty-add' }}
    />
  );
}

type HeadProps = { spending: TripSpending; expanded: boolean; onToggle: () => void };

/** The page's head: the summary, once the rows and the categories have been read. */
function SummaryHead({ spending, expanded, onToggle }: HeadProps) {
  const fontScale = useFontScale();
  return (
    <View style={{ paddingTop: Space[3] }}>
      <SpendingSummary
        summary={spending.summary.data}
        view={spending.view}
        ratesAsOf={spending.snapshot.asOf}
        expanded={expanded}
        onToggle={onToggle}
        fontScale={fontScale}
      />
    </View>
  );
}

export default function ExpensesScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const tripId = firstParam(id) ?? '';

  const spending = useTripSpending(tripId);
  const removal = useExpenseRemoval();
  const fontScale = useFontScale();
  const { tokens } = useAppearance();
  const [showSummary, setShowSummary] = useState(true);
  const days = useMemo(
    () => groupExpensesByDay(spending.expenses.data),
    [spending.expenses.data],
  );
  const dayTotals = useMemo(
    () => new Map(spending.view.days.map((day) => [day.date, day.total])),
    [spending.view.days],
  );
  const addExpense = () =>
    router.push({ pathname: '/modal/add-expense', params: { tripId } });
  const { expenses, summary } = spending;
  const readable = !expenses.loading && !expenses.error;
  const summarised =
    readable && !summary.loading && !summary.error && expenses.data.length > 0;

  return (
    <View
      testID="expenses-screen"
      className="bg-background"
      style={[styles.canvas, { backgroundColor: tokens.canvas }]}>
      <ExpensesHeader
        tripTitle={spending.tripTitle}
        count={readable ? expenses.data.length : null}
        writeError={removal.writeError}
      />
      <ListScreen
        edges={['bottom']}
        itemGap={0}
        horizontalInset={areaMargin()}
        bottomInset={areaFabClearance(Platform.OS, fontScale)}
        data={days}
        keyExtractor={(day: ExpenseDay) => day.date}
        renderItem={({ item }) => (
          <ExpenseDayGroup
            day={item}
            today={item.date === spending.today}
            total={dayTotals.get(item.date) ?? null}
            homeCurrency={spending.homeCurrency}
            categoryName={spending.categoryName}
            categoryIcon={spending.categoryIcon}
            placeOf={spending.placeOf}
            onRemove={removal.confirmRemove}
          />
        )}
        header={
          summarised ? (
            <SummaryHead
              spending={spending}
              expanded={showSummary}
              onToggle={() => setShowSummary((current) => !current)}
            />
          ) : null
        }
        empty={<ExpensesEmpty expenses={expenses} onAdd={addExpense} />}
      />
      <AreaFab
        label="Add expense"
        accessibilityLabel="Add expense"
        icon="plus"
        testID="expenses-add"
        onPress={addExpense}
      />
    </View>
  );
}

const styles = StyleSheet.create({ canvas: { flex: 1 } });
