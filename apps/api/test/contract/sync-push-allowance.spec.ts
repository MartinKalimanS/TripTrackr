import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Sql } from 'postgres';
import request from 'supertest';

import { AllowanceService } from '@/modules/billing/allowance.service';

import { bearer, registerTraveller, type RegisteredTraveller } from '../support/app';
import { bootCharging, grantCredit, openPeriod, readCovers } from '../support/billing';
import { migrationSql } from '../support/db';
import { push, pushOne, tripRecord, minutesAgo } from '../support/sync-push-fixtures';

/**
 * The allowance on `POST /sync/push` (spec 014; D14-11; Constitution V). A trip beyond the free
 * number is KEPT and flagged, never rejected: it is something the traveller recorded. Ranked by
 * creation, so a retry of the same push answers the same way.
 */
const FREE = 3;

describe('sync push: the allowance flags a trip and never rejects it', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await bootCharging({ freeTrips: FREE });
  });

  afterAll(async () => {
    await app?.close();
  });

  const many = (count: number) => Array.from({ length: count }, () => tripRecord());

  it('applies the trip past the free number with a warning, and keeps every trip', async () => {
    const traveller = await registerTraveller(app);

    const results = await push(app, traveller, 'trips', many(FREE + 2));

    expect(results.map((r) => r.status)).toEqual(Array(FREE + 2).fill('applied'));
    expect(results.map((r) => 'warnings' in r && r.warnings)).toEqual([
      ...Array<false>(FREE).fill(false),
      ['over_allowance'],
      ['over_allowance'],
    ]);
  });

  it('gives the retry of a flagged trip the same warning as the first request', async () => {
    const traveller = await registerTraveller(app);
    await push(app, traveller, 'trips', many(FREE));
    const over = tripRecord();

    const first = await push(app, traveller, 'trips', [over]);
    const retry = await push(app, traveller, 'trips', [over]);

    expect(first).toEqual([
      { id: over.id, status: 'applied', warnings: ['over_allowance'] },
    ]);
    expect(retry).toEqual(first);
  });

  it('counts live trips only: a deleted trip frees its slot at once', async () => {
    const traveller = await registerTraveller(app);
    const trips = many(FREE);
    await push(app, traveller, 'trips', trips);
    await pushOne(app, traveller, 'trips', { ...trips[0], deleted: true });

    const result = await pushOne(app, traveller, 'trips', tripRecord());

    expect(result).toMatchObject({ status: 'applied' });
    expect(result).not.toHaveProperty('warnings');
  });

  it('does not warn for a trip that is pushed already deleted', async () => {
    const traveller = await registerTraveller(app);
    await push(app, traveller, 'trips', many(FREE));

    const result = await pushOne(app, traveller, 'trips', tripRecord({ deleted: true }));

    expect(result).not.toHaveProperty('warnings');
  });

  it('does not warn for an edit of a trip within the free number', async () => {
    const traveller = await registerTraveller(app);
    const trips = many(FREE + 1);
    await push(app, traveller, 'trips', trips);

    const result = await pushOne(app, traveller, 'trips', {
      ...trips[0],
      title: 'Renamed',
      updated_at: minutesAgo(1),
    });

    expect(result).toEqual({ id: trips[0]?.id, status: 'applied' });
  });

  it('asks one injectable service, so the rule has a single owner', async () => {
    const service = app.get(AllowanceService);
    const spy = jest.spyOn(service, 'isPushedTripOver').mockResolvedValue(true);
    const traveller = await registerTraveller(app);

    const result = await pushOne(app, traveller, 'trips', tripRecord());

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'applied', warnings: ['over_allowance'] });
    spy.mockRestore();
  });

  it('refuses a REST create at the allowance even when the trips arrived by push', async () => {
    const traveller = await registerTraveller(app);
    await push(app, traveller, 'trips', many(FREE + 1));

    const response = await request(app.getHttpServer())
      .post('/v1/trips')
      .set(bearer(traveller.tokens.access_token))
      .send({ title: 'Through REST', home_currency: 'CHF' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('TRIP_ALLOWANCE_REACHED');
  });
});

/**
 * Covered on arrival (spec 015, FR-005 to FR-007; amends 014 FR-018, FR-019). A trip past the free
 * number is paid for with what the traveller already holds, with no further step; it is flagged only
 * when nothing can cover it.
 */
describe('sync push: a trip past the free number is covered by what the traveller holds', () => {
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

  const many = (count: number) => Array.from({ length: count }, () => tripRecord());
  const credits = async (traveller: RegisteredTraveller) =>
    (
      (
        await request(app.getHttpServer())
          .get('/v1/me/entitlement')
          .set(bearer(traveller.tokens.access_token))
      ).body as { credits: number }
    ).credits;

  it('spends the credit on the fourth trip and does not flag it', async () => {
    const traveller = await registerTraveller(app);
    await grantCredit(owner, traveller);
    await push(app, traveller, 'trips', many(FREE));
    const fourth = tripRecord();

    const result = await pushOne(app, traveller, 'trips', fourth);

    expect(result).toMatchObject({ status: 'applied' });
    expect(result).not.toHaveProperty('warnings');
    expect(await credits(traveller)).toBe(0);
    expect(await readCovers(owner, traveller)).toEqual([
      expect.objectContaining({ trip_id: fourth.id, source: 'credit' }),
    ]);
  });

  it('flags the fifth trip once the credit is spent', async () => {
    const traveller = await registerTraveller(app);
    await grantCredit(owner, traveller);

    const results = await push(app, traveller, 'trips', many(FREE + 2));

    expect(results.map((r) => 'warnings' in r && r.warnings)).toEqual([
      ...Array<false>(FREE).fill(false),
      false,
      ['over_allowance'],
    ]);
  });

  it('spends one credit, not two, when the same push is delivered twice', async () => {
    const traveller = await registerTraveller(app);
    await grantCredit(owner, traveller);
    await grantCredit(owner, traveller);
    await push(app, traveller, 'trips', many(FREE));
    const fourth = tripRecord();

    await pushOne(app, traveller, 'trips', fourth);
    const retry = await pushOne(app, traveller, 'trips', fourth);

    expect(retry).not.toHaveProperty('warnings');
    expect(await credits(traveller)).toBe(1);
  });

  it('spends a Tier 1 use before a credit', async () => {
    const traveller = await registerTraveller(app);
    await grantCredit(owner, traveller);
    await openPeriod(owner, traveller, { tier: 'tier1' });
    await push(app, traveller, 'trips', many(FREE));
    const fourth = tripRecord();

    await pushOne(app, traveller, 'trips', fourth);

    expect(await credits(traveller)).toBe(1);
    expect(await readCovers(owner, traveller)).toEqual([
      expect.objectContaining({ trip_id: fourth.id, source: 'year' }),
    ]);
  });

  it('covers a trip that was flagged earlier when it is pushed again after a purchase', async () => {
    const traveller = await registerTraveller(app);
    await push(app, traveller, 'trips', many(FREE));
    const fourth = tripRecord();
    const flagged = await pushOne(app, traveller, 'trips', fourth);
    expect(flagged).toMatchObject({ warnings: ['over_allowance'] });

    await grantCredit(owner, traveller);
    const again = await pushOne(app, traveller, 'trips', fourth);

    expect(again).not.toHaveProperty('warnings');
    expect(await credits(traveller)).toBe(0);
  });
});
