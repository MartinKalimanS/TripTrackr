import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Sql } from 'postgres';
import request from 'supertest';

import {
  bearer,
  bootTestApp,
  registerTraveller,
  type RegisteredTraveller,
} from '../support/app';
import { readCovers, readShadow } from '../support/billing';
import { migrationSql } from '../support/db';

/**
 * Charging is off (spec 014, user story 1; FR-026, FR-027; research D14-07). Nobody is blocked,
 * nobody sees a limit or a price, and the product quietly records who would have been stopped so
 * the owner can size the paywall before switching charging on.
 */
const FREE = 3;

describe('paid allowance: charging off (shadow mode)', () => {
  let app: NestExpressApplication;
  let owner: Sql;

  beforeAll(async () => {
    app = await bootTestApp({ env: { FREE_TRIP_ALLOWANCE: String(FREE) } });
    owner = migrationSql();
  });

  afterAll(async () => {
    await owner?.end();
    await app?.close();
  });

  const createTrip = (t: RegisteredTraveller, title = 'A trip') =>
    request(app.getHttpServer())
      .post('/v1/trips')
      .set(bearer(t.tokens.access_token))
      .send({ title, home_currency: 'EUR' });

  test('every create succeeds with the body of a trip and nothing about money', async () => {
    const traveller = await registerTraveller(app);

    for (let i = 1; i <= FREE + 3; i += 1) {
      const response = await createTrip(traveller, `Trip ${i}`);

      expect(response.status).toBe(201);
      expect(Object.keys(response.body as object)).toEqual(['trip']);
      expect(JSON.stringify(response.body)).not.toMatch(
        /allowance|entitle|subscri|payment|credit|covered|"cover"/i,
      );
    }
  });

  test('no trip is covered while charging is off', async () => {
    const traveller = await registerTraveller(app);
    for (let i = 0; i < FREE + 1; i += 1) await createTrip(traveller);

    expect(await readCovers(owner, traveller)).toEqual([]);
  });

  test('a traveller past the free number is recorded once per attempt', async () => {
    const traveller = await registerTraveller(app);
    for (let i = 0; i < FREE + 3; i += 1) await createTrip(traveller);

    expect(await readShadow(owner, traveller)).toEqual({ attempts: 3 });
  });

  test('a traveller within the free number is never recorded', async () => {
    const traveller = await registerTraveller(app);
    for (let i = 0; i < FREE; i += 1) await createTrip(traveller);

    expect(await readShadow(owner, traveller)).toBeUndefined();
  });

  test('deleting a trip first means the next create is not a would-have-been-stopped one', async () => {
    const traveller = await registerTraveller(app);
    const ids: string[] = [];
    for (let i = 0; i < FREE; i += 1) {
      ids.push((await createTrip(traveller)).body.trip.id as string);
    }
    await request(app.getHttpServer())
      .delete(`/v1/trips/${ids[0]}`)
      .set(bearer(traveller.tokens.access_token))
      .expect(204);

    await createTrip(traveller);

    expect(await readShadow(owner, traveller)).toBeUndefined();
  });

  test('the shadow row holds a count and nothing a traveller wrote', async () => {
    const traveller = await registerTraveller(app);
    for (let i = 0; i < FREE + 1; i += 1) await createTrip(traveller, 'Private title');

    const columns = await owner<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'allowance_shadow' ORDER BY column_name`;

    expect(columns.map((c) => c.column_name)).toEqual([
      'attempts',
      'first_blocked_at',
      'user_id',
    ]);
  });

  test('a replayed create does not count as another attempt', async () => {
    const traveller = await registerTraveller(app);
    for (let i = 0; i < FREE; i += 1) await createTrip(traveller);
    const id = '7a1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e51';

    await request(app.getHttpServer())
      .post('/v1/trips')
      .set(bearer(traveller.tokens.access_token))
      .send({ id, title: 'Over', home_currency: 'EUR' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/v1/trips')
      .set(bearer(traveller.tokens.access_token))
      .send({ id, title: 'Over', home_currency: 'EUR' })
      .expect(201);

    expect(await readShadow(owner, traveller)).toEqual({ attempts: 1 });
  });
});
