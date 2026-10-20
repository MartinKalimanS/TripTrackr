/**
 * The words of the Countries list (feature 005, F2; FR-016; the reference pictures
 * `home-full.png` and `countries.png`): the heading's second line, a continent's sticky label,
 * a row's second line and the name a screen reader hears for a row.
 *
 * Pure. Dates come from `Intl.DateTimeFormat` (`monthYear`) and plurals from `countParts`,
 * which does not need `Intl.PluralRules` (Hermes has none). 195 is the fixed reference of Q-2;
 * the numerator is `travelSummary`'s statistic, passed in untouched.
 */
import { countParts, monthYear } from '@/features/home/home-format';

import type { ContinentName, CountrySummary, WorldTotals } from './country-summary';

const SEPARATOR = ' \u00b7 ';

/** The header text of a group of countries that is not on a continent. */
export const OTHER_CONTINENT = 'Other';

/** "14 of 195 · 4 continents". */
export function countriesSubtitle(totals: WorldTotals, languageTag: string): string {
  const countries = countParts(totals.countries, 'country', 'countries', languageTag);
  const continents = countParts(
    totals.continents,
    'continent',
    'continents',
    languageTag,
  );
  return `${countries.figure} of ${totals.countriesOf}${SEPARATOR}${continents.figure} ${continents.noun}`;
}

/** The name of a continent group as it is shown. */
export const continentName = (continent: ContinentName): string =>
  continent === 'Unknown' ? OTHER_CONTINENT : continent;

/** "Europe · 9" (the eyebrow role draws it in capitals). */
export function continentLabel(
  continent: ContinentName,
  count: number,
  languageTag: string,
): string {
  const { figure } = countParts(count, 'country', 'countries', languageTag);
  return `${continentName(continent)}${SEPARATOR}${figure}`;
}

export interface CountryMeta {
  /** "2 trips". */
  trips: string;
  /** "last Oct 2026", or "planned Mar 2027" where nothing has happened yet. */
  when: string;
  /** "2 trips · last Oct 2026". */
  line: string;
}

/** A row's second line: nothing is claimed for a visit that has not happened. */
export function countryMeta(country: CountrySummary, languageTag: string): CountryMeta {
  const { figure, noun } = countParts(country.tripCount, 'trip', 'trips', languageTag);
  const trips = `${figure} ${noun}`;
  const when = country.planned
    ? `planned ${monthYear(country.firstVisit, languageTag)}`
    : `last ${monthYear(country.lastVisit, languageTag)}`;
  return { trips, when, line: `${trips}${SEPARATOR}${when}` };
}

/** "Portugal, 2 trips, last visited Oct 2026" (", now" for the live trip). */
export function countryLabel(country: CountrySummary, languageTag: string): string {
  const { trips, when } = countryMeta(country, languageTag);
  const spoken = country.planned ? when : when.replace(/^last /, 'last visited ');
  const parts = [country.name, trips, spoken];
  if (country.isNow) parts.push('now');
  return parts.join(', ');
}
