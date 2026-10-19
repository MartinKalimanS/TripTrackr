/**
 * T546 - what the trip screen says about synchronisation (spec FR-026, FR-043, FR-065; data-model
 * section 8): the one chip, and the one slim banner (offline, an upload that failed, a sync that
 * failed). `deriveTripSync` is pure over the sync runtime's existing status and the counts of this
 * trip; the hook binds it to that status and to the two retries (the failed uploads, or a sync
 * now). It reads status and counts and writes nothing: a record not yet uploaded is never shown
 * as saved, and nothing here changes what is synchronised.
 *
 * THIS IS A LOCAL SEAM for the chrome branch's global chip state (T529, `useSyncChipState`):
 * until it lands the chip counts the changes still waiting on this trip. The words are the
 * spec's (FR-065).
 */
import { renderHook } from '@testing-library/react-native';

import {
  deriveTripSync,
  offlineMessage,
  useTripSync,
  type TripSyncInput,
} from '@/features/trips/use-trip-sync';
import type { SyncStatus } from '@/sync/types';

const mockStatus: { current: SyncStatus } = {
  current: { phase: 'idle', firstSyncComplete: true, lastSyncedAt: null, failure: null },
};
const mockSyncNow = jest.fn();
const mockRetryUpload = jest.fn();
jest.mock('@/sync/engine', () => ({
  useSyncStatus: () => mockStatus.current,
  syncNow: (...args: unknown[]) => mockSyncNow(...args),
}));
jest.mock('@/features/photos/use-photos', () => ({
  usePhotoActions: () => ({ retryUpload: mockRetryUpload }),
}));

const idle: SyncStatus = {
  phase: 'idle',
  firstSyncComplete: true,
  lastSyncedAt: null,
  failure: null,
};

function input(overrides: Partial<TripSyncInput> = {}): TripSyncInput {
  return { status: idle, pending: 0, failedPhotos: 0, ...overrides };
}

describe('deriveTripSync: the chip', () => {
  test('nothing waiting and nothing wrong: synchronised, no chip, no banner', () => {
    expect(deriveTripSync(input())).toEqual({ state: { kind: 'synced' }, banner: null });
  });

  test('changes waiting on a quiet connection are "waiting" with their count', () => {
    expect(deriveTripSync(input({ pending: 3 })).state).toEqual({
      kind: 'waiting',
      count: 3,
    });
  });

  test('a cycle under way with changes waiting is "syncing"; with none it shows nothing', () => {
    const pushing: SyncStatus = { ...idle, phase: 'pushing' };
    expect(deriveTripSync(input({ status: pushing, pending: 2 })).state).toEqual({
      kind: 'syncing',
      count: 2,
    });
    expect(deriveTripSync(input({ status: pushing })).state).toEqual({ kind: 'synced' });
  });

  test('a cycle that could not reach the server is "offline", with the count', () => {
    const offline: SyncStatus = { ...idle, failure: 'offline' };
    expect(deriveTripSync(input({ status: offline, pending: 3 })).state).toEqual({
      kind: 'offline',
      count: 3,
    });
  });

  test('a cycle the server failed is "failed", with the count', () => {
    for (const failure of ['server', 'invalid_response'] as const) {
      expect(
        deriveTripSync(input({ status: { ...idle, failure }, pending: 2 })).state,
      ).toEqual({ kind: 'failed', count: 2 });
    }
  });

  test('a session that ended is not a sync chip matter: the app signs the device out', () => {
    expect(
      deriveTripSync(input({ status: { ...idle, failure: 'unauthorized' }, pending: 2 }))
        .state,
    ).toEqual({ kind: 'waiting', count: 2 });
  });
});

