/**
 * T131/T133 — pull application (`sync/pull.ts`): paging from the stored
 * cursor, one transaction per page with its cursor, last-write-wins against
 * dirty rows, tombstones, and the foreign-key problem (sync-protocol.md §1;
 * FR-039, FR-040, FR-042; SC-011).
 */
import { ApiRequestError, apiFetch } from '@/lib/api-client';
import { tripsRepository } from '@/db/repositories/trips';
import { syncRepository } from '@/db/repositories/sync';
import { useConflictStore } from '@/sync/conflicts';
import { isFirstSyncComplete, readPullCursor } from '@/sync/cursor';
import { pullChanges } from '@/sync/pull';

import {
  CATEGORY,
  TRIP,
  at,
  contextFor,
  createTestDatabase,
  pullPage,
  read,
  seed,
  seedTrip,
  uuid,
  wire,
  maybeRead,
  type TestSqlite,
} from './sync-core-fixtures';
import { networkError, routeApi } from './sync-core-network';

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
});

afterEach(() => {
  jest.restoreAllMocks();
  sqlite.close();
});

function pull() {
  return pullChanges(contextFor(sqlite));
}

describe('a full snapshot', () => {
  test('starts with no cursor and writes every table, clean, with the cursor and the flag', async () => {
    const calls = routeApi(mockApiFetch, {
      pull: () =>
        pullPage(
          {
            trips: [wire('trips', TRIP, { status: 'active' })],
            trip_stops: [wire('trip_stops', uuid(2))],
            expense_categories: [wire('expense_categories', CATEGORY)],
            notes: [wire('notes', uuid(4))],
            expenses: [wire('expenses', uuid(5), { fx_pending: true })],
            photos: [wire('photos', uuid(6), { has_thumbnail: true })],
            documents: [wire('documents', uuid(7))],
          },
          'cursor-1',
          false,
        ),
    });

    const outcome = await pull();

    expect(calls.map((call) => call.path)).toEqual(['/sync/pull']);
    expect(outcome).toMatchObject({
      pulled: 7,
      conflicts: 0,
      pages: 1,
      complete: true,
      orphans: 0,
      failure: null,
    });
    expect(readPullCursor(sqlite.db)).toBe('cursor-1');
    expect(isFirstSyncComplete(sqlite.db)).toBe(true);
    for (const [table, id] of [
      ['trips', TRIP],
      ['trip_stops', uuid(2)],
      ['expense_categories', CATEGORY],
      ['notes', uuid(4)],
      ['expenses', uuid(5)],
      ['photos', uuid(6)],
      ['documents', uuid(7)],
    ] as const) {
      expect(read(sqlite, table, id)).toMatchObject({
        is_dirty: false,
        synced_at: expect.any(String),
      });
    }
    // server-owned columns arrive
    expect(read(sqlite, 'trips', TRIP).status).toBe('active');
    expect(read(sqlite, 'expenses', uuid(5)).fx_pending).toBe(true);
    expect(read(sqlite, 'photos', uuid(6)).has_thumbnail).toBe(true);
  });

  test('an empty account completes with nothing to write', async () => {
    routeApi(mockApiFetch, { pull: () => pullPage({}, 'cursor-0', false) });
    const outcome = await pull();
    expect(outcome).toMatchObject({ pulled: 0, complete: true, failure: null });
    expect(isFirstSyncComplete(sqlite.db)).toBe(true);
    expect(readPullCursor(sqlite.db)).toBe('cursor-0');
  });

  test('stores a parsed jsonb column (a boarding pass’s extracted fields)', async () => {
    const parsed = {
      flight_number: 'AC834',
      flight_date: '2026-09-02',
      passenger_name: 'ANA PEREIRA',
    };
    routeApi(mockApiFetch, {
      pull: () =>
        pullPage(
          {
            trips: [wire('trips', TRIP)],
            documents: [wire('documents', uuid(7), { parsed_json: parsed })],
          },
          'c',
          false,
        ),
    });
    await pull();
    expect(read(sqlite, 'documents', uuid(7)).parsed_json).toEqual(parsed);
  });
});

