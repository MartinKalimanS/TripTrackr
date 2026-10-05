import { Module } from '@nestjs/common';

import { BoardingPassService } from '@/modules/documents/boarding-pass.service';
import { ExpensesModule } from '@/modules/expenses/expenses.module';

import { SyncPullController } from './pull.controller';
import { PullReaders } from './pull-readers';
import { PULL_PAGE_LIMIT, PULL_PAGE_SIZE, PullService } from './pull.service';
import { PUSH_PROVIDERS } from './push-providers';
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
  // FxService, for the conversion a pushed expense freezes at entry (D-10).
  imports: [ExpensesModule],
  controllers: [SyncPullController, SyncPushController],
  providers: [
    PullService,
    PushService,
    // The push's table handlers and the allowance policy (push-providers.ts).
    ...PUSH_PROVIDERS,
    PullReaders,
    // The one home of the document fields' crypto (it needs only the global
    // EnvelopeService); the pull feed opens a sealed passenger name through it.
    BoardingPassService,
    { provide: PULL_PAGE_LIMIT, useValue: PULL_PAGE_SIZE },
  ],
})
export class SyncModule {}
