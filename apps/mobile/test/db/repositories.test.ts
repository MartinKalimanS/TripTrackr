/**
 * The local repositories, exercised against a real SQLite database with the
 * generated migration applied (Constitution III: no mocked data layer).
 *
 * What these prove, for the sync engine that will read these rows later:
 * every write is dirty and stamped, deletes are tombstones the ordinary reads
 * never return, stop dates obey FR-011 with the wire's own predicate, and
 * reordering keeps `sort_order` contiguous while touching only rows that moved.
 */
import { TripStopPullRecord, TripPullRecord } from '@triptrackr/contracts';
import { randomUUID } from 'expo-crypto';

import { geographyRepository } from '@/db/repositories/geography';
import { StopDatesError, reorderStops, stopsRepository } from '@/db/repositories/stops';
import { tripsRepository } from '@/db/repositories/trips';
import { tripStops, trips } from '@/db/schema';

import { createTestDatabase, type TestSqlite } from './sqlite-harness';

let sqlite: TestSqlite;

beforeEach(async () => {
  sqlite = await createTestDatabase();
});

afterEach(() => {
  sqlite.close();
});

const italy = { id: 1, iso_code: 'IT', name: 'Italy', continent: 'Europe' };
const spain = { id: 2, iso_code: 'ES', name: 'Spain', continent: 'Europe' };
const rome = {
  id: 100,
  country_id: 1,
  name: 'Roma',
  ascii_name: 'Roma',
  lat: 41.9,
  lng: 12.5,
  timezone: 'Europe/Rome',
  population: 2_800_000,
};
const florence = {
  ...rome,
  id: 101,
  name: 'Firenze',
  ascii_name: 'Firenze',
  population: 380_000,
};
const reggio = {
  ...rome,
  id: 102,
  name: 'Reggio Emilia',
  ascii_name: 'Reggio Emilia',
  population: 170_000,
};
const forli = {
  ...rome,
  id: 103,
  name: 'Forlì',
  ascii_name: 'Forli',
  population: 118_000,
};
const madrid = {
  ...rome,
  id: 200,
  country_id: 2,
  name: 'Madrid',
  ascii_name: 'Madrid',
  population: 3_300_000,
};

function newTrip(title = 'Italy, spring 2026') {
  return tripsRepository.create(sqlite.db, {
    id: randomUUID(),
    title,
    home_currency: 'EUR',
  });
}

function addStop(tripId: string, cityId: number, arrive: string, depart: string) {
  return stopsRepository.add(sqlite.db, {
    id: randomUUID(),
    trip_id: tripId,
    city_id: cityId,
    arrive_date: arrive,
    depart_date: depart,
  });
}

describe('tripsRepository', () => {
  test('create writes local-first: dirty, never synced, planning, with matching timestamps', () => {
    const trip = newTrip();

    expect(trip).toMatchObject({
      title: 'Italy, spring 2026',
      home_currency: 'EUR',
      status: 'planning',
      is_public: false,
      cover_photo_id: null,
      is_dirty: true,
      synced_at: null,
      deleted_at: null,
    });
    expect(trip.created_at).toBe(trip.updated_at);
    expect(() => new Date(trip.updated_at).toISOString()).not.toThrow();
  });

  test('a created row already satisfies the wire pull record — nothing to remap at push time (D-15)', () => {
    const { is_dirty: _dirty, synced_at: _synced, ...wire } = newTrip();
    expect(TripPullRecord.safeParse(wire).success).toBe(true);
  });

  test('listQuery returns live trips, most recently updated first', () => {
    const older = newTrip('Older');
    sqlite.native
      .prepare('UPDATE trips SET updated_at = ? WHERE id = ?')
      .run('2020-01-01T00:00:00.000Z', older.id);
    const newer = newTrip('Newer');

    const rows = tripsRepository.listQuery(sqlite.db).all();

    expect(rows.map((row) => row.id)).toEqual([newer.id, older.id]);
  });

  test('remove tombstones the trip and its stops; ordinary reads no longer see them', () => {
    const trip = newTrip();
    const stop = addStop(trip.id, rome.id, '2026-05-10', '2026-05-12');

    tripsRepository.remove(sqlite.db, trip.id);

    expect(tripsRepository.listQuery(sqlite.db).all()).toEqual([]);
    expect(tripsRepository.byIdQuery(sqlite.db, trip.id).all()).toEqual([]);
    expect(stopsRepository.forTripQuery(sqlite.db, trip.id).all()).toEqual([]);

    const [tripRow] = sqlite.db.select().from(trips).all();
    const [stopRow] = sqlite.db.select().from(tripStops).all();
    expect(tripRow?.deleted_at).toEqual(expect.any(String));
    expect(stopRow).toMatchObject({
      id: stop.id,
      deleted_at: tripRow?.deleted_at,
      is_dirty: true,
    });
  });

  test('every read filters tombstones with deleted_at IS NULL (sync-protocol.md §1)', () => {
    expect(tripsRepository.listQuery(sqlite.db).toSQL().sql).toMatch(
      /"deleted_at" is null/i,
    );
    expect(tripsRepository.byIdQuery(sqlite.db, 'x').toSQL().sql).toMatch(
      /"deleted_at" is null/i,
    );
    expect(stopsRepository.forTripQuery(sqlite.db, 'x').toSQL().sql).toMatch(
      /"deleted_at" is null/i,
    );
    expect(stopsRepository.allActiveQuery(sqlite.db).toSQL().sql).toMatch(
      /"deleted_at" is null/i,
    );
  });
});

