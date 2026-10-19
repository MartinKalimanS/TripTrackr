/**
 * What a screen reader hears for the globe, which it cannot enter (research D-30; feature 003
 * FR-001, FR-045): one summary in words, honest about an empty globe, and always pointing at the
 * Trips tab, which lists every trip the map shows. Unchanged in wording by feature 005 (FR-081);
 * the actions of the map (next trip, previous trip, recentre, open countries) are announced
 * separately by the platform.
 */
import type { GlobeData } from '@/features/globe/use-globe';

/** `drawn`: at least one trip has a placed stop. */
export function describeGlobe({ trips, summary }: GlobeData, drawn: boolean): string {
  if (!drawn) {
    return 'Globe with nothing drawn yet. Your trips are listed in the Trips tab.';
  }
  const tripCount = trips.length === 1 ? '1 trip' : `${trips.length} trips`;
  const places =
    summary.countriesVisited === 1
      ? '1 country'
      : `${summary.countriesVisited} countries`;
  return `Globe showing ${tripCount} across ${places}. Every trip is also listed in the Trips tab.`;
}
