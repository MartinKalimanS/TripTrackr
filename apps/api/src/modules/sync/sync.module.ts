import { Module } from '@nestjs/common';

import { SyncPullController } from './pull.controller';
import { PullService } from './pull.service';
import { SyncPushController } from './push.controller';
import { PushService } from './push.service';

/**
 * Offline sync (User Story 6; contracts/sync-protocol.md; research D-02, D-15,
 * D-16).
 *
 * Visibility posture: owner-only. Every row a traveller pulls or pushes is one
 * RLS already lets them see or write; nothing here has a public variant, and
 * `expenses` and `documents` carry no visibility field on the wire (FR-027,
 * FR-032).
 */
@Module({
  controllers: [SyncPullController, SyncPushController],
  providers: [PullService, PushService],
})
export class SyncModule {}
