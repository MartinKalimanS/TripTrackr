import type { NestExpressApplication } from '@nestjs/platform-express';
import { TRIP_ALLOWANCE_REACHED, TripAllowanceDetails } from '@triptrackr/contracts';
import type { Sql } from 'postgres';
import request from 'supertest';

import { bearer, registerTraveller, type RegisteredTraveller } from '../support/app';
import { bootCharging, readCovers, readShadow } from '../support/billing';
import { migrationSql } from '../support/db';

/**
 * The free limit and its refusal (spec 014, user story 2; FR-001 to FR-003, FR-007, FR-008, FR-016,
 * FR-017). Charging is on: a traveller holds 3 ordinary trips for free, the next create is refused
 * with every way forward and what they typed, and deleting a trip makes room.
 */
const FREE = 3;

describe('paid allowance: the free limit (charging on)', () => {
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
  const createTrip = (t: RegisteredTraveller, body: Record<string, unknown> = {}) =>
    server()
      .post('/v1/trips')
      .set(auth(t))
      .send({ title: 'A trip', home_currency: 'EUR', ...body });

  const fill = async (t: RegisteredTraveller, count: number): Promise<string[]> => {
    const ids: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const response = await createTrip(t, { title: `Trip ${i + 1}` });
      expect(response.status).toBe(201);
      ids.push(response.body.trip.id as string);
    }
    return ids;
  };

  describe('below the limit', () => {
    test('the free trips answer 201 with no allowance or payment wording anywhere', async () => {
      const traveller = await registerTraveller(app);

      for (let i = 0; i < FREE; i += 1) {
        const response = await createTrip(traveller, { title: `Trip ${i}` });

        expect(response.status).toBe(201);
        expect(Object.keys(response.body as object)).toEqual(['trip']);
        expect(JSON.stringify(response.body)).not.toMatch(
          /allowance|entitle|subscri|payment|credit|covered|"cover"/i,
        );
      }
    });

    test('a free trip is not covered', async () => {
      const traveller = await registerTraveller(app);
      await fill(traveller, FREE);

      expect(await readCovers(owner, traveller)).toEqual([]);
    });

    test('charging on does not record a would-have-been-stopped traveller', async () => {
      const traveller = await registerTraveller(app);
      await fill(traveller, FREE);
      await createTrip(traveller);

      expect(await readShadow(owner, traveller)).toBeUndefined();
    });
  });

  describe('at the limit', () => {
    test('the next create is a 409 with the counts, every route and the echoed submission', async () => {
      const traveller = await registerTraveller(app);
      await fill(traveller, FREE);

      const response = await createTrip(traveller, {
        title: 'Lisbon in March',
        home_currency: 'CHF',
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe(TRIP_ALLOWANCE_REACHED);
      expect(TripAllowanceDetails.parse(response.body.error.details)).toEqual({
        trips_held: FREE,
        allowance: FREE,
        year_uses_left: 0,
        credits: 0,
        routes: ['buy_trip', 'subscribe', 'delete_trip'],
        submitted: { title: 'Lisbon in March', home_currency: 'CHF' },
      });
    });

    test('the refused create writes nothing', async () => {
      const traveller = await registerTraveller(app);
      await fill(traveller, FREE);

      await createTrip(traveller, { title: 'Refused' });

      const [trips] = await owner`
        SELECT count(*)::int AS n FROM trips WHERE owner_id = ${traveller.tokens.user.id}::uuid`;
      expect(trips?.n).toBe(FREE);
      expect(await readCovers(owner, traveller)).toEqual([]);
    });

    test('deleting a trip frees its slot at once', async () => {
      const traveller = await registerTraveller(app);
      const ids = await fill(traveller, FREE);
      await server().delete(`/v1/trips/${ids[0]}`).set(auth(traveller)).expect(204);

      const response = await createTrip(traveller, { title: 'Room again' });

      expect(response.status).toBe(201);
    });

    test('a replay of a create the traveller already owns is a 201, not a refusal', async () => {
      const traveller = await registerTraveller(app);
      const id = '6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e50';
      await createTrip(traveller, { id, title: 'First' }).expect(201);
      await fill(traveller, FREE - 1);

      const replay = await createTrip(traveller, { id, title: 'First' });

      expect(replay.status).toBe(201);
      expect(replay.body.trip.id).toBe(id);
    });

    test('two simultaneous creates cannot both take the last slot', async () => {
      const traveller = await registerTraveller(app);
      await fill(traveller, FREE - 1);

      const [a, b] = await Promise.all([
        createTrip(traveller, { title: 'Race A' }),
        createTrip(traveller, { title: 'Race B' }),
      ]);

      expect([a.status, b.status].sort()).toEqual([201, 409]);
    });

    test('another traveller is not counted against anyone', async () => {
      const full = await registerTraveller(app);
      await fill(full, FREE);
      const other = await registerTraveller(app);

      expect((await createTrip(other)).status).toBe(201);
    });
  });
});
