import { HttpStatus, Injectable } from '@nestjs/common';
import { TRIP_ALLOWANCE_REACHED, type CreateTripRequest } from '@triptrackr/contracts';

import { loadEnv } from '@/common/config/env.schema';
import { apiError } from '@/common/errors/api-error';

import { AllowanceRepository } from './allowance.repository';
import { chooseCover, ORDINARY, type CoverDecision, type Standing } from './cover-order';

/**
 * The paid trip allowance (spec 014, supersedes 013; research D14-03, D14-04). Together with
 * `AllowanceRepository` this is the ONLY code that reads the commerce tables: no read, list or export
 * path and no RLS policy of another table may join them, which is what keeps a lapse, a refund or a
 * spent credit from touching anything a traveller recorded (Constitution V; FR-020, FR-021).
 *
 * A create is decided in two steps inside the request transaction: `decide` before the trip is
 * inserted (under a per-traveller lock, so two creates cannot both take the last slot) and
 * `recordCover` after, which writes the spend into the ledger. Charging is off until the owner
 * switches it on; while off nothing is refused, nothing is spent, and a would-have-been-stopped
 * count is kept instead (FR-026, FR-027).
 *
 * Visibility posture: reads the caller's own rows only, under their RLS identity.
 */
@Injectable()
export class AllowanceService {
  constructor(private readonly repository: AllowanceRepository) {}

  /** Whether charging is switched on (`BILLING_ENFORCED`). */
  isCharging(): boolean {
    return loadEnv().BILLING_ENFORCED;
  }

  /** The number of ordinary trips a traveller may hold without paying. */
  freeTrips(): number {
    return loadEnv().FREE_TRIP_ALLOWANCE;
  }

  /**
   * What the new trip will be paid for with, or a 409 `TRIP_ALLOWANCE_REACHED` when nothing can pay
   * for it. Holds the traveller's allowance lock until the request commits.
   */
  async decide(submitted: CreateTripRequest): Promise<CoverDecision> {
    await this.repository.lockTraveller();
    const standing = await this.repository.standing();
    const choice = chooseCover(standing, this.freeTrips());

    if (!this.isCharging()) {
      if (choice === null) await this.repository.recordWouldHaveBeenStopped();
      return ORDINARY;
    }

    if (choice === null) throw this.refusal(standing, submitted);
    return choice;
  }

  /** Writes the spend for a trip that was just inserted. An ordinary trip leaves no row. */
  async recordCover(tripId: string, decision: CoverDecision): Promise<void> {
    if (decision.kind === 'covered') await this.repository.insertCover(tripId, decision);
  }

  /**
   * Whether a trip that arrived by sync push is one the traveller is not allowed (spec 014, research
   * D14-11; FR-018). The push KEEPS it and flags it; refusing it would destroy something the traveller
   * recorded to enforce a business rule (Constitution V). Never over while charging is off, never
   * over when covered. Under an active Unlimited year the trip is covered on arrival (FR-019). The
   * question is ranked, not counted at this instant, so a retried push answers the same way.
   */
  async isPushedTripOver(tripId: string): Promise<boolean> {
    if (!this.isCharging()) return false;

    await this.repository.lockTraveller();
    if (await this.repository.isCovered(tripId)) return false;

    const standing = await this.repository.standing();
    if (standing.unlimitedPeriodId !== null) {
      if (await this.repository.isLiveOwnTrip(tripId)) {
        await this.repository.insertCover(tripId, {
          kind: 'covered',
          source: 'unlimited',
          periodId: standing.unlimitedPeriodId,
          creditId: null,
        });
      }
      return false;
    }

    return (await this.repository.earlierOrdinaryTrips(tripId)) >= this.freeTrips();
  }

  private refusal(standing: Standing, submitted: CreateTripRequest) {
    const allowance = this.freeTrips();
    return apiError(
      HttpStatus.CONFLICT,
      TRIP_ALLOWANCE_REACHED,
      `You have ${standing.ordinaryHeld} of ${allowance} free trips. Buy this trip, take a yearly plan, or delete a trip to make room.`,
      {
        trips_held: standing.ordinaryHeld,
        allowance,
        year_uses_left: standing.yearUsesLeft,
        credits: standing.credits,
        routes: ['buy_trip', 'subscribe', 'delete_trip'],
        submitted: { title: submitted.title, home_currency: submitted.home_currency },
      },
    );
  }
}
