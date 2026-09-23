import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import Redis from 'ioredis';

import { loadEnv } from '@/common/config/env.schema';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * Builds the shared client. Exported so the factory can be exercised without
 * a Nest container.
 *
 * `lazyConnect` is what lets the API boot before Redis answers. The constructor
 * then opens no socket and can neither block nor throw; the connection is
 * started immediately below, but nothing awaits it, so a Redis that is down —
 * or merely slower to start than the API, which is the ordinary case under
 * compose — costs boot nothing. The first commands fail fast (no offline queue)
 * and the rate limiter fails open, loudly, as it is designed to.
 *
 * ioredis reconnects on its own after a lost connection; the listener exists so
 * that each failed attempt is a structured log line and not ioredis's own
 * console warning about an unhandled event.
 */
export function createRedisClient(logger: Logger): Redis {
  const client = new Redis(loadEnv().REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    // Fail fast rather than queue commands while the connection is down.
    // The rate limiter decides for itself what an unreachable Redis means
    // (see rate-limit.guard.ts); silently buffering would turn that
    // decision into an unbounded wait.
    enableOfflineQueue: false,
  });

  client.on('error', (error: Error) => {
    logger.error(`Redis connection error: ${error.message}`);
  });

  // Not awaited. The rejection is already reported through the 'error' event
  // above; the catch only stops the same failure surfacing a second time as an
  // unhandled rejection.
  client.connect().catch(() => undefined);

  return client;
}

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
      useFactory: (): Redis => createRedisClient(new Logger(RedisModule.name)),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * `quit()` sends QUIT and waits for the server to acknowledge it, which needs
   * a live connection. A client that never reached the server rejects it, and
   * its reconnect timer would then hold the process open past shutdown.
   * `disconnect()` drops the socket and cancels the timer without ceremony;
   * with nothing in flight there is nothing for the ceremony to protect.
   */
  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status !== 'ready') {
      this.redis.disconnect();
      return;
    }

    await this.redis.quit();
  }
}
