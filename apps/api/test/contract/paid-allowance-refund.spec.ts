import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Sql } from 'postgres';
import request from 'supertest';

import { bearer, registerTraveller, type RegisteredTraveller } from '../support/app';
import { bootCharging, grantCredit, openPeriod, readCovers } from '../support/billing';
import { migrationSql } from '../support/db';

/**
 * Refunds (spec 014, user story 8; FR-021, FR-022). An unused credit is removed. A spent one leaves
 * its trip in place, now counted as an ordinary trip. A refunded year stops covering new trips and
 * never touches what it covered.
 */
const FREE = 3;

describe('paid allowance: refunds', () => {
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
  const createTrip = (t: RegisteredTraveller) =>
    server().post('/v1/trips').set(auth(t)).send({ title: 'T', home_currency: 'EUR' });
  const fill = async (t: RegisteredTraveller, n: number) => {
    for (let i = 0; i < n; i += 1) expect((await createTrip(t)).status).toBe(201);
  };
  const entitlement = async (t: RegisteredTraveller) =>
    (await server().get('/v1/me/entitlement').set(auth(t))).body as {
      credits: number;
      trips_held: number;
    };

  test('an unused credit that is refunded is gone', async () => {
    const traveller = await registerTraveller(app);
    await fill(traveller, FREE);
    const txn = await grantCredit(owner, traveller);

    await owner`SELECT billing_refund(${txn}, now())`;

    expect((await entitlement(traveller)).credits).toBe(0);
    expect((await createTrip(traveller)).status).toBe(409);
  });

  test('a spent credit that is refunded leaves the trip, now an ordinary one', async () => {
    const traveller = await registerTraveller(app);
    await fill(traveller, FREE);
    const txn = await grantCredit(owner, traveller);
    const covered = (await createTrip(traveller)).body.trip.id as string;

    await owner`SELECT billing_refund(${txn}, now())`;

    expect((await server().get(`/v1/trips/${covered}`).set(auth(traveller))).status).toBe(200);
    expect(await readCovers(owner, traveller)).toEqual([]);
    expect((await entitlement(traveller)).trips_held).toBe(FREE + 1);
  });

  test('a refund delivered twice changes nothing more', async () => {
    const traveller = await registerTraveller(app);
    const txn = await grantCredit(owner, traveller);

    await owner`SELECT billing_refund(${txn}, now())`;
    await owner`SELECT billing_refund(${txn}, now())`;

    expect((await entitlement(traveller)).credits).toBe(0);
  });

  test('a refund for a purchase we never saw is a harmless no-op', async () => {
    const [row] = await owner<{ billing_refund: string }[]>`
      SELECT billing_refund('unknown-txn', now())`;

    expect(row?.billing_refund).toBe('none');
  });

  test('a refunded year covers no more trips and keeps the ones it covered', async () => {
    const traveller = await registerTraveller(app);
    const { transactionId } = await openPeriod(owner, traveller, { tier: 'unlimited' });
    await fill(traveller, FREE + 2);

    await owner`SELECT billing_refund(${transactionId}, now())`;

    expect(await readCovers(owner, traveller)).toHaveLength(FREE + 2);
    expect((await entitlement(traveller)).trips_held).toBe(0);
    await fill(traveller, FREE);
    expect((await createTrip(traveller)).status).toBe(409);
  });
});
