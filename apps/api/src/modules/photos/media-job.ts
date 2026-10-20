import { Uuid } from '@triptrackr/contracts';
import { z } from 'zod';

/**
 * The media job — the one message the API sends the media worker (tasks.md
 * T112, T113; research D-12, D-34).
 *
 * Producer and consumer live in different processes and BullMQ matches them by
 * string with no compile-time link (queue.constants.ts), so both sides import
 * the job's name and shape from here. Nothing in this file loads `sharp` or
 * `exifr`: the API imports it too, and has no business carrying either.
 *
 * Visibility posture: the job carries a photo id and nothing else — no storage
 * key, no owner, no position. Redis holds it; a reader of Redis learns an
 * unguessable uuid.
 */

export const MEDIA_JOB = {
  name: 'photo',
  /**
   * How long a job waits before a worker may claim it. The registration that
   * enqueues it commits only after its handler returns (RlsSessionMiddleware),
   * and a worker quicker than that COMMIT would find no photo and finish the
   * job as if it had been deleted. Seconds are a wide margin over a COMMIT's
   * milliseconds, and cost nothing a traveller sees: the uploading device made
   * its own thumbnail at capture (research D-34).
   */
  delayMs: 5_000,
} as const;

/** Strict: a job carrying anything else was not made by this API. */
export const MediaJobData = z.strictObject({ photo_id: Uuid });
export type MediaJobData = z.infer<typeof MediaJobData>;

/**
 * The thumbnail's object key: beside the original, under the same owner
 * prefix, so a per-traveller sweep or export that lists `<owner id>/` finds
 * both (FR-006, FR-007). `StorageKey` refuses the suffix, so a thumbnail can
 * never be registered as a photo, and no upload URL is ever signed for one.
 *
 * `media_record_photo` (migration 0012) derives the same key in SQL rather than
 * accepting one — the worker checks the two agree on every job.
 */
export function thumbnailKeyFor(storageKey: string): string {
  return `${storageKey}.thumb.jpg`;
}
