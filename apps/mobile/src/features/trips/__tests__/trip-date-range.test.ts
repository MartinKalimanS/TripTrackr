/**
 * T430 — a trip's date range in words (FR-011; data-model §5; research D-25).
 *
 * The range is two calendar days (`YYYY-MM-DD`), formatted in the device locale
 * (`jest.setup.ts` fixes it to en-GB): the year is said once when both ends share it, and
 * twice when they do not; one day is one date. It never throws: an unreadable or reversed
 * range is no text at all, so a card shows the rest of itself.
 *
 * What happens in other time zones is in `test/features/trip-date-range.*.test.ts`, which
 * run the same assertions with the process in Auckland and in Los Angeles.
 */
import { dayFormatter, formatDateRange } from '@/features/trips/trip-date-range';

describe('formatDateRange', () => {
  test('says the year once when both ends are in it', () => {
    expect(formatDateRange({ start: '2026-03-12', end: '2026-03-20' })).toBe(
      '12 Mar – 20 Mar 2026',
    );
  });

  test('spans months of the same year', () => {
    expect(formatDateRange({ start: '2026-02-26', end: '2026-04-02' })).toBe(
      '26 Feb – 2 Apr 2026',
    );
  });

  test('says both years when the trip crosses new year', () => {
    expect(formatDateRange({ start: '2025-12-28', end: '2026-01-03' })).toBe(
      '28 Dec 2025 – 3 Jan 2026',
    );
  });

  test('is one date for a one-day trip', () => {
    expect(formatDateRange({ start: '2026-05-12', end: '2026-05-12' })).toBe(
      '12 May 2026',
    );
  });

  test('formats in the language tag it is given', () => {
    expect(formatDateRange({ start: '2026-03-12', end: '2026-03-20' }, 'de-DE')).toBe(
      '12. März – 20. März 2026',
    );
  });

  test('keeps a leap day', () => {
    expect(formatDateRange({ start: '2028-02-28', end: '2028-02-29' })).toBe(
      '28 Feb – 29 Feb 2028',
    );
  });
});

describe('formatDateRange never throws: what it cannot read is no text', () => {
  test.each([
    ['garbage start', { start: 'garbage', end: '2026-03-20' }],
    ['garbage end', { start: '2026-03-12', end: 'tomorrow' }],
    ['empty strings', { start: '', end: '' }],
    ['an empty start', { start: '', end: '2026-03-20' }],
    ['a day that is not on the calendar', { start: '2026-02-30', end: '2026-03-20' }],
    ['a month that is not', { start: '2026-03-12', end: '2026-13-01' }],
    ['a time, not a day', { start: '2026-03-12T10:00:00Z', end: '2026-03-20' }],
    ['a short date', { start: '2026-3-2', end: '2026-3-9' }],
  ])('%s', (_name, range) => {
    expect(formatDateRange(range)).toBeNull();
  });

  test('a reversed range is not shown: the data cannot be trusted to say it', () => {
    expect(formatDateRange({ start: '2026-03-20', end: '2026-03-12' })).toBeNull();
    expect(formatDateRange({ start: '2026-01-01', end: '2025-12-31' })).toBeNull();
  });

  test('values a typed caller cannot pass still do not throw', () => {
    const values = [null, undefined, 20260312, {}, []] as unknown as string[];
    for (const value of values) {
      expect(formatDateRange({ start: value, end: '2026-03-20' })).toBeNull();
      expect(formatDateRange({ start: '2026-03-12', end: value })).toBeNull();
    }
    expect(formatDateRange(null as never)).toBeNull();
    expect(formatDateRange(undefined as never)).toBeNull();
  });

  test('a language tag the platform rejects falls back to its own locale', () => {
    for (const tag of ['not a locale', '', 'en_GB_garbage']) {
      const text = formatDateRange({ start: '2026-03-12', end: '2026-03-20' }, tag);
      expect(text).toEqual(expect.stringContaining('2026'));
    }
  });
});

describe('dayFormatter caches one formatter per language and per year', () => {
  test('returns the same instance for the same language and year', () => {
    expect(dayFormatter('en-GB', true)).toBe(dayFormatter('en-GB', true));
    expect(dayFormatter('en-GB', false)).toBe(dayFormatter('en-GB', false));
  });

  test('keeps the year and the no-year formats apart', () => {
    expect(dayFormatter('en-GB', true)).not.toBe(dayFormatter('en-GB', false));
    const day = new Date(Date.UTC(2026, 2, 12, 12));
    expect(dayFormatter('en-GB', true).format(day)).toBe('12 Mar 2026');
    expect(dayFormatter('en-GB', false).format(day)).toBe('12 Mar');
  });

  test('keeps languages apart', () => {
    const british = dayFormatter('en-GB', true);
    const german = dayFormatter('de-DE', true);
    expect(german).not.toBe(british);
    expect(british.resolvedOptions().locale).toBe('en-GB');
    expect(german.resolvedOptions().locale).toBe('de-DE');
  });

  test('is zone-free: it formats the calendar day it was given, in UTC', () => {
    expect(dayFormatter('en-GB', true).resolvedOptions().timeZone).toBe('UTC');
  });

  test('builds each formatter once, however often a range is formatted', () => {
    // A language no other test uses, so the first call really is the first.
    const tag = 'sv-SE';
    const construct = jest.spyOn(Intl, 'DateTimeFormat');
    try {
      formatDateRange({ start: '2026-03-12', end: '2026-03-20' }, tag);
      const afterFirst = construct.mock.calls.length;
      expect(afterFirst).toBeGreaterThan(0);
      expect(afterFirst).toBeLessThanOrEqual(2);

      for (let call = 0; call < 25; call += 1) {
        formatDateRange({ start: '2026-03-12', end: '2026-03-20' }, tag);
        formatDateRange({ start: '2025-12-28', end: '2026-01-03' }, tag);
      }
      expect(construct.mock.calls.length).toBe(afterFirst);
    } finally {
      construct.mockRestore();
    }
  });
});
