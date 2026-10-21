/**
 * T069 — next-stop arrival suggestion and client-side date validation
 * (FR-015, FR-011). Pure functions; every branch is a spec scenario.
 */
import {
  addDays,
  departureAfterNights,
  formatIsoDate,
  formatStopDay,
  formatStopMonthDay,
  fromIsoDate,
  nightsBetween,
  suggestArrival,
  suggestDeparture,
  toIsoDate,
  validateStopDates,
} from '@/features/trips/stop-dates';

describe('suggestArrival (FR-015)', () => {
  test('Acceptance Scenario 1.5: Rome ends 12 May, so Florence is pre-suggested to arrive 12 May', () => {
    expect(suggestArrival({ depart_date: '2026-05-12' }, '2026-04-01')).toBe(
      '2026-05-12',
    );
  });

  test('with no previous stop the suggestion is today', () => {
    expect(suggestArrival(undefined, '2026-04-01')).toBe('2026-04-01');
    expect(suggestArrival(null, '2026-04-01')).toBe('2026-04-01');
  });
});

describe('suggestDeparture', () => {
  test('defaults to the night after arrival — a stop is somewhere you stay', () => {
    expect(suggestDeparture('2026-05-12')).toBe('2026-05-13');
  });

  test('rolls over month and year ends correctly', () => {
    expect(suggestDeparture('2026-12-31')).toBe('2027-01-01');
    expect(suggestDeparture('2028-02-28')).toBe('2028-02-29');
  });
});

describe('validateStopDates (FR-011)', () => {
  test('Acceptance Scenario 1.8: a departure before the arrival is refused with a clear message', () => {
    expect(validateStopDates('2026-05-12', '2026-05-10')).toBe(
      'Departure can’t be before arrival.',
    );
  });

  test('same-day arrival and departure is allowed', () => {
    expect(validateStopDates('2026-05-12', '2026-05-12')).toBeNull();
  });

  test('a later departure is allowed', () => {
    expect(validateStopDates('2026-05-10', '2026-05-12')).toBeNull();
  });

  test('a malformed date is refused before it can reach the database', () => {
    expect(validateStopDates('12/05/2026', '2026-05-12')).toBe('Choose an arrival date.');
    expect(validateStopDates('2026-05-12', '')).toBe('Choose a departure date.');
  });
});

describe('ISO date helpers', () => {
  test('toIsoDate uses the local calendar day, not UTC, so a picker at 23:30 does not lose a day', () => {
    const local = new Date(2026, 4, 12, 23, 30);
    expect(toIsoDate(local)).toBe('2026-05-12');
  });

  test('fromIsoDate produces local midnight of that day', () => {
    const date = fromIsoDate('2026-05-12');
    expect([
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
    ]).toEqual([2026, 4, 12, 0]);
  });

  test('addDays round-trips through the calendar', () => {
    expect(addDays('2026-05-12', 0)).toBe('2026-05-12');
    expect(addDays('2026-05-12', -12)).toBe('2026-04-30');
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  test('formatIsoDate renders a readable day for the stops list, in the device locale', () => {
    const rendered = formatIsoDate('2026-05-12');
    expect(rendered).toMatch(/12/);
    expect(rendered).toMatch(/2026/);
    // Month is spelled, not numbered — locale decides case and order.
    expect(rendered).toMatch(/may|mai|mayo|maggio|maj/i);
  });
});

describe('nights, derived from the two dates (the Nights stepper stores nothing)', () => {
  test('nightsBetween counts local calendar days, across month ends and a leap day', () => {
    expect(nightsBetween('2026-10-15', '2026-10-19')).toBe(4);
    expect(nightsBetween('2026-05-12', '2026-05-12')).toBe(0);
    expect(nightsBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(nightsBetween('2026-12-31', '2027-01-01')).toBe(1);
  });

  test('nightsBetween is not thrown off by a daylight saving change inside the stay', () => {
    expect(nightsBetween('2026-03-27', '2026-03-30')).toBe(3);
    expect(nightsBetween('2026-10-24', '2026-10-27')).toBe(3);
  });

  test('a departure before the arrival is a negative count, which the validator already refuses', () => {
    expect(nightsBetween('2026-05-12', '2026-05-10')).toBe(-2);
  });

  test('departureAfterNights is the arrival plus the nights, as a wire date', () => {
    expect(departureAfterNights('2026-10-15', 4)).toBe('2026-10-19');
    expect(departureAfterNights('2026-10-15', 0)).toBe('2026-10-15');
    expect(departureAfterNights('2026-12-30', 3)).toBe('2027-01-02');
  });

  test('departureAfterNights inverts nightsBetween', () => {
    for (const nights of [0, 1, 7, 31, 400]) {
      const depart = departureAfterNights('2026-01-31', nights);
      expect(nightsBetween('2026-01-31', depart)).toBe(nights);
    }
  });
});

describe('the short day of the stop editor', () => {
  test('formatStopDay is the weekday, day and month without a year: "Thu 15 Oct"', () => {
    const text = formatStopDay('2026-10-15');
    expect(text).toMatch(/15/);
    expect(text).toMatch(/oct|okt|oct\.|ott/i);
    expect(text).toMatch(/thu|jue|gio|do|jeu|donn/i);
    expect(text).not.toMatch(/2026/);
  });

  test('formatStopMonthDay is the day and month alone: "19 Oct"', () => {
    const text = formatStopMonthDay('2026-10-19');
    expect(text).toMatch(/19/);
    expect(text).toMatch(/oct|okt|ott/i);
    expect(text).not.toMatch(/2026|mon/i);
  });
});
