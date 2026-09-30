import { Controller, Get, Query } from '@nestjs/common';
import { PullQuery, PullResponse } from '@triptrackr/contracts';

import { respond } from '@/common/validation/respond';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';

import { PullService } from './pull.service';

/** `GET /sync/pull` (sync-protocol.md §1). Access rule: owner, by RLS. */
@Controller('sync')
export class SyncPullController {
  constructor(private readonly pullService: PullService) {}

  @Get('pull')
  async pull(
    @Query(new ZodValidationPipe(PullQuery)) query: PullQuery,
  ): Promise<PullResponse> {
    return respond(PullResponse, await this.pullService.pull(query));
  }
}
