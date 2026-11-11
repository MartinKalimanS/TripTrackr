import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Sql } from 'postgres';
import request from 'supertest';

import { bearer, registerTraveller, type RegisteredTraveller } from '../support/app';
import { bootCharging } from '../support/billing';
import { migrationSql } from '../support/db';

/**
 * The RevenueCat Test Store (spec 014, S-13). A sandbox purchase made with a `test_` SDK key arrives
 * as `store: TEST_STORE`. It is granted only when the owner turned `BILLING_ACCEPT_TEST_STORE` on,
 * and only for a SANDBOX event: a development stack can sell to itself, production never can.
 */
const SECRET = 'whsec-test-secret';
const PRODUCTS = JSON.stringify({ credit_single: { kind: 'credit' } });
const FIXTURES = join(__dirname, '..', 'fixtures', 'revenuecat');

describe('billing webhook, Test Store switched on', () => {
  let app: NestExpressApplication;
  let owner: Sql;
  let traveller: RegisteredTraveller;

  beforeAll(async () => {
    app = await bootCharging({
      env: {
        REVENUECAT_WEBHOOK_SECRET: SECRET,
        BILLING_PRODUCTS: PRODUCTS,
        BILLING_ACCEPT_TEST_STORE: 'true',
      },
    });
    owner = migrationSql();
  });

  afterAll(async () => {
    await owner?.end();
    await app?.close();
  });

  beforeEach(async () => {
    traveller = await registerTraveller(app);
  });

  /** A copy with store transaction ids unique to this traveller, so parallel tests never collide. */
  const mine = (name: string) => {
    const userId = traveller.tokens.user.id;
    const raw = readFileSync(join(FIXTURES, `${name}.json`), 'utf8');
    const body = JSON.parse(raw.replaceAll('__USER__', userId)) as {
      event: Record<string, unknown>;
    };
    for (const key of ['transaction_id', 'original_transaction_id'] as const) {
      body.event[key] = `${String(body.event[key])}-${userId}`;
    }
    return body;
  };
  const send = (body: unknown) =>
    request(app.getHttpServer())
      .post('/v1/billing/webhook')
      .set('Authorization', SECRET)
      .send(body as object);
  const credits = async () =>
    (
      (
        await request(app.getHttpServer())
          .get('/v1/me/entitlement')
          .set(bearer(traveller.tokens.access_token))
      ).body as { credits: number }
    ).credits;
  const creditRows = () =>
    owner`SELECT provider FROM trip_credits WHERE user_id = ${traveller.tokens.user.id}`;

  test('a sandbox Test Store purchase grants one credit, recorded as test_store', async () => {
    await send(mine('non-renewing-purchase-test-store')).expect(200);

    expect(await credits()).toBe(1);
    expect(await creditRows()).toEqual([{ provider: 'test_store' }]);
  });

  test('the same Test Store purchase delivered three times grants one credit', async () => {
    const body = mine('non-renewing-purchase-test-store');
    for (let i = 0; i < 3; i += 1) await send(body).expect(200);

    expect(await credits()).toBe(1);
  });

  test('a Test Store event that claims to be PRODUCTION grants nothing', async () => {
    await send(mine('non-renewing-purchase-test-store-production')).expect(200);

    expect(await credits()).toBe(0);
    expect(await creditRows()).toHaveLength(0);
  });
});
