/**
 * F2 (feature 005; FR-016) - the words of the Countries list as the pictures say them: the
 * heading's "14 of 195 · 4 continents", the sticky label "Europe · 9", a row's "2 trips · last
 * Oct 2026" and the name a screen reader hears. Dates come from `Intl.DateTimeFormat` and
 * plurals do not use `Intl.PluralRules` (Hermes has none).
 */
import {
  continentLabel,
  countriesSubtitle,
  countryLabel,
  countryMeta,
} from '../country-copy';
import type { CountrySummary, WorldTotals } from '../country-summary';

const PORTUGAL: CountrySummary = {
  countryId: 351,
  iso2: 'PT',
  name: 'Portugal',
  continent: 'Europe',
  tripCount: 2,
  firstVisit: '2021-02-03',
  lastVisit: '2026-10-19',
  isNow: false,
  planned: false,
  focus: { center: [-9.1393, 38.7223], bounds: null },
};

const TOTALS: WorldTotals = {
  countries: 14,
  countriesOf: 195,
  trips: 19,
  distanceKm: 61480,
  continents: 4,
  continentsOf: 7,
};

describe('countriesSubtitle', () => {
  test('is "14 of 195 · 4 continents", the fixed 195 over the existing statistic', () => {
    expect(countriesSubtitle(TOTALS, 'en')).toBe('14 of 195 \u00b7 4 continents');
  });

  test('one continent is singular, none is "0 continents"', () => {
    expect(countriesSubtitle({ ...TOTALS, continents: 1 }, 'en')).toBe(
      '14 of 195 \u00b7 1 continent',
    );
    expect(countriesSubtitle({ ...TOTALS, countries: 0, continents: 0 }, 'en')).toBe(
      '0 of 195 \u00b7 0 continents',
    );
  });
});

describe('continentLabel', () => {
  test("is the continent and its count, the case being the eyebrow role's", () => {
    expect(continentLabel('Europe', 9, 'en')).toBe('Europe \u00b7 9');
  });

  test('a country with no continent is "Other"', () => {
    expect(continentLabel('Unknown', 2, 'en')).toBe('Other \u00b7 2');
  });
});

describe('countryMeta', () => {
  test('is "2 trips · last Oct 2026": the trips and the month of the last visit', () => {
    expect(countryMeta(PORTUGAL, 'en')).toEqual({
      trips: '2 trips',
      when: 'last Oct 2026',
      line: '2 trips \u00b7 last Oct 2026',
    });
  });

  test('one trip is singular', () => {
    expect(countryMeta({ ...PORTUGAL, tripCount: 1 }, 'en').line).toBe(
      '1 trip \u00b7 last Oct 2026',
    );
  });

  test('a country with only trips to come says planned, with the month it starts', () => {
    const planned = {
      ...PORTUGAL,
      tripCount: 1,
      firstVisit: '2027-03-01',
      planned: true,
    };
    expect(countryMeta(planned, 'en').line).toBe('1 trip \u00b7 planned Mar 2027');
  });

  test('follows the device language for the month', () => {
    expect(countryMeta(PORTUGAL, 'es').when).toMatch(/oct/i);
  });
});

describe('countryLabel', () => {
  test('names the country, the trips and the last visit', () => {
    expect(countryLabel(PORTUGAL, 'en')).toBe('Portugal, 2 trips, last visited Oct 2026');
  });

  test('says now at the end for the live trip', () => {
    expect(countryLabel({ ...PORTUGAL, isNow: true }, 'en')).toBe(
      'Portugal, 2 trips, last visited Oct 2026, now',
    );
  });

  test('a planned country claims no visit', () => {
    const planned = {
      ...PORTUGAL,
      tripCount: 1,
      firstVisit: '2027-03-01',
      planned: true,
    };
    expect(countryLabel(planned, 'en')).toBe('Portugal, 1 trip, planned Mar 2027');
  });
});
