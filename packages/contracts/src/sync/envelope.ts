import { z } from 'zod';

import { Uuid } from '../scalars';
import {
  DocumentPullRecord,
  DocumentPushRecord,
  ExpenseCategoryPullRecord,
  ExpenseCategoryPushRecord,
  ExpensePullRecord,
  ExpensePushRecord,
  NotePullRecord,
  NotePushRecord,
  PhotoPullRecord,
  PhotoPushRecord,
  TripPullRecord,
  TripPushRecord,
  TripStopPullRecord,
  TripStopPushRecord,
} from './records';
import { SyncTable } from './tables';

/**
 * Batch ceiling for one push request. A day's capture must fit in a handful of
 * round trips on a brief connection window (SC-010); a batch too large to finish
 * in one attempt is resumed, not restarted (spec edge case).
 */
export const MAX_PUSH_BATCH = 500;

// ---------------------------------------------------------------------------
// GET /sync/pull
// ---------------------------------------------------------------------------

export const PullQuery = z.strictObject({
  /** Opaque token wrapping `(updated_at, id)`. Absent means a full snapshot (FR-042). */
  cursor: z.string().min(1).optional(),
  /** Defaults to every table when omitted. */
  tables: z.array(SyncTable).min(1).optional(),
});
export type PullQuery = z.infer<typeof PullQuery>;

export const PullChanges = z.strictObject({
  trips: z.array(TripPullRecord).default([]),
  trip_stops: z.array(TripStopPullRecord).default([]),
  expense_categories: z.array(ExpenseCategoryPullRecord).default([]),
  notes: z.array(NotePullRecord).default([]),
  expenses: z.array(ExpensePullRecord).default([]),
  photos: z.array(PhotoPullRecord).default([]),
  documents: z.array(DocumentPullRecord).default([]),
});
export type PullChanges = z.infer<typeof PullChanges>;

export const PullResponse = z.strictObject({
  changes: PullChanges,
  next_cursor: z.string().min(1),
  has_more: z.boolean(),
});
export type PullResponse = z.infer<typeof PullResponse>;

// ---------------------------------------------------------------------------
// POST /sync/push
// ---------------------------------------------------------------------------

const batch = <T extends z.ZodTypeAny>(record: T) =>
  z.array(record).min(1).max(MAX_PUSH_BATCH);

/**
 * One request per table per cycle. The record schema is bound to the table name
 * so a note cannot be pushed under `expenses` and vice versa.
 */
export const PushRequest = z.discriminatedUnion('table', [
  z.strictObject({ table: z.literal('trips'), records: batch(TripPushRecord) }),
  z.strictObject({ table: z.literal('trip_stops'), records: batch(TripStopPushRecord) }),
  z.strictObject({
    table: z.literal('expense_categories'),
    records: batch(ExpenseCategoryPushRecord),
  }),
  z.strictObject({ table: z.literal('notes'), records: batch(NotePushRecord) }),
  z.strictObject({ table: z.literal('expenses'), records: batch(ExpensePushRecord) }),
  z.strictObject({ table: z.literal('photos'), records: batch(PhotoPushRecord) }),
  z.strictObject({ table: z.literal('documents'), records: batch(DocumentPushRecord) }),
]);
export type PushRequest = z.infer<typeof PushRequest>;

/** Non-fatal annotations on an applied record. */
export const PushWarning = z.enum([
  /** Constitution V / research D-08: the trip is kept; the commercial question comes later. */
  'over_allowance',
]);
export type PushWarning = z.infer<typeof PushWarning>;

/** Why a record was not applied. It stays dirty on the device and is retried. */
export const PushRejection = z.enum([
  /** The parent row (trip, category) has not arrived yet — push order was violated or the parent failed. */
  'parent_missing',
  /** The id is already taken by a row this traveller cannot see. Regenerate locally. */
  'id_unavailable',
  /** The record failed validation against this contract. */
  'invalid',
]);
export type PushRejection = z.infer<typeof PushRejection>;

export const PushResult = z.discriminatedUnion('status', [
  z.strictObject({
    id: Uuid,
    status: z.literal('applied'),
    warnings: z.array(PushWarning).optional(),
  }),
  z.strictObject({
    id: Uuid,
    status: z.literal('conflict'),
    /** The winning row, in that table's pull shape. The device overwrites and tells the traveller. */
    server_version: z.record(z.string(), z.unknown()),
  }),
  z.strictObject({
    id: Uuid,
    status: z.literal('rejected'),
    reason: PushRejection,
  }),
]);
export type PushResult = z.infer<typeof PushResult>;

export const PushResponse = z.strictObject({
  results: z.array(PushResult),
});
export type PushResponse = z.infer<typeof PushResponse>;
