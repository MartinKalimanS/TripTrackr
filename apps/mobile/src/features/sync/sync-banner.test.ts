/**
 * T529 - the data of the sync banner (feature 005, contract C5-28 `Banner`; FR-065): offline is
 * a slim, calm notice, never an error; a failed sync says in words that the data is safe on the
 * phone and offers Retry. `syncBannerOf` turns a `SyncChipState` into what a screen hands the
 * `Banner` adapter, or `null` when there is nothing to say (synced, waiting, syncing: the chip
 * alone speaks then). Pure; the strings are the spec's.
 */
import { syncBannerOf } from './sync-banner';

describe('syncBannerOf()', () => {
  test('offline: the amber notice, with how many changes will sync when it is back', () => {
    expect(syncBannerOf({ kind: 'offline', count: 3 })).toEqual({
      tone: 'offline',
      message: "Offline. 3 changes will sync when you're back online.",
    });
  });

  test('offline with one change is singular, and with none says changes will sync', () => {
    expect(syncBannerOf({ kind: 'offline', count: 1 })).toMatchObject({
      message: "Offline. 1 change will sync when you're back online.",
    });
    expect(syncBannerOf({ kind: 'offline', count: 0 })).toMatchObject({
      message: "Offline. Changes will sync when you're back online.",
    });
  });

  test('offline offers no action: there is nothing to retry until the network is back', () => {
    expect(syncBannerOf({ kind: 'offline', count: 3 })).not.toHaveProperty('action');
  });

  test('failed: the danger notice, a calm line that the data is safe, and Retry', () => {
    expect(syncBannerOf({ kind: 'failed', count: 2 })).toEqual({
      tone: 'error',
      message: "Couldn't sync 2 changes. Your trips are safe on this phone.",
      action: { label: 'Retry' },
    });
  });

  test('failed with one change, or none', () => {
    expect(syncBannerOf({ kind: 'failed', count: 1 })).toMatchObject({
      message: "Couldn't sync 1 change. Your trips are safe on this phone.",
    });
    expect(syncBannerOf({ kind: 'failed', count: 0 })).toMatchObject({
      message: "Couldn't sync. Your trips are safe on this phone.",
    });
  });

  test.each([
    [{ kind: 'synced' }],
    [{ kind: 'waiting', count: 4 }],
    [{ kind: 'syncing', count: 4 }],
  ] as const)('%j has no banner: the chip alone speaks', (state) => {
    expect(syncBannerOf(state)).toBeNull();
  });
});
