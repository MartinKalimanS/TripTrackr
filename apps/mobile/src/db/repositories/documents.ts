/**
 * Travel documents — local-first repository (tasks.md T211; FR-031, FR-035,
 * FR-036, FR-041; Constitution II, IV).
 *
 * The same rules as `trips.ts`: every write the traveller makes stamps
 * `updated_at` and sets `is_dirty`, deletes are tombstones, and reads filter
 * tombstones out. Two invariants are enforced here with the wire's own
 * schemas, so a row this repository accepts is a row the API accepts:
 *
 *   - extracted fields exist only on a boarding pass, and only in the exact
 *     shape of `DocumentParsedFields` — the three fields FR-035 names and
 *     nothing else from the barcode (research D-33);
 *   - fields are a proposal until the traveller confirms them:
 *     `parsed_confirmed_at` is set by `confirmFields` alone (Constitution IV).
 *
 * The image is not here: `local_file_uri` is the vault path of its sealed
 * file (`features/documents/document-vault.ts`). A new document is
 * `upload_state = 'pending'` until the API has its bytes (FR-041); the
 * upload bookkeeping below clears `is_dirty` only for the version the server
 * actually received, so an edit made while an upload travelled is sent next.
 *
 * Visibility posture: owner-only, structurally (FR-032). The table has no
 * visibility column and the encrypted per-account store holds only the
 * signed-in traveller's own rows; nothing here can mark a document shared.
 */
import { DocumentParsedFields, type DocumentType } from '@triptrackr/contracts';
import { and, asc, desc, eq, isNull, or } from 'drizzle-orm';

import type { AppDatabase } from '@/db/client';
import { documents, type DocumentRow } from '@/db/schema';

import { nowIso } from './shared';

export interface CreateDocumentInput {
  /** Client-generated UUID (D-15) — also what the sealed file is bound to. */
  id: string;
  trip_id: string;
  type: DocumentType;
  /** Fields read from a boarding pass's barcode: a proposal, never fact. */
  parsed_json: DocumentParsedFields | null;
  /** The vault path of the sealed image, relative to the documents directory. */
  local_file_uri: string;
}

export class DocumentFieldsError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'DocumentFieldsError';
  }
}

/** The wire's rules for extracted fields, applied before anything is written. */
function checkedFields(
  type: DocumentType,
  fields: DocumentParsedFields | null,
): DocumentParsedFields | null {
  if (fields === null) return null;
  if (type !== 'boarding_pass') {
    throw new DocumentFieldsError('Only a boarding pass carries extracted fields.');
  }
  const parsed = DocumentParsedFields.safeParse(fields);
  if (!parsed.success) {
    throw new DocumentFieldsError('The fields are not a flight number, date and name.');
  }
  return parsed.data;
}

const live = (id: string) => and(eq(documents.id, id), isNull(documents.deleted_at));

/** A trip's live documents, newest first. Live-queryable. */
function forTripQuery(db: AppDatabase, tripId: string) {
  return db
    .select()
    .from(documents)
    .where(and(eq(documents.trip_id, tripId), isNull(documents.deleted_at)))
    .orderBy(desc(documents.created_at), desc(documents.id));
}

/** One live document, or an empty result once it is gone. Live-queryable. */
function byIdQuery(db: AppDatabase, id: string) {
  return db.select().from(documents).where(live(id));
}

function byId(db: AppDatabase, id: string): DocumentRow | null {
  const [row] = byIdQuery(db, id).all();
  return row ?? null;
}

function create(db: AppDatabase, input: CreateDocumentInput): DocumentRow {
  const parsed = checkedFields(input.type, input.parsed_json);
  const now = nowIso();
  const [row] = db
    .insert(documents)
    .values({
      id: input.id,
      trip_id: input.trip_id,
      type: input.type,
      parsed_json: parsed,
      parsed_confirmed_at: null,
      upload_state: 'pending',
      local_file_uri: input.local_file_uri,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      is_dirty: true,
      synced_at: null,
    })
    .returning()
    .all();
  if (!row) throw new Error('Document insert returned no row.');
  return row;
}

/**
 * The traveller checked the fields — as extracted, corrected, or typed in
 * because the barcode could not be read — and confirmed them (FR-035).
 */
function confirmFields(
  db: AppDatabase,
  id: string,
  fields: DocumentParsedFields,
): DocumentRow {
  const current = byId(db, id);
  if (!current) throw new Error('Document not found.');
  const now = nowIso();
  const [row] = db
    .update(documents)
    .set({
      parsed_json: checkedFields(current.type, fields),
      parsed_confirmed_at: now,
      updated_at: now,
      is_dirty: true,
    })
    .where(live(id))
    .returning()
    .all();
  if (!row) throw new Error('Document update returned no row.');
  return row;
}

/**
 * The server acknowledged the version stamped `sentUpdatedAt`. The row is
 * clean only if it is still that version; an edit made in the meantime keeps
 * it dirty so the next pass sends the edit.
 */
function acknowledge(
  db: AppDatabase,
  id: string,
  sentUpdatedAt: string,
  extra: Partial<Pick<DocumentRow, 'upload_state'>>,
): DocumentRow | null {
  const current = byId(db, id);
  if (!current) return null;
  const [row] = db
    .update(documents)
    .set({
      ...extra,
      synced_at: nowIso(),
      is_dirty: current.updated_at !== sentUpdatedAt,
    })
    .where(live(id))
    .returning()
    .all();
  return row ?? null;
}

/** The bytes and the metadata of version `sentUpdatedAt` reached the API. */
function markUploaded(db: AppDatabase, id: string, sentUpdatedAt: string) {
  return acknowledge(db, id, sentUpdatedAt, { upload_state: 'uploaded' });
}

/** A confirmation or correction of version `sentUpdatedAt` reached the API. */
function markSynced(db: AppDatabase, id: string, sentUpdatedAt: string) {
  return acknowledge(db, id, sentUpdatedAt, {});
}

/** The API refused the bytes for good (too large): retrying cannot help. */
function markUploadFailed(db: AppDatabase, id: string): void {
  db.update(documents).set({ upload_state: 'failed' }).where(live(id)).run();
}

/**
 * A trip's documents with something for the API — bytes still pending, or a
 * confirmation made after the upload — oldest first, in the order captured.
 */
function needingUploadIds(db: AppDatabase, tripId: string): string[] {
  return db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.trip_id, tripId),
        isNull(documents.deleted_at),
        or(
          eq(documents.upload_state, 'pending'),
          and(eq(documents.upload_state, 'uploaded'), eq(documents.is_dirty, true)),
        ),
      ),
    )
    .orderBy(asc(documents.created_at), asc(documents.id))
    .all()
    .map((row) => row.id);
}

/**
 * Tombstone (FR-039). The row stays until the server has been told; the
 * sealed file it pointed at is released, and its path returned so the vault
 * can delete it. Null when there was nothing live to delete.
 */
function remove(db: AppDatabase, id: string): string | null {
  const current = byId(db, id);
  if (!current) return null;
  const now = nowIso();
  db.update(documents)
    .set({ deleted_at: now, updated_at: now, is_dirty: true, local_file_uri: null })
    .where(live(id))
    .run();
  return current.local_file_uri;
}

export const documentsRepository = {
  forTripQuery,
  byIdQuery,
  byId,
  create,
  confirmFields,
  markUploaded,
  markSynced,
  markUploadFailed,
  needingUploadIds,
  remove,
};
