import type { NestExpressApplication } from '@nestjs/platform-express';
import { ExpenseResponse } from '@triptrackr/contracts';
import type { Sql } from 'postgres';
import request from 'supertest';

import {
  bearer,
  bootTestApp,
  registerTraveller,
  type RegisteredTraveller,
} from '../support/app';
import { migrationSql } from '../support/db';
import {
  FOOD,
  LODGING,
  createExpenseFor,
  createTripFor,
  seedFxRates,
} from '../support/expenses';
import { seedGeography } from '../support/geography';

/**
 * FR-021, FR-022 — the rate is resolved and frozen at entry; an edit never
 * recomputes it — tasks.md T074.
 *
 * The currencies are private to this file (`XFH` home, `XFE` spend — both in
 * ISO 4217's X-range, which no feed quotes) because every spec shares one
 * `fx_rates` table and this one deliberately installs a SECOND, newer
 * snapshot with very different rates. Private codes keep that move from
 * changing what another file's expense converts at.
 *
 * Snapshot one makes XFE→XFH = 0.80 / 0.90 = 0.888889. The newer snapshot is
 * then installed and the expense is edited in every way the contract allows:
 * the stored rate must not move, and the converted amount must follow the
 * amount using that stored rate and nothing else.
 */
const HOME = 'XFH';
const SPEND = 'XFE';

describe('expenses — the rate is frozen at entry (FR-022)', () => {
  let app: NestExpressApplication;
  let owner: Sql;
  let traveller: RegisteredTraveller;
  let tripId: string;

  beforeAll(async () => {
    app = await bootTestApp();
    owner = migrationSql();
    await seedGeography(owner);
    await seedFxRates(owner, '2026-05-01', { [SPEND]: '0.900000', [HOME]: '0.800000' });
    traveller = await registerTraveller(app);
    tripId = await createTripFor(app, traveller, HOME);
  });

  afterAll(async () => {
    await owner?.end();
    await app?.close();
  });

  const auth = () => bearer(traveller.tokens.access_token);
  const server = () => request(app.getHttpServer());

  it('resolves the cross rate through USD at entry and precomputes amount_home (FR-021)', async () => {
    const expense = await createExpenseFor(app, traveller, tripId, {
      amount: '9.00',
      currency: SPEND,
    });

    expect(expense.fx_rate_to_home).toBe('0.888889');
    // 9.00 × 0.888889 = 8.000001 → 8.00, half-up to two places.
    expect(expense.amount_home).toBe('8.00');
    expect(expense.fx_pending).toBe(false);
  });

  it('keeps the entry rate when the market moves and the expense is edited', async () => {
    const expense = await createExpenseFor(app, traveller, tripId, {
      amount: '10.00',
      currency: SPEND,
    });
    expect(expense.fx_rate_to_home).toBe('0.888889');

    // A newer snapshot: the spend currency now much weaker. A fresh expense
    // would convert at 0.5; this one must not.
    await seedFxRates(owner, '2026-06-30', { [SPEND]: '1.000000', [HOME]: '0.500000' });

    const amountChanged = await server()
      .patch(`/v1/expenses/${expense.id}`)
      .set(auth())
      .send({ amount: '20.00' });
    expect(amountChanged.status).toBe(200);
    expect(ExpenseResponse.parse(amountChanged.body).expense).toMatchObject({
      amount: '20.00',
      fx_rate_to_home: '0.888889',
      // 20.00 × 0.888889 = 17.77778 → 17.78, with the FROZEN rate.
      amount_home: '17.78',
    });

    const otherFields = await server()
      .patch(`/v1/expenses/${expense.id}`)
      .set(auth())
      .send({ category_id: LODGING, spent_at: '2026-06-05', note: 'Hotel, actually' });
    expect(otherFields.status).toBe(200);
    expect(ExpenseResponse.parse(otherFields.body).expense).toMatchObject({
      category_id: LODGING,
      spent_at: '2026-06-05',
      note: 'Hotel, actually',
      fx_rate_to_home: '0.888889',
      amount_home: '17.78',
    });

    // The row agrees with the response — nothing recomputed behind it.
    const [row] = await owner<{ fx_rate_to_home: string; amount_home: string }[]>`
      SELECT fx_rate_to_home::text, amount_home::text FROM expenses WHERE id = ${expense.id}::uuid
    `;
    expect(row).toEqual({ fx_rate_to_home: '0.888889', amount_home: '17.78' });

    // A brand-new expense DOES see the newer snapshot — the freeze is per row.
    const fresh = await createExpenseFor(app, traveller, tripId, {
      amount: '10.00',
      currency: SPEND,
      category_id: FOOD,
    });
    expect(fresh.fx_rate_to_home).toBe('0.500000');
    expect(fresh.amount_home).toBe('5.00');
  });

  it('refuses to change the currency — a different currency is a new expense (FR-022)', async () => {
    const expense = await createExpenseFor(app, traveller, tripId, {
      amount: '3.00',
      currency: SPEND,
    });

    const response = await server()
      .patch(`/v1/expenses/${expense.id}`)
      .set(auth())
      .send({ currency: 'JPY' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });

  it('refuses a client-supplied rate on a patch as well', async () => {
    const expense = await createExpenseFor(app, traveller, tripId, {
      amount: '3.00',
      currency: HOME,
    });

    const response = await server()
      .patch(`/v1/expenses/${expense.id}`)
      .set(auth())
      .send({ fx_rate_to_home: '2.000000', amount_home: '6.00' });

    expect(response.status).toBe(400);
  });

  it('refuses a category the caller cannot see as a validation problem, not a database error', async () => {
    const stranger = await registerTraveller(app);
    const theirs = await server()
      .post('/v1/expense-categories')
      .set(bearer(stranger.tokens.access_token))
      .send({ name: 'Their secret category' });
    expect(theirs.status).toBe(201);
    const foreignCategoryId = (theirs.body as { category: { id: string } }).category.id;

    const response = await server()
      .post(`/v1/trips/${tripId}/expenses`)
      .set(auth())
      .send({
        category_id: foreignCategoryId,
        amount: '1.00',
        currency: HOME,
        spent_at: '2026-06-02',
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    expect(JSON.stringify(response.body)).not.toMatch(/foreign key|constraint|violates/i);
  });
});
