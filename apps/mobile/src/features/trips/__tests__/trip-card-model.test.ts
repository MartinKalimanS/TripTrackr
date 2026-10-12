/**
 * The trip card model - feature 005, T539 (FR-030, FR-031, FR-032, FR-034; data-model section
 * 6; research D5-17). Everything a hero, a ticket or a row draws is derived on the device from
 * the traveller's own local rows: the day of the trip, the days to go, one dot per stop, the
 * country, the distance and the generated cover. Pure: nothing here reads the store, the
 * network or the clock (`today` is always handed in).
 */
import { coverPalette } from '@/components/ui/generated-cover';
import type { CoverCandidate } from '@/db/repositories/photos';
import type { StopWithCountry } from '@/db/repositories/stops';
import type { TripRow } from '@/db/schema';
import { travelSummary } from '@/features/globe/travel-stats';
import { toGlobeTrips } from '@/features/globe/globe-data';
import {
  buildTripCards,
  dayOfTrip,
  daysToGo,
  generatedCover,
  lengthInDays,
  stopLabels,
  stopStrip,
  tripCountry,
  tripDistanceKm,
} from '@/features/trips/trip-card-model';

// `thumbnailUri` joins the documents directory as a string; the module needs
// `expo-file-system` and Sentry to import, neither is used by a read.
jest.mock('expo-file-system', () => ({
  Paths: { document: { uri: 'file:///data/app/documents/' } },
  File: class {},
  Directory: class {},
}));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NOW = '2026-06-01T10:00:00.000Z';

function tripRow(id: string, overrides: Partial<TripRow> = {}): TripRow {
  return {
    id,
    title: 'Portugal Road Trip',
    home_currency: 'EUR',
    is_public: false,
    cover_photo_id: null,
    status: 'planning',
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    is_dirty: false,
    synced_at: NOW,
    ...overrides,
  };
}

const LISBON = { city_name: 'Lisbon', lat: 38.7223, lng: -9.1393 };
const SINTRA = { city_name: 'Sintra', lat: 38.8029, lng: -9.3817 };
const PORTO = { city_name: 'Porto', lat: 41.1579, lng: -8.6291 };
const PT = { country_id: 1, country_iso: 'PT', country_name: 'Portugal' };

function stop(
  n: number,
  arrive: string,
  depart: string,
  place: Partial<StopWithCountry> = {},
  tripId = uuid(1),
): StopWithCountry {
  return {
    id: uuid(10 + n),
    trip_id: tripId,
    city_id: 100 + n,
    sort_order: n,
    arrive_date: arrive,
    depart_date: depart,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    is_dirty: false,
    synced_at: NOW,
    city_name: null,
    country_id: null,
    country_iso: null,
    country_name: null,
    lat: null,
    lng: null,
    ...place,
  };
}

describe('stopStrip: one dot per stop', () => {
  const trip = [
    { arrive_date: '2026-10-12', depart_date: '2026-10-14' },
    { arrive_date: '2026-10-14', depart_date: '2026-10-16' },
    { arrive_date: '2026-10-16', depart_date: '2026-10-19' },
  ];

  test('a trip that has not started: the first stop is next, the rest later', () => {
    expect(stopStrip(trip, '2026-10-01')).toEqual(['next', 'later', 'later']);
  });

  test('a trip that is over: every stop is done', () => {
    expect(stopStrip(trip, '2026-11-01')).toEqual(['done', 'done', 'done']);
  });

  test('inside a stop: earlier stops are done, this one is now, the following one is next', () => {
    expect(stopStrip(trip, '2026-10-15')).toEqual(['done', 'now', 'next']);
  });

  test('on a day of transfer the stop being arrived at is the one that is now', () => {
    expect(stopStrip(trip, '2026-10-14')).toEqual(['done', 'now', 'next']);
    expect(stopStrip(trip, '2026-10-16')).toEqual(['done', 'done', 'now']);
  });

  test('in a gap between two stops nothing is now and the coming stop is next', () => {
    const gap = [
      { arrive_date: '2026-10-12', depart_date: '2026-10-14' },
      { arrive_date: '2026-10-17', depart_date: '2026-10-19' },
      { arrive_date: '2026-10-20', depart_date: '2026-10-21' },
    ];
    expect(stopStrip(gap, '2026-10-15')).toEqual(['done', 'next', 'later']);
  });

  test('no stops, no dots', () => {
    expect(stopStrip([], '2026-10-15')).toEqual([]);
  });

  test('is a new array each time and leaves its input alone', () => {
    const frozen = Object.freeze(trip.map((s) => Object.freeze({ ...s })));
    expect(stopStrip(frozen, '2026-10-15')).not.toBe(stopStrip(frozen, '2026-10-15'));
  });
});

