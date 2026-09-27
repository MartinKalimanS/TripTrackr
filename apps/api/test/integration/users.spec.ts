import type { NestExpressApplication } from '@nestjs/platform-express';
import { MeResponse } from '@triptrackr/contracts';
import type { Sql } from 'postgres';
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
 * The traveller's own profile through HTTP (rest-api.md §2; FR-008, FR-050).
 *
 * `GET /me` is the profile plus the travel statistics; `PATCH /me` changes
 * exactly what FR-008 lists — display name, bio, avatar, home currency,
 * profile visibility — and nothing else. The response never carries the
 * password hash: the column is not selected and the strict contract would
 * refuse it anyway (contracts/api/auth.ts).
 */
describe('GET / PATCH /me', () => {
  let app: NestExpressApplication;
  let owner: Sql;
  let traveller: RegisteredTraveller;

  beforeAll(async () => {
    app = await bootTestApp();
    owner = migrationSql();
    await seedGeography(owner);
    traveller = await registerTraveller(app, { displayName: 'Ada' });
  });

  afterAll(async () => {
    await owner?.end();
    await app?.close();
  });

  const auth = () => bearer(traveller.tokens.access_token);
  const server = () => request(app.getHttpServer());

  it('returns the profile with empty statistics for a new account, and no hash', async () => {
    const response = await server().get('/v1/me').set(auth());

    expect(response.status).toBe(200);
    const me = MeResponse.parse(response.body);
    expect(me.user).toMatchObject({
      email: traveller.email,
      display_name: 'Ada',
      bio: null,
      avatar_url: null,
      is_profile_public: false,
      email_verified_at: null,
    });
    expect(me.stats).toEqual({
      countries_visited: 0,
      total_distance_km: 0,
      trips_held: 0,
    });
    expect(JSON.stringify(response.body)).not.toMatch(/password|hash|argon/i);
  });

  it('counts countries, distance and trips once stops exist (FR-050)', async () => {
    const created = await server()
      .post('/v1/trips')
      .set(auth())
      .send({ title: 'Two countries', home_currency: 'CHF' });
    const tripId = (created.body as { trip: { id: string } }).trip.id;
    for (const [city, offset] of [
      [CITY.zurich, 10],
      [CITY.paris, 12],
    ] as const) {
      const arrive = new Date(Date.now() + offset * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const response = await server()
        .post(`/v1/trips/${tripId}/stops`)
        .set(auth())
        .send({ city_id: city, arrive_date: arrive, depart_date: arrive });
      expect(response.status).toBe(201);
    }

    const me = MeResponse.parse((await server().get('/v1/me').set(auth())).body);

    expect(me.stats.trips_held).toBe(1);
    expect(me.stats.countries_visited).toBe(2);
    // Zürich → Paris is roughly 490 km as the crow flies.
    expect(me.stats.total_distance_km).toBeGreaterThan(400);
    expect(me.stats.total_distance_km).toBeLessThan(600);
  });

  it('patches each editable field and echoes the whole profile back', async () => {
    const response = await server().patch('/v1/me').set(auth()).send({
      display_name: '  Ada L.  ',
      bio: 'Slow traveller.',
      avatar_url: 'https://cdn.example.test/ada.png',
      home_currency: 'GBP',
      is_profile_public: true,
    });

    expect(response.status).toBe(200);
    expect(MeResponse.parse(response.body).user).toMatchObject({
      display_name: 'Ada L.',
      bio: 'Slow traveller.',
      avatar_url: 'https://cdn.example.test/ada.png',
      home_currency: 'GBP',
      is_profile_public: true,
    });

    const cleared = await server()
      .patch('/v1/me')
      .set(auth())
      .send({ bio: null, avatar_url: null, is_profile_public: false });
    expect(MeResponse.parse(cleared.body).user).toMatchObject({
      bio: null,
      avatar_url: null,
      is_profile_public: false,
      display_name: 'Ada L.',
    });
  });

  it('refuses an empty patch, an unknown field, and the email (not a profile edit)', async () => {
    const empty = await server().patch('/v1/me').set(auth()).send({});
    const email = await server()
      .patch('/v1/me')
      .set(auth())
      .send({ email: 'x@example.test' });
    const hash = await server()
      .patch('/v1/me')
      .set(auth())
      .send({ password_hash: 'pwned' });

    expect(empty.status).toBe(400);
    expect(email.status).toBe(400);
    expect(hash.status).toBe(400);
  });

  it('requires a session', async () => {
    expect((await server().get('/v1/me')).status).toBe(401);
    expect((await server().patch('/v1/me').send({ bio: 'x' })).status).toBe(401);
  });
});
