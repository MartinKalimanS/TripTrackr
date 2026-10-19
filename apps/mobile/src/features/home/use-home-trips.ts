/**
 * The Home sheet's trips as live local queries (feature 005, T535; FR-014, FR-015; research
 * D5-17, D-30): the trips with their covers and date ranges (`useTrips`) and every live stop
 * with its cached city and country names, joined in memory (`homeTrips`). Nothing here touches
 * the network, and nothing is stored: the visibility posture is private, local, never
 * transmitted.
 *
 * The stops query reads `trip_stops` live only, so a city or a country the cache learns later
 * (a trip that arrived from another device) re-reads it through the cache's own live counts, as
 * the globe does (`use-globe.ts`).
 */
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { useDatabase } from '@/db/client';
import { geographyRepository } from '@/db/repositories/geography';
import { stopsRepository } from '@/db/repositories/stops';
import { todayIso } from '@/features/trips/stop-dates';
import { useTrips, type LiveResult } from '@/features/trips/use-trips';

import { coversOf, homeTrips, type HomeTrips } from './home-trips';

/** The trips of the sheet, and the cover pictures of every trip for the globe's pins. */
export interface HomeTripsResult extends LiveResult<HomeTrips> {
  covers: Record<string, string>;
}

export function useHomeTrips(today?: string): HomeTripsResult {
  const db = useDatabase();
  const day = today ?? todayIso();
  const trips = useTrips(day);
  const cityCache = useLiveQuery(geographyRepository.cityCountQuery(db));
  const countryCache = useLiveQuery(geographyRepository.countriesQuery(db));
  const stops = useLiveQuery(stopsRepository.allWithNamesQuery(db), [
    cityCache.updatedAt?.getTime(),
    countryCache.updatedAt?.getTime(),
  ]);

  const data = useMemo(
    () => homeTrips(trips.data, stops.data, day),
    [trips.data, stops.data, day],
  );

  const covers = useMemo(() => coversOf(trips.data), [trips.data]);

  return {
    data,
    covers,
    loading:
      trips.loading || (stops.updatedAt === undefined && stops.error === undefined),
    error: trips.error ?? stops.error ?? null,
  };
}
