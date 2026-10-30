import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Sql } from 'postgres';
import request from 'supertest';

import { bearer, registerTraveller } from '../support/app';
import { bootCharging, grantCredit, openPeriod } from '../support/billing';
import { migrationSql } from '../support/db';

/**
 * A lapse, a refund or a spent credit never changes what a traveller can read of their own trips
 * (spec 014, FR-020, FR-021; Constitution V). The trip list and each trip read byte for byte the
 * same before and after every change in what they have paid for.
 */
const FREE = 2;

describe('billing never changes what a traveller reads', () => {
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

  test('refund, lapse and spend leave the reads identical', async () => {
    const traveller = await registerTraveller(app);
    const auth = bearer(traveller.tokens.access_token);
    const server = () => request(app.getHttpServer());
    const { originalTransactionId } = await openPeriod(owner, traveller, { tier: 'unlimited' });
    const credit = await grantCredit(owner, traveller);
    const ids: string[] = [];
    for (let i = 0; i < FREE + 3; i += 1) {
      const response = await server()
        .post('/v1/trips')
        .set(auth)
        .send({ title: `Trip ${i}`, home_currency: 'EUR' })
        .expect(201);
      ids.push(response.body.trip.id as string);
    }

    const read = async () => ({
      list: (await server().get('/v1/trips').set(auth)).body,
      each: await Promise.all(
        ids.map(async (id): Promise<unknown> => (await server().get(`/v1/trips/${id}`).set(auth)).body as unknown),
      ),
    });
    const before = await read();

    await owner`SELECT billing_end_period(${originalTransactionId}, now() - interval '1 second')`;
    await owner`SELECT billing_refund(${credit}, now())`;

    expect(await read()).toEqual(before);
  });
});