describe('paging and resumption (SC-011, acceptance rows 9 and 10)', () => {
  test('follows next_cursor until has_more is false, and only then sets the flag', async () => {
    const seen: (boolean | undefined)[] = [];
    const calls = routeApi(mockApiFetch, {
      pull: ({ path }) => {
        seen.push(isFirstSyncComplete(sqlite.db));
        if (path === '/sync/pull') {
          return pullPage({ trips: [wire('trips', TRIP)] }, 'c 1/=', true);
        }
        if (path.endsWith(encodeURIComponent('c 1/='))) {
          return pullPage({ notes: [wire('notes', uuid(4))] }, 'c2', true);
        }
        return pullPage({ notes: [wire('notes', uuid(5))] }, 'c3', false);
      },
    });

    const outcome = await pull();

    expect(calls.map((call) => call.path)).toEqual([
      '/sync/pull',
      `/sync/pull?cursor=${encodeURIComponent('c 1/=')}`,
      '/sync/pull?cursor=c2',
    ]);
    expect(outcome).toMatchObject({ pulled: 3, pages: 3, complete: true });
    // the flag was still false when pages 2 and 3 were requested
    expect(seen).toEqual([false, false, false]);
    expect(isFirstSyncComplete(sqlite.db)).toBe(true);
    expect(readPullCursor(sqlite.db)).toBe('c3');
  });

  test('a drop between pages keeps the applied pages and resumes from the cursor', async () => {
    routeApi(mockApiFetch, {
      pull: ({ path }) => {
        if (path === '/sync/pull') {
          return pullPage({ trips: [wire('trips', TRIP)] }, 'c1', true);
        }
        throw networkError();
      },
    });
    const first = await pull();
    expect(first).toMatchObject({
      pulled: 1,
      pages: 1,
      complete: false,
      failure: 'offline',
    });
    expect(readPullCursor(sqlite.db)).toBe('c1');
    expect(isFirstSyncComplete(sqlite.db)).toBe(false);

    const calls = routeApi(mockApiFetch, {
      pull: () => pullPage({ notes: [wire('notes', uuid(4))] }, 'c2', false),
    });
    const second = await pull();
    expect(calls.map((call) => call.path)).toEqual(['/sync/pull?cursor=c1']);
    expect(second).toMatchObject({ pulled: 1, complete: true, failure: null });
    expect(isFirstSyncComplete(sqlite.db)).toBe(true);
    // nothing lost, nothing duplicated
    expect(sqlite.native.prepare('SELECT count(*) AS n FROM trips').get()).toEqual({
      n: 1,
    });
    expect(sqlite.native.prepare('SELECT count(*) AS n FROM notes').get()).toEqual({
      n: 1,
    });
  });

  test('re-delivery of a page already applied is idempotent', async () => {
    const page = () => pullPage({ trips: [wire('trips', TRIP)] }, 'c1', false);
    routeApi(mockApiFetch, { pull: page });
    await pull();
    routeApi(mockApiFetch, { pull: page });
    const again = await pull();
    expect(again.failure).toBeNull();
    expect(sqlite.native.prepare('SELECT count(*) AS n FROM trips').get()).toEqual({
      n: 1,
    });
  });

  test('a page that fails to apply rolls back whole and does not advance the cursor', async () => {
    routeApi(mockApiFetch, {
      pull: ({ path }) =>
        path === '/sync/pull'
          ? pullPage({ trips: [wire('trips', TRIP)] }, 'c1', true)
          : pullPage(
              {
                notes: [wire('notes', uuid(4)), wire('notes', uuid(5))],
                trips: [wire('trips', uuid(9))],
              },
              'c2',
              false,
            ),
    });
    // Page 1 inserts one row; page 2 applies its trip (call 2) and then fails on
    // its first note (call 3) — after a row of the same page was already written.
    const original = syncRepository.insertRow;
    const insert = jest.spyOn(syncRepository, 'insertRow');
    insert.mockImplementation((...args) => {
      if (insert.mock.calls.length === 3) throw new Error('disk full');
      return original(...args);
    });

    const outcome = await pull();

    expect(outcome).toMatchObject({ complete: false, failure: 'server', pages: 1 });
    expect(readPullCursor(sqlite.db)).toBe('c1');
    expect(isFirstSyncComplete(sqlite.db)).toBe(false);
    // page 2 left no trace: not even the row applied before the failure
    expect(maybeRead(sqlite, 'trips', uuid(9))).toBeNull();
    expect(maybeRead(sqlite, 'notes', uuid(4))).toBeNull();
    // and enforcement was restored
    expect(
      (sqlite.native.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number })
        .foreign_keys,
    ).toBe(1);
  });

  test('a failed page raises no conflict notice for what it rolled back', async () => {
    seedTrip(sqlite, { is_dirty: true, updated_at: at(1), title: 'Mine' });
    routeApi(mockApiFetch, {
      pull: () =>
        pullPage(
          {
            trips: [wire('trips', TRIP, { updated_at: at(5), title: 'Theirs' })],
            notes: [wire('notes', uuid(4))],
          },
          'c1',
          false,
        ),
    });
    const insert = jest.spyOn(syncRepository, 'insertRow');
    insert.mockImplementation(() => {
      throw new Error('disk full');
    });

    const outcome = await pull();

    expect(outcome.failure).toBe('server');
    expect(useConflictStore.getState().notices).toEqual([]);
    expect(read(sqlite, 'trips', TRIP)).toMatchObject({ title: 'Mine', is_dirty: true });
  });
});

