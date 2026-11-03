import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CoverResponse, Uuid } from '@triptrackr/contracts';

import { respond } from '@/common/validation/respond';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';

import { AllowanceService } from './allowance.service';

/**
 * `POST /trips/:id/cover` (contracts/billing-api.md; FR-018). Spends a use or a credit on a trip that
 * arrived over the allowance. Owner only: another traveller's trip is a 404, as everywhere.
 */
@Controller('trips/:id/cover')
export class CoverController {
  constructor(private readonly allowance: AllowanceService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async cover(
    @Param('id', new ZodValidationPipe(Uuid)) id: string,
  ): Promise<CoverResponse> {
    return respond(CoverResponse, { source: await this.allowance.coverTrip(id) });
  }
}
