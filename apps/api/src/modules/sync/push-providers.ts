import type { Provider } from '@nestjs/common';

import { BoardingPassService } from '@/modules/documents/boarding-pass.service';

import { TripAllowancePolicy } from './push-allowance.policy';
import { DocumentsPushHandler, PhotosPushHandler } from './push-media';
import { ExpenseCategoriesPushHandler, ExpensesPushHandler } from './push-money';
import { NotesPushHandler } from './push-notes';
import { TripStopsPushHandler, TripsPushHandler } from './push-trips';

/**
 * Everything `PushService` needs that is not in `SyncModule` already, in one
 * list so the module takes a single line (tasks.md T128).
 *
 * `BoardingPassService` is provided here rather than imported from the
 * documents module, which does not export it: it is stateless and depends only
 * on `EnvelopeService` from the global crypto module, and sealing a pushed
 * document's fields must go through that very class (research D-33).
 * `FxService` comes from `ExpensesModule`, which exports it.
 */
export const PUSH_PROVIDERS: Provider[] = [
  TripAllowancePolicy,
  BoardingPassService,
  TripsPushHandler,
  TripStopsPushHandler,
  ExpenseCategoriesPushHandler,
  NotesPushHandler,
  ExpensesPushHandler,
  PhotosPushHandler,
  DocumentsPushHandler,
];