describe('stopLabels: the abbreviation under each dot', () => {
  test('the first three letters of the city, upper case, accents folded', () => {
    expect(
      stopLabels([
        { city_name: 'Lisbon' },
        { city_name: 'Zürich' },
        { city_name: 'Évora' },
      ]),
    ).toEqual(['LIS', 'ZUR', 'EVO']);
  });

  test('a city this device has not cached has an empty label, not a guess', () => {
    expect(stopLabels([{ city_name: null }, { city_name: '  ' }])).toEqual(['', '']);
  });

  test('a name that is not Latin keeps its first three characters', () => {
    expect(stopLabels([{ city_name: '東京都庁' }])).toEqual(['東京都']);
  });
});

describe('lengthInDays, dayOfTrip, daysToGo', () => {
  const range = { start: '2026-10-12', end: '2026-10-19' };

  test('the length counts both ends of the range', () => {
    expect(lengthInDays(range)).toBe(8);
    expect(lengthInDays({ start: '2026-10-12', end: '2026-10-12' })).toBe(1);
    expect(lengthInDays({ start: '2026-12-30', end: '2027-01-02' })).toBe(4);
    expect(lengthInDays(null)).toBeNull();
  });

  test('"Day 3 of 8" on the third day of an active trip', () => {
    expect(dayOfTrip(range, 'active', '2026-10-14')).toEqual({ day: 3, of: 8 });
    expect(dayOfTrip(range, 'active', '2026-10-12')).toEqual({ day: 1, of: 8 });
    expect(dayOfTrip(range, 'active', '2026-10-19')).toEqual({ day: 8, of: 8 });
  });

  test('only an active trip has a day', () => {
    expect(dayOfTrip(range, 'planning', '2026-10-01')).toBeNull();
    expect(dayOfTrip(range, 'past', '2026-11-01')).toBeNull();
    expect(dayOfTrip(null, 'active', '2026-10-14')).toBeNull();
  });

  test('days to go count calendar days across a month and a year boundary', () => {
    expect(daysToGo(range, 'planning', '2026-10-01')).toBe(11);
    expect(
      daysToGo({ start: '2027-01-03', end: '2027-01-09' }, 'planning', '2026-12-31'),
    ).toBe(3);
    expect(daysToGo(range, 'planning', '2026-10-11')).toBe(1);
  });

  test('only a planning trip with dates has days to go', () => {
    expect(daysToGo(range, 'active', '2026-10-14')).toBeNull();
    expect(daysToGo(range, 'past', '2026-11-01')).toBeNull();
    expect(daysToGo(null, 'planning', '2026-10-01')).toBeNull();
  });
});

describe('tripCountry', () => {
  test('is the country of the first stop that has one', () => {
    expect(
      tripCountry([
        stop(0, '2026-10-12', '2026-10-13'),
        stop(1, '2026-10-13', '2026-10-14', PT),
        stop(2, '2026-10-14', '2026-10-15', {
          country_id: 2,
          country_iso: 'ES',
          country_name: 'Spain',
        }),
      ]),
    ).toEqual({ iso2: 'PT', name: 'Portugal' });
  });

  test('is null when no stop is in a cached city', () => {
    expect(tripCountry([stop(0, '2026-10-12', '2026-10-13')])).toBeNull();
    expect(tripCountry([])).toBeNull();
  });
});

