import type { Job, Processor } from 'bullmq';
import type { Sql } from 'postgres';

import { QUEUE_NAMES } from '@/common/queue/queue.constants';
import { CONCURRENCY, buildProcessors, type WorkerStreams } from '@/workers/bootstrap';
import type { PurgeStorage } from '@/workers/tombstone-purge.processor';

jest.mock('@/workers/tombstone-purge.processor', () => ({ purgeTombstones: jest.fn() }));

const { purgeTombstones } = jest.requireMock<{ purgeTombstones: jest.Mock }>(
  '@/workers/tombstone-purge.processor',
);

/**
 * The tombstone-purge queue's place in the worker (tasks.md T129;
 * sync-protocol.md §5; Constitution V): the processor is registered for
 * `QUEUE_NAMES.tombstonePurge`, runs on the worker's API-role connection with
 * the removal-capable object store it was given, and each run leaves one
 * structured line — counts only, because the purge handles keys and ids that
 * belong to travellers and a log is the one place they must never end up.
 */
function sink() {
  const lines: string[] = [];
  const streams: WorkerStreams = {
    stdout: { write: (line) => void lines.push(`out ${line.trim()}`) },
    stderr: { write: (line) => void lines.push(`err ${line.trim()}`) },
  };
  return { lines, streams };
}

const sql = {} as Sql;
const purgeStorage: PurgeStorage = { removeObject: jest.fn() };

function purgeProcessor(overrides: { purgeStorage?: PurgeStorage }) {
  const { lines, streams } = sink();
  const processors = buildProcessors({
    sql,
    fetch: jest.fn(),
    fxRatesUrl: 'https://feed.example.test/latest/USD',
    streams,
    ...overrides,
  });
  return { processor: processors[QUEUE_NAMES.tombstonePurge] as Processor, lines };
}

describe('buildProcessors — the tombstone-purge queue', () => {
  beforeEach(() => purgeTombstones.mockReset());

  it('registers a processor for the queue, alongside the FX refresh', () => {
    const processors = buildProcessors({
      sql,
      fetch: jest.fn(),
      fxRatesUrl: 'https://feed.example.test/latest/USD',
      purgeStorage,
    });

    expect(Object.keys(processors)).toEqual(
      expect.arrayContaining([QUEUE_NAMES.tombstonePurge, QUEUE_NAMES.fxRefresh]),
    );
  });

  it('runs the purge with the worker’s connection and the store it was given, and returns the counts', async () => {
    const counts = {
      retentionDays: 90,
      objectsRemoved: 3,
      purged: { photos: 1, trips: 1 },
    };
    purgeTombstones.mockResolvedValueOnce(counts);
    const { processor } = purgeProcessor({ purgeStorage });

    const result: unknown = await processor({} as Job, 'token');

    expect(purgeTombstones).toHaveBeenCalledTimes(1);
    expect(purgeTombstones).toHaveBeenCalledWith({ sql, storage: purgeStorage });
    expect(result).toEqual(counts);
  });

  it('logs one line per run: the counts, under the queue name, and nothing else', async () => {
    purgeTombstones.mockResolvedValueOnce({
      retentionDays: 90,
      objectsRemoved: 3,
      purged: { photos: 1, trips: 1 },
    });
    const { processor, lines } = purgeProcessor({ purgeStorage });

    await processor({} as Job, 'token');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^out /);
    expect(JSON.parse(lines[0]!.slice(4))).toEqual({
      level: 'info',
      queue: QUEUE_NAMES.tombstonePurge,
      retentionDays: 90,
      objectsRemoved: 3,
      purged: { photos: 1, trips: 1 },
    });
  });

  it('never writes an object key, an id or a bucket to the log, whatever the purge handled', async () => {
    const secretKey = '11111111-1111-4111-8111-111111111111/passport-scan';
    const actual = jest.requireActual<
      typeof import('@/workers/tombstone-purge.processor')
    >('@/workers/tombstone-purge.processor');
    purgeTombstones.mockImplementationOnce(actual.purgeTombstones);
    const tx = (strings: TemplateStringsArray) =>
      Promise.resolve(
        strings.join('?').includes('tombstone_purge_objects')
          ? [{ bucket: 'documents', object_key: secretKey }]
          : [{ table_name: 'documents', purged: '1' }],
      );
    const scripted = Object.assign(tx, {
      begin: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    }) as unknown as Sql;
    const removed: string[] = [];
    const store: PurgeStorage = {
      removeObject: (bucket, key) => {
        removed.push(`${bucket}/${key}`);
        return Promise.resolve();
      },
    };
    const { lines, streams } = sink();
    const processor = buildProcessors({
      sql: scripted,
      fetch: jest.fn(),
      fxRatesUrl: 'https://feed.example.test/latest/USD',
      purgeStorage: store,
      streams,
    })[QUEUE_NAMES.tombstonePurge] as Processor;

    await processor({} as Job, 'token');

    // The key really did pass through the purge …
    expect(removed).toEqual([`documents/${secretKey}`]);
    // … and the one line it left carries the counts alone.
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain(secretKey);
    expect(lines[0]).not.toContain('passport');
    expect(lines[0]).not.toContain('11111111');
    expect(JSON.parse(lines[0]!.slice(4))).toEqual({
      level: 'info',
      queue: QUEUE_NAMES.tombstonePurge,
      retentionDays: 90,
      objectsRemoved: 1,
      purged: { documents: 1 },
    });
  });

  it('fails the job, naming the wiring mistake, when built without object removal', async () => {
    const { processor, lines } = purgeProcessor({});

    await expect(processor({} as Job, 'token')).rejects.toThrow(/object removal/i);
    expect(purgeTombstones).not.toHaveBeenCalled();
    expect(lines).toEqual([]);
  });

  it('lets a failed purge fail the job, so BullMQ retries, and logs no success line', async () => {
    purgeTombstones.mockRejectedValueOnce(new Error('the store refused the delete'));
    const { processor, lines } = purgeProcessor({ purgeStorage });

    await expect(processor({} as Job, 'token')).rejects.toThrow('the store refused');
    expect(lines).toEqual([]);
  });

  it('runs one purge at a time', () => {
    expect(CONCURRENCY[QUEUE_NAMES.tombstonePurge]).toBe(1);
  });
});
