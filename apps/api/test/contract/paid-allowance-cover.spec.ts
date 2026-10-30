import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Sql } from 'postgres';
import request from 'supertest';

import { bearer, registerTraveller, type RegisteredTraveller } from '../support/app';
import { bootCharging, grantCredit, openPeriod, readCovers } from '../support/billing';
import { migrationSql } from '../support/db';
import { push, tripRecord } from '../support/sync-push-fixtures';

/**
 * Covering a flagged trip (spec 014, user story 7; FR-018, FR-019). A trip that arrived by sync
 * beyond the allowance is kept and flagged, never refused; the traveller can later cover it.
 */
const FREE = 3;

describe('paid allowance: covering a trip that arrived over the allowance', () => {
  let app: NestExpressApplication;
  let owner: Sql;

  beforeAll(async () => {
    app = await bootCharging({ freeTrips: FREE, tier1Trips: 10 });
    owner = migrationSql();
  });

  afterAll(async () => {
    await owner?.end();
    await app?.close();
  });

  const server = () => request(app.getHttpServer());
  const auth = (t: RegisteredTraveller) => bearer(t.tokens.access_token);
  const cover = (t: RegisteredTraveller, id: string) =>
    server().post(`/v1/trips/${id}/cover`).set(auth(t));

  /** Pushes `count` trips one at a time (so created_at order is stable) and returns the answers. */
  const pushTrips = async (t: RegisteredTraveller, count: number) => {
    const out: { id: string; warnings?: string[] }[] = [];
    for (let i = 0; i < count; i += 1) {
      const record = tripRecord();
      const [result] = await push(app, t, 'trips', [record]);
      out.push({ id: record.id as string, warnings: (result as { warnings?: string[] }).warnings });
    }
    return out;
  };

  test('trips past the free number are kept and flagged', async () => {
    const traveller = await registerTraveller(app);

    const pushed = await pushTrips(traveller, FREE + 2);

    expect(pushed.slice(0, FREE).every((p) => p.warnings === undefined)).toBe(true);
    expect(pushed.slice(FREE).map((p) => p.warnings)).toEqual([
      ['over_allowance'],
      ['over_allowance'],
    ]);
  });

  test('a credit covers a flagged trip and the flag goes away', async () => {
    const traveller = await registerTraveller(app);
    const pushed = await pushTrips(traveller, FREE + 1);
    const flagged = pushed[FREE]!.id;
    await grantCredit(owner, traveller);

    const response = await cover(traveller, flagged);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ source: 'credit' });
    const [again] = await push(app, traveller, 'trips', [
      { ...tripRecord(), id: flagged },
    ]);
    expect(JSON.stringify(again)).not.toContain('over_allowance');
    expect(await readCovers(owner, traveller)).toHaveLength(1);
  });

  test('a year use is spent before a credit', async () => {
    const traveller = await registerTraveller(app);
    const pushed = await pushTrips(traveller, FREE + 1);
    await openPeriod(owner, traveller, { uses: 1 });
    await grantCredit(owner, traveller);

    const response = await cover(traveller, pushed[FREE]!.id);

    expect(response.body).toEqual({ source: 'year' });
  });

  test('covering twice is the same answer and spends once', async () => {
    const traveller = await registerTraveller(app);
    const pushed = await pushTrips(traveller, FREE + 1);
    await grantCredit(owner, traveller);
    await grantCredit(owner, traveller);

    const first = await cover(traveller, pushed[FREE]!.id);
    const second = await cover(traveller, pushed[FREE]!.id);

    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(await readCovers(owner, traveller)).toHaveLength(1);
  });

  test('with nothing to pay with it is a 409 that names the trip', async () => {
    const traveller = await registerTraveller(app);
    const pushed = await pushTrips(traveller, FREE + 1);

    const response = await cover(traveller, pushed[FREE]!.id);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('TRIP_ALLOWANCE_REACHED');
    expect(response.body.error.details).toMatchObject({ credits: 0, year_uses_left: 0 });
  });

  test('a trip inside the free number needs no cover', async () => {
    const traveller = await registerTraveller(app);
    const pushed = await pushTrips(traveller, 2);
    await grantCredit(owner, traveller);

    const response = await cover(traveller, pushed[0]!.id);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('TRIP_NOT_OVER_ALLOWANCE');
    expect(await readCovers(owner, traveller)).toEqual([]);
  });

  test("another traveller's trip is not found", async () => {
    const mine = await registerTraveller(app);
    const theirs = await registerTraveller(app);
    const pushed = await pushTrips(theirs, 1);
    await grantCredit(owner, mine);

    expect((await cover(mine, pushed[0]!.id)).status).toBe(404);
  });

  test('a deleted trip is not found', async () => {
    const traveller = await registerTraveller(app);
    const pushed = await pushTrips(traveller, FREE + 1);
    await grantCredit(owner, traveller);
    await server().delete(`/v1/trips/${pushed[FREE]!.id}`).set(auth(traveller)).expect(204);

    expect((await cover(traveller, pushed[FREE]!.id)).status).toBe(404);
  });

  test('an Unlimited year covers pushed trips on arrival', async () => {
    const traveller = await registerTraveller(app);
    await openPeriod(owner, traveller, { tier: 'unlimited' });

    const pushed = await pushTrips(traveller, FREE + 2);

    expect(pushed.every((p) => p.warnings === undefined)).toBe(true);
    expect((await readCovers(owner, traveller)).map((c) => c.source)).toEqual([
      'unlimited',
      'unlimited',
      'unlimited',
      'unlimited',
      'unlimited',
    ]);
  });

  test('a malformed id is a 400', async () => {
    const traveller = await registerTraveller(app);

    expect((await cover(traveller, 'not-a-uuid')).status).toBe(400);
  });
});
