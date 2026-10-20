/**
 * The globe's data as live local queries — research D-30, Constitution II.
 *
 * Nothing here touches the network: the globe is derived from the encrypted
 * local store on every change, exactly as the trip list is (`use-trips.ts`).
 * `useLiveQuery` re-runs a query only when its FROM table changes, and the
 * stops query joins the `cities` cache — so a live count of cached cities
 * drives a re-read of the joined stops whenever the cache learns a city (a
 * trip that arrived from another device, for instance).
 */
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { useDatabase } from '@/db/client';
import { geographyRepository } from '@/db/repositories/geography';
import { stopsRepository } from '@/db/repositories/stops';
import { tripsRepository } from '@/db/repositories/trips';
import type { LiveResult } from '@/features/trips/use-trips';

import { focusTripIds, toGlobeTrips, type GlobeTrip } from './globe-data';
import { travelSummary, type TravelSummary } from './travel-stats';

export interface GlobeData {
  /** Every live trip, most recently changed first. */
  trips: GlobeTrip[];
  /** The trips that animate (FR-046). */
  focus: string[];
  /** The overlay's figures (FR-050). */
  summary: TravelSummary;
}

export function useGlobe(today?: string): LiveResult<GlobeData> {
  const db = useDatabase();
  const trips = useLiveQuery(tripsRepository.listQuery(db));
  const cityCache = useLiveQuery(geographyRepository.cityCountQuery(db));
  // Keyed on WHEN the cache last changed, not on its count: a refreshed city
  // whose coordinates were corrected in place leaves the count alone. The
  // price is one extra read of the stops when the cache first answers.
  const stops = useLiveQuery(stopsRepository.allWithPlaceQuery(db), [
    cityCache.updatedAt?.getTime(),
  ]);

  const data = useMemo(() => {
    const globeTrips = toGlobeTrips(trips.data, stops.data, today);
    return {
      trips: globeTrips,
      focus: focusTripIds(globeTrips),
      summary: travelSummary(globeTrips),
    };
  }, [trips.data, stops.data, today]);

  return {
    data,
    loading: trips.updatedAt === undefined || stops.updatedAt === undefined,
    error: trips.error ?? stops.error ?? cityCache.error ?? null,
  };
}
