import { Injectable } from '@nestjs/common';
import type { DocumentContentType, DocumentType } from '@triptrackr/contracts';
import { asc, desc, eq, sql } from 'drizzle-orm';

import { rlsDb } from '@/common/db/rls-db';
import { liveOnly } from '@/common/db/soft-delete.scope';
import { documents } from '@/db/schema';

import type { Confirmation } from './boarding-pass.service';

/**
 * The columns the owner view reads: metadata, plus the wrapped key the sealed
 * fields open under. Never the storage key — only the content read needs it.
 */
const DOCUMENT_COLUMNS = {
  id: documents.id,
  tripId: documents.tripId,
  type: documents.type,
  contentType: documents.contentType,
  byteSize: documents.byteSize,
  wrappedDek: documents.wrappedDek,
  dekKeyId: documents.dekKeyId,
  parsedSealed: documents.parsedSealed,
  parsedConfirmedAt: documents.parsedConfirmedAt,
  uploadState: documents.uploadState,
  createdAt: documents.createdAt,
  updatedAt: documents.updatedAt,
};

/** What `GET /documents/:id/content` needs to fetch and open the object. */
const CONTENT_COLUMNS = {
  id: documents.id,
  contentType: documents.contentType,
  storageKey: documents.storageKey,
  wrappedDek: documents.wrappedDek,
  dekKeyId: documents.dekKeyId,
};

export type DocumentRow = Pick<
  typeof documents.$inferSelect,
  keyof typeof DOCUMENT_COLUMNS
>;
export type DocumentContentRow = Pick<
  typeof documents.$inferSelect,
  keyof typeof CONTENT_COLUMNS
>;

export interface NewDocument {
  readonly id: string;
  readonly tripId: string;
  readonly type: DocumentType;
  readonly contentType: DocumentContentType;
  /** Plaintext size. */
  readonly byteSize: number;
  /** Where the ciphertext was written — before this row, always. */
  readonly storageKey: string;
  readonly wrappedDek: Buffer;
  readonly dekKeyId: string;
  readonly parsedSealed: Buffer | null;
  /** Confirmed on the device before upload: `parsed_confirmed_at = now()`. */
  readonly confirmed: boolean;
}

export interface DocumentPatch {
  readonly type?: DocumentType;
  /** Undefined leaves the sealed fields untouched; null clears them. */
  readonly parsedSealed?: Buffer | null;
  readonly confirmation: Confirmation;
}

/**
 * Every query against `documents`, on the request's RLS transaction (rls-db.ts).
 *
 * Visibility posture: owner-only, structurally. `documents_owner_only` (0005)
 * is the table's one policy and has no public counterpart, so a row that is not
 * the caller's does not exist here — whatever the predicates below say. They
 * add the tombstone filter (`liveOnly`) and the ids; ownership is the policy's.
 *
 * No statement here can raise on a caller's mistake: the service checks sizes,
 * types and the field rules before any write, and a client-chosen id uses
 * `ON CONFLICT DO NOTHING`, because a failed statement would poison the request
 * transaction (0008's header).
 */
@Injectable()
export class DocumentsRepository {
  listForTrip(tripId: string): Promise<DocumentRow[]> {
    return rlsDb()
      .select(DOCUMENT_COLUMNS)
      .from(documents)
      .where(liveOnly(documents, eq(documents.tripId, tripId)))
      .orderBy(desc(documents.createdAt), asc(documents.id));
  }

  async findLive(documentId: string): Promise<DocumentRow | null> {
    const [row] = await rlsDb()
      .select(DOCUMENT_COLUMNS)
      .from(documents)
      .where(liveOnly(documents, eq(documents.id, documentId)))
      .limit(1);

    return row ?? null;
  }

  /**
   * The same read, holding the row until the request's transaction ends, so a
   * patch decides against the row it will write — two patches in flight cannot
   * confirm fields the other has just cleared.
   */
  async lockLive(documentId: string): Promise<DocumentRow | null> {
    const [row] = await rlsDb()
      .select(DOCUMENT_COLUMNS)
      .from(documents)
      .where(liveOnly(documents, eq(documents.id, documentId)))
      .limit(1)
      .for('update');

    return row ?? null;
  }

  async findContent(documentId: string): Promise<DocumentContentRow | null> {
    const [row] = await rlsDb()
      .select(CONTENT_COLUMNS)
      .from(documents)
      .where(liveOnly(documents, eq(documents.id, documentId)))
      .limit(1);

    return row ?? null;
  }

  /** Null when the id is already taken — the caller decides what that means. */
  async insert(document: NewDocument): Promise<DocumentRow | null> {
    const [row] = await rlsDb()
      .insert(documents)
      .values({
        id: document.id,
        tripId: document.tripId,
        type: document.type,
        storageKey: document.storageKey,
        contentType: document.contentType,
        byteSize: document.byteSize,
        wrappedDek: document.wrappedDek,
        dekKeyId: document.dekKeyId,
        parsedSealed: document.parsedSealed,
        parsedConfirmedAt: document.confirmed ? sql`now()` : null,
        // The bytes arrived with the request and are in the bucket (FR-041).
        uploadState: 'uploaded',
      })
      .onConflictDoNothing()
      .returning(DOCUMENT_COLUMNS);

    return row ?? null;
  }

  async update(documentId: string, patch: DocumentPatch): Promise<DocumentRow | null> {
    const [row] = await rlsDb()
      .update(documents)
      .set({
        ...(patch.type !== undefined && { type: patch.type }),
        ...(patch.parsedSealed !== undefined && { parsedSealed: patch.parsedSealed }),
        ...(patch.confirmation === 'now' && { parsedConfirmedAt: sql`now()` }),
        ...(patch.confirmation === 'clear' && { parsedConfirmedAt: null }),
        updatedAt: sql`now()`,
      })
      .where(liveOnly(documents, eq(documents.id, documentId)))
      .returning(DOCUMENT_COLUMNS);

    return row ?? null;
  }

  /** The object stays for the storage sweep; the row stays as a tombstone (FR-039). */
  async tombstone(documentId: string): Promise<boolean> {
    const now = sql`now()`;
    const rows = await rlsDb()
      .update(documents)
      .set({ deletedAt: now, updatedAt: now })
      .where(liveOnly(documents, eq(documents.id, documentId)))
      .returning({ id: documents.id });

    return rows.length > 0;
  }
}
