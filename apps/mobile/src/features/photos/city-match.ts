/**
 * Filing a photo under one of its trip's cities — tasks.md T116 (User Story 5,
 * Acceptance Scenario 2; FR-028; research D-34; Constitution IV).
 *
 * Pure. A photo that carries a position is filed, at capture, under the
 * nearest of its trip's PLACED cities (a stop whose city this device has
 * cached, so it has a position) within `CITY_MATCH_RADIUS_KM` — the radius the
 * media worker uses for a photo registered without a city (D-34), so the two
 * sides agree. Farther than that, or no position at all, files it under none:
 * a guessed city is worse than none (Constitution IV).
 *
 * The EXIF position and the filing stay independent afterwards (data-model.md
 * §5): when the traveller files a photo somewhere its own position disagrees
 * with, `filingMismatchKm` says by how much, so the screen can surface the
 * contradiction instead of reconciling it silently (spec edge case).
 *
 * Distances are great-circle, on the mean sphere, through the globe's own
 * `haversineKm` (features/globe/great-circle.ts).
 */
import type { StopWithPlace } from '@/db/repositories/stops';
import { haversineKm } from '@/features/globe/great-circle';

/** The media worker's filing radius (research D-34). */
export const CITY_MATCH_RADIUS_KM = 50;

type PlacedStop = Pick<StopWithPlace, 'city_id' | 'lat' | 'lng'>;
type NamedStop = Pick<StopWithPlace, 'city_id' | 'city_name' | 'country_name'>;

export interface Position {
  lat: number | null;
  lng: number | null;
}

/** One way to file a photo: a city of the trip, or `cityId: null` for none. */
export interface FilingChoice {
  key: string;
  cityId: number | null;
  label: string;
}

function finite(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

/**
 * The trip city nearest to `position` within `radiusKm` (inclusive), or null.
 * Two cities at the same distance resolve to the one the trip visits first.
 */
export function nearestTripCity(
  position: Position,
  stops: readonly PlacedStop[],
  radiusKm: number = CITY_MATCH_RADIUS_KM,
): number | null {
  const { lat, lng } = position;
  if (!finite(lat) || !finite(lng)) return null;
  let best: { cityId: number; km: number } | null = null;
  for (const stop of stops) {
    if (!finite(stop.lat) || !finite(stop.lng)) continue;
    const km = haversineKm([lng, lat], [stop.lng, stop.lat]);
    if (km <= radiusKm && (best === null || km < best.km)) {
      best = { cityId: stop.city_id, km };
    }
  }
  return best?.cityId ?? null;
}

/**
 * How far the photo was taken from the city it is filed under, when that is
 * beyond the filing radius; null when they agree or there is nothing to compare.
 */
export function filingMismatchKm(
  photo: { exif_lat: number | null; exif_lng: number | null },
  city: Position | null,
  radiusKm: number = CITY_MATCH_RADIUS_KM,
): number | null {
  const { exif_lat: lat, exif_lng: lng } = photo;
  if (!city || !finite(lat) || !finite(lng) || !finite(city.lat) || !finite(city.lng)) {
    return null;
  }
  const km = haversineKm([lng, lat], [city.lng, city.lat]);
  return km > radiusKm ? km : null;
}

/** "Roma, Italy", or "City #777" for a city this device has not cached. */
export function placeLabel(stop: NamedStop): string {
  const city = stop.city_name ?? `City #${stop.city_id}`;
  return stop.country_name ? `${city}, ${stop.country_name}` : city;
}

/**
 * Where a photo may be filed: each of the trip's cities once, in the order the
 * trip first visits it, then "No city". A current filing whose stop has since
 * been removed is kept as a choice, so what is selected is always visible.
 */
export function filingChoices(
  stops: readonly NamedStop[],
  current: {
    city_id: number | null;
    city_name: string | null;
    country_name: string | null;
  },
): FilingChoice[] {
  const places: NamedStop[] =
    current.city_id === null
      ? [...stops]
      : [...stops, { ...current, city_id: current.city_id }];
  const seen = new Set<number>();
  const choices: FilingChoice[] = [];
  for (const place of places) {
    if (seen.has(place.city_id)) continue;
    seen.add(place.city_id);
    choices.push({
      key: `city:${place.city_id}`,
      cityId: place.city_id,
      label: placeLabel(place),
    });
  }
  return [...choices, { key: 'none', cityId: null, label: 'No city' }];
}
