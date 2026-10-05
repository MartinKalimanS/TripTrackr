import type { Job, Processor } from 'bullmq';

import {
  FX_REFRESH_SCHEDULER,
  QUEUE_NAMES,
  TOMBSTONE_PURGE_SCHEDULER,
  type QueueName,
} from '@/common/queue/queue.constants';
import {
  CONCURRENCY,
  bootstrapWorker,
  buildProcessors,
  ensureSchedulers,
  logLine,
  shutdownHandler,
  startWorkers,
  type QueueWorker,
  type SchedulerQueue,
  type WorkerStreams,
} from '@/workers/bootstrap';

jest.mock('@/workers/fx-refresh.processor', () => ({
  refreshFxRates: jest.fn(),
}));

jest.mock('@/workers/media.processor', () => ({ processPhoto: jest.fn() }));

jest.mock('@/workers/tombstone-purge.processor', () => ({ purgeTombstones: jest.fn() }));

jest.mock('bullmq', () => ({
  ...jest.requireActual<typeof import('bullmq')>('bullmq'),
  // Only the default factories construct a Queue or a Worker, and a real one
  // would dial Redis. Everything else in this file goes through the seams.
  Queue: jest.fn(),
  Worker: jest.fn(),
}));

// `bootstrapWorker` is the one function here that builds its own collaborators:
// the environment, the database pool and the object store. None of them may
// reach a network from a unit test, so each is replaced by a recording stand-in.
jest.mock('@/common/config/env.schema', () => ({ loadEnv: jest.fn() }));

jest.mock('@/common/storage/storage.service', () => ({ StorageService: jest.fn() }));

jest.mock('postgres', () => ({ __esModule: true, default: jest.fn() }));

const { refreshFxRates } = jest.requireMock<{ refreshFxRates: jest.Mock }>(
  '@/workers/fx-refresh.processor',
);

const { processPhoto } = jest.requireMock<{ processPhoto: jest.Mock }>(
  '@/workers/media.processor',
);

const { purgeTombstones } = jest.requireMock<{ purgeTombstones: jest.Mock }>(
  '@/workers/tombstone-purge.processor',
);

const { Queue, Worker } = jest.requireMock<{ Queue: jest.Mock; Worker: jest.Mock }>(
  'bullmq',
);

const { loadEnv } = jest.requireMock<{ loadEnv: jest.Mock }>(
  '@/common/config/env.schema',
);

const { StorageService } = jest.requireMock<{ StorageService: jest.Mock }>(
  '@/common/storage/storage.service',
);

const { default: postgres } = jest.requireMock<{ default: jest.Mock }>('postgres');

/**
 * The worker's plumbing (research D-12; T081): the processor registry, the
 * job scheduler that keeps the FX refresh daily (research D-28), the failure
 * and connection listeners that keep a Redis blip from taking the process
 * down, and the drain-then-exit shutdown.
 *
 * Every seam also has the default the real process runs with: log lines go to
 * the process streams (NDJSON, errors on stderr), and the scheduler is asserted
 * through a BullMQ Queue built on the worker's one shared connection. Those
 * defaults are pinned too — with the streams captured and the Queue
 * constructor replaced, so nothing prints and nothing dials Redis.
 */
function sink() {
  const lines: string[] = [];
  const streams: WorkerStreams = {
    stdout: { write: (line) => void lines.push(`out ${line.trim()}`) },
    stderr: { write: (line) => void lines.push(`err ${line.trim()}`) },
  };
  return { lines, streams };
}

/** What reaches the real process streams while `run` executes — captured, not printed. */
function captureProcessStreams(run: () => void): { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  const text = (chunk: string | Uint8Array) =>
    typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
  const spies = [
    jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        out.push(text(chunk));
        return true;
      }),
    jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        err.push(text(chunk));
        return true;
      }),
  ];

  try {
    run();
  } finally {
    spies.forEach((spy) => spy.mockRestore());
  }

  return { out, err };
}

