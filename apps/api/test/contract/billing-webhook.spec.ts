import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Sql } from 'postgres';
import request from 'supertest';

import { bearer, registerTraveller, type RegisteredTraveller } from '../support/app';
import { bootCharging, readCovers } from '../support/billing';
import { migrationSql } from '../support/db';

/**
 * The RevenueCat webhook (spec 014, S-11; D14-08). Authentic calls only, every event applied once
 * however often it is delivered, and nothing in the logs that names a traveller. Event shapes are
 * the fixtures under test/fixtures/revenuecat; their field names are UNVERIFIED until the S-13
 * sandbox run.
 */
const SECRET = 'whsec-test-secret';
const PRODUCTS = JSON.stringify({
  credit_single: { kind: 'credit' },
  tier1_y1: { kind: 'tier1', step: 1 },
  tier1_y2: { kind: 'tier1', step: 2 },
  tier1_y3_plus: { kind: 'tier1', step: 3 },
  unl_y1: { kind: 'unlimited', step: 1 },
});
const FIXTURES = join(__dirname, '..', 'fixtures', 'revenuecat');
const DAY_MS = 86_400_000;

describe('billing webhook', () => {
  let app: NestExpressApplication;
  let owner: Sql;
  let traveller: RegisteredTraveller;

  beforeAll(async () => {
    app = await bootCharging({
      freeTrips: 3,
      env: { REVENUECAT_WEBHOOK_SECRET: SECRET, BILLING_PRODUCTS: PRODUCTS },
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

  type Fixture = { event: Record<string, unknown> };
  const fixture = (name: string, userId = traveller.tokens.user.id): Fixture => {
    const raw = readFileSync(join(FIXTURES, `${name}.json`), 'utf8');
    return JSON.parse(raw.replaceAll('__USER__', userId)) as Fixture;
  };
  /** A copy with store transaction ids unique to this traveller, so parallel tests never collide. */
  const mine = (name: string): Fixture => {
    const body = fixture(name);
    const tag = traveller.tokens.user.id;
    for (const key of ['transaction_id', 'original_transaction_id'] as const) {
      body.event[key] = `${String(body.event[key])}-${tag}`;
    }
    return body;
  };
  const send = (body: unknown, authorization: string | null = SECRET) => {
    const call = request(app.getHttpServer()).post('/v1/billing/webhook');
    if (authorization !== null) call.set('Authorization', authorization);
    return call.send(body as object);
  };
  const entitlement = async () =>
    (
      await request(app.getHttpServer())
        .get('/v1/me/entitlement')
        .set(bearer(traveller.tokens.access_token))
    ).body as {
      credits: number;
      tier: string | null;
      is_active: boolean;
      year_uses_left: number;
    };
  const creditRows = () =>
    owner`SELECT 1 FROM trip_credits WHERE user_id = ${traveller.tokens.user.id}::uuid`;

  describe('authenticity', () => {
    test.each([
      ['no header', null],
      ['a wrong secret', 'nope'],
      ['a secret of the wrong length', `${SECRET}x`],
      ['an empty header', ''],
    ])('%s is 401 and grants nothing', async (_name, header) => {
      const response = await send(mine('non-renewing-purchase'), header);

      expect(response.status).toBe(401);
      expect(await creditRows()).toHaveLength(0);
    });

    test('is checked before the event is validated: a non-event with a bad secret is 401, not 400', async () => {
      const response = await send({ hello: 'world' }, 'nope');

      expect(response.status).toBe(401);
    });

    test('accepts the secret with a Bearer prefix and needs no traveller sign-in', async () => {
      const response = await send(mine('non-renewing-purchase'), `Bearer ${SECRET}`);

      expect(response.status).toBe(200);
    });
  });

  describe('events', () => {
    test('a single-trip purchase grants one credit', async () => {
      await send(mine('non-renewing-purchase')).expect(200);

      expect((await entitlement()).credits).toBe(1);
    });

    test('the same purchase delivered ten times grants one credit', async () => {
      const body = mine('non-renewing-purchase');
      for (let i = 0; i < 10; i += 1) await send(body).expect(200);

      expect(await creditRows()).toHaveLength(1);
    });

    test('a Tier 1 purchase opens a year of ten trips', async () => {
      await send(mine('initial-purchase-tier1')).expect(200);

      expect(await entitlement()).toMatchObject({
        tier: 'tier1',
        is_active: true,
        year_uses_left: 10,
      });
    });

    test('an Unlimited purchase opens an Unlimited year', async () => {
      await send(mine('initial-purchase-unlimited')).expect(200);

      expect(await entitlement()).toMatchObject({ tier: 'unlimited', is_active: true });
    });

    test('a renewal opens the next year, and the same renewal twice is one year', async () => {
      const first = mine('initial-purchase-tier1');
      const renewal = mine('renewal-tier1');
      renewal.event.original_transaction_id = first.event.original_transaction_id;
      const start = Date.now() - 400 * DAY_MS;
      first.event.purchased_at_ms = start;
      first.event.expiration_at_ms = start + 365 * DAY_MS;
      renewal.event.purchased_at_ms = start + 365 * DAY_MS;
      renewal.event.expiration_at_ms = start + 730 * DAY_MS;

      await send(first).expect(200);
      await send(renewal).expect(200);
      await send(renewal).expect(200);

      const periods = await owner`
        SELECT ladder_step FROM subscription_periods
        WHERE user_id = ${traveller.tokens.user.id}::uuid ORDER BY starts_at`;
      expect(periods.map((p): unknown => p.ladder_step as unknown)).toEqual([1, 2]);
    });

    test('turning auto-renew off keeps the year active until its end', async () => {
      const purchase = mine('initial-purchase-tier1');
      const cancel = mine('cancellation-auto-renew-off');
      cancel.event.original_transaction_id = purchase.event.original_transaction_id;
      const start = Date.now() - DAY_MS;
      for (const body of [purchase, cancel]) {
        body.event.purchased_at_ms = start;
        body.event.expiration_at_ms = start + 365 * DAY_MS;
      }
      await send(purchase).expect(200);

      await send(cancel).expect(200);

      const rows = await owner`
        SELECT cancel_at_period_end FROM subscription_periods
        WHERE user_id = ${traveller.tokens.user.id}::uuid`;
      expect(rows[0]?.cancel_at_period_end).toBe(true);
      expect((await entitlement()).is_active).toBe(true);
    });

    test('an expiration ends the year', async () => {
      const purchase = mine('initial-purchase-tier1');
      const expired = mine('expiration');
      expired.event.original_transaction_id = purchase.event.original_transaction_id;
      const now = Date.now();
      purchase.event.purchased_at_ms = now - 10 * DAY_MS;
      purchase.event.expiration_at_ms = now + 355 * DAY_MS;
      expired.event.expiration_at_ms = now - 1000;
      await send(purchase).expect(200);

      await send(expired).expect(200);

      expect((await entitlement()).is_active).toBe(false);
    });

    test.each(['cancellation-refund', 'refund-type'])(
      'a refund (%s) of a year stops it covering anything',
      async (name) => {
        const purchase = mine('initial-purchase-tier1');
        const refund = mine(name);
        refund.event.transaction_id = purchase.event.transaction_id;
        refund.event.original_transaction_id = purchase.event.original_transaction_id;
        const start = Date.now() - DAY_MS;
        purchase.event.purchased_at_ms = start;
        purchase.event.expiration_at_ms = start + 365 * DAY_MS;
        await send(purchase).expect(200);

        await send(refund).expect(200);

        expect((await entitlement()).is_active).toBe(false);
      },
    );

    test('a refund of an unused credit removes it', async () => {
      const purchase = mine('non-renewing-purchase');
      const refund = mine('non-renewing-refund');
      refund.event.transaction_id = purchase.event.transaction_id;
      await send(purchase).expect(200);

      await send(refund).expect(200);

      expect((await entitlement()).credits).toBe(0);
    });

    test('a refund of a spent credit keeps the trip and drops its cover', async () => {
      const purchase = mine('non-renewing-purchase');
      const refund = mine('non-renewing-refund');
      refund.event.transaction_id = purchase.event.transaction_id;
      await send(purchase).expect(200);
      for (let i = 0; i < 4; i += 1) {
        await request(app.getHttpServer())
          .post('/v1/trips')
          .set(bearer(traveller.tokens.access_token))
          .send({ title: 'T', home_currency: 'EUR' })
          .expect(201);
      }
      expect(await readCovers(owner, traveller)).toHaveLength(1);

      await send(refund).expect(200);

      expect(await readCovers(owner, traveller)).toHaveLength(0);
    });

    test('a billing problem is acknowledged and changes nothing', async () => {
      const purchase = mine('initial-purchase-tier1');
      const start = Date.now() - DAY_MS;
      purchase.event.purchased_at_ms = start;
      purchase.event.expiration_at_ms = start + 365 * DAY_MS;
      await send(purchase).expect(200);

      await send(mine('billing-issue')).expect(200);

      expect((await entitlement()).is_active).toBe(true);
    });
  });

  describe('things we do not act on', () => {
    test.each(['unknown-type', 'unknown-product', 'anonymous-user'])(
      '%s is acknowledged with 200 and grants nothing',
      async (name) => {
        const response = await send(mine(name));

        expect(response.status).toBe(200);
        expect(await creditRows()).toHaveLength(0);
        expect((await entitlement()).is_active).toBe(false);
      },
    );

    test('a body that is not an event is a 400 once authentic', async () => {
      const response = await send({ hello: 'world' });

      expect(response.status).toBe(400);
    });

    test('an event for an account that does not exist is discarded', async () => {
      const body = fixture('non-renewing-purchase', '00000000-0000-4000-8000-000000000001');
      body.event.transaction_id = `ghost-${traveller.tokens.user.id}`;

      const response = await send(body);

      expect(response.status).toBe(200);
      const rows = await owner`
        SELECT 1 FROM trip_credits WHERE transaction_id = ${String(body.event.transaction_id)}`;
      expect(rows).toHaveLength(0);
    });

    test('an event for a deleted account is discarded', async () => {
      const gone = await registerTraveller(app);
      const body = fixture('non-renewing-purchase', gone.tokens.user.id);
      body.event.transaction_id = `gone-${gone.tokens.user.id}`;
      await owner`DELETE FROM users WHERE id = ${gone.tokens.user.id}::uuid`;

      const response = await send(body);

      expect(response.status).toBe(200);
      const rows = await owner`
        SELECT 1 FROM trip_credits WHERE transaction_id = ${String(body.event.transaction_id)}`;
      expect(rows).toHaveLength(0);
    });
  });

  describe('logs', () => {
    test('never carry a traveller id, a transaction id or the secret', async () => {
      const lines: string[] = [];
      const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map((level) =>
        jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
          lines.push(args.map(String).join(' '));
        }),
      );
      const purchase = mine('non-renewing-purchase');

      await send(mine('unknown-type')).expect(200);
      await send(purchase).expect(200);
      await send(purchase, 'nope').expect(401);
      spies.forEach((spy) => spy.mockRestore());

      const text = lines.join('\n');
      expect(text).not.toContain(traveller.tokens.user.id);
      expect(text).not.toContain(String(purchase.event.transaction_id));
      expect(text).not.toContain(SECRET);
    });
  });
});
