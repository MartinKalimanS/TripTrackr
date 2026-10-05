import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';

import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';
import { QueueModule } from '@/common/queue/queue.module';
import { PULL_PAGE_LIMIT } from '@/modules/sync/pull.service';

import { ensureMigrated } from './db';
import { applyDatabaseTestEnv } from './env';
import { InertQueueModule } from './queues';

/**
 * `bootTestApp` (support/app.ts) with one difference: the pull page size is a
 * number the suite chooses.
 *
 * The production page is 500 rows (`PULL_PAGE_SIZE`). A suite that wants to
 * prove paging, resumption and the tie-break at a page boundary would have to
 * create 501 rows to do it; the page size is a DI token (`PULL_PAGE_LIMIT`) so
 * it can create a handful and page through them three at a time instead. Every
 * other part of the app is the one that ships: the real `AppModule`, the real
 * `configureApp`, inert queues, Redis absent.
 */

/** Nothing listens here; the connection is refused at once (as in support/app.ts). */
const UNREACHABLE_REDIS = 'redis://127.0.0.1:1';

export async function bootPullApp(
  options: { readonly pageSize?: number } = {},
): Promise<NestExpressApplication> {
  applyDatabaseTestEnv({ REDIS_URL: UNREACHABLE_REDIS });
  await ensureMigrated();

  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideModule(QueueModule)
    .useModule(InertQueueModule);

  if (options.pageSize !== undefined) {
    builder = builder.overrideProvider(PULL_PAGE_LIMIT).useValue(options.pageSize);
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });
  configureApp(app);
  await app.init();

  return app;
}
