/**
 * The route preview of the stop editor (feature 005, UI-SPEC 9.1; owner answer Q-11).
 *
 * "Stop 3 - 322 km from Sintra" is computed here from what the device holds: the stops'
 * names and the cached cities' coordinates. The distance is the great-circle distance
 * (`haversineKm`, the globe's own), absent when the previous stop's position is not cached;
 * it is never estimated, never a drive time. The three-letter codes are the first letters of
 * the city's name, not an airport or station code the data does not carry.
 */
import { foldAccents } from '@/db/repositories/geography';
import { haversineKm } from '@/features/globe/great-circle';

export type RouteStop = {
  name: string;
  lat: number | null;
  lng: number | null;
};

export type RouteNode = {
  code: string;
  name: string;
  /** The stop being added, drawn as a ring. */
  isNew: boolean;
};

export type RoutePreview = {
  nodes: RouteNode[];
  /** The new stop's place in the trip: the stops already there, plus one. */
  position: number;
  /** The previous stop, which the distance is from. */
  fromName: string;
  /** Straight-line kilometres from the previous stop; null when its position is unknown. */
  km: number | null;
};

const CODE_LENGTH = 3;
const SHOWN_BEFORE = 2;

/** "Lisboa" gives "LIS": the first letters of the name with its accents folded. */
export function routeCode(name: string): string {
  const letters = foldAccents(name)
    .replace(/[^\p{L}]/gu, '')
    .slice(0, CODE_LENGTH)
    .toUpperCase();
  return letters === '' ? '?' : letters;
}

function distanceKm(from: RouteStop, to: RouteStop): number | null {
  if (from.lat === null || from.lng === null) return null;
  if (to.lat === null || to.lng === null) return null;
  return haversineKm([from.lng, from.lat], [to.lng, to.lat]);
}

const nodeOf = (stop: RouteStop, isNew: boolean): RouteNode => ({
  code: routeCode(stop.name),
  name: stop.name,
  isNew,
});

/** The line from the trip's last stops to the new one; null for the first stop of a trip. */
export function planRoute(
  previous: readonly RouteStop[],
  next: RouteStop,
): RoutePreview | null {
  const last = previous[previous.length - 1];
  if (!last) return null;
  const shown = previous.slice(-SHOWN_BEFORE);
  return {
    nodes: [...shown.map((stop) => nodeOf(stop, false)), nodeOf(next, true)],
    position: previous.length + 1,
    fromName: last.name,
    km: distanceKm(last, next),
  };
}
