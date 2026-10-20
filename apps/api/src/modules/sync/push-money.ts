import { Injectable } from '@nestjs/common';
import {
  CreateExpenseRequest,
  ExpenseCategoryPushRecord,
  ExpensePushRecord,
  compareAmounts,
  convertAmount,
} from '@triptrackr/contracts';
import { and, eq, isNull, ne, or } from 'drizzle-orm';

import { rlsDb } from '@/common/db/rls-db';
import { requireCurrentUserId } from '@/common/rls/rls-context';
import { expenseCategories, expenses } from '@/db/schema';
import { FxService, conversionForEntry } from '@/modules/expenses/fx.service';

import { RecordRefusal } from './push-errors';
import type { PushTableHandler, StoredRow, WriteTimes } from './push-handler';
import { inOwnTrips, requireKnownCity, requireOwnTrip } from './push-scope';

/**
 * `expense_categories` and `expenses` on the push path (tasks.md T128; FR-021,
 * FR-022, FR-024, FR-027; research D-10, D-26, D-29; Constitution I).
 *
 * **Categories.** Custom rows only: the six system rows are reference data with
 * fixed ids (D-29), a push can neither create nor change one — an id that names
 * one is `id_unavailable` like any id that is not the caller's. The owner is the
 * session's, never the record's (`user_id` is not a key of the push shape).
 * A name the traveller already uses on another of their categories — live or
 * deleted: the unique index counts both — is `invalid`, a repair for the device
 * to make by renaming, not an id collision a new id would cure.
 *
 * **Expenses are owner-only, structurally.** The push shape has no visibility
 * key and the strict schema refuses one (FR-027); the table has none and never
 * gets one.
 *
 * **The conversion is frozen at entry and an edit never recomputes it (FR-022).**
 * A new expense stores the device's own conversion when it sent both halves
 * (research D-10), otherwise the server resolves one from the latest snapshot,
 * otherwise the row is stored `fx_pending` — through `conversionForEntry`, the
 * function `POST /trips/:id/expenses` uses. An edit never reaches it: whatever
 * the device sends as a rate on an existing row is ignored, a pending row stays
 * pending for the backfill worker, and a changed amount is converted with the
 * rate already on the row, exactly as `PATCH /expenses/:id` does. `currency` and
 * `trip_id` are fixed at creation — a different currency is a different
 * conversion, so it is a different expense (PatchExpenseRequest) — and a push
 * that changes them has them set back to the stored values.
 */

// ---------------------------------------------------------------------------
// expense_categories
// ---------------------------------------------------------------------------

type CategoryPush = ExpenseCategoryPushRecord;

interface StoredCategory extends StoredRow {
  readonly name: string;
  readonly icon: string | null;
}

@Injectable()
export class ExpenseCategoriesPushHandler implements PushTableHandler<
  CategoryPush,
  StoredCategory
