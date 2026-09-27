/**
 * Expenses and categories — local-first repository (tasks.md T206; FR-020 to
 * FR-026; Constitution II; research D-10, D-26, D-29).
 *
 * Same rules as `trips.ts`: writes stamp `updated_at` and set `is_dirty`,
 * deletes are tombstones, reads filter tombstones out. Two things are
 * particular to money:
 *
 *   - **The rate is frozen at entry (FR-021, FR-022).** `create()` converts
 *     from the cached FX snapshot with the server's own arithmetic and stores
 *     the rate on the row; when the snapshot cannot answer, the row is stored
 *     `fx_pending` and the server backfills it. `update()` never touches the
 *     rate — a changed amount is converted with the rate already on the row,
 *     and the currency is not patchable at all (a different currency is a new
 *     expense), exactly as the REST contract has it.
 *   - **Totals are exact (SC-016).** SQLite has no decimal type, so the
 *     summary is computed in JavaScript through `decimal.js` (`sumAmounts`),
 *     never with SQL `SUM` over text columns coerced to REAL.
 *
 * Categories: the six system rows are constants (`SYSTEM_EXPENSE_CATEGORIES`)
 * and are never stored locally; the local table holds the traveller's own
 * custom rows, which sync ahead of expenses (sync-protocol.md §2).
 */
import {
  SYSTEM_EXPENSE_CATEGORIES,
  compareAmounts,
  convertAmount,
  sumAmounts,
  type ExpenseSummary,
} from '@triptrackr/contracts';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import type { AppDatabase } from '@/db/client';
import {
  expenseCategories,
  expenses,
  type ExpenseCategoryRow,
  type ExpenseRow,
} from '@/db/schema';

import { fxRatesRepository } from './fx-rates';
import { nowIso } from './shared';

export interface CreateExpenseInput {
  /** Client-generated UUID (D-15). */
  id: string;
  trip_id: string;
  /** The trip's home currency — what `amount_home` is expressed in. */
  home_currency: string;
  city_id: number | null;
  category_id: string;
  /** `DecimalString`. */
  amount: string;
  currency: string;
  /** `IsoDate`. */
  spent_at: string;
  note: string | null;
}

export interface ExpensePatch {
  city_id?: number | null;
  category_id?: string;
  amount?: string;
  spent_at?: string;
  note?: string | null;
}

export interface CreateCategoryInput {
  id: string;
  name: string;
  icon?: string | null;
}

/** A category as the picker shows it — system constant or the traveller's own. */
export interface CategoryOption {
  id: string;
  name: string;
  icon: string | null;
  system: boolean;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Live expenses of a trip, newest spend first. Live-queryable. */
function forTripQuery(db: AppDatabase, tripId: string) {
  return db
    .select()
    .from(expenses)
    .where(and(eq(expenses.trip_id, tripId), isNull(expenses.deleted_at)))
    .orderBy(desc(expenses.spent_at), desc(expenses.created_at), desc(expenses.id));
}

/** The traveller's own live categories, by name. Live-queryable. */
function customCategoriesQuery(db: AppDatabase) {
  return db
    .select()
    .from(expenseCategories)
    .where(isNull(expenseCategories.deleted_at))
    .orderBy(asc(expenseCategories.name));
}

/** System rows first, in their fixed order, then the traveller's own. */
export function categoryOptions(custom: readonly ExpenseCategoryRow[]): CategoryOption[] {
  return [
    ...SYSTEM_EXPENSE_CATEGORIES.map((c) => ({ ...c, system: true })),
    ...custom.map((c) => ({ id: c.id, name: c.name, icon: c.icon, system: false })),
  ];
}

function byId(db: AppDatabase, id: string): ExpenseRow | null {
  const [row] = db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), isNull(expenses.deleted_at)))
    .all();
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function create(db: AppDatabase, input: CreateExpenseInput): ExpenseRow {
  const now = nowIso();
  const conversion = fxRatesRepository.convert(
    db,
    input.amount,
    input.currency,
    input.home_currency,
  );

  const [row] = db
    .insert(expenses)
    .values({
      id: input.id,
      trip_id: input.trip_id,
      city_id: input.city_id,
      category_id: input.category_id,
      amount: input.amount,
      currency: input.currency,
      spent_at: input.spent_at,
      note: input.note,
      fx_rate_to_home: conversion?.fx_rate_to_home ?? null,
      amount_home: conversion?.amount_home ?? null,
      fx_pending: conversion === null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      is_dirty: true,
      synced_at: null,
    })
    .returning()
    .all();
  if (!row) throw new Error('Expense insert returned no row.');
  return row;
}

/** FR-022: the stored rate is the rate. A new amount is converted with it. */
function update(db: AppDatabase, id: string, patch: ExpensePatch): ExpenseRow {
  const current = byId(db, id);
  if (!current) throw new Error('Expense not found.');

  const amountHome =
    patch.amount !== undefined && current.fx_rate_to_home !== null
      ? { amount_home: convertAmount(patch.amount, current.fx_rate_to_home) }
      : {};

  const [row] = db
    .update(expenses)
    .set({ ...patch, ...amountHome, updated_at: nowIso(), is_dirty: true })
    .where(and(eq(expenses.id, id), isNull(expenses.deleted_at)))
    .returning()
    .all();
  if (!row) throw new Error('Expense update returned no row.');
  return row;
}

