/**
 * Uploading a stored document — tasks.md T118, T211 (FR-033, FR-035, FR-041;
 * rest-api.md §6; research D-32, D-33).
 *
 * A document is saved on the device first and reaches the API afterwards
 * (Constitution II). The sealed file is opened in memory and sent over TLS as
 * the contract's `CreateDocumentRequest` — base64 in JSON, under the
 * document's own client id — to `POST /trips/:tripId/documents`, where the
 * API seals it again under a per-document key before anything reaches the
 * bucket (D-32). A retried upload with the same id answers with the stored
 * document, so retrying is safe. Fields confirmed on the device travel as
 * `confirmed: true`; a confirmation or correction made after the upload is a
 * `PATCH /documents/:id` (D-33).
 *
 * How an attempt ends:
 *   - success → `uploaded`, and clean only for the version the API received;
 *   - offline, a timeout, a server fault, rate limiting, an ended session, or
 *     a trip the API has not received yet (trips reach it with User Story 6's
 *     sync) → still `pending`, shown as a badge; no dialog, no report;
 *   - `413 DOCUMENT_TOO_LARGE` → `failed`, in words, never retried;
 *   - anything else → reported to Sentry — the error only, never the image,
 *     the fields or the request — and still `pending`.
 *
 * Attempts are asked for by the upload queue (sync/upload-queue.ts, T134):
 * right after a capture or a confirmation and whenever the list gains focus,
 * at once on Wi-Fi and after a hold-back on cellular. One document is never
 * uploaded twice at once.
 *
 * Deleting a document cancels its upload (`cancelDocumentUpload`;
 * sync-protocol.md §4): the request in flight is aborted, and an attempt that
 * finds its document gone — or its sealed file, deleted a moment before it was
 * read — ends as `missing` without a word to the traveller or to Sentry.
 *
 * Visibility posture: owner-only, structurally. Every request is the
 * signed-in traveller's own, and no request carries a visibility field
 * (the contract's strict shapes refuse one, FR-032).
 */
import {
  CreateDocumentRequest,
  DocumentResponse,
  PatchDocumentRequest,
} from '@triptrackr/contracts';

import type { AppDatabase } from '@/db/client';
import { documentsRepository } from '@/db/repositories/documents';
import type { DocumentRow } from '@/db/schema';
import { ApiRequestError, apiFetch } from '@/lib/api-client';
import { Sentry } from '@/lib/sentry';

import { openSealedFile } from './document-vault';

/** Where an attempt left the document. `missing`: deleted, or never on this device. */
export type UploadOutcome = 'uploaded' | 'pending' | 'failed' | 'missing';

/** Refusals that time, a connection or the next sync resolve on their own. */
function waitsForLater(error: ApiRequestError): boolean {
  return (
    error.status === 0 ||
    error.status === 401 ||
    error.status === 429 ||
    error.status >= 500 ||
    error.code === 'TRIP_NOT_FOUND'
  );
}

/** How a failed attempt leaves the document; only the unexpected is reported. */
function settleFailure(db: AppDatabase, id: string, error: unknown): UploadOutcome {
  if (error instanceof ApiRequestError) {
    if (error.code === 'DOCUMENT_TOO_LARGE') {
      documentsRepository.markUploadFailed(db, id);
      return 'failed';
    }
    // apiFetch has already reported a response that broke the contract.
    if (waitsForLater(error) || error.code === 'INVALID_RESPONSE') return 'pending';
  }
  Sentry.captureException(error);
  return 'pending';
}

async function post(
  db: AppDatabase,
  document: DocumentRow,
  signal: AbortSignal,
): Promise<UploadOutcome> {
  if (!document.local_file_uri) throw new Error('A pending document has no sealed file.');
  const body = CreateDocumentRequest.parse({
    id: document.id,
    type: document.type,
    content_type: 'image/jpeg',
    content_base64: await openSealedFile(document.id, document.local_file_uri),
    parsed_json: document.parsed_json,
    confirmed: document.parsed_json !== null && document.parsed_confirmed_at !== null,
  });
  // Deleted while the file was being opened: nothing to send.
  if (signal.aborted) return 'missing';
  await apiFetch(DocumentResponse, `/trips/${document.trip_id}/documents`, {
    method: 'POST',
    body,
    signal,
  });
  documentsRepository.markUploaded(db, document.id, document.updated_at);
  return 'uploaded';
}

