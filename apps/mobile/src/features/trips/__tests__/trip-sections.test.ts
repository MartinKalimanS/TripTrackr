/**
 * The trips list, composed - feature 005, T539 (FR-029, FR-030, FR-035; data-model section 6;
 * research D5-17). `composeTripList` turns the trip card models into what the screen draws, in
 * order: the active trip with the earliest arrival as the hero, the next planned trip as the
 * ticket, every other trip as a row, rows grouped under year headers with the year's trips and
 * kilometres. A filter is applied BEFORE any of that, so a filtered list is composed exactly as
 * if it were the whole list.
 *
 * The last block runs the whole path from rows to sections: `buildTripCards`, then
 * `composeTripList`.
 */
import type { StopWithCountry } from '@/db/repositories/stops';
import type { TripRow } from '@/db/schema';
import {
  buildTripCards,
  type TripCardModel,
  type StopDot,
} from '@/features/trips/trip-card-model';
import {
  composeTripList,
  listedYears,
  tripFilterCounts,
  tripItemKey,
  tripItemType,
  tripSpan,
  yearHeaderIndex,
  yearOfItems,
  type TripListItem,
} from '@/features/trips/trip-sections';
import type { TripStatus } from '@/features/trips/trip-status';

jest.mock('expo-file-system', () => ({
  Paths: { document: { uri: 'file:///data/app/documents/' } },
  File: class {},
  Directory: class {},
}));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

interface CardInput {
  status?: TripStatus;
  start?: string | null;
  end?: string | null;
  km?: number;
  createdAt?: string;
  title?: string;
}

/** A card model with only what the composition reads set on purpose. */
function card(id: string, input: CardInput = {}): TripCardModel {
  const { status = 'past', km = 0, createdAt = '2020-01-01T00:00:00.000Z' } = input;
  const start = input.start === undefined ? '2025-06-01' : input.start;
  const end = input.end === undefined ? start : input.end;
  const dated = start !== null && end !== null;
  const strip: StopDot[] = dated ? ['done'] : [];
  return {
    id,
    title: input.title ?? `Trip ${id}`,
    trip: {
      id,
      title: input.title ?? `Trip ${id}`,
      home_currency: 'EUR',
      is_public: false,
      cover_photo_id: null,
      status,
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
      is_dirty: false,
      synced_at: createdAt,
    },
    stopCount: dated ? 1 : 0,
    status,
    cover: { kind: 'typographic', initial: 'T', status },
    generated: { palette: 0, iso2: null, initial: `Trip ${id}` },
    dateRange: dated ? { start, end } : null,
    lengthDays: dated ? 1 : null,
    country: null,
    dayOf: null,
    daysToGo: null,
    strip,
    stripLabels: strip.map(() => ''),
    distanceKm: km,
    pending: false,
  };
}

const active = (id: string, start: string, end = '2026-12-31') =>
  card(id, { status: 'active', start, end });
const planned = (id: string, start: string, km = 0) =>
  card(id, { status: 'planning', start, end: start, km });
const past = (id: string, start: string, km = 0) =>
  card(id, { status: 'past', start, end: start, km });
const undated = (id: string, createdAt: string) =>
  card(id, { status: 'planning', start: null, end: null, createdAt });

const types = (items: readonly TripListItem[]) => items.map((item) => item.type);
const keys = (items: readonly TripListItem[]) => items.map(tripItemKey);

