import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Sql } from 'postgres';
import request from 'supertest';

import { bearer, registerTraveller, type RegisteredTraveller } from '../support/app';
import { bootCharging, grantCredit, readCovers } from '../support/billing';
import { migrationSql } from '../support/db';

/**
 * Single-trip credits (spec 014, user story 3; FR-004 to FR-006, FR-009, FR-010). A credit is spent by
 * the trip created with it, that trip is covered and takes no free slot, and deleting the trip does
 * not give the credit back.
 */
const FREE = 3;

describe('paid allowance: single-trip credits', () => {
  let app: NestExpressApplication;
  let owner: Sql;

  beforeAll(async () => {
    app = await bootCharging({ freeTrips: FREE });
    owner = migrationSql();
  });

  afterAll(async () => {
    await owner?.end();
    await app?.close();
  });

  const server = () => request(app.getHttpServer());
  const auth = (t: RegisteredTraveller) => bearer(t.tokens.access_token);
  const createTrip = (t: RegisteredTraveller, title = 'A trip') =>
    server().post('/v1/trips').set(auth(t)).send({ title, home_currency: 'EUR' });

  const fill = async (t: RegisteredTraveller, count: number): Promise<string[]> => {
    const ids: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const response = await createTrip(t, `Trip ${i + 1}`);
      expect(response.status).toBe(201);
      ids.push(response.body.trip.id as string);
    }
    return ids;
  };

  const entitlement = async (t: RegisteredTraveller) =>
    (await server().get('/v1/me/entitlement').set(auth(t)).expect(200)).body as {
      credits: number;
      trips_held: number;
    };

  test('a free slot is used before a credit', async () => {
    const traveller = await registerTraveller(app);
    await grantCredit(owner, traveller);

    await fill(traveller, FREE);

    expect(await readCovers(owner, traveller)).toEqual([]);
    expect((await entitlement(traveller)).credits).toBe(1);
  });

  test('at the limit a credit pays for the next trip and the trip is covered', async () => {
    const traveller = await registerTraveller(app);
    await fill(traveller, FREE);
    await grantCredit(owner, traveller);

    const response = await createTrip(traveller, 'Paid for');

    expect(response.status).toBe(201);
    const covers = await readCovers(owner, traveller);
    expect(covers).toHaveLength(1);
    expect(covers[0]).toMatchObject({
      trip_id: response.body.trip.id,
      source: 'credit',
      period_id: null,
    });
    expect(covers[0]?.credit_id).not.toBeNull();
  });

  test('a covered trip takes no free slot', async () => {
    const traveller = await registerTraveller(app);
    await fill(traveller, FREE);
    await grantCredit(owner, traveller);
    await createTrip(traveller).expect(201);

    // Three ordinary trips are still held: the covered one is not counted.
    expect((await entitlement(traveller)).trips_held).toBe(FREE);
    expect((await createTrip(traveller)).status).toBe(409);
  });

  test('deleting the covered trip does not give the credit back', async () => {
    const traveller = await registerTraveller(app);
    await fill(traveller, FREE);
    await grantCredit(owner, traveller);
    const covered = (await createTrip(traveller)).body.trip.id as string;

    await server().delete(`/v1/trips/${covered}`).set(auth(traveller)).expect(204);

    expect((await createTrip(traveller)).status).toBe(409);
    expect((await entitlement(traveller)).credits).toBe(0);
  });

  test('deleting an ordinary trip frees a free slot, deleting a covered one frees nothing', async () => {
    const traveller = await registerTraveller(app);
    const ordinary = await fill(traveller, FREE);
    await grantCredit(owner, traveller);
    const covered = (await createTrip(traveller)).body.trip.id as string;

    await server().delete(`/v1/trips/${covered}`).set(auth(traveller)).expect(204);
    expect((await createTrip(traveller)).status).toBe(409);

    await server().delete(`/v1/trips/${ordinary[0]}`).set(auth(traveller)).expect(204);
    expect((await createTrip(traveller)).status).toBe(201);
  });

  test('two simultaneous creates with one credit spend it once', async () => {
    const traveller = await registerTraveller(app);
    await fill(traveller, FREE);
    await grantCredit(owner, traveller);

    const [a, b] = await Promise.all([
      createTrip(traveller, 'A'),
      createTrip(traveller, 'B'),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await readCovers(owner, traveller)).toHaveLength(1);
  });

  test('several credits are spent oldest first, one per trip', async () => {
    const traveller = await registerTraveller(app);
    await fill(traveller, FREE);
    const first = await grantCredit(owner, traveller, {
      purchasedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await grantCredit(owner, traveller, {
      purchasedAt: new Date('2026-06-01T00:00:00Z'),
    });

    await createTrip(traveller).expect(201);

    const [spent] = await owner<{ transaction_id: string }[]>`
      SELECT k.transaction_id FROM trip_covers c JOIN trip_credits k ON k.id = c.credit_id
      WHERE c.user_id = ${traveller.tokens.user.id}::uuid`;
    expect(spent?.transaction_id).toBe(first);
    expect((await entitlement(traveller)).credits).toBe(1);
  });

  test('a credit never expires', async () => {
    const traveller = await registerTraveller(app);
    await fill(traveller, FREE);
    await grantCredit(owner, traveller, {
      purchasedAt: new Date('2019-01-01T00:00:00Z'),
    });

    expect((await createTrip(traveller)).status).toBe(201);
  });

  test('the same store transaction delivered again grants one credit', async () => {
    const traveller = await registerTraveller(app);
    await fill(traveller, FREE);
    const transactionId = await grantCredit(owner, traveller);
    await grantCredit(owner, traveller, { transactionId });
    await grantCredit(owner, traveller, { transactionId });

    expect((await entitlement(traveller)).credits).toBe(1);
  });

  test('a refused create reports the credits the traveller holds', async () => {
    const traveller = await registerTraveller(app);
    await fill(traveller, FREE);

    const refused = await createTrip(traveller);

    expect(refused.body.error.details).toMatchObject({ credits: 0, year_uses_left: 0 });
  });

  test("another traveller's credit is not spendable", async () => {
    const rich = await registerTraveller(app);
    await grantCredit(owner, rich);
    const poor = await registerTraveller(app);
    await fill(poor, FREE);

    expect((await createTrip(poor)).status).toBe(409);
    expect((await entitlement(rich)).credits).toBe(1);
  });
});
