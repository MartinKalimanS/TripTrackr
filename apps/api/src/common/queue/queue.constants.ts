/**
 * Every queue in the system, named once.
 *
 * Producers and consumers live in different processes — the API enqueues, the
 * worker consumes — and BullMQ matches them by string name with no compile-time
 * link between the two sides. A typo in either place produces jobs that are
 * enqueued successfully and never processed, which is silent and looks like a
 * slow worker. Naming them here makes that a type error instead.
 */
export const QUEUE_NAMES = {
  /** Thumbnailing, EXIF extraction, moderation. T113, FR-029, FR-030, FR-056. */
  media: 'media',
  /** Hard-deletes rows past the tombstone retention window. T129. */
  tombstonePurge: 'tombstone-purge',
  /** Removes orphaned objects after account or row deletion. T188, FR-006. */
  storageSweep: 'storage-sweep',
  /** Builds the traveller's data export archive. FR-007. */
  accountExport: 'account-export',
  /** The daily FX snapshot refresh and pending-conversion backfill. T081, research D-28. */
  fxRefresh: 'fx-refresh',
} as const;

/**
 * The job scheduler that keeps `fx-refresh` running once a day
 * (`Queue.upsertJobScheduler`, idempotent by this id). `every` rather than a
 * cron pattern, with `immediately`, so a fresh deployment has rates within
 * seconds of the worker's first start instead of at the next calendar tick.
 */
export const FX_REFRESH_SCHEDULER = {
  id: 'fx-refresh-daily',
  everyMs: 24 * 60 * 60 * 1_000,
} as const;

/**
 * The job scheduler that keeps `tombstone-purge` running once a day
 * (`Queue.upsertJobScheduler`, idempotent by this id), exactly as
 * {@link FX_REFRESH_SCHEDULER} keeps the FX refresh running (sync-protocol.md
 * §5, tasks.md T129). Unlike that one it does not ask for a run `immediately`:
 * a fresh deployment has no tombstone old enough to purge, BullMQ already
 * aligns an `every` schedule to multiples of the interval (so a restart never
 * shifts the cadence, and this runs at 00:00 UTC), and the flag makes BullMQ
 * warn on every worker start.
 */
export const TOMBSTONE_PURGE_SCHEDULER = {
  id: 'tombstone-purge-daily',
  everyMs: 24 * 60 * 60 * 1_000,
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** DI token for a queue, e.g. `@Inject(queueToken(QUEUE_NAMES.media))`. */
export function queueToken(name: QueueName): string {
  return `BULL_QUEUE_${name}`;
}
