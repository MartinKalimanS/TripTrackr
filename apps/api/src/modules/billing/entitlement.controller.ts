import { Controller, Get } from '@nestjs/common';
import { EntitlementResponse } from '@triptrackr/contracts';

import { respond } from '@/common/validation/respond';

import { AllowanceService } from './allowance.service';

/**
 * `GET /me/entitlement` (rest-api.md §10; FR-077, FR-082). The caller's own standing, so the paywall
 * and the settings row can say plainly how many trips they hold and until when they are covered.
 */
@Controller('me/entitlement')
export class EntitlementController {
  constructor(private readonly allowance: AllowanceService) {}

  @Get()
  async get(): Promise<EntitlementResponse> {
    // Sequential: both reads share the request's one transaction.
    const entitlement = await this.allowance.entitlement();
    const held = await this.allowance.tripsHeld();

    return respond(EntitlementResponse, {
      is_active: entitlement.isActive,
      current_period_end: entitlement.currentPeriodEnd?.toISOString() ?? null,
      trips_held: held,
      allowance: this.allowance.allowance(),
    });
  }
}
