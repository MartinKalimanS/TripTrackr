/**
 * What the globe draws, derived from the local store — research D-30.
 *
 * Rows arrive as the repositories return them: live trips, and every live stop
 * joined to the `cities` cache (null coordinates when the city is not cached)
 * in `(trip, sort_order, created_at, id)` order — the server's pairing order.
 */
import {
  focusTripIds,
  globeInvitation,
  hasPlacedStop,
  placedLegs,
  restingCoordinate,
  toGlobeTrips,
  type GlobeStopRow,
  type GlobeTrip,
} from '../globe-data';

const TODAY = '2026-05-10';

const CITIES = {
  rome: { city_id: 1, country_id: 10, lng: 12.4964, lat: 41.9028 },
  florence: { city_id: 2, country_id: 10, lng: 11.2558, lat: 43.7696 },
  paris: { city_id: 3, country_id: 20, lng: 2.3522, lat: 48.8566 },
  tokyo: { city_id: 4, country_id: 30, lng: 139.6917, lat: 35.6895 },
  uncached: { city_id: 5, country_id: null, lng: null, lat: null },
} as const;

let nextStop = 0;

function stop(
  tripId: string,
  city: (typeof CITIES)[keyof typeof CITIES],
  arrive: string,
  depart: string = arrive,
): GlobeStopRow {
  nextStop += 1;
  return {
    id: `stop-${nextStop}`,
    trip_id: tripId,
    arrive_date: arrive,
    depart_date: depart,
    ...city,
  };
}

const trip = (id: string, title = id) => ({ id, title });

describe('toGlobeTrips', () => {
  test('groups each trip’s stops in the order given and derives its status from them', () => {
    const trips = toGlobeTrips(
      [trip('italy', 'Italy'), trip('japan', 'Japan'), trip('france', 'France')],
      [
        stop('italy', CITIES.rome, '2026-05-09', '2026-05-11'),
        stop('italy', CITIES.florence, '2026-05-11', '2026-05-14'),
        stop('japan', CITIES.tokyo, '2026-08-01', '2026-08-09'),
        stop('france', CITIES.paris, '2025-04-01', '2025-04-03'),
      ],
      TODAY,
    );

    expect(trips.map((t) => [t.id, t.title, t.status, t.stops.length])).toEqual([
      ['italy', 'Italy', 'active', 2],
      ['japan', 'Japan', 'planning', 1],
      ['france', 'France', 'past', 1],
    ]);
    expect(trips[0]!.stops.map((s) => s.cityId)).toEqual([1, 2]);
    expect(trips[0]!.stops[0]).toMatchObject({
      cityId: 1,
      countryId: 10,
      arriveDate: '2026-05-09',
      departDate: '2026-05-11',
      coordinate: [12.4964, 41.9028],
    });
  });

  test('a stop whose city is not cached has no coordinate — never a guessed one', () => {
    const [only] = toGlobeTrips(
      [trip('t')],
      [stop('t', CITIES.uncached, '2026-05-10')],
      TODAY,
    );
    expect(only!.stops[0]).toMatchObject({ coordinate: null, countryId: null });
    expect(hasPlacedStop(only!)).toBe(false);
  });

  test('a coordinate that is not a real position counts as unknown, not as a place', () => {
    const bad = [
      { city_id: 7, country_id: 1, lng: 12.5, lat: 91 },
      { city_id: 8, country_id: 1, lng: 181, lat: 41.9 },
      { city_id: 9, country_id: 1, lng: Number.NaN, lat: 41.9 },
      { city_id: 10, country_id: 1, lng: 12.5, lat: Number.POSITIVE_INFINITY },
    ];
    const [only] = toGlobeTrips(
      [trip('t')],
      bad.map((city, i) => ({
        id: `bad-${i}`,
        trip_id: 't',
        arrive_date: TODAY,
        depart_date: TODAY,
        ...city,
      })),
      TODAY,
    );
    expect(only!.stops.map((s) => s.coordinate)).toEqual([null, null, null, null]);
    expect(hasPlacedStop(only!)).toBe(false);
  });

  test('stops of a trip that is not in the live list are ignored', () => {
    const trips = toGlobeTrips([trip('kept')], [stop('gone', CITIES.rome, TODAY)], TODAY);
    expect(trips).toEqual([{ id: 'kept', title: 'kept', status: 'planning', stops: [] }]);
  });

  test('a trip with no stops is planning and has nothing to place', () => {
    const [empty] = toGlobeTrips([trip('t')], [], TODAY);
    expect(empty!.status).toBe('planning');
    expect(hasPlacedStop(empty!)).toBe(false);
  });
});

