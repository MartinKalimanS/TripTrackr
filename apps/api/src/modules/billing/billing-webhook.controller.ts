import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';

import { Public } from '@/common/auth/jwt.guard';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';

import { BillingEventsService } from './billing-events.service';
import { RevenueCatWebhook } from './revenuecat-event';
import { WebhookAuthGuard } from './webhook-auth.guard';

/**
 * `POST /billing/webhook` (contracts/billing-api.md). Called by RevenueCat, not by a traveller:
 * public to the sign-in guard and authenticated by the shared secret instead. Always 200 for an
 * authentic call, including one we choose not to act on.
 */
@Controller('billing/webhook')
export class BillingWebhookController {
  constructor(private readonly events: BillingEventsService) {}

  @Public()
  @UseGuards(WebhookAuthGuard)
  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Body(new ZodValidationPipe(RevenueCatWebhook)) body: RevenueCatWebhook,
  ): Promise<{ received: true }> {
    await this.events.apply(body.event);
    return { received: true };
  }
}
