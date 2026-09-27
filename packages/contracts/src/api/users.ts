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
