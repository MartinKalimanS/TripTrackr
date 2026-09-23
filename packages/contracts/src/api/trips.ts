import { z } from 'zod';

import { CityId, CurrencyCode, IsoDate, Uuid } from '../scalars';
import {
  TripPullRecord,
  TripStatus,
  TripStopPullShape,
  tripStopDatesInOrder,
} from '../sync/records';
import { City } from './lookups';

/**
 * Trips and stops (rest-api.md §3).
 *
 * The REST representations are the sync pull records **minus the tombstone**:
 * a REST read never returns a deleted row — that is the sync feed's job
 * (sync-protocol.md §1) — so `deleted_at` is not merely null here, it is absent
 * and refused.
 */

const nonEmptyPatch = (patch: object) => Object.keys(patch).length > 0;

// ---------------------------------------------------------------------------
// Trips
// ---------------------------------------------------------------------------

/**
 * `id` is optional and client-chosen (research D-15): a trip created through
 * REST while online and the same trip in the device's mirror share one
 * identity from the start, and a retried create is the same create.
 * `status` is absent on purpose — it is derived from the stops (FR-013) and a
 * strict object refuses it.
 */
export const CreateTripRequest = z.strictObject({
  id: Uuid.optional(),
  title: z.string().trim().min(1).max(200),
  home_currency: CurrencyCode,
});
export type CreateTripRequest = z.infer<typeof CreateTripRequest>;

export const PatchTripRequest = z
  .strictObject({
    title: z.string().trim().min(1).max(200).optional(),
    is_public: z.boolean().optional(),
    cover_photo_id: Uuid.nullable().optional(),
  })
  .refine(nonEmptyPatch, { message: 'A patch must change at least one field' });
export type PatchTripRequest = z.infer<typeof PatchTripRequest>;

export const ListTripsQuery = z.strictObject({
  status: TripStatus.optional(),
});
export type ListTripsQuery = z.infer<typeof ListTripsQuery>;

// ---------------------------------------------------------------------------
// Stops
// ---------------------------------------------------------------------------

/** FR-011: departure may equal but never precede arrival (shared with the sync records). */
export const CreateStopRequest = z
  .strictObject({
    id: Uuid.optional(),
    city_id: CityId,
    arrive_date: IsoDate,
    depart_date: IsoDate,
    /** Omitted means "append after the current last stop". */
    sort_order: z.int().min(0).max(32767).optional(),
  })
  .refine(tripStopDatesInOrder.check, tripStopDatesInOrder.params);
export type CreateStopRequest = z.infer<typeof CreateStopRequest>;

/**
 * Either date may change alone; the server validates the pair the row ends up
 * with, because a client patching one side cannot see the other in the same
 * request.
 */
export const PatchStopRequest = z
  .strictObject({
    arrive_date: IsoDate.optional(),
    depart_date: IsoDate.optional(),
    sort_order: z.int().min(0).max(32767).optional(),
  })
  .refine(nonEmptyPatch, { message: 'A patch must change at least one field' });
export type PatchStopRequest = z.infer<typeof PatchStopRequest>;

/** A stop with its city embedded, so a list of stops renders without a second request. */
export const TripStop = TripStopPullShape.omit({ deleted_at: true })
  .extend({ city: City })
  .refine(tripStopDatesInOrder.check, tripStopDatesInOrder.params);
export type TripStop = z.infer<typeof TripStop>;

export const Trip = TripPullRecord.omit({ deleted_at: true }).extend({
  /** Ordered by `sort_order`. Empty for a trip with no stops yet. */
  stops: z.array(TripStop),
});
export type Trip = z.infer<typeof Trip>;

export const TripResponse = z.strictObject({ trip: Trip });
export type TripResponse = z.infer<typeof TripResponse>;

export const TripsResponse = z.strictObject({ trips: z.array(Trip) });
export type TripsResponse = z.infer<typeof TripsResponse>;

// ---------------------------------------------------------------------------
// Arcs — derived, never stored (FR-016)
// ---------------------------------------------------------------------------

/** `[lng, lat]`, GeoJSON order. */
const Position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

export const ArcFeature = z.strictObject({
  type: z.literal('Feature'),
  geometry: z.strictObject({
    type: z.literal('LineString'),
    /** Densified along the great circle (research D-06); at least the two endpoints. */
    coordinates: z.array(Position).min(2),
  }),
  properties: z.strictObject({
    trip_id: Uuid,
    from_city_id: CityId,
    to_city_id: CityId,
    status: TripStatus,
  }),
});
export type ArcFeature = z.infer<typeof ArcFeature>;

/** A single-stop trip yields an empty collection, not an error (spec edge case). */
export const ArcsResponse = z.strictObject({
  type: z.literal('FeatureCollection'),
  features: z.array(ArcFeature),
});
export type ArcsResponse = z.infer<typeof ArcsResponse>;
