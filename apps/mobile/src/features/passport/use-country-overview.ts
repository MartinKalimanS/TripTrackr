/**
 * The Countries list as live local queries (feature 005, T536; FR-016, FR-084; research D5-17).
 *
 * The trips are the globe's own (`useGlobe`: Home already holds them, so they are passed in and
 * no second pair of queries runs); the names, codes and continents come from the `countries`
 * cache through one live query, so a country the cache learns later (a trip that arrived from
 * another device) appears without a restart. Nothing here touches the network and nothing is
 * stored; the visibility posture is private, local, never transmitted.
 *
 * The overview is rebuilt only when the trips, the cache or the day change, so a list built on
 * it does not redraw for nothing.
 */
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { useDatabase } from '@/db/client';
import { geographyRepository } from '@/db/repositories/geography';
import type { GlobeTrip } from '@/features/globe/globe-data';
import type { LiveResult } from '@/features/trips/use-trips';

import {
  groupByContinent,
  summariseCountries,
  worldTotals,
  type ContinentGroup,
  type CountrySummary,
  type WorldTotals,
} from './country-summary';

export interface CountryOverview {
  /** Every listed country, by name. */
  summaries: CountrySummary[];
  /** The same countries under their continent, in list order. */
  groups: ContinentGroup[];
  /** The figures above the list. */
  totals: WorldTotals;
}

export function useCountryOverview(
  trips: readonly GlobeTrip[],
  today?: string,
): LiveResult<CountryOverview> {
  const db = useDatabase();
  const countries = useLiveQuery(geographyRepository.countriesQuery(db));

  const data = useMemo(() => {
    const summaries = summariseCountries(trips, countries.data, today);
    return {
      summaries,
      groups: groupByContinent(summaries),
      totals: worldTotals(trips, summaries),
    };
  }, [trips, countries.data, today]);

  return {
    data,
    loading: countries.updatedAt === undefined && countries.error === undefined,
    error: countries.error ?? null,
  };
}
