import type { NestExpressApplication } from '@nestjs/platform-express';
import { MeResponse, TripResponse, type Trip } from '@triptrackr/contracts';
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
 * Travel statistics for the globe overlay (FR-050) — tasks.md T090.
 *
 * `GET /me` carries trips held, countries visited (distinct across every
 * trip) and distance travelled: the great-circle length of each trip's legs
 * in stop order, summed. The expected distances are recomputed here straight
 * from PostGIS, leg by leg, so the assertion checks the aggregation rather
 * than restating it. Tombstoned trips and stops count for nothing (FR-039),
 * and another traveller's trips never enter the sums (Constitution I).
 */
describe('travel statistics (FR-050)', () => {
  let app: NestExpressApplication;
  let owner: Sql;

  beforeAll(async () => {
    app = await bootTestApp();
    owner = migrationSql();
    await seedGeography(owner);
  });

  afterAll(async () => {
    await owner?.end();
    await app?.close();
  });

  const server = () => request(app.getHttpServer());
  const auth = (who: RegisteredTraveller) => bearer(who.tokens.access_token);

  /** Creates a trip with one stop per city, in order, a day apart. */
  async function tripThrough(
    who: RegisteredTraveller,
    cities: readonly number[],
  ): Promise<Trip> {
    const created = await server()
      .post('/v1/trips')
      .set(auth(who))
      .send({ title: 'Stats', home_currency: 'CHF' });
    expect(created.status).toBe(201);
    let trip = TripResponse.parse(created.body).trip;
    for (const [index, city] of cities.entries()) {
      const day = new Date(Date.UTC(2026, 3, 1 + index)).toISOString().slice(0, 10);
      const added = await server()
        .post(`/v1/trips/${trip.id}/stops`)
        .set(auth(who))
        .send({ city_id: city, arrive_date: day, depart_date: day });
      expect(added.status).toBe(201);
      trip = TripResponse.parse(added.body).trip;
    }
    return trip;
  }

  async function statsOf(who: RegisteredTraveller) {
    const response = await server().get('/v1/me').set(auth(who));
    expect(response.status).toBe(200);
    return MeResponse.parse(response.body).stats;
  }

  /** Great-circle kilometres between two seeded cities, from PostGIS itself. */
  async function legKm(from: number, to: number): Promise<number> {
    const [row] = await owner<{ km: number }[]>`
      SELECT ST_Distance(a.location, b.location)::float8 / 1000.0 AS km
      FROM cities a, cities b WHERE a.id = ${from} AND b.id = ${to}
    `;
    return row?.km ?? Number.NaN;
  }

  it('sums every leg of every trip and counts each country once', async () => {
    const traveller = await registerTraveller(app);
    await tripThrough(traveller, [CITY.zurich, CITY.paris, CITY.tokyo]);
    await tripThrough(traveller, [CITY.parthenay, CITY.paris]);

    const expected =
      (await legKm(CITY.zurich, CITY.paris)) +
      (await legKm(CITY.paris, CITY.tokyo)) +
      (await legKm(CITY.parthenay, CITY.paris));

    const stats = await statsOf(traveller);
    expect(stats.trips_held).toBe(2);
    expect(stats.countries_visited).toBe(3);
    expect(stats.total_distance_km).toBeCloseTo(expected, 3);
    // And the magnitude is the real one: Paris → Tokyo alone is ~9,700 km.
    expect(stats.total_distance_km).toBeGreaterThan(10_000);
    expect(stats.total_distance_km).toBeLessThan(11_000);
  });

  it('forgets a deleted stop and a deleted trip entirely (FR-039)', async () => {
    const traveller = await registerTraveller(app);
    const kept = await tripThrough(traveller, [CITY.zurich, CITY.paris, CITY.tokyo]);
    const dropped = await tripThrough(traveller, [CITY.parisTexas, CITY.tokyo]);
    const tokyo = kept.stops.find((s) => s.city_id === CITY.tokyo);

    const stopGone = await server()
      .delete(`/v1/trips/${kept.id}/stops/${tokyo?.id}`)
      .set(auth(traveller));
    expect(stopGone.status).toBe(204);
    const tripGone = await server()
      .delete(`/v1/trips/${dropped.id}`)
      .set(auth(traveller));
    expect(tripGone.status).toBe(204);

    const stats = await statsOf(traveller);
    expect(stats.trips_held).toBe(1);
    expect(stats.countries_visited).toBe(2);
    expect(stats.total_distance_km).toBeCloseTo(await legKm(CITY.zurich, CITY.paris), 3);
  });

  it("never counts another traveller's trips", async () => {
    const traveller = await registerTraveller(app);
    const stranger = await registerTraveller(app);
    await tripThrough(traveller, [CITY.zurich, CITY.paris]);
    await tripThrough(stranger, [CITY.tokyo, CITY.parisTexas]);

    const mine = await statsOf(traveller);
    expect(mine.trips_held).toBe(1);
    expect(mine.countries_visited).toBe(2);
    expect(mine.total_distance_km).toBeCloseTo(await legKm(CITY.zurich, CITY.paris), 3);

    const theirs = await statsOf(stranger);
    expect(theirs.trips_held).toBe(1);
    expect(theirs.countries_visited).toBe(2);
  });

  it('measures a leg across the date line the short way round', async () => {
    const traveller = await registerTraveller(app);
    await tripThrough(traveller, [CITY.tokyo, CITY.parisTexas]);

    // Tokyo → Paris, Texas crosses the Pacific: roughly 10,300 km, where a
    // naive longitude difference going west would suggest nearly 30,000.
    const stats = await statsOf(traveller);
    expect(stats.total_distance_km).toBeGreaterThan(10_000);
    expect(stats.total_distance_km).toBeLessThan(10_700);
  });
});
