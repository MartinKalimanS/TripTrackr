/**
 * The words of a trip card - feature 005, T540 (FR-030, FR-031, FR-032, FR-033, FR-035, FR-077).
 * Pure over a card model: what the hero, the ticket, the row and the year header SAY, and what a
 * screen reader says for the card. The device locale is en-GB (`jest.setup.ts`).
 *
 * The accessible name of a card is the 004 one, word for word (FR-075): "title, status, N stops".
 */
import type { TripCardModel } from '@/features/trips/trip-card-model';
import {
  countdownOf,
  describeStopCount,
  eyebrowOf,
  heroDates,
  rowMeta,
  tripCardLabel,
  tripsCountLine,
  ticketMeta,
  yearHeaderCopy,
} from '@/features/trips/trip-card-copy';

type Words = Pick<
  TripCardModel,
  'title' | 'status' | 'stopCount' | 'country' | 'dateRange' | 'lengthDays'
>;

const portugal = { iso2: 'PT', name: 'Portugal' };

function words(overrides: Partial<Words> = {}): Words {
  return {
    title: 'Portugal Road Trip',
    status: 'active',
    stopCount: 3,
    country: portugal,
    dateRange: { start: '2026-10-12', end: '2026-10-19' },
    lengthDays: 8,
    ...overrides,
  };
}

describe('describeStopCount and tripCardLabel: the 004 name, word for word', () => {
  test.each([
    [0, 'No stops yet'],
    [1, '1 stop'],
    [2, '2 stops'],
    [12, '12 stops'],
  ])('%i stops are "%s"', (count, text) => {
    expect(describeStopCount(count)).toBe(text);
  });

  test('the label is "title, status, stops"', () => {
    expect(
      tripCardLabel(words({ title: 'Italy, spring 2026', status: 'planning' })),
    ).toBe('Italy, spring 2026, planning, 3 stops');
    expect(tripCardLabel(words({ status: 'past', stopCount: 0 }))).toBe(
      'Portugal Road Trip, past, No stops yet',
    );
    expect(tripCardLabel(words({ status: 'active', stopCount: 1 }))).toBe(
      'Portugal Road Trip, active, 1 stop',
    );
  });
});

describe('eyebrowOf: the country over a hero title', () => {
  test('is the country and the stops', () => {
    expect(eyebrowOf(words())).toBe('Portugal · 3 stops');
  });

  test('is the stops alone while no stop is in a cached city', () => {
    expect(eyebrowOf(words({ country: null, stopCount: 1 }))).toBe('1 stop');
  });
});

describe('heroDates: the line under a hero title', () => {
  test('is the range and the nights', () => {
    expect(heroDates(words())).toBe('12 Oct – 19 Oct 2026 · 7 nights');
  });

  test('says "1 night" for a two-day trip and drops the nights for a one-day one', () => {
    expect(
      heroDates(
        words({ dateRange: { start: '2026-10-12', end: '2026-10-13' }, lengthDays: 2 }),
      ),
    ).toBe('12 Oct – 13 Oct 2026 · 1 night');
    expect(
      heroDates(
        words({ dateRange: { start: '2026-10-12', end: '2026-10-12' }, lengthDays: 1 }),
      ),
    ).toBe('12 Oct 2026');
  });

  test('is null with no range, and for a range that cannot be read', () => {
    expect(heroDates(words({ dateRange: null, lengthDays: null }))).toBeNull();
    expect(
      heroDates(
        words({ dateRange: { start: 'garbage', end: 'junk' }, lengthDays: null }),
      ),
    ).toBeNull();
  });
});

describe('rowMeta and ticketMeta', () => {
  test('a row says the country, the month and the length', () => {
    expect(
      rowMeta(
        words({
          status: 'past',
          country: { iso2: 'JP', name: 'Japan' },
          dateRange: { start: '2026-03-02', end: '2026-03-10' },
          lengthDays: 9,
        }),
      ),
    ).toBe('Japan · Mar 2026 · 9 days');
  });

  test('a one-day trip is "1 day"', () => {
    expect(
      rowMeta(
        words({ dateRange: { start: '2026-03-02', end: '2026-03-02' }, lengthDays: 1 }),
      ),
    ).toBe('Portugal · Mar 2026 · 1 day');
  });

  test('without a country the row says the month and the length', () => {
    expect(rowMeta(words({ country: null }))).toBe('Oct 2026 · 8 days');
  });

  test('a trip with no stops says so', () => {
    expect(
      rowMeta(words({ stopCount: 0, dateRange: null, lengthDays: null, country: null })),
    ).toBe('No stops yet');
  });

  test('a ticket says the country and the month', () => {
    expect(
      ticketMeta(
        words({
          status: 'planning',
          country: { iso2: 'IS', name: 'Iceland' },
          dateRange: { start: '2027-01-16', end: '2027-01-24' },
        }),
      ),
    ).toBe('Iceland · Jan 2027');
    expect(ticketMeta(words({ country: null }))).toBe('Oct 2026');
  });
});

describe('countdownOf: the stub of a ticket', () => {
  test('counts days, with the unit beside it and a sentence for a screen reader', () => {
    expect(countdownOf(94)).toEqual({
      value: '94',
      unit: 'days',
      spoken: 'Starts in 94 days',
    });
  });

  test('tomorrow is "1 day"', () => {
    expect(countdownOf(1)).toEqual({
      value: '1',
      unit: 'day',
      spoken: 'Starts tomorrow',
    });
  });

  test('groups a long count in the locale', () => {
    expect(countdownOf(1204).value).toBe('1,204');
  });
});

describe('yearHeaderCopy', () => {
  test('a year names its trips and its kilometres', () => {
    expect(yearHeaderCopy(2026, 1, 9380)).toEqual({
      title: '2026',
      count: '1 trip',
      distance: '9,380 km',
      label: '2026, 1 trip, 9,380 kilometres',
    });
  });

  test('says trips in the plural and drops a distance of nothing', () => {
    expect(yearHeaderCopy(2025, 2, 0)).toEqual({
      title: '2025',
      count: '2 trips',
      distance: null,
      label: '2025, 2 trips',
    });
  });

  test('trips with no stops are "No dates yet"', () => {
    expect(yearHeaderCopy('none', 3, 0)).toEqual({
      title: 'No dates yet',
      count: '3 trips',
      distance: null,
      label: 'No dates yet, 3 trips',
    });
  });
});

describe('tripsCountLine: under the title', () => {
  test('is the number of trips', () => {
    expect(tripsCountLine({ count: 22, sinceYear: 2019 })).toBe('22 trips');
    expect(tripsCountLine({ count: 1, sinceYear: 2026 })).toBe('1 trip');
  });

  test('from 200 trips it says since when', () => {
    expect(tripsCountLine({ count: 214, sinceYear: 2009 })).toBe(
      '214 trips · since 2009',
    );
    expect(tripsCountLine({ count: 199, sinceYear: 2009 })).toBe('199 trips');
  });

  test('has no "since" for trips that have no dates', () => {
    expect(tripsCountLine({ count: 300, sinceYear: null })).toBe('300 trips');
  });
});
