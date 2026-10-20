import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { JobsOptions } from 'bullmq';

import { apiError } from '@/common/errors/api-error';
import { QUEUE_NAMES, queueToken } from '@/common/queue/queue.constants';

import { MEDIA_JOB, type MediaJobData } from './media-job';

/** The part of a BullMQ `Queue` the producer uses — a seam for tests. */
export interface MediaQueue {
  add(name: string, data: MediaJobData, opts: JobsOptions): Promise<unknown>;
}

/**
 * How long a registration waits for Redis to take its job. The Bull connection
 * queues commands while Redis is away rather than failing them
 * (queue.module.ts), and a registration waiting on it holds its request's
 * database connection the whole time — twenty of them is the whole pool, and
 * every other route with it (db.module.ts).
 */
export const ENQUEUE_TIMEOUT_MS = 5_000;

const unavailable = () =>
  apiError(
    HttpStatus.SERVICE_UNAVAILABLE,
    'PHOTO_REGISTRATION_UNAVAILABLE',
    'Photos cannot be saved right now. Please try again in a moment.',
  );

/**
 * Hands a registered photo to the media worker (tasks.md T112, T113; research
 * D-12): `{ photo_id }` on the `media` queue.
 *
 * - **Keyed by the photo** (`jobId`), so a second enqueue while the first job
 *   is waiting is the same job — and **removed on completion**, so a
 *   registration rolled back after its enqueue (the traveller's connection
 *   dropped mid-request) and then retried is not shadowed by the finished job
 *   of the attempt that never committed: BullMQ ignores an `add` whose id it
 *   still holds.
 * - **Delayed** by {@link MEDIA_JOB.delayMs}, past the registration's COMMIT.
 * - **Enqueued inside the registration**, and a refusal fails it: a 503
 *   rolls the row back (RlsSessionMiddleware rolls back on any 5xx) and the
 *   device retries the registration later — the bytes are already in the
 *   bucket. A photo is never recorded with no job behind it.
 *
 * Visibility posture: writes a photo id to Redis; reads nothing.
 */
@Injectable()
export class MediaJobProducer {
  private readonly logger = new Logger(MediaJobProducer.name);

  constructor(
    @Inject(queueToken(QUEUE_NAMES.media)) private readonly queue: MediaQueue,
  ) {}

  async enqueue(photoId: string): Promise<void> {
    const adding = this.queue.add(
      MEDIA_JOB.name,
      { photo_id: photoId },
      { jobId: photoId, delay: MEDIA_JOB.delayMs, removeOnComplete: true },
    );

    try {
      await withTimeout(adding, ENQUEUE_TIMEOUT_MS);
    } catch (error: unknown) {
      this.logger.error(
        `Could not enqueue the media job for photo ${photoId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw unavailable();
    }
  }
}

/**
 * `work`, or a rejection once `ms` have passed. The timer is always cleared. A
 * late settlement of `work` is observed by `Promise.race` and goes nowhere —
 * an `add` Redis finally accepts after the registration gave up is a job for a
 * photo that was rolled back, which the worker finishes quietly.
 */
async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`the queue did not answer within ${ms} ms`)),
      ms,
    );
  });

  try {
    return await Promise.race([work, expiry]);
  } finally {
    clearTimeout(timer);
  }
}
