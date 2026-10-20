/**
 * T132 — dirty-row push (`sync/push.ts`): one request per table batch in
 * `SYNC_TABLES` order, every verdict, compare-and-set cleaning, id
 * regeneration, parking (sync-protocol.md §2; FR-036 to FR-041; Constitution
 * II, V; research D-15).
 */
import {
  MAX_PUSH_BATCH,
  PushRequest,
  SYNC_TABLES,
  type PushResult,
} from '@triptrackr/contracts';
import { sql } from 'drizzle-orm';

import { syncRepository } from '@/db/repositories/sync';
import { ApiRequestError, apiFetch } from '@/lib/api-client';
import { useConflictStore } from '@/sync/conflicts';
import { MAX_PUSH_BYTES, pushDirtyRows } from '@/sync/push';
import { useSyncWarningsStore } from '@/sync/warnings';

import {
  CATEGORY,
  TRIP,
  at,
  contextFor,
  createTestDatabase,
  maybeRead,
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

beforeEach(async () => {
  sqlite = await createTestDatabase();
  useConflictStore.getState().clear();
  useSyncWarningsStore.getState().reset();
});

afterEach(() => {
  jest.restoreAllMocks();
  sqlite.close();
});

function push(current = () => true) {
  return pushDirtyRows(contextFor(sqlite, current));
}

/** The verdicts a route answers with: `applied` for everything unless told otherwise. */
type Verdicts = (id: string, index: number, request: PushRequest) => PushResult;

const applied = (id: string): PushResult => ({ id, status: 'applied' });
const rejected = (
  id: string,
  reason: 'parent_missing' | 'id_unavailable' | 'invalid',
): PushResult => ({ id, status: 'rejected', reason });

function pushRoute(verdicts: Verdicts = (id) => applied(id)) {
  return (call: ApiCall) => {
    const request = PushRequest.parse(call.body); // the body must satisfy the contract
    return {
      results: request.records.map((record, index) =>
        verdicts(record.id, index, request),
      ),
    };
  };
}

function tables(calls: ApiCall[]): string[] {
  return calls.map((call) => (call.body as PushRequest).table);
}

function recordsOf(call: ApiCall | undefined) {
  return (call?.body as PushRequest).records as Record<string, unknown>[];
}

/** One dirty row in every table, with the parents they need. */
function seedEverything(): void {
  seed(sqlite, 'trips', TRIP, { is_dirty: true, synced_at: null });
  seed(sqlite, 'trip_stops', uuid(2), { is_dirty: true, synced_at: null });
  seed(sqlite, 'expense_categories', CATEGORY, { is_dirty: true, synced_at: null });
  seed(sqlite, 'notes', uuid(4), { is_dirty: true, synced_at: null });
  seed(sqlite, 'expenses', uuid(5), { is_dirty: true, synced_at: null });
  seed(sqlite, 'photos', uuid(6), { is_dirty: true, synced_at: null });
  seed(sqlite, 'documents', uuid(7), { is_dirty: true, synced_at: null });
}

describe('order and batching', () => {
  test('sends one request per table in SYNC_TABLES order — parents before children', async () => {
    seedEverything();
    const calls = routeApi(mockApiFetch, { push: pushRoute() });

    const outcome = await push();

    expect(tables(calls)).toEqual([...SYNC_TABLES]);
    expect(calls.every((call) => call.path === '/sync/push')).toBe(true);
    expect(outcome).toEqual({ pushed: 7, conflicts: 0, failure: null });
  });

  test('a table with nothing dirty costs no request', async () => {
    seedTrip(sqlite, { is_dirty: false });
    seed(sqlite, 'notes', uuid(4), { is_dirty: true });
    const calls = routeApi(mockApiFetch, { push: pushRoute() });
    await push();
    expect(tables(calls)).toEqual(['notes']);
  });

  test('with nothing dirty at all the cycle sends nothing and succeeds', async () => {
    const calls = routeApi(mockApiFetch, { push: pushRoute() });
    expect(await push()).toEqual({ pushed: 0, conflicts: 0, failure: null });
    expect(calls).toHaveLength(0);
  });

  test('a backlog beyond MAX_PUSH_BATCH is split into requests of at most that many records', async () => {
    seedTrip(sqlite);
    const total = MAX_PUSH_BATCH * 2 + 201;
    sqlite.db.transaction(() => {
      for (let i = 0; i < total; i += 1) {
        seed(sqlite, 'notes', uuid(1000 + i), {
          is_dirty: true,
          updated_at: at(0),
        });
      }
    });
    const calls = routeApi(mockApiFetch, { push: pushRoute() });

    const outcome = await push();

    expect(calls.map((call) => recordsOf(call).length)).toEqual([
      MAX_PUSH_BATCH,
      MAX_PUSH_BATCH,
      201,
    ]);
    expect(outcome.pushed).toBe(total);
    expect(syncRepository.countUnsynced(sqlite.db)).toBe(0);
  });

  test('a backlog beyond the byte budget is split by size, every request within it', async () => {
    seedTrip(sqlite);
    const body = 'x'.repeat(20_000); // the largest note the wire allows
    for (let i = 0; i < 100; i += 1) {
      seed(sqlite, 'notes', uuid(1000 + i), { is_dirty: true, body });
    }
    const calls = routeApi(mockApiFetch, { push: pushRoute() });

    await push();

    expect(calls.length).toBeGreaterThan(1);
    let sent = 0;
    for (const call of calls) {
      const bytes = recordsOf(call).reduce(
        (sum, record) => sum + Buffer.byteLength(JSON.stringify(record), 'utf8'),
        0,
      );
      expect(bytes).toBeLessThanOrEqual(MAX_PUSH_BYTES);
      expect(recordsOf(call).length).toBeLessThanOrEqual(MAX_PUSH_BATCH);
      sent += recordsOf(call).length;
    }
    expect(sent).toBe(100);
  });

  test('every request body satisfies PushRequest and carries only the wire’s columns', async () => {
    seedEverything();
    const calls = routeApi(mockApiFetch, { push: pushRoute() });
    await push();
    for (const call of calls) {
      expect(() => PushRequest.parse(call.body)).not.toThrow();
      for (const record of recordsOf(call)) {
        expect(record).not.toHaveProperty('is_dirty');
        expect(record).not.toHaveProperty('synced_at');
        expect(record).not.toHaveProperty('local_file_uri');
        expect(record).not.toHaveProperty('created_at');
        expect(record.deleted).toBe(false);
      }
    }
  });
});

describe('tombstones', () => {
  test('a local tombstone is pushed as deleted: true, and cleaned once acknowledged', async () => {
    seedTrip(sqlite);
    seed(sqlite, 'notes', uuid(4), {
      is_dirty: true,
      updated_at: at(6),
      deleted_at: at(6),
    });
    const calls = routeApi(mockApiFetch, { push: pushRoute() });
    await push();
    expect(recordsOf(calls[0])).toEqual([
      expect.objectContaining({ id: uuid(4), deleted: true, updated_at: at(6) }),
    ]);
    expect(read(sqlite, 'notes', uuid(4))).toMatchObject({
      is_dirty: false,
      deleted_at: at(6),
    });
  });

  test('a row created and deleted offline is still pushed: the server may have seen it', async () => {
    seedTrip(sqlite);
    seed(sqlite, 'notes', uuid(4), {
      is_dirty: true,
      synced_at: null,
      deleted_at: at(2),
      updated_at: at(2),
    });
    const calls = routeApi(mockApiFetch, { push: pushRoute() });
    await push();
    expect(recordsOf(calls[0])[0]).toMatchObject({ id: uuid(4), deleted: true });
  });
});

describe('photos and documents travel only once their bytes arrived (FR-041)', () => {
  test.each(['photos', 'documents'] as const)(
    '%s: a pending or failed upload is neither sent nor touched',
    async (table) => {
      seedTrip(sqlite);
      seed(sqlite, table, uuid(21), {
        is_dirty: true,
        upload_state: 'pending',
        local_file_uri: 'a.jpg',
      });
      seed(sqlite, table, uuid(22), { is_dirty: true, upload_state: 'failed' });
      seed(sqlite, table, uuid(23), { is_dirty: true, upload_state: 'uploaded' });
      const calls = routeApi(mockApiFetch, { push: pushRoute() });

      await push();

      expect(recordsOf(calls[0]).map((record) => record.id)).toEqual([uuid(23)]);
      expect(read(sqlite, table, uuid(21))).toMatchObject({
        is_dirty: true,
        synced_at: at(0),
        upload_state: 'pending',
        local_file_uri: 'a.jpg',
      });
      expect(read(sqlite, table, uuid(22)).is_dirty).toBe(true);
      expect(read(sqlite, table, uuid(23)).is_dirty).toBe(false);
    },
  );

  test('a photo the server answers parent_missing (it does not know it yet) stays dirty', async () => {
    seedTrip(sqlite);
    seed(sqlite, 'photos', uuid(6), { is_dirty: true, upload_state: 'uploaded' });
    routeApi(mockApiFetch, { push: pushRoute((id) => rejected(id, 'parent_missing')) });
    await push();
    expect(read(sqlite, 'photos', uuid(6)).is_dirty).toBe(true);
  });
});

describe('applied', () => {
  test('sets synced_at, clears is_dirty, and leaves updated_at alone', async () => {
    seedTrip(sqlite, { is_dirty: true, synced_at: null, updated_at: at(3) });
    routeApi(mockApiFetch, { push: pushRoute() });
    await push();
    expect(read(sqlite, 'trips', TRIP)).toMatchObject({
      is_dirty: false,
      synced_at: expect.any(String),
      updated_at: at(3),
    });
    expect(read(sqlite, 'trips', TRIP).synced_at).not.toBeNull();
  });

  test('an edit made while the request was in flight stays dirty and is sent next cycle', async () => {
    seedTrip(sqlite, { is_dirty: true, updated_at: at(3), title: 'v1' });
    const calls = routeApi(mockApiFetch, {
      push: (call) => {
        // the traveller edits the trip while the request is on the wire
        sqlite.db.run(
          sql`UPDATE trips SET title = 'v2', updated_at = ${at(9)}, is_dirty = 1 WHERE id = ${TRIP}`,
        );
        return pushRoute()(call);
      },
    });

    const first = await push();
    expect(first.pushed).toBe(1);
    expect(read(sqlite, 'trips', TRIP)).toMatchObject({
      title: 'v2',
      is_dirty: true,
      updated_at: at(9),
    });

    routeApi(mockApiFetch, { push: pushRoute() });
    await push();
    expect(read(sqlite, 'trips', TRIP).is_dirty).toBe(false);
    expect(recordsOf(calls[0])[0]).toMatchObject({ title: 'v1' });
  });

  test('over_allowance: the trip is kept, untouched, and surfaced for the entitlement flow (Constitution V)', async () => {
    seedTrip(sqlite, { is_dirty: true, synced_at: null, title: 'Sixth trip' });
    seed(sqlite, 'notes', uuid(4), { is_dirty: true });
    routeApi(mockApiFetch, {
      push: pushRoute((id) => ({ id, status: 'applied', warnings: ['over_allowance'] })),
    });

    const outcome = await push();

    expect(outcome.failure).toBeNull();
    expect(useSyncWarningsStore.getState().overAllowanceTripIds).toEqual([TRIP]);
    // the trip is exactly as it was, still live, and now clean
    expect(read(sqlite, 'trips', TRIP)).toMatchObject({
      title: 'Sixth trip',
      deleted_at: null,
      is_public: false,
      is_dirty: false,
    });
    // the same warning on a note is not a trip to flag
    expect(useSyncWarningsStore.getState().overAllowanceTripIds).toHaveLength(1);
  });

  test('over_allowance survives a later failure in the same cycle', async () => {
    seedTrip(sqlite, { is_dirty: true });
    seed(sqlite, 'notes', uuid(4), { is_dirty: true });
    routeApi(mockApiFetch, {
      push: (call) => {
        if ((call.body as PushRequest).table === 'notes') throw networkError();
        return pushRoute((id) => ({
          id,
          status: 'applied',
          warnings: ['over_allowance'],
        }))(call);
      },
    });
    const outcome = await push();
    expect(outcome.failure).toBe('offline');
    expect(useSyncWarningsStore.getState().overAllowanceTripIds).toEqual([TRIP]);
  });
});

describe('conflict (FR-040)', () => {
  const server = (overrides: Record<string, unknown> = {}) =>
    wire('notes', uuid(4), { updated_at: at(8), title: 'Theirs', ...overrides });

  test('overwrites the local row with server_version, cleans it, and tells the traveller', async () => {
    seedTrip(sqlite);
    seed(sqlite, 'notes', uuid(4), {
      is_dirty: true,
      updated_at: at(3),
      title: 'Mine',
      body: 'my words',
    });
    routeApi(mockApiFetch, {
      push: pushRoute((id) => ({ id, status: 'conflict', server_version: server() })),
    });

    const outcome = await push();

    expect(outcome).toEqual({ pushed: 0, conflicts: 1, failure: null });
    expect(read(sqlite, 'notes', uuid(4))).toMatchObject({
      title: 'Theirs',
      body: 'Pastel de nata',
      updated_at: at(8),
      is_dirty: false,
      synced_at: expect.any(String),
    });
    expect(useConflictStore.getState().notices).toEqual([
      expect.objectContaining({
        table: 'notes',
        recordId: uuid(4),
        tripId: TRIP,
        summary: expect.stringContaining('Mine'),
      }),
    ]);
  });

  test('no notice when the traveller’s content and the winning version read the same', async () => {
    seedTrip(sqlite);
    seed(sqlite, 'notes', uuid(4), {
      is_dirty: true,
      updated_at: at(3),
      title: 'Lisbon',
      body: 'Pastel de nata',
    });
    routeApi(mockApiFetch, {
      push: pushRoute((id) => ({
        id,
        status: 'conflict',
        server_version: server({ title: 'Lisbon' }),
      })),
    });
    const outcome = await push();
    expect(outcome.conflicts).toBe(0);
    expect(useConflictStore.getState().notices).toEqual([]);
    // the row is still brought into line with the server
    expect(read(sqlite, 'notes', uuid(4))).toMatchObject({
      updated_at: at(8),
      is_dirty: false,
    });
  });

  test('a local delete that lost is undone, and the traveller is told', async () => {
    seedTrip(sqlite);
    seed(sqlite, 'notes', uuid(4), {
      is_dirty: true,
      updated_at: at(3),
      deleted_at: at(3),
    });
    routeApi(mockApiFetch, {
      push: pushRoute((id) => ({ id, status: 'conflict', server_version: server() })),
    });
    await push();
    expect(read(sqlite, 'notes', uuid(4)).deleted_at).toBeNull();
    expect(useConflictStore.getState().notices[0]?.summary).toMatch(/You deleted/);
  });

  test('an edit made while the request was in flight is not overwritten by a verdict about the older one', async () => {
    seedTrip(sqlite);
    seed(sqlite, 'notes', uuid(4), { is_dirty: true, updated_at: at(3), title: 'v1' });
    routeApi(mockApiFetch, {
      push: (call) => {
        sqlite.db.run(
          sql`UPDATE notes SET title = 'v2', updated_at = ${at(9)} WHERE id = ${uuid(4)}`,
        );
        return pushRoute((id) => ({ id, status: 'conflict', server_version: server() }))(
          call,
        );
      },
    });
    const outcome = await push();
    expect(outcome.conflicts).toBe(0);
    expect(read(sqlite, 'notes', uuid(4))).toMatchObject({ title: 'v2', is_dirty: true });
    expect(useConflictStore.getState().notices).toEqual([]);
  });

  test.each([
    ['not a valid note', { id: uuid(4), title: 'x' }],
    ['another row', server({ id: uuid(77) })],
    ['a smuggled key', { ...server(), is_admin: true }],
  ])(
    'a server_version that is %s is a contract violation and changes nothing',
    async (_label, version) => {
      seedTrip(sqlite);
      seed(sqlite, 'notes', uuid(4), {
        is_dirty: true,
        updated_at: at(3),
        title: 'Mine',
      });
      routeApi(mockApiFetch, {
        push: pushRoute((id) => ({ id, status: 'conflict', server_version: version })),
      });
      const outcome = await push();
      expect(outcome.failure).toBe('invalid_response');
      expect(read(sqlite, 'notes', uuid(4))).toMatchObject({
        title: 'Mine',
        is_dirty: true,
      });
      expect(useConflictStore.getState().notices).toEqual([]);
    },
  );

  test('notices for verdicts applied before a malformed one are still raised', async () => {
    seedTrip(sqlite);
    seed(sqlite, 'notes', uuid(4), { is_dirty: true, updated_at: at(3), title: 'Mine' });
    seed(sqlite, 'notes', uuid(5), {
      is_dirty: true,
      updated_at: at(4),
      title: 'Mine too',
    });
    routeApi(mockApiFetch, {
      push: pushRoute((id) =>
        id === uuid(4)
          ? { id, status: 'conflict', server_version: server() }
          : { id, status: 'conflict', server_version: { id, nonsense: true } },
      ),
    });
    const outcome = await push();
    expect(outcome).toMatchObject({ failure: 'invalid_response', conflicts: 1 });
    expect(useConflictStore.getState().notices).toHaveLength(1);
  });
});

describe('rejected: parent_missing', () => {
  test('leaves the row dirty, unparked, and sends it again next cycle', async () => {
    seedTrip(sqlite);
    seed(sqlite, 'notes', uuid(4), { is_dirty: true });
    routeApi(mockApiFetch, { push: pushRoute((id) => rejected(id, 'parent_missing')) });
    const first = await push();
    expect(first).toEqual({ pushed: 0, conflicts: 0, failure: null });
    expect(read(sqlite, 'notes', uuid(4)).is_dirty).toBe(true);
    expect(useSyncWarningsStore.getState().parked).toEqual([]);

    const calls = routeApi(mockApiFetch, { push: pushRoute() });
    await push();
    expect(recordsOf(calls[0])[0]).toMatchObject({ id: uuid(4) });
    expect(read(sqlite, 'notes', uuid(4)).is_dirty).toBe(false);
  });
});

describe('rejected: id_unavailable (research D-15)', () => {
  test('re-keys a trip and every child, then pushes the trip again in the same cycle', async () => {
    seedTrip(sqlite, { is_dirty: true, synced_at: null });
    seed(sqlite, 'trip_stops', uuid(2), { is_dirty: true });
    seed(sqlite, 'notes', uuid(4), { is_dirty: true });
    seed(sqlite, 'expenses', uuid(5), { is_dirty: true });
    let taken = true;
    const calls = routeApi(mockApiFetch, {
      push: pushRoute((id, _i, request) => {
        if (request.table === 'trips' && id === TRIP && taken) {
          taken = false;
          return rejected(id, 'id_unavailable');
        }
        return applied(id);
      }),
    });

    const outcome = await push();

    expect(outcome.failure).toBeNull();
    // trips twice (the second carries the new id), then the children under it
    expect(tables(calls)).toEqual(['trips', 'trips', 'trip_stops', 'notes', 'expenses']);
    const newId = String(recordsOf(calls[1])[0]?.id);
    expect(newId).not.toBe(TRIP);
    expect(maybeRead(sqlite, 'trips', TRIP)).toBeNull();
    expect(read(sqlite, 'trips', newId).is_dirty).toBe(false);
    for (const call of calls.slice(2)) {
      expect(recordsOf(call)[0]).toMatchObject({ trip_id: newId });
    }
    expect(syncRepository.foreignKeyViolations(sqlite.db)).toBe(0);
    expect(syncRepository.countUnsynced(sqlite.db)).toBe(0);
  });

  test('re-keys a custom category and the expenses that use it', async () => {
    seedTrip(sqlite);
    seed(sqlite, 'expense_categories', CATEGORY, { is_dirty: true });
    seed(sqlite, 'expenses', uuid(5), { is_dirty: true });
    let taken = true;
    const calls = routeApi(mockApiFetch, {
      push: pushRoute((id, _i, request) => {
        if (request.table === 'expense_categories' && taken) {
          taken = false;
          return rejected(id, 'id_unavailable');
        }
        return applied(id);
      }),
    });
    await push();
    const newId = String(recordsOf(calls[1])[0]?.id);
    expect(newId).not.toBe(CATEGORY);
    expect(tables(calls)).toEqual([
      'expense_categories',
      'expense_categories',
      'expenses',
    ]);
    expect(recordsOf(calls[2])[0]).toMatchObject({ category_id: newId });
    expect(read(sqlite, 'expenses', uuid(5)).category_id).toBe(newId);
  });

  test('never loops: a second refusal in the same cycle waits for the next cycle', async () => {
    seedTrip(sqlite, { is_dirty: true });
    const calls = routeApi(mockApiFetch, {
      push: pushRoute((id) => rejected(id, 'id_unavailable')),
    });
    await push();
    expect(tables(calls)).toEqual(['trips', 'trips']);
    expect(syncRepository.countUnsynced(sqlite.db)).toBe(1);
  });

  test.each(['photos', 'documents'] as const)(
    '%s keep their id — it is the object key — and are parked instead',
    async (table) => {
      seedTrip(sqlite);
      seed(sqlite, table, uuid(6), { is_dirty: true, upload_state: 'uploaded' });
      routeApi(mockApiFetch, { push: pushRoute((id) => rejected(id, 'id_unavailable')) });
      await push();
      expect(read(sqlite, table, uuid(6)).is_dirty).toBe(true);
      expect(useSyncWarningsStore.getState().parked).toEqual([
        expect.objectContaining({ table, recordId: uuid(6), reason: 'id_unavailable' }),
      ]);
    },
  );
});

describe('rejected: invalid — parked, not retried every cycle', () => {
  test('a refused record is parked, listed, still counted as unsynced, and not sent again', async () => {
    seedTrip(sqlite);
    seed(sqlite, 'notes', uuid(4), { is_dirty: true, updated_at: at(3) });
    seed(sqlite, 'notes', uuid(5), { is_dirty: true, updated_at: at(4) });
    routeApi(mockApiFetch, {
      push: pushRoute((id) => (id === uuid(4) ? rejected(id, 'invalid') : applied(id))),
    });

    const first = await push();
    expect(first).toMatchObject({ pushed: 1, failure: null });
    expect(read(sqlite, 'notes', uuid(4)).is_dirty).toBe(true);
    expect(useSyncWarningsStore.getState().parked).toEqual([
      expect.objectContaining({ table: 'notes', recordId: uuid(4), reason: 'invalid' }),
    ]);
    expect(syncRepository.countUnsynced(sqlite.db)).toBe(1);

    const calls = routeApi(mockApiFetch, { push: pushRoute() });
    await push();
    await push();
    expect(calls).toHaveLength(0);
  });

  test('editing the record makes it retryable, and a success clears it from the list', async () => {
    seedTrip(sqlite);
    seed(sqlite, 'notes', uuid(4), { is_dirty: true, updated_at: at(3) });
    routeApi(mockApiFetch, { push: pushRoute((id) => rejected(id, 'invalid')) });
    await push();

    sqlite.db.run(
      sql`UPDATE notes SET body = 'fixed', updated_at = ${at(9)} WHERE id = ${uuid(4)}`,
    );
    const calls = routeApi(mockApiFetch, { push: pushRoute() });
    await push();

    expect(recordsOf(calls[0])[0]).toMatchObject({ id: uuid(4), body: 'fixed' });
    expect(useSyncWarningsStore.getState().parked).toEqual([]);
    expect(read(sqlite, 'notes', uuid(4)).is_dirty).toBe(false);
  });

  test('a record edited in flight is not parked at its new version', async () => {
    seedTrip(sqlite);
    seed(sqlite, 'notes', uuid(4), { is_dirty: true, updated_at: at(3) });
    routeApi(mockApiFetch, {
      push: (call) => {
        sqlite.db.run(sql`UPDATE notes SET updated_at = ${at(9)} WHERE id = ${uuid(4)}`);
        return pushRoute((id) => rejected(id, 'invalid'))(call);
      },
    });
    await push();
    expect(useSyncWarningsStore.getState().parked).toEqual([]);
    expect(syncRepository.dirtyRows(sqlite.db, 'notes')).toHaveLength(1);
  });

  test('a row that fails its own schema is parked without being sent, and does not poison the batch', async () => {
    seedTrip(sqlite);
    seed(sqlite, 'notes', uuid(4), { is_dirty: true, country_id: null, city_id: null });
    seed(sqlite, 'notes', uuid(5), { is_dirty: true });
    const calls = routeApi(mockApiFetch, { push: pushRoute() });

    const outcome = await push();

    expect(outcome).toMatchObject({ pushed: 1, failure: null });
    expect(recordsOf(calls[0]).map((record) => record.id)).toEqual([uuid(5)]);
    expect(read(sqlite, 'notes', uuid(4)).is_dirty).toBe(true);
    expect(useSyncWarningsStore.getState().parked).toEqual([
      expect.objectContaining({ recordId: uuid(4), reason: 'invalid' }),
    ]);
  });
});

describe('failure mid-push is safe to retry (SC-011, acceptance row 9)', () => {
  test('a drop after the first batch keeps its results and leaves the rest dirty', async () => {
    seedTrip(sqlite);
    const total = MAX_PUSH_BATCH + 10;
    for (let i = 0; i < total; i += 1) {
      seed(sqlite, 'notes', uuid(1000 + i), { is_dirty: true, updated_at: at(0) });
    }
    let requests = 0;
    routeApi(mockApiFetch, {
      push: (call) => {
        requests += 1;
        if (requests === 2) throw networkError();
        return pushRoute()(call);
      },
    });

    const first = await push();

    expect(first).toEqual({ pushed: MAX_PUSH_BATCH, conflicts: 0, failure: 'offline' });
    expect(syncRepository.countUnsynced(sqlite.db)).toBe(10);

    const calls = routeApi(mockApiFetch, { push: pushRoute() });
    const second = await push();
    expect(second).toEqual({ pushed: 10, conflicts: 0, failure: null });
    expect(recordsOf(calls[0])).toHaveLength(10);
    expect(syncRepository.countUnsynced(sqlite.db)).toBe(0);
  });

  test('a failed table stops the cycle: its children are not attempted', async () => {
    seedEverything();
    const calls = routeApi(mockApiFetch, {
      push: () => {
        throw networkError();
      },
    });
    const outcome = await push();
    expect(outcome.failure).toBe('offline');
    expect(tables(calls)).toEqual(['trips']);
    expect(syncRepository.countUnsynced(sqlite.db)).toBe(7);
  });

  test('a lost response (the server applied, the device never heard) is repaired by a plain retry', async () => {
    seedTrip(sqlite, { is_dirty: true, synced_at: null });
    routeApi(mockApiFetch, {
      push: () => {
        throw networkError(); // the server applied it; the answer was lost
      },
    });
    await push();
    expect(read(sqlite, 'trips', TRIP).is_dirty).toBe(true);

    // the retry is an upsert of the same id: the server answers applied again
    const calls = routeApi(mockApiFetch, { push: pushRoute() });
    await push();
    expect(recordsOf(calls[0])[0]).toMatchObject({ id: TRIP });
    expect(read(sqlite, 'trips', TRIP).is_dirty).toBe(false);
    expect(sqlite.native.prepare('SELECT count(*) AS n FROM trips').get()).toEqual({
      n: 1,
    });
  });

  test.each([
    ['a 401 after refresh', 'unauthorized', 401, 'SESSION_EXPIRED'],
    ['a malformed body', 'invalid_response', 200, 'INVALID_RESPONSE'],
    ['a 500', 'server', 500, 'UNKNOWN'],
    ['a 429', 'server', 429, 'RATE_LIMITED'],
  ] as const)('%s is reported as %s', async (_label, failure, status, code) => {
    seedTrip(sqlite, { is_dirty: true });
    routeApi(mockApiFetch, {
      push: () => {
        throw new ApiRequestError(status, { code, message: 'x' });
      },
    });
    expect((await push()).failure).toBe(failure);
    expect(read(sqlite, 'trips', TRIP).is_dirty).toBe(true);
  });

  test('a verdict for an id that was not sent is ignored; an unanswered row stays dirty', async () => {
    seedTrip(sqlite);
    seed(sqlite, 'notes', uuid(4), { is_dirty: true });
    seed(sqlite, 'notes', uuid(5), { is_dirty: true });
    seed(sqlite, 'notes', uuid(6), { is_dirty: false });
    routeApi(mockApiFetch, {
      push: () => ({ results: [applied(uuid(4)), applied(uuid(6))] }),
    });
    const outcome = await push();
    expect(outcome.pushed).toBe(1);
    expect(read(sqlite, 'notes', uuid(5)).is_dirty).toBe(true);
    expect(read(sqlite, 'notes', uuid(6)).synced_at).toBe(at(0));
  });
});

describe('an abandoned cycle (the engine was unbound)', () => {
  test('sends nothing once it is no longer current', async () => {
    seedTrip(sqlite, { is_dirty: true });
    const calls = routeApi(mockApiFetch, { push: pushRoute() });
    const outcome = await push(() => false);
    expect(calls).toHaveLength(0);
    expect(outcome.failure).toBe('unauthorized');
    expect(read(sqlite, 'trips', TRIP).is_dirty).toBe(true);
  });

  test('applies no verdict when the binding is lost while the request is in flight', async () => {
    seedTrip(sqlite, { is_dirty: true });
    let current = true;
    routeApi(mockApiFetch, {
      push: (call) => {
        current = false;
        return pushRoute()(call);
      },
    });
    const outcome = await push(() => current);
    expect(outcome.failure).toBe('unauthorized');
    expect(read(sqlite, 'trips', TRIP).is_dirty).toBe(true);
  });

  test('leaves the warnings store to the traveller now bound', async () => {
    seedTrip(sqlite, { is_dirty: true });
    useSyncWarningsStore
      .getState()
      .setParked([
        { table: 'notes', recordId: uuid(1), reason: 'invalid', parkedAt: at(0) },
      ]);
    routeApi(mockApiFetch, { push: pushRoute() });
    await push(() => false);
    expect(useSyncWarningsStore.getState().parked).toHaveLength(1);
  });
});
