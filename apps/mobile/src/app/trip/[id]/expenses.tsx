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
import { useTrip } from '@/features/trips/use-trips';
import { Sentry } from '@/lib/sentry';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function ExpensesScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const tripId = firstParam(id) ?? '';

  const trip = useTrip(tripId);
  const homeCurrency = trip.data?.home_currency ?? 'USD';
  const expenses = useExpenses(tripId);
  const categories = useExpenseCategories();
  const summary = useSpendingSummary(expenses, homeCurrency);
  const snapshot = useFxSnapshotInfo();
  const actions = useExpenseActions();
  const [showSummary, setShowSummary] = useState(true);
  const [writeError, setWriteError] = useState<string | null>(null);

  // Keeps the cached snapshot fresh while the screen is open; never blocks it.
  useFxRates();

  const categoryName = (categoryId: string) =>
    categories.data.find((option) => option.id === categoryId)?.name ?? 'Other';

  const confirmRemove = (expense: ExpenseRecord) => {
    Alert.alert('Delete this expense?', 'It is removed from this trip.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          try {
            setWriteError(null);
            actions.removeExpense(expense.id);
          } catch (error) {
            Sentry.captureException(error);
            setWriteError(EXPENSE_FORM_COPY.saveFailed);
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: ExpenseRecord }) => (
    <ExpenseRow
      expense={item}
      categoryName={categoryName(item.category_id)}
      homeCurrency={homeCurrency}
      onRemove={() => confirmRemove(item)}
    />
  );

  const header = (
    <ExpensesHeader
      tripTitle={trip.data?.title ?? null}
      summary={summary.data}
      summaryLoading={summary.loading}
      ratesAsOf={snapshot.asOf}
      showSummary={showSummary}
      writeError={writeError}
      onBack={() => router.back()}
      onAdd={() => router.push({ pathname: '/modal/add-expense', params: { tripId } })}
      onToggleSummary={() => setShowSummary((current) => !current)}
    />
  );

  const empty = expenses.error ? (
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

  return (
    <ListScreen
      testID="expenses-screen"
      data={expenses.data}
      keyExtractor={(expense) => expense.id}
      renderItem={renderItem}
      header={header}
      empty={empty}
    />
  );
}
