import { Controller, Get, HttpStatus } from '@nestjs/common';
import { FxRatesResponse } from '@triptrackr/contracts';

import { apiError } from '@/common/errors/api-error';
import { respond } from '@/common/validation/respond';

import { FxService } from './fx.service';

/**
 * `GET /fx-rates` (rest-api.md §11; research D-10, D-28). Access rule: owner —
 * any signed-in traveller. Reference data, but behind a session so the route
 * is not a free proxy for the upstream feed.
 *
 * The device fetches this about once a day and stores it as its offline
 * snapshot; an expense logged in aeroplane mode converts from it and carries
 * the rate it used, which the server then stores as sent.
 */
@Controller('fx-rates')
export class FxController {
  constructor(private readonly fx: FxService) {}

  @Get()
  async latest(): Promise<FxRatesResponse> {
    const snapshot = await this.fx.snapshotForDevice();

    // A deployment whose worker has not run yet has nothing to serve. That is
    // a temporary condition, not a client mistake, and 503 says so; the client
    // keeps whatever snapshot it already holds.
    if (!snapshot) {
      throw apiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'FX_RATES_UNAVAILABLE',
        'Exchange rates are not available yet. Please try again later.',
      );
    }

    return respond(FxRatesResponse, snapshot);
  }
}