describe('composeTripList: the hero', () => {
  test('is the active trip with the earliest arrival', () => {
    const items = composeTripList(
      [active('late', '2026-10-14'), active('early', '2026-10-01')],
      'all',
    );
    expect(items[0]).toMatchObject({ type: 'hero', trip: { id: 'early' } });
  });

  test('further active trips follow as rows, before the first year header', () => {
    const items = composeTripList(
      [
        past('old', '2024-05-01'),
        active('b', '2026-10-14'),
        active('a', '2026-10-01'),
        active('c', '2026-10-20'),
      ],
      'all',
    );
    expect(types(items)).toEqual(['hero', 'row', 'row', 'yearHeader', 'row']);
    expect(items.slice(0, 3).map((i) => (i as { trip: TripCardModel }).trip.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  test('a tie keeps the order the list was given', () => {
    const items = composeTripList(
      [active('second', '2026-10-01'), active('first', '2026-10-01')],
      'all',
    );
    expect(keys(items)).toEqual(['second', 'first']);
  });

  test('there is no hero without an active trip', () => {
    expect(types(composeTripList([planned('p', '2027-01-10')], 'all'))).not.toContain(
      'hero',
    );
  });
});

describe('composeTripList: the ticket', () => {
  test('is the planning trip with the earliest start, after the hero', () => {
    const items = composeTripList(
      [
        planned('later', '2027-03-01'),
        active('now', '2026-10-01'),
        planned('sooner', '2026-12-05'),
      ],
      'all',
    );
    expect(types(items).slice(0, 2)).toEqual(['hero', 'ticket']);
    expect(items[1]).toMatchObject({ trip: { id: 'sooner' } });
  });

  test('other planned trips are rows, under the header of their year', () => {
    const items = composeTripList(
      [
        planned('a', '2026-12-05'),
        planned('b', '2027-03-01'),
        planned('c', '2027-01-09'),
      ],
      'all',
    );
    expect(types(items)).toEqual(['ticket', 'yearHeader', 'row', 'row']);
    expect(items[1]).toMatchObject({ year: 2027, tripCount: 2 });
    expect(keys(items).slice(2)).toEqual(['b', 'c']);
  });

  test('a planning trip with no stops is never the ticket: it has no countdown', () => {
    const items = composeTripList(
      [undated('blank', '2026-09-01T00:00:00.000Z'), planned('dated', '2027-01-01')],
      'all',
    );
    expect(items[0]).toMatchObject({ type: 'ticket', trip: { id: 'dated' } });
  });
});

describe('composeTripList: rows under year headers', () => {
  const trips = [
    past('p-2024-a', '2024-02-01', 100),
    past('p-2025-a', '2025-03-01', 1000),
    past('p-2024-b', '2024-09-01', 250.5),
    past('p-2025-b', '2025-11-20', 500),
    past('p-2023', '2023-07-04', 40),
  ];

  test('years run newest first and, inside a year, the newest start first', () => {
    const items = composeTripList(trips, 'all');
    expect(items.map((i) => (i.type === 'yearHeader' ? i.year : tripItemKey(i)))).toEqual(
      [2025, 'p-2025-b', 'p-2025-a', 2024, 'p-2024-b', 'p-2024-a', 2023, 'p-2023'],
    );
  });

  test('a header carries the trips under it and their kilometres, summed', () => {
    const headers = composeTripList(trips, 'all').filter(
      (item): item is Extract<TripListItem, { type: 'yearHeader' }> =>
        item.type === 'yearHeader',
    );
    expect(headers).toEqual([
      { type: 'yearHeader', year: 2025, tripCount: 2, distanceKm: 1500 },
      { type: 'yearHeader', year: 2024, tripCount: 2, distanceKm: 350.5 },
      { type: 'yearHeader', year: 2023, tripCount: 1, distanceKm: 40 },
    ]);
  });

  test('the hero and the ticket are not counted under their year', () => {
    const items = composeTripList(
      [
        active('now', '2026-10-01'),
        planned('next', '2026-12-01', 900),
        past('before', '2026-03-01', 120),
      ],
      'all',
    );
    expect(items[2]).toEqual({
      type: 'yearHeader',
      year: 2026,
      tripCount: 1,
      distanceKm: 120,
    });
  });

  test('a year is the year of the start of the trip, as the calendar day it is', () => {
    const items = composeTripList(
      [card('nye', { status: 'past', start: '2025-12-31', end: '2026-01-03' })],
      'all',
    );
    expect(items[0]).toMatchObject({ type: 'yearHeader', year: 2025 });
  });

  test('trips with no stops are under "none", before every year, newest created first', () => {
    const items = composeTripList(
      [
        past('old', '2024-05-01'),
        undated('first', '2026-01-01T00:00:00.000Z'),
        undated('second', '2026-03-01T00:00:00.000Z'),
      ],
      'all',
    );
    expect(items.map((i) => (i.type === 'yearHeader' ? i.year : tripItemKey(i)))).toEqual(
      ['none', 'second', 'first', 2024, 'old'],
    );
    expect(items[0]).toEqual({
      type: 'yearHeader',
      year: 'none',
      tripCount: 2,
      distanceKm: 0,
    });
  });
});

describe('composeTripList: the filter comes first', () => {
  const trips = [
    active('now', '2026-10-01'),
    planned('next', '2026-12-01'),
    planned('after', '2027-02-01'),
    past('before', '2026-03-01', 300),
    past('older', '2025-03-01', 700),
    undated('blank', '2026-05-01T00:00:00.000Z'),
  ];

  test('all is everything, composed', () => {
    // none, 2027, 2026, 2025: one row under each header.
    expect(types(composeTripList(trips, 'all'))).toEqual([
      'hero',
      'ticket',
      'yearHeader',
      'row',
      'yearHeader',
      'row',
      'yearHeader',
      'row',
      'yearHeader',
      'row',
    ]);
  });

  test('active keeps the hero and the other active trips only', () => {
    expect(types(composeTripList(trips, 'active'))).toEqual(['hero']);
    expect(
      types(composeTripList([...trips, active('also', '2026-10-05')], 'active')),
    ).toEqual(['hero', 'row']);
  });

  test('planned is composed as its own list: its earliest trip is the ticket', () => {
    const items = composeTripList(trips, 'planned');
    expect(types(items)).toEqual(['ticket', 'yearHeader', 'row', 'yearHeader', 'row']);
    expect(items[0]).toMatchObject({ trip: { id: 'next' } });
    // The "none" header holds the trip with no stops; 2027 the later planned one.
    expect(items.filter((i) => i.type === 'yearHeader')).toEqual([
      { type: 'yearHeader', year: 'none', tripCount: 1, distanceKm: 0 },
      { type: 'yearHeader', year: 2027, tripCount: 1, distanceKm: 0 },
    ]);
  });

  test('past is rows under headers with no hero and no ticket', () => {
    const items = composeTripList(trips, 'past');
    expect(types(items)).toEqual(['yearHeader', 'row', 'yearHeader', 'row']);
    expect(items[0]).toMatchObject({ year: 2026, distanceKm: 300 });
  });

  test('a filter with no match is an empty list, not a list of headers', () => {
    expect(composeTripList([past('only', '2024-01-01')], 'active')).toEqual([]);
    expect(composeTripList([], 'all')).toEqual([]);
  });

  test('leaves its input as it was', () => {
    const frozen = Object.freeze([...trips]);
    expect(() => composeTripList(frozen, 'all')).not.toThrow();
    expect(frozen.map((t) => t.id)).toEqual(trips.map((t) => t.id));
  });
});

describe('tripFilterCounts, tripSpan', () => {
  const trips = [
    active('a', '2026-10-01'),
    planned('b', '2026-12-01'),
    undated('c', '2026-01-01T00:00:00.000Z'),
    past('d', '2009-03-01'),
    past('e', '2012-03-01'),
  ];

  test('counts every filter over the whole list', () => {
    expect(tripFilterCounts(trips)).toEqual({ all: 5, active: 1, planned: 2, past: 2 });
    expect(tripFilterCounts([])).toEqual({ all: 0, active: 0, planned: 0, past: 0 });
  });

  test('says how many trips there are and since when', () => {
    expect(tripSpan(trips)).toEqual({ count: 5, sinceYear: 2009 });
    expect(tripSpan([undated('x', '2026-01-01T00:00:00.000Z')])).toEqual({
      count: 1,
      sinceYear: null,
    });
    expect(tripSpan([])).toEqual({ count: 0, sinceYear: null });
  });

  test('reads a very long journal without a spread of its years (the call stack is not the limit)', () => {
    const long = Array.from({ length: 200_000 }, () => past('p', '2015-03-01'));
    expect(tripSpan(long)).toEqual({ count: 200_000, sinceYear: 2015 });
  });
});

describe('item type, key and year lookups', () => {
  const items = composeTripList(
    [
      active('now', '2026-10-01'),
      planned('next', '2026-12-01'),
      past('a', '2025-03-01'),
      past('b', '2024-03-01'),
      undated('blank', '2026-05-01T00:00:00.000Z'),
    ],
    'all',
  );

  test('the type is the item type FlashList recycles by', () => {
    expect(items.map(tripItemType)).toEqual([
      'hero',
      'ticket',
      'yearHeader',
      'row',
      'yearHeader',
      'row',
      'yearHeader',
      'row',
    ]);
  });

  test('keys are unique and a header never collides with a trip', () => {
    const all = keys(items);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toContain('year-none');
    expect(all).toContain('year-2025');
  });

  test('every item knows its year, so the scrubber can follow the scroll', () => {
    expect(yearOfItems(items)).toEqual([
      null,
      null,
      'none',
      'none',
      2025,
      2025,
      2024,
      2024,
    ]);
  });

  test('the years listed are the numbered headers, newest first', () => {
    expect(listedYears(items)).toEqual([2025, 2024]);
  });

  test('the index of a year header, or -1', () => {
    expect(yearHeaderIndex(items, 2025)).toBe(4);
    expect(yearHeaderIndex(items, 2024)).toBe(6);
    expect(yearHeaderIndex(items, 1999)).toBe(-1);
  });
});

describe('from rows to sections', () => {
  const NOW = '2026-06-01T10:00:00.000Z';
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const tripRow = (id: string, title: string): TripRow => ({
    id,
    title,
    home_currency: 'EUR',
    is_public: false,
    cover_photo_id: null,
    status: 'planning',
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    is_dirty: false,
    synced_at: NOW,
  });
  const stop = (n: number, tripId: string, arrive: string, depart: string) =>
    ({
      id: uuid(100 + n),
      trip_id: tripId,
      city_id: 100 + n,
      sort_order: 0,
      arrive_date: arrive,
      depart_date: depart,
      created_at: NOW,
      updated_at: NOW,
      deleted_at: null,
      is_dirty: false,
      synced_at: NOW,
      city_name: 'Lisbon',
      country_id: 1,
      country_iso: 'PT',
      country_name: 'Portugal',
      lat: 38.7,
      lng: -9.1,
    }) satisfies StopWithCountry;

  test('the hero carries its day, the ticket its countdown, a row its year', () => {
    const cards = buildTripCards(
      [
        tripRow(uuid(1), 'Portugal Road Trip'),
        tripRow(uuid(2), 'Iceland Ring Road'),
        tripRow(uuid(3), 'Tokyo'),
        tripRow(uuid(4), 'Idea'),
      ],
      [
        stop(1, uuid(1), '2026-10-12', '2026-10-19'),
        stop(2, uuid(2), '2027-01-16', '2027-01-24'),
        stop(3, uuid(3), '2026-03-02', '2026-03-10'),
      ],
      [],
      '2026-10-14',
    );

    const items = composeTripList(cards, 'all');

    expect(types(items)).toEqual([
      'hero',
      'ticket',
      'yearHeader',
      'row',
      'yearHeader',
      'row',
    ]);
    expect(items[0]).toMatchObject({ trip: { dayOf: { day: 3, of: 8 } } });
    expect(items[1]).toMatchObject({ trip: { daysToGo: 94 } });
    expect(items[2]).toMatchObject({ year: 'none' });
    expect(items[4]).toMatchObject({ year: 2026, tripCount: 1 });
  });
});
