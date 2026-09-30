import type { Job, Processor } from 'bullmq';
import type { Sql } from 'postgres';

import { QUEUE_NAMES } from '@/common/queue/queue.constants';
import { CONCURRENCY, buildProcessors, type WorkerStreams } from '@/workers/bootstrap';
import type { MediaStorage } from '@/workers/media.processor';
import { FailClosedPhotoScreening, type PhotoScreening } from '@/workers/photo-screening';

jest.mock('@/workers/media.processor', () => ({ processPhoto: jest.fn() }));

const { processPhoto } = jest.requireMock<{ processPhoto: jest.Mock }>(
  '@/workers/media.processor',
);

/**
 * The media queue's place in the worker (tasks.md T113; research D-12): the
 * processor is registered for `QUEUE_NAMES.media`, runs on the worker's
 * API-role connection with the object store and the screening port it was
 * given, and every job leaves one structured line in the log — the only trace
 * a successful job keeps, because a completed media job is removed at once.
 */
function sink() {
  const lines: string[] = [];
  const streams: WorkerStreams = {
    stdout: { write: (line) => void lines.push(`out ${line.trim()}`) },
    stderr: { write: (line) => void lines.push(`err ${line.trim()}`) },
  };
  return { lines, streams };
}

const PHOTO_ID = '66666666-6666-4666-8666-666666666666';
const sql = {} as Sql;
const storage = {} as MediaStorage;

function mediaProcessor(overrides: {
  storage?: MediaStorage;
  screening?: PhotoScreening;
}) {
  const { lines, streams } = sink();
  const processors = buildProcessors({
    sql,
    fetch: jest.fn(),
    fxRatesUrl: 'https://feed.example.test/latest/USD',
    streams,
    ...overrides,
  });
  return { processor: processors[QUEUE_NAMES.media] as Processor, lines };
}

describe('buildProcessors — the media queue', () => {
  beforeEach(() => processPhoto.mockReset());

  it('runs the media processor with the worker’s connection, bucket and screener, and logs the outcome', async () => {
    const screening = new FailClosedPhotoScreening();
    processPhoto.mockResolvedValueOnce({
      photoId: PHOTO_ID,
      outcome: 'processed',
      exif: 'not_needed',
      filed: true,
      moderationState: 'pending',
    });
    const { processor, lines } = mediaProcessor({ storage, screening });

    const result: unknown = await processor(
      { data: { photo_id: PHOTO_ID } } as Job,
      'token',
    );

    expect(processPhoto).toHaveBeenCalledWith(
      { photo_id: PHOTO_ID },
      { sql, storage, screening },
    );
    expect(result).toMatchObject({ outcome: 'processed' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^out /);
    expect(JSON.parse(lines[0]!.slice(4))).toEqual({
      level: 'info',
      queue: QUEUE_NAMES.media,
      photoId: PHOTO_ID,
      outcome: 'processed',
      exif: 'not_needed',
      filed: true,
      moderationState: 'pending',
    });
  });

  it('screens fail-closed when no screener is supplied', async () => {
    processPhoto.mockResolvedValueOnce({ photoId: PHOTO_ID, outcome: 'skipped' });
    const { processor } = mediaProcessor({ storage });

    await processor({ data: { photo_id: PHOTO_ID } } as Job, 'token');

    const [, deps] = processPhoto.mock.calls[0] as [unknown, { screening: unknown }];
    expect(deps.screening).toBeInstanceOf(FailClosedPhotoScreening);
  });

  it('fails the job, naming the wiring mistake, when built without object storage', async () => {
    const { processor, lines } = mediaProcessor({});

    await expect(
      processor({ data: { photo_id: PHOTO_ID } } as Job, 'token'),
    ).rejects.toThrow(/object storage/i);
    expect(processPhoto).not.toHaveBeenCalled();
    expect(lines).toEqual([]);
  });

  it('runs a handful of media jobs at once', () => {
    expect(CONCURRENCY[QUEUE_NAMES.media]).toBe(4);
  });
});
