import { Injectable } from '@nestjs/common';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';

import { loadEnv } from '@/common/config/env.schema';
import { rlsDb } from '@/common/db/rls-db';
import { requireCurrentUserId } from '@/common/rls/rls-context';
import { trips } from '@/db/schema';

/**
 * Whether a trip that arrived by push is one the free allowance does not cover
 * (research D-08, Constitution V; FR-074, FR-076).
 *
 * A trip created offline is accepted on the device whatever the cached
 * entitlement says, because the limit cannot be checked until connectivity
 * returns (spec edge case). When it arrives and the account is already at its
 * allowance, the push KEEPS it and flags the result `over_allowance`; the
 * commercial question is asked afterwards, in the entitlement flow. Rejecting
 * the trip would destroy something the traveller recorded to enforce a business
 * rule, which Constitution V forbids outright. Nothing in this class can reach
 * the trip: it answers a question and writes nothing.
 *
 * One small injectable class so that User Story 9 replaces exactly one thing —
 * subscription-aware logic in place of a bare count — and the push does not
 * change. `POST /trips` (REST) does not consult it: its allowance branch is User
 * Story 9's and arrives in that one method (trips.service.ts).
 *
 * The question is ranked, not counted at this instant, so that it has the same
 * answer every time it is asked about the same trip. A trip is over the allowance
 * when at least `FREE_TRIP_ALLOWANCE` OTHER live trips of the account were
 * created before it (by `created_at`, then `id`). At the moment of the first
 * push that is exactly "the account already holds its allowance"; on a retry of
 * that push — the response was lost, and the device never saw the warning — the
 * trip is still the one that sat past the line, and says so again. A plain
 * `count(*)` would, on the retry, count the trip itself.
 *
 * Visibility posture: reads the caller's own trips only.
 */
@Injectable()
export class TripAllowancePolicy {
  async isOverAllowance(tripId: string): Promise<boolean> {
    const allowance = loadEnv().FREE_TRIP_ALLOWANCE;
    const userId = requireCurrentUserId();

    // Live trips created before this one. If this trip is not live (or not the
    // caller's) the subselect is empty, the row-value comparison is NULL, and
    // nothing is counted: a deleted trip is never over anything.
    const [row] = await rlsDb()
      .select({ earlier: sql<number>`count(*)::int` })
      .from(trips)
      .where(
        and(
          eq(trips.ownerId, userId),
          isNull(trips.deletedAt),
          ne(trips.id, tripId),
          sql`(${trips.createdAt}, ${trips.id}) < (
            SELECT t.created_at, t.id FROM trips t
            WHERE t.id = ${tripId}::uuid
              AND t.owner_id = ${userId}::uuid
              AND t.deleted_at IS NULL
          )`,
        ),
      );

    return (row?.earlier ?? 0) >= allowance;
  }
}