> {
  readonly table = 'expense_categories' as const;
  readonly schema = ExpenseCategoryPushRecord;
  readonly creates = true;

  async lock(id: string): Promise<StoredCategory | null> {
    const [row] = await rlsDb()
      .select({
        id: expenseCategories.id,
        updatedAt: expenseCategories.updatedAt,
        deletedAt: expenseCategories.deletedAt,
        name: expenseCategories.name,
        icon: expenseCategories.icon,
      })
      .from(expenseCategories)
      // The caller's own custom rows. A system row (user_id NULL) is visible to
      // everyone and owned by no one; it is not "stored" for a push.
      .where(
        and(
          eq(expenseCategories.id, id),
          eq(expenseCategories.userId, requireCurrentUserId()),
        ),
      )
      .limit(1)
      .for('update');

    return row ?? null;
  }

  effective(_stored: StoredCategory, incoming: CategoryPush): CategoryPush {
    return incoming;
  }

  samePayload(stored: StoredCategory, incoming: CategoryPush): boolean {
    return stored.name === incoming.name && stored.icon === incoming.icon;
  }

  async checkReferences(incoming: CategoryPush): Promise<void> {
    if (incoming.deleted) return;

    const [taken] = await rlsDb()
      .select({ id: expenseCategories.id })
      .from(expenseCategories)
      .where(
        and(
          eq(expenseCategories.userId, requireCurrentUserId()),
          eq(expenseCategories.name, incoming.name),
          ne(expenseCategories.id, incoming.id),
        ),
      )
      .limit(1);

    if (taken) throw new RecordRefusal('invalid');
  }

  async insert(incoming: CategoryPush, at: WriteTimes): Promise<boolean> {
    const rows = await rlsDb()
      .insert(expenseCategories)
      .values({
        id: incoming.id,
        userId: requireCurrentUserId(),
        name: incoming.name,
        icon: incoming.icon,
        updatedAt: at.updatedAt,
        deletedAt: incoming.deleted ? at.deletedAt : null,
      })
      .onConflictDoNothing()
      .returning({ id: expenseCategories.id });

    return rows.length > 0;
  }

  async update(
    stored: StoredCategory,
    incoming: CategoryPush,
    at: WriteTimes,
  ): Promise<void> {
    await rlsDb()
      .update(expenseCategories)
      .set({ name: incoming.name, icon: incoming.icon, updatedAt: at.updatedAt })
      .where(
        and(
          eq(expenseCategories.id, stored.id),
          eq(expenseCategories.userId, requireCurrentUserId()),
        ),
      );
  }

  async tombstone(stored: StoredCategory, at: WriteTimes): Promise<void> {
    await rlsDb()
      .update(expenseCategories)
      .set({ deletedAt: at.deletedAt, updatedAt: at.updatedAt })
      .where(
        and(
          eq(expenseCategories.id, stored.id),
          eq(expenseCategories.userId, requireCurrentUserId()),
        ),
      );
  }
}

// ---------------------------------------------------------------------------
// expenses
// ---------------------------------------------------------------------------

/**
 * The contracts' push shape, plus the one rule the REST create states on top of
 * it: a client conversion is both halves or neither
 * (`CreateExpenseRequest`'s refine). Asked of that very schema, so the two
 * entry points cannot disagree about what a client conversion looks like.
 */
const ExpensePushWithConversionRule = ExpensePushRecord.refine(
  (record) =>
    CreateExpenseRequest.safeParse({
      id: record.id,
      city_id: record.city_id,
      category_id: record.category_id,
      amount: record.amount,
      currency: record.currency,
      spent_at: record.spent_at,
      note: record.note,
      fx_rate_to_home: record.fx_rate_to_home,
      amount_home: record.amount_home,
    }).success,
  { message: 'A client conversion needs both the rate and the converted amount' },
);

type ExpensePush = ExpensePushRecord;

interface StoredExpense extends StoredRow {
  readonly tripId: string;
  readonly cityId: number | null;
  readonly categoryId: string;
  readonly amount: string;
  readonly currency: string;
  readonly fxRateToHome: string | null;
  readonly spentAt: string;
  readonly note: string | null;
}

@Injectable()
export class ExpensesPushHandler implements PushTableHandler<ExpensePush, StoredExpense> {
  readonly table = 'expenses' as const;
  readonly schema = ExpensePushWithConversionRule;
  readonly creates = true;

  constructor(private readonly fx: FxService) {}

  async lock(id: string): Promise<StoredExpense | null> {
    const [row] = await rlsDb()
      .select({
        id: expenses.id,
        updatedAt: expenses.updatedAt,
        deletedAt: expenses.deletedAt,
        tripId: expenses.tripId,
        cityId: expenses.cityId,
        categoryId: expenses.categoryId,
        amount: expenses.amount,
        currency: expenses.currency,
        fxRateToHome: expenses.fxRateToHome,
        spentAt: expenses.spentAt,
        note: expenses.note,
      })
      .from(expenses)
      .where(and(eq(expenses.id, id), inOwnTrips(expenses.tripId)))
      .limit(1)
      .for('update');

    return row ?? null;
  }

