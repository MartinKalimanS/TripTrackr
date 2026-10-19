/**
 * The pins of the globe — feature 005, T533 (FR-011; research D5-04, contract C5-24).
 *
 * One pin per trip with a placed stop, at the stop the traveller is at today, else the first
 * (`restingCoordinate`, as the beacon's resting place). The features carry the status and its
 * RANK (past 0, planned 1, active 2) and come ordered by rank, so a layer that sorts by it
 * (`circleSortKey`, `symbolSortKey`) draws the live trip last and a trip is never hidden
 * under a calmer one.
 *
 * A photo roundel is for the trips that matter most, to about sixty (`ROUNDEL_LIMIT`): the
 * live trip first, then planned ones, then past ones, a trip needing a cover to be cropped.
 * Every other pin is a plain dot. `roundelRequests` says which pins want a bitmap and under
 * what name; `splitPins` says which of them have one by now, so a pin whose bitmap has not
 * been captured (or could not be) is simply a dot.
 *
 * Pure. The shapes are plain RFC 7946 objects, and nothing here touches the geometry, the
 * arcs or the tap handling (`use-arc-press.ts` reads `trip_id` and `status`, which every
 * pin carries).
 */
import { GlobeLayers, type GlobeScheme } from '@/constants/theme';
import { restingCoordinate, type GlobeTrip } from '@/features/globe/globe-data';
import type { TripStatus } from '@/features/trips/trip-status';
import { fnv1a32 } from '@/lib/fnv1a';

import type { Feature, FeatureCollection, PointGeometry } from './arc-features';

/** Higher is drawn later, and so on top: the live trip is last. */
export const PIN_RANK = { past: 0, planning: 1, active: 2 } as const satisfies Record<
  TripStatus,
  number
>;

/** Beyond about this many, the rest are dots. */
export const ROUNDEL_LIMIT = GlobeLayers.pins.roundelLimit;

export type PinProperties = { trip_id: string; status: TripStatus; rank: number };
export type RoundelProperties = PinProperties & { roundel: string };
export type PinCollection<P extends PinProperties = PinProperties> = FeatureCollection<
  PointGeometry,
  P
>;

/** One trip's picture, wanted as a bitmap named `key`. */
export interface RoundelRequest {
  key: string;
  tripId: string;
  status: TripStatus;
  cover: string;
}

/** One pin per trip with a placed stop, in rank order (a stable sort: the trips' own order within a rank). */
export function pinCollection(trips: readonly GlobeTrip[], today: string): PinCollection {
  const pins = trips.flatMap((trip): Feature<PointGeometry, PinProperties>[] => {
    const at = restingCoordinate(trip, today);
    if (!at) return [];
    return [
      {
        type: 'Feature',
        id: `pin:${trip.id}`,
        geometry: { type: 'Point', coordinates: at },
        properties: {
          trip_id: trip.id,
          status: trip.status,
          rank: PIN_RANK[trip.status],
        },
      },
    ];
  });
  return {
    type: 'FeatureCollection',
    features: [...pins].sort((a, b) => a.properties.rank - b.properties.rank),
  };
}

/**
 * The name of a trip's bitmap. It changes with the cover, the status and the scheme because
 * the rings are baked into the picture: a new cover, a trip that has become active, or the
 * night theme is a new bitmap, and the old one stops drawing.
 */
export function pinImageKey(
  tripId: string,
  status: TripStatus,
  cover: string,
  scheme: GlobeScheme = 'light',
): string {
  return `roundel:${tripId}:${status}:${scheme}:${fnv1a32(cover).toString(16)}`;
}

/** The pins that get a roundel, most important first, at most `limit`. */
export function roundelRequests(
  pins: PinCollection,
  covers: Readonly<Record<string, string>>,
  limit: number = ROUNDEL_LIMIT,
  scheme: GlobeScheme = 'light',
): RoundelRequest[] {
  return [...pins.features]
    .sort((a, b) => b.properties.rank - a.properties.rank)
    .flatMap(({ properties: { trip_id: tripId, status } }): RoundelRequest[] => {
      const cover = covers[tripId];
      return cover
        ? [{ key: pinImageKey(tripId, status, cover, scheme), tripId, status, cover }]
        : [];
    })
    .slice(0, limit);
}

export interface PinSplit {
  roundels: PinCollection<RoundelProperties>;
  dots: PinCollection;
}

/**
 * The pins whose bitmap exists are roundels (named for it), every other pin is a dot. Each
 * side keeps the rank order.
 */
export function splitPins(
  pins: PinCollection,
  requests: readonly RoundelRequest[],
  bitmaps: Readonly<Record<string, string>>,
): PinSplit {
  const keyOf = new Map(requests.map((request) => [request.tripId, request.key]));
  const roundels: Feature<PointGeometry, RoundelProperties>[] = [];
  const dots: Feature<PointGeometry, PinProperties>[] = [];
  for (const pin of pins.features) {
    const key = keyOf.get(pin.properties.trip_id);
    if (key && key in bitmaps) {
      roundels.push({ ...pin, properties: { ...pin.properties, roundel: key } });
    } else {
      dots.push(pin);
    }
  }
  return {
    roundels: { type: 'FeatureCollection', features: roundels },
    dots: { type: 'FeatureCollection', features: dots },
  };
}