describe('the rule per record', () => {
  test('a clean local row is overwritten: the server is authoritative', async () => {
    seedTrip(sqlite, { title: 'Old', status: 'planning' });
    seed(sqlite, 'expenses', uuid(5), { fx_pending: true });
    seed(sqlite, 'photos', uuid(6), {
      upload_state: 'pending',
      local_file_uri: 'photos/x.jpg',
    });
    routeApi(mockApiFetch, {
      pull: () =>
        pullPage(
          {
            trips: [wire('trips', TRIP, { title: 'New', status: 'active' })],
            expenses: [
              wire('expenses', uuid(5), {
                fx_pending: false,
                fx_rate_to_home: '0.920000',
                amount_home: '11.50',
              }),
            ],
            photos: [
              wire('photos', uuid(6), {
                upload_state: 'uploaded',
                moderation_state: 'approved',
              }),
            ],
          },
          'c',
          false,
        ),
    });
    const outcome = await pull();
    expect(outcome).toMatchObject({ pulled: 3, conflicts: 0 });
    expect(read(sqlite, 'trips', TRIP)).toMatchObject({ title: 'New', status: 'active' });
    expect(read(sqlite, 'expenses', uuid(5))).toMatchObject({
      fx_pending: false,
      fx_rate_to_home: '0.920000',
      amount_home: '11.50',
    });
    expect(read(sqlite, 'photos', uuid(6))).toMatchObject({
      upload_state: 'uploaded',
      moderation_state: 'approved',
      local_file_uri: 'photos/x.jpg', // a local-only column survives the overwrite
    });
    expect(useConflictStore.getState().notices).toEqual([]);
  });

  describe('a dirty local row: last-write-wins', () => {
    test('the local edit is kept when it is newer, and stays dirty for the push', async () => {
      seedTrip(sqlite, {
        is_dirty: true,
        synced_at: null,
        updated_at: at(9),
        title: 'Mine',
      });
      routeApi(mockApiFetch, {
        pull: () =>
          pullPage(
            { trips: [wire('trips', TRIP, { updated_at: at(5), title: 'Theirs' })] },
            'c',
            false,
          ),
      });
      const outcome = await pull();
      expect(outcome).toMatchObject({ pulled: 0, conflicts: 0 });
      expect(read(sqlite, 'trips', TRIP)).toMatchObject({
        title: 'Mine',
        is_dirty: true,
        updated_at: at(9),
      });
      expect(useConflictStore.getState().notices).toEqual([]);
    });

    test('newer means newer as an instant, not as text', async () => {
      // Local 10:00:03Z sorts after "10:00:03.500Z" as text but is EARLIER in time.
      seedTrip(sqlite, {
        is_dirty: true,
        updated_at: '2026-09-01T10:00:03Z',
        title: 'Mine',
      });
      routeApi(mockApiFetch, {
        pull: () =>
          pullPage(
            {
              trips: [
                wire('trips', TRIP, {
                  updated_at: '2026-09-01T10:00:03.500Z',
                  title: 'Theirs',
                }),
              ],
            },
            'c',
            false,
          ),
      });
      await pull();
      expect(read(sqlite, 'trips', TRIP).title).toBe('Theirs');
    });

    test('the server version wins when it is newer, and the traveller is told what they lost', async () => {
      seedTrip(sqlite, {
        is_dirty: true,
        synced_at: null,
        updated_at: at(2),
        title: 'Mine',
      });
      routeApi(mockApiFetch, {
        pull: () =>
          pullPage(
            { trips: [wire('trips', TRIP, { updated_at: at(5), title: 'Theirs' })] },
            'c',
            false,
          ),
      });
      const outcome = await pull();
      expect(outcome).toMatchObject({ pulled: 1, conflicts: 1 });
      expect(read(sqlite, 'trips', TRIP)).toMatchObject({
        title: 'Theirs',
        is_dirty: false,
        updated_at: at(5),
      });
      expect(useConflictStore.getState().notices).toEqual([
        expect.objectContaining({
          table: 'trips',
          recordId: TRIP,
          tripId: TRIP,
          summary: expect.stringContaining('Mine'),
        }),
      ]);
    });

    test('no notice when the overwritten content did not differ (a lost acknowledgement)', async () => {
      seedTrip(sqlite, {
        is_dirty: true,
        synced_at: null,
        updated_at: at(2),
        title: 'Same',
      });
      routeApi(mockApiFetch, {
        pull: () =>
          pullPage(
            {
              trips: [
                wire('trips', TRIP, {
                  updated_at: at(2),
                  title: 'Same',
                  status: 'active',
                }),
              ],
            },
            'c',
            false,
          ),
      });
      const outcome = await pull();
      // a tie goes to the server: the row is now clean and carries the server's columns
      expect(outcome).toMatchObject({ pulled: 1, conflicts: 0 });
      expect(read(sqlite, 'trips', TRIP)).toMatchObject({
        is_dirty: false,
        status: 'active',
      });
      expect(useConflictStore.getState().notices).toEqual([]);
    });

    test('a difference only in timestamps or server-owned columns is not a conflict', async () => {
      seedTrip(sqlite, {
        is_dirty: true,
        updated_at: at(2),
        title: 'Same',
        status: 'planning',
      });
      routeApi(mockApiFetch, {
        pull: () =>
          pullPage(
            {
              trips: [
                wire('trips', TRIP, {
                  updated_at: at(8),
                  created_at: at(0),
                  title: 'Same',
                  status: 'past',
                }),
              ],
            },
            'c',
            false,
          ),
      });
      const outcome = await pull();
      expect(outcome.conflicts).toBe(0);
      expect(useConflictStore.getState().notices).toEqual([]);
    });
  });
});

