import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AuthTokens } from '@triptrackr/contracts';
import type Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';
import { QueueModule } from '@/common/queue/queue.module';
import { REDIS_CLIENT } from '@/common/redis/redis.module';

import { ensureMigrated } from './db';
import { applyDatabaseTestEnv } from './env';
import { InertQueueModule } from './queues';

export { enqueuedJobs, type RecordedJob } from './queues';

/**
 * Boots the application that ships — the real AppModule, the real
 * `configureApp` — over the Testcontainers database, for the contract and
 * integration suites.
 *
 * The one pattern `health.spec.ts` established, made reusable so every HTTP
 * spec exercises the same surface rather than a test-only arrangement of it:
 *
 *   - **Redis is absent by default.** REDIS_URL points at a port nothing listens
 *     on; the shared client connects lazily, the app boots, and the rate
 *     limiter fails open and logs — its documented behaviour under an outage.
 *     A spec about the limiter passes an `InMemoryRedis` instead.
 *   - **BullMQ is inert.** Its reconnect loop is not an HTTP contract and would
 *     hold the Jest worker open. Every queue token still resolves — to a
 *     stand-in that records what it is given (support/queues.ts), so a suite can
 *     assert that a request enqueued a job with `enqueuedJobs(app, queue)`.
 */

/** Nothing listens here; the connection is refused at once. */
const UNREACHABLE_REDIS = 'redis://127.0.0.1:1';

export interface BootOptions {
  /** A Redis stand-in for the rate limiter. Without one the limiter fails open. */
  readonly redis?: Redis;
  /** Environment overrides on top of the database-backed defaults. */
  readonly env?: Readonly<Record<string, string>>;
}

export async function bootTestApp(
  options: BootOptions = {},
): Promise<NestExpressApplication> {
  applyDatabaseTestEnv({ REDIS_URL: UNREACHABLE_REDIS, ...options.env });
  await ensureMigrated();

  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideModule(QueueModule)
    .useModule(InertQueueModule);

  const moduleRef = await (
    options.redis
      ? builder.overrideProvider(REDIS_CLIENT).useValue(options.redis)
      : builder
  ).compile();

  // The same options and the same configureApp as main.ts.
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });
  configureApp(app);
  await app.init();

  return app;
}

export interface RegisteredTraveller {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
  readonly tokens: AuthTokens;
}

/** A password that clears the twelve-character floor and is obviously a fixture. */
export const FIXTURE_PASSWORD = 'correct horse battery staple';

/**
 * Registers a fresh traveller through the API — never by inserting a row —
 * so that what the suites lean on is the code under test (Constitution III).
 * The address is unique per call because every spec file shares one database.
 */
export async function registerTraveller(
  app: NestExpressApplication,
  overrides: Partial<
    Pick<RegisteredTraveller, 'email' | 'password' | 'displayName'>
  > = {},
): Promise<RegisteredTraveller> {
  const email = overrides.email ?? `traveller-${randomUUID()}@example.test`;
  const password = overrides.password ?? FIXTURE_PASSWORD;
  const displayName = overrides.displayName ?? 'Fixture Traveller';

  const response = await request(app.getHttpServer())
    .post('/v1/auth/register')
    .send({ email, password, display_name: displayName });

  if (response.status !== 201) {
    throw new Error(
      `Registration fixture failed: ${response.status} ${JSON.stringify(response.body)}`,
    );
  }

  return { email, password, displayName, tokens: AuthTokens.parse(response.body) };
}

/** `Authorization: Bearer …` for supertest's `.set()`. */
export function bearer(accessToken: string): Readonly<Record<string, string>> {
  return { Authorization: `Bearer ${accessToken}` };
}
