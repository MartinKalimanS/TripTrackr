import type { NestExpressApplication } from '@nestjs/platform-express';
import { ExpensesResponse, SYSTEM_EXPENSE_CATEGORIES } from '@triptrackr/contracts';
import request from 'supertest';

import {
  bearer,
  bootTestApp,
  registerTraveller,
  type RegisteredTraveller,
} from '../support/app';
import { createExpenseFor, createTripFor, seedFxRates } from '../support/expenses';
import { createHarness, type Harness } from '../integration/harness';

/**
 * Adversarial suite rows 1, 2 and 3 — B reads A's expenses by trip id, by
 * direct expense id, and through the summary (contracts/data-access-policy.md
 * §4; FR-027, SC-012) — tasks.md T077.
 *
 * Written as B, against A, twice over:
 *
 *   - **At the database, through the API role.** This is the authority. The
 *     policy `expenses_owner_only` (0005) has no public-read counterpart, so
 *     the rows must be absent for B whatever the request path does.
 *   - **Over HTTP, through the routes the story ships.** Every route answers
 *     B exactly as it would answer a request for a trip that does not exist —
 *     the same not-found, the same body — so the existence of A's trip is not
 *     disclosed either (contracts/README.md rule 1).
 *
 * The positive controls — A sees A's rows — are what make "empty" meaningful:
 * a table that returned nothing to anyone would pass every refusal here.
 */
const FOOD = SYSTEM_EXPENSE_CATEGORIES[0].id;

describe('privacy — expenses are unreachable by any route but the owner’s (rows 1–3)', () => {
  describe('at the database, as the API role', () => {
    let harness: Harness;
    let A: string;
    let B: string;
    let expenseId: string;

    beforeAll(async () => {
      harness = await createHarness();
      A = harness.accountA.id;
      B = harness.accountB.id;

      // Three expenses on A's PUBLIC trip — the fixture the suite specifies.
      // Public trip on purpose: a public trip is the case where a leak would
      // be plausible, because the trip itself is readable by B.
      const rows = await harness.owner<{ id: string }[]>`
        INSERT INTO expenses (trip_id, category_id, amount, currency, spent_at)
        VALUES
          (${harness.accountA.publicTripId}::uuid, ${FOOD}::uuid, 12.50, 'CHF', '2026-06-02'),
          (${harness.accountA.publicTripId}::uuid, ${FOOD}::uuid, 8.00, 'EUR', '2026-06-03'),
          (${harness.accountA.publicTripId}::uuid, ${FOOD}::uuid, 3.20, 'CHF', '2026-06-04')
        RETURNING id
      `;
      expenseId = rows[0]!.id;
    });

    afterAll(async () => {
      await harness?.close();
    });

    it('row 1: B reading A’s expenses by trip id gets nothing, even on A’s public trip', async () => {
      const asB = await harness.asUser(
        B,
        (tx) =>
          tx`SELECT id FROM expenses WHERE trip_id = ${harness.accountA.publicTripId}::uuid`,
      );
      expect(asB).toHaveLength(0);

      // B can see the public trip itself — so the emptiness above is the
      // policy on `expenses`, not on `trips`.
      const trip = await harness.asUser(
        B,
        (tx) =>
          tx`SELECT id FROM trips WHERE id = ${harness.accountA.publicTripId}::uuid`,
      );
      expect(trip).toHaveLength(1);
    });

    it('row 2: B reading A’s expense by its direct id gets nothing', async () => {
      const asB = await harness.asUser(
        B,
        (tx) => tx`SELECT id, amount FROM expenses WHERE id = ${expenseId}::uuid`,
      );
      expect(asB).toHaveLength(0);
    });

    it('row 3: B aggregating A’s expenses sums nothing — no summary can be built', async () => {
      const asB = await harness.asUser(
        B,
        (tx) => tx<{ total: string | null; n: string }[]>`
          SELECT sum(amount)::text AS total, count(*)::text AS n
          FROM expenses WHERE trip_id = ${harness.accountA.publicTripId}::uuid
        `,
      );
      expect(asB[0]).toEqual({ total: null, n: '0' });
    });

    it('positive control: A sees all three of A’s expenses', async () => {
      const asA = await harness.asUser(
        A,
        (tx) =>
          tx`SELECT id FROM expenses WHERE trip_id = ${harness.accountA.publicTripId}::uuid`,
      );
      expect(asA).toHaveLength(3);
    });
  });

  describe('over HTTP, through the story’s routes', () => {
    let app: NestExpressApplication;
    let a: RegisteredTraveller;
    let b: RegisteredTraveller;
    let tripId: string;
    let expenseId: string;

    beforeAll(async () => {
      app = await bootTestApp();
      const harness = await createHarness();
      await seedFxRates(harness.owner);
      await harness.close();

      a = await registerTraveller(app);
      b = await registerTraveller(app);
      tripId = await createTripFor(app, a, 'CHF', 'A’s trip');
      // Made public, so that B can reach the trip and still not the money.
      await request(app.getHttpServer())
        .patch(`/v1/trips/${tripId}`)
        .set(bearer(a.tokens.access_token))
        .send({ is_public: true });
      expenseId = (await createExpenseFor(app, a, tripId, { amount: '12.50' })).id;
    });

    afterAll(async () => {
      await app?.close();
    });

    const asB = () => bearer(b.tokens.access_token);
    const server = () => request(app.getHttpServer());
    const ghost = '00000000-0000-4000-8000-00000000dead';

    it('row 1: GET /trips/:tripId/expenses answers B exactly as for a trip that does not exist', async () => {
      const theirs = await server().get(`/v1/trips/${tripId}/expenses`).set(asB());
      const nothing = await server().get(`/v1/trips/${ghost}/expenses`).set(asB());

      expect(theirs.status).toBe(404);
      expect(theirs.body).toEqual(nothing.body);
      expect(JSON.stringify(theirs.body)).not.toMatch(/12\.50|CHF/);
    });

    it('row 2: PATCH and DELETE /expenses/:id answer B as not-found and change nothing', async () => {
      const patched = await server()
        .patch(`/v1/expenses/${expenseId}`)
        .set(asB())
        .send({ amount: '0.01' });
      const deleted = await server().delete(`/v1/expenses/${expenseId}`).set(asB());
      const missing = await server()
        .patch(`/v1/expenses/${ghost}`)
        .set(asB())
        .send({ amount: '0.01' });

      expect(patched.status).toBe(404);
      expect(deleted.status).toBe(404);
      expect(patched.body).toEqual(missing.body);

      const still = await server()
        .get(`/v1/trips/${tripId}/expenses`)
        .set(bearer(a.tokens.access_token));
      expect(ExpensesResponse.parse(still.body).expenses.map((e) => e.amount)).toEqual([
        '12.50',
      ]);
    });

    it('row 3: GET /trips/:tripId/expenses/summary is refused for B with the same not-found', async () => {
      const theirs = await server()
        .get(`/v1/trips/${tripId}/expenses/summary`)
        .set(asB());
      const nothing = await server()
        .get(`/v1/trips/${ghost}/expenses/summary`)
        .set(asB());

      expect(theirs.status).toBe(404);
      expect(theirs.body).toEqual(nothing.body);
    });

    it('B cannot create an expense on A’s trip either', async () => {
      const response = await server()
        .post(`/v1/trips/${tripId}/expenses`)
        .set(asB())
        .send({
          category_id: FOOD,
          amount: '1.00',
          currency: 'CHF',
          spent_at: '2026-06-02',
        });

      expect(response.status).toBe(404);
    });
  });
});
