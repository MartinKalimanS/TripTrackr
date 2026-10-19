/**
 * Feature 005, T541 (FR-026, FR-065; data-model section 8) - the thin seam that gives the Trips
 * screen its sync chip and its banner until `features/sync/use-sync-chip-state.ts` (T529) lands.
 *
 * It READS and writes nothing (Constitution I and II): the number of rows still waiting to
 * upload over the seven synchronised tables (`syncRepository.countUnsynced`, re-read whenever
 * the list or the sync runtime changes) and the sync runtime's own status (`useSyncStatus`):
 * a cycle running with rows waiting is `syncing` (with none it is a pull, and nothing is
 * said), a failure to reach the server is `offline`, any other failure is
 * `failed`, rows waiting with nothing running is `waiting`, and nothing at all is `synced`.
 * Real SQLite, and the real engine status store.
 */
import { act, renderHook } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { DatabaseProvider } from '@/db/client';
import { trips } from '@/db/schema';
import { useTripsSync } from '@/features/trips/use-trips-sync';
import { syncNow, useSyncStatusStore } from '@/sync/engine';

import { createTestDatabase, type TestSqlite } from '../db/sqlite-harness';

jest.mock('@/sync/engine', () => {
  const actual = jest.requireActual('@/sync/engine') as typeof import('@/sync/engine');
  return { ...actual, syncNow: jest.fn(() => Promise.resolve({ ok: true })) };
});

const NOW = '2026-06-01T10:00:00.000Z';
let sqlite: TestSqlite;

function wrapper({ children }: PropsWithChildren) {
  return <DatabaseProvider value={sqlite.db}>{children}</DatabaseProvider>;
}

beforeEach(async () => {
  sqlite = await createTestDatabase();
  useSyncStatusStore.setState({
    phase: 'idle',
    firstSyncComplete: true,
    lastSyncedAt: NOW,
    failure: null,
  });
  jest.mocked(syncNow).mockClear();
});

afterEach(() => sqlite.close());

function addTrips(count: number, dirty: boolean) {
  for (let n = 0; n < count; n += 1) {
    sqlite.db
      .insert(trips)
      .values({
        id: `trip-${dirty ? 'dirty' : 'clean'}-${n}`,
        title: 'T',
        home_currency: 'EUR',
        created_at: NOW,
        updated_at: NOW,
        is_dirty: dirty,
      })
      .run();
  }
}

async function renderSync() {
  return renderHook((watch: unknown) => useTripsSync(watch), {
    wrapper,
    initialProps: [] as unknown,
  });
}

describe('useTripsSync: the chip', () => {
  test('is synced, and says nothing, when no row waits and nothing runs', async () => {
    addTrips(2, false);
    const { result } = await renderSync();

    expect(result.current.chip).toEqual({ kind: 'synced' });
    expect(result.current.banner).toBeNull();
  });

  test('is waiting, with the number of rows, when changes wait and nothing runs', async () => {
    addTrips(3, true);
    const { result } = await renderSync();

    expect(result.current.chip).toEqual({ kind: 'waiting', count: 3 });
    expect(result.current.banner).toBeNull();
  });

  test('is syncing while a cycle pushes or pulls', async () => {
    addTrips(2, true);
    useSyncStatusStore.setState({ phase: 'pushing' });
    const { result } = await renderSync();
    expect(result.current.chip).toEqual({ kind: 'syncing', count: 2 });

    await act(async () => useSyncStatusStore.setState({ phase: 'pulling' }));
    expect(result.current.chip).toEqual({ kind: 'syncing', count: 2 });
  });

  test('says nothing while a cycle runs and no row waits: a pull alone is not news ("0" with a spinner)', async () => {
    useSyncStatusStore.setState({ phase: 'pulling' });
    const { result } = await renderSync();

    expect(result.current.chip).toEqual({ kind: 'synced' });
    expect(result.current.banner).toBeNull();
  });

  test('is offline when the last cycle could not reach the server', async () => {
    addTrips(3, true);
    useSyncStatusStore.setState({ failure: 'offline' });
    const { result } = await renderSync();

    expect(result.current.chip).toEqual({ kind: 'offline', count: 3 });
  });

  test.each(['server', 'invalid_response'] as const)(
    'is failed after a %s failure',
    async (failure) => {
      addTrips(2, true);
      useSyncStatusStore.setState({ failure });
      const { result } = await renderSync();

      expect(result.current.chip).toEqual({ kind: 'failed', count: 2 });
    },
  );

  test('says nothing when the session has ended: the signed-out screens speak for it', async () => {
    addTrips(2, true);
    useSyncStatusStore.setState({ failure: 'unauthorized' });
    const { result } = await renderSync();

    expect(result.current.chip).toEqual({ kind: 'synced' });
    expect(result.current.banner).toBeNull();
  });

  test('counts again when the list changes or a cycle ends', async () => {
    const { result, rerender } = await renderSync();
    expect(result.current.chip).toEqual({ kind: 'synced' });

    addTrips(1, true);
    await rerender([{}]);
    expect(result.current.chip).toEqual({ kind: 'waiting', count: 1 });

    await act(async () => {
      sqlite.native.exec('UPDATE trips SET is_dirty = 0');
      useSyncStatusStore.setState({ lastSyncedAt: '2026-06-01T10:05:00.000Z' });
    });
    expect(result.current.chip).toEqual({ kind: 'synced' });
  });
});

describe('useTripsSync: the banner (FR-065)', () => {
  test('offline says how many changes will sync when the traveller is back', async () => {
    addTrips(3, true);
    useSyncStatusStore.setState({ failure: 'offline' });
    const { result } = await renderSync();

    expect(result.current.banner).toEqual({
      tone: 'offline',
      message: "Offline. 3 changes will sync when you're back online.",
    });
  });

  test('offline with one change says "1 change"', async () => {
    addTrips(1, true);
    useSyncStatusStore.setState({ failure: 'offline' });
    const { result } = await renderSync();
    expect(result.current.banner?.message).toBe(
      "Offline. 1 change will sync when you're back online.",
    );
  });

  test('offline with nothing waiting still says what happens to changes made now', async () => {
    useSyncStatusStore.setState({ failure: 'offline' });
    const { result } = await renderSync();
    expect(result.current.banner).toEqual({
      tone: 'offline',
      message: "Offline. Changes you make will sync when you're back online.",
    });
  });

  test('a failed sync is calm: the trips are safe on this phone, and Retry is offered', async () => {
    addTrips(2, true);
    useSyncStatusStore.setState({ failure: 'server' });
    const { result } = await renderSync();

    expect(result.current.banner).toMatchObject({
      tone: 'error',
      message: "Couldn't sync 2 changes. Your trips are safe on this phone.",
      action: { label: 'Retry' },
    });
  });

  test('Retry runs a manual sync, and the chip retries the same way', async () => {
    addTrips(2, true);
    useSyncStatusStore.setState({ failure: 'server' });
    const { result } = await renderSync();

    await act(async () => result.current.banner?.action?.onPress());
    expect(syncNow).toHaveBeenCalledWith('manual');

    await act(async () => result.current.retry());
    expect(syncNow).toHaveBeenCalledTimes(2);
  });

  test('a failure with nothing waiting is still said, without a count', async () => {
    useSyncStatusStore.setState({ failure: 'server' });
    const { result } = await renderSync();
    expect(result.current.banner?.message).toBe(
      "Couldn't sync. Your trips are safe on this phone.",
    );
  });
});
