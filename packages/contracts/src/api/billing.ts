import { z } from 'zod';

import { IsoDateTime } from '../scalars';

/**
 * Trip allowance and entitlement (rest-api.md §3 and §10; FR-074 to FR-084; spec 013).
 *
 * The allowance travels in one place only: the `details` of the 409 a create meets at the limit, and
 * `GET /me/entitlement`. A traveller below the limit sees neither (FR-084).
 */
export const AllowanceRoute = z.enum(['subscribe', 'delete_trip']);
export type AllowanceRoute = z.infer<typeof AllowanceRoute>;

export const TRIP_ALLOWANCE_REACHED = 'TRIP_ALLOWANCE_REACHED';

/** `error.details` of a `TRIP_ALLOWANCE_REACHED` 409: the counts, both routes forward, the echoed submission. */
export const TripAllowanceDetails = z.strictObject({
  trips_held: z.number().int().nonnegative(),
  allowance: z.number().int().positive(),
  routes: z.tuple([z.literal('subscribe'), z.literal('delete_trip')]),
  submitted: z.strictObject({
    title: z.string(),
    home_currency: z.string(),
  }),
});
export type TripAllowanceDetails = z.infer<typeof TripAllowanceDetails>;

/** `GET /me/entitlement`. */
export const EntitlementResponse = z.strictObject({
  is_active: z.boolean(),
  current_period_end: IsoDateTime.nullable(),
  trips_held: z.number().int().nonnegative(),
  allowance: z.number().int().positive(),
});
export type EntitlementResponse = z.infer<typeof EntitlementResponse>;