describe('logLine', () => {
  it('writes NDJSON, info to stdout and error to stderr', () => {
    const { lines, streams } = sink();
    logLine('info', { message: 'hi' }, streams);
    logLine('error', { message: 'oh' }, streams);
    expect(lines).toEqual([
      'out {"level":"info","message":"hi"}',
      'err {"level":"error","message":"oh"}',
    ]);
  });

  it('defaults to the process streams — info on stdout, error on stderr', () => {
    const { out, err } = captureProcessStreams(() => {
      logLine('info', { message: 'hi' });
      logLine('error', { message: 'oh' });
    });

    expect(out).toEqual(['{"level":"info","message":"hi"}\n']);
    expect(err).toEqual(['{"level":"error","message":"oh"}\n']);
  });
});

describe('buildProcessors', () => {
  it('registers the FX refresh with the configured feed and logs its result', async () => {
    const { lines, streams } = sink();
    refreshFxRates.mockResolvedValueOnce({
      asOf: '2026-09-24',
      currencies: 3,
      backfilled: 1,
    });
    const sql = {} as never;
    const fetchFn = jest.fn() as unknown as typeof fetch;

    const processors = buildProcessors({
      sql,
      fetch: fetchFn,
      fxRatesUrl: 'https://feed.example.test/latest/USD',
      streams,
    });
    const processor = processors[QUEUE_NAMES.fxRefresh] as Processor;
    const result = await processor({} as Job, 'token');

    expect(refreshFxRates).toHaveBeenCalledWith({
      sql,
      fetch: fetchFn,
      url: 'https://feed.example.test/latest/USD',
    });
    expect(result).toEqual({ asOf: '2026-09-24', currencies: 3, backfilled: 1 });
    expect(lines[0]).toContain('"queue":"fx-refresh"');
    expect(lines[0]).toContain('"backfilled":1');
  });

  it('runs the FX refresh one at a time', () => {
    expect(CONCURRENCY[QUEUE_NAMES.fxRefresh]).toBe(1);
  });
});

