import { Injectable } from '@nestjs/common';
import type { ListExpensesQuery } from '@triptrackr/contracts';
import { asc, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';

import { rlsDb } from '@/common/db/rls-db';
import { liveOnly } from '@/common/db/soft-delete.scope';
import { requireCurrentUserId } from '@/common/rls/rls-context';
import { cities, expenseCategories, expenses } from '@/db/schema';

/**
 * The expense columns the owner view serialises. `deleted_at` is absent
 * because the contract has no slot for it (contracts/api/expenses.ts); the
 * money columns come back as the decimal strings Drizzle reads `NUMERIC` as,
 * and are never widened to a number (research D-26).
 */
const EXPENSE_COLUMNS = {
  id: expenses.id,
  tripId: expenses.tripId,
  cityId: expenses.cityId,
  categoryId: expenses.categoryId,
  amount: expenses.amount,
  currency: expenses.currency,
  fxRateToHome: expenses.fxRateToHome,
  amountHome: expenses.amountHome,
  fxPending: expenses.fxPending,
  spentAt: expenses.spentAt,
  note: expenses.note,
  createdAt: expenses.createdAt,
  updatedAt: expenses.updatedAt,
};

export type ExpenseRow = Pick<typeof expenses.$inferSelect, keyof typeof EXPENSE_COLUMNS>;

const CATEGORY_COLUMNS = {
  id: expenseCategories.id,
  userId: expenseCategories.userId,
  name: expenseCategories.name,
  icon: expenseCategories.icon,
  createdAt: expenseCategories.createdAt,
  updatedAt: expenseCategories.updatedAt,
};

export type CategoryRow = Pick<
  typeof expenseCategories.$inferSelect,
  keyof typeof CATEGORY_COLUMNS
>;

export interface NewExpense {
  readonly id?: string;
  readonly tripId: string;
  readonly cityId: number | null;
  readonly categoryId: string;
  readonly amount: string;
  readonly currency: string;
  readonly spentAt: string;
  readonly note: string | null;
  readonly fxRateToHome: string | null;
  readonly amountHome: string | null;
  readonly fxPending: boolean;
}

export interface ExpensePatch {
  readonly cityId?: number | null;
  readonly categoryId?: string;
  readonly amount?: string;
  readonly amountHome?: string | null;
  readonly spentAt?: string;
  readonly note?: string | null;
}

/** One SQL aggregate row; totals arrive as `NUMERIC` text and stay text. */
export interface CategoryTotal {
  readonly categoryId: string;
  readonly name: string;
  readonly totalHome: string;
  readonly count: number;
}

export interface DayTotal {
  readonly date: string;
  readonly totalHome: string;
  readonly count: number;
}

export interface RateApplied {
  readonly currency: string;
  readonly rate: string;
  readonly count: number;
}

export interface PendingByCurrency {
  readonly currency: string;
  readonly total: string;
  readonly count: number;
}

/**
 * Every query against `expenses` and `expense_categories`, on the request's
 * RLS transaction (rls-db.ts).
 *
 * The trip-ownership check happens before any of these run (expenses.service.ts
 * loads the trip through the owner view first), so a stranger never reaches a
 * query here for someone else's trip. `expenses_owner_only` (0005) stands
 * behind that regardless: it has no public-read counterpart, and a forgotten
 * check would return nothing rather than someone else's row (FR-027).
 *
 * No statement here can raise on a caller's mistake — unknown cities and
 * unseen categories are checked first, and client-chosen ids use
 * `ON CONFLICT DO NOTHING` — because a failed statement poisons the request
 * transaction (0008's header).
 */
@Injectable()
export class ExpensesRepository {
  listForTrip(tripId: string, query: ListExpensesQuery): Promise<ExpenseRow[]> {
    return rlsDb()
      .select(EXPENSE_COLUMNS)
      .from(expenses)
      .where(
        liveOnly(
          expenses,
          eq(expenses.tripId, tripId),
          query.city_id !== undefined ? eq(expenses.cityId, query.city_id) : undefined,
          query.category_id !== undefined
            ? eq(expenses.categoryId, query.category_id)
            : undefined,
          query.from !== undefined ? gte(expenses.spentAt, query.from) : undefined,
          query.to !== undefined ? lte(expenses.spentAt, query.to) : undefined,
        ),
      )
      .orderBy(desc(expenses.spentAt), desc(expenses.createdAt), asc(expenses.id));
  }

  async findLive(expenseId: string): Promise<ExpenseRow | null> {
    const [row] = await rlsDb()
      .select(EXPENSE_COLUMNS)
      .from(expenses)
      .where(liveOnly(expenses, eq(expenses.id, expenseId)))
      .limit(1);

    return row ?? null;
  }

  /** Null when the id is already taken — the caller decides what that means. */
  async insert(expense: NewExpense): Promise<ExpenseRow | null> {
    const [row] = await rlsDb()
      .insert(expenses)
      .values({
        ...(expense.id !== undefined && { id: expense.id }),
        tripId: expense.tripId,
        cityId: expense.cityId,
        categoryId: expense.categoryId,
        amount: expense.amount,
        currency: expense.currency,
        spentAt: expense.spentAt,
        note: expense.note,
        fxRateToHome: expense.fxRateToHome,
        amountHome: expense.amountHome,
        fxPending: expense.fxPending,
      })
      .onConflictDoNothing()
      .returning(EXPENSE_COLUMNS);

    return row ?? null;
  }

  /** The rate column is deliberately not settable here (FR-022). */
  async update(expenseId: string, patch: ExpensePatch): Promise<ExpenseRow | null> {
    const [row] = await rlsDb()
      .update(expenses)
      .set({
        ...(patch.cityId !== undefined && { cityId: patch.cityId }),
        ...(patch.categoryId !== undefined && { categoryId: patch.categoryId }),
        ...(patch.amount !== undefined && { amount: patch.amount }),
        ...(patch.amountHome !== undefined && { amountHome: patch.amountHome }),
        ...(patch.spentAt !== undefined && { spentAt: patch.spentAt }),
        ...(patch.note !== undefined && { note: patch.note }),
        updatedAt: sql`now()`,
      })
      .where(liveOnly(expenses, eq(expenses.id, expenseId)))
      .returning(EXPENSE_COLUMNS);

    return row ?? null;
  }

  async tombstone(expenseId: string): Promise<boolean> {
    const now = sql`now()`;
    const rows = await rlsDb()
      .update(expenses)
      .set({ deletedAt: now, updatedAt: now })
      .where(liveOnly(expenses, eq(expenses.id, expenseId)))
      .returning({ id: expenses.id });

    return rows.length > 0;
  }

  async cityExists(cityId: number): Promise<boolean> {
    const rows = await rlsDb()
      .select({ id: cities.id })
      .from(cities)
      .where(eq(cities.id, cityId))
      .limit(1);

    return rows.length > 0;
  }

  // -------------------------------------------------------------------------
  // Categories
  // -------------------------------------------------------------------------

  /**
   * System rows first, in their fixed-id order (Food … Other, research D-29),
   * then the caller's own by name.
   */
  listCategories(): Promise<CategoryRow[]> {
    return rlsDb()
      .select(CATEGORY_COLUMNS)
      .from(expenseCategories)
      .where(isNull(expenseCategories.deletedAt))
      .orderBy(
        sql`${expenseCategories.userId} IS NOT NULL`,
        sql`CASE WHEN ${expenseCategories.userId} IS NULL
              THEN ${expenseCategories.id}::text
              ELSE lower(${expenseCategories.name}) END`,
      );
  }

  /**
   * True when the caller may file an expense under this category: a system
   * row or one of their own, both live. The policy already hides everyone
   * else's rows, so "visible" and "allowed" are the same question.
   */
  async categoryVisible(categoryId: string): Promise<boolean> {
    const rows = await rlsDb()
      .select({ id: expenseCategories.id })
      .from(expenseCategories)
      .where(liveOnly(expenseCategories, eq(expenseCategories.id, categoryId)))
      .limit(1);

    return rows.length > 0;
  }

  /** The caller's live category of this name, if they already have one (FR-024). */
  async findOwnCategoryByName(name: string): Promise<CategoryRow | null> {
    const [row] = await rlsDb()
      .select(CATEGORY_COLUMNS)
      .from(expenseCategories)
      .where(
        liveOnly(
          expenseCategories,
          eq(expenseCategories.userId, requireCurrentUserId()),
          sql`lower(${expenseCategories.name}) = lower(${name})`,
        ),
      )
      .limit(1);

    return row ?? null;
  }

  /** Null when the id, or the (user, name) pair, is already taken. */
  async insertCategory(category: {
    id?: string;
    name: string;
    icon: string | null;
  }): Promise<CategoryRow | null> {
    const [row] = await rlsDb()
      .insert(expenseCategories)
      .values({
        ...(category.id !== undefined && { id: category.id }),
        userId: requireCurrentUserId(),
        name: category.name,
        icon: category.icon,
      })
      .onConflictDoNothing()
      .returning(CATEGORY_COLUMNS);

    return row ?? null;
  }

  async findCategory(categoryId: string): Promise<CategoryRow | null> {
    const [row] = await rlsDb()
      .select(CATEGORY_COLUMNS)
      .from(expenseCategories)
      .where(liveOnly(expenseCategories, eq(expenseCategories.id, categoryId)))
      .limit(1);

    return row ?? null;
  }

  // -------------------------------------------------------------------------
  // Summary aggregates (FR-025, FR-026) — sums in SQL over NUMERIC (SC-016)
  // -------------------------------------------------------------------------

  totalsByCategory(tripId: string): Promise<CategoryTotal[]> {
    return rlsDb()
      .select({
        categoryId: expenses.categoryId,
        name: expenseCategories.name,
        totalHome: sql<string>`sum(${expenses.amountHome})::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(expenses)
      .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
      .where(
        liveOnly(expenses, eq(expenses.tripId, tripId), eq(expenses.fxPending, false)),
      )
      .groupBy(expenses.categoryId, expenseCategories.name)
      .orderBy(sql`sum(${expenses.amountHome}) DESC`, asc(expenseCategories.name));
  }

  totalsByDay(tripId: string): Promise<DayTotal[]> {
    return rlsDb()
      .select({
        date: expenses.spentAt,
        totalHome: sql<string>`sum(${expenses.amountHome})::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(expenses)
      .where(
        liveOnly(expenses, eq(expenses.tripId, tripId), eq(expenses.fxPending, false)),
      )
      .groupBy(expenses.spentAt)
      .orderBy(asc(expenses.spentAt));
  }

  /** Distinct (currency, rate) pairs frozen on converted rows outside the home currency. */
  ratesApplied(tripId: string, homeCurrency: string): Promise<RateApplied[]> {
    return rlsDb()
      .select({
        currency: sql<string>`trim(${expenses.currency})`,
        rate: sql<string>`${expenses.fxRateToHome}::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(expenses)
      .where(
        liveOnly(
          expenses,
          eq(expenses.tripId, tripId),
          eq(expenses.fxPending, false),
          sql`trim(${expenses.currency}) <> ${homeCurrency}`,
        ),
      )
      .groupBy(expenses.currency, expenses.fxRateToHome)
      .orderBy(asc(expenses.currency), asc(expenses.fxRateToHome));
  }

  pendingByCurrency(tripId: string): Promise<PendingByCurrency[]> {
    return rlsDb()
      .select({
        currency: sql<string>`trim(${expenses.currency})`,
        total: sql<string>`sum(${expenses.amount})::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(expenses)
      .where(
        liveOnly(expenses, eq(expenses.tripId, tripId), eq(expenses.fxPending, true)),
      )
      .groupBy(expenses.currency)
      .orderBy(asc(expenses.currency));
  }
}
