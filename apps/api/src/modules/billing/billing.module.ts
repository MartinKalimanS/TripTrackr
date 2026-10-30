import { Module } from '@nestjs/common';

import { AllowanceRepository } from './allowance.repository';
import { AllowanceService } from './allowance.service';
import { CoverController } from './cover.controller';
import { EntitlementController } from './entitlement.controller';
import { EntitlementService } from './entitlement.service';

/**
 * The paid trip allowance and the caller's entitlement (spec 014). The provider webhook and purchase
 * verification join it in S-11.
 */
@Module({
  controllers: [EntitlementController, CoverController],
  providers: [AllowanceRepository, AllowanceService, EntitlementService],
  exports: [AllowanceService],
})
export class BillingModule {}
