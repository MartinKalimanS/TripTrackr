/**
 * The filter of the country layers — feature 005, T532 (research D5-04).
 *
 * Mapbox's country tileset holds several versions of a disputed boundary, one per
 * `worldview`; "it is important to apply a worldview filter to all your style layers to
 * avoid showing conflicting and overlapping boundaries" (Mapbox Countries v1 reference). A
 * fill drawn twice stacks its alpha, so EVERY layer on the tileset carries the clause.
 */
import { GlobeLayers } from '@/constants/theme';

import { COUNTRY_WORLDVIEW_CLAUSE, countryFilter } from '../country-filter';

describe('countryFilter', () => {
  test('is the documented shape: not disputed, the worldview clause, and the codes', () => {
    expect(countryFilter(['PT', 'ES'])).toEqual([
      'all',
      ['==', ['get', 'disputed'], 'false'],
      ['any', ['==', 'all', ['get', 'worldview']], ['in', 'US', ['get', 'worldview']]],
      ['in', ['get', 'iso_3166_1'], ['literal', ['ES', 'PT']]],
    ]);
  });

  test('always carries the worldview clause: an `all` version or the chosen audience', () => {
    const filter = countryFilter(['PT']);
    expect(filter).toContainEqual(COUNTRY_WORLDVIEW_CLAUSE);
    expect(COUNTRY_WORLDVIEW_CLAUSE).toEqual([
      'any',
      ['==', 'all', ['get', 'worldview']],
      ['in', GlobeLayers.countries.worldview, ['get', 'worldview']],
    ]);
  });

  test('the worldview is one of the audiences Mapbox documents', () => {
    expect(['AR', 'CN', 'IN', 'JP', 'MA', 'RU', 'TR', 'US']).toContain(
      GlobeLayers.countries.worldview,
    );
  });

  test('another audience changes the clause and nothing else', () => {
    const filter = countryFilter(['PT'], 'JP');
    expect(filter).toContainEqual([
      'any',
      ['==', 'all', ['get', 'worldview']],
      ['in', 'JP', ['get', 'worldview']],
    ]);
  });

  test('upper-cases, de-duplicates and sorts the codes, so equal sets give one filter', () => {
    expect(countryFilter(['pt', 'ES', 'PT', 'es'])).toEqual(countryFilter(['ES', 'PT']));
  });

  test('drops what is not an ISO 3166-1 alpha-2 code, never passing it to the map', () => {
    const filter = countryFilter(['PT', '', 'P', 'PRT', 'x1', '  ', 'X K']);
    expect(filter).toContainEqual(['in', ['get', 'iso_3166_1'], ['literal', ['PT']]]);
  });

  test('keeps Kosovo’s unofficial XK, which the tileset uses', () => {
    expect(countryFilter(['xk'])).toContainEqual([
      'in',
      ['get', 'iso_3166_1'],
      ['literal', ['XK']],
    ]);
  });

  test('has no filter for no countries, so the caller draws no layer', () => {
    expect(countryFilter([])).toBeNull();
    expect(countryFilter(['', 'nope'])).toBeNull();
  });

  test('does not touch its input', () => {
    const input = Object.freeze(['pt', 'es']);
    expect(() => countryFilter(input)).not.toThrow();
    expect(input).toEqual(['pt', 'es']);
  });
});
