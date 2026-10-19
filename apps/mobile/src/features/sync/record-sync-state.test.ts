/**
 * T529 - the per-record marker (feature 005, contract C5-16 `SyncBadge`; FR-026, FR-065): which
 * words a record that is not yet on the server carries. A record the server has acknowledged
 * carries nothing; one waiting carries "Not yet synced"; one a push is sending, "Syncing"; a
 * photograph or document whose upload failed, "Sync failed". Pure over the row's own columns:
 * it reads nothing else and writes nothing.
 */
import { recordSyncState } from './record-sync-state';

describe('recordSyncState()', () => {
  test('a record the server has is not marked', () => {
    expect(recordSyncState({ is_dirty: false })).toBeNull();
    expect(recordSyncState({ is_dirty: false, upload_state: 'uploaded' })).toBeNull();
  });

  test('a record with an edit still to send is pending', () => {
    expect(recordSyncState({ is_dirty: true })).toBe('pending');
    expect(recordSyncState({ is_dirty: true, upload_state: 'uploaded' })).toBe('pending');
  });

  test('a photograph or document whose bytes have not arrived is pending too', () => {
    expect(recordSyncState({ is_dirty: true, upload_state: 'pending' })).toBe('pending');
  });

  test('a failed upload is failed, whether or not a push is running', () => {
    expect(recordSyncState({ is_dirty: true, upload_state: 'failed' })).toBe('failed');
    expect(recordSyncState({ is_dirty: true, upload_state: 'failed' }, true)).toBe(
      'failed',
    );
  });

  test('a push in progress turns a waiting record into a syncing one', () => {
    expect(recordSyncState({ is_dirty: true }, true)).toBe('syncing');
    expect(recordSyncState({ is_dirty: true, upload_state: 'pending' }, true)).toBe(
      'syncing',
    );
  });

  test('a push in progress marks nothing that is already synchronised', () => {
    expect(recordSyncState({ is_dirty: false }, true)).toBeNull();
  });
});