describe('deriveTripSync: the banner (one, never two)', () => {
  test("offline says so and what will happen, in the spec's words", () => {
    const offline: SyncStatus = { ...idle, failure: 'offline' };
    expect(deriveTripSync(input({ status: offline, pending: 3 })).banner).toEqual({
      tone: 'offline',
      message: "Offline. 3 changes will sync when you're back online.",
      action: null,
    });
  });

  test('failed uploads say how many and that they are safe on the phone, with a Retry for them', () => {
    expect(deriveTripSync(input({ failedPhotos: 2, pending: 2 })).banner).toEqual({
      tone: 'error',
      message: "2 photos couldn't upload. They are safe on this phone.",
      action: 'photos',
    });
    expect(deriveTripSync(input({ failedPhotos: 1 })).banner?.message).toBe(
      "1 photo couldn't upload. It is safe on this phone.",
    );
  });

  test('a failed sync says the trips are safe, with a Retry that syncs', () => {
    const failed: SyncStatus = { ...idle, failure: 'server' };
    expect(deriveTripSync(input({ status: failed, pending: 2 })).banner).toEqual({
      tone: 'error',
      message: "Couldn't sync 2 changes. Your trips are safe on this phone.",
      action: 'sync',
    });
    expect(deriveTripSync(input({ status: failed, pending: 1 })).banner?.message).toBe(
      "Couldn't sync 1 change. Your trips are safe on this phone.",
    );
  });

  test('offline wins over a failed upload, which wins over a failed sync', () => {
    const offline: SyncStatus = { ...idle, failure: 'offline' };
    expect(deriveTripSync(input({ status: offline, failedPhotos: 2 })).banner?.tone).toBe(
      'offline',
    );
    const failed: SyncStatus = { ...idle, failure: 'server' };
    expect(
      deriveTripSync(input({ status: failed, failedPhotos: 2 })).banner?.action,
    ).toBe('photos');
  });

  test('a sync that failed with nothing of this trip waiting still says so, once', () => {
    const failed: SyncStatus = { ...idle, failure: 'server' };
    expect(deriveTripSync(input({ status: failed })).banner?.message).toBe(
      "Couldn't sync. Your trips are safe on this phone.",
    );
  });
});

describe('offlineMessage', () => {
  test('counts the changes, with a plural that agrees, and says it plainly with none', () => {
    expect(offlineMessage(1)).toBe(
      "Offline. 1 change will sync when you're back online.",
    );
    expect(offlineMessage(4)).toBe(
      "Offline. 4 changes will sync when you're back online.",
    );
    expect(offlineMessage(0)).toBe("Offline. Changes will sync when you're back online.");
  });
});

describe('useTripSync', () => {
  const trip = { is_dirty: true };

  beforeEach(() => {
    mockStatus.current = idle;
    mockSyncNow.mockReset();
    mockRetryUpload.mockReset();
  });

  function run(extra: Record<string, unknown> = {}) {
    return renderHook(() =>
      useTripSync({
        trip,
        stops: [{ is_dirty: true }, { is_dirty: false }],
        overview: { pending: 2, failedPhotoIds: [] },
        ...extra,
      } as never),
    );
  }

  test("counts this trip's waiting changes: the trip, its dirty stops and the rows of its areas", async () => {
    const { result } = await run();
    // trip (1) + one dirty stop (1) + 2 pending rows in the areas.
    expect(result.current.state).toEqual({ kind: 'waiting', count: 4 });
  });

  test("reads the sync runtime's status live", async () => {
    mockStatus.current = { ...idle, failure: 'offline' };
    const { result } = await run();
    expect(result.current.state.kind).toBe('offline');
    expect(result.current.banner?.tone).toBe('offline');
  });

  test("Retry on a failed sync syncs now, for the traveller's own reason", async () => {
    mockStatus.current = { ...idle, failure: 'server' };
    const { result } = await run();
    result.current.retry();
    expect(mockSyncNow).toHaveBeenCalledWith('manual');
    expect(mockRetryUpload).not.toHaveBeenCalled();
  });

  test('Retry on failed uploads puts each failed photo back in the queue, and does not sync', async () => {
    const { result } = await run({
      overview: { pending: 0, failedPhotoIds: ['p1', 'p2'] },
    });
    expect(result.current.banner?.action).toBe('photos');
    result.current.retry();
    expect(mockRetryUpload.mock.calls).toEqual([['p1'], ['p2']]);
    expect(mockSyncNow).not.toHaveBeenCalled();
  });

  test("the chip's own Retry (a failed sync) syncs now even when the banner is about photos", async () => {
    mockStatus.current = { ...idle, failure: 'server' };
    const { result } = await run({
      overview: { pending: 0, failedPhotoIds: ['p1'] },
    });
    result.current.retrySync();
    expect(mockSyncNow).toHaveBeenCalledWith('manual');
    expect(mockRetryUpload).not.toHaveBeenCalled();
  });
});
