/**
 * A traveller with many countries, for the suites that prove each one is reachable (feature 005,
 * T560; SC-015): thirty countries, five on each of six continents, each with two trips and a last
 * visit in October 2026. Not a test file.
 */
import {
  groupByContinent,
  type CountrySummary,
} from '@/features/passport/country-summary';
import type { CountryOverview } from '@/features/passport/use-country-overview';

export const CONTINENTS = [
  'Europe',
  'Asia',
  'Africa',
  'North America',
  'South America',
  'Oceania',
] as const;

/** `count` countries named "Land AA", "Land AB"..., spread over the six continents in turn. */
export function manyCountries(count = 30): CountrySummary[] {
  return Array.from({ length: count }, (_, index) => {
    const first = String.fromCharCode(65 + Math.floor(index / 6));
    const iso2 = `${first}${String.fromCharCode(65 + (index % 6))}`;
    return {
      countryId: 1000 + index,
      iso2,
      name: `Land ${iso2}`,
      continent: CONTINENTS[index % CONTINENTS.length]!,
      tripCount: 2,
      firstVisit: '2021-02-03',
      lastVisit: '2026-10-09',
      isNow: false,
      planned: false,
      focus: { center: [0, 0], bounds: null },
    };
  });
}

/** What the Countries list is given for `summaries`. */
export function overviewOf(summaries: CountrySummary[]): CountryOverview {
  return {
    summaries,
    groups: groupByContinent(summaries),
    totals: {
      countries: summaries.length,
      countriesOf: 195,
      trips: summaries.length * 2,
      distanceKm: 61480,
      continents: CONTINENTS.length,
      continentsOf: 7,
    },
  };
}

/** The label a country's row reads, for the fixture's dates. */
export const rowLabel = (country: CountrySummary) =>
  `${country.name}, ${country.tripCount} trips, last visited Oct 2026`;