describe('tombstones (FR-039)', () => {
  test('a pulled tombstone soft-deletes the local row, so live queries hide it', async () => {
    seedTrip(sqlite);
    expect(tripsRepository.listQuery(sqlite.db).all()).toHaveLength(1);
    routeApi(mockApiFetch, {
      pull: () =>
        pullPage(
          { trips: [wire('trips', TRIP, { updated_at: at(5), deleted_at: at(5) })] },
          'c',
          false,
        ),
    });
    await pull();
    expect(read(sqlite, 'trips', TRIP)).toMatchObject({
      deleted_at: at(5),
      is_dirty: false,
    });
    expect(tripsRepository.listQuery(sqlite.db).all()).toHaveLength(0);
  });

  test('a tombstone for a row this device never saw is recorded, not skipped', async () => {
    routeApi(mockApiFetch, {
      pull: () =>
        pullPage(
          { trips: [wire('trips', TRIP, { updated_at: at(5), deleted_at: at(5) })] },
          'c',
          false,
        ),
    });
    await pull();
    expect(read(sqlite, 'trips', TRIP).deleted_at).toBe(at(5));
    expect(tripsRepository.listQuery(sqlite.db).all()).toHaveLength(0);
  });

  test('a stale live version never resurrects a local tombstone (clean or dirty)', async () => {
    seedTrip(sqlite, { deleted_at: at(9), updated_at: at(9) });
    seed(sqlite, 'notes', uuid(4), {
      deleted_at: at(9),
      updated_at: at(9),
      is_dirty: true,
    });
    routeApi(mockApiFetch, {
      pull: () =>
        pullPage(
          {
            trips: [wire('trips', TRIP, { updated_at: at(3) })],
            notes: [wire('notes', uuid(4), { updated_at: at(3) })],
          },
          'c',
          false,
        ),
    });
    const outcome = await pull();
    expect(outcome).toMatchObject({ pulled: 0, conflicts: 0 });
    expect(read(sqlite, 'trips', TRIP).deleted_at).toBe(at(9));
    expect(read(sqlite, 'notes', uuid(4))).toMatchObject({
      deleted_at: at(9),
      is_dirty: true,
    });
  });

  test('a newer edit from another device does replace a synced tombstone (last write wins)', async () => {
    seedTrip(sqlite, { deleted_at: at(3), updated_at: at(3) });
    routeApi(mockApiFetch, {
      pull: () =>
        pullPage(
          { trips: [wire('trips', TRIP, { updated_at: at(9), title: 'Back' })] },
          'c',
          false,
        ),
    });
    await pull();
    expect(read(sqlite, 'trips', TRIP)).toMatchObject({
      deleted_at: null,
      title: 'Back',
    });
  });

  test('scenario 12: a local delete newer than a remote edit stays a delete and is still pushed', async () => {
    seed(sqlite, 'trips', TRIP);
    seed(sqlite, 'notes', uuid(4), {
      deleted_at: at(9),
      updated_at: at(9),
      is_dirty: true,
    });
    routeApi(mockApiFetch, {
      pull: () =>
        pullPage(
          {
            notes: [
              wire('notes', uuid(4), { updated_at: at(5), body: 'edited elsewhere' }),
            ],
          },
          'c',
          false,
        ),
    });
    await pull();
    expect(read(sqlite, 'notes', uuid(4))).toMatchObject({
      deleted_at: at(9),
      is_dirty: true,
    });
  });

  test('a remote delete newer than a local edit removes the row and tells the traveller', async () => {
    seed(sqlite, 'trips', TRIP);
    seed(sqlite, 'notes', uuid(4), {
      is_dirty: true,
      updated_at: at(2),
      title: 'Lisbon',
    });
    routeApi(mockApiFetch, {
      pull: () =>
        pullPage(
          { notes: [wire('notes', uuid(4), { updated_at: at(6), deleted_at: at(6) })] },
          'c',
          false,
        ),
    });
    const outcome = await pull();
    expect(outcome.conflicts).toBe(1);
    expect(read(sqlite, 'notes', uuid(4))).toMatchObject({
      deleted_at: at(6),
      is_dirty: false,
    });
    expect(useConflictStore.getState().notices[0]?.summary).toMatch(
      /deleted on another device/,
    );
  });

  test('a remote edit newer than a local delete keeps the row and tells the traveller', async () => {
    seed(sqlite, 'trips', TRIP);
    seed(sqlite, 'notes', uuid(4), {
      is_dirty: true,
      updated_at: at(2),
      deleted_at: at(2),
    });
    routeApi(mockApiFetch, {
      pull: () =>
        pullPage({ notes: [wire('notes', uuid(4), { updated_at: at(6) })] }, 'c', false),
    });
    const outcome = await pull();
    expect(outcome.conflicts).toBe(1);
    expect(read(sqlite, 'notes', uuid(4)).deleted_at).toBeNull();
    expect(useConflictStore.getState().notices[0]?.summary).toMatch(/You deleted/);
  });
});

