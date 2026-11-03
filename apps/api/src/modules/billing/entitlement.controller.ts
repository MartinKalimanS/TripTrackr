import { Controller, Get } from '@nestjs/common';
import { EntitlementResponse } from '@triptrackr/contracts';

import { respond } from '@/common/validation/respond';

import { EntitlementService } from './entitlement.service';

/**
 * `GET /me/entitlement` (contracts/billing-api.md; FR-013, FR-015). The caller's own standing, so the
 * paywall and the settings row can say plainly what they hold and until when. Quiet while charging
 * is off (FR-026).
 */
@Controller('me/entitlement')
export class EntitlementController {
  constructor(private readonly entitlement: EntitlementService) {}

  @Get()
  async get(): Promise<EntitlementResponse> {
    return respond(EntitlementResponse, await this.entitlement.forCaller());
  }
}
