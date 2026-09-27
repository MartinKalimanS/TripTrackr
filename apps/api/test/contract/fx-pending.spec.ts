import type { NestExpressApplication } from '@nestjs/platform-express';
import { ExpenseResponse, ExpenseSummary, ExpensesResponse } from '@triptrackr/contracts';
import type { Sql } from 'postgres';
import request from 'supertest';

import {
  bearer,
  bootTestApp,
  registerTraveller,
  type RegisteredTraveller,
} from '../support/app';
import { migrationSql } from '../support/db';
import { FOOD, createTripFor, seedFxRates } from '../support/expenses';
import { seedGeography } from '../support/geography';

/**
 * Contract test 12 — an expense with no available rate is stored with
 * `fx_pending`, not rejected (rest-api.md §7; FR-020, Constitution II) —
 * tasks.md T075.
 *
 * `XTS` is ISO 4217's code reserved for testing; no feed will ever quote it,
 * so it is the one currency guaranteed to have no rate whatever snapshot the
 * other suites seeded.
 */
describe('contract 12 — no rate means fx_pending, never a refusal', () => {
  let app: NestExpressApplication;
  let owner: Sql;
  let traveller: RegisteredTraveller;
  let tripId: string;

  beforeAll(async () => {
    app = await bootTestApp();
    owner = migrationSql();
    await seedGeography(owner);
    await seedFxRates(owner);
    traveller = await registerTraveller(app);
    tripId = await createTripFor(app, traveller, 'CHF');
  });

  afterAll(async () => {
    await owner?.end();
    await app?.close();
  });

  const auth = () => bearer(traveller.tokens.access_token);
  const server = () => request(app.getHttpServer());

  it('stores the expense with the original amount and no conversion, flagged pending', async () => {
    const response = await server()
      .post(`/v1/trips/${tripId}/expenses`)
      .set(auth())
      .send({
        category_id: FOOD,
        amount: '250000.00',
        currency: 'XTS',
        spent_at: '2026-06-03',
      });

    expect(response.status).toBe(201);
    const { expense } = ExpenseResponse.parse(response.body);
    expect(expense).toMatchObject({
      amount: '250000.00',
      currency: 'XTS',
      fx_rate_to_home: null,
      amount_home: null,
      fx_pending: true,
    });

    const listed = await server().get(`/v1/trips/${tripId}/expenses`).set(auth());
    expect(ExpensesResponse.parse(listed.body).expenses.map((e) => e.id)).toContain(
      expense.id,
    );
  });

  it('an expense in the home currency converts at 1 with no feed involved', async () => {
    const response = await server()
      .post(`/v1/trips/${tripId}/expenses`)
      .set(auth())
      .send({
        category_id: FOOD,
        amount: '12.30',
        currency: 'CHF',
        spent_at: '2026-06-03',
      });

    expect(response.status).toBe(201);
    expect(ExpenseResponse.parse(response.body).expense).toMatchObject({
      fx_rate_to_home: '1.000000',
      amount_home: '12.30',
      fx_pending: false,
    });
  });

  it('the summary reports the pending row by its own currency rather than dropping it', async () => {
    const response = await server()
      .get(`/v1/trips/${tripId}/expenses/summary`)
      .set(auth());

    expect(response.status).toBe(200);
    const summary = ExpenseSummary.parse(response.body);
    expect(summary.pending_conversion.count).toBeGreaterThanOrEqual(1);
    expect(summary.pending_conversion.by_currency).toContainEqual({
      currency: 'XTS',
      total: '250000.00',
      count: 1,
    });
    // And the pending amount is not silently folded into the home total.
    expect(summary.total_home).toBe('12.30');
  });

  it('a client that converted from its own cached snapshot has that conversion stored as sent (D-10)', async () => {
    const response = await server()
      .post(`/v1/trips/${tripId}/expenses`)
      .set(auth())
      .send({
        category_id: FOOD,
        amount: '100.00',
        currency: 'XTS',
        spent_at: '2026-06-03',
        fx_rate_to_home: '0.012345',
        amount_home: '1.23',
      });

    expect(response.status).toBe(201);
    expect(ExpenseResponse.parse(response.body).expense).toMatchObject({
      fx_rate_to_home: '0.012345',
      amount_home: '1.23',
      fx_pending: false,
    });
  });
});
