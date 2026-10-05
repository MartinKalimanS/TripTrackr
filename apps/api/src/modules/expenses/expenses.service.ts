import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  CreateExpenseRequest,
  Expense,
  ListExpensesQuery,
  PatchExpenseRequest,
} from '@triptrackr/contracts';

import { apiError, notFound } from '@/common/errors/api-error';
import { TripsService } from '@/modules/trips/trips.service';

import { ExpensesRepository, type ExpenseRow } from './expenses.repository';
import { convertAmount } from '@triptrackr/contracts';
import { FxService, conversionForEntry } from './fx.service';

/** The one not-found for every `/expenses/:id` route — contracts/README.md rule 1. */
export const expenseNotFound = () => notFound('EXPENSE_NOT_FOUND', 'Expense');

const VALIDATION_MESSAGE =
  'Some of the information provided is not valid. Please check it and try again.';

function validationFailed(path: string, message: string) {
  return apiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', VALIDATION_MESSAGE, {
    issues: [{ path, message }],
  });
}

/**
 * Expenses (rest-api.md §7; FR-020, FR-021, FR-022). Access rule: owner,
 * structurally — there is no public variant of any route here and no
 * public-read policy on the table (FR-027, Constitution I).
 *
 * Every trip-scoped operation begins by loading the trip through the owner
 * view, so a stranger's request against someone else's trip is refused as
 * `TRIP_NOT_FOUND` — identical to a trip that does not exist — before any
 * expense is looked at. Row-scoped operations rely on the policy: an update
 * or delete of a row the caller cannot see matches nothing and is
 * `EXPENSE_NOT_FOUND`, the same answer as for a row that never existed.
 *
 * The rate is resolved once, at entry, and frozen (FR-021, FR-022): a client
 * conversion is stored as sent (research D-10); otherwise the server resolves
 * one from the latest snapshot; and if it cannot, the row is stored
 * `fx_pending` rather than refused (Constitution II). A patch never touches
 * the rate — a changed amount is converted with the rate already on the row.
 */
@Injectable()
export class ExpensesService {
  constructor(
    private readonly repository: ExpensesRepository,
    private readonly trips: TripsService,
    private readonly fx: FxService,
  ) {}

  async list(tripId: string, query: ListExpensesQuery): Promise<Expense[]> {
    await this.trips.loadOwned(tripId);
    const rows = await this.repository.listForTrip(tripId, query);
    return rows.map(toExpense);
  }

  async create(tripId: string, request: CreateExpenseRequest): Promise<Expense> {
    const trip = await this.trips.loadOwned(tripId);

    // A replayed create is the same create (research D-15).
    if (request.id) {
      const existing = await this.repository.findLive(request.id);
      if (existing?.tripId === tripId) return toExpense(existing);
    }

    await this.assertReferences(request.city_id, request.category_id);

    const conversion = await conversionForEntry(request, () =>
      this.fx.convert(request.amount, request.currency, trip.home_currency),
    );

    const row = await this.repository.insert({
      id: request.id,
      tripId,
      cityId: request.city_id,
      categoryId: request.category_id,
      amount: request.amount,
      currency: request.currency,
      spentAt: request.spent_at,
      note: request.note,
      fxRateToHome: conversion?.fxRateToHome ?? null,
      amountHome: conversion?.amountHome ?? null,
      fxPending: conversion === null,
    });

    if (!row) {
      throw apiError(
        HttpStatus.CONFLICT,
        'EXPENSE_ID_UNAVAILABLE',
        'That expense id is already in use. Please retry with a new id.',
      );
    }

    return toExpense(row);
  }

  async patch(expenseId: string, patch: PatchExpenseRequest): Promise<Expense> {
    const current = await this.repository.findLive(expenseId);
    if (!current) throw expenseNotFound();

    await this.assertReferences(patch.city_id ?? null, patch.category_id);

    // FR-022: the stored rate is the rate. A new amount is converted with it;
    // a pending row stays pending until the worker backfills it.
    const amountHome =
      patch.amount !== undefined && current.fxRateToHome !== null
        ? convertAmount(patch.amount, current.fxRateToHome)
        : undefined;

    const row = await this.repository.update(expenseId, {
      cityId: patch.city_id,
      categoryId: patch.category_id,
      amount: patch.amount,
      amountHome,
      spentAt: patch.spent_at,
      note: patch.note,
    });
    if (!row) throw expenseNotFound();

    return toExpense(row);
  }

  async remove(expenseId: string): Promise<void> {
    const deleted = await this.repository.tombstone(expenseId);
    if (!deleted) throw expenseNotFound();
  }

  /**
   * Unknown cities and unseen categories are refused as validation problems
   * before any statement runs — a foreign-key violation would poison the
   * request transaction (0008's header) and read as a database error (FR-072).
   */
  private async assertReferences(
    cityId: number | null | undefined,
    categoryId: string | undefined,
  ): Promise<void> {
    if (cityId != null && !(await this.repository.cityExists(cityId))) {
      throw validationFailed('city_id', 'Unknown city');
    }
    if (
      categoryId !== undefined &&
      !(await this.repository.categoryVisible(categoryId))
    ) {
      throw validationFailed('category_id', 'Unknown category');
    }
  }
}

/** Row → wire shape (contracts/api/expenses.ts `Expense`). */
export function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    trip_id: row.tripId,
    city_id: row.cityId,
    category_id: row.categoryId,
    amount: row.amount,
    currency: row.currency.trim(),
    spent_at: row.spentAt,
    note: row.note,
    fx_rate_to_home: row.fxRateToHome,
    amount_home: row.amountHome,
    fx_pending: row.fxPending,
  };
}