  effective(stored: StoredExpense, incoming: ExpensePush): ExpensePush {
    return { ...incoming, trip_id: stored.tripId, currency: stored.currency.trim() };
  }

  samePayload(stored: StoredExpense, incoming: ExpensePush): boolean {
    return (
      stored.cityId === incoming.city_id &&
      stored.categoryId === incoming.category_id &&
      compareAmounts(stored.amount, incoming.amount) === 0 &&
      stored.spentAt === incoming.spent_at &&
      stored.note === incoming.note
    );
  }

  async checkReferences(incoming: ExpensePush): Promise<void> {
    if (incoming.deleted) {
      await requireOwnTrip(incoming.trip_id, { live: false });
      return;
    }

    await requireOwnTrip(incoming.trip_id, { live: true });
    await this.requireCategory(incoming.category_id);
    await requireKnownCity(incoming.city_id);
  }

  async insert(incoming: ExpensePush, at: WriteTimes): Promise<boolean> {
    const trip = await requireOwnTrip(incoming.trip_id, { live: !incoming.deleted });
    const conversion = await conversionForEntry(incoming, () =>
      this.fx.convert(incoming.amount, incoming.currency, trip.homeCurrency),
    );

    const rows = await rlsDb()
      .insert(expenses)
      .values({
        id: incoming.id,
        tripId: incoming.trip_id,
        cityId: incoming.city_id,
        categoryId: incoming.category_id,
        amount: incoming.amount,
        currency: incoming.currency,
        spentAt: incoming.spent_at,
        note: incoming.note,
        fxRateToHome: conversion?.fxRateToHome ?? null,
        amountHome: conversion?.amountHome ?? null,
        fxPending: conversion === null,
        updatedAt: at.updatedAt,
        deletedAt: incoming.deleted ? at.deletedAt : null,
      })
      .onConflictDoNothing()
      .returning({ id: expenses.id });

    return rows.length > 0;
  }

  async update(
    stored: StoredExpense,
    incoming: ExpensePush,
    at: WriteTimes,
  ): Promise<void> {
    // FR-022: the stored rate is the rate. A new amount is converted with it; a
    // pending row stays pending; nothing the device sent about the conversion is read.
    const amountChanged = compareAmounts(stored.amount, incoming.amount) !== 0;
    const amountHome =
      amountChanged && stored.fxRateToHome !== null
        ? convertAmount(incoming.amount, stored.fxRateToHome)
        : undefined;

    await rlsDb()
      .update(expenses)
      .set({
        cityId: incoming.city_id,
        categoryId: incoming.category_id,
        amount: incoming.amount,
        ...(amountHome !== undefined && { amountHome }),
        spentAt: incoming.spent_at,
        note: incoming.note,
        updatedAt: at.updatedAt,
      })
      .where(and(eq(expenses.id, stored.id), inOwnTrips(expenses.tripId)));
  }

  async tombstone(stored: StoredExpense, at: WriteTimes): Promise<void> {
    await rlsDb()
      .update(expenses)
      .set({ deletedAt: at.deletedAt, updatedAt: at.updatedAt })
      .where(and(eq(expenses.id, stored.id), inOwnTrips(expenses.tripId)));
  }

  /**
   * A live category the caller may file under: a system row or their own. The
   * policy already hides everyone else's; naming the owner as well keeps
   * "visible" from ever meaning "readable by anyone".
   */
  private async requireCategory(categoryId: string): Promise<void> {
    const rows = await rlsDb()
      .select({ id: expenseCategories.id })
      .from(expenseCategories)
      .where(
        and(
          eq(expenseCategories.id, categoryId),
          isNull(expenseCategories.deletedAt),
          or(
            isNull(expenseCategories.userId),
            eq(expenseCategories.userId, requireCurrentUserId()),
          ),
        ),
      )
      .limit(1);

    if (rows.length === 0) throw new RecordRefusal('parent_missing');
  }
}
