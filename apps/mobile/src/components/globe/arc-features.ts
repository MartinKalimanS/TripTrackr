/**
 * The GeoJSON the globe draws — FR-016, FR-045, FR-047; research D-30.
 *
 * Connections are derived from consecutive placed stops and nothing else, so
 * inserting, moving or removing a stop changes the next derivation with no
 * arc record to maintain (FR-016). Every feature carries the trip id the tap
 * handler opens (FR-047) and the derived status the per-status layers filter
 * on (FR-046). The shapes are plain RFC 7946 objects, typed locally so this
 * file needs nothing from Mapbox.
 */
import {
  isPlaced,
  placedLegs,
  restingCoordinate,
  type GlobeTrip,
} from '@/features/globe/globe-data';
import { greatCircle, type LngLat } from '@/features/globe/great-circle';
import { journeyLegs } from '@/features/globe/journey';
import type { TripStatus } from '@/features/trips/trip-status';

export type LineGeometry =
  | { type: 'LineString'; coordinates: LngLat[] }
  | { type: 'MultiLineString'; coordinates: LngLat[][] };

export type PointGeometry = { type: 'Point'; coordinates: LngLat };

/** Type aliases, not interfaces, so they satisfy GeoJSON's open property map. */
export type ArcProperties = {
  trip_id: string;
  status: TripStatus;
  from_city_id: number;
  to_city_id: number;
};

export type MarkerProperties = { trip_id: string; status: TripStatus; city_id: number };

/** No trip id and no status: a leg between trips belongs to neither (feature 003). */
export type JourneyProperties = { from_city_id: number; to_city_id: number };

export type Feature<G, P> = { type: 'Feature'; id: string; geometry: G; properties: P };

export type FeatureCollection<G, P> = {
  type: 'FeatureCollection';
  features: Feature<G, P>[];
};

export type ArcCollection = FeatureCollection<LineGeometry, ArcProperties>;
export type MarkerCollection = FeatureCollection<PointGeometry, MarkerProperties>;
export type JourneyCollection = FeatureCollection<LineGeometry, JourneyProperties>;

function lineGeometry(parts: LngLat[][]): LineGeometry {
  return parts.length === 1
    ? { type: 'LineString', coordinates: parts[0]! }
    : { type: 'MultiLineString', coordinates: parts };
}

/** One feature per drawn leg; a leg between two stops in one city draws nothing. */
export function arcCollection(trips: readonly GlobeTrip[]): ArcCollection {
  const features = trips.flatMap((trip) =>
    placedLegs(trip).flatMap(({ from, to }): Feature<LineGeometry, ArcProperties>[] => {
      const parts = greatCircle(from.coordinate, to.coordinate);
      if (parts.length === 0) return [];
      return [
        {
          type: 'Feature',
          id: `${trip.id}:${from.id}`,
          geometry: lineGeometry(parts),
          properties: {
            trip_id: trip.id,
            status: trip.status,
            from_city_id: from.cityId,
            to_city_id: to.cityId,
          },
        },
      ];
    }),
  );
  return { type: 'FeatureCollection', features };
}

/**
 * The legs that join one trip to the next (feature 003, FR-006 to FR-010):
 * together with each trip's own connections they make one line through every
 * place the traveller has been. A leg between two places at one position
 * draws nothing, as a trip's does.
 */
export function journeyCollection(
  trips: readonly GlobeTrip[],
  today: string,
): JourneyCollection {
  const features = journeyLegs(trips, today).flatMap(
    ({ from, to }): Feature<LineGeometry, JourneyProperties>[] => {
      const parts = greatCircle(from.coordinate, to.coordinate);
      if (parts.length === 0) return [];
      return [
        {
          type: 'Feature',
          id: `journey:${from.id}:${to.id}`,
          geometry: lineGeometry(parts),
          properties: { from_city_id: from.cityId, to_city_id: to.cityId },
        },
      ];
    },
  );
  return { type: 'FeatureCollection', features };
}

/** One point per placed stop, so a single-stop trip still shows (spec edge case). */
export function markerCollection(trips: readonly GlobeTrip[]): MarkerCollection {
  const features = trips.flatMap((trip) =>
    trip.stops.filter(isPlaced).map((stop): Feature<PointGeometry, MarkerProperties> => ({
      type: 'Feature',
      id: `${trip.id}:${stop.id}`,
      geometry: { type: 'Point', coordinates: stop.coordinate },
      properties: { trip_id: trip.id, status: trip.status, city_id: stop.cityId },
    })),
  );
  return { type: 'FeatureCollection', features };
}

/** The path the beacon travels: each drawn leg, as its parts. */
export function tripRoute(trip: GlobeTrip): LngLat[][][] {
  return placedLegs(trip)
    .map(({ from, to }) => greatCircle(from.coordinate, to.coordinate))
    .filter((parts) => parts.length > 0);
}

export interface BeaconRoute {
  tripId: string;
  status: TripStatus;
  /** The legs it travels, in order (`tripRoute`); empty for a single-stop trip. */
  legs: LngLat[][][];
  /** Where it rests when it is not moving: today's stop, else the first. */
  rest: LngLat;
}

/** One beacon per animated trip that has anything placed. */
export function beaconRoutes(
  trips: readonly GlobeTrip[],
  focus: readonly string[],
  today: string,
): BeaconRoute[] {
  return trips.flatMap((trip) => {
    const rest = focus.includes(trip.id) ? restingCoordinate(trip, today) : null;
    return rest
      ? [{ tripId: trip.id, status: trip.status, legs: tripRoute(trip), rest }]
      : [];
  });
}

/** A point ON the trip's route — its middle vertex — or its only placed stop. */
function centreOf(trip: GlobeTrip): LngLat | null {
  const points = tripRoute(trip).flat(2);
  if (points.length > 0) return points[Math.floor(points.length / 2)]!;
  return trip.stops.find(isPlaced)?.coordinate ?? null;
}

/**
 * Where the globe opens: on the first animated trip, so the eye lands on it;
 * otherwise on the first trip with anything placed. Being a vertex of the
 * route, the centre is also a point a tap in the middle of the map will hit.
 */
export function cameraCenter(
  trips: readonly GlobeTrip[],
  focus: readonly string[],
): LngLat | null {
  const focused = trips.find((trip) => focus.includes(trip.id));
  for (const trip of focused ? [focused, ...trips] : trips) {
    const centre = centreOf(trip);
    if (centre) return centre;
  }
  return null;
}
