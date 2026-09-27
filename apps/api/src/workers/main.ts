import { createBullConnection } from '@/common/queue/queue.module';

import { bootstrapWorker } from './bootstrap';

/**
 * Media and maintenance worker entrypoint (research D-12, SC-003).
 *
 * A separate process from the API, not a background task inside it. Thumbnailing
 * a 12 MB photo is CPU-bound work on a single-threaded runtime; run in-process it
 * would block the event loop and stall every concurrent request, however fast the
 * individual handler is. Splitting them also lets the two scale on their own
 * curves — media load is bursty in a way request traffic is not.
 *
 * Everything the process does lives in `bootstrap.ts`, where it is testable;
 * this file only wires the real Redis connection in and starts it.
 */
bootstrapWorker(createBullConnection());
