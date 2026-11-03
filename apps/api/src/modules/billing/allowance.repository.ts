import { Injectable } from '@nestjs/common';
import type { CoverSource } from '@triptrackr/contracts';
import { sql } from 'drizzle-orm';

import { rlsDb } from '@/common/db/rls-db';
import { requireCurrentUserId } from '@/common/rls/rls-context';
import { tripCovers } from '@/db/schema';

import type { CoveredTrip, Standing } from './cover-order';

/** The caller's active subscription year, for the entitlement answer. */
export interface ActivePeriod {
  readonly tier: 'tier1' | 'unlimited';
  readonly ladderStep: number;
  readonly endsAt: Date;
  readonly cancelAtPeriodEnd: boolean;
}

type StandingRow = {
  ordinary_held: number;
  unlimited_period_id: string | null;
  year_period_id: string | null;
  year_uses_left: number;
  credits: number;
  oldest_credit_id: string | null;
};

type ActivePeriodRow = {
  tier: 'tier1' | 'unlimited';
  ladder_step: number;
  ends_at: Date;
  cancel_at_period_end: boolean;
};

/**
 * The reads and writes of the paid allowance, all as the caller under their RLS identity (spec 014).
 * This is with `AllowanceService` the only code that names the commerce tables (Constitution V; the
 * neutrality test watches the rest of `src/`).
 *
 * Visibility posture: the caller's own rows only. Nothing here can see another traveller.
 */
