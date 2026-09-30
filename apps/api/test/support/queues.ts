import { Global, Module, type INestApplication, type Provider } from '@nestjs/common';

import { QUEUE_NAMES, queueToken, type QueueName } from '@/common/queue/queue.constants';

/**
 * BullMQ, inert: every queue token the real QueueModule provides, each bound to
 * a stand-in that records what it is given and dials nothing.
 *
 * The real module opens a Redis connection whose reconnect loop is not an HTTP
 * contract and would hold the Jest worker open; the old stand-in provided
 * nothing at all, so a service that injects a queue — the photos module
 * enqueues every registration for the media worker (T112) — could not be built.
 * This one provides every token in `QUEUE_NAMES`, and a suite reads back what
 * its requests enqueued with {@link enqueuedJobs}, which is how the upload
 * suite proves a registered photo was handed to the worker without running one.
 *
 * Global, like the module it replaces, so feature modules resolve the tokens
 * without importing anything.
 */

/** One `add` call, exactly as the producer made it. */
export interface RecordedJob {
  readonly name: string;
  readonly data: unknown;
  readonly opts: unknown;
}

/** The slice of a BullMQ `Queue` the application uses, recording instead of sending. */
export class InertQueue {
  private readonly recorded: RecordedJob[] = [];

  constructor(readonly name: QueueName) {}

  /** Every job added so far, oldest first. */
  get jobs(): readonly RecordedJob[] {
    return [...this.recorded];
  }

  add(name: string, data: unknown, opts?: unknown): Promise<{ id: string | undefined }> {
    this.recorded.push({ name, data, opts });
    const jobId = (opts as { jobId?: unknown } | undefined)?.jobId;
    return Promise.resolve({ id: typeof jobId === 'string' ? jobId : undefined });
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

const inertQueueProviders: Provider[] = Object.values(QUEUE_NAMES).map((name) => ({
  provide: queueToken(name),
  useFactory: () => new InertQueue(name),
}));

@Global()
@Module({
  providers: inertQueueProviders,
  exports: Object.values(QUEUE_NAMES).map((name) => queueToken(name)),
})
export class InertQueueModule {}

/** What the booted application added to `queue`, oldest first. */
export function enqueuedJobs(
  app: INestApplication,
  queue: QueueName,
): readonly RecordedJob[] {
  return app.get<InertQueue>(queueToken(queue), { strict: false }).jobs;
}
