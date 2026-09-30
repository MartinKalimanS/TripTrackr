import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { PushResponse } from '@triptrackr/contracts';

import { respond } from '@/common/validation/respond';

import { PushService } from './push.service';

/** `POST /sync/push` (sync-protocol.md §2). Access rule: owner, by RLS. */
@Controller('sync')
export class SyncPushController {
  constructor(private readonly pushService: PushService) {}

  @Post('push')
  @HttpCode(HttpStatus.OK)
  async push(@Body() body: unknown): Promise<PushResponse> {
    return respond(PushResponse, await this.pushService.push(body));
  }
}
