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
  PushRequest,
  TripPullRecord,
  TripPushRecord,
  TripStopPullRecord,
  TripStopPushRecord,
  type SyncTable,
} from '@triptrackr/contracts';

import type { SyncRow } from '@/db/repositories/sync';

/**
 * Local row <-> wire record, for the seven mirrored tables (tasks.md T132,
 * T133; data-model.md §10; research D-13, D-15, D-16).
 *
 * This file defines NO record shape. Every shape below is a schema imported
 * from `@triptrackr/contracts`; what is written here is only the mapping
 * between a SQLite row and that shape, and the CI guard (T201) fails the build
 * if a schema is built anywhere under `sync/`.
 *
 * OUTGOING. `toPushRecord` builds the candidate from the push schema's own key
 * list — the schema decides which columns travel — and validates it with that
 * schema. Local-only columns (`is_dirty`, `synced_at`, `local_file_uri`) and
 * server-owned columns (`created_at`, `deleted_at`, `status`, `upload_state`,
 * `moderation_state`, `has_thumbnail`, `fx_pending`) are simply not in it.
 * `deleted` is `deleted_at !== null`: a tombstone is an ordinary record
 * (FR-039). A row that fails its own schema will be refused by the server as
 * `invalid`; it is reported here so the caller can park it instead of poisoning
 * a batch.
 *
 * INCOMING. Every pull field is a local column of the same name (proved at
 * compile time by `LocalMirrorChecks` in `db/schema.ts`), so `toLocalValues`
 * is the record itself, server-owned columns included. `parsePullRecord`
 * validates a conflict's `server_version` — the push envelope types it as a
 * bare record — against the table's PULL schema before anything is written.
 */

/** Any record, as validated by its table's schema. */
export type WireRecord = Record<string, unknown>;

/** The subset of a zod object schema this file needs. */
interface RecordSchema {
  shape: Record<string, unknown>;
  safeParse: (value: unknown) => { success: true; data: WireRecord } | { success: false };
}

interface Codec {
  push: RecordSchema;
  pull: RecordSchema;
  /** Words for the traveller: the record as a sentence's object. */
  label: (record: WireRecord) => string;
}

const LABEL_MAX = 40;

function quoted(kind: string, value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length === 0) return fallback;
  const shown = text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1)}…` : text;
  return `${kind} “${shown}”`;
}

const CODECS: Record<SyncTable, Codec> = {
  trips: {
    push: TripPushRecord,
    pull: TripPullRecord,
    label: (r) => quoted('the trip', r.title, 'a trip'),
  },
  trip_stops: {
    push: TripStopPushRecord,
    pull: TripStopPullRecord,
    label: () => 'a stop',
  },
  expense_categories: {
    push: ExpenseCategoryPushRecord,
    pull: ExpenseCategoryPullRecord,
    label: (r) => quoted('the category', r.name, 'a category'),
  },
  notes: {
    push: NotePushRecord,
    pull: NotePullRecord,
    label: (r) => quoted('the note', r.title ?? r.body, 'a note'),
  },
  expenses: {
    push: ExpensePushRecord,
    pull: ExpensePullRecord,
    label: (r) => `the expense of ${String(r.amount)} ${String(r.currency)}`,
  },
  photos: { push: PhotoPushRecord, pull: PhotoPullRecord, label: () => 'a photo' },
  documents: {
    push: DocumentPushRecord,
    pull: DocumentPullRecord,
    label: () => 'a document',
  },
};

/** Keys every push record carries that are identity, not content. */
const PUSH_META = new Set(['id', 'updated_at', 'deleted']);

/**
 * Client-computed but DERIVED columns: the server may backfill or replace
 * them, and the traveller never typed them, so a difference in them alone is
 * not a difference in what they wrote.
 */
const DERIVED = new Set(['fx_rate_to_home', 'amount_home']);

// ---------------------------------------------------------------------------
// Outgoing
// ---------------------------------------------------------------------------

export type PushCandidate =
  { ok: true; record: WireRecord } | { ok: false; id: string; updatedAt: string };

/** Local row -> validated wire push record, or `ok: false` when the schema refuses it. */
export function toPushRecord(table: SyncTable, row: SyncRow): PushCandidate {
  const { push } = CODECS[table];
  const candidate: WireRecord = {};
  for (const key of Object.keys(push.shape)) {
    candidate[key] = key === 'deleted' ? row.deleted_at !== null : row[key];
  }
  const parsed = push.safeParse(candidate);
  return parsed.success
    ? { ok: true, record: parsed.data }
    : { ok: false, id: row.id, updatedAt: row.updated_at };
}

/**
 * The request envelope for one table's batch, validated by `PushRequest`. The
 * records were validated one by one already; this proves the envelope — the
 * table-to-record binding and the batch bounds — with the same schema the
 * server uses.
 */
export function buildPushRequest(
  table: SyncTable,
  records: readonly WireRecord[],
): PushRequest {
  return PushRequest.parse({ table, records });
}

/** Bytes of a record once serialised — the batcher's unit (UTF-8). */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4; // a surrogate pair is one 4-byte code point
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * An `IsoDateTime` as epoch milliseconds, for ordering. Lexicographic order is
 * wrong for the wire's timestamps — `…:03Z` sorts after `…:03.500Z`, and an
 * offset shifts the instant — so the last-write-wins comparison never compares
 * the strings. Fractions beyond milliseconds (the server keeps microseconds)
 * are cut first because not every JavaScript engine parses them.
 */
export function instantMs(iso: string): number {
  return Date.parse(iso.replace(/(\.\d{3})\d+/, '$1'));
}

// ---------------------------------------------------------------------------
// Incoming
// ---------------------------------------------------------------------------

/** Validate a server-supplied record against the table's PULL schema. */
export function parsePullRecord(table: SyncTable, value: unknown): WireRecord | null {
  const parsed = CODECS[table].pull.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * The columns to write for a pulled record: all of it. Server-owned columns
 * (trip `status`, photo/document `upload_state`, photo `moderation_state` and
 * `has_thumbnail`, expense `fx_rate_to_home`/`amount_home`/`fx_pending`) are
 * copied like any other; local-only columns are not in a pull record, so an
 * overwrite cannot touch `local_file_uri`.
 */
export function toLocalValues(record: WireRecord): WireRecord {
  return { ...record };
}

// ---------------------------------------------------------------------------
// Meaning
// ---------------------------------------------------------------------------

/** The columns the traveller authors: what a conflict compares. */
export function contentKeys(table: SyncTable): string[] {
  return Object.keys(CODECS[table].push.shape).filter(
    (key) => !PUSH_META.has(key) && !DERIVED.has(key),
  );
}

/** The record as the object of a sentence: `the note “Lisbon”`, `a stop`. */
export function describeRecord(table: SyncTable, record: WireRecord): string {
  return CODECS[table].label(record);
}

/** The trip a record belongs to, for linking; a trip is its own; a category has none. */
export function tripIdOf(table: SyncTable, record: WireRecord): string | null {
  if (table === 'trips') return typeof record.id === 'string' ? record.id : null;
  return typeof record.trip_id === 'string' ? record.trip_id : null;
}
