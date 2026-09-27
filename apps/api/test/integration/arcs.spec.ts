import type { NestExpressApplication } from '@nestjs/platform-express';
import { ArcsResponse, TripResponse, type Trip } from '@triptrackr/contracts';
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
 * Arcs are derived from the stop list, never stored (FR-016) — tasks.md T089.
 *
 * `GET /trips/:id/arcs` pairs each live stop with the next in stop order, so
 * every edit of the list — a stop inserted mid-trip, a reorder, a deletion —
 * is what the next read draws, with nothing to maintain in between. Each arc
 * also carries its trip's derived lifecycle status, which is what lets the
 * globe tell planning, active and past trips apart (FR-046).
 */

/** `YYYY-MM-DD`, `offsetDays` from today, UTC. */
function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

describe('arcs follow the stop list (FR-016)', () => {
  let app: NestExpressApplication;
  let owner: Sql;
  let traveller: RegisteredTraveller;

  beforeAll(async () => {
    app = await bootTestApp();
    owner = migrationSql();
    await seedGeography(owner);
    traveller = await registerTraveller(app);
  });

  afterAll(async () => {
    await owner?.end();
    await app?.close();
  });

  const auth = () => bearer(traveller.tokens.access_token);
  const server = () => request(app.getHttpServer());

  async function createTrip(): Promise<Trip> {
    const response = await server()
      .post('/v1/trips')
      .set(auth())
      .send({ title: 'Arcs', home_currency: 'CHF' });
    expect(response.status).toBe(201);
    return TripResponse.parse(response.body).trip;
  }

  async function addStop(tripId: string, stop: Record<string, unknown>): Promise<Trip> {
    const response = await server()
      .post(`/v1/trips/${tripId}/stops`)
      .set(auth())
      .send(stop);
    expect(response.status).toBe(201);
    return TripResponse.parse(response.body).trip;
  }

  async function arcsOf(tripId: string) {
    const response = await server().get(`/v1/trips/${tripId}/arcs`).set(auth());
    expect(response.status).toBe(200);
    return ArcsResponse.parse(response.body).features;
  }

  async function pairsOf(tripId: string): Promise<[number, number][]> {
    return (await arcsOf(tripId)).map((f) => [
      f.properties.from_city_id,
      f.properties.to_city_id,
    ]);
  }

  it('draws a stop inserted mid-trip on the next read, with nothing else to update', async () => {
    const trip = await createTrip();
    await addStop(trip.id, {
      city_id: CITY.zurich,
      arrive_date: isoDate(30),
      depart_date: isoDate(33),
    });
    await addStop(trip.id, {
      city_id: CITY.tokyo,
      arrive_date: isoDate(40),
      depart_date: isoDate(45),
    });
    expect(await pairsOf(trip.id)).toEqual([[CITY.zurich, CITY.tokyo]]);

    await addStop(trip.id, {
      city_id: CITY.paris,
      arrive_date: isoDate(34),
      depart_date: isoDate(39),
      sort_order: 1,
    });

    expect(await pairsOf(trip.id)).toEqual([
      [CITY.zurich, CITY.paris],
      [CITY.paris, CITY.tokyo],
    ]);
  });

  it('follows a reorder and a deletion the same way', async () => {
    const trip = await createTrip();
    await addStop(trip.id, {
      city_id: CITY.zurich,
      arrive_date: isoDate(30),
      depart_date: isoDate(33),
    });
    await addStop(trip.id, {
      city_id: CITY.paris,
      arrive_date: isoDate(34),
      depart_date: isoDate(39),
    });
    const three = await addStop(trip.id, {
      city_id: CITY.tokyo,
      arrive_date: isoDate(40),
      depart_date: isoDate(45),
    });
    const tokyo = three.stops.find((s) => s.city_id === CITY.tokyo);
    const paris = three.stops.find((s) => s.city_id === CITY.paris);

    const moved = await server()
      .patch(`/v1/trips/${trip.id}/stops/${tokyo?.id}`)
      .set(auth())
      .send({ sort_order: 0 });
    expect(moved.status).toBe(200);
    expect(await pairsOf(trip.id)).toEqual([
      [CITY.tokyo, CITY.zurich],
      [CITY.zurich, CITY.paris],
    ]);

    const deleted = await server()
      .delete(`/v1/trips/${trip.id}/stops/${paris?.id}`)
      .set(auth());
    expect(deleted.status).toBe(204);
    expect(await pairsOf(trip.id)).toEqual([[CITY.tokyo, CITY.zurich]]);
  });

  it("labels every arc with its trip's derived status so the globe can style it (FR-046)", async () => {
    const underWay = await createTrip();
    await addStop(underWay.id, {
      city_id: CITY.zurich,
      arrive_date: isoDate(-3),
      depart_date: isoDate(1),
    });
    await addStop(underWay.id, {
      city_id: CITY.paris,
      arrive_date: isoDate(2),
      depart_date: isoDate(5),
    });
    const finished = await createTrip();
    await addStop(finished.id, {
      city_id: CITY.paris,
      arrive_date: isoDate(-30),
      depart_date: isoDate(-28),
    });
    await addStop(finished.id, {
      city_id: CITY.tokyo,
      arrive_date: isoDate(-27),
      depart_date: isoDate(-20),
    });

    const statusesOf = async (tripId: string) =>
      (await arcsOf(tripId)).map((f) => f.properties.status);

    expect(await statusesOf(underWay.id)).toEqual(['active']);
    expect(await statusesOf(finished.id)).toEqual(['past']);
  });
});
