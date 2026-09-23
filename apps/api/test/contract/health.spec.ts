import { Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ApiError } from '@triptrackr/contracts';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';
import { QueueModule } from '@/common/queue/queue.module';

import { ensureMigrated } from '../support/db';
import { applyDatabaseTestEnv } from '../support/env';

/**
 * The HTTP surface's standing obligations (contracts/README.md), proven against
 * the application as it ships: the real AppModule, the real `configureApp`, a
 * real PostgreSQL behind the pool.
 *
 * Two things are asserted and both are things every later endpoint inherits:
 *
 *   1. `GET /health` answers at a fixed path outside the versioned prefix, and
 *      says "ok" only after the database has.
 *   2. Every refusal — a route that does not exist, a route that exists and
 *      wants a token — arrives in the one error envelope, validated with the
 *      same zod schema the mobile client parses responses with. The shape is
 *      a contract obligation (FR-072), and the filter that produces it is
 *      global, so a single unauthenticated request exercises the path every
 *      error will take.
 *
 * **Redis is deliberately absent.** REDIS_URL points at a port nothing listens
 * on. The shared client connects lazily (redis.module.ts), so the app boots;
 * the rate limiter fails open and logs, which is its documented behaviour under
 * a Redis outage and a useful thing for this suite to have exercised. BullMQ's
 * queues are swapped for an inert module: their reconnect loop is BullMQ's own
 * concern, not an HTTP contract, and it would hold the Jest worker open.
 */

/** Nothing listens here; the connection is refused at once. */
const UNREACHABLE_REDIS = 'redis://127.0.0.1:1';

@Module({})
class InertQueueModule {}

describe('contract — health and the error envelope', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    applyDatabaseTestEnv({ REDIS_URL: UNREACHABLE_REDIS });
    await ensureMigrated();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideModule(QueueModule)
      .useModule(InertQueueModule)
      .compile();

    // The same options and the same configureApp as main.ts, so what is under
    // test is the application that ships and not a test-only arrangement of it.
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('GET /health', () => {
    it('answers 200 { status: "ok" } at the unprefixed path the Dockerfile probes', async () => {
      const response = await request(app.getHttpServer()).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });

    it('needs no token', async () => {
      // The global JwtAuthGuard is on; the route opts out with @Public(). A
      // health check that returned 401 would have the orchestrator restart a
      // healthy process forever.
      const response = await request(app.getHttpServer())
        .get('/health')
        .set('Authorization', 'Bearer not-a-token');

      expect(response.status).toBe(200);
    });

    it('is not also served under the version prefix', async () => {
      // One path, so the probe never drifts with the API version.
      const response = await request(app.getHttpServer()).get('/v1/health');

      expect(response.status).toBe(404);
    });
  });

  describe('the error envelope', () => {
    it('refuses an unauthenticated GET /v1/me in the uniform shape', async () => {
      // Act
      const response = await request(app.getHttpServer()).get('/v1/me');

      // Assert — the JwtAuthGuard's 401, in the one envelope. The full
      // boundary — every protected route, every kind of bad token — is
      // auth-boundary.spec.ts; this pins that the filter that shapes the
      // refusal is the global one.
      expect(response.status).toBe(401);

      const parsed = ApiError.safeParse(response.body);
      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.error.code).toBe('UNAUTHENTICATED');
    });

    it('carries no internal detail — no stack, no SQL, no status object', async () => {
      // FR-072. ApiError is a strict object, so any extra key already fails the
      // parse above; this names the specific leaks the filter exists to stop.
      const response = await request(app.getHttpServer()).get(
        '/v1/definitely-not-a-route',
      );

      expect(response.status).toBe(404);
      expect(response.body).not.toHaveProperty('statusCode');
      expect(response.body).not.toHaveProperty('stack');
      expect(JSON.stringify(response.body)).not.toMatch(
        /at .*\.js:\d+|SELECT|current_user_id/,
      );
    });

    it('rejects a malformed JSON body in the same shape', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/anything')
        .set('Content-Type', 'application/json')
        .send('{"not json');

      expect(response.status).toBe(400);
      expect(ApiError.safeParse(response.body).success).toBe(true);
    });
  });

  describe('response headers', () => {
    it('sets the hardening headers helmet provides', async () => {
      const response = await request(app.getHttpServer()).get('/health');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('grants no browser origin', async () => {
      // The client is a native app. A browser page on another origin is never
      // a legitimate caller, so no Access-Control-Allow-Origin is ever sent.
      const response = await request(app.getHttpServer())
        .get('/health')
        .set('Origin', 'https://evil.example');

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('echoes a request id for support to quote', async () => {
      const response = await request(app.getHttpServer()).get('/health');

      expect(response.headers['x-request-id']).toMatch(/[0-9a-f-]{36}/);
    });
  });
});