@Injectable()
export class AllowanceRepository {
  /** Serialises everything one traveller does to their allowance until the request commits. */
  async lockTraveller(): Promise<void> {
    await rlsDb().execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${requireCurrentUserId()}, 0))`,
    );
  }

  async standing(): Promise<Standing> {
    const userId = requireCurrentUserId();
    const rows = await rlsDb().execute<StandingRow>(sql`
      SELECT
        (SELECT count(*)::int FROM trips t
          WHERE t.owner_id = ${userId}::uuid AND t.deleted_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM trip_covers c WHERE c.trip_id = t.id)) AS ordinary_held,
        (SELECT p.id FROM subscription_periods p
          WHERE p.user_id = ${userId}::uuid AND p.tier = 'unlimited' AND p.refunded_at IS NULL
            AND p.starts_at <= now() AND now() < p.ends_at
          ORDER BY p.ends_at DESC LIMIT 1) AS unlimited_period_id,
        (SELECT p.id FROM subscription_periods p
          WHERE p.user_id = ${userId}::uuid AND p.tier = 'tier1' AND p.refunded_at IS NULL
            AND p.starts_at <= now() AND now() < p.ends_at
            AND p.uses_total > (SELECT count(*) FROM trip_covers c
                                 WHERE c.period_id = p.id AND c.source = 'year')
          ORDER BY p.ends_at LIMIT 1) AS year_period_id,
        (SELECT COALESCE(sum(p.uses_total - (SELECT count(*) FROM trip_covers c
                                              WHERE c.period_id = p.id AND c.source = 'year')), 0)::int
          FROM subscription_periods p
          WHERE p.user_id = ${userId}::uuid AND p.tier = 'tier1' AND p.refunded_at IS NULL
            AND p.starts_at <= now() AND now() < p.ends_at) AS year_uses_left,
        (SELECT count(*)::int FROM trip_credits k
          WHERE k.user_id = ${userId}::uuid AND k.refunded_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM trip_covers c WHERE c.credit_id = k.id)) AS credits,
        (SELECT k.id FROM trip_credits k
          WHERE k.user_id = ${userId}::uuid AND k.refunded_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM trip_covers c WHERE c.credit_id = k.id)
          ORDER BY k.purchased_at, k.id LIMIT 1) AS oldest_credit_id`);

    const row = rows[0];
    if (!row) throw new Error('The allowance standing query returned no row.');

    return {
      ordinaryHeld: row.ordinary_held,
      unlimitedPeriodId: row.unlimited_period_id,
      yearPeriodId: row.year_period_id,
      yearUsesLeft: row.year_uses_left,
      credits: row.credits,
      oldestCreditId: row.oldest_credit_id,
    };
  }

  /** The active period that matters for the entitlement answer: Unlimited first, then Tier 1. */
  async activePeriod(): Promise<ActivePeriod | null> {
    const rows = await rlsDb().execute<ActivePeriodRow>(sql`
      SELECT p.tier, p.ladder_step, p.ends_at, p.cancel_at_period_end
      FROM subscription_periods p
      WHERE p.user_id = ${requireCurrentUserId()}::uuid AND p.refunded_at IS NULL
        AND p.starts_at <= now() AND now() < p.ends_at
      ORDER BY (p.tier = 'unlimited') DESC, p.ends_at DESC LIMIT 1`);

    const row = rows[0];
    return row
      ? {
          tier: row.tier,
          ladderStep: row.ladder_step,
          endsAt: new Date(row.ends_at),
          cancelAtPeriodEnd: row.cancel_at_period_end,
        }
      : null;
  }

  /** Whether the caller's trip is covered by something they paid for (or was grandfathered). */
  async isCovered(tripId: string): Promise<boolean> {
    const rows = await rlsDb().execute(
      sql`SELECT 1 FROM trip_covers c WHERE c.trip_id = ${tripId}::uuid AND c.user_id = ${requireCurrentUserId()}::uuid`,
    );
    return rows.length > 0;
  }

  /** What covers the caller's trip, or null when it is an ordinary trip. */
  async coverSource(tripId: string): Promise<CoverSource | null> {
    const rows = await rlsDb().execute<{ source: CoverSource }>(
      sql`SELECT c.source FROM trip_covers c WHERE c.trip_id = ${tripId}::uuid AND c.user_id = ${requireCurrentUserId()}::uuid`,
    );
    return rows[0]?.source ?? null;
  }

  /** Whether this is a live trip of the caller's. */
  async isLiveOwnTrip(tripId: string): Promise<boolean> {
    const rows = await rlsDb().execute(sql`
      SELECT 1 FROM trips t
      WHERE t.id = ${tripId}::uuid AND t.owner_id = ${requireCurrentUserId()}::uuid
        AND t.deleted_at IS NULL`);
    return rows.length > 0;
  }

  /**
   * How many other uncovered live trips of the caller were created before this one (by `created_at`,
   * then `id`). Ranked, not counted at this instant, so a retried push answers the same way every time
   * (spec 013's rule, now over ordinary trips only). A trip that is not live and the caller's counts
   * nothing: the row-value comparison against an empty subselect is NULL.
   */
  async earlierOrdinaryTrips(tripId: string): Promise<number> {
    const userId = requireCurrentUserId();
    const rows = await rlsDb().execute<{ earlier: number }>(sql`
      SELECT count(*)::int AS earlier FROM trips t
      WHERE t.owner_id = ${userId}::uuid AND t.deleted_at IS NULL AND t.id <> ${tripId}::uuid
        AND NOT EXISTS (SELECT 1 FROM trip_covers c WHERE c.trip_id = t.id)
        AND (t.created_at, t.id) < (
          SELECT o.created_at, o.id FROM trips o
          WHERE o.id = ${tripId}::uuid AND o.owner_id = ${userId}::uuid AND o.deleted_at IS NULL)`);
    return rows[0]?.earlier ?? 0;
  }

  /** The caller's live trip as a refusal echoes it, or null when it is not theirs or is deleted. */
  async liveOwnTrip(tripId: string): Promise<{ title: string; homeCurrency: string } | null> {
    const rows = await rlsDb().execute<{ title: string; home_currency: string }>(sql`
      SELECT t.title, t.home_currency FROM trips t
      WHERE t.id = ${tripId}::uuid AND t.owner_id = ${requireCurrentUserId()}::uuid
        AND t.deleted_at IS NULL`);
    const row = rows[0];
    return row ? { title: row.title, homeCurrency: row.home_currency } : null;
  }

  /** While charging is off: this traveller would have been stopped by this create. */
  async recordWouldHaveBeenStopped(): Promise<void> {
    await rlsDb().execute(sql`
      INSERT INTO allowance_shadow (user_id) VALUES (${requireCurrentUserId()}::uuid)
      ON CONFLICT (user_id) DO UPDATE SET attempts = allowance_shadow.attempts + 1`);
  }

  async insertCover(tripId: string, cover: CoveredTrip): Promise<void> {
    await rlsDb().insert(tripCovers).values({
      userId: requireCurrentUserId(),
      tripId,
      source: cover.source,
      creditId: cover.creditId,
      periodId: cover.periodId,
    });
  }
}
