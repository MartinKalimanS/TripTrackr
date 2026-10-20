import { Injectable } from '@nestjs/common';
import type {
  CreateDocumentRequest,
  Document,
  DocumentContentResponse,
  PatchDocumentRequest,
} from '@triptrackr/contracts';
import { randomUUID } from 'node:crypto';

import { EnvelopeService } from '@/common/crypto/envelope.service';
import { requireCurrentUserId } from '@/common/rls/rls-context';
import { StorageService, buildKey } from '@/common/storage/storage.service';
import { TripsService } from '@/modules/trips/trips.service';

import { BoardingPassService } from './boarding-pass.service';
import { decodeDocument } from './document-bytes';
import { documentIdUnavailable, documentNotFound } from './documents.errors';
import {
  DocumentsRepository,
  type DocumentRow,
  type NewDocument,
} from './documents.repository';

/**
 * The object's declared type in the bucket. It holds ciphertext, and says so —
 * not which kind of image the ciphertext hides.
 */
const SEALED_CONTENT_TYPE = 'application/octet-stream';

/** A create's outcome: `created` is false when the upload was a replay (201 vs 200). */
export interface CreatedDocument {
  readonly document: Document;
  readonly created: boolean;
}

/**
 * Travel documents (rest-api.md §6; FR-031..FR-033, FR-035; research D-32,
 * D-33; tasks.md T114). Access rule: owner, structurally — there is no public
 * variant of anything here, at any parameterisation (FR-032).
 *
 * **The API is the object store's client that seals.** A document's bytes
 * arrive base64 over TLS, are sealed by EnvelopeService under a fresh data key
 * bound to the document's id, and only the ciphertext is written to the
 * documents bucket, as an opaque octet stream. They leave the same way,
 * decrypted for the owner alone. No pre-signed URL exists for this bucket.
 *
 * **The object is written before the row** (D-32). A row must never name an
 * object that is not there. If the row then cannot be written — a failed
 * insert, an id that turned out to be taken — the object is deleted, best
 * effort: the delete logs its own failure and the storage sweep retries it. An
 * object orphaned beyond that (a crash, a failed COMMIT) is ciphertext whose
 * only key lived in the row that never committed: inert.
 *
 * **A replayed upload is the same upload** (research D-15). The caller's own
 * live row under the id answers the retry — 200, the stored document, no second
 * object. An id on another of the caller's trips, or held by a row the policy
 * hides, is one identical 409 that says nothing about which. Two concurrent
 * retries both miss the replay check and both write an object; the loser's
 * insert finds the id taken once the winner commits, its object is discarded,
 * and it answers with the winner's row.
 *
 * Trip-scoped operations load the trip through the owner view first, so a
 * stranger is `TRIP_NOT_FOUND` before any document is looked at. Row-scoped
 * operations rely on the policy: a document the caller cannot see is
 * `DOCUMENT_NOT_FOUND`, the same answer as for one that never existed.
 *
 * Visibility posture: owner-only, structurally (`documents_owner_only`, 0005;
 * no public policy, no visibility column, ever). Neither bytes nor fields are
 * logged or reported by anything here; a failure names a document by id.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly repository: DocumentsRepository,
    private readonly trips: TripsService,
    private readonly envelope: EnvelopeService,
    private readonly storage: StorageService,
    private readonly boardingPass: BoardingPassService,
  ) {}

  /** Metadata and decrypted fields; never bytes, keys or storage keys. */
  async list(tripId: string): Promise<Document[]> {
    await this.trips.loadOwned(tripId);
    const rows = await this.repository.listForTrip(tripId);
    return rows.map((row) => this.toDocument(row));
  }

  async create(tripId: string, request: CreateDocumentRequest): Promise<CreatedDocument> {
    await this.trips.loadOwned(tripId);
    const bytes = decodeDocument(request.content_type, request.content_base64);
    const id = request.id ?? randomUUID();

    const stored = await this.repository.findLive(id);
    if (stored) return this.replayOf(stored, tripId);

    const confirmed = this.boardingPass.confirmedOnCreate(request);
    const sealed = this.envelope.seal(bytes, this.envelope.documentAad(id));
    const parsedSealed = this.boardingPass.seal(sealed, id, request.parsed_json);
    const storageKey = buildKey(requireCurrentUserId());

    await this.storage.putObject(
      'documents',
      storageKey,
      sealed.ciphertext,
      SEALED_CONTENT_TYPE,
    );

    const row = await this.insertOrDiscard({
      id,
      tripId,
      type: request.type,
      contentType: request.content_type,
      byteSize: bytes.length,
      storageKey,
      wrappedDek: sealed.wrappedDek,
      dekKeyId: sealed.dekKeyId,
      parsedSealed,
      confirmed,
    });
    if (row) return { document: this.toDocument(row), created: true };

    // Taken while this upload was in flight: by a concurrent retry of the same
    // upload, which has committed and is now visible — or by a row that is not.
    const winner = await this.repository.findLive(id);
    if (winner) return this.replayOf(winner, tripId);
    throw documentIdUnavailable();
  }

  /** The decrypted bytes, base64 (FR-033). The controller marks the response `no-store`. */
  async content(documentId: string): Promise<DocumentContentResponse> {
    const row = await this.repository.findContent(documentId);
    if (!row) throw documentNotFound();

    const ciphertext = await this.storage.getObject('documents', row.storageKey);
    if (!ciphertext) {
      // The row is written only after its object, so this is lost data or a
      // sweep that ran early — a defect to be seen (FR-073), not a not-found
      // that would tell the traveller the document never existed.
      throw new Error(`Document ${row.id} has a row but no stored object.`);
    }

    const bytes = this.envelope.open(
      { ciphertext, wrappedDek: row.wrappedDek, dekKeyId: row.dekKeyId },
      this.envelope.documentAad(row.id),
    );

    return {
      id: row.id,
      content_type: row.contentType,
      content_base64: bytes.toString('base64'),
    };
  }

  /** Type, and the extracted fields: confirm, correct, clear (rest-api.md §6). */
  async patch(documentId: string, patch: PatchDocumentRequest): Promise<Document> {
    const current = await this.repository.lockLive(documentId);
    if (!current) throw documentNotFound();

    const change = this.boardingPass.resolvePatch(
      {
        type: current.type,
        hasFields: current.parsedSealed !== null,
        confirmed: current.parsedConfirmedAt !== null,
      },
      patch,
    );
    const row = await this.repository.update(documentId, {
      type: change.type,
      parsedSealed:
        change.fields === undefined
          ? undefined
          : this.boardingPass.seal(current, documentId, change.fields),
      confirmation: change.confirmation,
    });
    if (!row) throw documentNotFound();

    return this.toDocument(row);
  }

  /** Tombstone (FR-039). The object goes with the storage sweep, after retention. */
  async remove(documentId: string): Promise<void> {
    const deleted = await this.repository.tombstone(documentId);
    if (!deleted) throw documentNotFound();
  }

  private replayOf(row: DocumentRow, tripId: string): CreatedDocument {
    if (row.tripId !== tripId) throw documentIdUnavailable();
    return { document: this.toDocument(row), created: false };
  }

  /** The row, or null for a taken id — and in either failure, no object left behind. */
  private async insertOrDiscard(document: NewDocument): Promise<DocumentRow | null> {
    const row = await this.repository.insert(document).catch(async (error: unknown) => {
      await this.discard(document.storageKey);
      throw error;
    });

    if (!row) await this.discard(document.storageKey);
    return row;
  }

  /** Best effort: StorageService logs a failed delete, and the sweep retries it. */
  private discard(storageKey: string): Promise<void> {
    return this.storage.deleteObject('documents', storageKey);
  }

  /** Row → wire shape (contracts/api/documents.ts `Document`): no key, no storage key. */
  private toDocument(row: DocumentRow): Document {
    return {
      id: row.id,
      trip_id: row.tripId,
      type: row.type,
      content_type: row.contentType,
      byte_size: row.byteSize,
      parsed_json: this.boardingPass.open(row, row.id, row.parsedSealed),
      parsed_confirmed_at: row.parsedConfirmedAt?.toISOString() ?? null,
      upload_state: row.uploadState,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }
}
