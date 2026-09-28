/**
 * The GeoJSON the globe's sources draw — FR-016, FR-045, research D-30.
 *
 * Arcs are derived from consecutive stops and nothing else: adding, moving or
 * removing a stop changes the collection on the next derivation with no arc
 * record to maintain. Every feature carries the trip id the tap handler needs
 * (FR-047) and the derived status the per-status layers filter on (FR-046).
 */
import { toGlobeTrips, type GlobeStopRow } from '@/features/globe/globe-data';

import {
  arcCollection,
  beaconRoutes,
  cameraCenter,
  markerCollection,
  tripRoute,
} from '../arc-features';

const TODAY = '2026-05-10';

const ROME = { city_id: 1, country_id: 39, lng: 12.4964, lat: 41.9028 };
const FLORENCE = { city_id: 2, country_id: 39, lng: 11.2558, lat: 43.7696 };
const VENICE = { city_id: 3, country_id: 39, lng: 12.3155, lat: 45.4408 };
const TOKYO = { city_id: 4, country_id: 81, lng: 139.6917, lat: 35.6895 };
const SAN_FRANCISCO = { city_id: 5, country_id: 1, lng: -122.4194, lat: 37.7749 };
const UNCACHED = { city_id: 6, country_id: null, lng: null, lat: null };

type City = Pick<GlobeStopRow, 'city_id' | 'country_id' | 'lng' | 'lat'>;

let n = 0;
function stops(tripId: string, arrive: string, ...cities: City[]): GlobeStopRow[] {
  return cities.map((city) => {
    n += 1;
    return {
      id: `s${n}`,
      trip_id: tripId,
      arrive_date: arrive,
      depart_date: arrive,
      ...city,
    };
  });
}

function globe(...groups: [string, string, City[]][]) {
  return toGlobeTrips(
    groups.map(([id]) => ({ id, title: id })),
    groups.flatMap(([id, arrive, cities]) => stops(id, arrive, ...cities)),
    TODAY,
  );
}

describe('arcCollection', () => {
  test('one feature per consecutive pair of stops, carrying trip id, cities and derived status', () => {
    const trips = globe(['italy', TODAY, [ROME, FLORENCE, VENICE]]);
    const { type, features } = arcCollection(trips);

    expect(type).toBe('FeatureCollection');
    expect(features.map((f) => f.properties)).toEqual([
      { trip_id: 'italy', status: 'active', from_city_id: 1, to_city_id: 2 },
      { trip_id: 'italy', status: 'active', from_city_id: 2, to_city_id: 3 },
    ]);
    expect(features[0]!.geometry.type).toBe('LineString');
    expect(new Set(features.map((f) => f.id)).size).toBe(2);
  });

  test('inserting a stop mid-trip changes the arcs with no separate maintenance (FR-016)', () => {
    const before = arcCollection(globe(['italy', TODAY, [ROME, VENICE]]));
    const after = arcCollection(globe(['italy', TODAY, [ROME, FLORENCE, VENICE]]));

    expect(
      before.features.map((f) => [f.properties.from_city_id, f.properties.to_city_id]),
    ).toEqual([[1, 3]]);
    expect(
      after.features.map((f) => [f.properties.from_city_id, f.properties.to_city_id]),
    ).toEqual([
      [1, 2],
      [2, 3],
    ]);
  });

  test('a leg over the date line is one MultiLineString feature, split on ±180°', () => {
    const [arc] = arcCollection(
      globe(['pacific', '2026-07-01', [TOKYO, SAN_FRANCISCO]]),
    ).features;

    expect(arc!.geometry.type).toBe('MultiLineString');
    const parts = arc!.geometry.coordinates as [number, number][][];
    expect(parts).toHaveLength(2);
    expect(parts[0]!.at(-1)![0]).toBe(180);
    expect(parts[1]![0]![0]).toBe(-180);
    expect(arc!.properties.status).toBe('planning');
  });

  test('a single-stop trip, a return to the same city, and an uncached city draw no arc', () => {
    const trips = globe(
      ['single', TODAY, [ROME]],
      ['return', TODAY, [FLORENCE, FLORENCE]],
      ['unknown', TODAY, [ROME, UNCACHED]],
    );
    expect(arcCollection(trips).features).toEqual([]);
  });
});

describe('markerCollection', () => {
  test('one point per placed stop, so a single-stop trip still shows (spec edge case)', () => {
    const trips = globe(['single', '2025-01-01', [ROME]], ['unknown', TODAY, [UNCACHED]]);
    const { features } = markerCollection(trips);

    expect(features).toHaveLength(1);
    expect(features[0]).toMatchObject({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [12.4964, 41.9028] },
      properties: { trip_id: 'single', status: 'past', city_id: 1 },
    });
  });
});

describe('tripRoute — the path the beacon travels', () => {
  test('one entry per drawn leg, each the leg’s parts', () => {
    const [italy] = globe(['italy', TODAY, [ROME, FLORENCE, FLORENCE, VENICE]]);
    const route = tripRoute(italy!);

    // Florence → Florence draws nothing, so the beacon skips it.
    expect(route).toHaveLength(2);
    expect(route[0]![0]![0]).toEqual([12.4964, 41.9028]);
    expect(route[1]![0]!.at(-1)).toEqual([12.3155, 45.4408]);
  });
});

describe('beaconRoutes — one beacon per animated trip', () => {
  test('carries the trip’s route, its status, and where it rests', () => {
    const trips = globe(
      ['italy', TODAY, [ROME, FLORENCE, VENICE]],
      ['past', '2025-01-01', [TOKYO, SAN_FRANCISCO]],
    );
    const [beacon, ...others] = beaconRoutes(trips, ['italy'], TODAY);

    expect(others).toEqual([]);
    // All three stops are today, so the day — and the resting beacon — ends in Venice.
    expect(beacon).toEqual({
      tripId: 'italy',
      status: 'active',
      legs: tripRoute(trips[0]!),
      rest: [12.3155, 45.4408],
    });
  });

  test('a trip whose stops are all in one city still gets a beacon — at rest, with no legs', () => {
    const trips = globe(['florence', TODAY, [FLORENCE, FLORENCE]]);
    expect(markerCollection(trips).features).toHaveLength(2);
    expect(beaconRoutes(trips, ['florence'], TODAY)).toEqual([
      { tripId: 'florence', status: 'active', legs: [], rest: [11.2558, 43.7696] },
    ]);
  });

  test('an animated trip with nothing placed has no beacon', () => {
    expect(
      beaconRoutes(globe(['unknown', TODAY, [UNCACHED]]), ['unknown'], TODAY),
    ).toEqual([]);
  });
});

describe('cameraCenter — where the globe opens', () => {
  test('on the first animated trip’s route, so the eye lands on it', () => {
    const trips = globe(
      ['past', '2025-01-01', [TOKYO, SAN_FRANCISCO]],
      ['italy', TODAY, [ROME, FLORENCE]],
    );
    const center = cameraCenter(trips, ['italy']);
    const route = tripRoute(trips[1]!).flat(2);

    expect(route).toContainEqual(center);
  });

  test('without an animated trip, on the first trip that has anything placed', () => {
    const trips = globe(['empty', TODAY, [UNCACHED]], ['single', '2025-01-01', [ROME]]);
    expect(cameraCenter(trips, [])).toEqual([12.4964, 41.9028]);
  });

  test('nothing to centre on when nothing is placed', () => {
    expect(cameraCenter(globe(['empty', TODAY, [UNCACHED]]), [])).toBeNull();
  });
});
