/**
 * Expenses grouped by the day they were spent — 004 T441 (FR-014).
 *
 * The spending list is a `FlashList` whose item is one calendar day: a header with the date
 * and the day's rows in one grouped surface. The day is the row's stored `spent_at`
 * (`YYYY-MM-DD`), read as text and never through a `Date`, so no time zone can move an
 * expense to another day (the local calendar day rule of `features/trips/stop-dates.ts`).
 * Days and rows keep the order the store returned them in (newest spend first); a day
 * that comes back later in that order joins its first rows, so a date is never listed twice.
 */
import type { ExpenseRow } from '@/db/schema';

export type ExpenseDay = {
  /** `YYYY-MM-DD`. */
  date: string;
  expenses: ExpenseRow[];
};

export function groupExpensesByDay(rows: readonly ExpenseRow[]): ExpenseDay[] {
  const days = new Map<string, ExpenseRow[]>();
  for (const row of rows) {
    const day = days.get(row.spent_at);
    if (day) {
      day.push(row);
    } else {
      days.set(row.spent_at, [row]);
    }
  }
  return [...days].map(([date, expenses]) => ({ date, expenses }));
}
