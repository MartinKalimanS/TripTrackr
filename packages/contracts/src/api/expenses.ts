import { z } from 'zod';

import {
  CurrencyCode,
  DecimalString,
  IsoDate,
  IsoDateTime,
  RateString,
  Uuid,
} from '../scalars';
import { ExpensePullRecord } from '../sync/records';

/**
 * Expenses and categories (rest-api.md §7; FR-020 to FR-027).
 *
 * **Owner-only, structurally.** Nothing in this file has a visibility field,
 * every write shape is a strict object, and so a visibility key smuggled
 * onto an expense — `is_public`, `visibility`, anything — is refused by the
 * wire format before any code runs (FR-027, Constitution I).
 */

const nonEmptyPatch = (patch: object) => Object.keys(patch).length > 0;

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/**
 * The six system categories (FR-023), with fixed ids on both sides (research
 * D-29). Migration 0009 seeds `expense_categories` with exactly these rows at
 * `user_id IS NULL`; the device knows them without a fetch, so a first expense
 * can be logged in aeroplane mode and pushed with a `category_id` the server
 * already recognises. The ids are RFC 9562 version-4 form — valid for `Uuid` —
 * and deliberately legible as system rows.
 */
export const SYSTEM_EXPENSE_CATEGORIES = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Food', icon: 'food' },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Lodging', icon: 'lodging' },
  { id: '00000000-0000-4000-8000-000000000003', name: 'Transport', icon: 'transport' },
  { id: '00000000-0000-4000-8000-000000000004', name: 'Activities', icon: 'activities' },
  { id: '00000000-0000-4000-8000-000000000005', name: 'Shopping', icon: 'shopping' },
  { id: '00000000-0000-4000-8000-000000000006', name: 'Other', icon: 'other' },
] as const;

export type SystemExpenseCategory = (typeof SYSTEM_EXPENSE_CATEGORIES)[number];

export const SYSTEM_EXPENSE_CATEGORY_IDS: ReadonlySet<string> = new Set(
  SYSTEM_EXPENSE_CATEGORIES.map((category) => category.id),
);

export function isSystemExpenseCategory(id: string): boolean {
  return SYSTEM_EXPENSE_CATEGORY_IDS.has(id);
}

/** A category as read: a system row (`user_id: null`) or one of the caller's own. */
export const ExpenseCategory = z.strictObject({
  id: Uuid,
  user_id: Uuid.nullable(),
  name: z.string().trim().min(1).max(60),
  icon: z.string().max(60).nullable(),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
});
export type ExpenseCategory = z.infer<typeof ExpenseCategory>;

/** FR-024: user-scoped, reusable across every trip of that traveller. */
export const CreateExpenseCategoryRequest = z.strictObject({
  id: Uuid.optional(),
  name: z.string().trim().min(1).max(60),
  icon: z.string().max(60).nullable().default(null),
});
export type CreateExpenseCategoryRequest = z.infer<typeof CreateExpenseCategoryRequest>;

export const ExpenseCategoryResponse = z.strictObject({ category: ExpenseCategory });
export type ExpenseCategoryResponse = z.infer<typeof ExpenseCategoryResponse>;

/** System rows first, then the traveller's own, each group by name. */
export const ExpenseCategoriesResponse = z.strictObject({
  categories: z.array(ExpenseCategory),
});
export type ExpenseCategoriesResponse = z.infer<typeof ExpenseCategoriesResponse>;

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

/**
 * `POST /trips/:tripId/expenses`. The device may send the conversion it made
 * from its cached snapshot (research D-10); both fields or neither. When it
 * sends neither, the server resolves the rate — and stores the row
 * `fx_pending` if it cannot, never refusing (Constitution II). Whatever is
 * stored first is frozen (FR-022).
 */
export const CreateExpenseRequest = z
  .strictObject({
    id: Uuid.optional(),
    city_id: z.int().positive().nullable().default(null),
    category_id: Uuid,
    amount: DecimalString,
    currency: CurrencyCode,
    spent_at: IsoDate,
    note: z.string().trim().max(500).nullable().default(null),
    fx_rate_to_home: RateString.nullable().optional(),
    amount_home: DecimalString.nullable().optional(),
  })
  .refine(
    (expense) => (expense.fx_rate_to_home == null) === (expense.amount_home == null),
    {
      message: 'A client conversion needs both the rate and the converted amount',
      path: ['amount_home'],
    },
  );
export type CreateExpenseRequest = z.infer<typeof CreateExpenseRequest>;
export type CreateExpenseInput = z.input<typeof CreateExpenseRequest>;

/**
 * FR-022: a patch never recomputes the stored rate. The currency is therefore
 * not patchable — a different currency is a different conversion, so it is a
 * new expense — and a changed `amount` is converted with the rate already on
 * the row.
 */
export const PatchExpenseRequest = z
  .strictObject({
    city_id: z.int().positive().nullable().optional(),
    category_id: Uuid.optional(),
    amount: DecimalString.optional(),
    spent_at: IsoDate.optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine(nonEmptyPatch, { message: 'A patch must change at least one field' });
export type PatchExpenseRequest = z.infer<typeof PatchExpenseRequest>;

/** `GET /trips/:tripId/expenses?city_id=&category_id=&from=&to=` (rest-api.md §7). */
export const ListExpensesQuery = z
  .strictObject({
    city_id: z.coerce.number().int().positive().optional(),
    category_id: Uuid.optional(),
    from: IsoDate.optional(),
    to: IsoDate.optional(),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: 'from must not be after to',
    path: ['to'],
  });
export type ListExpensesQuery = z.infer<typeof ListExpensesQuery>;

/** A REST read never returns a deleted row; `deleted_at` is absent and refused. */
export const Expense = ExpensePullRecord.omit({ deleted_at: true });
export type Expense = z.infer<typeof Expense>;

export const ExpenseResponse = z.strictObject({ expense: Expense });
export type ExpenseResponse = z.infer<typeof ExpenseResponse>;

export const ExpensesResponse = z.strictObject({ expenses: z.array(Expense) });
export type ExpensesResponse = z.infer<typeof ExpensesResponse>;

// ---------------------------------------------------------------------------
// Summary (FR-025, FR-026)
// ---------------------------------------------------------------------------

/**
 * `GET /trips/:tripId/expenses/summary`. Every total is in the trip's home
 * currency and covers only rows whose conversion is known; rows still
 * awaiting a rate are reported in `pending_conversion`, by their own
 * currency, rather than silently omitted. `rates_applied` lists each distinct
 * `(currency, rate)` actually frozen on a row — the disclosure FR-026 asks for
 * when more than one currency is in play — and `rates_source` names the feed
 * those rates came from (research D-28).
 */
export const ExpenseSummary = z.strictObject({
  home_currency: CurrencyCode,
  total_home: DecimalString,
  by_category: z.array(
    z.strictObject({
      category_id: Uuid,
      name: z.string(),
      total_home: DecimalString,
      count: z.int().min(0),
    }),
  ),
  by_day: z.array(
    z.strictObject({
      date: IsoDate,
      total_home: DecimalString,
      count: z.int().min(0),
    }),
  ),
  rates_applied: z.array(
    z.strictObject({
      currency: CurrencyCode,
      rate: RateString,
      count: z.int().min(1),
    }),
  ),
  rates_source: z.string().nullable(),
  pending_conversion: z.strictObject({
    count: z.int().min(0),
    by_currency: z.array(
      z.strictObject({
        currency: CurrencyCode,
        total: DecimalString,
        count: z.int().min(1),
      }),
    ),
  }),
});
export type ExpenseSummary = z.infer<typeof ExpenseSummary>;
