import { Injectable } from '@nestjs/common';
import type { EntitlementResponse } from '@triptrackr/contracts';

import { loadEnv } from '@/common/config/env.schema';

import { AllowanceRepository } from './allowance.repository';
import { AllowanceService } from './allowance.service';
import { nextProductId } from './ladder';

/** What the paywall and the settings row read: the caller's own standing, nothing about anyone else. */
const QUIET: EntitlementResponse = {
  charging_enabled: false,
  tier: null,
  is_active: false,
  current_period_end: null,
  cancel_at_period_end: false,
  year_uses_left: 0,
  credits: 0,
  trips_held: 0,
  allowance: 0,
  years_subscribed: 0,
  next_product_id: null,
};

/**
 * `GET /me/entitlement` (contracts/billing-api.md; FR-013, FR-015, FR-016). While charging is off
 * the answer is quiet by construction (FR-026): there is nothing for a screen to draw.
 *
 * Visibility posture: the caller's own rows only.
 */
@Injectable()
export class EntitlementService {
  constructor(
    private readonly allowance: AllowanceService,
    private readonly repository: AllowanceRepository,
  ) {}

  async forCaller(): Promise<EntitlementResponse> {
    if (!this.allowance.isCharging()) return QUIET;

    // Sequential: the reads share the request's one transaction.
    const standing = await this.repository.standing();
    const period = await this.repository.activePeriod();

    return {
      charging_enabled: true,
      tier: period?.tier ?? null,
      is_active: period !== null,
      current_period_end: period?.endsAt.toISOString() ?? null,
      cancel_at_period_end: period?.cancelAtPeriodEnd ?? false,
      year_uses_left: standing.yearUsesLeft,
      credits: standing.credits,
      trips_held: standing.ordinaryHeld,
      allowance: this.allowance.freeTrips(),
      // The ladder step is the years stayed, capped at the floor.
      years_subscribed: period?.ladderStep ?? 0,
      next_product_id: period
        ? nextProductId(loadEnv().BILLING_PRODUCTS, period.tier, period.ladderStep)
        : null,
    };
  }
}
