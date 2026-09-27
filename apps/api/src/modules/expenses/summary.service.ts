import { Injectable } from '@nestjs/common';
import type { ExpenseSummary } from '@triptrackr/contracts';

import { loadEnv } from '@/common/config/env.schema';
import { TripsService } from '@/modules/trips/trips.service';

import { ExpensesRepository } from './expenses.repository';
import { sumAmounts } from '@triptrackr/contracts';

/**
 * `GET /trips/:tripId/expenses/summary` (rest-api.md §7; FR-025, FR-026;
 * SC-016) — tasks.md T083.
 *
 * Every total is a `NUMERIC` sum computed by PostgreSQL over the frozen
 * `amount_home` of converted rows — exact by construction — and the grand
 * total is the same rows summed once more through `decimal.js` (research
 * D-26), so by-category, by-day and total reconcile to the cent. Rows still
 * awaiting a rate are reported separately by their own currency rather than
 * folded in or dropped (FR-026, Constitution II).
 *
 * `rates_applied` lists the distinct `(currency, rate)` pairs actually frozen
 * on rows outside the home currency; a single-currency trip discloses none.
 * `rates_source` names the feed (research D-28).
 */
@Injectable()
export class SummaryService {
  constructor(
    private readonly repository: ExpensesRepository,
    private readonly trips: TripsService,
  ) {}

  async forTrip(tripId: string): Promise<ExpenseSummary> {
    const trip = await this.trips.loadOwned(tripId);

    const [byCategory, byDay, rates, pending] = await Promise.all([
      this.repository.totalsByCategory(tripId),
      this.repository.totalsByDay(tripId),
      this.repository.ratesApplied(tripId, trip.home_currency),
      this.repository.pendingByCurrency(tripId),
    ]);

    return {
      home_currency: trip.home_currency,
      total_home: sumAmounts(byDay.map((day) => day.totalHome)),
      by_category: byCategory.map((row) => ({
        category_id: row.categoryId,
        name: row.name,
        total_home: row.totalHome,
        count: row.count,
      })),
      by_day: byDay.map((row) => ({
        date: row.date,
        total_home: row.totalHome,
        count: row.count,
      })),
      rates_applied: rates.map((row) => ({
        currency: row.currency,
        rate: row.rate,
        count: row.count,
      })),
      rates_source: loadEnv().FX_RATES_SOURCE,
      pending_conversion: {
        count: pending.reduce((total, row) => total + row.count, 0),
        by_currency: pending.map((row) => ({
          currency: row.currency,
          total: row.total,
          count: row.count,
        })),
      },
    };
  }
}
