/**
 * T556 - the passport's stamps (feature 005; FR-058, FR-059, FR-084; data-model section 4;
 * research D5-08, D5-17; SC-016): the same country and first-arrival day always give the same
 * stamp, with its shape, ink, tilt, wear and perforation fixed by the hash rules, and the
 * stamps of a period are the countries first arrived in it, newest first, from the local
 * store only.
 */
import { fnv1a32 } from '@/lib/fnv1a';

import type { CountrySummary } from '../country-summary';
import {
  RECENT_DAYS,
  STAMP_INKS,
  STAMP_SHAPES,
  deriveStamp,
  earnedRecently,
  passportStamps,
} from '../stamp-spec';

const ISO = [
  'PT',
  'JP',
  'MX',
  'ES',
  'IT',
  'FR',
  'CH',
  'US',
  'AU',
  'FJ',
  'ZA',
  'NZ',
  'IS',
];

function pairs(): [string, string][] {
  const out: [string, string][] = [];
  for (const iso of ISO) {
    for (let day = 0; day < 17; day += 1) {
      const month = String((day % 12) + 1).padStart(2, '0');
      const date = String((day % 27) + 1).padStart(2, '0');
      out.push([iso, `${2010 + day}-${month}-${date}`]);
    }
  }
  return out;
}

describe('deriveStamp - the hash rules (SC-016)', () => {
  const all = pairs();

  test('covers 200 or more distinct country and date pairs', () => {
    expect(
      new Set(all.map(([iso, date]) => `${iso}|${date}`)).size,
    ).toBeGreaterThanOrEqual(200);
  });

  test('the same pair gives the same stamp twice', () => {
    for (const [iso, date] of all) {
      expect(deriveStamp(iso, date, 'Somewhere')).toEqual(
        deriveStamp(iso, date, 'Somewhere'),
      );
    }
  });

  test('shape, ink, tilt, wear and perforation follow h = fnv1a32(ISO2|day)', () => {
    for (const [iso, date] of all) {
      const h = fnv1a32(`${iso}|${date}`);
      const spec = deriveStamp(iso, date, 'x');
      expect(spec.shape).toBe(STAMP_SHAPES[h % 6]);
      expect(spec.ink).toBe(STAMP_INKS[(h >>> 3) % 4]);
      expect(spec.rotationDeg).toBe(((h >>> 7) % 17) - 8);
      expect(spec.wear).toBe((h >>> 12) % 4);
      expect(spec.perforated).toBe(((h >>> 15) & 1) === 1);
    }
  });

  test('the tilt is a whole number between -8 and 8, the ink one of the four', () => {
    for (const [iso, date] of all) {
      const spec = deriveStamp(iso, date, 'x');
      expect(Number.isInteger(spec.rotationDeg)).toBe(true);
      expect(spec.rotationDeg).toBeGreaterThanOrEqual(-8);
      expect(spec.rotationDeg).toBeLessThanOrEqual(8);
      expect(['coral', 'navy', 'teal', 'green']).toContain(spec.ink);
      expect([0, 1, 2, 3]).toContain(spec.wear);
    }
  });

  test('the text round the top is display only: it never repaints the stamp', () => {
    const a = deriveStamp('PT', '2026-10-12', 'Lisboa');
    const b = deriveStamp('PT', '2026-10-12', 'Sintra');
    expect({ ...a, top: '' }).toEqual({ ...b, top: '' });
  });
});

function summary(
  iso2: string,
  name: string,
  firstVisit: string,
  planned = false,
): CountrySummary {
  return {
    countryId: iso2.charCodeAt(0) * 100 + iso2.charCodeAt(1),
    iso2,
    name,
    continent: 'Europe',
    tripCount: 1,
    firstVisit,
    lastVisit: firstVisit,
    isNow: false,
    planned,
    focus: { center: [0, 0], bounds: null },
  };
}

const TODAY = '2026-10-14';
const SUMMARIES = [
  summary('JP', 'Japan', '2026-03-03'),
  summary('PT', 'Portugal', '2026-10-12'),
  summary('MX', 'Mexico', '2025-11-05'),
  summary('ES', 'Spain', '2025-11-05'),
  summary('IS', 'Iceland', '2027-05-01', true),
];

describe('passportStamps', () => {
  test('is one stamp per country that has been reached, newest first, ties by name', () => {
    const stamps = passportStamps(SUMMARIES, 'all', TODAY);
    expect(stamps.map((s) => s.iso2)).toEqual(['PT', 'JP', 'MX', 'ES']);
  });

  test('a country that is only planned has no stamp yet', () => {
    expect(passportStamps(SUMMARIES, 'all', TODAY).map((s) => s.iso2)).not.toContain(
      'IS',
    );
  });

  test('a year keeps the countries FIRST arrived in that year', () => {
    expect(passportStamps(SUMMARIES, '2025', TODAY).map((s) => s.iso2)).toEqual([
      'MX',
      'ES',
    ]);
    expect(passportStamps(SUMMARIES, '2026', TODAY).map((s) => s.iso2)).toEqual([
      'PT',
      'JP',
    ]);
    expect(passportStamps(SUMMARIES, '2024', TODAY)).toEqual([]);
  });

  test('carries the stamp of the first arrival, the country as its top text and its spoken name', () => {
    const [pt] = passportStamps(SUMMARIES, 'all', TODAY);
    expect(pt!.spec).toEqual(deriveStamp('PT', '2026-10-12', 'Portugal'));
    expect(pt!.spec.top).toBe('PORTUGAL');
    expect(pt!.name).toBe('Portugal');
    expect(pt!.label).toBe('Stamp: Portugal, 12 October 2026');
    expect(pt!.key).toBe('PT');
  });

  test('a long country name is cut to the stamp text limit', () => {
    const [long] = passportStamps(
      [summary('GB', 'United Kingdom of Great Britain', '2026-01-02')],
      'all',
      TODAY,
    );
    expect(Array.from(long!.spec.top).length).toBeLessThanOrEqual(16);
    expect(long!.name).toBe('United Kingdom of Great Britain');
  });

  test('marks the stamps earned in the last seven days, and no others', () => {
    const stamps = passportStamps(SUMMARIES, 'all', TODAY);
    expect(stamps.map((s) => s.recent)).toEqual([true, false, false, false]);
  });
});

describe('earnedRecently', () => {
  test('is the last seven days, today included, and never the future', () => {
    expect(RECENT_DAYS).toBe(7);
    expect(earnedRecently('2026-10-14', TODAY)).toBe(true);
    expect(earnedRecently('2026-10-08', TODAY)).toBe(true);
    expect(earnedRecently('2026-10-07', TODAY)).toBe(false);
    expect(earnedRecently('2026-10-15', TODAY)).toBe(false);
  });
});
