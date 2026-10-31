import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Sql } from 'postgres';
import request from 'supertest';

import { bearer, registerTraveller, type RegisteredTraveller } from '../support/app';
import { bootCharging, grantCredit, openPeriod, readCovers } from '../support/billing';
import { migrationSql } from '../support/db';

/**
 * Unlimited yearly plan (spec 014, user story 5; FR-012). No limit while active, nothing spent, and
 * trips made under it stay covered, so a lapse never forces a traveller to delete anything to create
 * again.
 */
const FREE = 3;

describe('paid allowance: Unlimited yearly plan', () => {
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

  const create = async (t: RegisteredTraveller, count: number) => {
    for (let i = 0; i < count; i += 1) {
      expect((await createTrip(t, `Trip ${i + 1}`)).status).toBe(201);
    }
  };

  test('any number of trips is created, each covered, and no credit is spent', async () => {
    const traveller = await registerTraveller(app);
    await openPeriod(owner, traveller, { tier: 'unlimited' });
    await grantCredit(owner, traveller);

    await create(traveller, 30);

    const covers = await readCovers(owner, traveller);
    expect(covers).toHaveLength(30);
    expect(covers.every((c) => c.source === 'unlimited')).toBe(true);
    const entitlement = (await server().get('/v1/me/entitlement').set(auth(traveller)))
      .body;
    expect(entitlement).toMatchObject({ tier: 'unlimited', credits: 1, trips_held: 0 });
  });

  test('a lapse hides nothing and the covered trips do not use the free slots', async () => {
    const traveller = await registerTraveller(app);
    const { originalTransactionId } = await openPeriod(owner, traveller, {
      tier: 'unlimited',
    });
    await create(traveller, 12);

    await owner`SELECT billing_end_period(${originalTransactionId}, now() - interval '1 second')`;

    const list = await server().get('/v1/trips').set(auth(traveller)).expect(200);
    expect(list.body.trips).toHaveLength(12);
    // Twelve covered trips, so the three free slots are all still empty.
    await create(traveller, FREE);
    expect((await createTrip(traveller)).status).toBe(409);
  });

  test('moving from Tier 1 to Unlimited keeps the earlier covers', async () => {
    const traveller = await registerTraveller(app);
    await openPeriod(owner, traveller, { tier: 'tier1', uses: 2 });
    await create(traveller, FREE + 2);
    await openPeriod(owner, traveller, { tier: 'unlimited' });

    await create(traveller, 4);

    const sources = (await readCovers(owner, traveller)).map((c) => c.source);
    expect(sources).toEqual([
      'year',
      'year',
      'unlimited',
      'unlimited',
      'unlimited',
      'unlimited',
    ]);
  });

  test('a cancelled-at-period-end plan stays active until the end', async () => {
    const traveller = await registerTraveller(app);
    await openPeriod(owner, traveller, { tier: 'unlimited', cancelAtPeriodEnd: true });

    await create(traveller, FREE + 3);

    const entitlement = (await server().get('/v1/me/entitlement').set(auth(traveller)))
      .body;
    expect(entitlement).toMatchObject({ is_active: true, cancel_at_period_end: true });
  });
});
