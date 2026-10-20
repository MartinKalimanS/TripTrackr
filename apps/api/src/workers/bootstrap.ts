import { Queue, Worker, type Job, type Processor } from 'bullmq';
import type Redis from 'ioredis';
import postgres, { type Sql } from 'postgres';

import { loadEnv } from '@/common/config/env.schema';
import {
  FX_REFRESH_SCHEDULER,
  QUEUE_NAMES,
  TOMBSTONE_PURGE_SCHEDULER,
  type QueueName,
} from '@/common/queue/queue.constants';
import { StorageService } from '@/common/storage/storage.service';

import { refreshFxRates } from './fx-refresh.processor';
import { processPhoto, type MediaStorage } from './media.processor';
import { FailClosedPhotoScreening, type PhotoScreening } from './photo-screening';
import { purgeTombstones, type PurgeStorage } from './tombstone-purge.processor';

/**
 * Everything the worker process is made of, apart from starting it — so that
 * each piece can be exercised under Jest with a fake queue and a fake
 * database, which `main.ts` (the entrypoint that calls `bootstrapWorker()`
 * at import time) cannot be.
 *
 * Processors register in {@link buildProcessors} as their phases land: FX
 * refresh (T081), media (T113), tombstone purge (T129), storage sweep (T188),
 * account export (FR-007).
 *
 * The database connection is the API role's (`DATABASE_URL`), exactly as the
 * API's own pool — never the owner (research D-20). A processor that must
 * touch a policed table without a traveller identity goes through a SECURITY
 * DEFINER keyhole (the FX backfill, 0009; the media worker, 0012), which is the
 * same rule the request path follows for registration.
 */

/** Where a log line goes; injectable so a test can read it. */
export interface LogSink {
  write(line: string): void;
}

export interface WorkerStreams {
  readonly stdout: LogSink;
  readonly stderr: LogSink;
}

const processStreams: WorkerStreams = {
  stdout: { write: (line) => process.stdout.write(line) },
  stderr: { write: (line) => process.stderr.write(line) },
};

/**
 * Writes one structured line.
 *
 * `console.log` is banned by lint in favour of the Pino logger (T031), but that
 * logger is bound to the Nest application, and this process never builds one.
 * Emitting the same NDJSON shape by hand keeps the worker's output readable by
 * the same log pipeline as the API's.
 */
export function logLine(
  level: 'info' | 'error',
  fields: Record<string, unknown>,
  streams: WorkerStreams = processStreams,
): void {
  const stream = level === 'error' ? streams.stderr : streams.stdout;
  stream.write(`${JSON.stringify({ level, ...fields })}\n`);
}

/** How many jobs of a given queue one worker process runs at once. */
export const CONCURRENCY: Readonly<Record<QueueName, number>> = {
  // Image decode and moderation are CPU- and network-bound in roughly equal
  // measure; a handful in flight keeps both busy without thrashing.
  [QUEUE_NAMES.media]: 4,
  // Maintenance jobs take row locks and delete in bulk. Running several at once
  // would have them contend for the same rows to no benefit — these are throughput
  // -indifferent and correctness-sensitive, so they run one at a time.
  [QUEUE_NAMES.tombstonePurge]: 1,
  [QUEUE_NAMES.storageSweep]: 1,
  [QUEUE_NAMES.accountExport]: 2,
  // One snapshot a day; two at once would race on the same upserts.
  [QUEUE_NAMES.fxRefresh]: 1,
};

export interface ProcessorDeps {
  readonly sql: Sql;
  readonly fetch: typeof fetch;
  readonly fxRatesUrl: string;
  /**
   * The object store the media worker reads originals from and writes
   * thumbnails to (T113). `bootstrapWorker` always supplies it; a registry
   * built without one fails every media job, loudly, rather than letting the
   * queue fill with jobs nothing can run.
   */
  readonly storage?: MediaStorage;
  /**
   * The object store as the tombstone purge removes from it (T129): the strict
   * `removeObject`, which throws where `deleteObject` — part of
   * {@link MediaStorage} — logs and carries on. `bootstrapWorker` passes the
   * same `StorageService` for both; a registry built without it fails every
   * purge job, loudly, rather than deleting rows whose bytes it cannot remove.
   */
  readonly purgeStorage?: PurgeStorage;
  /** Photo screening (research D-34); the fail-closed port when absent. */
  readonly screening?: PhotoScreening;
  readonly streams?: WorkerStreams;
}

/**
 * The registry. A queue with no processor simply accumulates jobs rather than
 * failing them, so enqueueing before a consumer exists is safe.
 */
