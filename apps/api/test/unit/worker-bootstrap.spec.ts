import type { Job, Processor } from 'bullmq';

import { FX_REFRESH_SCHEDULER, QUEUE_NAMES } from '@/common/queue/queue.constants';
import {
  CONCURRENCY,
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

jest.mock('bullmq', () => ({
  ...jest.requireActual<typeof import('bullmq')>('bullmq'),
  // Only the default scheduler factory constructs a Queue, and a real one
  // would dial Redis. Everything else in this file goes through the seams.
  Queue: jest.fn(),
}));

const { refreshFxRates } = jest.requireMock<{ refreshFxRates: jest.Mock }>(
  '@/workers/fx-refresh.processor',
);

const { Queue } = jest.requireMock<{ Queue: jest.Mock }>('bullmq');

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
  function fakeQueue(upsert: jest.Mock = jest.fn().mockResolvedValue({ id: 'job' })) {
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

  it('upserts the daily FX scheduler by its fixed id, immediately, and closes the queue', async () => {
    const { queue, upsert, close } = fakeQueue();

    await ensureSchedulers({} as never, sink().streams, () => queue);

    expect(upsert).toHaveBeenCalledWith(
      FX_REFRESH_SCHEDULER.id,
      { every: 24 * 60 * 60 * 1_000, immediately: true },
      { name: 'refresh' },
    );
    expect(close).toHaveBeenCalled();
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

  it('with no seams supplied, asserts the schedule through a BullMQ Queue on the shared connection and logs its errors to stderr', async () => {
    const { queue, listeners, upsert, close } = fakeQueue();
    Queue.mockImplementationOnce(() => queue);
    const connection = { status: 'ready' } as never;

    await ensureSchedulers(connection);

    // One queue, for the FX refresh, on the connection the workers already hold.
    expect(Queue).toHaveBeenCalledTimes(1);
    expect(Queue.mock.calls[0]?.[0]).toBe(QUEUE_NAMES.fxRefresh);
    expect(Queue.mock.calls[0]?.[1]?.connection).toBe(connection);
    expect(upsert).toHaveBeenCalledWith(
      FX_REFRESH_SCHEDULER.id,
      { every: FX_REFRESH_SCHEDULER.everyMs, immediately: true },
      { name: 'refresh' },
    );
    expect(close).toHaveBeenCalled();

    const { out, err } = captureProcessStreams(() => {
      listeners.error?.(new Error('ECONNREFUSED'));
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
