import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Sql } from 'postgres';
import request from 'supertest';

import {
  bearer,
  bootTestApp,
  registerTraveller,
  type RegisteredTraveller,
} from '../support/app';
import { migrationSql } from '../support/db';
import { FOOD, createExpenseFor, createTripFor, seedFxRates } from '../support/expenses';
import { seedGeography } from '../support/geography';

/**
 * Contract test 9 — no expense or document route accepts a visibility
 * parameter (rest-api.md "Contract tests"; FR-027, FR-032) — tasks.md T073.
 *
 * The refusal has to come from the wire format, before any handler runs: a
 * strict schema that does not name the key. The assertions therefore check
 * three things about each write route — a 400, the `VALIDATION_FAILED` code,
 * and that the row on disk was not created or changed — and one thing about
 * the table itself: there is no column such a parameter could have landed in.
 */
const VISIBILITY_KEYS = ['is_public', 'visibility', 'public', 'shared'] as const;

describe('contract 9 — no visibility parameter on expense routes', () => {
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
    tripId = await createTripFor(app, traveller);
  });

  afterAll(async () => {
    await owner?.end();
    await app?.close();
  });

  const auth = () => bearer(traveller.tokens.access_token);
  const server = () => request(app.getHttpServer());

  const expensesOnTrip = async () => {
    const rows = await owner<{ n: string }[]>`
      SELECT count(*)::text AS n FROM expenses WHERE trip_id = ${tripId}::uuid
    `;
    return rows[0]?.n;
  };

  it.each(VISIBILITY_KEYS)('POST /trips/:tripId/expenses refuses `%s`', async (key) => {
    const before = await expensesOnTrip();

    const response = await server()
      .post(`/v1/trips/${tripId}/expenses`)
      .set(auth())
      .send({
        category_id: FOOD,
        amount: '10.00',
        currency: 'CHF',
        spent_at: '2026-06-02',
        [key]: true,
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    expect(await expensesOnTrip()).toBe(before);
  });

  it.each(VISIBILITY_KEYS)('PATCH /expenses/:id refuses `%s`', async (key) => {
    const expense = await createExpenseFor(app, traveller, tripId, { amount: '4.00' });

    const response = await server()
      .patch(`/v1/expenses/${expense.id}`)
      .set(auth())
      .send({ amount: '5.00', [key]: true });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });

    const [row] = await owner<{ amount: string }[]>`
      SELECT amount::text FROM expenses WHERE id = ${expense.id}::uuid
    `;
    expect(row?.amount).toBe('4.00');
  });

  it('GET /trips/:tripId/expenses refuses a visibility filter — there is no public variant', async () => {
    const response = await server()
      .get(`/v1/trips/${tripId}/expenses?is_public=true`)
      .set(auth());

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });

  it('POST /expense-categories refuses a visibility key too', async () => {
    const response = await server()
      .post('/v1/expense-categories')
      .set(auth())
      .send({ name: 'Bribes', is_public: true });

    expect(response.status).toBe(400);
  });

  it('the tables have no column a visibility parameter could land in (FR-027, FR-032)', async () => {
    const columns = await owner<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('expenses', 'documents')
        AND column_name ~* 'public|visib|shared'
    `;
    expect(columns).toEqual([]);
  });

  // Document routes arrive with User Story 5 (T114); the same four keys are
  // asserted against POST /trips/:tripId/documents and PATCH /documents/:id
  // there, alongside adversarial row 4 (T108).
  it.todo(
    'POST /trips/:tripId/documents and PATCH /documents/:id refuse every visibility key (US5)',
  );
});
