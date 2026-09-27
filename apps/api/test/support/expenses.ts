import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  ExpenseResponse,
  SYSTEM_EXPENSE_CATEGORIES,
  TripResponse,
  type Expense,
} from '@triptrackr/contracts';
import type { Sql } from 'postgres';
import request from 'supertest';

import { bearer, type RegisteredTraveller } from './app';

/**
 * Shared fixtures for the expense suites.
 *
 * Rates are seeded through the owner connection because `fx_rates` is
 * reference data — unpoliced, refreshed by the worker, read by everyone
 * (data-model.md §6). Every suite that needs a conversion seeds the SAME
 * USD-based snapshot so a cross rate computed in one file means the same
 * thing in another: EUR→CHF is 0.80 / 0.90 = 0.888889 everywhere.
 */

export const FX = {
  asOf: '2026-05-01',
  /** How many of each one USD buys. */
  usd: { USD: '1', EUR: '0.900000', CHF: '0.800000', JPY: '150.000000' },
} as const;

export const FOOD = SYSTEM_EXPENSE_CATEGORIES[0].id;
export const LODGING = SYSTEM_EXPENSE_CATEGORIES[1].id;
export const TRANSPORT = SYSTEM_EXPENSE_CATEGORIES[2].id;

/** Idempotent. `as_of` is part of the key, so a second seed of the same day is a no-op. */
export async function seedFxRates(
  owner: Sql,
  asOf: string = FX.asOf,
  rates: Readonly<Record<string, string>> = FX.usd,
): Promise<void> {
  for (const [quote, rate] of Object.entries(rates)) {
    await owner`
      INSERT INTO fx_rates (base_currency, quote_currency, rate, as_of)
      VALUES ('USD', ${quote}, ${rate}::numeric, ${asOf}::date)
      ON CONFLICT (base_currency, quote_currency, as_of) DO UPDATE SET rate = EXCLUDED.rate
    `;
  }
}

export async function createTripFor(
  app: NestExpressApplication,
  traveller: RegisteredTraveller,
  homeCurrency = 'CHF',
  title = 'Expense trip',
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/v1/trips')
    .set(bearer(traveller.tokens.access_token))
    .send({ title, home_currency: homeCurrency });
  if (response.status !== 201) {
    throw new Error(
      `Trip fixture failed: ${response.status} ${JSON.stringify(response.body)}`,
    );
  }
  return TripResponse.parse(response.body).trip.id;
}

export async function createExpenseFor(
  app: NestExpressApplication,
  traveller: RegisteredTraveller,
  tripId: string,
  body: Record<string, unknown>,
): Promise<Expense> {
  const response = await request(app.getHttpServer())
    .post(`/v1/trips/${tripId}/expenses`)
    .set(bearer(traveller.tokens.access_token))
    .send({ category_id: FOOD, currency: 'CHF', spent_at: '2026-06-02', ...body });
  if (response.status !== 201) {
    throw new Error(
      `Expense fixture failed: ${response.status} ${JSON.stringify(response.body)}`,
    );
  }
  return ExpenseResponse.parse(response.body).expense;
}