/** The fields as they now stand on the device: confirmed, a new proposal, or cleared. */
function patchBody(document: DocumentRow): PatchDocumentRequest {
  if (document.parsed_json === null) return { parsed_json: null };
  return document.parsed_confirmed_at === null
    ? { parsed_json: document.parsed_json }
    : { parsed_json: document.parsed_json, confirmed: true };
}

async function patch(
  db: AppDatabase,
  document: DocumentRow,
  signal: AbortSignal,
): Promise<UploadOutcome> {
  const body = PatchDocumentRequest.parse(patchBody(document));
  await apiFetch(DocumentResponse, `/documents/${document.id}`, {
    method: 'PATCH',
    body,
    signal,
  });
  documentsRepository.markSynced(db, document.id, document.updated_at);
  return 'uploaded';
}

/** One request, if the document needs one. */
async function step(
  db: AppDatabase,
  id: string,
  signal: AbortSignal,
): Promise<UploadOutcome> {
  const document = documentsRepository.byId(db, id);
  if (!document || signal.aborted) return 'missing';
  if (document.upload_state === 'failed') return 'failed';
  if (document.upload_state === 'uploaded' && !document.is_dirty) return 'uploaded';
  try {
    return document.upload_state === 'pending'
      ? await post(db, document, signal)
      : await patch(db, document, signal);
  } catch (error) {
    // Whatever broke, a cancelled upload is not a fault: its document is gone.
    return signal.aborted ? 'missing' : settleFailure(db, id, error);
  }
}

/** Upload, then send at once anything the traveller changed while it travelled. */
async function reconcile(
  db: AppDatabase,
  id: string,
  signal: AbortSignal,
): Promise<UploadOutcome> {
  const first = await step(db, id, signal);
  if (first !== 'uploaded') return first;
  return documentsRepository.byId(db, id)?.is_dirty ? step(db, id, signal) : first;
}

const running = new Map<string, Promise<UploadOutcome>>();

/** The switch that cancels each document's upload, for as long as one runs. */
const cancellers = new Map<string, AbortController>();

/**
 * Stop a document's upload, if one is running — its record is being deleted
 * (sync-protocol.md §4). The caller tombstones the row and removes the sealed
 * file; this ends the request that would otherwise carry it to the API.
 */
export function cancelDocumentUpload(documentId: string): void {
  cancellers.get(documentId)?.abort();
}

/**
 * Bring one document up to date with the API. Never rejects. A second call
 * while one is running shares it rather than sending the bytes twice.
 */
export function uploadDocument(
  db: AppDatabase,
  documentId: string,
): Promise<UploadOutcome> {
  const current = running.get(documentId);
  if (current) return current;
  const canceller = new AbortController();
  cancellers.set(documentId, canceller);
  const attempt = reconcile(db, documentId, canceller.signal)
    .catch((error: unknown): UploadOutcome => {
      if (canceller.signal.aborted) return 'missing';
      Sentry.captureException(error);
      return 'pending';
    })
    .finally(() => {
      running.delete(documentId);
      cancellers.delete(documentId);
    });
  running.set(documentId, attempt);
  return attempt;
}

/**
 * Every document of a trip with something for the API, one at a time — hotel
 * Wi-Fi carries one boarding pass better than five at once. Never rejects.
 */
export async function uploadPendingDocuments(
  db: AppDatabase,
  tripId: string,
): Promise<void> {
  try {
    for (const id of documentsRepository.needingUploadIds(db, tripId)) {
      await uploadDocument(db, id);
    }
  } catch (error) {
    Sentry.captureException(error);
  }
}
