import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  EntitlementResponse,
  TRIP_ALLOWANCE_REACHED,
  TripAllowanceDetails,
} from '@triptrackr/contracts';
import type { Sql } from 'postgres';
import request from 'supertest';

import {
  bearer,
  bootTestApp,
  registerTraveller,
  type RegisteredTraveller,
} from '../support/app';
import { migrationSql } from '../support/db';

/**
 * Contract tests for the trip allowance (rest-api.md §3, "Contract tests" 5 to 7; FR-074 to FR-084;
 * tasks T172 to T174, T177). The allowance is read by `POST /trips` and nowhere else.
 */
const ALLOWANCE = 5;

describe('trip allowance (spec 013)', () => {
  let app: NestExpressApplication;
  let owner: Sql;

  beforeAll(async () => {
    app = await bootTestApp();
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

  const subscribe = async (
    t: RegisteredTraveller,
    active: boolean,
    periodEnd?: string,
  ) => {
    await owner`
      INSERT INTO subscriptions (user_id, is_active, current_period_end, provider)
      VALUES (${t.tokens.user.id}::uuid, ${active}, ${periodEnd ?? null}, 'app_store')
      ON CONFLICT (user_id) DO UPDATE
        SET is_active = EXCLUDED.is_active, current_period_end = EXCLUDED.current_period_end`;
  };

  describe('below the allowance (contract 6, FR-084)', () => {
    test('a create answers 201 with the trip and no allowance or payment field anywhere', async () => {
      const traveller = await registerTraveller(app);

      const response = await createTrip(traveller);

      expect(response.status).toBe(201);
      expect(Object.keys(response.body as object)).toEqual(['trip']);
      expect(JSON.stringify(response.body)).not.toMatch(
        /allowance|entitle|subscri|payment/i,
      );
    });

    test('the last free slot is still a 201', async () => {
      const traveller = await registerTraveller(app);

      await fill(traveller, ALLOWANCE);
    });
  });

  describe('at the allowance (contract 5, FR-077, FR-079)', () => {
    test('a create answers 409 with the counts, both routes and the echoed submission', async () => {
      const traveller = await registerTraveller(app);
      await fill(traveller, ALLOWANCE);

      const response = await createTrip(traveller, {
        title: 'Lisbon in March',
        home_currency: 'CHF',
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe(TRIP_ALLOWANCE_REACHED);
      expect(response.body.error.message).toContain(`${ALLOWANCE} of ${ALLOWANCE}`);
      expect(TripAllowanceDetails.parse(response.body.error.details)).toEqual({
        trips_held: ALLOWANCE,
        allowance: ALLOWANCE,
        routes: ['subscribe', 'delete_trip'],
        submitted: { title: 'Lisbon in March', home_currency: 'CHF' },
      });
    });

    test('the refused create writes nothing', async () => {
      const traveller = await registerTraveller(app);
      await fill(traveller, ALLOWANCE);

      await createTrip(traveller, { title: 'Refused' });

      const [row] = await owner`
        SELECT count(*)::int AS n FROM trips
        WHERE owner_id = ${traveller.tokens.user.id}::uuid`;
      expect(row?.n).toBe(ALLOWANCE);
    });

    test('deleting a trip frees its slot at once (FR-075)', async () => {
      const traveller = await registerTraveller(app);
      const ids = await fill(traveller, ALLOWANCE);
      await server().delete(`/v1/trips/${ids[0]}`).set(auth(traveller)).expect(204);

      const response = await createTrip(traveller, { title: 'Room again' });

      expect(response.status).toBe(201);
    });

    test('repeated delete-and-recreate never drifts the count (T177)', async () => {
      const traveller = await registerTraveller(app);
      const ids = await fill(traveller, ALLOWANCE);

      for (let round = 0; round < 3; round += 1) {
        await server().delete(`/v1/trips/${ids[0]}`).set(auth(traveller)).expect(204);
        const created = await createTrip(traveller, { title: `Round ${round}` });
        expect(created.status).toBe(201);
        ids[0] = created.body.trip.id as string;
        expect((await createTrip(traveller)).status).toBe(409);
      }

      const entitlement = await server().get('/v1/me/entitlement').set(auth(traveller));
      expect(entitlement.body.trips_held).toBe(ALLOWANCE);
    });

    test('a replay of a create the traveller already owns is a 201, not a refusal (FR-007)', async () => {
      const traveller = await registerTraveller(app);
      const id = '6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e4f';
      await createTrip(traveller, { id, title: 'First' }).expect(201);
      await fill(traveller, ALLOWANCE - 1);

      const replay = await createTrip(traveller, { id, title: 'First' });

      expect(replay.status).toBe(201);
      expect(replay.body.trip.id).toBe(id);
    });

    test('two concurrent creates cannot both take the last slot (FR-006)', async () => {
      const traveller = await registerTraveller(app);
      await fill(traveller, ALLOWANCE - 1);

      const [a, b] = await Promise.all([
        createTrip(traveller, { title: 'Race A' }),
        createTrip(traveller, { title: 'Race B' }),
      ]);

      expect([a.status, b.status].sort()).toEqual([201, 409]);
    });

    test('an account with no trips of its own is not counted against anyone else', async () => {
      const full = await registerTraveller(app);
      await fill(full, ALLOWANCE);
      const other = await registerTraveller(app);

      expect((await createTrip(other)).status).toBe(201);
    });
  });

  describe('entitlement', () => {
    test('an active entitlement lifts the limit (FR-003)', async () => {
      const traveller = await registerTraveller(app);
      await fill(traveller, ALLOWANCE);
      await subscribe(traveller, true, '2099-01-01T00:00:00Z');

      const response = await createTrip(traveller, { title: 'Sixth' });

      expect(response.status).toBe(201);
    });

    test('a lapsed entitlement hides, locks and deletes nothing (contract 7, FR-076, FR-080)', async () => {
      const traveller = await registerTraveller(app);
      await subscribe(traveller, true, '2099-01-01T00:00:00Z');
      const ids = await fill(traveller, ALLOWANCE + 2);

      const readsWhileActive = await readEverything(traveller, ids[0] as string);
      await subscribe(traveller, false, '2020-01-01T00:00:00Z');
      const readsWhileLapsed = await readEverything(traveller, ids[0] as string);

      expect(readsWhileLapsed).toEqual(readsWhileActive);
      expect(readsWhileLapsed.list).toHaveLength(ALLOWANCE + 2);
      // Only creation is affected.
      expect((await createTrip(traveller)).status).toBe(409);
    });

    const readEverything = async (traveller: RegisteredTraveller, tripId: string) => {
      const list = await server().get('/v1/trips').set(auth(traveller)).expect(200);
      const one = await server()
        .get(`/v1/trips/${tripId}`)
        .set(auth(traveller))
        .expect(200);
      const arcs = await server().get(`/v1/trips/${tripId}/arcs`).set(auth(traveller));
      return {
        list: list.body.trips as unknown[],
        one: one.body,
        arcsStatus: arcs.status,
      };
    };

    test('GET /me/entitlement reports the live count, the allowance and the period end (FR-077, FR-082)', async () => {
      const traveller = await registerTraveller(app);
      await fill(traveller, 2);
      await subscribe(traveller, true, '2099-01-01T00:00:00.000Z');

      const response = await server().get('/v1/me/entitlement').set(auth(traveller));

      expect(response.status).toBe(200);
      expect(EntitlementResponse.parse(response.body)).toEqual({
        is_active: true,
        current_period_end: '2099-01-01T00:00:00.000Z',
        trips_held: 2,
        allowance: ALLOWANCE,
      });
    });

    test('with no subscription row the answer is inactive with no period end', async () => {
      const traveller = await registerTraveller(app);

      const response = await server().get('/v1/me/entitlement').set(auth(traveller));

      expect(EntitlementResponse.parse(response.body)).toEqual({
        is_active: false,
        current_period_end: null,
        trips_held: 0,
        allowance: ALLOWANCE,
      });
    });

    test('the endpoint needs a signed-in traveller', async () => {
      await server().get('/v1/me/entitlement').expect(401);
    });
  });
});