describe('stopsRepository', () => {
  test('add appends after the last live stop and the row satisfies the wire record', () => {
    const trip = newTrip();
    const first = addStop(trip.id, rome.id, '2026-05-10', '2026-05-12');
    const second = addStop(trip.id, florence.id, '2026-05-12', '2026-05-15');

    expect(first.sort_order).toBe(0);
    expect(second.sort_order).toBe(1);
    expect(second).toMatchObject({ is_dirty: true, synced_at: null, deleted_at: null });

    const { is_dirty: _dirty, synced_at: _synced, ...wire } = second;
    expect(TripStopPullRecord.safeParse(wire).success).toBe(true);
  });

  test('refuses a departure before the arrival, with the wire’s own predicate (FR-011)', () => {
    const trip = newTrip();

    expect(() => addStop(trip.id, rome.id, '2026-05-12', '2026-05-10')).toThrow(
      StopDatesError,
    );
    expect(stopsRepository.forTripQuery(sqlite.db, trip.id).all()).toEqual([]);
  });

  test('allows a same-day stop — departure may equal arrival', () => {
    const trip = newTrip();
    expect(() => addStop(trip.id, rome.id, '2026-05-12', '2026-05-12')).not.toThrow();
  });

  test('forTripQuery returns stops in order with cached place names, or null names when uncached', () => {
    geographyRepository.cacheCountries(sqlite.db, [italy]);
    geographyRepository.cacheCities(sqlite.db, [rome]);
    const trip = newTrip();
    addStop(trip.id, rome.id, '2026-05-10', '2026-05-12');
    addStop(trip.id, 999, '2026-05-12', '2026-05-15');

    const rows = stopsRepository.forTripQuery(sqlite.db, trip.id).all();

    expect(rows.map((row) => [row.city_name, row.country_name, row.sort_order])).toEqual([
      ['Roma', 'Italy', 0],
      [null, null, 1],
    ]);
    expect(rows[0]).toMatchObject({ lat: 41.9, lng: 12.5 });
  });

  test('updateDates validates, bumps updated_at and re-dirties the row', () => {
    const trip = newTrip();
    const stop = addStop(trip.id, rome.id, '2026-05-10', '2026-05-12');
    sqlite.native
      .prepare(
        'UPDATE trip_stops SET is_dirty = 0, synced_at = ?, updated_at = ? WHERE id = ?',
      )
      .run('2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', stop.id);

    stopsRepository.updateDates(sqlite.db, stop.id, {
      arrive_date: '2026-05-11',
      depart_date: '2026-05-13',
    });

    const [row] = stopsRepository.forTripQuery(sqlite.db, trip.id).all();
    expect(row).toMatchObject({
      arrive_date: '2026-05-11',
      depart_date: '2026-05-13',
      is_dirty: true,
    });
    expect(row!.updated_at > '2026-05-01T00:00:00.000Z').toBe(true);
    expect(() =>
      stopsRepository.updateDates(sqlite.db, stop.id, {
        arrive_date: '2026-05-13',
        depart_date: '2026-05-11',
      }),
    ).toThrow(StopDatesError);
  });

  test('move down then up round-trips, keeps sort_order contiguous, and dirties only the rows that moved', () => {
    const trip = newTrip();
    const a = addStop(trip.id, rome.id, '2026-05-10', '2026-05-12');
    const b = addStop(trip.id, florence.id, '2026-05-12', '2026-05-15');
    const c = addStop(trip.id, madrid.id, '2026-05-15', '2026-05-18');
    sqlite.native.prepare('UPDATE trip_stops SET is_dirty = 0').run();

    stopsRepository.move(sqlite.db, c.id, 'up');

    let rows = stopsRepository.forTripQuery(sqlite.db, trip.id).all();
    expect(rows.map((row) => row.id)).toEqual([a.id, c.id, b.id]);
    expect(rows.map((row) => row.sort_order)).toEqual([0, 1, 2]);
    expect(rows.map((row) => row.is_dirty)).toEqual([false, true, true]);

    stopsRepository.move(sqlite.db, c.id, 'down');

    rows = stopsRepository.forTripQuery(sqlite.db, trip.id).all();
    expect(rows.map((row) => row.id)).toEqual([a.id, b.id, c.id]);
    expect(rows.map((row) => row.sort_order)).toEqual([0, 1, 2]);
  });

  test('move is a no-op at either end and for a deleted or unknown stop', () => {
    const trip = newTrip();
    const a = addStop(trip.id, rome.id, '2026-05-10', '2026-05-12');
    const b = addStop(trip.id, florence.id, '2026-05-12', '2026-05-15');
    sqlite.native.prepare('UPDATE trip_stops SET is_dirty = 0').run();

    stopsRepository.move(sqlite.db, a.id, 'up');
    stopsRepository.move(sqlite.db, b.id, 'down');
    stopsRepository.move(sqlite.db, 'does-not-exist', 'down');
    stopsRepository.remove(sqlite.db, b.id);
    stopsRepository.move(sqlite.db, b.id, 'up');

    const [first] = stopsRepository.forTripQuery(sqlite.db, trip.id).all();
    expect(first).toMatchObject({ id: a.id, sort_order: 0, is_dirty: false });
  });

  test('a move restores contiguity after a tombstone left a gap', () => {
    const trip = newTrip();
    const a = addStop(trip.id, rome.id, '2026-05-10', '2026-05-12');
    const b = addStop(trip.id, florence.id, '2026-05-12', '2026-05-15');
    const c = addStop(trip.id, madrid.id, '2026-05-15', '2026-05-18');
    stopsRepository.remove(sqlite.db, b.id);

    stopsRepository.move(sqlite.db, c.id, 'up');

    const rows = stopsRepository.forTripQuery(sqlite.db, trip.id).all();
    expect(rows.map((row) => [row.id, row.sort_order])).toEqual([
      [c.id, 0],
      [a.id, 1],
    ]);
  });

  test('remove is a tombstone: the row stays for the sync engine, dirty, and disappears from reads', () => {
    const trip = newTrip();
    const stop = addStop(trip.id, rome.id, '2026-05-10', '2026-05-12');

    stopsRepository.remove(sqlite.db, stop.id);

    expect(stopsRepository.forTripQuery(sqlite.db, trip.id).all()).toEqual([]);
    expect(stopsRepository.allActiveQuery(sqlite.db).all()).toEqual([]);
    const [raw] = sqlite.db.select().from(tripStops).all();
    expect(raw).toMatchObject({
      id: stop.id,
      is_dirty: true,
      deleted_at: expect.any(String),
    });
  });

  test('a new stop after a tombstone appends after the last LIVE stop', () => {
    const trip = newTrip();
    addStop(trip.id, rome.id, '2026-05-10', '2026-05-12');
    const b = addStop(trip.id, florence.id, '2026-05-12', '2026-05-15');
    stopsRepository.remove(sqlite.db, b.id);

    const c = addStop(trip.id, madrid.id, '2026-05-15', '2026-05-18');

    expect(c.sort_order).toBe(1);
  });

  test('a stop cannot be added to a trip that does not exist locally', () => {
    expect(() => addStop(randomUUID(), rome.id, '2026-05-10', '2026-05-12')).toThrow(
      /FOREIGN KEY/i,
    );
  });
});

