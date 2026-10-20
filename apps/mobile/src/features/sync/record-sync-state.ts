/**
 * `recordSyncState(record, pushing)` - the per-record sync marker (feature 005, contract C5-16
 * `SyncBadge`; FR-026, FR-065, research D5-17): which words a record that is not yet on the
 * server carries, so a screen never presents one as saved before it is (Constitution II).
 *
 *   const state = recordSyncState(trip, useIsPushing());
 *   {state ? <SyncBadge state={state} /> : null}
 *
 * - A record the server has acknowledged (`is_dirty` false) carries nothing.
 * - A photograph or document whose upload failed is `failed`, "Sync failed", whether or not a
 *   push is running (its bytes are not on the server and will not get there by themselves).
 * - A record with an edit still to send, or a photograph or document whose bytes have not
 *   arrived, is `pending`, "Not yet synced"; while a push runs it is `syncing`.
 *
 * Pure over the row's own columns: it reads nothing else, queries nothing and writes nothing.
 * `SyncState` is the adapter's, which draws the icon and the words.
 */
import type { SyncState } from '@/components/ui/sync-badge';

/** The columns every synchronised row has, and the upload state of the two byte-backed ones. */
export interface SyncableRecord {
  is_dirty: boolean;
  upload_state?: 'pending' | 'uploaded' | 'failed';
}

export function recordSyncState(
  record: SyncableRecord,
  pushing = false,
): SyncState | null {
  if (!record.is_dirty) return null;
  if (record.upload_state === 'failed') return 'failed';
  return pushing ? 'syncing' : 'pending';
}
