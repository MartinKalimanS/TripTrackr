/**
 * T535 - which trips the Home sheet shows (feature 005; FR-014, FR-015; contracts C5-23):
 * the live trip, else the next planned one, as the `NowCard`; the next planned trip beside a
 * live one as the `NextRow`. Derived on the device from the trips and stops already in the
 * local store (private, read-only, nothing sent): "Day N of M", the city the traveller is in,
 * the stop strip, the countdown and the country's flag.
 */
import type { TripRow } from '@/db/schema';
import type { TripCover } from '@/features/trips/trip-cover';
import type { TripStatus } from '@/features/trips/trip-status';
import type { TripSummary } from '@/features/trips/use-trips';

import {
  coversOf,
  homeTrips,
  stopStrip,
  stripWindow,
  type NamedStop,
} from '../home-trips';

const TODAY = '2026-10-14';

const TYPOGRAPHIC: TripCover = { kind: 'typographic', initial: 'P', status: 'active' };

function summary(
  id: string,
  status: TripStatus,
  range: { start: string; end: string } | null,
  extra: Partial<TripSummary> = {},
): TripSummary {
  return {
    trip: { id, title: `Trip ${id}` } as TripRow,
    stopCount: range === null ? 0 : 1,
    status,
    cover: TYPOGRAPHIC,
    dateRange: range,
    ...extra,
  };
}

let n = 0;
function stop(
  tripId: string,
  sortOrder: number,
  arrive: string,
  depart: string,
  place: { city: string | null; iso: string | null } = { city: 'Somewhere', iso: 'PT' },
): NamedStop {
  n += 1;
  return {
    id: `s${n}`,
    trip_id: tripId,
    sort_order: sortOrder,
    arrive_date: arrive,
    depart_date: depart,
    city_name: place.city,
    country_id: place.iso === null ? null : 1,
    iso_code: place.iso,
  };
}

describe('homeTrips: which trips', () => {
  const active = summary('live', 'active', { start: '2026-10-12', end: '2026-10-19' });
  const planned = summary('soon', 'planning', { start: '2027-01-16', end: '2027-01-24' });
  const later = summary('later', 'planning', { start: '2027-06-01', end: '2027-06-05' });
  const past = summary('old', 'past', { start: '2025-01-01', end: '2025-01-05' });

  test('a live trip is the card and the next planned trip is the row', () => {
    const { now, next } = homeTrips([later, past, planned, active], [], TODAY);
    expect(now?.id).toBe('live');
    expect(now?.status).toBe('active');
    expect(next?.id).toBe('soon');
  });

  test('with no live trip the next planned trip is the card and there is no row', () => {
    const { now, next } = homeTrips([later, past, planned], [], TODAY);
    expect(now?.id).toBe('soon');
    expect(now?.status).toBe('planning');
    expect(next).toBeNull();
  });

  test('with only past trips, or none, there is nothing to show', () => {
    expect(homeTrips([past], [], TODAY)).toEqual({ now: null, next: null });
    expect(homeTrips([], [], TODAY)).toEqual({ now: null, next: null });
  });

  test('of several live trips the one that began first leads; ties go by id', () => {
    const second = summary('b', 'active', { start: '2026-10-10', end: '2026-10-20' });
    const third = summary('a', 'active', { start: '2026-10-10', end: '2026-10-25' });
    expect(homeTrips([active, second, third], [], TODAY).now?.id).toBe('a');
  });

  test('a planned trip with no stops has no date and is never next', () => {
    const empty = summary('empty', 'planning', null);
    expect(homeTrips([empty, later], [], TODAY).now?.id).toBe('later');
    expect(homeTrips([empty], [], TODAY)).toEqual({ now: null, next: null });
  });

  test('carries the title and the cover through', () => {
    const photo: TripCover = {
      kind: 'photo',
      photoId: 'p1',
      thumbnailUri: 'file:///t.jpg',
    };
    const { now } = homeTrips(
      [
        summary(
          'live',
          'active',
          { start: '2026-10-12', end: '2026-10-19' },
          { cover: photo },
        ),
      ],
      [],
      TODAY,
    );
    expect(now?.title).toBe('Trip live');
    expect(now?.cover).toBe(photo);
  });
});