describe('ensureSchedulers', () => {
  type Upsert = jest.Mock;

  function fakeQueue(upsert: Upsert = jest.fn().mockResolvedValue({ id: 'job' })) {
    const listeners: Record<string, (error: Error) => void> = {};
    const close = jest.fn().mockResolvedValue(undefined);
    const queue: SchedulerQueue = {
      on: (event, listener) => {
        listeners[event] = listener;
        return queue;
      },
      upsertJobScheduler: upsert as never,
      close,
    };
    return { queue, listeners, upsert, close };
  }

  /** One recording queue per queue name — what the real factory would build. */
  function fakeQueues(overrides: Partial<Record<QueueName, Upsert>> = {}) {
    const made = new Map<QueueName, ReturnType<typeof fakeQueue>>();
    const makeQueue = (name: QueueName): SchedulerQueue => {
      const fake = fakeQueue(overrides[name]);
      made.set(name, fake);
      return fake.queue;
    };
    const get = (name: QueueName) => {
      const fake = made.get(name);
      if (!fake) throw new Error(`No ${name} queue was built.`);
      return fake;
    };
    return { makeQueue, get, built: () => [...made.keys()] };
  }

  beforeEach(() => Queue.mockReset());

  it('upserts the daily FX scheduler by its fixed id, immediately, and closes the queue', async () => {
    const queues = fakeQueues();

    await ensureSchedulers({} as never, sink().streams, queues.makeQueue);

    const fx = queues.get(QUEUE_NAMES.fxRefresh);
    expect(fx.upsert).toHaveBeenCalledTimes(1);
    expect(fx.upsert).toHaveBeenCalledWith(
      FX_REFRESH_SCHEDULER.id,
      { every: 24 * 60 * 60 * 1_000, immediately: true },
      { name: 'refresh' },
    );
    expect(fx.close).toHaveBeenCalled();
  });

  it('upserts the daily tombstone purge by its fixed id on its own queue, not immediately, and closes the queue', async () => {
    const queues = fakeQueues();

    await ensureSchedulers({} as never, sink().streams, queues.makeQueue);

    const purge = queues.get(QUEUE_NAMES.tombstonePurge);
    expect(queues.built()).toEqual([QUEUE_NAMES.fxRefresh, QUEUE_NAMES.tombstonePurge]);
    expect(purge.upsert).toHaveBeenCalledTimes(1);
    expect(purge.upsert).toHaveBeenCalledWith(
      TOMBSTONE_PURGE_SCHEDULER.id,
      { every: 24 * 60 * 60 * 1_000 },
      { name: 'purge' },
    );
    // A fresh deployment has nothing old enough to purge, and BullMQ already
    // aligns an `every` schedule to the interval: no run is requested on boot.
    expect(purge.upsert.mock.calls[0]?.[1]).not.toHaveProperty('immediately');
    expect(purge.close).toHaveBeenCalled();
    // And each queue asserts only its own schedule.
    expect(queues.get(QUEUE_NAMES.fxRefresh).upsert).toHaveBeenCalledTimes(1);
    expect(TOMBSTONE_PURGE_SCHEDULER.id).not.toBe(FX_REFRESH_SCHEDULER.id);
  });

  it('closes the queue even when the upsert fails, and logs connection errors instead of throwing', async () => {
    const { lines, streams } = sink();
    const { queue, listeners, close } = fakeQueue(
      jest.fn().mockRejectedValue(new Error('redis down')),
    );

    await expect(ensureSchedulers({} as never, streams, () => queue)).rejects.toThrow(
      'redis down',
    );
    expect(close).toHaveBeenCalled();

    listeners.error?.(new Error('ECONNREFUSED'));
    expect(lines.at(-1)).toContain('scheduler: ECONNREFUSED');
  });

  it('still asserts the tombstone purge when the FX schedule cannot be asserted, then rejects', async () => {
    const queues = fakeQueues({
      [QUEUE_NAMES.fxRefresh]: jest
        .fn()
        .mockRejectedValue(new Error('fx upsert refused')),
    });

    await expect(
      ensureSchedulers({} as never, sink().streams, queues.makeQueue),
    ).rejects.toThrow('fx upsert refused');

    expect(queues.get(QUEUE_NAMES.tombstonePurge).upsert).toHaveBeenCalledWith(
      TOMBSTONE_PURGE_SCHEDULER.id,
      expect.anything(),
      expect.anything(),
    );
    expect(queues.get(QUEUE_NAMES.fxRefresh).close).toHaveBeenCalled();
    expect(queues.get(QUEUE_NAMES.tombstonePurge).close).toHaveBeenCalled();
  });

  it('still asserts the FX refresh when the tombstone purge cannot be asserted, then rejects', async () => {
    const queues = fakeQueues({
      [QUEUE_NAMES.tombstonePurge]: jest
        .fn()
        .mockRejectedValue(new Error('purge upsert refused')),
    });

    await expect(
      ensureSchedulers({} as never, sink().streams, queues.makeQueue),
    ).rejects.toThrow('purge upsert refused');

    expect(queues.get(QUEUE_NAMES.fxRefresh).upsert).toHaveBeenCalledTimes(1);
    expect(queues.get(QUEUE_NAMES.fxRefresh).close).toHaveBeenCalled();
    expect(queues.get(QUEUE_NAMES.tombstonePurge).close).toHaveBeenCalled();
  });

  it('reports every failure when both schedules fail', async () => {
    const queues = fakeQueues({
      [QUEUE_NAMES.fxRefresh]: jest
        .fn()
        .mockRejectedValue(new Error('fx upsert refused')),
      [QUEUE_NAMES.tombstonePurge]: jest
        .fn()
        .mockRejectedValue(new Error('purge upsert refused')),
    });

    const failure: unknown = await ensureSchedulers(
      {} as never,
      sink().streams,
      queues.makeQueue,
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain('fx upsert refused');
    expect((failure as Error).message).toContain('purge upsert refused');
  });

  it('gives each queue its own connection-error listener, logging the queue it belongs to', async () => {
    const { lines, streams } = sink();
    const queues = fakeQueues();

    await ensureSchedulers({} as never, streams, queues.makeQueue);

    queues.get(QUEUE_NAMES.fxRefresh).listeners.error?.(new Error('ECONNRESET'));
    queues.get(QUEUE_NAMES.tombstonePurge).listeners.error?.(new Error('ETIMEDOUT'));

    expect(lines).toEqual([
      'err {"level":"error","queue":"fx-refresh","message":"scheduler: ECONNRESET"}',
      'err {"level":"error","queue":"tombstone-purge","message":"scheduler: ETIMEDOUT"}',
    ]);
  });

  it('with no seams supplied, asserts both schedules through BullMQ Queues on the shared connection and logs their errors to stderr', async () => {
    const fx = fakeQueue();
    const purge = fakeQueue();
    Queue.mockImplementation((name: QueueName) =>
      name === QUEUE_NAMES.fxRefresh ? fx.queue : purge.queue,
    );
    const connection = { status: 'ready' } as never;

    await ensureSchedulers(connection);

    // Two queues, on the connection the workers already hold.
    expect(Queue).toHaveBeenCalledTimes(2);
    expect(Queue.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      QUEUE_NAMES.fxRefresh,
      QUEUE_NAMES.tombstonePurge,
    ]);
    for (const call of Queue.mock.calls as [string, { connection: unknown }][]) {
      expect(call[1].connection).toBe(connection);
    }
    expect(fx.upsert).toHaveBeenCalledWith(
      FX_REFRESH_SCHEDULER.id,
      { every: FX_REFRESH_SCHEDULER.everyMs, immediately: true },
      { name: 'refresh' },
    );
    expect(purge.upsert).toHaveBeenCalledWith(
      TOMBSTONE_PURGE_SCHEDULER.id,
      { every: TOMBSTONE_PURGE_SCHEDULER.everyMs },
      { name: 'purge' },
    );
    expect(fx.close).toHaveBeenCalled();
    expect(purge.close).toHaveBeenCalled();

    const { out, err } = captureProcessStreams(() => {
      fx.listeners.error?.(new Error('ECONNREFUSED'));
    });

    const line = JSON.stringify({
      level: 'error',
      queue: QUEUE_NAMES.fxRefresh,
      message: 'scheduler: ECONNREFUSED',
    });
    expect(out).toEqual([]);
    expect(err).toEqual([`${line}\n`]);
  });
});

