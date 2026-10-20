import { HttpException, HttpStatus, Logger } from '@nestjs/common';

import { MEDIA_JOB } from '@/modules/photos/media-job';
import {
  ENQUEUE_TIMEOUT_MS,
  MediaJobProducer,
  type MediaQueue,
} from '@/modules/photos/media-job.producer';

/**
 * The registration's hand-off to the media worker (tasks.md T112, T113;
 * research D-12).
 *
 * Three properties matter:
 *
 *   - the job names the photo and nothing else, is keyed by it, and waits a
 *     moment before it may run — the registration's transaction commits after
 *     the handler returns, and a worker that ran first would find no photo;
 *   - a completed job is removed at once, so a registration rolled back after
 *     its enqueue and then retried is not shadowed by the finished job's id;
 *   - a queue that refuses, or does not answer, costs the traveller a 503 —
 *     never a registration that waits on Redis while holding a database
 *     connection, and never a photo registered with no job behind it.
 */
const PHOTO_ID = '66666666-6666-4666-8666-666666666666';

const unavailable = {
  error: {
    code: 'PHOTO_REGISTRATION_UNAVAILABLE',
    message: 'Photos cannot be saved right now. Please try again in a moment.',
  },
};

async function refusal(
  call: Promise<unknown>,
): Promise<{ status: number; body: unknown }> {
  const outcome: unknown = await call.then(
    () => new Error('Expected a refusal, but the call succeeded.'),
    (error: unknown) => error,
  );
  if (!(outcome instanceof HttpException)) throw outcome;
  return { status: outcome.getStatus(), body: outcome.getResponse() };
}

describe('MediaJobProducer', () => {
  let logged: jest.SpiedFunction<Logger['error']>;

  beforeEach(() => {
    logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
    jest.useRealTimers();
  });

  it('enqueues { photo_id } under the media job’s name, keyed by the photo, delayed, removed on completion', async () => {
    const add = jest.fn<ReturnType<MediaQueue['add']>, Parameters<MediaQueue['add']>>(
      () => Promise.resolve({ id: PHOTO_ID }),
    );

    await new MediaJobProducer({ add }).enqueue(PHOTO_ID);

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      MEDIA_JOB.name,
      { photo_id: PHOTO_ID },
      { jobId: PHOTO_ID, delay: MEDIA_JOB.delayMs, removeOnComplete: true },
    );
    expect(MEDIA_JOB.delayMs).toBeGreaterThan(0);
  });

  it('answers 503 PHOTO_REGISTRATION_UNAVAILABLE when the queue refuses, and logs why', async () => {
    const producer = new MediaJobProducer({
      add: () => Promise.reject(new Error('OOM command not allowed')),
    });

    const { status, body } = await refusal(producer.enqueue(PHOTO_ID));

    expect(status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(body).toEqual(unavailable);
    expect(JSON.stringify(body)).not.toMatch(/OOM|redis/i);
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('OOM command not allowed'),
    );
  });

  it('answers the same 503 when the queue does not answer in time', async () => {
    jest.useFakeTimers();
    const producer = new MediaJobProducer({ add: () => new Promise(() => undefined) });

    const pending = refusal(producer.enqueue(PHOTO_ID));
    await jest.advanceTimersByTimeAsync(ENQUEUE_TIMEOUT_MS);
    const { status, body } = await pending;

    expect(status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(body).toEqual(unavailable);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining(`${ENQUEUE_TIMEOUT_MS}`));
  });

  it('leaves no timer running once the job is enqueued', async () => {
    jest.useFakeTimers();

    await new MediaJobProducer({ add: () => Promise.resolve({}) }).enqueue(PHOTO_ID);

    expect(jest.getTimerCount()).toBe(0);
  });
});
