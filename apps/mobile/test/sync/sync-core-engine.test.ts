/**
 * T131 — the engine (`sync/engine.ts`): binding, single-flight, what each
 * trigger runs (sync-protocol.md §3), failure classification, status
 * transitions, and the guarantee that a cycle never outlives its account.
 */
import type { PushRequest } from '@triptrackr/contracts';
import { PushRequest as PushRequestSchema } from '@triptrackr/contracts';
import { act, renderHook } from '@testing-library/react-native';

import type { AppDatabase } from '@/db/client';
import { syncRepository } from '@/db/repositories/sync';
import { ApiRequestError, apiFetch } from '@/lib/api-client';
import { useConflictStore } from '@/sync/conflicts';
import {
  countUnsynced,
  getSyncStatus,
  startSyncEngine,
  syncNow,
  useSyncStatus,
  useSyncStatusStore,
} from '@/sync/engine';
import type { SyncFailure, SyncPhase, SyncReason } from '@/sync/types';
import { useSyncWarningsStore } from '@/sync/warnings';

import {
  CATEGORY,
  TRIP,
  at,
  createTestDatabase,
  pullPage,
  read,
  seed,
  seedTrip,
  uuid,
  wire,
  type TestSqlite,
} from './sync-core-fixtures';
import { networkError, routeApi, type ApiCall } from './sync-core-network';

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn(), captureMessage: jest.fn() },
  initSentry: jest.fn(),
}));
jest.mock('@/lib/api-client', () => ({
  ...jest.requireActual('@/lib/api-client'),
  apiFetch: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.Mock;

let sqlite: TestSqlite;
let unbind: () => void = () => undefined;

const appDb = (store: TestSqlite) => store.db as unknown as AppDatabase;

beforeEach(async () => {
  sqlite = await createTestDatabase();
  useConflictStore.getState().clear();
  useSyncWarningsStore.getState().reset();
});

afterEach(() => {
  unbind();
  unbind = () => undefined;
  jest.restoreAllMocks();
  sqlite.close();
});

function bind(store: TestSqlite = sqlite): () => void {
  unbind = startSyncEngine(appDb(store));
  return unbind;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const pushed = (call: ApiCall) => call.path === '/sync/push';
const okPush = (call: ApiCall) => ({
  results: (PushRequestSchema.parse(call.body).records as { id: string }[]).map(
    (record) => ({ id: record.id, status: 'applied' as const }),
  ),
});
const emptyPull = () => pullPage({}, 'cursor-1', false);

function pathsOf(calls: ApiCall[]): string[] {
  return calls.map((call) => (pushed(call) ? 'push' : 'pull'));
}

/** Record every phase the status store passes through. */
function recordPhases(): SyncPhase[] {
  const phases: SyncPhase[] = [getSyncStatus().phase];
  useSyncStatusStore.subscribe((state) => {
    if (phases[phases.length - 1] !== state.phase) phases.push(state.phase);
  });
  return phases;
}

describe('binding', () => {
  test('hydrates the status from the database: a new device is not yet synced', () => {
    bind();
    expect(getSyncStatus()).toEqual({
      phase: 'idle',
      firstSyncComplete: false,
      lastSyncedAt: null,
      failure: null,
    });
  });

  test('a device that already holds rows is never behind a syncing screen', () => {
    seedTrip(sqlite, { is_dirty: true, synced_at: null });
    bind();
    expect(getSyncStatus().firstSyncComplete).toBe(true);
  });

  test('lists the records already parked in this database for the repair surface', () => {
    seedTrip(sqlite);
    seed(sqlite, 'notes', uuid(4), { is_dirty: true, updated_at: at(3) });
    syncRepository.park(sqlite.db, 'notes', uuid(4), at(3), 'invalid');
    bind();
    expect(useSyncWarningsStore.getState().parked).toEqual([
      expect.objectContaining({ table: 'notes', recordId: uuid(4) }),
    ]);
  });

  test('with nothing bound, syncNow does nothing and says nobody is signed in', async () => {
    const calls = routeApi(mockApiFetch, { push: okPush, pull: emptyPull });
    await expect(syncNow('manual')).resolves.toEqual({
      ok: false,
      pushed: 0,
      pulled: 0,
      conflicts: 0,
      failure: 'unauthorized',
    });
    expect(calls).toHaveLength(0);
  });

  test('unbinding stops the engine and clears everything that carried the traveller’s content', async () => {
    bind();
    useConflictStore.getState().raise({
      id: 'n1',
      table: 'notes',
      recordId: uuid(4),
      tripId: TRIP,
      summary: 'Your change to the note “Lisbon” was replaced.',
      detectedAt: at(1),
    });
    useSyncWarningsStore.getState().flagOverAllowance(TRIP);
    useSyncStatusStore.setState({ firstSyncComplete: true, lastSyncedAt: at(2) });

    unbind();

    expect(useConflictStore.getState().notices).toEqual([]);
    expect(useSyncWarningsStore.getState().overAllowanceTripIds).toEqual([]);
    expect(getSyncStatus()).toMatchObject({
      firstSyncComplete: false,
      lastSyncedAt: null,
    });
    const calls = routeApi(mockApiFetch, { push: okPush, pull: emptyPull });
    expect((await syncNow('manual')).failure).toBe('unauthorized');
    expect(calls).toHaveLength(0);
  });

  test('binding another database replaces the first and resets what it showed', async () => {
    bind();
    useConflictStore.getState().raise({
      id: 'n1',
      table: 'notes',
      recordId: uuid(4),
      tripId: TRIP,
      summary: 's',
      detectedAt: at(1),
    });
    const other = await createTestDatabase();
    try {
      bind(other);
      expect(useConflictStore.getState().notices).toEqual([]);
      seedTrip(sqlite, { is_dirty: true }); // the OLD database
      seed(other, 'trips', TRIP, { title: 'Other traveller', is_dirty: true });
      const calls = routeApi(mockApiFetch, { push: okPush, pull: emptyPull });
      await syncNow('manual');
      // only the second database's row went out
      expect((calls[0]?.body as PushRequest).records).toEqual([
        expect.objectContaining({ title: 'Other traveller' }),
      ]);
      expect(read(sqlite, 'trips', TRIP).is_dirty).toBe(true);
    } finally {
      unbind();
      other.close();
    }
  });

  test('a stale unbind (a strict-mode double effect) does not tear down the current binding', async () => {
    const first = startSyncEngine(appDb(sqlite));
    unbind = startSyncEngine(appDb(sqlite));
    first();
    routeApi(mockApiFetch, { push: okPush, pull: emptyPull });
    expect((await syncNow('foreground')).ok).toBe(true);
    unbind();
    expect((await syncNow('foreground')).failure).toBe('unauthorized');
  });
});

describe('useSyncStatus', () => {
  test('follows the status store', async () => {
    bind();
    const { result } = await renderHook(() => useSyncStatus());
    expect(result.current.phase).toBe('idle');
    await act(async () => {
      useSyncStatusStore.setState({ phase: 'pulling' });
    });
    expect(result.current.phase).toBe('pulling');
  });
});

describe('what each trigger runs (sync-protocol.md §3)', () => {
  test.each<[SyncReason, string[]]>([
    ['timer', ['push', 'pull']],
    ['reconnect', ['push', 'pull']],
    ['manual', ['push', 'pull']],
    ['foreground', ['pull']],
    ['first-launch', ['pull']],
    ['sign-out', ['push']],
  ])('%s runs %j', async (reason, expected) => {
    seedTrip(sqlite, { is_dirty: true });
    bind();
    const calls = routeApi(mockApiFetch, { push: okPush, pull: emptyPull });
    const result = await syncNow(reason);
    expect(pathsOf(calls)).toEqual(expected);
    expect(result.ok).toBe(true);
  });

  test('first-launch on a new device is a full snapshot and ends the syncing state (FR-042)', async () => {
    bind();
    expect(getSyncStatus().firstSyncComplete).toBe(false);
    const calls = routeApi(mockApiFetch, {
      pull: () =>
        pullPage(
          { trips: [wire('trips', TRIP)], notes: [wire('notes', uuid(4))] },
          'cursor-1',
          false,
        ),
    });

    const result = await syncNow('first-launch');

    expect(calls.map((call) => call.path)).toEqual(['/sync/pull']);
    expect(result).toEqual({
      ok: true,
      pushed: 0,
      pulled: 2,
      conflicts: 0,
      failure: null,
    });
    expect(getSyncStatus()).toMatchObject({
      phase: 'idle',
      firstSyncComplete: true,
      failure: null,
      lastSyncedAt: expect.any(String),
    });
  });

  test('an interrupted first snapshot is resumed by the next first-launch, not restarted', async () => {
    bind();
    routeApi(mockApiFetch, {
      pull: ({ path }) => {
        if (path === '/sync/pull') {
          return pullPage({ trips: [wire('trips', TRIP)] }, 'c1', true);
        }
        throw networkError();
      },
    });
    const first = await syncNow('first-launch');
    expect(first).toMatchObject({ ok: false, failure: 'offline', pulled: 1 });
    expect(getSyncStatus().firstSyncComplete).toBe(false);

    const calls = routeApi(mockApiFetch, {
      pull: () => pullPage({ notes: [wire('notes', uuid(4))] }, 'c2', false),
    });
    expect((await syncNow('first-launch')).ok).toBe(true);
    expect(calls.map((call) => call.path)).toEqual(['/sync/pull?cursor=c1']);
    expect(getSyncStatus().firstSyncComplete).toBe(true);
  });

  test('sign-out pushes and does not pull, and reports what could not be sent', async () => {
    seedTrip(sqlite, { is_dirty: true });
    bind();
    const calls = routeApi(mockApiFetch, {
      push: () => {
        throw networkError();
      },
      pull: emptyPull,
    });
    const result = await syncNow('sign-out');
    expect(pathsOf(calls)).toEqual(['push']);
    expect(result).toMatchObject({ ok: false, failure: 'offline', pushed: 0 });
    expect(await countUnsynced(appDb(sqlite))).toBe(1);
  });
});

describe('results and status', () => {
  test('a timer cycle passes through pushing, pulling, idle and stamps lastSyncedAt', async () => {
    seedTrip(sqlite, { is_dirty: true });
    bind();
    const phases = recordPhases();
    routeApi(mockApiFetch, {
      push: okPush,
      pull: () =>
        pullPage({ notes: [wire('notes', uuid(4), { trip_id: TRIP })] }, 'c', false),
    });

    const result = await syncNow('timer');

    expect(phases).toEqual(['idle', 'pushing', 'pulling', 'idle']);
    expect(result).toEqual({
      ok: true,
      pushed: 1,
      pulled: 1,
      conflicts: 0,
      failure: null,
    });
    expect(getSyncStatus()).toMatchObject({
      phase: 'idle',
      failure: null,
      firstSyncComplete: true,
      lastSyncedAt: expect.any(String),
    });
  });

  test('conflicts from the push and from the pull are added together', async () => {
    seedTrip(sqlite, { is_dirty: true, updated_at: at(3), title: 'Mine' });
    seed(sqlite, 'notes', uuid(4), { is_dirty: true, updated_at: at(3), title: 'Local' });
    bind();
    routeApi(mockApiFetch, {
      push: (call) => ({
        results: (PushRequestSchema.parse(call.body).records as { id: string }[]).map(
          (record) =>
            record.id === TRIP
              ? {
                  id: record.id,
                  status: 'conflict' as const,
                  server_version: wire('trips', TRIP, {
                    updated_at: at(8),
                    title: 'Theirs',
                  }),
                }
              : { id: record.id, status: 'applied' as const },
        ),
      }),
      pull: () =>
        pullPage(
          {
            expense_categories: [wire('expense_categories', CATEGORY, { name: 'Other' })],
          },
          'c',
          false,
        ),
    });
    const result = await syncNow('manual');
    expect(result).toMatchObject({ ok: true, pushed: 1, conflicts: 1, pulled: 1 });
    expect(useConflictStore.getState().notices).toHaveLength(1);
  });

  test('a failed cycle keeps the last success time, reports the failure, and a later success clears it', async () => {
    bind();
    routeApi(mockApiFetch, { push: okPush, pull: emptyPull });
    await syncNow('timer');
    const firstSuccess = getSyncStatus().lastSyncedAt;
    expect(firstSuccess).not.toBeNull();

    routeApi(mockApiFetch, {
      pull: () => {
        throw networkError();
      },
    });
    const failed = await syncNow('foreground');
    expect(failed).toMatchObject({ ok: false, failure: 'offline' });
    expect(getSyncStatus()).toMatchObject({
      phase: 'idle',
      failure: 'offline',
      lastSyncedAt: firstSuccess,
    });

    routeApi(mockApiFetch, { pull: emptyPull });
    await syncNow('foreground');
    expect(getSyncStatus()).toMatchObject({ failure: null });
  });

  test('a push failure stops the cycle before the pull', async () => {
    seedTrip(sqlite, { is_dirty: true });
    bind();
    const calls = routeApi(mockApiFetch, {
      push: () => {
        throw networkError();
      },
      pull: emptyPull,
    });
    const result = await syncNow('timer');
    expect(pathsOf(calls)).toEqual(['push']);
    expect(result.failure).toBe('offline');
  });

  test('records the applied pushes even when the pull then fails', async () => {
    seedTrip(sqlite, { is_dirty: true });
    bind();
    routeApi(mockApiFetch, {
      push: okPush,
      pull: () => {
        throw networkError();
      },
    });
    expect(await syncNow('timer')).toMatchObject({
      ok: false,
      pushed: 1,
      pulled: 0,
      failure: 'offline',
    });
  });
});

describe('failure classification', () => {
  const cases: [string, SyncFailure, () => unknown][] = [
    ['NETWORK', 'offline', () => networkError()],
    [
      'TIMEOUT',
      'offline',
      () => new ApiRequestError(0, { code: 'TIMEOUT', message: 't' }),
    ],
    [
      'a 401',
      'unauthorized',
      () => new ApiRequestError(401, { code: 'UNAUTHORIZED', message: 'u' }),
    ],
    [
      'SESSION_EXPIRED',
      'unauthorized',
      () => new ApiRequestError(401, { code: 'SESSION_EXPIRED', message: 's' }),
    ],
    [
      'INVALID_RESPONSE',
      'invalid_response',
      () => new ApiRequestError(200, { code: 'INVALID_RESPONSE', message: 'i' }),
    ],
    [
      'a 500',
      'server',
      () => new ApiRequestError(500, { code: 'UNKNOWN', message: 'x' }),
    ],
    [
      'a config error',
      'server',
      () => new ApiRequestError(0, { code: 'CONFIG', message: 'c' }),
    ],
    ['an unexpected TypeError', 'server', () => new TypeError('boom')],
    ['a thrown string', 'server', () => 'nope'],
  ];
  test.each(cases)('%s is classified %s', async (_label, failure, make) => {
    bind();
    routeApi(mockApiFetch, {
      pull: () => {
        throw make();
      },
    });
    const result = await syncNow('foreground');
    expect(result).toEqual({ ok: false, pushed: 0, pulled: 0, conflicts: 0, failure });
    expect(getSyncStatus().failure).toBe(failure);
  });

  test('syncNow never rejects when the repair list cannot be refreshed after a push', async () => {
    bind();
    jest.spyOn(syncRepository, 'listParked').mockImplementation(() => {
      throw new Error('database is locked');
    });
    routeApi(mockApiFetch, { push: okPush });
    await expect(syncNow('sign-out')).resolves.toMatchObject({
      ok: false,
      failure: 'server',
    });
  });

  test('a database that cannot be read after the cycle leaves the last known first-sync answer', async () => {
    seedTrip(sqlite);
    bind();
    expect(getSyncStatus().firstSyncComplete).toBe(true);
    routeApi(mockApiFetch, { push: okPush });
    jest.spyOn(syncRepository, 'getState').mockImplementation(() => {
      throw new Error('database is locked');
    });
    const result = await syncNow('sign-out');
    expect(result.ok).toBe(true);
    expect(getSyncStatus().firstSyncComplete).toBe(true);
  });

  test('syncNow never rejects, even when the local store fails', async () => {
    seedTrip(sqlite, { is_dirty: true });
    bind();
    jest.spyOn(syncRepository, 'dirtyRows').mockImplementation(() => {
      throw new Error('database disk image is malformed');
    });
    routeApi(mockApiFetch, { push: okPush, pull: emptyPull });
    await expect(syncNow('timer')).resolves.toMatchObject({
      ok: false,
      failure: 'server',
    });
    expect(getSyncStatus().phase).toBe('idle');
  });
});

describe('single flight', () => {
  test('concurrent callers join the cycle in flight and share its result', async () => {
    bind();
    const gate = deferred<void>();
    const calls = routeApi(mockApiFetch, {
      push: okPush,
      pull: async () => {
        await gate.promise;
        return emptyPull();
      },
    });

    const first = syncNow('timer');
    const second = syncNow('reconnect');
    const third = syncNow('foreground'); // covered: the running cycle also pulls
    gate.resolve();

    const results = await Promise.all([first, second, third]);
    expect(pathsOf(calls)).toEqual(['pull']);
    expect(results[1]).toBe(results[0]);
    expect(results[2]).toBe(results[0]);
  });

  test('once a cycle has finished the next call starts a new one', async () => {
    bind();
    const calls = routeApi(mockApiFetch, { pull: emptyPull });
    await syncNow('foreground');
    await syncNow('foreground');
    expect(calls).toHaveLength(2);
  });

  test('a sign-out push requested during a pull is NOT swallowed by it: it runs afterwards', async () => {
    seedTrip(sqlite, { is_dirty: true });
    bind();
    const gate = deferred<void>();
    const calls = routeApi(mockApiFetch, {
      push: okPush,
      pull: async () => {
        await gate.promise;
        return emptyPull();
      },
    });

    const pull = syncNow('foreground');
    const signOut = syncNow('sign-out');
    gate.resolve();
    const [pullResult, signOutResult] = await Promise.all([pull, signOut]);

    expect(pathsOf(calls)).toEqual(['pull', 'push']);
    expect(pullResult.pushed).toBe(0);
    expect(signOutResult).toMatchObject({ ok: true, pushed: 1 });
    expect(read(sqlite, 'trips', TRIP).is_dirty).toBe(false);
  });

  test('callers that need the same missing work share ONE follow-up cycle, with their plans combined', async () => {
    seedTrip(sqlite, { is_dirty: true });
    bind();
    const gate = deferred<void>();
    const calls = routeApi(mockApiFetch, {
      push: okPush,
      pull: async () => {
        await gate.promise;
        return emptyPull();
      },
    });

    const running = syncNow('foreground'); // pull only
    const signOutA = syncNow('sign-out'); // needs a push
    const signOutB = syncNow('sign-out');
    const manual = syncNow('manual'); // needs push AND pull: widens the follow-up
    gate.resolve();
    const [, a, b, c] = await Promise.all([running, signOutA, signOutB, manual]);

    expect(pathsOf(calls)).toEqual(['pull', 'push', 'pull']);
    expect(a).toBe(b);
    expect(c).toBe(a);
  });

  test('a follow-up queued for a binding that was since unbound does not run', async () => {
    seedTrip(sqlite, { is_dirty: true });
    bind();
    const gate = deferred<void>();
    const calls = routeApi(mockApiFetch, {
      push: okPush,
      pull: async () => {
        await gate.promise;
        return emptyPull();
      },
    });
    const running = syncNow('foreground');
    const queued = syncNow('sign-out');
    unbind();
    gate.resolve();
    await running;
    expect((await queued).failure).toBe('unauthorized');
    expect(pathsOf(calls)).toEqual(['pull']);
  });
});

describe('a cycle never outlives its account (Constitution I)', () => {
  test('unbinding during a pull: the answer is discarded and nothing is written', async () => {
    bind();
    const gate = deferred<void>();
    routeApi(mockApiFetch, {
      pull: async () => {
        await gate.promise;
        return pullPage({ trips: [wire('trips', TRIP)] }, 'c', false);
      },
    });
    const cycle = syncNow('first-launch');
    unbind();
    const next = await createTestDatabase();
    try {
      unbind = startSyncEngine(appDb(next));
      gate.resolve();
      const result = await cycle;

      expect(result.ok).toBe(false);
      expect(sqlite.native.prepare('SELECT count(*) AS n FROM trips').get()).toEqual({
        n: 0,
      });
      // the new binding's status was not written by the abandoned cycle
      expect(getSyncStatus()).toEqual({
        phase: 'idle',
        firstSyncComplete: false,
        lastSyncedAt: null,
        failure: null,
      });
    } finally {
      next.close();
    }
  });

  test('unbinding during a push: rows stay dirty and are not sent again', async () => {
    seedTrip(sqlite, { is_dirty: true });
    bind();
    const gate = deferred<void>();
    const calls = routeApi(mockApiFetch, {
      push: async (call) => {
        await gate.promise;
        return okPush(call);
      },
    });
    const cycle = syncNow('timer');
    unbind();
    gate.resolve();
    await cycle;
    expect(read(sqlite, 'trips', TRIP).is_dirty).toBe(true);
    expect(pathsOf(calls)).toEqual(['push']);
  });

  test('a cycle for a replaced binding does not block the new binding’s own cycle', async () => {
    bind();
    const gate = deferred<void>();
    routeApi(mockApiFetch, {
      pull: async () => {
        await gate.promise;
        return emptyPull();
      },
    });
    const stale = syncNow('foreground');
    const other = await createTestDatabase();
    try {
      unbind();
      unbind = startSyncEngine(appDb(other));
      const calls = routeApi(mockApiFetch, { pull: emptyPull });
      const fresh = await syncNow('foreground');
      expect(fresh.ok).toBe(true);
      expect(calls).toHaveLength(1);
      gate.resolve();
      await stale;
    } finally {
      other.close();
    }
  });
});

describe('countUnsynced', () => {
  test('is the number of dirty rows the server has not acknowledged', async () => {
    expect(await countUnsynced(appDb(sqlite))).toBe(0);
    seedTrip(sqlite, { is_dirty: true });
    seed(sqlite, 'notes', uuid(4), { is_dirty: true });
    seed(sqlite, 'notes', uuid(5), { is_dirty: false });
    expect(await countUnsynced(appDb(sqlite))).toBe(2);
  });

  test('does not count a photo whose bytes have not arrived (the upload queue does)', async () => {
    seedTrip(sqlite);
    seed(sqlite, 'photos', uuid(6), { is_dirty: true, upload_state: 'pending' });
    expect(await countUnsynced(appDb(sqlite))).toBe(0);
  });

  test('drops to zero after a successful push', async () => {
    seedTrip(sqlite, { is_dirty: true });
    seed(sqlite, 'notes', uuid(4), { is_dirty: true });
    bind();
    routeApi(mockApiFetch, { push: okPush });
    await syncNow('sign-out');
    expect(await countUnsynced(appDb(sqlite))).toBe(0);
  });
});