describe('the foreign-key problem: a child may arrive before its parent', () => {
  test('a note on page 1 and its trip on page 2 apply without failing, and the audit is clean', async () => {
    const duringPage2: number[] = [];
    routeApi(mockApiFetch, {
      pull: ({ path }) => {
        if (path === '/sync/pull') {
          return pullPage({ notes: [wire('notes', uuid(4))] }, 'c1', true);
        }
        // between the pages the note is stored, parentless, and inert
        duringPage2.push(syncRepository.foreignKeyViolations(sqlite.db));
        return pullPage({ trips: [wire('trips', TRIP)] }, 'c2', false);
      },
    });

    const outcome = await pull();

    expect(outcome).toMatchObject({
      complete: true,
      pages: 2,
      failure: null,
      orphans: 0,
    });
    expect(duringPage2).toEqual([1]);
    expect(read(sqlite, 'notes', uuid(4)).trip_id).toBe(TRIP);
    expect(read(sqlite, 'trips', TRIP).id).toBe(TRIP);
    expect(syncRepository.foreignKeyViolations(sqlite.db)).toBe(0);
    expect(
      (sqlite.native.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number })
        .foreign_keys,
    ).toBe(1);
  });

  test('every child table can precede its parent', async () => {
    routeApi(mockApiFetch, {
      pull: ({ path }) =>
        path === '/sync/pull'
          ? pullPage(
              {
                trip_stops: [wire('trip_stops', uuid(2))],
                notes: [wire('notes', uuid(4))],
                expenses: [wire('expenses', uuid(5))],
                photos: [wire('photos', uuid(6))],
                documents: [wire('documents', uuid(7))],
              },
              'c1',
              true,
            )
          : pullPage({ trips: [wire('trips', TRIP)] }, 'c2', false),
    });
    const outcome = await pull();
    expect(outcome).toMatchObject({ pulled: 6, orphans: 0, failure: null });
  });

  test('within one page rows apply parents first', async () => {
    routeApi(mockApiFetch, {
      pull: () =>
        pullPage(
          { trips: [wire('trips', TRIP)], notes: [wire('notes', uuid(4))] },
          'c',
          false,
        ),
    });
    expect((await pull()).orphans).toBe(0);
  });

  test('orphans left after a COMPLETE pull are reported and kept, never deleted', async () => {
    routeApi(mockApiFetch, {
      pull: () =>
        pullPage({ notes: [wire('notes', uuid(4), { trip_id: uuid(404) })] }, 'c', false),
    });
    const outcome = await pull();
    expect(outcome).toMatchObject({ complete: true, orphans: 1, failure: null });
    expect(read(sqlite, 'notes', uuid(4)).trip_id).toBe(uuid(404));
  });
});