describe('tripDistanceKm', () => {
  const placed = [
    stop(0, '2026-10-12', '2026-10-14', { ...LISBON, ...PT }),
    stop(1, '2026-10-14', '2026-10-16', { ...SINTRA, ...PT }),
    stop(2, '2026-10-16', '2026-10-19', { ...PORTO, ...PT }),
  ];

  test('is the globe statistic for the same trip: its legs, summed on the sphere', () => {
    const globe = travelSummary(
      toGlobeTrips([{ id: uuid(1), title: 'x' }], placed, '2026-10-15'),
    );
    expect(tripDistanceKm(placed)).toBe(globe.distanceKm);
    // Lisbon to Sintra is about 23 km, Sintra to Porto about 270 km.
    expect(tripDistanceKm(placed)).toBeGreaterThan(250);
    expect(tripDistanceKm(placed)).toBeLessThan(350);
  });

  test('a leg that touches an unplaced stop is left out, never bridged', () => {
    const gap = [placed[0]!, stop(1, '2026-10-14', '2026-10-16'), placed[2]!];
    expect(tripDistanceKm(gap)).toBe(0);
  });

  test('is zero for no stop and for one stop', () => {
    expect(tripDistanceKm([])).toBe(0);
    expect(tripDistanceKm([placed[0]!])).toBe(0);
  });
});

describe('generatedCover: what a trip with no photograph shows', () => {
  test('the palette is the id hash modulo three, the one GeneratedCover picks', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      expect(generatedCover(uuid(n), 'Trip', null).palette).toBe(coverPalette(uuid(n)));
    }
  });

  test('carries the country code and the title it falls back to', () => {
    expect(
      generatedCover(uuid(1), 'Iceland Ring Road', { iso2: 'IS', name: 'Iceland' }),
    ).toEqual({
      palette: coverPalette(uuid(1)),
      iso2: 'IS',
      initial: 'Iceland Ring Road',
    });
    expect(generatedCover(uuid(1), 'Iceland Ring Road', null).iso2).toBeNull();
  });
});

