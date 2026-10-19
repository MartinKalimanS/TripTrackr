/**
 * @jest-environment node
 *
 * The trips a screen-reader traveller can step through on the globe (feature 005, T537; FR-017;
 * contract C5-24, `useGlobeActions`): "next trip" and "previous trip". Pure: the order is
 * chronological, only trips with a place on the map are in it, and stepping wraps.
 */
import type { GlobeTrip } from '@/features/globe/globe-data';
import { placedTrips, stepTrip } from '@/features/globe/globe-actions';

const TODAY = '2026-05-10';

function trip(
  id: string,
  arrive: string,
  coordinate: [number, number] | null = [10, 40],
  depart = arrive,
): GlobeTrip {
  return {
    id,
    title: `Trip ${id}`,
    status: 'past',
    stops: [
      {
        id: `${id}-stop`,
        cityId: 1,
        countryId: 1,
        arriveDate: arrive,
        departDate: depart,
        coordinate,
      },
    ],
  };
}

describe('placedTrips', () => {
  test('lists the trips with a place on the map, earliest first', () => {
    const list = placedTrips(
      [
        trip('c', '2026-03-01'),
        trip('a', '2024-01-01'),
        trip('none', '2025-01-01', null),
        { id: 'empty', title: 'Empty', status: 'planning', stops: [] },
        trip('b', '2025-06-01'),
      ],
      TODAY,
    );
    expect(list.map((entry) => entry.tripId)).toEqual(['a', 'b', 'c']);
  });

  test('names each trip and says where it is: the stop the traveller is at, else the first', () => {
    const live: GlobeTrip = {
      id: 'live',
      title: 'Portugal',
      status: 'active',
      stops: [
        {
          id: 's1',
          cityId: 1,
          countryId: 1,
          arriveDate: '2026-05-08',
          departDate: '2026-05-09',
          coordinate: [-9.1, 38.7],
        },
        {
          id: 's2',
          cityId: 2,
          countryId: 1,
          arriveDate: '2026-05-09',
          departDate: '2026-05-12',
          coordinate: [-8.6, 41.1],
        },
      ],
    };
    expect(placedTrips([live], TODAY)).toEqual([
      { tripId: 'live', title: 'Portugal', coordinate: [-8.6, 41.1] },
    ]);
  });

  test('breaks a tie of dates by id, so the order is stable', () => {
    const list = placedTrips([trip('b', '2026-01-01'), trip('a', '2026-01-01')], TODAY);
    expect(list.map((entry) => entry.tripId)).toEqual(['a', 'b']);
  });
});

describe('stepTrip', () => {
  const list = placedTrips(
    [trip('a', '2024-01-01'), trip('b', '2025-01-01'), trip('c', '2026-01-01')],
    TODAY,
  );

  test('steps forward and back from a trip', () => {
    expect(stepTrip(list, 'b', 1)?.tripId).toBe('c');
    expect(stepTrip(list, 'b', -1)?.tripId).toBe('a');
  });

  test('wraps at both ends', () => {
    expect(stepTrip(list, 'c', 1)?.tripId).toBe('a');
    expect(stepTrip(list, 'a', -1)?.tripId).toBe('c');
  });

  test('from nowhere, next is the first and previous is the last', () => {
    expect(stepTrip(list, null, 1)?.tripId).toBe('a');
    expect(stepTrip(list, null, -1)?.tripId).toBe('c');
    expect(stepTrip(list, 'gone', 1)?.tripId).toBe('a');
  });

  test('has nowhere to go with no trips on the map', () => {
    expect(stepTrip([], null, 1)).toBeNull();
  });

  test('with one trip, stays on it', () => {
    const only = placedTrips([trip('a', '2024-01-01')], TODAY);
    expect(stepTrip(only, 'a', 1)?.tripId).toBe('a');
  });
});
