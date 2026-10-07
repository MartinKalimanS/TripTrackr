/**
 * The line through every place the traveller has been — feature 003, FR-006
 * to FR-009.
 *
 * A trip draws its own consecutive legs (`placedLegs`). The journey adds only
 * what no trip draws: the legs between consecutive VISITED places that belong
 * to different trips, in the order the traveller was there. It is derived on
 * every render from the local store and stored nowhere (001 FR-016).
 */
import { toGlobeTrips, type GlobeStopRow } from '../globe-data';
import { journeyLegs } from '../journey';

const TODAY = '2026-05-10';

const ROME = { city_id: 1, country_id: 39, lng: 12.4964, lat: 41.9028 };
const FLORENCE = { city_id: 2, country_id: 39, lng: 11.2558, lat: 43.7696 };
const TOKYO = { city_id: 4, country_id: 81, lng: 139.6917, lat: 35.6895 };
const SYDNEY = { city_id: 5, country_id: 61, lng: 151.2093, lat: -33.8688 };
const PARIS = { city_id: 7, country_id: 33, lng: 2.3522, lat: 48.8566 };
const UNCACHED = { city_id: 6, country_id: null, lng: null, lat: null };

type City = Pick<GlobeStopRow, 'city_id' | 'country_id' | 'lng' | 'lat'>;
type Visit = [City, string, string?];

let n = 0;
function trip(id: string, ...visits: Visit[]) {
  return {
    row: { id, title: id },
    stops: visits.map(([city, arrive, depart]): GlobeStopRow => {
      n += 1;
      return {
        id: `s${n}`,
        trip_id: id,
        arrive_date: arrive,
        depart_date: depart ?? arrive,
        ...city,
      };
    }),
  };
}

function legsOf(...trips: ReturnType<typeof trip>[]) {
  const globe = toGlobeTrips(
    trips.map((t) => t.row),
    trips.flatMap((t) => t.stops),
    TODAY,
  );
  return journeyLegs(globe, TODAY).map(({ from, to }) => [from.cityId, to.cityId]);
}

describe('journeyLegs — the legs between trips (FR-006, FR-008)', () => {
  test('nothing to join with no trips, or with a single visited place', () => {
    expect(legsOf()).toEqual([]);
    expect(legsOf(trip('only', [ROME, '2026-01-01']))).toEqual([]);
  });

  test('joins the last place of an earlier trip to the first of a later one', () => {
    const legs = legsOf(
      trip('italy', [ROME, '2026-01-01'], [FLORENCE, '2026-01-04']),
      trip('japan', [TOKYO, '2026-03-01']),
    );
    expect(legs).toEqual([[2, 4]]);
  });

  test('is independent of the order the trips are listed in', () => {
    const italy = trip('italy', [ROME, '2026-01-01'], [FLORENCE, '2026-01-04']);
    const japan = trip('japan', [TOKYO, '2026-03-01']);
    expect(legsOf(japan, italy)).toEqual(legsOf(italy, japan));
  });

  test('a single-stop trip between two others is on the line, joined on both sides', () => {
    const legs = legsOf(
      trip('a', [ROME, '2026-01-01']),
      trip('b', [TOKYO, '2026-02-01']),
      trip('c', [SYDNEY, '2026-03-01']),
    );
    expect(legs).toEqual([
      [1, 4],
      [4, 5],
    ]);
  });

  test('never repeats a leg a trip already draws', () => {
    expect(legsOf(trip('italy', [ROME, '2026-01-01'], [FLORENCE, '2026-01-04']))).toEqual(
      [],
    );
  });

  test('joins interleaved trips by arrival date, repeating no trip leg', () => {
    const legs = legsOf(
      trip('a', [ROME, '2026-01-01'], [FLORENCE, '2026-04-01']),
      trip('b', [TOKYO, '2026-02-01']),
    );
    // Rome, Tokyo, Florence: Rome→Florence is trip a's own leg, so only the
    // two legs through Tokyo are added.
    expect(legs).toEqual([
      [1, 4],
      [4, 2],
    ]);
  });
});

describe('journeyLegs — only places already visited (FR-007)', () => {
  test('a stop arriving today counts; one arriving tomorrow does not', () => {
    const arrivesToday = legsOf(
      trip('old', [ROME, '2026-01-01']),
      trip('now', [TOKYO, TODAY]),
    );
    const arrivesTomorrow = legsOf(
      trip('old', [ROME, '2026-01-01']),
      trip('soon', [TOKYO, '2026-05-11']),
    );
    expect(arrivesToday).toEqual([[1, 4]]);
    expect(arrivesTomorrow).toEqual([]);
  });

  test('a trip in progress contributes the places reached so far, not its planned ones', () => {
    const legs = legsOf(
      trip('old', [ROME, '2026-01-01']),
      trip('now', [TOKYO, '2026-05-08', '2026-05-12'], [SYDNEY, '2026-05-12']),
    );
    expect(legs).toEqual([[1, 4]]);
  });
});

describe('journeyLegs — the rules of trip connections (FR-009)', () => {
  test('draws nothing between two places in one city', () => {
    expect(
      legsOf(trip('a', [ROME, '2026-01-01']), trip('b', [ROME, '2026-02-01'])),
    ).toEqual([]);
  });

  test('is not bridged across a visited place this device cannot place', () => {
    const legs = legsOf(
      trip('a', [ROME, '2026-01-01']),
      trip('b', [UNCACHED, '2026-02-01']),
      trip('c', [TOKYO, '2026-03-01']),
    );
    expect(legs).toEqual([]);
  });

  test('keeps either side of an unplaced place that is not in the way', () => {
    const legs = legsOf(
      trip('a', [ROME, '2026-01-01'], [FLORENCE, '2026-01-03']),
      trip('b', [TOKYO, '2026-02-01']),
      trip('c', [UNCACHED, '2026-03-01']),
    );
    expect(legs).toEqual([[2, 4]]);
  });
});

describe('journeyLegs — order (FR-006)', () => {
  test('arrivals on one day are ordered by departure, then by trip id', () => {
    const departsLate = trip('a', [ROME, '2026-02-01', '2026-02-09']);
    const departsEarly = trip('b', [TOKYO, '2026-02-01', '2026-02-02']);
    const sameAsEarly = trip('c', [PARIS, '2026-02-01', '2026-02-02']);

    expect(legsOf(departsLate, departsEarly, sameAsEarly)).toEqual([
      [4, 7],
      [7, 1],
    ]);
  });

  test('carries the trips each end belongs to, so a caller can tell a trip leg from a journey leg', () => {
    const globe = toGlobeTrips(
      [
        { id: 'italy', title: 'italy' },
        { id: 'japan', title: 'japan' },
      ],
      [
        ...trip('italy', [ROME, '2026-01-01']).stops,
        ...trip('japan', [TOKYO, '2026-03-01']).stops,
      ],
      TODAY,
    );
    const [leg] = journeyLegs(globe, TODAY);
    expect([leg!.from.tripId, leg!.to.tripId]).toEqual(['italy', 'japan']);
  });
});