describe('bootstrapWorker', () => {
  const DATABASE_URL = 'postgres://triptrackr_api@db.example.test/triptrackr';
  const FX_RATES_URL = 'https://feed.example.test/latest/USD';

  interface Started {
    readonly sql: { end: jest.Mock };
    readonly storage: object;
    readonly processors: Partial<Record<QueueName, Processor>>;
    readonly workerOptions: Partial<Record<QueueName, unknown>>;
    readonly upserts: Partial<Record<QueueName, jest.Mock>>;
    readonly connection: { quit: jest.Mock };
  }

  /** Boots the worker over stand-ins and lets its (unawaited) scheduler assertion settle. */
  async function start(): Promise<Started> {
    const sql = { end: jest.fn() };
    const storage = { removeObject: jest.fn(), deleteObject: jest.fn() };
    const processors: Partial<Record<QueueName, Processor>> = {};
    const workerOptions: Partial<Record<QueueName, unknown>> = {};
    const upserts: Partial<Record<QueueName, jest.Mock>> = {};
    const connection = { quit: jest.fn() };

    loadEnv.mockReturnValue({ DATABASE_URL, FX_RATES_URL });
    postgres.mockReturnValue(sql);
    StorageService.mockImplementation(() => storage);
    Worker.mockImplementation(
      (name: QueueName, processor: Processor, options: unknown) => {
        processors[name] = processor;
        workerOptions[name] = options;
        return { name, on: jest.fn(), close: jest.fn() };
      },
    );
    Queue.mockImplementation((name: QueueName) => {
      const upsert = jest.fn().mockResolvedValue({ id: 'job' });
      upserts[name] = upsert;
      return { on: jest.fn(), upsertJobScheduler: upsert, close: jest.fn() };
    });
    jest.spyOn(process, 'on').mockImplementation(() => process);

    const printed = captureProcessStreams(() => bootstrapWorker(connection as never));
    await new Promise((resolve) => setImmediate(resolve));

    expect(printed.err).toEqual([]);
    return { sql, storage, processors, workerOptions, upserts, connection };
  }

  beforeEach(() => {
    for (const mock of [Queue, Worker, loadEnv, postgres, StorageService]) {
      mock.mockReset();
    }
    purgeTombstones.mockReset();
    processPhoto.mockReset();
  });

  afterEach(() => jest.restoreAllMocks());

  it('connects as the API role over the validated environment, with one object store', async () => {
    const started = await start();

    expect(postgres).toHaveBeenCalledWith(
      DATABASE_URL,
      expect.objectContaining({ max: 4 }),
    );
    expect(StorageService).toHaveBeenCalledTimes(1);
    expect(started.processors).toEqual({
      [QUEUE_NAMES.fxRefresh]: expect.any(Function),
      [QUEUE_NAMES.media]: expect.any(Function),
      [QUEUE_NAMES.tombstonePurge]: expect.any(Function),
    });
  });

  it('starts a tombstone-purge worker that runs one job at a time on the shared connection', async () => {
    const started = await start();

    expect(started.workerOptions[QUEUE_NAMES.tombstonePurge]).toEqual({
      connection: started.connection,
      concurrency: CONCURRENCY[QUEUE_NAMES.tombstonePurge],
    });
  });

  it('hands the purge the very store the media worker uses, and the worker’s own connection', async () => {
    const started = await start();
    purgeTombstones.mockResolvedValueOnce({
      retentionDays: 90,
      objectsRemoved: 0,
      purged: {},
    });
    processPhoto.mockResolvedValueOnce({ photoId: 'p', outcome: 'skipped' });
    // Both jobs log through the process streams, which `bootstrapWorker` fixes.
    const stdout = jest.spyOn(process.stdout, 'write').mockReturnValue(true);

    await (started.processors[QUEUE_NAMES.tombstonePurge] as Processor)({} as Job, 't');
    await (started.processors[QUEUE_NAMES.media] as Processor)(
      { data: { photo_id: 'p' } } as Job,
      't',
    );

    expect(stdout).toHaveBeenCalledTimes(2);

    const [purgeDeps] = purgeTombstones.mock.calls[0] as [
      { sql: unknown; storage: unknown },
    ];
    const [, mediaDeps] = processPhoto.mock.calls[0] as [unknown, { storage: unknown }];
    expect(purgeDeps.storage).toBe(started.storage);
    expect(purgeDeps.storage).toBe(mediaDeps.storage);
    expect(purgeDeps.sql).toBe(started.sql);
  });

  it('asserts both daily schedules on boot', async () => {
    const started = await start();

    expect(started.upserts[QUEUE_NAMES.fxRefresh]).toHaveBeenCalledWith(
      FX_REFRESH_SCHEDULER.id,
      expect.objectContaining({ immediately: true }),
      expect.anything(),
    );
    expect(started.upserts[QUEUE_NAMES.tombstonePurge]).toHaveBeenCalledWith(
      TOMBSTONE_PURGE_SCHEDULER.id,
      { every: TOMBSTONE_PURGE_SCHEDULER.everyMs },
      expect.anything(),
    );
  });
});

