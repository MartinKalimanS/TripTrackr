// sync-guard:allow-file the push envelope, not a record: lenient on purpose so each record is judged on its own by its table's contracts schema (push-apply.ts)
import { MAX_PUSH_BATCH, SyncTable, Uuid } from '@triptrackr/contracts';
import { z } from 'zod';

/**
 * The envelope of `POST /sync/push`: what is checked about a request before any
 * record is looked at (tasks.md T200).
 *
 * `PushRequest` in `@triptrackr/contracts` validates the envelope AND every
 * record in it, and refuses the whole request if one record is malformed. That
 * is the wrong granularity for this endpoint: a record that fails its table's
 * strict schema must come back `rejected` / `invalid` on its own, while the rest
 * of the batch proceeds. So the envelope is checked here with the same limits —
 * `table` is a `SyncTable`, `records` holds 1..`MAX_PUSH_BATCH` — and each
 * record is then checked by the `*PushRecord` schema bound to its table
 * (push-apply.ts), which is the contracts package's own strict schema, not a copy.
 *
 * The one thing the envelope demands of a record is an `id` it can parse. A
 * record without one cannot be reported on — the response is one result per
 * record, keyed by id — so it fails the request as a whole, with nothing
 * applied, rather than being silently dropped from the answer. Every other key
 * passes through untouched for the strict schema to judge.
 */
export const PushEnvelope = z.strictObject({
  table: SyncTable,
  records: z
    .array(z.looseObject({ id: Uuid }))
    .min(1)
    .max(MAX_PUSH_BATCH),
});
export type PushEnvelope = z.infer<typeof PushEnvelope>;
