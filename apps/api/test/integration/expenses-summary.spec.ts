import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  ExpenseCategoriesResponse,
  ExpenseCategoryResponse,
  ExpenseSummary,
  ExpensesResponse,
  SYSTEM_EXPENSE_CATEGORIES,
  isSystemExpenseCategory,
} from '@triptrackr/contracts';
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
  TRANSPORT,
  createExpenseFor,
  createTripFor,
  seedFxRates,
} from '../support/expenses';
import { CITY, seedGeography } from '../support/geography';

/**
 * FR-023 to FR-026 — categories, the list filters, and the spending summary
 * that reconciles exactly in the home currency (SC-016) — tasks.md T076.
 *
 * Independent Test for User Story 2: three expenses in two currencies, totals
 * correct in the home currency, applied rates disclosed.
 */
describe('expenses — categories, list, summary', () => {
  let app: NestExpressApplication;
  let owner: Sql;
  let traveller: RegisteredTraveller;

  beforeAll(async () => {
    app = await bootTestApp();
    owner = migrationSql();
    await seedGeography(owner);
    await seedFxRates(owner);
    traveller = await registerTraveller(app);
  });

  afterAll(async () => {
    await owner?.end();
    await app?.close();
  });

  const auth = () => bearer(traveller.tokens.access_token);
  const server = () => request(app.getHttpServer());

  describe('GET / POST /expense-categories (FR-023, FR-024)', () => {
    it('lists the six system categories with their fixed ids ahead of the traveller’s own', async () => {
      const response = await server().get('/v1/expense-categories').set(auth());

      expect(response.status).toBe(200);
      const { categories } = ExpenseCategoriesResponse.parse(response.body);
      // Other suites seed system-shaped fixtures of their own into the shared
      // database; the contract's six must be present, in order, and first.
      const contractRows = categories.filter((c) => isSystemExpenseCategory(c.id));
      expect(contractRows.map((c) => [c.id, c.name, c.user_id])).toEqual(
        SYSTEM_EXPENSE_CATEGORIES.map((c) => [c.id, c.name, null]),
      );
      const firstOwn = categories.findIndex((c) => c.user_id !== null);
      const lastSystem = categories.map((c) => c.user_id).lastIndexOf(null);
      expect(firstOwn === -1 || firstOwn > lastSystem).toBe(true);
    });

    it('creates a user-scoped category once, visible to its owner across trips and to nobody else', async () => {
      const created = await server()
        .post('/v1/expense-categories')
        .set(auth())
        .send({ name: 'Coffee', icon: 'cup' });
      expect(created.status).toBe(201);
      const { category } = ExpenseCategoryResponse.parse(created.body);
      expect(category).toMatchObject({ name: 'Coffee', icon: 'cup' });
      expect(category.user_id).not.toBeNull();

      // Same name again is the same category, not a duplicate and not an error.
      const again = await server()
        .post('/v1/expense-categories')
        .set(auth())
        .send({ name: 'Coffee' });
      expect(again.status).toBe(201);
      expect(ExpenseCategoryResponse.parse(again.body).category.id).toBe(category.id);

      const mine = await server().get('/v1/expense-categories').set(auth());
      expect(
        ExpenseCategoriesResponse.parse(mine.body).categories.filter(
          (c) => c.name === 'Coffee',
        ),
      ).toHaveLength(1);

      const stranger = await registerTraveller(app);
      const theirs = await server()
        .get('/v1/expense-categories')
        .set(bearer(stranger.tokens.access_token));
      expect(
        ExpenseCategoriesResponse.parse(theirs.body).categories.map((c) => c.id),
      ).not.toContain(category.id);
    });
  });

  describe('GET /trips/:tripId/expenses/summary (FR-025, FR-026)', () => {
    it('totals by category and by day in the home currency, exactly, and discloses the rates', async () => {
      // Arrange — a dedicated trip so other tests' rows cannot leak in.
      const trip = await createTripFor(app, traveller, 'CHF', 'Summary trip');
      await createExpenseFor(app, traveller, trip, {
        amount: '10.00',
        currency: 'CHF',
        category_id: FOOD,
        spent_at: '2026-06-02',
        city_id: CITY.zurich,
      });
      await createExpenseFor(app, traveller, trip, {
        amount: '5.50',
        currency: 'CHF',
        category_id: TRANSPORT,
        spent_at: '2026-06-02',
      });
      await createExpenseFor(app, traveller, trip, {
        amount: '9.00',
        currency: 'EUR',
        category_id: FOOD,
        spent_at: '2026-06-03',
      });
      await createExpenseFor(app, traveller, trip, {
        amount: '250000.00',
        currency: 'XTS',
        category_id: FOOD,
        spent_at: '2026-06-03',
      });

      // Act
      const response = await server()
        .get(`/v1/trips/${trip}/expenses/summary`)
        .set(auth());

      // Assert
      expect(response.status).toBe(200);
      const summary = ExpenseSummary.parse(response.body);
      expect(summary.home_currency).toBe('CHF');
      expect(summary.total_home).toBe('23.50');
      expect(summary.by_category).toEqual([
        { category_id: FOOD, name: 'Food', total_home: '18.00', count: 2 },
        { category_id: TRANSPORT, name: 'Transport', total_home: '5.50', count: 1 },
      ]);
      expect(summary.by_day).toEqual([
        { date: '2026-06-02', total_home: '15.50', count: 2 },
        { date: '2026-06-03', total_home: '8.00', count: 1 },
      ]);
      expect(summary.rates_applied).toEqual([
        { currency: 'EUR', rate: '0.888889', count: 1 },
      ]);
      expect(summary.rates_source).toEqual(expect.any(String));
      expect(summary.pending_conversion).toEqual({
        count: 1,
        by_currency: [{ currency: 'XTS', total: '250000.00', count: 1 }],
      });

      // By category and by day reconcile to the same total — SC-016.
      const sum = (rows: { total_home: string }[]) =>
        rows.reduce((acc, row) => acc + Math.round(Number(row.total_home) * 100), 0);
      expect(sum(summary.by_category)).toBe(2350);
      expect(sum(summary.by_day)).toBe(2350);
    });

    it('is empty, not an error, for a trip with no expenses', async () => {
      const trip = await createTripFor(app, traveller, 'CHF', 'Nothing spent');

      const response = await server()
        .get(`/v1/trips/${trip}/expenses/summary`)
        .set(auth());

      expect(response.status).toBe(200);
      expect(ExpenseSummary.parse(response.body)).toMatchObject({
        total_home: '0.00',
        by_category: [],
        by_day: [],
        rates_applied: [],
        pending_conversion: { count: 0, by_currency: [] },
      });
    });

    it('discloses no rate when every expense is already in the home currency', async () => {
      const trip = await createTripFor(app, traveller, 'CHF', 'Home only');
      await createExpenseFor(app, traveller, trip, { amount: '1.00', currency: 'CHF' });

      const response = await server()
        .get(`/v1/trips/${trip}/expenses/summary`)
        .set(auth());

      expect(ExpenseSummary.parse(response.body).rates_applied).toEqual([]);
    });
  });

  describe('GET /trips/:tripId/expenses filters', () => {
    it('filters by city, by category, and by an inclusive date range', async () => {
      const trip = await createTripFor(app, traveller, 'CHF', 'Filters');
      const inZurich = await createExpenseFor(app, traveller, trip, {
        amount: '1.00',
        city_id: CITY.zurich,
        spent_at: '2026-06-01',
      });
      const transport = await createExpenseFor(app, traveller, trip, {
        amount: '2.00',
        category_id: TRANSPORT,
        spent_at: '2026-06-10',
      });
      const later = await createExpenseFor(app, traveller, trip, {
        amount: '3.00',
        spent_at: '2026-06-20',
      });

      const ids = async (query: string) => {
        const response = await server()
          .get(`/v1/trips/${trip}/expenses${query}`)
          .set(auth());
        expect(response.status).toBe(200);
        return ExpensesResponse.parse(response.body)
          .expenses.map((e) => e.id)
          .sort();
      };

      expect(await ids('')).toEqual([inZurich.id, transport.id, later.id].sort());
      expect(await ids(`?city_id=${CITY.zurich}`)).toEqual([inZurich.id]);
      expect(await ids(`?category_id=${TRANSPORT}`)).toEqual([transport.id]);
      expect(await ids('?from=2026-06-10&to=2026-06-20')).toEqual(
        [transport.id, later.id].sort(),
      );
      expect(await ids('?from=2026-06-21')).toEqual([]);
    });

    it('lists newest spend first and tombstones a deleted expense (FR-039)', async () => {
      const trip = await createTripFor(app, traveller, 'CHF', 'Delete');
      const first = await createExpenseFor(app, traveller, trip, {
        amount: '1.00',
        spent_at: '2026-06-01',
      });
      const second = await createExpenseFor(app, traveller, trip, {
        amount: '2.00',
        spent_at: '2026-06-02',
      });

      const listed = await server().get(`/v1/trips/${trip}/expenses`).set(auth());
      expect(ExpensesResponse.parse(listed.body).expenses.map((e) => e.id)).toEqual([
        second.id,
        first.id,
      ]);

      const deleted = await server().delete(`/v1/expenses/${first.id}`).set(auth());
      expect(deleted.status).toBe(204);

      const after = await server().get(`/v1/trips/${trip}/expenses`).set(auth());
      expect(ExpensesResponse.parse(after.body).expenses.map((e) => e.id)).toEqual([
        second.id,
      ]);

      const [row] = await owner<{ deleted_at: Date | null }[]>`
        SELECT deleted_at FROM expenses WHERE id = ${first.id}::uuid
      `;
      expect(row?.deleted_at).not.toBeNull();

      const twice = await server().delete(`/v1/expenses/${first.id}`).set(auth());
      expect(twice.status).toBe(404);
      expect(twice.body).toMatchObject({ error: { code: 'EXPENSE_NOT_FOUND' } });
    });
  });
});
