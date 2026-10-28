import { z } from 'zod';

import { CurrencyCode } from '../scalars';
import { UserProfile } from './auth';

/**
 * Profile (rest-api.md §2).
 */

/** Travel statistics for the globe overlay (FR-050). Distance is great-circle, in kilometres. */
export const TravelStats = z.strictObject({
  countries_visited: z.int().min(0),
  total_distance_km: z.number().min(0),
  trips_held: z.int().min(0),
});
export type TravelStats = z.infer<typeof TravelStats>;

export const MeResponse = z.strictObject({
  user: UserProfile,
  stats: TravelStats,
});
export type MeResponse = z.infer<typeof MeResponse>;

/**
 * Exactly what FR-008 lists. `email` is not here — changing it is a
 * verification flow, not a profile edit — and neither is anything a traveller
 * must not set about themselves.
 */
export const PatchMeRequest = z
  .strictObject({
    display_name: z.string().trim().min(1).max(60).optional(),
    bio: z.string().max(500).nullable().optional(),
    avatar_url: z.string().url().nullable().optional(),
    home_currency: CurrencyCode.optional(),
    is_profile_public: z.boolean().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'A patch must change at least one field',
  });
export type PatchMeRequest = z.infer<typeof PatchMeRequest>;

/**
 * `DELETE /me` (rest-api.md §2; FR-006). The account is deleted for good, so the caller proves
 * it is the traveller and not a stolen access token: an account with a password must send it.
 * An account that only ever signed in with Google or Apple has no password to send, and sends
 * none (the provider re-check is tracked with the authentication audit, S-09).
 */
export const DeleteMeRequest = z.strictObject({
  password: z.string().min(1).max(256).optional(),
});
export type DeleteMeRequest = z.infer<typeof DeleteMeRequest>;

/**
 * 202: the account is marked, every session has ended, and a sweep that removes the rows and
 * every stored file has been queued. Deletion is complete only when that sweep confirms.
 */
export const DeleteMeResponse = z.strictObject({
  status: z.literal('deletion_requested'),
});
export type DeleteMeResponse = z.infer<typeof DeleteMeResponse>;