describe('startWorkers', () => {
  function fakeWorker(
    name: string,
  ): QueueWorker & { emit: (event: string, ...args: unknown[]) => void } {
    const listeners: Record<string, (...args: never[]) => void> = {};
    return {
      name,
      on: jest.fn((event: string, listener: (...args: never[]) => void) => {
        listeners[event] = listener;
      }) as never,
      close: jest.fn().mockResolvedValue(undefined),
      emit: (event, ...args) =>
        (listeners[event] as (...a: unknown[]) => void)?.(...args),
    };
  }

  it('builds one worker per processor with its concurrency, and turns failures into log lines', () => {
    const { lines, streams } = sink();
    const made: ReturnType<typeof fakeWorker>[] = [];
    const processor: Processor = () => Promise.resolve(undefined);

    const workers = startWorkers(
      { [QUEUE_NAMES.fxRefresh]: processor },
      (name, _processor, concurrency) => {
        expect(concurrency).toBe(CONCURRENCY[name]);
        const worker = fakeWorker(name);
        made.push(worker);
        return worker;
      },
      streams,
    );

    expect(workers.map((w) => w.name)).toEqual([QUEUE_NAMES.fxRefresh]);
    made[0]!.emit('failed', { id: '7', attemptsMade: 2 }, new Error('feed 503'));
    made[0]!.emit('error', new Error('socket closed'));
    expect(lines[0]).toContain('"jobId":"7"');
    expect(lines[0]).toContain('feed 503');
    expect(lines[1]).toContain('connection: socket closed');
  });

  it('defaults its failure and connection lines to stderr', () => {
    const made: ReturnType<typeof fakeWorker>[] = [];
    const processor: Processor = () => Promise.resolve(undefined);
    startWorkers({ [QUEUE_NAMES.fxRefresh]: processor }, (name) => {
      const worker = fakeWorker(name);
      made.push(worker);
      return worker;
    });

    const { out, err } = captureProcessStreams(() => {
      made[0]?.emit('failed', { id: '9', attemptsMade: 1 }, new Error('feed 503'));
      made[0]?.emit('error', new Error('socket closed'));
    });

    expect(out).toEqual([]);
    expect(err).toHaveLength(2);
    expect(err[0]).toContain('"jobId":"9"');
    expect(err[0]).toContain('feed 503');
    expect(err[1]).toContain('connection: socket closed');
  });
});

