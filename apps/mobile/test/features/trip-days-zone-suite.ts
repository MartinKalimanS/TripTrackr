/**
 * The assertions `tripDays` and `dayChipText` must satisfy in ANY time zone, run by one test
 * file per zone (`trip-days.auckland.test.ts`, `trip-days.los-angeles.test.ts`), each of
 * which puts the process in its zone through `test/env/zone-environment.js` before a single
 * `Date` exists (T544; research D-25; spec FR-040).
 *
 * A trip's days are calendar days with no zone. The mistake to catch is building them by
 * adding 24 hours to a local midnight: on the day the clocks go back (25 hours long) that
 * lands at 23:00 the SAME day and the strip shows a day twice. The control builds exactly
 * that wrong answer in this zone and asserts it IS wrong here, so a pass cannot be a zone in
 * which the mistake happens to be invisible.
 */
import { dayChipText, tripDays } from '@/features/trips/trip-days';

const HOUR = 3_600_000;

/** The wrong way: local midnight plus whole 24-hour blocks, read back as local dates. */
function naiveDays(start: string, count: number): string[] {
  const [year, month, day] = start.split('-').map(Number) as [number, number, number];
  const first = new Date(year, month - 1, day).getTime();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(first + index * 24 * HOUR);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  });
}

const stop = (arrive: string, depart: string) => [
  { id: 's', arrive_date: arrive, depart_date: depart },
];

/** Where the clocks go back in the zone, and so a day is 25 hours long. */
export function defineZoneSuite(zone: string, fallBack: string, range: [string, string]) {
  describe(`trip days with the process in ${zone}`, () => {
    test('the process really is in that zone', () => {
      expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
      expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(0);
    });

    test('a range across the day the clocks go back has every day once', () => {
      const days = tripDays(stop(range[0], range[1]), range[0]).map((day) => day.date);
      expect(days).toEqual([...new Set(days)]);
      expect(days).toContain(fallBack);
      expect(days).toHaveLength(3);
    });

    test('the days are consecutive calendar days around a clock change and a year end', () => {
      expect(
        tripDays(stop('2026-03-07', '2026-03-09'), '2026-03-08').map((d) => d.date),
      ).toEqual(['2026-03-07', '2026-03-08', '2026-03-09']);
      expect(
        tripDays(stop('2026-12-31', '2027-01-02'), '2027-01-01').map((d) => d.date),
      ).toEqual(['2026-12-31', '2027-01-01', '2027-01-02']);
    });

    test('today is the day it is told it is, whatever the zone', () => {
      const days = tripDays(stop(range[0], range[1]), fallBack);
      expect(days.filter((day) => day.isToday).map((day) => day.date)).toEqual([
        fallBack,
      ]);
    });

    test('a chip says the day it was given, on a boundary', () => {
      expect(dayChipText({ index: 1, date: '2027-01-01' }, 'en-GB').date).toBe('1 Jan');
      expect(dayChipText({ index: 2, date: fallBack }, 'en-GB').name).toMatch(
        /^Day 2, \d+ \w+$/,
      );
      expect(dayChipText({ index: 1, date: '2026-12-31' }, 'en-GB').date).toBe('31 Dec');
    });

    test('control: adding 24-hour blocks to a local midnight shows a day twice in this zone', () => {
      const naive = naiveDays(range[0], 3);
      expect(naive).not.toEqual([...new Set(naive)]);
    });
  });
}
