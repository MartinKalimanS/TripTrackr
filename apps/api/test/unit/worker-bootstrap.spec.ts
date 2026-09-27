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

const { refreshFxRates } = jest.requireMock<{ refreshFxRates: jest.Mock }>(
  '@/workers/fx-refresh.processor',
);

/**
 * The worker's plumbing (research D-12; T081): the processor registry, the
 * job scheduler that keeps the FX refresh daily (research D-28), the failure
 * and connection listeners that keep a Redis blip from taking the process
 * down, and the drain-then-exit shutdown.
 */
function sink() {
  const lines: string[] = [];
  const streams: WorkerStreams = {
    stdout: { write: (line) => void lines.push(`out ${line.trim()}`) },
    stderr: { write: (line) => void lines.push(`err ${line.trim()}`) },
  };
  return { lines, streams };
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
