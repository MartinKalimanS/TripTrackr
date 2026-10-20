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
import {
  PASS_FIELDS,
  documentsBucket,
  uploadBody,
  uploadDocument,
  type DocumentsBucket,
} from '../support/documents';
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

describe('contract 9 — no visibility parameter on expense or document routes', () => {
  let app: NestExpressApplication;
  let owner: Sql;
  let bucket: DocumentsBucket;
  let traveller: RegisteredTraveller;
  let tripId: string;

  beforeAll(async () => {
    app = await bootTestApp();
    owner = migrationSql();
    bucket = documentsBucket();
    await seedGeography(owner);
    await seedFxRates(owner);
    traveller = await registerTraveller(app);
    tripId = await createTripFor(app, traveller);
  });

  afterAll(async () => {
    bucket?.close();
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

  // Documents (User Story 5, T114): the same four keys, against the upload and
  // the patch — and, since no document route takes a query at all, against the
  // reads' query strings too. Adversarial row 4 is test/privacy/documents.spec.ts.
  const documentsOnTrip = async () => {
    const rows = await owner<{ n: string }[]>`
      SELECT count(*)::text AS n FROM documents WHERE trip_id = ${tripId}::uuid
    `;
    return rows[0]?.n;
  };

  it.each(VISIBILITY_KEYS)(
    'POST /trips/:tripId/documents refuses `%s`, storing no row and no object',
    async (key) => {
      const rowsBefore = await documentsOnTrip();
      const objectsBefore = await bucket.keys(`${traveller.tokens.user.id}/`);

      const response = await server()
        .post(`/v1/trips/${tripId}/documents`)
        .set(auth())
        .send(uploadBody({ parsed_json: PASS_FIELDS, [key]: false }));

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
      expect(await documentsOnTrip()).toBe(rowsBefore);
      expect(await bucket.keys(`${traveller.tokens.user.id}/`)).toEqual(objectsBefore);
    },
  );

  it.each(VISIBILITY_KEYS)('PATCH /documents/:id refuses `%s`', async (key) => {
    const document = await uploadDocument(app, traveller, tripId, {
      parsed_json: PASS_FIELDS,
    });

    const response = await server()
      .patch(`/v1/documents/${document.id}`)
      .set(auth())
      .send({ confirmed: true, [key]: true });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });

    const [row] = await owner<{ parsed_confirmed_at: Date | null; updated_at: Date }[]>`
      SELECT parsed_confirmed_at, updated_at FROM documents WHERE id = ${document.id}::uuid
    `;
    expect(row?.parsed_confirmed_at).toBeNull();
    expect(row?.updated_at.toISOString()).toBe(document.updated_at);
  });

  it.each(VISIBILITY_KEYS)(
    'the document reads refuse `%s` as a filter — there is no public variant',
    async (key) => {
      const document = await uploadDocument(app, traveller, tripId);

      const list = await server()
        .get(`/v1/trips/${tripId}/documents?${key}=true`)
        .set(auth());
      const content = await server()
        .get(`/v1/documents/${document.id}/content?${key}=true`)
        .set(auth());

      expect(list.status).toBe(400);
      expect(content.status).toBe(400);
      expect(list.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
      expect(content.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    },
  );
});
