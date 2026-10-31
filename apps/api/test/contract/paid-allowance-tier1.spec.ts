import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Sql } from 'postgres';
import request from 'supertest';

import { bearer, registerTraveller, type RegisteredTraveller } from '../support/app';
import { bootCharging, grantCredit, openPeriod, readCovers } from '../support/billing';
import { migrationSql } from '../support/db';

/**
 * Tier 1: 10 new trips per subscription year (spec 014, user story 4; FR-004, FR-011). A year's trips
 * are spent by creating, never returned by deleting, and expire with the year; trips already created
 * stay covered, readable and editable after a lapse.
 */
const FREE = 3;
const YEAR = 10;

describe('paid allowance: Tier 1 yearly plan', () => {
  let app: NestExpressApplication;
  let owner: Sql;

  beforeAll(async () => {
    app = await bootCharging({ freeTrips: FREE, tier1Trips: YEAR });
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

  const create = async (t: RegisteredTraveller, count: number): Promise<string[]> => {
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
      tier: string | null;
      is_active: boolean;
      year_uses_left: number;
      trips_held: number;
    };

  test('free slots first, then ten covered trips, then a refusal', async () => {
    const traveller = await registerTraveller(app);
    await openPeriod(owner, traveller);

    await create(traveller, FREE + YEAR);

    const covers = await readCovers(owner, traveller);
    expect(covers).toHaveLength(YEAR);
    expect(covers.every((c) => c.source === 'year')).toBe(true);

    const refused = await createTrip(traveller);
    expect(refused.status).toBe(409);
    expect(refused.body.error.details).toMatchObject({ year_uses_left: 0, credits: 0 });
  });

  test('the entitlement answer counts the uses left', async () => {
    const traveller = await registerTraveller(app);
    await openPeriod(owner, traveller);
    await create(traveller, FREE + 4);

    expect(await entitlement(traveller)).toMatchObject({
      tier: 'tier1',
      is_active: true,
      year_uses_left: YEAR - 4,
      trips_held: FREE,
    });
  });

  test('deleting a covered trip returns no use', async () => {
    const traveller = await registerTraveller(app);
    await openPeriod(owner, traveller);
    const ids = await create(traveller, FREE + YEAR);

    await server().delete(`/v1/trips/${ids[FREE]}`).set(auth(traveller)).expect(204);

    expect((await createTrip(traveller)).status).toBe(409);
    expect((await entitlement(traveller)).year_uses_left).toBe(0);
  });

  test('a year that has ended spends nothing and its unused trips are gone', async () => {
    const traveller = await registerTraveller(app);
    await openPeriod(owner, traveller, { startsInDays: -400, endsInDays: -35 });
    await create(traveller, FREE);

    const refused = await createTrip(traveller);

    expect(refused.status).toBe(409);
    expect((await entitlement(traveller)).tier).toBeNull();
  });

  test('the renewed year starts with a full ten and the old covers stay', async () => {
    const traveller = await registerTraveller(app);
    const first = await openPeriod(owner, traveller, {
      startsInDays: -366,
      endsInDays: -1,
    });
    // The year that has just ended was not used at all: the unused ten simply expire.
    expect(first.originalTransactionId).toBeDefined();
    await openPeriod(owner, traveller, {
      originalTransactionId: first.originalTransactionId,
      startsInDays: -1,
      endsInDays: 364,
    });

    await create(traveller, FREE + YEAR);

    expect(await readCovers(owner, traveller)).toHaveLength(YEAR);
    expect((await createTrip(traveller)).status).toBe(409);
  });

  test('trips covered by a year stay readable, editable and countable after a lapse', async () => {
    const traveller = await registerTraveller(app);
    const { originalTransactionId } = await openPeriod(owner, traveller);
    const ids = await create(traveller, FREE + 2);
    const covered = ids[FREE] as string;

    // The year is cut short (an expiration), as the webhook does.
    await owner`SELECT billing_end_period(${originalTransactionId}, now() - interval '1 second')`;

    const read = await server().get(`/v1/trips/${covered}`).set(auth(traveller));
    expect(read.status).toBe(200);
    await server()
      .patch(`/v1/trips/${covered}`)
      .set(auth(traveller))
      .send({ title: 'Renamed after the lapse' })
      .expect(200);
    expect(
      (await server().get('/v1/trips').set(auth(traveller))).body.trips,
    ).toHaveLength(FREE + 2);
    expect(await readCovers(owner, traveller)).toHaveLength(2);
    // Only creating is affected, and the covered trips do not use a free slot.
    expect((await createTrip(traveller)).status).toBe(409);
    expect((await entitlement(traveller)).trips_held).toBe(FREE);
  });

  test('spending order is free slot, then year, then credit', async () => {
    const traveller = await registerTraveller(app);
    await openPeriod(owner, traveller, { uses: 2 });
    await grantCredit(owner, traveller);

    await create(traveller, FREE + 3);

    expect((await readCovers(owner, traveller)).map((c) => c.source)).toEqual([
      'year',
      'year',
      'credit',
    ]);
  });

  test('two simultaneous creates with one use left spend it once', async () => {
    const traveller = await registerTraveller(app);
    await openPeriod(owner, traveller, { uses: 1 });
    await create(traveller, FREE);

    const [a, b] = await Promise.all([
      createTrip(traveller, 'A'),
      createTrip(traveller, 'B'),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });

  test('fifty simultaneous creates never spend more than the year holds', async () => {
    const traveller = await registerTraveller(app);
    await openPeriod(owner, traveller, { uses: 5 });
    await create(traveller, FREE);

    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) => createTrip(traveller, `Burst ${i}`)),
    );

    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.status === 409)).toHaveLength(45);
    expect(await readCovers(owner, traveller)).toHaveLength(5);
  });

  test('a refunded year covers nothing more but keeps what it covered', async () => {
    const traveller = await registerTraveller(app);
    const { transactionId } = await openPeriod(owner, traveller);
    await create(traveller, FREE + 1);

    await owner`SELECT billing_refund(${transactionId}, now())`;

    expect(await readCovers(owner, traveller)).toHaveLength(1);
    expect((await createTrip(traveller)).status).toBe(409);
  });
});
