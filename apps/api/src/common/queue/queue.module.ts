import {
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
  type Provider,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

import { loadEnv } from '@/common/config/env.schema';
import { QUEUE_NAMES, type QueueName, queueToken } from './queue.constants';

export const BULL_CONNECTION = Symbol('BULL_CONNECTION');

/**
 * BullMQ requires `maxRetriesPerRequest: null`.
 *
 * This is not a tuning preference — BullMQ throws at construction without it. Its
 * workers block on BRPOPLPUSH indefinitely, and ioredis's retry ceiling would
 * abort that as a failed command. It is also exactly why this connection is
 * separate from REDIS_CLIENT: a blocking read occupies its connection for the
 * whole wait, so sharing one would stall every rate-limit check behind an idle
 * worker.
 */
export function createBullConnection(): Redis {
  return new Redis(loadEnv().REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

/**
 * Retry policy for every job.
 *
 * Exponential backoff from one second, five attempts — roughly sixteen minutes of
 * patience. The jobs behind these queues are all retryable-by-nature (an object
 * store that refused a write, a moderation API that rate-limited), and a
 * transient outage of that shape usually resolves well inside the window.
 *
 * Completed jobs are kept briefly and failed jobs kept long. A failed job is the
 * only record that a photo never got a thumbnail or an object never got swept;
 * discarding it on the same schedule as a success would erase the evidence of the
 * problem along with the problem.
 */
const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 1_000 },
  removeOnComplete: { age: 3_600, count: 1_000 },
  removeOnFail: { age: 604_800 },
} as const;

const queueProviders: Provider[] = Object.values(QUEUE_NAMES).map((name) => ({
  provide: queueToken(name),
  inject: [BULL_CONNECTION],
  useFactory: (connection: Redis): Queue =>
    new Queue(name, { connection, defaultJobOptions: { ...DEFAULT_JOB_OPTIONS } }),
}));

/**
 * Producer side of the queues (research D-12).
 *
 * The API only ever *enqueues*. Processors run in `workers/main.ts`, a separate
 * process, so that thumbnailing a 12 MB photo cannot occupy a request handler
 * (SC-003) and so the two can be scaled independently — media work is bursty in a
 * way request traffic is not.
 */
@Global()
@Module({
  providers: [
    { provide: BULL_CONNECTION, useFactory: createBullConnection },
    ...queueProviders,
  ],
  exports: [BULL_CONNECTION, ...queueProviders.map((p) => (p as { provide: string }).provide)],
})
export class QueueModule implements OnApplicationShutdown {
  constructor(@Inject(BULL_CONNECTION) private readonly connection: Redis) {}

  /**
   * Closing the connection on shutdown rather than leaving it to process exit:
   * an in-flight `add()` that loses its connection mid-write leaves the caller
   * believing a job was enqueued when it was not.
   */
  async onApplicationShutdown(): Promise<void> {
    await this.connection.quit();
  }
}

export { QUEUE_NAMES, queueToken };
export type { QueueName };
