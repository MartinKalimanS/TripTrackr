/**
 * The statistics overlay's figures (FR-050), computed on the device (D-30)
 * with the server's semantics (`TravelStatsService`, pinned by T090): every
 * live trip's stops count, each country once, and the distance is each trip's
 * legs in stop order, summed.
 */
import { haversineKm } from '../great-circle';
import { toGlobeTrips, type GlobeStopRow } from '../globe-data';
import { travelSummary } from '../travel-stats';

const TODAY = '2026-05-10';

const ZURICH = { city_id: 1, country_id: 41, lng: 8.5417, lat: 47.3769 };
const PARIS = { city_id: 2, country_id: 33, lng: 2.3522, lat: 48.8566 };
const TOKYO = { city_id: 3, country_id: 81, lng: 139.6917, lat: 35.6895 };
const LYON = { city_id: 4, country_id: 33, lng: 4.8357, lat: 45.764 };
const UNCACHED = { city_id: 5, country_id: null, lng: null, lat: null };

let n = 0;
function stop(
  tripId: string,
  city: Omit<GlobeStopRow, 'id' | 'trip_id' | 'arrive_date' | 'depart_date'>,
  arrive = '2026-06-01',
): GlobeStopRow {
  n += 1;
  return {
    id: `s${n}`,
    trip_id: tripId,
    arrive_date: arrive,
    depart_date: arrive,
    ...city,
  };
}

const km = (a: typeof ZURICH, b: typeof ZURICH) =>
  haversineKm([a.lng, a.lat], [b.lng, b.lat]);

describe('travelSummary', () => {
  test('sums every leg of every trip and counts each country once', () => {
    const trips = toGlobeTrips(
      [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
      ],
      [
        stop('a', ZURICH),
        stop('a', PARIS),
        stop('a', TOKYO),
        stop('b', LYON),
        stop('b', PARIS),
      ],
      TODAY,
    );

    const summary = travelSummary(trips);
    expect(summary.countriesVisited).toBe(3);
    expect(summary.distanceKm).toBeCloseTo(
      km(ZURICH, PARIS) + km(PARIS, TOKYO) + km(LYON, PARIS),
      6,
    );
  });

  test('counts planned and past trips alike, as the server does', () => {
    const trips = toGlobeTrips(
      [
        { id: 'past', title: 'Past' },
        { id: 'planned', title: 'Planned' },
      ],
      [stop('past', ZURICH, '2025-01-01'), stop('planned', TOKYO, '2027-01-01')],
      TODAY,
    );
    expect(trips.map((t) => t.status)).toEqual(['past', 'planning']);
    expect(travelSummary(trips).countriesVisited).toBe(2);
  });

  test('a stop in an uncached city counts for nothing, and neither do its legs', () => {
    const trips = toGlobeTrips(
      [{ id: 'a', title: 'A' }],
      [stop('a', ZURICH), stop('a', UNCACHED), stop('a', PARIS), stop('a', LYON)],
      TODAY,
    );
    const summary = travelSummary(trips);
    expect(summary.countriesVisited).toBe(2);
    expect(summary.distanceKm).toBeCloseTo(km(PARIS, LYON), 6);
  });

  test('a return to the same city adds no distance', () => {
    const trips = toGlobeTrips(
      [{ id: 'a', title: 'A' }],
      [stop('a', PARIS), stop('a', PARIS)],
      TODAY,
    );
    expect(travelSummary(trips)).toEqual({ countriesVisited: 1, distanceKm: 0 });
  });

  test('no trips, no figures', () => {
    expect(travelSummary([])).toEqual({ countriesVisited: 0, distanceKm: 0 });
  });
});
