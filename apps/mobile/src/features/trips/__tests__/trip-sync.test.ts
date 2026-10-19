/**
 * T546/T529 - what the trip screen says about synchronisation (spec FR-026, FR-043, FR-065;
 * data-model section 8): the ONE global chip (`useSyncChipState`, never a count of this trip
 * alone: a record not uploaded is not saved, wherever it is) and the one slim banner (offline,
 * an upload that failed, a sync that failed). `deriveTripSync` is pure over the chip state and
 * the number of this trip's photos whose upload failed; the hook binds it to the two retries
 * (the failed uploads, or a sync now). It reads and writes nothing. The words are the spec's.
 */
import { renderHook } from '@testing-library/react-native';

import type { SyncChipState } from '@/features/sync/use-sync-chip-state';
import {
  deriveTripSync,
  offlineMessage,
  useTripSync,
  type TripSyncInput,
} from '@/features/trips/use-trip-sync';

const mockChip: { current: SyncChipState } = { current: { kind: 'synced' } };
const mockSyncNow = jest.fn();
const mockRetryUpload = jest.fn();
jest.mock('@/features/sync/use-sync-chip-state', () => ({
  useSyncChipState: () => mockChip.current,
}));
jest.mock('@/sync/engine', () => ({
  syncNow: (...args: unknown[]) => mockSyncNow(...args),
}));
jest.mock('@/features/photos/use-photos', () => ({
  usePhotoActions: () => ({ retryUpload: mockRetryUpload }),
}));

const synced: SyncChipState = { kind: 'synced' };

function input(overrides: Partial<TripSyncInput> = {}): TripSyncInput {
  return { chip: synced, failedPhotos: 0, ...overrides };
}

describe('deriveTripSync: the chip', () => {
  test('nothing waiting and nothing wrong: synchronised, no chip, no banner', () => {
    expect(deriveTripSync(input())).toEqual({ state: synced, banner: null });
  });

  test('the chip is the global one, whatever its state', () => {
    for (const chip of [
      { kind: 'waiting', count: 3 },
      { kind: 'syncing', count: 2 },
      { kind: 'offline', count: 3 },
      { kind: 'failed', count: 2 },
    ] as const) {
      expect(deriveTripSync(input({ chip })).state).toBe(chip);
    }
  });
});

describe('deriveTripSync: the banner (one, never two)', () => {
  test('waiting and syncing say nothing: the chip alone speaks', () => {
    expect(
      deriveTripSync(input({ chip: { kind: 'waiting', count: 3 } })).banner,
    ).toBeNull();
    expect(
      deriveTripSync(input({ chip: { kind: 'syncing', count: 3 } })).banner,
    ).toBeNull();
  });

  test("offline says so and what will happen, in the spec's words", () => {
    expect(deriveTripSync(input({ chip: { kind: 'offline', count: 3 } })).banner).toEqual(
      {
        tone: 'offline',
        message: "Offline. 3 changes will sync when you're back online.",
        action: null,
      },
    );
  });

  test('failed uploads say how many and that they are safe on the phone, with a Retry for them', () => {
    expect(deriveTripSync(input({ failedPhotos: 2 })).banner).toEqual({
      tone: 'error',
      message: "2 photos couldn't upload. They are safe on this phone.",
      action: 'photos',
    });
    expect(deriveTripSync(input({ failedPhotos: 1 })).banner?.message).toBe(
      "1 photo couldn't upload. It is safe on this phone.",
    );
  });

  test('a failed sync says the trips are safe, with a Retry that syncs', () => {
    expect(deriveTripSync(input({ chip: { kind: 'failed', count: 2 } })).banner).toEqual({
      tone: 'error',
      message: "Couldn't sync 2 changes. Your trips are safe on this phone.",
      action: 'sync',
    });
    expect(
      deriveTripSync(input({ chip: { kind: 'failed', count: 1 } })).banner?.message,
    ).toBe("Couldn't sync 1 change. Your trips are safe on this phone.");
  });

  test('offline wins over a failed upload, which wins over a failed sync', () => {
    expect(
      deriveTripSync(input({ chip: { kind: 'offline', count: 0 }, failedPhotos: 2 }))
        .banner?.tone,
    ).toBe('offline');
    expect(
      deriveTripSync(input({ chip: { kind: 'failed', count: 0 }, failedPhotos: 2 }))
        .banner?.action,
    ).toBe('photos');
  });

  test('a sync that failed with nothing waiting still says so, once', () => {
    expect(
      deriveTripSync(input({ chip: { kind: 'failed', count: 0 } })).banner?.message,
    ).toBe("Couldn't sync. Your trips are safe on this phone.");
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
  beforeEach(() => {
    mockChip.current = synced;
    mockSyncNow.mockReset();
    mockRetryUpload.mockReset();
  });

  function run(failedPhotoIds: string[] = []) {
    return renderHook(() => useTripSync({ overview: { failedPhotoIds } }));
  }

  test("reads the global chip live: another trip's waiting changes show here too", async () => {
    mockChip.current = { kind: 'waiting', count: 4 };
    const { result } = await run();
    expect(result.current.state).toEqual({ kind: 'waiting', count: 4 });
  });

  test('an offline phone shows the offline banner here as well', async () => {
    mockChip.current = { kind: 'offline', count: 2 };
    const { result } = await run();
    expect(result.current.state.kind).toBe('offline');
    expect(result.current.banner?.tone).toBe('offline');
  });

  test("Retry on a failed sync syncs now, for the traveller's own reason", async () => {
    mockChip.current = { kind: 'failed', count: 2 };
    const { result } = await run();
    result.current.retry();
    expect(mockSyncNow).toHaveBeenCalledWith('manual');
    expect(mockRetryUpload).not.toHaveBeenCalled();
  });

  test('Retry on failed uploads puts each failed photo back in the queue, and does not sync', async () => {
    const { result } = await run(['p1', 'p2']);
    expect(result.current.banner?.action).toBe('photos');
    result.current.retry();
    expect(mockRetryUpload.mock.calls).toEqual([['p1'], ['p2']]);
    expect(mockSyncNow).not.toHaveBeenCalled();
  });

  test("the chip's own Retry (a failed sync) syncs now even when the banner is about photos", async () => {
    mockChip.current = { kind: 'failed', count: 1 };
    const { result } = await run(['p1']);
    result.current.retrySync();
    expect(mockSyncNow).toHaveBeenCalledWith('manual');
    expect(mockRetryUpload).not.toHaveBeenCalled();
  });
});