export function buildProcessors(
  deps: ProcessorDeps,
): Partial<Record<QueueName, Processor>> {
  const screening = deps.screening ?? new FailClosedPhotoScreening();

  return {
    [QUEUE_NAMES.fxRefresh]: async () => {
      const result = await refreshFxRates({
        sql: deps.sql,
        fetch: deps.fetch,
        url: deps.fxRatesUrl,
      });
      logLine('info', { queue: QUEUE_NAMES.fxRefresh, ...result }, deps.streams);
      return result;
    },
    [QUEUE_NAMES.media]: async (job) => {
      if (!deps.storage) {
        throw new Error(
          'The media processor was built without object storage; bootstrapWorker supplies it.',
        );
      }
      const result = await processPhoto(job.data, {
        sql: deps.sql,
        storage: deps.storage,
        screening,
      });
      // The only trace a finished media job leaves: the job itself is removed
      // on completion (modules/photos/media-job.producer.ts).
      logLine('info', { queue: QUEUE_NAMES.media, ...result }, deps.streams);
      return result;
    },
    [QUEUE_NAMES.tombstonePurge]: async () => {
      if (!deps.purgeStorage) {
        throw new Error(
          'The tombstone purge was built without object removal; bootstrapWorker supplies it.',
        );
      }
      const result = await purgeTombstones({ sql: deps.sql, storage: deps.purgeStorage });
      // Counts only: the purge never writes a key, an id or a traveller to a log.
      logLine('info', { queue: QUEUE_NAMES.tombstonePurge, ...result }, deps.streams);
      return result;
    },
  };
}

/**
 * The API role's connection for processors. Small: a worker runs a handful of
 * jobs at once and none of them holds a connection across a network call.
 */
export function createWorkerDatabase(databaseUrl: string): Sql {
  return postgres(databaseUrl, {
    max: 4,
    prepare: false,
    idle_timeout: 30,
    connect_timeout: 10,
    connection: { application_name: 'triptrackr-worker' },
  });
}

/** The subset of a BullMQ `Queue` the scheduler assertion uses — a seam for tests. */
export interface SchedulerQueue {
  on(event: 'error', listener: (error: Error) => void): unknown;
  upsertJobScheduler: Queue['upsertJobScheduler'];
  close(): Promise<void>;
}

/** One recurring job: the queue it runs on, and the scheduler that keeps it running. */
interface Schedule {
  readonly queue: QueueName;
  readonly assert: (queue: SchedulerQueue) => Promise<unknown>;
}

const SCHEDULES: readonly Schedule[] = [
  {
    queue: QUEUE_NAMES.fxRefresh,
    // `immediately` gives a fresh deployment rates on first boot.
    assert: (queue) =>
      queue.upsertJobScheduler(
        FX_REFRESH_SCHEDULER.id,
        { every: FX_REFRESH_SCHEDULER.everyMs, immediately: true },
        { name: 'refresh' },
      ),
  },
  {
    queue: QUEUE_NAMES.tombstonePurge,
    // No `immediately`: a fresh deployment has nothing old enough to purge
    // (queue.constants.ts), so the first run is the next interval boundary.
    assert: (queue) =>
      queue.upsertJobScheduler(
        TOMBSTONE_PURGE_SCHEDULER.id,
        { every: TOMBSTONE_PURGE_SCHEDULER.everyMs },
        { name: 'purge' },
      ),
  },
];

async function assertSchedule(
  schedule: Schedule,
  streams: WorkerStreams,
  makeQueue: (name: QueueName) => SchedulerQueue,
): Promise<void> {
  // Built here rather than through `createQueue`: that helper logs through
  // the Nest Logger, and this process has no Nest application to bind it to.
  const queue = makeQueue(schedule.queue);
  queue.on('error', (error: Error) => {
    logLine(
      'error',
      { queue: schedule.queue, message: `scheduler: ${error.message}` },
      streams,
    );
  });

  try {
    await schedule.assert(queue);
  } finally {
    await queue.close();
  }
}

/**
 * Makes sure the recurring jobs exist. `upsertJobScheduler` is idempotent by
 * id, so every worker start re-asserts the same schedules and never creates a
 * second one.
 *
 * Each schedule is asserted whatever became of the one before it, so that a
 * failure on one queue cannot leave another without its job; the function
 * still rejects afterwards, naming every schedule that failed, so the caller
 * logs it and the next start retries.
 */
