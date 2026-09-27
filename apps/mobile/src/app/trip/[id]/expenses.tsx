/**
 * A trip's expenses and spending summary — tasks.md T086, T087 (FR-020 to
 * FR-026; Constitution II); research D-23, D-26.
 *
 * Read from and written to the encrypted local store; the list and the
 * summary are live queries, so logging an expense in aeroplane mode changes
 * the totals at once. The list is a `FlashList` through `ListScreen` (D-23).
 * The summary sits in the header, toggled, computed from the same rows with
 * exact decimal arithmetic (SC-016). "Add expense" opens the modal sheet.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { ExpenseRow } from '@/components/trip/expense-row';
import { ExpensesHeader } from '@/components/trip/expenses-header';
import { ListScreen } from '@/components/ui/list-screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import type { ExpenseRow as ExpenseRecord } from '@/db/schema';
import { EXPENSE_FORM_COPY } from '@/features/expenses/expense-form';
import {
  useExpenseActions,
  useExpenseCategories,
  useExpenses,
  useFxSnapshotInfo,
  useSpendingSummary,
} from '@/features/expenses/use-expenses';
import { useFxRates } from '@/features/expenses/use-fx-rates';
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

  const categoryName = (categoryId: string) =>
    categories.data.find((option) => option.id === categoryId)?.name ?? 'Other';

  return { trip, homeCurrency, expenses, summary, snapshot, categoryName };
}

function useExpenseRemoval() {
  const actions = useExpenseActions();
  const { writeError, attempt } = useWriteAttempt(EXPENSE_FORM_COPY.saveFailed);

  const confirmRemove = (expense: ExpenseRecord) => {
    Alert.alert('Delete this expense?', 'It is removed from this trip.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => attempt(() => actions.removeExpense(expense.id)),
      },
    ]);
  };

  return { writeError, confirmRemove };
}

function ExpensesEmpty({ expenses }: { expenses: LiveResult<ExpenseRecord[]> }) {
  return expenses.error ? (
    <ErrorState
      title="Couldn’t read the expenses"
      detail="The local store did not answer."
    />
  ) : expenses.loading ? (
    <LoadingState title="Loading expenses" />
  ) : (
    <EmptyState
      title="Nothing logged yet"
      detail="Add the first expense — it stays on this device until it syncs."
    />
  );
}

export default function ExpensesScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const tripId = firstParam(id) ?? '';

  const spending = useTripSpending(tripId);
  const removal = useExpenseRemoval();
  const [showSummary, setShowSummary] = useState(true);

  const renderItem = ({ item }: { item: ExpenseRecord }) => (
    <ExpenseRow
      expense={item}
      categoryName={spending.categoryName(item.category_id)}
      homeCurrency={spending.homeCurrency}
      onRemove={() => removal.confirmRemove(item)}
    />
  );

  const header = (
    <ExpensesHeader
      tripTitle={spending.trip.data?.title ?? null}
      summary={spending.summary.data}
      summaryLoading={spending.summary.loading}
      ratesAsOf={spending.snapshot.asOf}
      showSummary={showSummary}
      writeError={removal.writeError}
      onBack={() => router.back()}
      onAdd={() => router.push({ pathname: '/modal/add-expense', params: { tripId } })}
      onToggleSummary={() => setShowSummary((current) => !current)}
    />
  );

  return (
    <ListScreen
      testID="expenses-screen"
      data={spending.expenses.data}
      keyExtractor={(expense) => expense.id}
      renderItem={renderItem}
      header={header}
      empty={<ExpensesEmpty expenses={spending.expenses} />}
    />
  );
}
