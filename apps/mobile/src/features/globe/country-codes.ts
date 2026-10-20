/**
 * Which countries the globe tints — feature 005, T532 (FR-010; research D5-04).
 *
 * Derived on the device from the same local store as the statistics, and never from the
 * network. A stop is VISITED once its arrival day has come (`arriveDate <= today`) and
 * PLANNED before; on an active trip the stops already reached are visited and the rest are
 * planned, and a country that is both is visited. The result is what `VisitedCountriesLayer`
 * filters the country tileset by.
 *
 * It does not change the statistics (`travel-stats.ts`), which count a planned trip's
 * countries too, as the server does (FR-082): the tint says "been" and "going", the figure
 * says "how many".
 *
 * Pure.
 */
import type { GlobeTrip } from './globe-data';

export interface CountryCodes {
  /** ISO 3166-1 alpha-2, upper case, sorted, unique. */
  visited: string[];
  planned: string[];
}

function isoOf(code: string | null | undefined): string | null {
  const iso = code?.trim().toUpperCase();
  return iso && iso.length === 2 ? iso : null;
}

export function countryCodes(trips: readonly GlobeTrip[], today: string): CountryCodes {
  const visited = new Set<string>();
  const planned = new Set<string>();
  for (const trip of trips) {
    for (const stop of trip.stops) {
      const iso = isoOf(stop.countryIso);
      if (iso) (stop.arriveDate <= today ? visited : planned).add(iso);
    }
  }
  return {
    visited: [...visited].sort(),
    planned: [...planned].filter((iso) => !visited.has(iso)).sort(),
  };
}