describe('buildTripCards', () => {
  const TODAY = '2026-10-14';
  const thumbnail = (tripId: string, photoId: string) =>
    `file:///data/app/documents/photos/${tripId}/${photoId}.thumb.jpg`;

  function candidate(n: number, tripId: string, takenAt: string | null = null) {
    const id = uuid(200 + n);
    return {
      id,
      trip_id: tripId,
      taken_at: takenAt,
      created_at: NOW,
      local_file_uri: `photos/${tripId}/${id}.jpg`,
    } satisfies CoverCandidate;
  }

  const stops = [
    stop(0, '2026-10-12', '2026-10-14', { ...LISBON, ...PT }),
    stop(1, '2026-10-14', '2026-10-16', { ...SINTRA, ...PT }),
    stop(2, '2026-10-16', '2026-10-19', { ...PORTO, ...PT }),
  ];

  test('an active trip carries its day, its dots, its country and its distance', () => {
    const [card] = buildTripCards([tripRow(uuid(1))], stops, [], TODAY);

    expect(card).toMatchObject({
      id: uuid(1),
      title: 'Portugal Road Trip',
      status: 'active',
      stopCount: 3,
      dateRange: { start: '2026-10-12', end: '2026-10-19' },
      lengthDays: 8,
      dayOf: { day: 3, of: 8 },
      daysToGo: null,
      strip: ['done', 'now', 'next'],
      stripLabels: ['LIS', 'SIN', 'POR'],
      country: { iso2: 'PT', name: 'Portugal' },
      pending: false,
    });
    expect(card!.distanceKm).toBe(tripDistanceKm(stops));
  });

  test('keeps every field of the 004 summary beside the new ones', () => {
    const [card] = buildTripCards([tripRow(uuid(1))], stops, [], TODAY);
    expect(card!.trip.id).toBe(uuid(1));
    expect(card!.cover).toEqual({ kind: 'typographic', initial: 'P', status: 'active' });
  });

  test('a planning trip counts the days to go and has no day', () => {
    const [card] = buildTripCards([tripRow(uuid(1))], stops, [], '2026-10-01');
    expect(card).toMatchObject({
      status: 'planning',
      daysToGo: 11,
      dayOf: null,
      strip: ['next', 'later', 'later'],
    });
  });

  test('a trip with no stop has no range, no length, no dots, no country and no distance', () => {
    const [card] = buildTripCards([tripRow(uuid(1))], [], [], TODAY);
    expect(card).toMatchObject({
      status: 'planning',
      stopCount: 0,
      dateRange: null,
      lengthDays: null,
      dayOf: null,
      daysToGo: null,
      strip: [],
      stripLabels: [],
      country: null,
      distanceKm: 0,
    });
  });

  test('never borrows another trip’s stops', () => {
    const other = uuid(2);
    const cards = buildTripCards(
      [tripRow(uuid(1)), tripRow(other, { title: 'Peru' })],
      [
        ...stops,
        stop(
          5,
          '2026-12-01',
          '2026-12-05',
          { country_iso: 'PE', country_name: 'Peru' },
          other,
        ),
      ],
      [],
      TODAY,
    );
    expect(cards.map((c) => c.stopCount)).toEqual([3, 1]);
    expect(cards.map((c) => c.country?.iso2)).toEqual(['PT', 'PE']);
  });

  test('the cover is the designated photograph, else the earliest, else the generated one', () => {
    const trips = [
      tripRow(uuid(1), { cover_photo_id: uuid(202) }),
      tripRow(uuid(2), { title: 'Peru' }),
      tripRow(uuid(3), { title: 'Chile' }),
    ];
    const candidates = [
      candidate(1, uuid(1), '2026-10-01T08:00:00.000Z'),
      candidate(2, uuid(1), '2026-10-02T08:00:00.000Z'),
      candidate(3, uuid(2), '2026-10-03T08:00:00.000Z'),
      candidate(4, uuid(2), '2026-10-04T08:00:00.000Z'),
    ];

    const [designated, earliest, none] = buildTripCards(trips, [], candidates, TODAY);

    expect(designated!.cover).toEqual({
      kind: 'photo',
      photoId: uuid(202),
      thumbnailUri: thumbnail(uuid(1), uuid(202)),
    });
    expect(earliest!.cover).toEqual({
      kind: 'photo',
      photoId: uuid(203),
      thumbnailUri: thumbnail(uuid(2), uuid(203)),
    });
    expect(none!.cover.kind).toBe('typographic');
    expect(none!.generated).toEqual({
      palette: coverPalette(uuid(3)),
      iso2: null,
      initial: 'Chile',
    });
  });

  test('is pending when the trip or any of its stops has changes the server has not seen', () => {
    const dirtyStop = [stops[0]!, { ...stops[1]!, is_dirty: true }, stops[2]!];
    const [viaStop] = buildTripCards([tripRow(uuid(1))], dirtyStop, [], TODAY);
    const [viaTrip] = buildTripCards(
      [tripRow(uuid(1), { is_dirty: true })],
      stops,
      [],
      TODAY,
    );
    const [clean] = buildTripCards([tripRow(uuid(1))], stops, [], TODAY);

    expect([viaStop!.pending, viaTrip!.pending, clean!.pending]).toEqual([
      true,
      true,
      false,
    ]);
  });

  test('keeps the order it is given', () => {
    const cards = buildTripCards(
      [tripRow(uuid(3)), tripRow(uuid(1)), tripRow(uuid(2))],
      [],
      [],
      TODAY,
    );
    expect(cards.map((c) => c.id)).toEqual([uuid(3), uuid(1), uuid(2)]);
  });
});