describe('a live trip: day, place, strip', () => {
  const live = summary('live', 'active', { start: '2026-10-12', end: '2026-10-19' });
  const stops = [
    stop('live', 0, '2026-10-12', '2026-10-13', { city: 'Lisbon', iso: 'PT' }),
    stop('live', 1, '2026-10-13', '2026-10-16', { city: 'Sintra', iso: 'PT' }),
    stop('live', 2, '2026-10-17', '2026-10-19', { city: 'Porto', iso: 'PT' }),
    stop('other', 0, '2026-10-14', '2026-10-15', { city: 'Elsewhere', iso: 'FR' }),
  ];

  test('Day N of M counts calendar days from the first arrival', () => {
    expect(homeTrips([live], stops, TODAY).now?.dayOf).toEqual({ day: 3, of: 8 });
    expect(homeTrips([live], stops, '2026-10-12').now?.dayOf).toEqual({ day: 1, of: 8 });
    expect(homeTrips([live], stops, '2026-10-19').now?.dayOf).toEqual({ day: 8, of: 8 });
  });

  test('the place is the city of the stop that covers today', () => {
    expect(homeTrips([live], stops, TODAY).now?.place).toBe('Sintra');
  });

  test('on a travel day the stop being reached is the place', () => {
    expect(homeTrips([live], stops, '2026-10-13').now?.place).toBe('Sintra');
  });

  test('a day between stops has no place, and a stop with no cached city none either', () => {
    expect(homeTrips([live], stops, '2026-10-17').now?.place).toBe('Porto');
    const gap = [
      stop('live', 0, '2026-10-12', '2026-10-13', { city: 'Lisbon', iso: 'PT' }),
      stop('live', 1, '2026-10-17', '2026-10-19', { city: 'Porto', iso: 'PT' }),
    ];
    expect(homeTrips([live], gap, TODAY).now?.place).toBeNull();
    const unnamed = [
      stop('live', 0, '2026-10-12', '2026-10-19', { city: null, iso: null }),
    ];
    expect(homeTrips([live], unnamed, TODAY).now?.place).toBeNull();
  });

  test('the strip has a dot per stop of THIS trip: done, now, then what is still to come', () => {
    expect(homeTrips([live], stops, TODAY).now?.strip).toEqual(['done', 'now', 'next']);
  });

  test('the flag is the first stop with a known country', () => {
    expect(homeTrips([live], stops, TODAY).now?.iso2).toBe('PT');
    const mixed = [
      stop('live', 0, '2026-10-12', '2026-10-13', { city: 'Nowhere', iso: null }),
      stop('live', 1, '2026-10-13', '2026-10-16', { city: 'Nice', iso: 'FR' }),
    ];
    expect(homeTrips([live], mixed, TODAY).now?.iso2).toBe('FR');
    expect(homeTrips([live], [], TODAY).now?.iso2).toBeNull();
  });
});

describe('a planned trip: countdown and month', () => {
  const soon = summary('soon', 'planning', { start: '2027-01-16', end: '2027-01-24' });

  test('counts the days to the first arrival and names the month', () => {
    const { now } = homeTrips([soon], [], TODAY);
    expect(now).toMatchObject({
      daysToGo: 94,
      startsOn: '2027-01-16',
      dayOf: null,
      place: null,
    });
  });

  test('has no live strip: the first stop is next and the rest are later', () => {
    const stops = [
      stop('soon', 0, '2027-01-16', '2027-01-18'),
      stop('soon', 1, '2027-01-19', '2027-01-24'),
    ];
    expect(homeTrips([soon], stops, TODAY).now?.strip).toEqual(['next', 'later']);
  });

  test('a live trip has no countdown', () => {
    const live = summary('live', 'active', { start: '2026-10-12', end: '2026-10-19' });
    expect(homeTrips([live], [], TODAY).now?.daysToGo).toBeNull();
    expect(homeTrips([live], [], TODAY).now?.startsOn).toBe('2026-10-12');
  });
});