describe('reorderStops (pure)', () => {
  const stops = [
    { id: 'a', sort_order: 0 },
    { id: 'b', sort_order: 1 },
    { id: 'c', sort_order: 2 },
  ];

  test('moving the last stop up swaps it with its neighbour and reports only the two that moved', () => {
    expect(reorderStops(stops, 'c', 'up')).toEqual([
      { id: 'c', sort_order: 1 },
      { id: 'b', sort_order: 2 },
    ]);
  });

  test('moving past either end changes nothing', () => {
    expect(reorderStops(stops, 'a', 'up')).toEqual([]);
    expect(reorderStops(stops, 'c', 'down')).toEqual([]);
    expect(reorderStops(stops, 'zz', 'down')).toEqual([]);
  });

  test('renumbers a gapped list contiguously, reporting every row whose position changed', () => {
    const gapped = [
      { id: 'a', sort_order: 0 },
      { id: 'c', sort_order: 5 },
    ];
    expect(reorderStops(gapped, 'c', 'up')).toEqual([
      { id: 'c', sort_order: 0 },
      { id: 'a', sort_order: 1 },
    ]);
  });
});

describe('geographyRepository', () => {
  test('caches countries and cities, and an upsert refreshes rather than duplicates', () => {
    geographyRepository.cacheCountries(sqlite.db, [italy, spain]);
    geographyRepository.cacheCountries(sqlite.db, [{ ...italy, name: 'Italia' }]);

    const rows = geographyRepository.listCountries(sqlite.db);
    expect(rows.map((row) => row.name)).toEqual(['Italia', 'Spain']);

    geographyRepository.cacheCities(sqlite.db, [rome]);
    geographyRepository.cacheCities(sqlite.db, [{ ...rome, population: 1 }]);
    expect(geographyRepository.searchCities(sqlite.db, 1, '')).toHaveLength(1);
  });

  test('caching an empty list is a no-op, not an invalid statement', () => {
    expect(() => geographyRepository.cacheCountries(sqlite.db, [])).not.toThrow();
    expect(() => geographyRepository.cacheCities(sqlite.db, [])).not.toThrow();
  });

  test('handles more rows than one statement’s parameter budget by batching', () => {
    const many = Array.from({ length: 250 }, (_, i) => ({
      id: 1000 + i,
      country_id: 1,
      name: `City ${i}`,
      ascii_name: `City ${i}`,
      lat: 0,
      lng: 0,
      timezone: 'UTC',
      population: i,
    }));
    geographyRepository.cacheCities(sqlite.db, many);
    const count = sqlite.native.prepare('SELECT COUNT(*) AS n FROM cities').get() as {
      n: number;
    };
    expect(count.n).toBe(250);
  });

  test('offline search is scoped to the country, accent-tolerant, and ranked by population (FR-014)', () => {
    geographyRepository.cacheCities(sqlite.db, [rome, florence, reggio, forli, madrid]);

    expect(
      geographyRepository.searchCities(sqlite.db, 1, 'forlì').map((c) => c.name),
    ).toEqual(['Forlì']);
    expect(
      geographyRepository.searchCities(sqlite.db, 1, 'FIR').map((c) => c.name),
    ).toEqual(['Firenze']);
    expect(
      geographyRepository.searchCities(sqlite.db, 1, 'emilia').map((c) => c.name),
    ).toEqual(['Reggio Emilia']);
    expect(
      geographyRepository.searchCities(sqlite.db, 1, 'r').map((c) => c.name),
    ).toEqual(['Roma', 'Reggio Emilia']);
    expect(geographyRepository.searchCities(sqlite.db, 1, 'ma')).toEqual([]);
    expect(
      geographyRepository.searchCities(sqlite.db, 2, 'ma').map((c) => c.name),
    ).toEqual(['Madrid']);
  });

  test('an empty query lists the country’s best-known cities first', () => {
    geographyRepository.cacheCities(sqlite.db, [forli, rome, florence]);
    expect(
      geographyRepository.searchCities(sqlite.db, 1, '  ').map((c) => c.name),
    ).toEqual(['Roma', 'Firenze', 'Forlì']);
  });
});
