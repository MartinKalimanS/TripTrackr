import { Worker, type Job, type Processor } from 'bullmq';
import Redis from 'ioredis';

import { loadEnv } from '@/common/config/env.schema';
import { QUEUE_NAMES, type QueueName } from '@/common/queue/queue.constants';
import { createBullConnection } from '@/common/queue/queue.module';

/**
 * Media and maintenance worker entrypoint (research D-12, SC-003).
 *
 * A separate process from the API, not a background task inside it. Thumbnailing
 * a 12 MB photo is CPU-bound work on a single-threaded runtime; run in-process it
 * would block the event loop and stall every concurrent request, however fast the
 * individual handler is. Splitting them also lets the two scale on their own
 * curves — media load is bursty in a way request traffic is not.
 *
 * Processors register in {@link PROCESSORS} as their phases land: media (T113),
 * tombstone purge (T129), storage sweep (T188), account export (FR-007).
 */

/**
 * Writes one structured line to stdout.
 *
 * `console.log` is banned by lint in favour of the Pino logger (T031), but that
 * logger is bound to the Nest application, and this process never builds one.
 * Emitting the same NDJSON shape by hand keeps the worker's output readable by
 * the same log pipeline as the API's.
 */
function logLine(level: 'info' | 'error', fields: Record<string, unknown>): void {
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(`${JSON.stringify({ level, ...fields })}
`);
}

/** How many jobs of a given queue one worker process runs at once. */
const CONCURRENCY: Readonly<Record<QueueName, number>> = {
  // Image decode and moderation are CPU- and network-bound in roughly equal
  // measure; a handful in flight keeps both busy without thrashing.
  [QUEUE_NAMES.media]: 4,
  // Maintenance jobs take row locks and delete in bulk. Running several at once
  // would have them contend for the same rows to no benefit — these are throughput
  // -indifferent and correctness-sensitive, so they run one at a time.
  [QUEUE_NAMES.tombstonePurge]: 1,
  [QUEUE_NAMES.storageSweep]: 1,
  [QUEUE_NAMES.accountExport]: 2,
};

/**
 * The registry. Empty by design at this phase: `main.ts` is the plumbing, and a
 * queue with no processor simply accumulates jobs rather than failing them, so
 * enqueueing before the consumer exists is safe.
 */
const PROCESSORS: Partial<Record<QueueName, Processor>> = {};

function bootstrapWorker(): void {
  // Validates every secret before a single job is claimed. A worker that boots
  // and then fails on its first job has already marked that job as attempted.
  loadEnv();

  const connection: Redis = createBullConnection();
  const workers: Worker[] = [];

  for (const [name, processor] of Object.entries(PROCESSORS) as [
    QueueName,
    Processor,
  ][]) {
    const worker = new Worker(name, processor, {
      connection,
      concurrency: CONCURRENCY[name],
    });

    worker.on('failed', (job: Job | undefined, error: Error) => {
      // Logged rather than rethrown: BullMQ has already recorded the attempt and
      // scheduled the retry, and crashing the process would abandon every other
      // job in flight over one that is already being handled.
      logLine('error', {
        queue: name,
        jobId: job?.id,
        attempt: job?.attemptsMade,
        message: error.message,
      });
    });

    // 'error' is the connection, not a job: Redis unreachable, a dropped socket
    // mid-deploy. BullMQ re-emits it on the Worker, and an EventEmitter with no
    // listener for 'error' throws — which here would mean a Redis blip takes the
    // whole worker process down with it. ioredis reconnects on its own; this
    // just makes each attempt a line in the log.
    worker.on('error', (error: Error) => {
      logLine('error', { queue: name, message: `connection: ${error.message}` });
    });

    workers.push(worker);
  }

  logLine('info', {
    message: `Worker started with ${workers.length} queue(s).`,
    queues: workers.map((w) => w.name),
  });

  installShutdownHandlers(workers, connection);
}

/**
 * Drains in-flight jobs before exiting.
 *
 * `worker.close()` stops claiming new jobs and waits for the ones already running
 * to finish. Without it, a deploy would kill jobs mid-execution; BullMQ would
 * eventually reclaim them as stalled and retry, but a half-run job that already
 * wrote a thumbnail or deleted some objects would then run its side effects
 * twice. Waiting is cheaper than making every processor idempotent against a
 * failure mode that graceful shutdown removes entirely.
 */
function installShutdownHandlers(workers: Worker[], connection: Redis): void {
  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;

    logLine('info', { message: `${signal}: draining jobs.` });

    void Promise.all(workers.map((worker) => worker.close()))
      .then(() => connection.quit())
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        logLine('error', { message: `Unclean shutdown: ${String(error)}` });
        process.exit(1);
      });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrapWorker();