describe('stopStrip', () => {
  test('is done before today, now on the stop that covers it, next on the first after', () => {
    const stops = [
      stop('t', 0, '2026-10-01', '2026-10-03'),
      stop('t', 1, '2026-10-04', '2026-10-10'),
      stop('t', 2, '2026-10-11', '2026-10-14'),
      stop('t', 3, '2026-10-20', '2026-10-22'),
      stop('t', 4, '2026-10-23', '2026-10-25'),
    ];
    expect(stopStrip(stops, TODAY)).toEqual(['done', 'done', 'now', 'next', 'later']);
  });

  test('of two stops that cover today the later is now and the earlier is done', () => {
    const stops = [
      stop('t', 0, '2026-10-10', '2026-10-14'),
      stop('t', 1, '2026-10-14', '2026-10-18'),
    ];
    expect(stopStrip(stops, TODAY)).toEqual(['done', 'now']);
  });

  test('between two stops the next one is next and nothing is now', () => {
    const stops = [
      stop('t', 0, '2026-10-10', '2026-10-12'),
      stop('t', 1, '2026-10-16', '2026-10-18'),
    ];
    expect(stopStrip(stops, TODAY)).toEqual(['done', 'next']);
  });

  test('no stops, no dots', () => {
    expect(stopStrip([], TODAY)).toEqual([]);
  });
});

describe('stripWindow: a long trip does not overflow the card', () => {
  const dots = (count: number) => Array.from({ length: count }, () => 'later' as const);

  test('shows every dot up to the limit', () => {
    expect(stripWindow(dots(8), 12)).toEqual({ dots: dots(8), hidden: 0 });
    expect(stripWindow(dots(12), 12).hidden).toBe(0);
  });

  test('beyond it keeps the dots around now and says how many are left out', () => {
    const strip = [
      ...Array.from({ length: 10 }, () => 'done' as const),
      'now' as const,
      ...Array.from({ length: 19 }, () => 'later' as const),
    ];
    const windowed = stripWindow(strip, 12);
    expect(windowed.dots).toHaveLength(12);
    expect(windowed.hidden).toBe(18);
    expect(windowed.dots).toContain('now');
  });

  test('a trip that has not started shows its first dots', () => {
    const strip = ['next' as const, ...dots(29)];
    const windowed = stripWindow(strip, 12);
    expect(windowed.dots[0]).toBe('next');
    expect(windowed.hidden).toBe(18);
  });

  test('a trip nearly over shows its last dots', () => {
    const strip = [...Array.from({ length: 29 }, () => 'done' as const), 'now' as const];
    const windowed = stripWindow(strip, 12);
    expect(windowed.dots.at(-1)).toBe('now');
    expect(windowed.hidden).toBe(18);
  });
});

describe('coversOf: the pictures the globe may draw as pins', () => {
  const photo: TripCover = {
    kind: 'photo',
    photoId: 'p1',
    thumbnailUri: 'file:///thumbs/p1.jpg',
  };

  test('maps each trip with a photograph to its thumbnail, by trip id', () => {
    const covers = coversOf([
      summary('a', 'past', { start: '2025-01-01', end: '2025-01-05' }, { cover: photo }),
      summary('b', 'active', { start: '2026-10-12', end: '2026-10-19' }),
    ]);
    expect(covers).toEqual({ a: 'file:///thumbs/p1.jpg' });
  });

  test('is empty with no photograph: a typographic cover is not a picture', () => {
    expect(coversOf([summary('b', 'active', null)])).toEqual({});
    expect(coversOf([])).toEqual({});
  });
});
