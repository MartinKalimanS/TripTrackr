import type { AppDatabase } from '@/db/client';

/**
 * The binary upload queue's public surface (tasks.md T134; sync-protocol.md §4;
 * FR-041). The bodies below are the seam other modules build against; the
 * queue itself replaces them.
 *
 * - `startUploadQueue(db)` binds the signed-in traveller's database and returns
 *   the function that unbinds it.
 * - `kickUploadQueue(reason)` asks the queue to look for work now: after a
 *   capture, when connectivity returns, when the app is foregrounded. Never
 *   rejects.
 * - `countPendingUploads(db)` is the number of photos and documents whose bytes
 *   the object store has not confirmed. The sign-out guard adds it to the
 *   engine's dirty-row count: a record without its bytes is not saved.
 */
export function startUploadQueue(_db: AppDatabase): () => void {
  return () => undefined;
}

export function kickUploadQueue(_reason: string): Promise<void> {
  return Promise.resolve();
}

export function countPendingUploads(_db: AppDatabase): Promise<number> {
  return Promise.resolve(0);
}
