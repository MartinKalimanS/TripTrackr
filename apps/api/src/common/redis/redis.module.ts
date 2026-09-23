import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';

import { loadEnv } from '@/common/config/env.schema';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * The shared Redis connection: rate-limit counters (FR-071) and the planner
 * response cache.
 *
 * BullMQ opens its own connections (queue.module.ts) rather than sharing this
 * one. Blocking commands like BRPOPLPUSH occupy a connection for their whole
 * duration, so a shared client would stall every rate-limit check behind a
 * waiting worker.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (): Redis =>
        new Redis(loadEnv().REDIS_URL, {
          maxRetriesPerRequest: 3,
          // Fail fast rather than queue commands while the connection is down.
          // The rate limiter decides for itself what an unreachable Redis means
          // (see rate-limit.guard.ts); silently buffering would turn that
          // decision into an unbounded wait.
          enableOfflineQueue: false,
        }),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}