/** Tombstone. The row stays until the server has been told (FR-039). */
function remove(db: AppDatabase, id: string): void {
  const now = nowIso();
  db.update(expenses)
    .set({ deleted_at: now, updated_at: now, is_dirty: true })
    .where(and(eq(expenses.id, id), isNull(expenses.deleted_at)))
    .run();
}

/**
 * A custom category, reusable across every trip (FR-024). Creating one that
 * already exists by name (case-insensitively) hands back the existing row —
 * two "Coffee" categories is a mistake nobody intends.
 */
function createCategory(db: AppDatabase, input: CreateCategoryInput): ExpenseCategoryRow {
  const name = input.name.trim();
  const existing = customCategoriesQuery(db)
    .all()
    .find((row) => row.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;

  const now = nowIso();
  const [row] = db
    .insert(expenseCategories)
    .values({
      id: input.id,
      name,
      icon: input.icon ?? null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      is_dirty: true,
      synced_at: null,
    })
    .returning()
    .all();
  if (!row) throw new Error('Category insert returned no row.');
  return row;
}

// ---------------------------------------------------------------------------
// Summary (FR-025, FR-026) — the wire shape, computed from the local mirror
// ---------------------------------------------------------------------------

function categoryName(id: string, options: readonly CategoryOption[]): string {
  return options.find((option) => option.id === id)?.name ?? 'Other';
}

function groupRows<K extends string>(
  items: readonly ExpenseRow[],
  key: (row: ExpenseRow) => K,
): Map<K, ExpenseRow[]> {
  const buckets = new Map<K, ExpenseRow[]>();
  for (const item of items) {
    const list = buckets.get(key(item)) ?? [];
    list.push(item);
    buckets.set(key(item), list);
  }
  return buckets;
}

function totalHome(rows: readonly ExpenseRow[]): string {
  return sumAmounts(rows.map((row) => row.amount_home as string));
}

function totalsByCategory(
  converted: readonly ExpenseRow[],
  options: readonly CategoryOption[],
): ExpenseSummary['by_category'] {
  return [...groupRows(converted, (row) => row.category_id)]
    .map(([category_id, items]) => ({
      category_id,
      name: categoryName(category_id, options),
      total_home: totalHome(items),
      count: items.length,
    }))
    .sort(
      (x, y) =>
        compareAmounts(y.total_home, x.total_home) || x.name.localeCompare(y.name),
    );
}

function totalsByDay(converted: readonly ExpenseRow[]): ExpenseSummary['by_day'] {
  return [...groupRows(converted, (row) => row.spent_at)]
    .map(([date, items]) => ({
      date,
      total_home: totalHome(items),
      count: items.length,
    }))
    .sort((x, y) => x.date.localeCompare(y.date));
}

function ratesApplied(
  converted: readonly ExpenseRow[],
  homeCurrency: string,
): ExpenseSummary['rates_applied'] {
  const rateKey = (row: ExpenseRow) => `${row.currency}|${row.fx_rate_to_home}`;
  return [
    ...groupRows(
      converted.filter((row) => row.currency !== homeCurrency),
      rateKey,
    ),
  ]
    .map(([, items]) => ({
      currency: items[0]!.currency,
      rate: items[0]!.fx_rate_to_home as string,
      count: items.length,
    }))
    .sort((x, y) => x.currency.localeCompare(y.currency) || x.rate.localeCompare(y.rate));
}

function pendingByCurrency(
  pending: readonly ExpenseRow[],
): ExpenseSummary['pending_conversion']['by_currency'] {
  return [...groupRows(pending, (row) => row.currency)]
    .map(([currency, items]) => ({
      currency,
      total: sumAmounts(items.map((row) => row.amount)),
      count: items.length,
    }))
    .sort((x, y) => x.currency.localeCompare(y.currency));
}

/**
 * Pure. The same shape `GET /trips/:tripId/expenses/summary` returns, so one
 * component renders either source. Converted rows total in the home currency;
 * pending rows are reported by their own currency, never folded in or dropped.
 */
export function summariseExpenses(
  rows: readonly ExpenseRow[],
  homeCurrency: string,
  options: readonly CategoryOption[],
  ratesSource: string | null,
): ExpenseSummary {
  const converted = rows.filter((row) => !row.fx_pending && row.amount_home !== null);
  const pending = rows.filter((row) => row.fx_pending || row.amount_home === null);

  return {
    home_currency: homeCurrency,
    total_home: totalHome(converted),
    by_category: totalsByCategory(converted, options),
    by_day: totalsByDay(converted),
    rates_applied: ratesApplied(converted, homeCurrency),
    rates_source: ratesSource,
    pending_conversion: {
      count: pending.length,
      by_currency: pendingByCurrency(pending),
    },
  };
}

export const expensesRepository = {
  forTripQuery,
  customCategoriesQuery,
  byId,
  create,
  update,
  remove,
  createCategory,
};
