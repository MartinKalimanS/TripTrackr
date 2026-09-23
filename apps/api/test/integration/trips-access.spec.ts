import type { NestExpressApplication } from '@nestjs/platform-express';
import { ApiError, TripResponse } from '@triptrackr/contracts';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import {
  bearer,
  bootTestApp,
  registerTraveller,
  type RegisteredTraveller,
} from '../support/app';
import { migrationSql } from '../support/db';
import { CITY, seedGeography } from '../support/geography';

/**
 * Contract test 4 (rest-api.md "Contract tests"; contracts/README.md rule 1):
 * a non-owner requesting an existing private trip receives *exactly* the
 * not-found response. A distinguishable 403 confirms the resource exists,
 * which is a disclosure.
 *
 * Written as B, against A, through HTTP — every route User Story 1 exposes
 * under `/trips/:id`. Each refusal is compared byte for byte with the same
 * request made against a uuid that names nothing, because "same status code"
 * is not the obligation; the same body is.
 */
describe('contract 4 — a stranger sees exactly not-found', () => {
  let app: NestExpressApplication;
  let owner: RegisteredTraveller;
  let stranger: RegisteredTraveller;
  let tripId: string;
  let stopId: string;

  beforeAll(async () => {
    app = await bootTestApp();

    const sql = migrationSql();
    try {
      await seedGeography(sql);
    } finally {
      await sql.end();
    }

    owner = await registerTraveller(app, { displayName: 'Owner A' });
    stranger = await registerTraveller(app, { displayName: 'Stranger B' });

    const created = await request(app.getHttpServer())
      .post('/v1/trips')
      .set(bearer(owner.tokens.access_token))
      .send({ title: 'A private trip', home_currency: 'CHF' });
    tripId = TripResponse.parse(created.body).trip.id;

    const withStop = await request(app.getHttpServer())
      .post(`/v1/trips/${tripId}/stops`)
      .set(bearer(owner.tokens.access_token))
      .send({
        city_id: CITY.zurich,
        arrive_date: '2030-06-01',
        depart_date: '2030-06-03',
      });
    stopId = TripResponse.parse(withStop.body).trip.stops[0]?.id ?? '';
  });

  afterAll(async () => {
    await app?.close();
  });

  type Method = 'get' | 'patch' | 'delete' | 'post';

  interface Attempt {
    readonly name: string;
    readonly method: Method;
    readonly path: (trip: string) => string;
    readonly body?: Record<string, unknown>;
  }

  const attempts: readonly Attempt[] = [
    { name: 'GET /trips/:id', method: 'get', path: (t) => `/v1/trips/${t}` },
    {
      name: 'PATCH /trips/:id',
      method: 'patch',
      path: (t) => `/v1/trips/${t}`,
      body: { title: 'Hijacked' },
    },
    { name: 'DELETE /trips/:id', method: 'delete', path: (t) => `/v1/trips/${t}` },
    {
      name: 'POST /trips/:id/stops',
      method: 'post',
      path: (t) => `/v1/trips/${t}/stops`,
      body: { city_id: CITY.paris, arrive_date: '2030-07-01', depart_date: '2030-07-02' },
    },
    {
      name: 'PATCH /trips/:id/stops/:stopId',
      method: 'patch',
      path: (t) => `/v1/trips/${t}/stops/${stopId}`,
      body: { depart_date: '2030-06-09' },
    },
    {
      name: 'DELETE /trips/:id/stops/:stopId',
      method: 'delete',
      path: (t) => `/v1/trips/${t}/stops/${stopId}`,
    },
    { name: 'GET /trips/:id/arcs', method: 'get', path: (t) => `/v1/trips/${t}/arcs` },
  ];

  const asStranger = (attempt: Attempt, trip: string) =>
    request(app.getHttpServer())
      [attempt.method](attempt.path(trip))
      .set(bearer(stranger.tokens.access_token))
      .send(attempt.body ?? {});

  it.each(attempts.map((a) => [a.name, a] as const))(
    "%s — B gets the same 404 body for A's trip as for a uuid that names nothing",
    async (_name, attempt) => {
      // Act
      const existing = await asStranger(attempt, tripId);
      const nonexistent = await asStranger(attempt, randomUUID());

      // Assert
      expect(existing.status).toBe(404);
      expect(nonexistent.status).toBe(404);
      expect(JSON.stringify(existing.body)).toBe(JSON.stringify(nonexistent.body));

      const parsed = ApiError.safeParse(existing.body);
      expect(parsed.success).toBe(true);
      expect(existing.body).toMatchObject({ error: { code: 'TRIP_NOT_FOUND' } });
      expect(JSON.stringify(existing.body)).not.toMatch(/forbidden|permission|owner/i);
    },
  );

  it("leaves A's trip untouched after every attempt above", async () => {
    // The refusals must be refusals: a 404 that nonetheless applied the write
    // would be worse than a 403.
    const response = await request(app.getHttpServer())
      .get(`/v1/trips/${tripId}`)
      .set(bearer(owner.tokens.access_token));

    expect(response.status).toBe(200);
    const { trip } = TripResponse.parse(response.body);
    expect(trip.title).toBe('A private trip');
    expect(trip.stops).toHaveLength(1);
    expect(trip.stops[0]?.depart_date).toBe('2030-06-03');
  });

  it("does not list A's trip for B", async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/trips')
      .set(bearer(stranger.tokens.access_token));

    expect(response.status).toBe(200);
    const ids = (response.body as { trips: { id: string }[] }).trips.map((t) => t.id);
    expect(ids).not.toContain(tripId);
  });

  it('refuses a malformed id without a database lookup, in the same envelope', async () => {
    // Not a disclosure question — nothing can exist at a non-uuid — but the
    // refusal still has to be the one envelope (FR-072).
    const response = await request(app.getHttpServer())
      .get('/v1/trips/not-a-uuid')
      .set(bearer(stranger.tokens.access_token));

    expect(response.status).toBe(400);
    expect(ApiError.safeParse(response.body).success).toBe(true);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });
});
