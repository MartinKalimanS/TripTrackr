/**
 * Which countries are tinted — feature 005, T532 (FR-010; research D5-04: "`visitedIso2`
 * is derived from the same local store as the statistics").
 *
 * Visited countries get the coral tint and keyline, planned ones the dashed amber keyline.
 * A stop is visited once its arrival day has come; a country that is both visited and
 * planned is visited. The statistics (`travel-stats.ts`) are not touched: they still count a
 * planned trip's countries, as the server does (FR-082).
 */
import { countryCodes } from '../country-codes';
import { toGlobeTrips, type GlobeStopRow } from '../globe-data';

const TODAY = '2026-05-10';

let n = 0;
function stop(
  tripId: string,
  iso: string | null | undefined,
  arrive: string,
  depart = arrive,
): GlobeStopRow {
  n += 1;
  return {
    id: `s${n}`,
    trip_id: tripId,
    city_id: n,
    arrive_date: arrive,
    depart_date: depart,
    country_id: iso ? n : null,
    lat: 10,
    lng: 10,
    ...(iso === undefined ? {} : { country_iso: iso }),
  };
}

const trips = (...stops: GlobeStopRow[]) =>
  toGlobeTrips(
    [...new Set(stops.map((s) => s.trip_id))].map((id) => ({ id, title: id })),
    stops,
    TODAY,
  );

describe('countryCodes', () => {
  test('a past trip’s countries are visited', () => {
    expect(
      countryCodes(
        trips(stop('a', 'PT', '2025-03-01'), stop('a', 'ES', '2025-03-04')),
        TODAY,
      ),
    ).toEqual({ visited: ['ES', 'PT'], planned: [] });
  });

  test('a planned trip’s countries are planned', () => {
    expect(countryCodes(trips(stop('a', 'IS', '2027-01-10')), TODAY)).toEqual({
      visited: [],
      planned: ['IS'],
    });
  });

  test('on an active trip a stop is visited from the day it begins', () => {
    const active = trips(
      stop('a', 'PT', '2026-05-08', '2026-05-10'),
      stop('a', 'ES', '2026-05-10', '2026-05-12'),
      stop('a', 'FR', '2026-05-12', '2026-05-14'),
    );
    expect(countryCodes(active, TODAY)).toEqual({
      visited: ['ES', 'PT'],
      planned: ['FR'],
    });
  });

  test('a country both visited and planned is visited, once', () => {
    const both = trips(stop('a', 'PT', '2025-03-01'), stop('b', 'PT', '2027-02-01'));
    expect(countryCodes(both, TODAY)).toEqual({ visited: ['PT'], planned: [] });
  });

  test('the codes are upper case, sorted and unique', () => {
    const mixed = trips(
      stop('a', 'pt', '2025-03-01'),
      stop('b', 'PT', '2025-04-01'),
      stop('c', 'es', '2025-05-01'),
    );
    expect(countryCodes(mixed, TODAY).visited).toEqual(['ES', 'PT']);
  });

  test('a stop with no country on this device tints nothing and breaks nothing', () => {
    const unknown = trips(
      stop('a', null, '2025-03-01'),
      stop('a', undefined, '2025-03-02'),
      stop('a', '', '2025-03-03'),
    );
    expect(countryCodes(unknown, TODAY)).toEqual({ visited: [], planned: [] });
  });

  test('has nothing for a globe with nothing on it', () => {
    expect(countryCodes([], TODAY)).toEqual({ visited: [], planned: [] });
  });

  test('does not depend on whether a stop is placed: the country is the country', () => {
    const unplaced: GlobeStopRow = {
      ...stop('a', 'PT', '2025-03-01'),
      lat: null,
      lng: null,
    };
    expect(countryCodes(trips(unplaced), TODAY).visited).toEqual(['PT']);
  });
});
