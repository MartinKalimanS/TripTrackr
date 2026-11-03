import { z } from 'zod';

import { IsoDateTime } from '../scalars';

/**
 * Paid trip allowance and entitlement (spec 014; contracts/billing-api.md; supersedes spec 013).
 *
 * What a traveller holds is a count of ordinary trips against a free number, plus single-trip credits and
 * the uses left of a Tier 1 year. None of it travels except in the `details` of the 409 a create meets at
 * the limit, and `GET /me/entitlement`. A traveller below the limit sees neither (FR-003), and while
 * charging is off the entitlement answer carries nothing a screen could draw (FR-026).
 */
export const AllowanceRoute = z.enum(['buy_trip', 'subscribe', 'delete_trip']);
export type AllowanceRoute = z.infer<typeof AllowanceRoute>;

export const TRIP_ALLOWANCE_REACHED = 'TRIP_ALLOWANCE_REACHED';

/** What paid for a covered trip. `grandfathered` is a trip that existed when charging was switched on. */
export const CoverSource = z.enum(['credit', 'year', 'unlimited', 'grandfathered']);
export type CoverSource = z.infer<typeof CoverSource>;

/** The two yearly plans. */
export const SubscriptionTier = z.enum(['tier1', 'unlimited']);
export type SubscriptionTier = z.infer<typeof SubscriptionTier>;

/** `error.details` of a `TRIP_ALLOWANCE_REACHED` 409: the counts, every way forward, the echoed submission. */
export const TripAllowanceDetails = z.strictObject({
  /** Ordinary trips held: covered trips do not take a free slot. */
  trips_held: z.number().int().nonnegative(),
  allowance: z.number().int().positive(),
  year_uses_left: z.number().int().nonnegative(),
  credits: z.number().int().nonnegative(),
  routes: z.tuple([
    z.literal('buy_trip'),
    z.literal('subscribe'),
    z.literal('delete_trip'),
  ]),
  submitted: z.strictObject({
    title: z.string(),
    home_currency: z.string(),
  }),
});
export type TripAllowanceDetails = z.infer<typeof TripAllowanceDetails>;

/** `GET /me/entitlement`. */
export const EntitlementResponse = z
  .strictObject({
    charging_enabled: z.boolean(),
    tier: SubscriptionTier.nullable(),
    is_active: z.boolean(),
    current_period_end: IsoDateTime.nullable(),
    cancel_at_period_end: z.boolean(),
    year_uses_left: z.number().int().nonnegative(),
    credits: z.number().int().nonnegative(),
    trips_held: z.number().int().nonnegative(),
    allowance: z.number().int().nonnegative(),
    years_subscribed: z.number().int().nonnegative(),
    /** The store product the app offers for the next renewal of this tier (research D14-09). */
    next_product_id: z.string().min(1).nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.charging_enabled) return;
    const quiet =
      value.tier === null &&
      !value.is_active &&
      value.current_period_end === null &&
      !value.cancel_at_period_end &&
      value.year_uses_left === 0 &&
      value.credits === 0 &&
      value.trips_held === 0 &&
      value.allowance === 0 &&
      value.years_subscribed === 0 &&
      value.next_product_id === null;
    if (!quiet) {
      ctx.addIssue({
        code: 'custom',
        message:
          'while charging is off every other field must be null, false or 0 (FR-026)',
      });
    }
  });
export type EntitlementResponse = z.infer<typeof EntitlementResponse>;

/** `POST /trips/:id/cover`: what covered the trip. */
export const CoverResponse = z.strictObject({ source: CoverSource });
export type CoverResponse = z.infer<typeof CoverResponse>;
