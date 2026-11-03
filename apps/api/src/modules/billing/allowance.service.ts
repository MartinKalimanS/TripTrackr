import { HttpStatus, Injectable } from '@nestjs/common';
import { TRIP_ALLOWANCE_REACHED, type CreateTripRequest } from '@triptrackr/contracts';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { loadEnv } from '@/common/config/env.schema';
import { rlsDb } from '@/common/db/rls-db';
import { apiError } from '@/common/errors/api-error';
import { requireCurrentUserId } from '@/common/rls/rls-context';
import { subscriptions, trips } from '@/db/schema';

export interface Entitlement {
  readonly isActive: boolean;
  readonly currentPeriodEnd: Date | null;
}

/**
 * The trip allowance (research D-07, D-08; FR-074 to FR-084; spec 013). This is the ONLY code that
 * reads `subscriptions`: no read, list or export path and no RLS policy of another table may join it,
 * which is what keeps a lapsed entitlement from touching anything a traveller recorded (Constitution V).
 *
 * The entitlement is the server's own row, a cache of the store's truth refreshed by webhook (S-11),
 * never a claim the client sends. The count is live, never a counter.
 *
 * Visibility posture: reads the caller's own row and trips only, under their RLS identity.
 */
@Injectable()
export class AllowanceService {
  allowance(): number {
    return loadEnv().FREE_TRIP_ALLOWANCE;
  }

  async entitlement(): Promise<Entitlement> {
    const [row] = await rlsDb()
      .select({
        isActive: subscriptions.isActive,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
      })
      .from(subscriptions)
      .where(eq(subscriptions.userId, requireCurrentUserId()));

    return row ?? { isActive: false, currentPeriodEnd: null };
  }

  async tripsHeld(): Promise<number> {
    const [row] = await rlsDb()
      .select({ held: sql<number>`count(*)::int` })
      .from(trips)
      .where(and(eq(trips.ownerId, requireCurrentUserId()), isNull(trips.deletedAt)));

    return row?.held ?? 0;
  }

  /**
   * Refuses a new trip at the allowance. Serialised per traveller with a transaction-scoped advisory
   * lock held until the request commits, so two creates cannot both take the last slot.
   */
  async assertCanCreate(submitted: CreateTripRequest): Promise<void> {
    const userId = requireCurrentUserId();
    await rlsDb().execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`,
    );

    if ((await this.entitlement()).isActive) return;

    const held = await this.tripsHeld();
    const allowance = this.allowance();
    if (held < allowance) return;

    throw apiError(
      HttpStatus.CONFLICT,
      TRIP_ALLOWANCE_REACHED,
      `You have ${held} of ${allowance} trips. Subscribe for unlimited trips, or delete a trip to make room.`,
      {
        trips_held: held,
        allowance,
        routes: ['subscribe', 'delete_trip'],
        submitted: { title: submitted.title, home_currency: submitted.home_currency },
      },
    );
  }
}
