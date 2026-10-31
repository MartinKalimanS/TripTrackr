import { Module } from '@nestjs/common';

import { AllowanceRepository } from './allowance.repository';
import { AllowanceService } from './allowance.service';
import { BillingEventsService } from './billing-events.service';
import { BillingWebhookController } from './billing-webhook.controller';
import { CoverController } from './cover.controller';
import { EntitlementController } from './entitlement.controller';
import { EntitlementService } from './entitlement.service';

/**
 * The paid trip allowance, the caller's entitlement and the provider webhook (spec 014). Purchase
 * verification by the app (`purchase-completed`) waits for the S-13 sandbox run.
 */
@Module({
  controllers: [EntitlementController, CoverController, BillingWebhookController],
  providers: [AllowanceRepository, AllowanceService, BillingEventsService, EntitlementService],
  exports: [AllowanceService],
})
export class BillingModule {}
