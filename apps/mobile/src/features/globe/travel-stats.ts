/**
 * The statistics overlay's figures (FR-050) — research D-30.
 *
 * The server's semantics (`TravelStatsService`, pinned by T090), computed from
 * the device's own store: every live trip counts, planned ones included; each
 * country counts once; distance is each trip's legs in stop order, summed on
 * the mean-radius sphere. A stop in a city this device has not cached counts
 * for nothing, and neither do the legs that touch it.
 */
import { isPlaced, placedLegs, type GlobeTrip } from './globe-data';
import { haversineKm } from './great-circle';

export interface TravelSummary {
  countriesVisited: number;
  distanceKm: number;
}

export function travelSummary(trips: readonly GlobeTrip[]): TravelSummary {
  const countries = new Set<number>();
  let distanceKm = 0;
  for (const trip of trips) {
    for (const stop of trip.stops) {
      if (isPlaced(stop) && stop.countryId !== null) countries.add(stop.countryId);
    }
    for (const { from, to } of placedLegs(trip)) {
      distanceKm += haversineKm(from.coordinate, to.coordinate);
    }
  }
  return { countriesVisited: countries.size, distanceKm };
}
