/**
 * Travel documents as live local queries — tasks.md T211 (FR-031, FR-036,
 * FR-041; Constitution II).
 *
 * Screens read the encrypted local store through Drizzle's `useLiveQuery`
 * (as `use-notes.ts` does); writes go through the repository first and never
 * wait on the network. Storing a capture or confirming its fields then asks
 * the upload queue to look for work (`kickUploadQueue`, sync/upload-queue.ts —
 * T134: at once on Wi-Fi, after a hold-back on cellular) — never awaited by
 * the screen, never shown as a dialog; the list's badge says what is still
 * pending. Deleting a document cancels its upload in flight and deletes its
 * sealed file (sync-protocol.md §4). Ids are minted with `expo-crypto`'s
 * `randomUUID()` in `capture.ts` (research D-15).
 *
 * `useDocumentImage` is the viewer's image: the sealed file decrypted to
 * base64 in memory (`document-vault.ts`), for a data URI that is never
 * written to disk, and dropped with the component that asked for it.
 *
 * Visibility posture: owner-only, structurally (FR-032). The per-account
 * store holds the signed-in traveller's own documents only; nothing here
 * exposes one to anyone else, and no action can.
 */
import type { DocumentParsedFields } from '@triptrackr/contracts';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useEffect, useMemo, useState } from 'react';

import { useDatabase } from '@/db/client';
import { documentsRepository } from '@/db/repositories/documents';
import type { DocumentRow } from '@/db/schema';
import type { LiveResult } from '@/features/trips/use-trips';
import { Sentry } from '@/lib/sentry';
import { kickUploadQueue } from '@/sync/upload-queue';

import { storeDocument, type StoreDocumentInput } from './capture';
import { openSealedFile, removeSealedFile } from './document-vault';
import { cancelDocumentUpload } from './upload';

/** A trip's live documents, newest first. */
export function useDocuments(tripId: string): LiveResult<DocumentRow[]> {
  const db = useDatabase();
  const result = useLiveQuery(documentsRepository.forTripQuery(db, tripId), [tripId]);
  return {
    data: result.data,
    loading: result.updatedAt === undefined,
    error: result.error ?? null,
  };
}

/** One document, or `null` once the store has answered and it is not there. */
export function useDocument(documentId: string): LiveResult<DocumentRow | null> {
  const db = useDatabase();
  const result = useLiveQuery(documentsRepository.byIdQuery(db, documentId), [
    documentId,
  ]);
  return {
    data: result.data[0] ?? null,
    loading: result.updatedAt === undefined,
    error: result.error ?? null,
  };
}

export interface DocumentActions {
  /** Re-encode, seal and store a capture; then try to upload it. */
  store: (input: StoreDocumentInput) => Promise<DocumentRow>;
  /** Store the checked fields as confirmed; then try to send them. */
  confirmFields: (documentId: string, fields: DocumentParsedFields) => DocumentRow;
  /** Tombstone the document, cancel its upload and delete its sealed file. */
  remove: (documentId: string) => void;
  /**
   * The list gained focus: ask the upload queue to look for what the API is
   * still owed. The queue works through every trip, so the argument only says
   * where the traveller is. Never rejects.
   */
  syncTrip: (tripId: string) => Promise<void>;
}

export function useDocumentActions(): DocumentActions {
  const db = useDatabase();
  return useMemo(
    () => ({
      store: async (input) => {
        const document = await storeDocument(db, input);
        void kickUploadQueue('capture');
        return document;
      },
      confirmFields: (documentId, fields) => {
        const document = documentsRepository.confirmFields(db, documentId, fields);
        void kickUploadQueue('confirm');
        return document;
      },
      remove: (documentId) => {
        const released = documentsRepository.remove(db, documentId);
        if (!released) return;
        cancelDocumentUpload(documentId);
        try {
          removeSealedFile(released);
        } catch (error) {
          // The row is gone and the file is ciphertext: report, do not undo.
          Sentry.captureException(error);
        }
      },
      syncTrip: (_tripId) => kickUploadQueue('focus'),
    }),
    [db],
  );
}

export type DocumentImage =
  /** No sealed file on this device (a document another device captured). */
  | { status: 'absent' }
  | { status: 'opening' }
  | { status: 'ready'; base64: string }
  /** The file is there but will not open: another key, or damage. */
  | { status: 'unreadable' };

interface Opened {
  key: string;
  base64: string | null;
}

/** A document's image, decrypted in memory for as long as the caller is mounted. */
export function useDocumentImage(documentId: string, path: string | null): DocumentImage {
  const key = `${documentId}|${path ?? ''}`;
  const [opened, setOpened] = useState<Opened | null>(null);

  useEffect(() => {
    if (path === null) return undefined;
    let current = true;
    openSealedFile(documentId, path).then(
      (base64) => {
        if (current) setOpened({ key, base64 });
      },
      (error: unknown) => {
        Sentry.captureException(error);
        if (current) setOpened({ key, base64: null });
      },
    );
    return () => {
      current = false;
    };
  }, [documentId, path, key]);

  if (path === null) return { status: 'absent' };
  if (opened?.key !== key) return { status: 'opening' };
  return opened.base64 === null
    ? { status: 'unreadable' }
    : { status: 'ready', base64: opened.base64 };
}
