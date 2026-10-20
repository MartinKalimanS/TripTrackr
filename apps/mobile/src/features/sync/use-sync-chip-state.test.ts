/**
 * T529 - the state of the global sync chip (feature 005, data-model section 8, research D5-17;
 * FR-026, FR-065): the number of rows still marked `is_dirty` across the SEVEN synchronised
 * tables, the network, and the sync runtime's own status, derived into one `SyncChipState`.
 *
 * The derivation is pure and is tested on its inputs (every precedence rule is a test); the
 * hook is tested against a REAL SQLite database (Constitution III), so "the count is read from
 * the local store, live" is a fact about rows and not about a mock. What it must NOT do is as
 * much the subject: it writes nothing to the store, makes no request (privacy and
 * offline-first: the chip is a view of local state), and an offline phone is an ordinary
 * state, not an error.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { SYNC_TABLES, type SyncTable } from '@triptrackr/contracts';
import { eq } from 'drizzle-orm';
import { createElement, type ReactNode } from 'react';

import { DatabaseProvider } from '@/db/client';
import { notes } from '@/db/schema';
import { useSyncStatusStore } from '@/sync/engine';
import type { SyncStatus } from '@/sync/types';

import {
  createTestDatabase,
  read,
  seed,
  seedTrip,
  uuid,
  type TestSqlite,
} from '../../../test/sync/sync-core-fixtures';

import {
  deriveSyncChipState,
  isOffline,
  useSyncChipState,
  type SyncChipInputs,
} from './use-sync-chip-state';

// `mock`-prefixed so Jest's hoisted factory may reference it.
const mockNetwork: { state: Record<string, unknown> } = { state: {} };
jest.mock('expo-network', () => ({
  useNetworkState: () => mockNetwork.state,
  NetworkStateType: {
    NONE: 'NONE',
    UNKNOWN: 'UNKNOWN',
    WIFI: 'WIFI',
    CELLULAR: 'CELLULAR',
  },
}));

const ONLINE = { isConnected: true, isInternetReachable: true };
const IDLE = { phase: 'idle', failure: null } as const;

function inputs(overrides: Partial<SyncChipInputs> = {}): SyncChipInputs {
  return { dirtyCount: 0, network: ONLINE, status: IDLE, ...overrides };
}

describe('isOffline() - what the network says', () => {
  test.each([
    [{ isConnected: false }, true],
    [{ isInternetReachable: false }, true],
    [{ isConnected: true, isInternetReachable: false }, true],
    [{ type: 'NONE' }, true],
    [{ isConnected: true, isInternetReachable: true, type: 'WIFI' }, false],
    [{ isConnected: true, type: 'CELLULAR' }, false],
    // Before the first answer the hook says `{}`: not knowing is not being offline.
    [{}, false],
    [{ type: 'UNKNOWN' }, false],
  ])('%j is offline: %s', (state, offline) => {
    expect(isOffline(state)).toBe(offline);
  });
});

describe('deriveSyncChipState() - the five states', () => {
  test('nothing waiting, online, idle: synced (the chip draws nothing)', () => {
    expect(deriveSyncChipState(inputs())).toEqual({ kind: 'synced' });
  });

  test('records waiting, online, idle: waiting, with the count', () => {
    expect(deriveSyncChipState(inputs({ dirtyCount: 3 }))).toEqual({
      kind: 'waiting',
      count: 3,
    });
  });

  test.each(['pushing', 'pulling'] as const)(
    'a cycle running (%s) with records waiting: syncing, with the count',
    (phase) => {
      expect(
        deriveSyncChipState(inputs({ dirtyCount: 2, status: { phase, failure: null } })),
      ).toEqual({ kind: 'syncing', count: 2 });
    },
  );

  test('a cycle that only pulls, with nothing waiting, shows nothing: nothing is out of date', () => {
    expect(
      deriveSyncChipState(inputs({ status: { phase: 'pulling', failure: null } })),
    ).toEqual({ kind: 'synced' });
  });

  test('the network is gone: offline, with the count (none waiting is a count of zero)', () => {
    expect(
      deriveSyncChipState(inputs({ dirtyCount: 3, network: { isConnected: false } })),
    ).toEqual({ kind: 'offline', count: 3 });
    expect(deriveSyncChipState(inputs({ network: { isConnected: false } }))).toEqual({
      kind: 'offline',
      count: 0,
    });
  });

  test('a server failure while online: failed, with the count', () => {
    for (const failure of ['server', 'invalid_response'] as const) {
      expect(
        deriveSyncChipState(
          inputs({ dirtyCount: 2, status: { phase: 'idle', failure } }),
        ),
      ).toEqual({ kind: 'failed', count: 2 });
    }
  });
});

describe('deriveSyncChipState() - precedence and the edges', () => {
  test('offline is an ordinary state, never a failure: it wins over a server failure', () => {
    expect(
      deriveSyncChipState(
        inputs({
          dirtyCount: 1,
          network: { isConnected: false },
          status: { phase: 'idle', failure: 'server' },
        }),
      ),
    ).toEqual({ kind: 'offline', count: 1 });
  });

  test('a cycle that could not connect, on a network that claims to be up, is offline too', () => {
    expect(
      deriveSyncChipState(
        inputs({ dirtyCount: 1, status: { phase: 'idle', failure: 'offline' } }),
      ),
    ).toEqual({ kind: 'offline', count: 1 });
  });

  test('a retry in progress shows syncing, not the failure it is retrying', () => {
    expect(
      deriveSyncChipState(
        inputs({ dirtyCount: 2, status: { phase: 'pushing', failure: 'server' } }),
      ),
    ).toEqual({ kind: 'syncing', count: 2 });
  });

  test('a server failure with nothing waiting is still a failure, so Retry is offered', () => {
    expect(
      deriveSyncChipState(inputs({ status: { phase: 'idle', failure: 'server' } })),
    ).toEqual({ kind: 'failed', count: 0 });
  });

  test('an ended session (unauthorized) is not a sync failure: the sign-out flow speaks', () => {
    expect(
      deriveSyncChipState(
        inputs({ dirtyCount: 2, status: { phase: 'idle', failure: 'unauthorized' } }),
      ),
    ).toEqual({ kind: 'waiting', count: 2 });
  });

  test('is pure: the same inputs give an equal answer and nothing is touched', () => {
    const frozen = Object.freeze(
      inputs({ dirtyCount: 4, status: Object.freeze({ phase: 'idle', failure: null }) }),
    );
    expect(deriveSyncChipState(frozen)).toEqual(deriveSyncChipState(frozen));
  });
});

describe('useSyncChipState() - read from the local store', () => {
  let sqlite: TestSqlite;
  const STATUS: SyncStatus = {
    phase: 'idle',
    firstSyncComplete: true,
    lastSyncedAt: null,
    failure: null,
  };

  function wrapper({ children }: { children: ReactNode }) {
    return createElement(DatabaseProvider, { value: sqlite.db }, children);
  }

  beforeEach(async () => {
    sqlite = await createTestDatabase();
    mockNetwork.state = ONLINE;
    useSyncStatusStore.setState(STATUS);
  });
  afterEach(() => {
    sqlite.close();
    jest.restoreAllMocks();
  });

  /** One dirty row in each of the seven tables; returns where they are. */
  function seedDirtyEverywhere(): [SyncTable, string][] {
    const placed: [SyncTable, string][] = [
      ['trips', seedTrip(sqlite, { is_dirty: true }).id],
    ];
    seed(sqlite, 'expense_categories', uuid(2), { is_dirty: true });
    placed.push(['expense_categories', uuid(2)]);
    for (const [index, table] of SYNC_TABLES.entries()) {
      if (table === 'trips' || table === 'expense_categories') continue;
      seed(sqlite, table, uuid(10 + index), { is_dirty: true });
      placed.push([table, uuid(10 + index)]);
    }
    return placed;
  }

  test('with an empty store: synced', async () => {
    const { result } = await renderHook(() => useSyncChipState(), { wrapper });
    expect(result.current).toEqual({ kind: 'synced' });
  });

  test('counts a dirty row in each of the seven synchronised tables', async () => {
    expect(SYNC_TABLES).toHaveLength(7);
    seedDirtyEverywhere();

    const { result } = await renderHook(() => useSyncChipState(), { wrapper });

    await waitFor(() => expect(result.current).toEqual({ kind: 'waiting', count: 7 }));
  });

  test('does not count rows that the server already has', async () => {
    seedTrip(sqlite, { is_dirty: false });
    seed(sqlite, 'notes', uuid(3), { is_dirty: false });
    seed(sqlite, 'notes', uuid(4), { is_dirty: true });

    const { result } = await renderHook(() => useSyncChipState(), { wrapper });

    await waitFor(() => expect(result.current).toEqual({ kind: 'waiting', count: 1 }));
  });

  test('counts a photo whose bytes have not arrived and a delete still to be sent', async () => {
    seedTrip(sqlite);
    seed(sqlite, 'photos', uuid(5), { is_dirty: true, upload_state: 'pending' });
    seed(sqlite, 'documents', uuid(6), { is_dirty: true, upload_state: 'failed' });
    seed(sqlite, 'notes', uuid(7), {
      is_dirty: true,
      deleted_at: '2026-09-01T10:30:00.000Z',
    });

    const { result } = await renderHook(() => useSyncChipState(), { wrapper });

    await waitFor(() => expect(result.current).toEqual({ kind: 'waiting', count: 3 }));
  });

  test('is live: a write and the change event move the count, down as well as up', async () => {
    seedTrip(sqlite);
    const { result } = await renderHook(() => useSyncChipState(), { wrapper });
    await waitFor(() => expect(result.current).toEqual({ kind: 'synced' }));

    await act(async () => {
      seed(sqlite, 'notes', uuid(8), { is_dirty: true });
      sqlite.emitChange('notes');
    });
    await waitFor(() => expect(result.current).toEqual({ kind: 'waiting', count: 1 }));

    await act(async () => {
      sqlite.db
        .update(notes)
        .set({ is_dirty: false })
        .where(eq(notes.id, uuid(8)))
        .run();
      sqlite.emitChange('notes');
    });
    await waitFor(() => expect(result.current).toEqual({ kind: 'synced' }));
  });

  test('takes the network from the device and the runtime from the engine, live', async () => {
    seedTrip(sqlite);
    seed(sqlite, 'notes', uuid(9), { is_dirty: true });
    const { result, rerender } = await renderHook(() => useSyncChipState(), { wrapper });
    await waitFor(() => expect(result.current).toEqual({ kind: 'waiting', count: 1 }));

    await act(async () => useSyncStatusStore.setState({ phase: 'pushing' }));
    await waitFor(() => expect(result.current).toEqual({ kind: 'syncing', count: 1 }));

    await act(async () =>
      useSyncStatusStore.setState({ phase: 'idle', failure: 'server' }),
    );
    await waitFor(() => expect(result.current).toEqual({ kind: 'failed', count: 1 }));

    mockNetwork.state = { isConnected: false };
    await rerender({});
    expect(result.current).toEqual({ kind: 'offline', count: 1 });
  });

  test('is the same object while nothing it reads changes', async () => {
    seedTrip(sqlite, { is_dirty: true });
    const { result, rerender } = await renderHook(() => useSyncChipState(), { wrapper });
    await waitFor(() => expect(result.current).toEqual({ kind: 'waiting', count: 1 }));

    const first = result.current;
    await rerender({});
    expect(result.current).toBe(first);
  });

  test('writes nothing to the store and asks the network for nothing (privacy, offline-first)', async () => {
    const placed = seedDirtyEverywhere();
    const snapshot = () =>
      JSON.stringify(placed.map(([table, id]) => read(sqlite, table, id)));
    const fetchSpy = jest.fn();
    const realFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as never;
    const writes = (['insert', 'update', 'delete', 'run'] as const).map((method) =>
      jest.spyOn(sqlite.db, method),
    );
    const before = snapshot();

    const { result } = await renderHook(() => useSyncChipState(), { wrapper });
    await waitFor(() => expect(result.current).toEqual({ kind: 'waiting', count: 7 }));

    globalThis.fetch = realFetch;
    expect(fetchSpy).not.toHaveBeenCalled();
    for (const write of writes) expect(write).not.toHaveBeenCalled();
    expect(snapshot()).toBe(before);
  });
});
