import { Module } from '@nestjs/common';

import { AllowanceService } from './allowance.service';
import { EntitlementController } from './entitlement.controller';

/**
 * The allowance and the caller's entitlement (spec 013). Purchase verification and the provider
 * webhook join it in S-11.
 */
@Module({
  controllers: [EntitlementController],
  providers: [AllowanceService],
  exports: [AllowanceService],
})
export class BillingModule {}