describe('placedLegs', () => {
  test('pairs consecutive placed stops, and leaves out every leg touching an unplaced one', () => {
    const [italy] = toGlobeTrips(
      [trip('t')],
      [
        stop('t', CITIES.rome, TODAY),
        stop('t', CITIES.florence, TODAY),
        stop('t', CITIES.uncached, TODAY),
        stop('t', CITIES.paris, TODAY),
        stop('t', CITIES.tokyo, TODAY),
      ],
      TODAY,
    );

    expect(placedLegs(italy!).map((leg) => [leg.from.cityId, leg.to.cityId])).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  test('a single-stop trip has no legs', () => {
    const [single] = toGlobeTrips([trip('t')], [stop('t', CITIES.rome, TODAY)], TODAY);
    expect(placedLegs(single!)).toEqual([]);
    expect(hasPlacedStop(single!)).toBe(true);
  });
});

describe('focusTripIds — the trips that animate (FR-046; spec Edge Cases, Globe)', () => {
  const build = (stops: GlobeStopRow[], ids: string[]) =>
    toGlobeTrips(
      ids.map((id) => trip(id)),
      stops,
      TODAY,
    );

  test('every active trip, and only those, while any is active', () => {
    const trips = build(
      [
        stop('a', CITIES.rome, '2026-05-01', '2026-05-20'),
        stop('b', CITIES.paris, '2026-05-09', '2026-05-11'),
        stop('p', CITIES.tokyo, '2026-06-01'),
        stop('x', CITIES.florence, '2025-01-01'),
      ],
      ['a', 'b', 'p', 'x'],
    );
    expect(focusTripIds(trips)).toEqual(['a', 'b']);
  });

  test('with none active, the planned trip that starts soonest', () => {
    const trips = build(
      [
        stop('later', CITIES.tokyo, '2026-09-01'),
        stop('sooner', CITIES.paris, '2026-06-15'),
        stop('sooner', CITIES.rome, '2026-06-01'),
        stop('past', CITIES.florence, '2025-01-01'),
      ],
      ['later', 'sooner', 'past'],
    );
    expect(focusTripIds(trips)).toEqual(['sooner']);
  });

  test('ties on the start date resolve by id, so the choice is stable', () => {
    const trips = build(
      [stop('b', CITIES.paris, '2026-06-01'), stop('a', CITIES.rome, '2026-06-01')],
      ['b', 'a'],
    );
    expect(focusTripIds(trips)).toEqual(['a']);
  });

  test('nothing moves when every trip is past, or when nothing can be placed', () => {
    expect(focusTripIds(build([stop('x', CITIES.rome, '2025-01-01')], ['x']))).toEqual(
      [],
    );
    expect(focusTripIds(build([stop('u', CITIES.uncached, TODAY)], ['u']))).toEqual([]);
    expect(focusTripIds(build([], ['empty']))).toEqual([]);
  });
});

describe('restingCoordinate — where the beacon waits under reduced motion', () => {
  const italy = (stops: GlobeStopRow[]): GlobeTrip =>
    toGlobeTrips([trip('t')], stops, TODAY)[0]!;

  test('the stop the traveller is at today', () => {
    const t = italy([
      stop('t', CITIES.rome, '2026-05-01', '2026-05-09'),
      stop('t', CITIES.florence, '2026-05-09', '2026-05-12'),
    ]);
    expect(restingCoordinate(t, TODAY)).toEqual([11.2558, 43.7696]);
  });

  test('on a travel day, the stop being reached — where the day ends', () => {
    const t = italy([
      stop('t', CITIES.rome, '2026-05-08', TODAY),
      stop('t', CITIES.florence, TODAY, '2026-05-12'),
    ]);
    expect(restingCoordinate(t, TODAY)).toEqual([11.2558, 43.7696]);
  });

  test('otherwise the first placed stop', () => {
    const t = italy([
      stop('t', CITIES.uncached, '2026-06-01'),
      stop('t', CITIES.paris, '2026-06-02'),
    ]);
    expect(restingCoordinate(t, TODAY)).toEqual([2.3522, 48.8566]);
  });

  test('nothing when no stop is placed', () => {
    expect(
      restingCoordinate(italy([stop('t', CITIES.uncached, TODAY)]), TODAY),
    ).toBeNull();
  });
});

describe('globeInvitation — what floats over a globe with nothing to draw (feature 003, FR-002)', () => {
  const globeOf = (...rows: GlobeStopRow[]) =>
    toGlobeTrips([trip('a', 'Alps'), trip('b', 'Baltic')], rows, TODAY);

  test('no trips: no card, the sheet and the Plan a trip button are the invitation (feature 007)', () => {
    expect(globeInvitation([])).toBeNull();
  });

  test('exactly one trip without a placed stop: invite its first stop and name the trip', () => {
    const [alps] = toGlobeTrips([trip('a', 'Alps')], [], TODAY);
    expect(globeInvitation([alps!])).toEqual({
      reason: 'no-stops',
      tripId: 'a',
      tripTitle: 'Alps',
    });
  });

  test('a trip whose only stop cannot be placed still needs a stop on the globe', () => {
    const [alps] = toGlobeTrips(
      [trip('a', 'Alps')],
      [stop('a', CITIES.uncached, TODAY)],
      TODAY,
    );
    expect(globeInvitation([alps!])).toMatchObject({ reason: 'no-stops', tripId: 'a' });
  });

  test('several trips without a placed stop: point at the list, naming none', () => {
    expect(globeInvitation(globeOf())).toEqual({ reason: 'no-stops' });
  });

  test('anything placed, however few: nothing to invite', () => {
    expect(globeInvitation(globeOf(stop('a', CITIES.rome, TODAY)))).toBeNull();
  });
});

describe('the country of a stop (T532)', () => {
  test('carries the ISO code the row has, and null when it has none', () => {
    const [only] = toGlobeTrips(
      [trip('t')],
      [
        { ...stop('t', CITIES.rome, '2026-05-09'), country_iso: 'IT' },
        stop('t', CITIES.paris, '2026-05-10'),
        { ...stop('t', CITIES.tokyo, '2026-05-11'), country_iso: null },
      ],
      TODAY,
    );
    expect(only!.stops.map((s) => s.countryIso)).toEqual(['IT', null, null]);
  });

  test('is separate from the country id the statistics count by', () => {
    const [only] = toGlobeTrips(
      [trip('t')],
      [{ ...stop('t', CITIES.rome, '2026-05-09'), country_iso: 'IT' }],
      TODAY,
    );
    expect(only!.stops[0]).toMatchObject({ countryId: 10, countryIso: 'IT' });
  });
});
