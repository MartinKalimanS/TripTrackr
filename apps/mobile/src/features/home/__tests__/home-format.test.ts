/**
 * T535 - the words and figures of the Home sheet (feature 005; FR-014, FR-060, FR-077): the
 * date line over the globe, plurals, "in N days", the month of a trip and the notation of a
 * big figure. Everything follows the device's language (`languageTag`), never a hard-coded
 * format, and works on calendar days, never on instants.
 */
import {
  countOf,
  countParts,
  daysUntil,
  eyebrowDate,
  figureFormat,
  inDays,
  monthYear,
  plannedLine,
  yearOf,
} from '../home-format';

describe('eyebrowDate: the day over the globe', () => {
  test('is the weekday, the day and the month, in the device language', () => {
    const text = eyebrowDate('2026-10-14', 'en-GB');
    expect(text).toMatch(/Wed/);
    expect(text).toMatch(/14/);
    expect(text).toMatch(/Oct/);
    expect(text).not.toMatch(/2026/);
  });

  test('follows another language', () => {
    const text = eyebrowDate('2026-10-14', 'de-DE');
    expect(text).toMatch(/Mi/);
    expect(text).toMatch(/14/);
    expect(text).toMatch(/Okt/);
  });

  test('is the calendar day it was given, whatever the clock says', () => {
    expect(eyebrowDate('2026-01-01', 'en-GB')).toMatch(/Thu.*1.*Jan|Thu.*Jan.*1/);
    expect(eyebrowDate('2026-12-31', 'en-GB')).toMatch(/Thu.*31.*Dec|Thu.*Dec.*31/);
  });

  test('a language the platform rejects costs the wording, not the screen', () => {
    expect(() => eyebrowDate('2026-10-14', 'not a tag')).not.toThrow();
    expect(eyebrowDate('2026-10-14', 'not a tag')).toMatch(/14/);
  });
});

describe('countOf: a number and its noun', () => {
  test('is singular for one and plural otherwise', () => {
    expect(countOf(1, 'trip', 'trips', 'en-GB')).toBe('1 trip');
    expect(countOf(0, 'trip', 'trips', 'en-GB')).toBe('0 trips');
    expect(countOf(2, 'trip', 'trips', 'en-GB')).toBe('2 trips');
  });

  test('groups the number the way the language does', () => {
    expect(countOf(1234, 'trip', 'trips', 'en-GB')).toBe('1,234 trips');
    expect(countOf(1234, 'trip', 'trips', 'de-DE')).toBe('1.234 trips');
  });
});

describe('inDays and daysUntil', () => {
  test('say how many calendar days to go', () => {
    expect(daysUntil('2026-10-14', '2027-01-16')).toBe(94);
    expect(daysUntil('2026-10-14', '2026-10-15')).toBe(1);
  });

  test('count calendar days across a clock change', () => {
    expect(daysUntil('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysUntil('2026-10-24', '2026-10-26')).toBe(2);
  });

  test('read "in 94 days" and "in 1 day"', () => {
    expect(inDays(94, 'en-GB')).toBe('in 94 days');
    expect(inDays(1, 'en-GB')).toBe('in 1 day');
    expect(inDays(1200, 'en-GB')).toBe('in 1,200 days');
  });
});

describe('monthYear: when a trip starts', () => {
  test('is the short month and the year', () => {
    expect(monthYear('2027-01-16', 'en-GB')).toBe('Jan 2027');
    expect(monthYear('2026-12-31', 'en-GB')).toBe('Dec 2026');
  });

  test('follows the language', () => {
    expect(monthYear('2027-03-02', 'de-DE')).toMatch(/2027/);
    expect(monthYear('2027-03-02', 'de-DE')).toMatch(/Mär/);
  });
});

describe('figureFormat: big figures shrink instead of overflowing', () => {
  test('is a whole number up to six digits', () => {
    expect(figureFormat(0)).toEqual({ maximumFractionDigits: 0 });
    expect(figureFormat(999_999)).toEqual({ maximumFractionDigits: 0 });
  });

  test('is compact from seven digits: 1.26M', () => {
    expect(figureFormat(1_000_000)).toEqual({
      notation: 'compact',
      maximumFractionDigits: 2,
    });
    expect(
      new Intl.NumberFormat('en-US', figureFormat(1_260_000)).format(1_260_000),
    ).toBe('1.26M');
  });
});

describe('plannedLine: a planned trip in one line', () => {
  test('is the month, a dot and the countdown', () => {
    expect(plannedLine('2027-01-16', 94, 'en-GB')).toBe('Jan 2027 · in 94 days');
    expect(plannedLine('2026-10-15', 1, 'en-GB')).toBe('Oct 2026 · in 1 day');
  });

  test('is only the month when there is no countdown', () => {
    expect(plannedLine('2027-01-16', null, 'en-GB')).toBe('Jan 2027');
  });

  test('is empty for a trip with no date', () => {
    expect(plannedLine(null, null, 'en-GB')).toBe('');
  });
});

describe('yearOf: the year of a calendar day', () => {
  test('is the year, in the device language', () => {
    expect(yearOf('2021-02-03', 'en-GB')).toBe('2021');
    expect(yearOf('2026-12-31', 'en-GB')).toBe('2026');
  });
});

describe('countParts: the number and its noun, apart', () => {
  test('is the grouped figure and the singular or plural noun', () => {
    expect(countParts(3, 'trip', 'trips', 'en-GB')).toEqual({
      figure: '3',
      noun: 'trips',
    });
    expect(countParts(1, 'trip', 'trips', 'en-GB')).toEqual({
      figure: '1',
      noun: 'trip',
    });
    expect(countParts(1234, 'trip', 'trips', 'de-DE')).toEqual({
      figure: '1.234',
      noun: 'trips',
    });
  });

  test('agrees with countOf, which is built on it', () => {
    const { figure, noun } = countParts(7, 'country', 'countries', 'en-GB');
    expect(countOf(7, 'country', 'countries', 'en-GB')).toBe(`${figure} ${noun}`);
  });
});
