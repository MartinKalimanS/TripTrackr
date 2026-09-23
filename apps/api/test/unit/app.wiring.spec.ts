import { Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ApiError } from '@triptrackr/contracts';
import type Redis from 'ioredis';
import type { Sql } from 'postgres';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';
import { DRIZZLE, PG_CONNECTION } from '@/common/db/db.module';
import { QueueModule } from '@/common/queue/queue.module';
import { REDIS_CLIENT } from '@/common/redis/redis.module';

import { applyUnitTestEnv } from '../support/env';

/**
 * The root module, assembled and served — with the two things that need a
 * network (the pool, Redis) replaced by stand-ins.
 *
 * This is not the contract suite (test/contract/health.spec.ts runs the same
 * surface against a real PostgreSQL). It exists because the scaffold's root
 * module imported three of eight infrastructure modules and nothing noticed:
 * every provider resolved in the test that instantiated it alone, and the
 * missing ones would have failed on the first request that needed them, in
 * production. Booting the whole graph here makes an unresolvable dependency a
 * failing unit test rather than a 500 — and it runs without Docker, so CI has
 * this answer even when the container suites are not run.
 */

@Module({})
class InertQueueModule {}

interface FakePool {
  readonly sql: Sql;
  /** Every tagged-template call the pool received. */
  readonly queries: string[];
}

/** A pool that answers every query with no rows and opens transactions for free. */
function fakePool(): FakePool {
  const queries: string[] = [];

  const tx = (strings: TemplateStringsArray): Promise<unknown[]> => {
    queries.push(strings.join('?'));
    return Promise.resolve([]);
  };

  const sql = Object.assign(tx, {
    begin: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    end: () => Promise.resolve(),
  });

  return { sql: sql as unknown as Sql, queries };
}

function fakeRedis(count: number | Error): Redis {
  return {
    status: 'end',
    eval: () => (count instanceof Error ? Promise.reject(count) : Promise.resolve(count)),
    ttl: () => Promise.resolve(30),
    disconnect: () => undefined,
    quit: () => Promise.resolve('OK'),
  } as unknown as Redis;
}

async function bootApp(
  redis: Redis,
): Promise<{ app: NestExpressApplication; pool: FakePool }> {
  applyUnitTestEnv();
  const pool = fakePool();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideModule(QueueModule)
    .useModule(InertQueueModule)
    .overrideProvider(PG_CONNECTION)
    .useValue(pool.sql)
    .overrideProvider(DRIZZLE)
    .useValue({})
    .overrideProvider(REDIS_CLIENT)
    .useValue(redis)
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });
  configureApp(app);
  await app.init();

  return { app, pool };
}

describe('AppModule wiring', () => {
  describe('with Redis unreachable', () => {
    let app: NestExpressApplication;
    let pool: FakePool;

    beforeAll(async () => {
      ({ app, pool } = await bootApp(fakeRedis(new Error('ECONNREFUSED'))));
    });

    afterAll(() => app?.close());

    it('boots every infrastructure module and serves /health outside the prefix', async () => {
      const response = await request(app.getHttpServer()).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
      expect(pool.queries.some((q) => /SELECT 1/.test(q))).toBe(true);
    });

    it('does not serve /health under /v1', async () => {
      const response = await request(app.getHttpServer()).get('/v1/health');

      expect(response.status).toBe(404);
    });

    it('lets the rate limiter fail open rather than turning a Redis outage into 429s', async () => {
      const response = await request(app.getHttpServer()).get('/health');

      expect(response.status).toBe(200);
    });

    it('answers an unknown route in the contract error envelope', async () => {
      const response = await request(app.getHttpServer()).get('/v1/me');

      expect(response.status).toBe(404);
      expect(ApiError.safeParse(response.body).success).toBe(true);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    });

    it('answers a malformed JSON body in the same envelope, before any transaction opens', async () => {
      const before = pool.queries.length;

      const response = await request(app.getHttpServer())
        .post('/v1/anything')
        .set('Content-Type', 'application/json')
        .send('{"not json');

      expect(response.status).toBe(400);
      expect(ApiError.safeParse(response.body).success).toBe(true);
      // The body parser sits in front of the RLS middleware; a request that
      // cannot be parsed never reaches the database.
      expect(pool.queries.length).toBe(before);
    });

    it('refuses a body over the limit in the same envelope', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/anything')
        .set('Content-Type', 'application/json')
        .send({ padding: 'x'.repeat(1_100_000) });

      expect(response.status).toBe(413);
      expect(ApiError.safeParse(response.body).success).toBe(true);
      expect(response.body).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
    });

    it('sets hardening headers, grants no origin, and echoes a request id', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .set('Origin', 'https://evil.example');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(response.headers['x-request-id']).toMatch(/[0-9a-f-]{36}/);
    });
  });

  describe('with Redis reporting the limit exceeded', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      ({ app } = await bootApp(fakeRedis(10_000)));
    });

    afterAll(() => app?.close());

    it('applies the rate limiter globally, even to a public route', async () => {
      // Proves the APP_GUARD registration, not the arithmetic — that is
      // rate-limit.guard.spec.ts. A 429 here means the guard runs for every
      // route, including one that opted out of authentication.
      const response = await request(app.getHttpServer()).get('/health');

      expect(response.status).toBe(429);
      expect(response.body).toMatchObject({ error: { code: 'RATE_LIMITED' } });
      expect(response.headers['retry-after']).toBeDefined();
    });
  });
});
