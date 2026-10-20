/**
 * T543 - "Day N of M" and its dots (spec FR-038; data-model section 6 `dayOf`; research D5-17).
 * Pure over two local calendar days and today: no clock, no time zone, no `Date` parsing of a
 * date-only string as an instant (research D-25).
 */
import {
  MAX_PROGRESS_DOTS,
  dayProgress,
  progressDots,
} from '@/features/trips/trip-progress';

describe('dayProgress: the day of the trip today is', () => {
  const range = { start: '2026-10-12', end: '2026-10-19' };

  test('"Day 3 of 8" on the third calendar day of an eight-day trip', () => {
    expect(dayProgress(range, '2026-10-14')).toEqual({ day: 3, of: 8 });
  });

  test('the first and the last day are both inside the trip', () => {
    expect(dayProgress(range, '2026-10-12')).toEqual({ day: 1, of: 8 });
    expect(dayProgress(range, '2026-10-19')).toEqual({ day: 8, of: 8 });
  });

  test('a single-day trip is "Day 1 of 1"', () => {
    expect(dayProgress({ start: '2026-10-12', end: '2026-10-12' }, '2026-10-12')).toEqual(
      {
        day: 1,
        of: 1,
      },
    );
  });

  test('is null before the trip starts, after it ends, and with no dates', () => {
    expect(dayProgress(range, '2026-10-11')).toBeNull();
    expect(dayProgress(range, '2026-10-20')).toBeNull();
    expect(dayProgress(null, '2026-10-14')).toBeNull();
  });

  test('counts calendar days across a clock change, never 24-hour blocks', () => {
    // 25 Oct 2026 is the end of summer time in most of Europe (a 25-hour day).
    const across = { start: '2026-10-24', end: '2026-10-27' };
    expect(dayProgress(across, '2026-10-26')).toEqual({ day: 3, of: 4 });
    expect(dayProgress(across, '2026-10-27')).toEqual({ day: 4, of: 4 });
  });

  test('counts across a month and a year end', () => {
    const across = { start: '2026-12-30', end: '2027-01-02' };
    expect(dayProgress(across, '2027-01-01')).toEqual({ day: 3, of: 4 });
  });

  test('reads damaged data as no progress instead of throwing', () => {
    expect(dayProgress({ start: 'nope', end: '2026-10-19' }, '2026-10-14')).toBeNull();
    expect(
      dayProgress({ start: '2026-10-19', end: '2026-10-12' }, '2026-10-14'),
    ).toBeNull();
  });
});

describe('progressDots: one dot per day, filled for the days done, a ring for today', () => {
  test('day 3 of 8 is two done, one now and five to come', () => {
    expect(progressDots({ day: 3, of: 8 })).toEqual([
      'done',
      'done',
      'now',
      'rest',
      'rest',
      'rest',
      'rest',
      'rest',
    ]);
  });

  test('the first day has nothing done and the last has everything done before it', () => {
    expect(progressDots({ day: 1, of: 3 })).toEqual(['now', 'rest', 'rest']);
    expect(progressDots({ day: 3, of: 3 })).toEqual(['done', 'done', 'now']);
  });

  test('a long trip is drawn with at most MAX_PROGRESS_DOTS dots that still end on "now"', () => {
    const dots = progressDots({ day: 30, of: 60 });
    expect(dots).toHaveLength(MAX_PROGRESS_DOTS);
    expect(dots.filter((dot) => dot === 'now')).toHaveLength(1);
    // Half way through: about half are done, none after "now".
    const now = dots.indexOf('now');
    expect(dots.slice(0, now).every((dot) => dot === 'done')).toBe(true);
    expect(dots.slice(now + 1).every((dot) => dot === 'rest')).toBe(true);
    expect(now).toBeGreaterThan(MAX_PROGRESS_DOTS / 4);
    expect(now).toBeLessThan((MAX_PROGRESS_DOTS * 3) / 4);
  });

  test('the first and the last day of a long trip are the first and the last dot', () => {
    expect(progressDots({ day: 1, of: 90 })[0]).toBe('now');
    const last = progressDots({ day: 90, of: 90 });
    expect(last[last.length - 1]).toBe('now');
  });

  test('is empty for a trip with no days and never throws on nonsense', () => {
    expect(progressDots({ day: 1, of: 0 })).toEqual([]);
    expect(progressDots({ day: Number.NaN, of: 5 })).toEqual([]);
  });
});
