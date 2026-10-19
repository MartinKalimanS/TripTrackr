/**
 * Feature 005, T541/T529 (FR-026, FR-065; data-model section 8) - what the Trips screen says
 * about synchronisation: the ONE global chip (`useSyncChipState`: the dirty rows of the seven
 * synchronised tables, the network and the runtime) and the one slim banner under the filter,
 * with the Retry the failed state offers. It reads and writes nothing; Retry runs the existing
 * manual cycle. The chip's own derivation has its suite (`use-sync-chip-state`).
 */
import { renderHook } from '@testing-library/react-native';

import type { SyncChipState } from '@/features/sync/use-sync-chip-state';
import { useTripsSync } from '@/features/trips/use-trips-sync';
import { syncNow } from '@/sync/engine';

const mockChip: { current: SyncChipState } = { current: { kind: 'synced' } };
jest.mock('@/features/sync/use-sync-chip-state', () => ({
  useSyncChipState: () => mockChip.current,
}));
jest.mock('@/sync/engine', () => ({
  syncNow: jest.fn(() => Promise.resolve({ ok: true })),
}));

const run = async () => (await renderHook(() => useTripsSync())).result;

beforeEach(() => {
  mockChip.current = { kind: 'synced' };
  jest.mocked(syncNow).mockClear();
});

describe('useTripsSync: the chip', () => {
  test('is the global chip state, unchanged', async () => {
    for (const state of [
      { kind: 'synced' },
      { kind: 'waiting', count: 3 },
      { kind: 'syncing', count: 2 },
      { kind: 'offline', count: 1 },
      { kind: 'failed', count: 4 },
    ] as const) {
      mockChip.current = state;
      const result = await run();
      expect(result.current.chip).toBe(state);
    }
  });
});

describe('useTripsSync: the banner (FR-065)', () => {
  test('synchronised, waiting and syncing say nothing: the chip alone speaks', async () => {
    for (const state of [
      { kind: 'synced' },
      { kind: 'waiting', count: 3 },
      { kind: 'syncing', count: 2 },
    ] as const) {
      mockChip.current = state;
      expect((await run()).current.banner).toBeNull();
    }
  });

  test('offline is calm: what will happen, no action and no error tone', async () => {
    mockChip.current = { kind: 'offline', count: 3 };
    const { banner } = (await run()).current;
    expect(banner).toMatchObject({
      tone: 'offline',
      message: "Offline. 3 changes will sync when you're back online.",
    });
    expect(banner?.action).toBeUndefined();
  });

  test('a failed sync says the trips are safe on the phone and offers Retry', async () => {
    mockChip.current = { kind: 'failed', count: 2 };
    const { banner, retry } = (await run()).current;
    expect(banner).toMatchObject({
      tone: 'error',
      message: "Couldn't sync 2 changes. Your trips are safe on this phone.",
      action: { label: 'Retry' },
    });
    banner?.action?.onPress();
    expect(syncNow).toHaveBeenCalledWith('manual');
    jest.mocked(syncNow).mockClear();
    retry();
    expect(syncNow).toHaveBeenCalledWith('manual');
  });

  test('the same state gives the same banner object, so a screen re-renders nothing', async () => {
    mockChip.current = { kind: 'failed', count: 2 };
    const { result, rerender } = await renderHook(() => useTripsSync());
    const first = result.current;
    await rerender({});
    expect(result.current).toBe(first);
  });
});