export async function ensureSchedulers(
  connection: Redis,
  streams: WorkerStreams = processStreams,
  makeQueue: (name: QueueName) => SchedulerQueue = (name) =>
    new Queue(name, { connection }),
): Promise<void> {
  const failures: Error[] = [];

  for (const schedule of SCHEDULES) {
    try {
      await assertSchedule(schedule, streams, makeQueue);
    } catch (error: unknown) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      failures.map((failure) => failure.message).join('; '),
    );
  }
}

/** The subset of a BullMQ `Worker` the bootstrap touches — a seam for tests. */
export interface QueueWorker {
  readonly name: string;
  on(event: 'failed', listener: (job: Job | undefined, error: Error) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  close(): Promise<void>;
}

export type WorkerFactory = (
  name: QueueName,
  processor: Processor,
  concurrency: number,
) => QueueWorker;

/** One BullMQ worker per registered processor, with its failure and connection listeners. */
export function startWorkers(
  processors: Partial<Record<QueueName, Processor>>,
  makeWorker: WorkerFactory,
  streams: WorkerStreams = processStreams,
): QueueWorker[] {
  const workers: QueueWorker[] = [];

  for (const [name, processor] of Object.entries(processors) as [
    QueueName,
    Processor,
  ][]) {
    const worker = makeWorker(name, processor, CONCURRENCY[name]);

    worker.on('failed', (job: Job | undefined, error: Error) => {
      // Logged rather than rethrown: BullMQ has already recorded the attempt and
      // scheduled the retry, and crashing the process would abandon every other
      // job in flight over one that is already being handled.
      logLine(
        'error',
        {
          queue: name,
          jobId: job?.id,
          attempt: job?.attemptsMade,
          message: error.message,
        },
        streams,
      );
    });

    // 'error' is the connection, not a job: Redis unreachable, a dropped socket
    // mid-deploy. BullMQ re-emits it on the Worker, and an EventEmitter with no
    // listener for 'error' throws — which here would mean a Redis blip takes the
    // whole worker process down with it. ioredis reconnects on its own; this
    // just makes each attempt a line in the log.
    worker.on('error', (error: Error) => {
      logLine('error', { queue: name, message: `connection: ${error.message}` }, streams);
    });

    workers.push(worker);
  }

  return workers;
}

export interface ShutdownDeps {
  readonly workers: readonly QueueWorker[];
  readonly connection: Pick<Redis, 'quit'>;
  readonly sql: Pick<Sql, 'end'>;
  readonly exit: (code: number) => void;
  readonly streams?: WorkerStreams;
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
export function shutdownHandler(deps: ShutdownDeps): (signal: string) => Promise<void> {
  let shuttingDown = false;

  return async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    logLine('info', { message: `${signal}: draining jobs.` }, deps.streams);

    try {
      await Promise.all(deps.workers.map((worker) => worker.close()));
      await Promise.all([deps.connection.quit(), deps.sql.end({ timeout: 5 })]);
      deps.exit(0);
    } catch (error: unknown) {
      logLine('error', { message: `Unclean shutdown: ${String(error)}` }, deps.streams);
      deps.exit(1);
    }
  };
}

/** Real BullMQ workers over the shared connection. */
export function bullWorkerFactory(connection: Redis): WorkerFactory {
  return (name, processor, concurrency) =>
    new Worker(name, processor, { connection, concurrency });
}

/** Validates the environment, starts every worker, asserts the schedulers, and installs the signal handlers. */
export function bootstrapWorker(connection: Redis): void {
  // Validates every secret before a single job is claimed. A worker that boots
  // and then fails on its first job has already marked that job as attempted.
  const env = loadEnv();
  const sql = createWorkerDatabase(env.DATABASE_URL);

  // Reads the S3_* variables loadEnv() has just validated. One instance for
  // both roles it plays: the media worker's best-effort store and the purge's
  // strict `removeObject`.
  const storage = new StorageService();

  const workers = startWorkers(
    buildProcessors({
      sql,
      fetch,
      fxRatesUrl: env.FX_RATES_URL,
      storage,
      purgeStorage: storage,
      screening: new FailClosedPhotoScreening(),
    }),
    bullWorkerFactory(connection),
  );

  logLine('info', {
    message: `Worker started with ${workers.length} queue(s).`,
    queues: workers.map((w) => w.name),
  });

  // A scheduler that cannot be asserted (Redis down at boot) is logged and
  // retried on the next start; the workers above still drain whatever is
  // already queued, and ioredis reconnects on its own.
  ensureSchedulers(connection).catch((error: unknown) => {
    logLine('error', { message: `Could not assert job schedulers: ${String(error)}` });
  });

  const shutdown = shutdownHandler({
    workers,
    connection,
    sql,
    exit: (code) => process.exit(code),
  });
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}
