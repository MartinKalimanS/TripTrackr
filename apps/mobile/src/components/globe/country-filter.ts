/**
 * The filter of the country layers — feature 005, T532 (research D5-04).
 *
 * Mapbox Countries v1 holds more than one version of a disputed boundary, one per
 * `worldview`, and "it is important to apply a worldview filter to all your style layers to
 * avoid showing conflicting and overlapping boundaries": a fill drawn twice stacks its
 * alpha. So every layer on the tileset is filtered by the same three clauses (the
 * documented shapes of https://docs.mapbox.com/data/tilesets/reference/mapbox-countries-v1/):
 * not a disputed overlay, an `all` version or the chosen audience's, and one of the codes.
 *
 * Pure.
 */
import { GlobeLayers } from '@/constants/theme';

import type { Expression } from './arc-styles';

const { isoField, worldview: defaultWorldview } = GlobeLayers.countries;

/** An ISO 3166-1 alpha-2 code, or Mapbox's unofficial `XK` (Kosovo): two letters. */
const ISO_ALPHA_2 = /^[A-Z]{2}$/;

/** "Either a version for everyone, or the one for this audience." */
function worldviewClause(worldview: string): Expression {
  return [
    'any',
    ['==', 'all', ['get', 'worldview']],
    ['in', worldview, ['get', 'worldview']],
  ];
}

/** The clause every country layer carries, for the default audience. */
export const COUNTRY_WORLDVIEW_CLAUSE: Expression = worldviewClause(defaultWorldview);

/** Upper case, two letters, unique, sorted: equal sets of countries make one filter. */
function normalised(codes: readonly string[]): string[] {
  const valid = codes
    .map((code) => code.trim().toUpperCase())
    .filter((code) => ISO_ALPHA_2.test(code));
  return [...new Set(valid)].sort();
}

/**
 * The filter for these countries, or `null` for none (the caller then draws no layer, and
 * loads no tiles for it). Anything that is not a two-letter code is dropped, never handed
 * to the map.
 */
export function countryFilter(
  codes: readonly string[],
  worldview: string = defaultWorldview,
): Expression | null {
  const iso = normalised(codes);
  if (iso.length === 0) return null;
  return [
    'all',
    ['==', ['get', 'disputed'], 'false'],
    worldview === defaultWorldview
      ? COUNTRY_WORLDVIEW_CLAUSE
      : worldviewClause(worldview),
    ['in', ['get', isoField], ['literal', iso]],
  ];
}
