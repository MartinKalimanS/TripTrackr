import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { PushResponse } from '@triptrackr/contracts';

import { respond } from '@/common/validation/respond';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';

import { PushEnvelope } from './push-envelope';
import { PushService } from './push.service';

/**
 * `POST /sync/push` (sync-protocol.md §2). Access rule: owner, by RLS — and by
 * naming the owner in every query (push-scope.ts).
 *
 * 200 whatever the per-record outcomes: a `conflict` or a `rejected` is a
 * considered answer about one record, not a failure of the request. 400 only for
 * an envelope the server cannot answer record by record (push-envelope.ts), 413
 * for a body over the API's megabyte.
 */
@Controller('sync')
export class SyncPushController {
  constructor(private readonly pushService: PushService) {}

  @Post('push')
  @HttpCode(HttpStatus.OK)
  async push(
    @Body(new ZodValidationPipe(PushEnvelope)) body: PushEnvelope,
  ): Promise<PushResponse> {
    return respond(PushResponse, await this.pushService.push(body));
  }
}