describe('failures', () => {
  test.each([
    ['NETWORK', 'offline', networkError()],
    ['TIMEOUT', 'offline', new ApiRequestError(0, { code: 'TIMEOUT', message: 't' })],
    [
      'SESSION_EXPIRED',
      'unauthorized',
      new ApiRequestError(401, { code: 'SESSION_EXPIRED', message: 's' }),
    ],
    [
      'INVALID_RESPONSE',
      'invalid_response',
      new ApiRequestError(200, { code: 'INVALID_RESPONSE', message: 'i' }),
    ],
    ['a 503', 'server', new ApiRequestError(503, { code: 'UNKNOWN', message: 'u' })],
  ] as const)('%s is reported as %s', async (_label, failure, error) => {
    routeApi(mockApiFetch, {
      pull: () => {
        throw error;
      },
    });
    const outcome = await pull();
    expect(outcome).toMatchObject({ failure, pulled: 0, complete: false });
    expect(readPullCursor(sqlite.db)).toBeNull();
  });

  test('has_more without a moving cursor is a contract violation, not an endless loop', async () => {
    routeApi(mockApiFetch, {
      pull: () => pullPage({ trips: [wire('trips', TRIP)] }, 'stuck', true),
    });
    // page 1 moves the cursor from none to "stuck"; page 2 repeats it
    const outcome = await pull();
    expect(outcome.failure).toBe('invalid_response');
    expect(outcome.pages).toBe(1);
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  test('a response that fails its schema is never applied', async () => {
    routeApi(mockApiFetch, {
      pull: () =>
        pullPage({ trips: [{ ...wire('trips', TRIP), is_admin: true }] }, 'c', false),
    });
    const outcome = await pull();
    // routeApi validates like apiFetch: the smuggled key is INVALID_RESPONSE
    expect(outcome.failure).toBe('invalid_response');
    expect(maybeRead(sqlite, 'trips', TRIP)).toBeNull();
  });
});

describe('an abandoned cycle (the engine was unbound)', () => {
  test('sends nothing when it is no longer current', async () => {
    const calls = routeApi(mockApiFetch, { pull: () => pullPage({}, 'c', false) });
    const outcome = await pullChanges(contextFor(sqlite, () => false));
    expect(calls).toHaveLength(0);
    expect(outcome).toMatchObject({ failure: 'unauthorized', pulled: 0 });
  });

  test('applies nothing when the binding is lost while the request is in flight', async () => {
    let current = true;
    routeApi(mockApiFetch, {
      pull: () => {
        current = false; // the traveller signed out while the answer was on the wire
        return pullPage({ trips: [wire('trips', TRIP)] }, 'c', false);
      },
    });
    const outcome = await pullChanges(contextFor(sqlite, () => current));
    expect(outcome.failure).toBe('unauthorized');
    expect(maybeRead(sqlite, 'trips', TRIP)).toBeNull();
    expect(readPullCursor(sqlite.db)).toBeNull();
  });
});
