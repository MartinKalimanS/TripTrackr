/**
 * The assertions `formatDateRange` must satisfy in ANY time zone, run by one test file per
 * zone (`trip-date-range.auckland.test.ts`, `trip-date-range.los-angeles.test.ts`), each
 * of which puts the process in its zone through `test/env/zone-environment.js` before a
 * single `Date` exists.
 *
 * A range is two calendar days with no zone: the day a traveller picked is the day shown,
 * wherever the phone is. A zone EAST of Greenwich breaks an implementation that formats a
 * local-midnight `Date` as UTC (it shows the day before); a zone WEST breaks one that
 * parses `'2026-01-01'` as an instant (`new Date('2026-01-01')` is UTC midnight, which is
 * the evening before). The suite proves it could catch either: the controls build exactly
 * those wrong answers in this zone and assert that they ARE wrong here, so a pass cannot
 * be a zone in which the mistake happens to be invisible (UTC, or the right side of it).
 */
import { formatDateRange } from '@/features/trips/trip-date-range';

/** Which of the two mistakes this zone exposes. */
export type Exposes = 'utc-parse' | 'utc-format';

const DAY = { day: 'numeric', month: 'short', year: 'numeric' } as const;

/** What a UTC-parsing implementation says for `2026-01-01`: the instant, in this zone. */
function naiveUtcParse(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', DAY).format(new Date(iso));
}

/** What a UTC-formatting implementation says: this zone's midnight, read in UTC. */
function naiveUtcFormat(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat('en-GB', { ...DAY, timeZone: 'UTC' }).format(
    new Date(year, month - 1, day),
  );
}

/** Days that sit on a boundary: new year, leap day, a DST change in either zone. */
const DAYS: [string, string | RegExp][] = [
  ['2026-01-01', '1 Jan 2026'],
  ['2026-03-08', '8 Mar 2026'], // Los Angeles springs forward
  ['2026-03-29', '29 Mar 2026'],
  ['2026-04-05', '5 Apr 2026'], // Auckland's summer time ends
  ['2026-09-27', /^27 Sep/], // Auckland's summer time starts (en-GB spells it Sep or Sept)
  ['2026-11-01', '1 Nov 2026'], // Los Angeles falls back
  ['2026-12-31', '31 Dec 2026'],
  ['2028-02-29', '29 Feb 2028'],
];

export function defineZoneSuite(zone: string, exposes: Exposes): void {
  describe(`formatDateRange with the process in ${zone}`, () => {
    test('the process really is in that zone', () => {
      expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
      expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(0);
    });

    test.each(DAYS)('a one-day trip on %s reads as that day', (iso, expected) => {
      const text = formatDateRange({ start: iso, end: iso });
      if (typeof expected === 'string') expect(text).toBe(expected);
      else expect(text).toMatch(expected);
    });

    test.each([
      [{ start: '2025-12-28', end: '2026-01-03' }, '28 Dec 2025 – 3 Jan 2026'],
      [{ start: '2026-01-01', end: '2026-12-31' }, '1 Jan – 31 Dec 2026'],
      [{ start: '2026-03-07', end: '2026-03-09' }, '7 Mar – 9 Mar 2026'],
      [{ start: '2026-04-04', end: '2026-04-06' }, '4 Apr – 6 Apr 2026'],
    ])('the range %j reads as %s', (range, expected) => {
      expect(formatDateRange(range)).toBe(expected);
    });

    const day = { start: '2026-01-01', end: '2026-01-01' };

    if (exposes === 'utc-parse') {
      test('control: a UTC-parsing implementation is wrong in this zone, so a regression to one fails', () => {
        // `new Date('2026-01-01')` is 2026-01-01T00:00Z: the evening of the 31st here.
        expect(naiveUtcParse('2026-01-01')).toBe('31 Dec 2025');
        expect(naiveUtcParse('2026-01-01')).not.toBe(formatDateRange(day));
      });
    } else {
      test('control: a UTC-formatting implementation is wrong in this zone, so a regression to one fails', () => {
        // Midnight on the 1st here is the 31st in UTC.
        expect(naiveUtcFormat('2026-01-01')).toBe('31 Dec 2025');
        expect(naiveUtcFormat('2026-01-01')).not.toBe(formatDateRange(day));
      });
    }

    test('control: the zone exposes exactly the mistake this file says it does', () => {
      const parse = naiveUtcParse('2026-01-01') !== '1 Jan 2026';
      const format = naiveUtcFormat('2026-01-01') !== '1 Jan 2026';
      expect({ parse, format }).toEqual({
        parse: exposes === 'utc-parse',
        format: exposes === 'utc-format',
      });
    });
  });
}
