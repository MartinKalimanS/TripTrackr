import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  ApiError,
  ArcsResponse,
  TripResponse,
  TripsResponse,
  type Trip,
} from '@triptrackr/contracts';
import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import request from 'supertest';

import {
  bearer,
  bootTestApp,
  registerTraveller,
  type RegisteredTraveller,
} from '../support/app';
import { migrationSql } from '../support/db';
import { grantEntitlement } from '../support/entitlement';
import { CITY, seedGeography } from '../support/geography';

/**
 * Trips and stops through HTTP (rest-api.md §3; FR-009 to FR-013, FR-016).
 *
 * A trip is an ordered sequence of city stops, never an origin and a
 * destination (FR-010); the order is the traveller's to change (FR-012); the
 * one date rule is that a stop may not depart before it arrives (FR-011); and
 * the lifecycle status is derived from the dates rather than set (FR-013).
 * Every date below is relative to today so the derived status is the same
 * whichever day the suite runs.
 */

/** `YYYY-MM-DD`, `offsetDays` from today, UTC. */
function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

describe('trips and stops', () => {
  let app: NestExpressApplication;
  let owner: Sql;
  let traveller: RegisteredTraveller;

  beforeAll(async () => {
    app = await bootTestApp();
    owner = migrationSql();
    await seedGeography(owner);
    traveller = await registerTraveller(app);
    // One traveller creates many trips here; the free allowance is not under test (see trip-allowance.spec.ts).
    await grantEntitlement(owner, traveller);
  });

  afterAll(async () => {
    await owner?.end();
    await app?.close();
  });

  const auth = () => bearer(traveller.tokens.access_token);
  const server = () => request(app.getHttpServer());

  async function createTrip(body: Record<string, unknown> = {}): Promise<Trip> {
    const response = await server()
      .post('/v1/trips')
      .set(auth())
      .send({ title: 'Alpine spring', home_currency: 'CHF', ...body });

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

  describe('POST /trips (FR-009)', () => {
    it('creates a planning trip with no stops and no allowance or payment field at all (FR-084)', async () => {
      const response = await server()
        .post('/v1/trips')
        .set(auth())
        .send({ title: 'Alpine spring', home_currency: 'CHF' });

      expect(response.status).toBe(201);
      const { trip } = TripResponse.parse(response.body);
      expect(trip).toMatchObject({
        title: 'Alpine spring',
        home_currency: 'CHF',
        status: 'planning',
        is_public: false,
        cover_photo_id: null,
        stops: [],
      });
      // Not a field set to false — no field. A traveller below the allowance
      // must see no reference to allowances or payment (FR-084).
      expect(JSON.stringify(response.body)).not.toMatch(
        /allowance|payment|subscri|entitle/i,
      );
    });

    it('honours a client-chosen id, and a retried create is the same create (research D-15)', async () => {
      const id = randomUUID();

      const first = await createTrip({ id, title: 'Chosen id' });
      const retry = await server()
        .post('/v1/trips')
        .set(auth())
        .send({ id, title: 'Chosen id', home_currency: 'CHF' });

      expect(first.id).toBe(id);
      expect(retry.status).toBe(201);
      expect(TripResponse.parse(retry.body).trip.id).toBe(id);

      const listed = await server().get('/v1/trips').set(auth());
      const matching = TripsResponse.parse(listed.body).trips.filter((t) => t.id === id);
      expect(matching).toHaveLength(1);
    });

    it('rejects a supplied status — it is derived, never set (FR-013)', async () => {
      const response = await server()
        .post('/v1/trips')
        .set(auth())
        .send({ title: 'Sneaky', home_currency: 'CHF', status: 'active' });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    });

    it('reports validation problems as paths and messages, never zod internals', async () => {
      const response = await server()
        .post('/v1/trips')
        .set(auth())
        .send({ title: '', home_currency: 'chf' });

      expect(response.status).toBe(400);
      expect(ApiError.safeParse(response.body).success).toBe(true);

      const details = (response.body as ApiError).error.details as {
        issues: { path: string; message: string }[];
      };
      const paths = details.issues.map((i) => i.path).sort();
      expect(paths).toEqual(['home_currency', 'title']);
      expect(JSON.stringify(response.body)).not.toMatch(
        /"code":"(too_small|invalid_format)"/,
      );
    });
  });

  describe('stops (FR-010, FR-011, FR-012)', () => {
    it('appends stops in order and embeds the city on each', async () => {
      // Arrange
      const trip = await createTrip();

      // Act
      await addStop(trip.id, {
        city_id: CITY.zurich,
        arrive_date: isoDate(30),
        depart_date: isoDate(33),
      });
      const withTwo = await addStop(trip.id, {
        city_id: CITY.tokyo,
        arrive_date: isoDate(40),
        depart_date: isoDate(45),
      });

      // Assert
      expect(withTwo.stops.map((s) => [s.sort_order, s.city.name])).toEqual([
        [0, 'Zürich'],
        [1, 'Tokyo'],
      ]);
      expect(withTwo.stops[0]?.city).toMatchObject({
        id: CITY.zurich,
        ascii_name: 'Zurich',
        timezone: 'Europe/Zurich',
      });
      expect(withTwo.stops[0]?.city.lat).toBeCloseTo(47.3769, 3);
      expect(withTwo.stops[0]?.city.lng).toBeCloseTo(8.5417, 3);
    });

    it('inserts a stop in the middle via sort_order and renumbers the rest', async () => {
      // Arrange — Zürich, Tokyo.
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

      // Act — Paris goes between them.
      const updated = await addStop(trip.id, {
        city_id: CITY.paris,
        arrive_date: isoDate(34),
        depart_date: isoDate(39),
        sort_order: 1,
      });

      // Assert — contiguous 0..n-1, Paris second.
      expect(updated.stops.map((s) => [s.sort_order, s.city.name])).toEqual([
        [0, 'Zürich'],
        [1, 'Paris'],
        [2, 'Tokyo'],
      ]);
    });

    it('reorders a stop with PATCH sort_order', async () => {
      // Arrange — Zürich, Paris, Tokyo.
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

      // Act — Tokyo moves to the front.
      const response = await server()
        .patch(`/v1/trips/${trip.id}/stops/${tokyo?.id}`)
        .set(auth())
        .send({ sort_order: 0 });

      // Assert
      expect(response.status).toBe(200);
      const reordered = TripResponse.parse(response.body).trip;
      expect(reordered.stops.map((s) => [s.sort_order, s.city.name])).toEqual([
        [0, 'Tokyo'],
        [1, 'Zürich'],
        [2, 'Paris'],
      ]);
    });

    it('patches one date and validates the pair the row ends up with', async () => {
      // Arrange
      const trip = await createTrip();
      const one = await addStop(trip.id, {
        city_id: CITY.zurich,
        arrive_date: isoDate(30),
        depart_date: isoDate(33),
      });
      const stopId = one.stops[0]?.id;

      // Act — a later departure is fine; an arrival after the departure is not.
      const extended = await server()
        .patch(`/v1/trips/${trip.id}/stops/${stopId}`)
        .set(auth())
        .send({ depart_date: isoDate(35) });
      const inverted = await server()
        .patch(`/v1/trips/${trip.id}/stops/${stopId}`)
        .set(auth())
        .send({ arrive_date: isoDate(36) });

      // Assert
      expect(extended.status).toBe(200);
      expect(TripResponse.parse(extended.body).trip.stops[0]?.depart_date).toBe(
        isoDate(35),
      );

      expect(inverted.status).toBe(400);
      expect(inverted.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
      const details = (inverted.body as ApiError).error.details as {
        issues: { path: string }[];
      };
      expect(details.issues.map((i) => i.path)).toContain('depart_date');
    });

    it('rejects a stop that departs before it arrives (FR-011), same day allowed', async () => {
      const trip = await createTrip();

      const inverted = await server()
        .post(`/v1/trips/${trip.id}/stops`)
        .set(auth())
        .send({
          city_id: CITY.zurich,
          arrive_date: isoDate(31),
          depart_date: isoDate(30),
        });
      const sameDay = await server()
        .post(`/v1/trips/${trip.id}/stops`)
        .set(auth())
        .send({
          city_id: CITY.zurich,
          arrive_date: isoDate(30),
          depart_date: isoDate(30),
        });

      expect(inverted.status).toBe(400);
      expect(inverted.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
      expect(sameDay.status).toBe(201);
    });

    it('permits overlapping ranges and long gaps — both are legitimate itineraries', async () => {
      const trip = await createTrip();

      await addStop(trip.id, {
        city_id: CITY.zurich,
        arrive_date: isoDate(30),
        depart_date: isoDate(40),
      });
      const overlapping = await addStop(trip.id, {
        city_id: CITY.paris,
        arrive_date: isoDate(35),
        depart_date: isoDate(38),
      });
      const gapped = await addStop(trip.id, {
        city_id: CITY.tokyo,
        arrive_date: isoDate(120),
        depart_date: isoDate(125),
      });

      expect(overlapping.stops).toHaveLength(2);
      expect(gapped.stops).toHaveLength(3);
    });

    it('refuses an unknown city as a validation problem rather than a database error', async () => {
      const trip = await createTrip();

      const response = await server()
        .post(`/v1/trips/${trip.id}/stops`)
        .set(auth())
        .send({ city_id: 999_999, arrive_date: isoDate(30), depart_date: isoDate(31) });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
      expect(JSON.stringify(response.body)).not.toMatch(
        /foreign key|constraint|violates/i,
      );
    });

    it('tombstones a deleted stop and renumbers the survivors (FR-012, FR-039)', async () => {
      // Arrange — Zürich, Paris, Tokyo.
      const trip = await createTrip();
      await addStop(trip.id, {
        city_id: CITY.zurich,
        arrive_date: isoDate(30),
        depart_date: isoDate(33),
      });
      const two = await addStop(trip.id, {
        city_id: CITY.paris,
        arrive_date: isoDate(34),
        depart_date: isoDate(39),
      });
      await addStop(trip.id, {
        city_id: CITY.tokyo,
        arrive_date: isoDate(40),
        depart_date: isoDate(45),
      });
      const paris = two.stops.find((s) => s.city_id === CITY.paris);

      // Act
      const deleted = await server()
        .delete(`/v1/trips/${trip.id}/stops/${paris?.id}`)
        .set(auth());

      // Assert — gone from the read path, contiguous order, tombstoned in the row.
      expect(deleted.status).toBe(204);

      const after = await server().get(`/v1/trips/${trip.id}`).set(auth());
      expect(
        TripResponse.parse(after.body).trip.stops.map((s) => [s.sort_order, s.city.name]),
      ).toEqual([
        [0, 'Zürich'],
        [1, 'Tokyo'],
      ]);

      const [row] = await owner<{ deleted_at: Date | null }[]>`
        SELECT deleted_at FROM trip_stops WHERE id = ${paris?.id ?? ''}::uuid
      `;
      expect(row?.deleted_at).not.toBeNull();

      const again = await server()
        .delete(`/v1/trips/${trip.id}/stops/${paris?.id}`)
        .set(auth());
      expect(again.status).toBe(404);
      expect(again.body).toMatchObject({ error: { code: 'STOP_NOT_FOUND' } });
    });
  });

  describe('derived lifecycle status (FR-013)', () => {
    it('is planning before the first arrival, active within, past after the last departure', async () => {
      // Arrange — three trips, one in each state.
      const future = await createTrip({ title: 'Future' });
      await addStop(future.id, {
        city_id: CITY.zurich,
        arrive_date: isoDate(10),
        depart_date: isoDate(12),
      });

      const current = await createTrip({ title: 'Current' });
      await addStop(current.id, {
        city_id: CITY.paris,
        arrive_date: isoDate(-2),
        depart_date: isoDate(2),
      });

      const finished = await createTrip({ title: 'Finished' });
      await addStop(finished.id, {
        city_id: CITY.tokyo,
        arrive_date: isoDate(-20),
        depart_date: isoDate(-10),
      });

      // Act
      const [f, c, p] = await Promise.all(
        [future, current, finished].map((t) =>
          server().get(`/v1/trips/${t.id}`).set(auth()),
        ),
      );

      // Assert
      expect(TripResponse.parse(f?.body).trip.status).toBe('planning');
      expect(TripResponse.parse(c?.body).trip.status).toBe('active');
      expect(TripResponse.parse(p?.body).trip.status).toBe('past');

      // And the materialised column agrees, refreshed on the stop write
      // (data-model.md §3).
      const rows = await owner<{ id: string; status: string }[]>`
        SELECT id, status FROM trips WHERE id IN (${future.id}::uuid, ${current.id}::uuid, ${finished.id}::uuid)
      `;
      const byId = Object.fromEntries(rows.map((r) => [r.id, r.status]));
      expect(byId[future.id]).toBe('planning');
      expect(byId[current.id]).toBe('active');
      expect(byId[finished.id]).toBe('past');
    });

    it('filters GET /trips by the derived status', async () => {
      const response = await server().get('/v1/trips?status=active').set(auth());

      expect(response.status).toBe(200);
      const { trips } = TripsResponse.parse(response.body);
      expect(trips.length).toBeGreaterThan(0);
      expect(trips.every((t) => t.status === 'active')).toBe(true);
    });

    it('rejects an unknown status filter', async () => {
      const response = await server().get('/v1/trips?status=finished').set(auth());

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    });
  });

  describe('PATCH /trips/:id', () => {
    it('changes the title and bumps updated_at (the sync cursor)', async () => {
      const trip = await createTrip();

      const response = await server()
        .patch(`/v1/trips/${trip.id}`)
        .set(auth())
        .send({ title: 'Renamed', is_public: true });

      expect(response.status).toBe(200);
      const patched = TripResponse.parse(response.body).trip;
      expect(patched.title).toBe('Renamed');
      expect(patched.is_public).toBe(true);
      expect(new Date(patched.updated_at).getTime()).toBeGreaterThan(
        new Date(trip.updated_at).getTime(),
      );
    });

    it('refuses a supplied status, and an empty patch', async () => {
      const trip = await createTrip();

      const status = await server()
        .patch(`/v1/trips/${trip.id}`)
        .set(auth())
        .send({ status: 'past' });
      const empty = await server().patch(`/v1/trips/${trip.id}`).set(auth()).send({});

      expect(status.status).toBe(400);
      expect(empty.status).toBe(400);
    });
  });

  describe('DELETE /trips/:id (FR-039, FR-075)', () => {
    it('tombstones the trip and its stops; the read path forgets it, the rows remember', async () => {
      // Arrange
      const trip = await createTrip({ title: 'Doomed' });
      const withStop = await addStop(trip.id, {
        city_id: CITY.zurich,
        arrive_date: isoDate(30),
        depart_date: isoDate(33),
      });
      const stopId = withStop.stops[0]?.id ?? '';

      // Act
      const deleted = await server().delete(`/v1/trips/${trip.id}`).set(auth());

      // Assert
      expect(deleted.status).toBe(204);

      const gone = await server().get(`/v1/trips/${trip.id}`).set(auth());
      expect(gone.status).toBe(404);
      expect(gone.body).toMatchObject({ error: { code: 'TRIP_NOT_FOUND' } });

      const listed = await server().get('/v1/trips').set(auth());
      expect(TripsResponse.parse(listed.body).trips.map((t) => t.id)).not.toContain(
        trip.id,
      );

      // A tombstone, not a removal: the sync feed needs the row to tell the
      // other device the trip is gone (sync-protocol.md §1).
      const [tripRow] = await owner<{ deleted_at: Date | null }[]>`
        SELECT deleted_at FROM trips WHERE id = ${trip.id}::uuid
      `;
      const [stopRow] = await owner<{ deleted_at: Date | null }[]>`
        SELECT deleted_at FROM trip_stops WHERE id = ${stopId}::uuid
      `;
      expect(tripRow?.deleted_at).not.toBeNull();
      expect(stopRow?.deleted_at).not.toBeNull();

      const twice = await server().delete(`/v1/trips/${trip.id}`).set(auth());
      expect(twice.status).toBe(404);
    });
  });

  describe('GET /trips/:id/arcs (FR-016)', () => {
    it('derives one great-circle arc per consecutive pair, densified, in stop order', async () => {
      // Arrange — Zürich → Paris → Tokyo.
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
      await addStop(trip.id, {
        city_id: CITY.tokyo,
        arrive_date: isoDate(40),
        depart_date: isoDate(45),
      });

      // Act
      const response = await server().get(`/v1/trips/${trip.id}/arcs`).set(auth());

      // Assert
      expect(response.status).toBe(200);
      const arcs = ArcsResponse.parse(response.body);
      expect(
        arcs.features.map((f) => [f.properties.from_city_id, f.properties.to_city_id]),
      ).toEqual([
        [CITY.zurich, CITY.paris],
        [CITY.paris, CITY.tokyo],
      ]);
      expect(arcs.features.every((f) => f.properties.trip_id === trip.id)).toBe(true);
      expect(arcs.features.every((f) => f.properties.status === 'planning')).toBe(true);

      // Densified along the great circle: Paris → Tokyo is ~9,700 km, so a
      // 100 km segment length yields far more than the two endpoints.
      const parisTokyo = arcs.features[1]?.geometry.coordinates ?? [];
      expect(parisTokyo.length).toBeGreaterThan(50);
      expect(parisTokyo[0]?.[0]).toBeCloseTo(2.3522, 3);
      expect(parisTokyo[parisTokyo.length - 1]?.[0]).toBeCloseTo(139.6917, 3);
    });

    it('yields an empty collection for a single-stop trip rather than an error', async () => {
      const trip = await createTrip();
      await addStop(trip.id, {
        city_id: CITY.zurich,
        arrive_date: isoDate(30),
        depart_date: isoDate(33),
      });

      const response = await server().get(`/v1/trips/${trip.id}/arcs`).set(auth());

      expect(response.status).toBe(200);
      expect(ArcsResponse.parse(response.body)).toEqual({
        type: 'FeatureCollection',
        features: [],
      });
    });
  });
});
