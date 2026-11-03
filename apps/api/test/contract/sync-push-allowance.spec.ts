import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { AllowanceService } from '@/modules/billing/allowance.service';

import { bearer, registerTraveller } from '../support/app';
import { bootCharging } from '../support/billing';
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

    expect(first).toEqual([{ id: over.id, status: 'applied', warnings: ['over_allowance'] }]);
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
