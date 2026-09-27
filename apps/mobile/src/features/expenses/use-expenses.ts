/**
 * Expenses, categories and the spending summary as live local queries —
 * tasks.md T206 (FR-020 to FR-026; Constitution II; research D-26).
 *
 * Everything is read from the encrypted local store through `useLiveQuery`
 * and written through the repository; the summary is derived in memory from
 * the live rows with `decimal.js` arithmetic, so it is exact (SC-016) and it
 * updates the moment a row is written — offline or not. Ids are minted here
 * with `expo-crypto`'s `randomUUID()` (research D-15).
 */
import type { ExpenseSummary } from '@triptrackr/contracts';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { useMemo } from 'react';

import { useDatabase } from '@/db/client';
import {
  categoryOptions,
  expensesRepository,
  summariseExpenses,
  type CategoryOption,
  type CreateCategoryInput,
  type CreateExpenseInput,
  type ExpensePatch,
} from '@/db/repositories/expenses';
import { fxRatesRepository } from '@/db/repositories/fx-rates';
import type { ExpenseCategoryRow, ExpenseRow } from '@/db/schema';
import type { LiveResult } from '@/features/trips/use-trips';

/** A trip's live expenses, newest spend first. */
export function useExpenses(tripId: string): LiveResult<ExpenseRow[]> {
  const db = useDatabase();
  const result = useLiveQuery(expensesRepository.forTripQuery(db, tripId), [tripId]);
  return {
    data: result.data,
    loading: result.updatedAt === undefined,
    error: result.error ?? null,
  };
}

/** The six system categories plus the traveller's own, live. */
export function useExpenseCategories(): LiveResult<CategoryOption[]> {
  const db = useDatabase();
  const result = useLiveQuery(expensesRepository.customCategoriesQuery(db));
  const data = useMemo(() => categoryOptions(result.data), [result.data]);
  return { data, loading: result.updatedAt === undefined, error: result.error ?? null };
}

/** The cached FX snapshot's provenance — for the summary's disclosure line. */
export function useFxSnapshotInfo(): { asOf: string | null; source: string | null } {
  const db = useDatabase();
  const result = useLiveQuery(fxRatesRepository.snapshotQuery(db));
  const first = result.data[0];
  return { asOf: first?.as_of ?? null, source: first?.source ?? null };
}

/**
 * FR-025, FR-026: the summary, computed from the live rows the caller has
 * already loaded with `useExpenses` (one query, not two). The same shape the
 * API returns, so `<SpendingSummary>` renders either.
 */
export function useSpendingSummary(
  expenses: LiveResult<ExpenseRow[]>,
  homeCurrency: string,
): LiveResult<ExpenseSummary> {
  const categories = useExpenseCategories();
  const { source } = useFxSnapshotInfo();

  const data = useMemo(
    () => summariseExpenses(expenses.data, homeCurrency, categories.data, source),
    [expenses.data, homeCurrency, categories.data, source],
  );

  return {
    data,
    loading: expenses.loading || categories.loading,
    error: expenses.error ?? categories.error ?? null,
  };
}

export interface ExpenseActions {
  createExpense: (input: Omit<CreateExpenseInput, 'id'>) => ExpenseRow;
  updateExpense: (expenseId: string, patch: ExpensePatch) => ExpenseRow;
  removeExpense: (expenseId: string) => void;
  createCategory: (input: Omit<CreateCategoryInput, 'id'>) => ExpenseCategoryRow;
}

export function useExpenseActions(): ExpenseActions {
  const db = useDatabase();
  return useMemo(
    () => ({
      createExpense: (input) =>
        expensesRepository.create(db, { id: randomUUID(), ...input }),
      updateExpense: (expenseId, patch) =>
        expensesRepository.update(db, expenseId, patch),
      removeExpense: (expenseId) => expensesRepository.remove(db, expenseId),
      createCategory: (input) =>
        expensesRepository.createCategory(db, { id: randomUUID(), ...input }),
    }),
    [db],
  );
}
