/**
 * T430 — a trip's date range in words (FR-011; data-model §5; research D-25).
 *
 * The range is two local calendar days (`YYYY-MM-DD`), formatted in the device locale
 * (`jest.setup.ts` fixes it to en-GB): the year is said once when both ends share it, and
 * twice when they do not; one day is one date. Nothing here may read a UTC day.
 */
import { formatDateRange } from '@/features/trips/trip-date-range';

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

  test('reads a calendar day, not an instant: the day never moves with the zone', () => {
    // 1 Jan at local midnight stays 1 Jan whatever the offset of the device (a UTC
    // conversion would turn it into 31 Dec east of Greenwich).
    expect(formatDateRange({ start: '2026-01-01', end: '2026-01-01' })).toBe(
      '1 Jan 2026',
    );
  });
});
