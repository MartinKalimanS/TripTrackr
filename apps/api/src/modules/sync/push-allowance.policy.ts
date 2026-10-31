import { Injectable } from '@nestjs/common';

import { AllowanceService } from '@/modules/billing/allowance.service';

/**
 * Whether a trip that arrived by push is one the traveller is not allowed (research D-08, D14-11;
 * Constitution V; FR-018, FR-019).
 *
 * A trip created offline is accepted on the device whatever the cached standing says, because the
 * limit cannot be checked until connectivity returns. When it arrives and the traveller is already
 * past what they are allowed, the push KEEPS it and flags the result `over_allowance`; the commercial
 * question is asked afterwards, when the traveller covers it (`POST /trips/:id/cover`). Rejecting the
 * trip would destroy something the traveller recorded to enforce a business rule.
 *
 * The rule lives in `AllowanceService`, the one reader of the commerce tables. `POST /trips` refuses at
 * the limit instead; a push only flags.
 *
 * Visibility posture: reads the caller's own trips only.
 */
@Injectable()
export class TripAllowancePolicy {
  constructor(private readonly allowances: AllowanceService) {}

  isOverAllowance(tripId: string): Promise<boolean> {
    return this.allowances.isPushedTripOver(tripId);
  }
}
