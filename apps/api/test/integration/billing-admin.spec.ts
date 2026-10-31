import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { Sql } from 'postgres';

import { grandfatherExistingTrips, shadowReport } from '@/db/billing-admin';

import { bearer, bootTestApp, registerTraveller } from '../support/app';
import { readCovers, readShadow } from '../support/billing';
import { migrationSql } from '../support/db';

/** The owner's switch-on tools (spec 014, FR-026, FR-029; tasks T012, T015, T016). */
describe('billing admin: shadow report and grandfathering', () => {
  let app: NestExpressApplication;
  let owner: Sql;

  beforeAll(async () => {
    app = await bootTestApp({ env: { FREE_TRIP_ALLOWANCE: '1' } });
    owner = migrationSql();
  });

  afterAll(async () => {
    await owner?.end();
    await app?.close();
  });

  const createTrips = async (token: string, count: number): Promise<string[]> => {
    const ids: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const response = await request(app.getHttpServer())
        .post('/v1/trips')
        .set(bearer(token))
        .send({ title: `Trip ${i}`, home_currency: 'EUR' })
        .expect(201);
      ids.push(response.body.trip.id as string);
    }
    return ids;
  };

  test('the report counts travellers and attempts that charging would have stopped', async () => {
    const before = await shadowReport(owner);
    const traveller = await registerTraveller(app);
    await createTrips(traveller.tokens.access_token, 3);

    const after = await shadowReport(owner);

    expect(after.travellers - before.travellers).toBe(1);
    expect(after.attempts - before.attempts).toBe(2);
    expect(after.accounts).toBeGreaterThan(before.accounts - 1);
  });

  test('grandfathering covers every live trip, skips deleted ones, clears the shadow, and is idempotent', async () => {
    const traveller = await registerTraveller(app);
    const ids = await createTrips(traveller.tokens.access_token, 3);
    await request(app.getHttpServer())
      .delete(`/v1/trips/${ids[2]}`)
      .set(bearer(traveller.tokens.access_token))
      .expect(204);

    const first = await grandfatherExistingTrips(owner);
    const second = await grandfatherExistingTrips(owner);

    expect(first).toBeGreaterThanOrEqual(2);
    expect(second).toBe(0);
    const covers = await readCovers(owner, traveller);
    expect(covers.map((c) => c.trip_id).sort()).toEqual([ids[0], ids[1]].sort());
    expect(covers.every((c) => c.source === 'grandfathered')).toBe(true);
    expect(await readShadow(owner, traveller)).toBeUndefined();
    expect((await shadowReport(owner)).travellers).toBe(0);
  });
});