describe('shutdownHandler', () => {
  it('drains the workers, closes both connections, and exits 0 — once', async () => {
    const { lines, streams } = sink();
    const worker = {
      name: 'q',
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const connection = { quit: jest.fn().mockResolvedValue('OK') };
    const sql = { end: jest.fn().mockResolvedValue(undefined) };
    const exit = jest.fn();

    const shutdown = shutdownHandler({
      workers: [worker],
      connection,
      sql,
      exit,
      streams,
    });
    await shutdown('SIGTERM');
    await shutdown('SIGINT');

    expect(worker.close).toHaveBeenCalledTimes(1);
    expect(connection.quit).toHaveBeenCalledTimes(1);
    expect(sql.end).toHaveBeenCalledWith({ timeout: 5 });
    expect(exit).toHaveBeenCalledWith(0);
    expect(lines[0]).toContain('SIGTERM: draining jobs.');
  });

  it('exits 1 and says so when the drain fails', async () => {
    const { lines, streams } = sink();
    const worker = {
      name: 'q',
      on: jest.fn(),
      close: jest.fn().mockRejectedValue(new Error('stuck')),
    };
    const exit = jest.fn();

    await shutdownHandler({
      workers: [worker],
      connection: { quit: jest.fn() },
      sql: { end: jest.fn() },
      exit,
      streams,
    })('SIGTERM');

    expect(exit).toHaveBeenCalledWith(1);
    expect(lines.at(-1)).toContain('Unclean shutdown');
  });
});
