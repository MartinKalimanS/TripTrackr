/**
 * A trip's expenses and spending summary — tasks.md T086, T087, 004 T441 (FR-020 to FR-026;
 * 004 FR-007, FR-008, FR-014, FR-015, FR-021, FR-035; Constitution II); research D-23, D-26.
 *
 * Read from and written to the encrypted local store; the list and the
 * summary are live queries, so logging an expense in aeroplane mode changes
 * the totals at once. The list is a `FlashList` through `ListScreen` (D-23).
 * The summary sits in the header, toggled, computed from the same rows with
 * exact decimal arithmetic (SC-016). "Add expense" opens the modal sheet.
 *
 * The screen is below a NATIVE header (`_layout.tsx`: the title "Spending" and the Back
 * control), so it is `underHeader` and has no bar of its own. The rows are grouped by the
 * day they were spent (FR-014): a `FlashList` item is one day, a `ListGroup` headed by the
 * date with its rows inside, each row an icon, a category, a right-aligned amount.
 * Its states are designed (C4-10 rule 2): placeholders shaped like rows while the first
 * read is pending, an error in words, and an empty state that names the next action and
 * offers it. The error is checked before `loading`: a live read that fails can still
 * report `loading` and the words must win over the placeholder. There is no retry: a live
 * query has nothing to re-run (the same recorded gap as Trips).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert } from 'react-native';

import { ExpenseRow } from '@/components/trip/expense-row';
import { ExpensesHeader } from '@/components/trip/expenses-header';
import type { IconName } from '@/components/ui/icon';
import { ListScreen } from '@/components/ui/list-screen';
import { ListGroup } from '@/components/ui/list-group';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/state-view';
import type { ExpenseRow as ExpenseRecord } from '@/db/schema';
import { EXPENSE_FORM_COPY } from '@/features/expenses/expense-form';
import { groupExpensesByDay, type ExpenseDay } from '@/features/expenses/group-by-day';
import {
  useExpenseActions,
  useExpenseCategories,
  useExpenses,
  useFxSnapshotInfo,
  useSpendingSummary,
} from '@/features/expenses/use-expenses';
import { useFxRates } from '@/features/expenses/use-fx-rates';
import { formatIsoDate } from '@/features/trips/stop-dates';
import { useTrip, type LiveResult } from '@/features/trips/use-trips';
import { useWriteAttempt } from '@/hooks/use-write-attempt';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function useTripSpending(tripId: string) {
  const trip = useTrip(tripId);
  const homeCurrency = trip.data?.home_currency ?? 'USD';
  const expenses = useExpenses(tripId);
  const categories = useExpenseCategories();
  const summary = useSpendingSummary(expenses, homeCurrency);
  const snapshot = useFxSnapshotInfo();

  // Keeps the cached snapshot fresh while the screen is open; never blocks it.
  useFxRates();

  const category = (categoryId: string) =>
    categories.data.find((option) => option.id === categoryId);

  return {
    homeCurrency,
    expenses,
    summary,
    snapshot,
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

const SPENDING_ICON: IconName = { ios: 'creditcard', android: 'payments' };

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
  if (expenses.loading) {
    return <ListSkeleton variant="row" rows={4} label="Loading expenses" />;
  }
  return (
    <EmptyState
      icon={SPENDING_ICON}
      title="Nothing logged yet"
      detail="Tap Add expense to log the first one — it stays on this device until it syncs."
      action={{ label: 'Add expense', onPress: onAdd, testID: 'expenses-empty-add' }}
    />
  );
}

type ExpenseDayGroupProps = {
  day: ExpenseDay;
  spending: TripSpending;
  onRemove: (expense: ExpenseRecord) => void;
};

/** One day: its date as the heading of a grouped surface, and the day's rows inside. */
function ExpenseDayGroup({ day, spending, onRemove }: ExpenseDayGroupProps) {
  return (
    <ListGroup header={formatIsoDate(day.date)} testID={`expense-day-${day.date}`}>
      {day.expenses.map((expense) => (
        <ExpenseRow
          key={expense.id}
          expense={expense}
          categoryName={spending.categoryName(expense.category_id)}
          categoryIcon={spending.categoryIcon(expense.category_id)}
          homeCurrency={spending.homeCurrency}
          onRemove={() => onRemove(expense)}
        />
      ))}
    </ListGroup>
  );
}

export default function ExpensesScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const tripId = firstParam(id) ?? '';

  const spending = useTripSpending(tripId);
  const removal = useExpenseRemoval();
  const [showSummary, setShowSummary] = useState(true);
  const days = useMemo(
    () => groupExpensesByDay(spending.expenses.data),
    [spending.expenses.data],
  );
  const addExpense = () =>
    router.push({ pathname: '/modal/add-expense', params: { tripId } });

  const header = (
    <ExpensesHeader
      summary={spending.summary.data}
      summaryLoading={spending.summary.loading}
      ratesAsOf={spending.snapshot.asOf}
      showSummary={showSummary}
      writeError={removal.writeError}
      onAdd={addExpense}
      onToggleSummary={() => setShowSummary((current) => !current)}
    />
  );

  return (
    <ListScreen
      testID="expenses-screen"
      underHeader
      data={days}
      keyExtractor={(day) => day.date}
      renderItem={({ item }) => (
        <ExpenseDayGroup
          day={item}
          spending={spending}
          onRemove={removal.confirmRemove}
        />
      )}
      header={header}
      empty={<ExpensesEmpty expenses={spending.expenses} onAdd={addExpense} />}
    />
  );
}
