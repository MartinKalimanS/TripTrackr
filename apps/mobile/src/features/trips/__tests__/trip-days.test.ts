/**
 * T544 - the day strip's model (spec FR-040; data-model section 9 `TripDay`; research D5-17):
 * the calendar days a trip spans, each with the stops that are somewhere on that day, and
 * which of them is today (the "Now" day). Pure, over local calendar days (`YYYY-MM-DD`):
 * no `Date` is read as an instant, so no time zone can move a day (the zone suites beside
 * this file run it east and west of Greenwich).
 */
import {
  MAX_TRIP_DAYS,
  currentDay,
  dayChipText,
  stopForDay,
  tripDays,
  type DayStop,
} from '@/features/trips/trip-days';

const lisbon: DayStop = {
  id: 'lisbon',
  arrive_date: '2026-10-12',
  depart_date: '2026-10-14',
};
const sintra: DayStop = {
  id: 'sintra',
  arrive_date: '2026-10-14',
  depart_date: '2026-10-15',
};
const porto: DayStop = {
  id: 'porto',
  arrive_date: '2026-10-15',
  depart_date: '2026-10-19',
};
const TODAY = '2026-10-14';

describe('tripDays: a trip as its calendar days', () => {
  test('is empty for a trip with no stops, so there is no strip (FR-040, FR-042)', () => {
    expect(tripDays([], TODAY)).toEqual([]);
  });

  test('one day per calendar day from the earliest arrival to the latest departure, numbered from 1', () => {
    const days = tripDays([lisbon, sintra, porto], TODAY);
    expect(days.map((day) => day.date)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
      '2026-10-19',
    ]);
    expect(days.map((day) => day.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test('lists on each day the stops that are somewhere that day, arrival and departure days included', () => {
    const days = tripDays([lisbon, sintra, porto], TODAY);
    const stopsOn = (date: string) => days.find((day) => day.date === date)?.stopIds;
    expect(stopsOn('2026-10-12')).toEqual(['lisbon']);
    expect(stopsOn('2026-10-13')).toEqual(['lisbon']);
    // The day Lisbon is left and Sintra reached is both.
    expect(stopsOn('2026-10-14')).toEqual(['lisbon', 'sintra']);
    expect(stopsOn('2026-10-15')).toEqual(['sintra', 'porto']);
    expect(stopsOn('2026-10-16')).toEqual(['porto']);
    expect(stopsOn('2026-10-19')).toEqual(['porto']);
  });

  test('keeps the order of the stops it was given within a day', () => {
    const days = tripDays([porto, sintra], TODAY);
    expect(days.find((day) => day.date === '2026-10-15')?.stopIds).toEqual([
      'porto',
      'sintra',
    ]);
  });

  test('marks exactly one day as today, and none when today is outside the trip', () => {
    const days = tripDays([lisbon, sintra, porto], TODAY);
    expect(days.filter((day) => day.isToday).map((day) => day.index)).toEqual([3]);
    expect(tripDays([lisbon], '2026-09-01').some((day) => day.isToday)).toBe(false);
    expect(tripDays([lisbon], '2027-01-01').some((day) => day.isToday)).toBe(false);
  });

  test('a day between two stops that has none is still a day, with an empty list', () => {
    const early: DayStop = {
      id: 'a',
      arrive_date: '2026-05-01',
      depart_date: '2026-05-02',
    };
    const late: DayStop = {
      id: 'b',
      arrive_date: '2026-05-05',
      depart_date: '2026-05-06',
    };
    const days = tripDays([early, late], '2026-05-03');
    expect(days).toHaveLength(6);
    expect(days.find((day) => day.date === '2026-05-03')).toMatchObject({
      stopIds: [],
      isToday: true,
    });
  });

  test('stops given out of date order still span from the earliest to the latest', () => {
    const days = tripDays([porto, lisbon], TODAY);
    expect(days[0]?.date).toBe('2026-10-12');
    expect(days[days.length - 1]?.date).toBe('2026-10-19');
  });

  test('a one-night stop is two days and a same-day stop is one', () => {
    expect(
      tripDays(
        [{ id: 'x', arrive_date: '2026-06-01', depart_date: '2026-06-02' }],
        TODAY,
      ),
    ).toHaveLength(2);
    expect(
      tripDays(
        [{ id: 'x', arrive_date: '2026-06-01', depart_date: '2026-06-01' }],
        TODAY,
      ),
    ).toHaveLength(1);
  });

  test('walks over month, year and leap-day ends', () => {
    const days = tripDays(
      [{ id: 'x', arrive_date: '2027-12-30', depart_date: '2028-01-02' }],
      TODAY,
    );
    expect(days.map((day) => day.date)).toEqual([
      '2027-12-30',
      '2027-12-31',
      '2028-01-01',
      '2028-01-02',
    ]);
    const leap = tripDays(
      [{ id: 'x', arrive_date: '2028-02-28', depart_date: '2028-03-01' }],
      TODAY,
    );
    expect(leap.map((day) => day.date)).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
  });

  test('is capped at MAX_TRIP_DAYS so damaged dates cannot build an endless strip', () => {
    const days = tripDays(
      [{ id: 'x', arrive_date: '2026-01-01', depart_date: '2126-01-01' }],
      TODAY,
    );
    expect(days).toHaveLength(MAX_TRIP_DAYS);
    expect(days[0]?.date).toBe('2026-01-01');
  });

  test('ignores a stop whose dates are not dates instead of throwing', () => {
    const broken: DayStop = { id: 'bad', arrive_date: 'soon', depart_date: 'later' };
    expect(tripDays([broken], TODAY)).toEqual([]);
    expect(tripDays([broken, lisbon], TODAY).map((day) => day.date)[0]).toBe(
      '2026-10-12',
    );
    expect(
      tripDays([broken, lisbon], TODAY).every((day) => !day.stopIds.includes('bad')),
    ).toBe(true);
  });
});

describe('currentDay: the "Now" day', () => {
  test('is the day that is today', () => {
    const days = tripDays([lisbon, sintra, porto], TODAY);
    expect(currentDay(days)).toMatchObject({ index: 3, date: '2026-10-14' });
  });

  test('is null when today is not a day of the trip', () => {
    expect(currentDay(tripDays([lisbon], '2026-12-25'))).toBeNull();
    expect(currentDay([])).toBeNull();
  });
});

describe('dayChipText: what a chip says, in the device language', () => {
  test('"D3", "14 Oct" and, for a screen reader, "Day 3, 14 October"', () => {
    expect(dayChipText({ index: 3, date: '2026-10-14' }, 'en-GB')).toEqual({
      code: 'D3',
      date: '14 Oct',
      name: 'Day 3, 14 October',
    });
  });

  test("follows the language: the order of day and month and the spelling are the locale's", () => {
    const us = dayChipText({ index: 1, date: '2026-10-12' }, 'en-US');
    expect(us.date).toBe('Oct 12');
    expect(us.name).toBe('Day 1, October 12');
    expect(dayChipText({ index: 1, date: '2026-10-12' }, 'de-DE').date).toMatch(
      /12\.? ?Okt/,
    );
  });

  test('says a day on a month end as that day, whatever the zone', () => {
    expect(dayChipText({ index: 9, date: '2026-12-31' }, 'en-GB').date).toBe('31 Dec');
    expect(dayChipText({ index: 10, date: '2027-01-01' }, 'en-GB').date).toBe('1 Jan');
  });

  test("an unknown language falls back to the platform's instead of throwing", () => {
    expect(() =>
      dayChipText({ index: 1, date: '2026-10-12' }, 'not a tag'),
    ).not.toThrow();
  });
});

describe('stopForDay: where the strip scrolls to when a day is chosen', () => {
  const days = tripDays([lisbon, sintra, porto], TODAY);

  test('is the first stop of the day', () => {
    expect(stopForDay(days, 1)).toBe('lisbon');
    expect(stopForDay(days, 3)).toBe('lisbon');
    expect(stopForDay(days, 4)).toBe('sintra');
    expect(stopForDay(days, 8)).toBe('porto');
  });

  test('for a day with no stop is the first stop that follows it', () => {
    const early: DayStop = {
      id: 'a',
      arrive_date: '2026-05-01',
      depart_date: '2026-05-02',
    };
    const late: DayStop = {
      id: 'b',
      arrive_date: '2026-05-05',
      depart_date: '2026-05-06',
    };
    const gap = tripDays([early, late], '2026-05-03');
    expect(stopForDay(gap, 3)).toBe('b');
    expect(stopForDay(gap, 4)).toBe('b');
  });

  test('falls back to the last stop before it when nothing follows', () => {
    const only = tripDays([lisbon], TODAY);
    const trailing = [
      ...only,
      { index: 4, date: '2026-10-15', isToday: false, stopIds: [] },
    ];
    expect(stopForDay(trailing, 4)).toBe('lisbon');
  });

  test('is null for a day that is not on the strip and for an empty strip', () => {
    expect(stopForDay(days, 99)).toBeNull();
    expect(stopForDay(days, 0)).toBeNull();
    expect(stopForDay([], 1)).toBeNull();
  });
});
