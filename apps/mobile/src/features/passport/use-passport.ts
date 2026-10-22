/**
 * The You screen's data as live local queries (feature 005, F13; FR-058, FR-084; research
 * D5-17): the globe's own trips (`useGlobe`) and the countries overview over them
 * (`useCountryOverview`). It adds no query of its own, no table, no preference and no network
 * call; the period (All time or a year) and the totals and stamps for it are pure functions of
 * what these two return. Visibility: private, local, never transmitted.
 */
import { useMemo } from 'react';

import { useGlobe } from '@/features/globe/use-globe';
import type { LiveResult } from '@/features/trips/use-trips';

import type { CountrySummary } from './country-summary';
import type { GlobeTrip } from '@/features/globe/globe-data';
import { periodKeys } from './passport-totals';
import { useCountryOverview } from './use-country-overview';

export interface PassportData {
  trips: GlobeTrip[];
  summaries: CountrySummary[];
  /** `all` then each year with a trip, newest first. */
  periods: string[];
}

export function usePassport(today?: string): LiveResult<PassportData> {
  const globe = useGlobe(today);
  const overview = useCountryOverview(globe.data.trips, today);

  const data = useMemo(
    () => ({
      trips: globe.data.trips,
      summaries: overview.data.summaries,
      periods: periodKeys(globe.data.trips),
    }),
    [globe.data.trips, overview.data.summaries],
  );

  return {
    data,
    loading: globe.loading || overview.loading,
    error: globe.error ?? overview.error,
  };
}
