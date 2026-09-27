/**
 * Add-expense rules — tasks.md T086 (FR-020, FR-021); research D-21, D-27.
 *
 * The form's fields — an amount as the traveller TYPED it, a currency, a
 * category, a spend date, an optional city and note — are transformed into
 * the wire's `CreateExpenseRequest` and piped through it, so `useForm`
 * validates exactly what the server validates. The one rule the wire cannot
 * know is how to read "12,50": `parseAmount` (research D-27) turns the typed
 * text into a `DecimalString` first and reports on the `amount` field when it
 * cannot.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateExpenseRequest, parseAmount } from '@triptrackr/contracts';
import { z } from 'zod';

import type { FormCopy } from '@/lib/form-copy';

export const EXPENSE_FORM_COPY = {
  amountInvalid: 'Enter an amount, like 12.50 or 12,50.',
  currencyInvalid: 'Use a 3-letter currency code, like EUR.',
  categoryMissing: 'Choose a category.',
  dateMissing: 'Choose the day you paid.',
  noteTooLong: 'Keep the note under 500 characters.',
  saveFailed: 'The expense could not be saved on this device. Please try again.',
} as const;

export interface ExpenseFormValues {
  amount: string;
  currency: string;
  category_id: string;
  spent_at: string;
  city_id: number | null;
  note: string;
}

export type ExpenseFormField = keyof ExpenseFormValues;

export const EXPENSE_FIELD_COPY: FormCopy<ExpenseFormField> = {
  amount: { default: EXPENSE_FORM_COPY.amountInvalid },
  currency: { default: EXPENSE_FORM_COPY.currencyInvalid },
  category_id: { default: EXPENSE_FORM_COPY.categoryMissing },
  spent_at: { default: EXPENSE_FORM_COPY.dateMissing },
  city_id: { default: 'Choose a city from this trip.' },
  note: { default: EXPENSE_FORM_COPY.noteTooLong },
};

export const ExpenseFormSchema = z
  .object({
    amount: z.string(),
    currency: z.string(),
    category_id: z.string(),
    spent_at: z.string(),
    city_id: z.number().int().positive().nullable(),
    note: z.string(),
  })
  .transform((values, ctx): z.input<typeof CreateExpenseRequest> => {
    const amount = parseAmount(values.amount);
    if (amount === null) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Not an amount' });
      return z.NEVER;
    }
    const note = values.note.trim();
    return {
      amount,
      currency: values.currency.trim().toUpperCase(),
      category_id: values.category_id,
      spent_at: values.spent_at,
      city_id: values.city_id,
      note: note.length > 0 ? note : null,
    };
  })
  .pipe(CreateExpenseRequest);

export const expenseFormResolver = zodResolver(ExpenseFormSchema);
