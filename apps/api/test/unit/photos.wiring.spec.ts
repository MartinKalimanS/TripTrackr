import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ApiError } from '@triptrackr/contracts';
import type Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';
import { DRIZZLE, PG_CONNECTION } from '@/common/db/db.module';
import { QUEUE_NAMES } from '@/common/queue/queue.constants';
import { QueueModule } from '@/common/queue/queue.module';
import { REDIS_CLIENT } from '@/common/redis/redis.module';
import { MEDIA_JOB } from '@/modules/photos/media-job';
import { MediaJobProducer } from '@/modules/photos/media-job.producer';

import { applyUnitTestEnv } from '../support/env';
import { InertQueueModule, enqueuedJobs } from '../support/queues';

/**
 * The photos module in the application that ships (tasks.md T112), without
 * Docker: the real AppModule with the pool and Redis replaced, and BullMQ
 * replaced by the recording stand-in the contract, integration and privacy
 * suites boot with (support/queues.ts).
 *
 * Two things are proven here because nothing else proves them without a
 * database: the module's providers — the media queue included — resolve in the
 * whole graph, and every photo route sits behind the global JwtAuthGuard,
 * answering a request with no token exactly as every other protected route
 * does (contract test 1).
 */
function fakePool(): Sql {
  const tx = (): Promise<unknown[]> => Promise.resolve([]);
  return Object.assign(tx, {
    begin: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    end: () => Promise.resolve(),
  }) as unknown as Sql;
}

const unreachableRedis = {
  status: 'end',
  eval: () => Promise.reject(new Error('ECONNREFUSED')),
  disconnect: () => undefined,
  quit: () => Promise.resolve('OK'),
} as unknown as Redis;

type Method = 'get' | 'post' | 'patch' | 'delete';

const PHOTO_ROUTES: readonly (readonly [Method, string])[] = [
  ['post', `/v1/trips/${randomUUID()}/photos/upload-url`],
  ['post', `/v1/trips/${randomUUID()}/photos`],
  ['get', `/v1/trips/${randomUUID()}/photos`],
  ['get', `/v1/photos/${randomUUID()}/original`],
  ['patch', `/v1/photos/${randomUUID()}`],
  ['delete', `/v1/photos/${randomUUID()}`],
];

describe('the photos module in the application graph', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    applyUnitTestEnv();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideModule(QueueModule)
      .useModule(InertQueueModule)
      .overrideProvider(PG_CONNECTION)
      .useValue(fakePool())
      .overrideProvider(DRIZZLE)
      .useValue({})
      .overrideProvider(REDIS_CLIENT)
      .useValue(unreachableRedis)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app);
    await app.init();
  });

  afterAll(() => app?.close());

  it.each(PHOTO_ROUTES)('%s %s refuses a request with no token', async (method, path) => {
    const response = await request(app.getHttpServer())[method](path).send({});

    expect(response.status).toBe(401);
    expect(ApiError.safeParse(response.body).success).toBe(true);
    expect(response.body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('resolves the media queue for the producer, and records what it is given', async () => {
    const photoId = randomUUID();
    expect(enqueuedJobs(app, QUEUE_NAMES.media)).toEqual([]);

    await app.get(MediaJobProducer).enqueue(photoId);

    expect(enqueuedJobs(app, QUEUE_NAMES.media)).toEqual([
      {
        name: MEDIA_JOB.name,
        data: { photo_id: photoId },
        opts: { jobId: photoId, delay: MEDIA_JOB.delayMs, removeOnComplete: true },
      },
    ]);
    expect(enqueuedJobs(app, QUEUE_NAMES.storageSweep)).toEqual([]);
  });
});
