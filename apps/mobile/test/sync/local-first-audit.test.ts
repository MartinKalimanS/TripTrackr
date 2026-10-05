/**
 * The local-first audit — tasks.md T130, T138, T202 (FR-036, FR-037, FR-043;
 * research D-08, D-15, D-16; Constitution II).
 *
 * T130 and T202 ask for `local-write.ts` modules. The repositories in
 * `src/db/repositories/` ARE the local-first write layer (User Story 2's T206
 * concluded the same for notes and expenses), so a second layer of wrappers
 * would only be redundant. What the tasks' contract needs is PROOF that every
 * write path of every mirrored table behaves as that layer promises, and that
 * nothing on the read or write path reaches for the network or for an
 * entitlement. This is that proof, and it is written to go red the day someone
 * adds a write path that forgets:
 *
 *   1. PER TABLE, all seven of `SYNC_TABLES` (a table added to the protocol
 *      fails this file until it is audited here): a create and every update
 *      path dirty the row, stamp an ISO `updated_at`, and a remove is a
 *      tombstone — the row stays, dirty, with `deleted_at` — that no read sees.
 *   2. IDS are minted on the device by `expo-crypto`'s `randomUUID()` (D-15):
 *      in the hooks for trips, stops, notes, expenses and categories, and — as
 *      a source check, since they need the native pipeline — in photo and
 *      document capture.
 *   3. NO NETWORK (T138): the files under the content features and the
 *      repositories import the network in exactly the places the audit names
 *      (reference caches and the upload channel), and every write and read runs
 *      with the network dead without touching it.
 *   4. READ OFFLINE (T138, FR-043): a trip as a pull leaves it — rows clean,
 *      photos and documents without local bytes — is fully readable: itinerary,
 *      notes, expenses, the spending summary, photos, documents.
 *   5. T202: a trip, a stop and an expense against it are created with no
 *      network, past any allowance, without consulting an entitlement (nothing
 *      on the create path so much as mentions one), and custom categories —
 *      which already had a repository and a hook — are covered the same way.
 */
import { SYSTEM_EXPENSE_CATEGORIES, SYNC_TABLES } from '@triptrackr/contracts';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import { createElement, type PropsWithChildren } from 'react';

import { DatabaseProvider } from '@/db/client';
import { documentsRepository } from '@/db/repositories/documents';
import { expensesRepository } from '@/db/repositories/expenses';
import { notesRepository } from '@/db/repositories/notes';
import { photosRepository } from '@/db/repositories/photos';
import { stopsRepository } from '@/db/repositories/stops';
import { tripsRepository } from '@/db/repositories/trips';
import {
  documents,
  expenseCategories,
  expenses,
  notes,
  photos,
  tripStops,
  trips,
} from '@/db/schema';
import {
  useDocument,
  useDocumentActions,
  useDocuments,
} from '@/features/documents/use-documents';
import {
  useExpenseActions,
  useExpenseCategories,
  useExpenses,
  useSpendingSummary,
} from '@/features/expenses/use-expenses';
import { useNoteActions, useNotes } from '@/features/notes/use-notes';
import { usePhotoActions, usePhotos } from '@/features/photos/use-photos';
import {
  useTrip,
  useTripActions,
  useTripStops,
  useTrips,
} from '@/features/trips/use-trips';

import { createTestDatabase, type TestSqlite } from '../db/sqlite-harness';
import { DOCUMENTS, type FileSystemMock } from '../features/photo-fakes';

jest.mock('expo-file-system', () =>
  jest.requireActual('../features/photo-fakes').createFileSystemMock(),
);
jest.mock('expo-router', () => {
  const { useEffect } = require('react') as typeof import('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});
jest.mock('@/hooks/use-app-active', () => ({ useAppActive: () => true }));
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    apiFetch: jest.fn(async () => {
      throw new actual.ApiRequestError(0, { code: 'NETWORK', message: 'offline' });
    }),
  };
});
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));
jest.mock('@/sync/upload-queue', () => ({
  kickUploadQueue: jest.fn(async () => undefined),
}));

const { apiFetch } = jest.requireMock('@/lib/api-client') as { apiFetch: jest.Mock };
const { __fs } = jest.requireMock('expo-file-system') as FileSystemMock;

const SRC = join(__dirname, '..', '..', 'src');
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Only `Date` is faked: updated_at must advance on demand, nothing else may stall. */
const ONLY_DATE: Parameters<typeof jest.useFakeTimers>[0] = {
  now: new Date('2026-06-01T10:00:00.000Z'),
  doNotFake: [
    'hrtime',
    'nextTick',
    'performance',
    'queueMicrotask',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'requestIdleCallback',
    'cancelIdleCallback',
    'setImmediate',
    'clearImmediate',
    'setInterval',
    'clearInterval',
    'setTimeout',
    'clearTimeout',
  ],
};

const realFetch = global.fetch;
let sqlite: TestSqlite;

function wrapper({ children }: PropsWithChildren) {
  return createElement(DatabaseProvider, { value: sqlite.db }, children);
}

beforeEach(async () => {
  jest.useFakeTimers(ONLY_DATE);
  __fs.reset();
  apiFetch.mockClear();
  // The network is dead, and anything that goes looking for it is a finding.
  global.fetch = jest.fn(() => {
    throw new Error('The audit found a write or read that used the network.');
  }) as unknown as typeof fetch;
  sqlite = await createTestDatabase();
});

afterEach(() => {
  jest.useRealTimers();
  sqlite.close();
});

afterAll(() => {
  global.fetch = realFetch;
});

// ---------------------------------------------------------------------------
// 1. Every write path, every table
// ---------------------------------------------------------------------------

interface RawRow {
  id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  is_dirty: number;
  synced_at: string | null;
}

function raw(table: string, id: string): RawRow | undefined {
  return sqlite.native.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as
    RawRow | undefined;
}

function rawCount(table: string): number {
  const row = sqlite.native.prepare(`SELECT count(*) AS n FROM ${table}`).get() as {
    n: number;
  };
  return row.n;
}

/** The server acknowledged the row: clean, synced. What a device looks like after a sync. */
function settle(table: string, id: string) {
  sqlite.native
    .prepare(`UPDATE ${table} SET is_dirty = 0, synced_at = ? WHERE id = ?`)
    .run('2026-06-01T09:00:00.000Z', id);
}

/** Move the device clock forward, as time passes between the traveller's edits. */
function later(seconds = 5) {
  jest.setSystemTime(new Date(Date.now() + seconds * 1000));
}

function newTrip() {
  return tripsRepository.create(sqlite.db, {
    id: randomUUID(),
    title: 'Italy',
    home_currency: 'EUR',
  });
}

function newStop(tripId: string, arrive = '2026-06-10', depart = '2026-06-12') {
  return stopsRepository.add(sqlite.db, {
    id: randomUUID(),
    trip_id: tripId,
    city_id: 100,
    arrive_date: arrive,
    depart_date: depart,
  });
}

function stopOf(id: string) {
  const stop = sqlite.db
    .select()
    .from(tripStops)
    .all()
    .find((candidate) => candidate.id === id);
  if (!stop) throw new Error(`No stop ${id} in the audit database.`);
  return stop;
}

const FIELDS = {
  flight_number: 'AC834',
  flight_date: '2026-11-22',
  passenger_name: 'DESMARAIS/LUC',
};

interface Subject {
  table: string;
  /** A fresh live row in the table, whatever it needs around it. */
  create: () => string;
  /** Each way a traveller can change a live row. */
  updates: { name: string; apply: (id: string) => void }[];
  /** The traveller deleting it; absent where the product offers no delete. */
  remove?: (id: string) => void;
  /** The repository's own read: a tombstone must not appear in it. */
  visible?: (id: string) => boolean;
}

const SUBJECTS: Record<(typeof SYNC_TABLES)[number], Subject> = {
  trips: {
    table: 'trips',
    create: () => newTrip().id,
    // A trip has no edit path: the trip screen creates and deletes.
    updates: [],
    remove: (id) => tripsRepository.remove(sqlite.db, id),
    visible: (id) => tripsRepository.byIdQuery(sqlite.db, id).all().length > 0,
  },
  trip_stops: {
    table: 'trip_stops',
    create: () => newStop(newTrip().id).id,
    updates: [
      {
        name: 'updateDates',
        apply: (id) =>
          stopsRepository.updateDates(sqlite.db, id, {
            arrive_date: '2026-06-11',
            depart_date: '2026-06-13',
          }),
      },
      {
        name: 'move',
        apply: (id) => {
          // A sibling to swap with, settled like the stop itself.
          const sibling = newStop(stopOf(id).trip_id, '2026-06-14', '2026-06-16');
          settle('trip_stops', sibling.id);
          settle('trip_stops', id);
          later();
          stopsRepository.move(sqlite.db, id, 'down');
          // Both stops changed position: both are dirty.
          expect(raw('trip_stops', sibling.id)?.is_dirty).toBe(1);
        },
      },
      {
        name: 'reorder',
        apply: (id) => {
          const tripId = stopOf(id).trip_id;
          const sibling = newStop(tripId, '2026-06-14', '2026-06-16');
          settle('trip_stops', sibling.id);
          settle('trip_stops', id);
          later();
          stopsRepository.reorder(sqlite.db, tripId, [sibling.id, id]);
        },
      },
    ],
    remove: (id) => stopsRepository.remove(sqlite.db, id),
  },
  expense_categories: {
    table: 'expense_categories',
    create: () =>
      expensesRepository.createCategory(sqlite.db, { id: randomUUID(), name: 'Coffee' })
        .id,
    // FR-024 and the REST contract define create only: no rename, no delete.
    updates: [],
  },
  notes: {
    table: 'notes',
    create: () =>
      notesRepository.create(sqlite.db, {
        id: randomUUID(),
        trip_id: newTrip().id,
        country_id: 1,
        city_id: null,
        title: 'Cheese',
        body: 'Try the raclette.',
      }).id,
    updates: [
      {
        name: 'edit the body',
        apply: (id) => notesRepository.update(sqlite.db, id, { body: 'Try the fondue.' }),
      },
      {
        name: 'move to another anchor',
        apply: (id) =>
          notesRepository.update(sqlite.db, id, { country_id: 1, city_id: 101 }),
      },
    ],
    remove: (id) => notesRepository.remove(sqlite.db, id),
    visible: (id) => notesRepository.byId(sqlite.db, id) !== null,
  },
  expenses: {
    table: 'expenses',
    create: () =>
      expensesRepository.create(sqlite.db, {
        id: randomUUID(),
        trip_id: newTrip().id,
        home_currency: 'EUR',
        city_id: null,
        category_id: SYSTEM_EXPENSE_CATEGORIES[0].id,
        amount: '12.50',
        currency: 'EUR',
        spent_at: '2026-06-10',
        note: null,
      }).id,
    updates: [
      {
        name: 'edit the amount',
        apply: (id) => expensesRepository.update(sqlite.db, id, { amount: '13.00' }),
      },
      {
        name: 'recategorise',
        apply: (id) =>
          expensesRepository.update(sqlite.db, id, {
            category_id: SYSTEM_EXPENSE_CATEGORIES[1].id,
          }),
      },
    ],
    remove: (id) => expensesRepository.remove(sqlite.db, id),
    visible: (id) => expensesRepository.byId(sqlite.db, id) !== null,
  },
  photos: {
    table: 'photos',
    create: () =>
      photosRepository.create(sqlite.db, {
        id: randomUUID(),
        trip_id: newTrip().id,
        city_id: null,
        taken_at: null,
        exif_lat: null,
        exif_lng: null,
        local_file_uri: `photos/${randomUUID()}/${randomUUID()}.jpg`,
      }).id,
    updates: [
      {
        name: 'refile',
        apply: (id) => photosRepository.refile(sqlite.db, id, 100),
      },
    ],
    remove: (id) => photosRepository.remove(sqlite.db, id),
    visible: (id) => photosRepository.byId(sqlite.db, id) !== null,
  },
  documents: {
    table: 'documents',
    create: () =>
      documentsRepository.create(sqlite.db, {
        id: randomUUID(),
        trip_id: newTrip().id,
        type: 'boarding_pass',
        parsed_json: FIELDS,
        local_file_uri: `document-vault/${randomUUID()}.sealed`,
      }).id,
    updates: [
      {
        name: 'confirm the fields',
        apply: (id) => documentsRepository.confirmFields(sqlite.db, id, FIELDS),
      },
    ],
    remove: (id) => documentsRepository.remove(sqlite.db, id),
    visible: (id) => documentsRepository.byId(sqlite.db, id) !== null,
  },
};

describe('T130/T202 — every write path of every mirrored table is local-first', () => {
  test('the audit covers exactly the tables the sync protocol synchronises', () => {
    expect(Object.keys(SUBJECTS).sort()).toEqual([...SYNC_TABLES].sort());
  });

  describe.each(SYNC_TABLES.map((table) => [table, SUBJECTS[table]] as const))(
    '%s',
    (_table, subject) => {
      test('a create is dirty, never synced, stamped with an ISO time, and keeps the id the device minted', () => {
        const before = Date.now();
        const id = subject.create();

        const row = raw(subject.table, id)!;
        expect(id).toMatch(UUID_V4);
        expect(row).toMatchObject({ id, is_dirty: 1, synced_at: null, deleted_at: null });
        expect(row.updated_at).toMatch(ISO);
        expect(row.created_at).toMatch(ISO);
        expect(row.updated_at).toBe(row.created_at);
        expect(Date.parse(row.updated_at)).toBeGreaterThanOrEqual(before);
      });

      if (subject.updates.length === 0) {
        test('the product offers no edit for this table, so there is no update path to audit', () => {
          expect(subject.updates).toEqual([]);
        });
      }
      for (const update of subject.updates) {
        test(`update — ${update.name} — dirties a clean row and advances its updated_at`, () => {
          const id = subject.create();
          settle(subject.table, id);
          expect(raw(subject.table, id)?.is_dirty).toBe(0);
          const stamped = raw(subject.table, id)!.updated_at;
          later();

          update.apply(id);

          const row = raw(subject.table, id)!;
          expect(row.is_dirty).toBe(1);
          expect(row.updated_at).toMatch(ISO);
          expect(row.updated_at > stamped).toBe(true);
          expect(row.deleted_at).toBeNull();
        });
      }

      if (subject.remove) {
        const remove = subject.remove;
        test('a remove is a tombstone: the row stays, dirty and dated, and no read sees it', () => {
          const id = subject.create();
          settle(subject.table, id);
          const rowsBefore = rawCount(subject.table);
          later();

          remove(id);

          const row = raw(subject.table, id)!;
          // Still in the table, so the deletion can reach the server (FR-039)…
          expect(rawCount(subject.table)).toBe(rowsBefore);
          expect(row.is_dirty).toBe(1);
          expect(row.deleted_at).toMatch(ISO);
          expect(row.updated_at).toBe(row.deleted_at);
          // …and invisible to every read (the sync engine alone may see it).
          if (subject.visible) expect(subject.visible(id)).toBe(false);
        });

        test('removing what is already gone writes nothing and dirties nothing', () => {
          const id = subject.create();
          remove(id);
          settle(subject.table, id);
          const after = raw(subject.table, id);
          later();

          remove(id);

          expect(raw(subject.table, id)).toEqual(after);
        });
      } else {
        test('the product offers no delete for this table, so there is none to audit', () => {
          expect(subject.remove).toBeUndefined();
        });
      }
    },
  );

  test('deleting a trip tombstones its stops with it, all dirty, so the whole removal propagates', () => {
    const trip = newTrip();
    const first = newStop(trip.id);
    const second = newStop(trip.id, '2026-06-14', '2026-06-16');
    for (const stop of [first, second]) settle('trip_stops', stop.id);
    settle('trips', trip.id);
    later();

    tripsRepository.remove(sqlite.db, trip.id);

    for (const stop of [first, second]) {
      expect(raw('trip_stops', stop.id)).toMatchObject({
        is_dirty: 1,
        deleted_at: expect.stringMatching(ISO),
      });
    }
  });

  test('the upload channel’s marks mirror the server and are not traveller writes: they never dirty a row or move updated_at', () => {
    const photoId = SUBJECTS.photos.create();
    const stamped = raw('photos', photoId)!.updated_at;
    settle('photos', photoId);
    later();

    photosRepository.markFailed(sqlite.db, photoId);
    photosRepository.markPending(sqlite.db, photoId);

    expect(raw('photos', photoId)).toMatchObject({ is_dirty: 0, updated_at: stamped });
  });
});

// ---------------------------------------------------------------------------
// 2. Ids are minted on the device
// ---------------------------------------------------------------------------

describe('T130 — ids are minted on the device with expo-crypto (D-15)', () => {
  const FIXED = 'c1a7d2f0-5e3b-4a8c-9d61-0f2b7e4a9c13';

  test('every hook that creates a row takes its id from randomUUID()', async () => {
    const { result } = await renderHook(
      () => ({
        trip: useTripActions(),
        note: useNoteActions(),
        expense: useExpenseActions(),
      }),
      { wrapper },
    );
    const minted = randomUUID as unknown as jest.Mock;

    minted.mockReturnValueOnce(FIXED);
    const trip = result.current.trip.createTrip({ title: 'Italy', home_currency: 'EUR' });
    expect(trip.id).toBe(FIXED);

    minted.mockReturnValueOnce('11111111-1111-4111-8111-111111111111');
    const stop = result.current.trip.addStop({
      trip_id: trip.id,
      city_id: 100,
      arrive_date: '2026-06-10',
      depart_date: '2026-06-12',
    });
    expect(stop.id).toBe('11111111-1111-4111-8111-111111111111');

    minted.mockReturnValueOnce('22222222-2222-4222-8222-222222222222');
    const note = result.current.note.createNote({
      trip_id: trip.id,
      country_id: 1,
      city_id: null,
      title: null,
      body: 'Gelato.',
    });
    expect(note.id).toBe('22222222-2222-4222-8222-222222222222');

    minted.mockReturnValueOnce('33333333-3333-4333-8333-333333333333');
    const category = result.current.expense.createCategory({ name: 'Coffee' });
    expect(category.id).toBe('33333333-3333-4333-8333-333333333333');

    minted.mockReturnValueOnce('44444444-4444-4444-8444-444444444444');
    const expense = result.current.expense.createExpense({
      trip_id: trip.id,
      home_currency: 'EUR',
      city_id: null,
      category_id: category.id,
      amount: '3.20',
      currency: 'EUR',
      spent_at: '2026-06-10',
      note: null,
    });
    expect(expense.id).toBe('44444444-4444-4444-8444-444444444444');
  });

  test.each([
    ['photo capture', 'features/photos/capture.ts'],
    ['document capture', 'features/documents/capture.ts'],
  ])('%s mints its id with expo-crypto and uses it for the row', (_name, file) => {
    const source = readFileSync(join(SRC, file), 'utf8');
    expect(source).toMatch(/import \{ randomUUID \} from 'expo-crypto'/);
    expect(source).toMatch(/const id = randomUUID\(\)/);
    // The same id names the files and the row (and is what is registered).
    expect(source).toMatch(/\bid,\s/);
  });
});

// ---------------------------------------------------------------------------
// 3. Nothing on the read or write path touches the network
// ---------------------------------------------------------------------------

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      return name === '__tests__' || name === 'migrations' ? [] : sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const slash = (path: string) => relative(SRC, path).split(sep).join('/');

const NETWORK = /@\/lib\/api-client|expo-network|\bfetch\(|XMLHttpRequest|apiFetch/;

/**
 * Where the local-first layer and the content features DO reach the network,
 * and why each is allowed: reference data refreshed into a cache, and the upload
 * channel that runs AFTER the local write, never before or instead of it.
 */
const ALLOWED_NETWORK: Record<string, string> = {
  'features/expenses/use-fx-rates.ts':
    'refreshes the cached FX snapshot (reference data)',
  'features/geography/use-geography.ts': 'refreshes the cached countries and cities',
  'features/photos/upload.ts': 'the upload channel (sync-protocol.md §4)',
  'features/photos/refile.ts': 'the PATCH that follows a local refile',
  'features/documents/upload.ts': 'the upload channel (sync-protocol.md §4)',
};

const CONTENT_FEATURES = [
  'trips',
  'notes',
  'expenses',
  'photos',
  'documents',
  'globe',
  'geography',
];

describe('T138 — the read and write layer never reaches for the network', () => {
  test('no repository imports or calls the network', () => {
    const offenders = sourceFiles(join(SRC, 'db'))
      .filter((file) => NETWORK.test(readFileSync(file, 'utf8')))
      .map(slash);
    expect(offenders).toEqual([]);
  });

  test('the content features reach the network only where the audit names, and for the reasons given', () => {
    const reaching = CONTENT_FEATURES.flatMap((feature) =>
      sourceFiles(join(SRC, 'features', feature)),
    )
      .filter((file) => NETWORK.test(readFileSync(file, 'utf8')))
      .map(slash)
      .sort();

    expect(reaching).toEqual(Object.keys(ALLOWED_NETWORK).sort());
  });

  test('trip, stop, note and expense hooks — the whole create path — are network-free', () => {
    for (const file of [
      'features/trips/use-trips.ts',
      'features/notes/use-notes.ts',
      'features/notes/use-move-note.ts',
      'features/expenses/use-expenses.ts',
    ]) {
      expect(readFileSync(join(SRC, file), 'utf8')).not.toMatch(NETWORK);
    }
  });

  test('every write path, run with the network dead, finishes without a single call', async () => {
    const { result } = await renderHook(
      () => ({
        trip: useTripActions(),
        note: useNoteActions(),
        expense: useExpenseActions(),
      }),
      { wrapper },
    );
    const {
      trip: tripActions,
      note: noteActions,
      expense: expenseActions,
    } = result.current;

    const trip = tripActions.createTrip({ title: 'Italy', home_currency: 'EUR' });
    const stop = tripActions.addStop({
      trip_id: trip.id,
      city_id: 100,
      arrive_date: '2026-06-10',
      depart_date: '2026-06-12',
    });
    tripActions.updateStopDates(stop.id, {
      arrive_date: '2026-06-11',
      depart_date: '2026-06-13',
    });
    tripActions.reorderStops(trip.id, [stop.id]);
    const note = noteActions.createNote({
      trip_id: trip.id,
      country_id: 1,
      city_id: null,
      title: null,
      body: 'Gelato.',
    });
    noteActions.updateNote(note.id, { body: 'More gelato.' });
    const category = expenseActions.createCategory({ name: 'Coffee' });
    const expense = expenseActions.createExpense({
      trip_id: trip.id,
      home_currency: 'EUR',
      city_id: null,
      category_id: category.id,
      amount: '3.20',
      currency: 'USD',
      spent_at: '2026-06-10',
      note: null,
    });
    expenseActions.updateExpense(expense.id, { amount: '3.50' });
    expenseActions.removeExpense(expense.id);
    noteActions.removeNote(note.id);
    tripActions.removeStop(stop.id);
    tripActions.removeTrip(trip.id);

    expect(apiFetch).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(raw('trips', trip.id)?.deleted_at).toMatch(ISO);
  });

  test('photo and document writes land locally first; the network, offline, only fails quietly after', async () => {
    const tripId = newTrip().id;
    const photoId = randomUUID();
    const relative = `photos/${tripId}/${photoId}.jpg`;
    __fs.write(`${DOCUMENTS}/${relative}`);
    __fs.write(`${DOCUMENTS}/photos/${tripId}/${photoId}.thumb.jpg`);
    photosRepository.create(sqlite.db, {
      id: photoId,
      trip_id: tripId,
      city_id: null,
      taken_at: null,
      exif_lat: null,
      exif_lng: null,
      local_file_uri: relative,
    });
    const documentId = randomUUID();
    documentsRepository.create(sqlite.db, {
      id: documentId,
      trip_id: tripId,
      type: 'boarding_pass',
      parsed_json: FIELDS,
      local_file_uri: `document-vault/${documentId}.sealed`,
    });
    const { result } = await renderHook(
      () => ({ photo: usePhotoActions(), document: useDocumentActions() }),
      { wrapper },
    );

    await act(async () => {
      result.current.photo.refile(photoId, 100);
      result.current.document.confirmFields(documentId, FIELDS);
    });

    expect(raw('photos', photoId)).toMatchObject({ is_dirty: 1 });
    expect(raw('documents', documentId)).toMatchObject({ is_dirty: 1 });
    // A pending photo has no server row to patch, so even the follow-up is silent.
    expect(apiFetch).not.toHaveBeenCalled();

    await act(async () => {
      result.current.photo.remove(photoId);
      result.current.document.remove(documentId);
    });

    expect(raw('photos', photoId)?.deleted_at).toMatch(ISO);
    expect(raw('documents', documentId)?.deleted_at).toMatch(ISO);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4. A previously synced trip is fully readable offline
// ---------------------------------------------------------------------------

describe('T138 — a previously synced trip is fully readable with no network (FR-043)', () => {
  const TRIP = '5b0e2f4a-7c11-4d3e-8a90-1c2d3e4f5a6b';
  const DOC = '6c1f3a5b-8d22-4e4f-9b01-2d3e4f5a6b7c';
  const CUSTOM = '7d2a4b6c-9e33-4f50-8c12-3e4f5a6b7c8d';
  const SYNCED_AT = '2026-05-30T08:00:00.000Z';
  const meta = {
    created_at: '2026-05-01T08:00:00.000Z',
    updated_at: SYNCED_AT,
    deleted_at: null,
    is_dirty: false,
    synced_at: SYNCED_AT,
  };

  /** Rows exactly as a pull leaves them: clean, and no local bytes for another device's files. */
  function seedAsPulled() {
    sqlite.db
      .insert(trips)
      .values({
        ...meta,
        id: TRIP,
        title: 'Italy, spring',
        home_currency: 'EUR',
        is_public: false,
        cover_photo_id: null,
        status: 'past',
      })
      .run();
    sqlite.db
      .insert(tripStops)
      .values([
        {
          ...meta,
          id: randomUUID(),
          trip_id: TRIP,
          city_id: 100,
          sort_order: 0,
          arrive_date: '2026-05-10',
          depart_date: '2026-05-12',
        },
        {
          ...meta,
          id: randomUUID(),
          trip_id: TRIP,
          city_id: 101,
          sort_order: 1,
          arrive_date: '2026-05-12',
          depart_date: '2026-05-15',
        },
      ])
      .run();
    sqlite.db
      .insert(expenseCategories)
      .values({ ...meta, id: CUSTOM, name: 'Coffee', icon: null })
      .run();
    sqlite.db
      .insert(notes)
      .values({
        ...meta,
        id: randomUUID(),
        trip_id: TRIP,
        country_id: 1,
        city_id: null,
        title: 'Cheese',
        body: 'Try the raclette.',
        is_public: false,
      })
      .run();
    sqlite.db
      .insert(expenses)
      .values([
        {
          ...meta,
          id: randomUUID(),
          trip_id: TRIP,
          city_id: null,
          category_id: CUSTOM,
          amount: '4.20',
          currency: 'EUR',
          spent_at: '2026-05-11',
          note: null,
          fx_rate_to_home: '1.000000',
          amount_home: '4.20',
          fx_pending: false,
        },
        {
          ...meta,
          id: randomUUID(),
          trip_id: TRIP,
          city_id: null,
          category_id: SYSTEM_EXPENSE_CATEGORIES[0].id,
          amount: '20.00',
          currency: 'EUR',
          spent_at: '2026-05-12',
          note: 'Dinner',
          fx_rate_to_home: '1.000000',
          amount_home: '20.00',
          fx_pending: false,
        },
      ])
      .run();
    sqlite.db
      .insert(photos)
      .values({
        ...meta,
        id: randomUUID(),
        trip_id: TRIP,
        city_id: 100,
        taken_at: '2026-05-11T10:00:00.000Z',
        exif_lat: null,
        exif_lng: null,
        is_public: false,
        upload_state: 'uploaded',
        moderation_state: 'pending',
        has_thumbnail: true,
        local_file_uri: null,
      })
      .run();
    sqlite.db
      .insert(documents)
      .values({
        ...meta,
        id: DOC,
        trip_id: TRIP,
        type: 'boarding_pass',
        parsed_json: FIELDS,
        parsed_confirmed_at: SYNCED_AT,
        upload_state: 'uploaded',
        local_file_uri: null,
      })
      .run();
  }

  test('itinerary, notes, expenses, categories, the summary, photos and documents all read from the device', async () => {
    seedAsPulled();
    const { result } = await renderHook(
      () => {
        const expensesResult = useExpenses(TRIP);
        return {
          trips: useTrips('2026-06-01'),
          trip: useTrip(TRIP),
          stops: useTripStops(TRIP),
          notes: useNotes(TRIP),
          expenses: expensesResult,
          categories: useExpenseCategories(),
          summary: useSpendingSummary(expensesResult, 'EUR'),
          photos: usePhotos(TRIP),
          documents: useDocuments(TRIP),
          document: useDocument(DOC),
        };
      },
      { wrapper },
    );
    await waitFor(() =>
      expect(Object.values(result.current).every((live) => !live.loading)).toBe(true),
    );

    const read = result.current;
    expect(read.trips.data).toHaveLength(1);
    expect(read.trip.data).toMatchObject({ id: TRIP, title: 'Italy, spring' });
    expect(read.stops.data.map((stop) => stop.city_id)).toEqual([100, 101]);
    expect(read.notes.data.map((note) => note.body)).toEqual(['Try the raclette.']);
    expect(read.expenses.data).toHaveLength(2);
    expect(read.categories.data.map((category) => category.name)).toEqual(
      expect.arrayContaining([SYSTEM_EXPENSE_CATEGORIES[0].name, 'Coffee']),
    );
    expect(read.summary.data.total_home).toBe('24.20');
    expect(read.photos.data).toHaveLength(1);
    expect(read.photos.data[0]).toMatchObject({ upload_state: 'uploaded', city_id: 100 });
    expect(read.documents.data).toHaveLength(1);
    expect(read.document.data).toMatchObject({ id: DOC, parsed_json: FIELDS });
    for (const live of Object.values(read)) expect(live.error).toBeNull();

    expect(apiFetch).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('a tombstone the sync engine pulled is invisible to every one of those reads', async () => {
    seedAsPulled();
    sqlite.native
      .prepare(`UPDATE notes SET deleted_at = ?, updated_at = ? WHERE trip_id = ?`)
      .run(SYNCED_AT, SYNCED_AT, TRIP);
    sqlite.native
      .prepare(`UPDATE documents SET deleted_at = ? WHERE id = ?`)
      .run(SYNCED_AT, DOC);
    const { result } = await renderHook(
      () => ({
        notes: useNotes(TRIP),
        document: useDocument(DOC),
        documents: useDocuments(TRIP),
      }),
      { wrapper },
    );
    await waitFor(() =>
      expect(Object.values(result.current).every((live) => !live.loading)).toBe(true),
    );

    expect(result.current.notes.data).toEqual([]);
    expect(result.current.documents.data).toEqual([]);
    expect(result.current.document.data).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. T202 — a trip, a stop and an expense against it, in aeroplane mode
// ---------------------------------------------------------------------------

describe('T202 — created with no network, past any allowance, consulting no entitlement (D-08, D-16)', () => {
  const ENTITLEMENT =
    /entitlement|allowance|react-native-purchases|RevenueCat|paywall|subscription|purchases/i;

  test('nothing on the create path so much as mentions an entitlement', () => {
    const createPath = [
      'db/repositories/trips.ts',
      'db/repositories/stops.ts',
      'db/repositories/expenses.ts',
      'db/repositories/fx-rates.ts',
      'features/trips/use-trips.ts',
      'features/trips/trip-form.ts',
      'features/expenses/use-expenses.ts',
      'features/expenses/expense-form.ts',
      'app/modal/add-trip.tsx',
      'app/modal/add-expense.tsx',
    ];
    const offenders = createPath.filter((file) =>
      ENTITLEMENT.test(readFileSync(join(SRC, file), 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  test('a trip, a stop and an expense against it: all accepted locally, dirty, the expense naming the right trip', async () => {
    const { result } = await renderHook(
      () => ({ trip: useTripActions(), expense: useExpenseActions() }),
      { wrapper },
    );

    const trip = result.current.trip.createTrip({ title: 'Italy', home_currency: 'EUR' });
    const stop = result.current.trip.addStop({
      trip_id: trip.id,
      city_id: 100,
      arrive_date: '2026-06-10',
      depart_date: '2026-06-12',
    });
    const expense = result.current.expense.createExpense({
      trip_id: trip.id,
      home_currency: 'EUR',
      city_id: null,
      category_id: SYSTEM_EXPENSE_CATEGORIES[0].id,
      amount: '12.50',
      currency: 'EUR',
      spent_at: '2026-06-10',
      note: null,
    });

    for (const [table, id] of [
      ['trips', trip.id],
      ['trip_stops', stop.id],
      ['expenses', expense.id],
    ] as const) {
      expect(raw(table, id)).toMatchObject({ is_dirty: 1, synced_at: null });
    }
    expect(stop.trip_id).toBe(trip.id);
    expect(expense.trip_id).toBe(trip.id);
    expect(apiFetch).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('trips past any allowance are all accepted on the device — the commercial question is the server’s, later, and never destroys one', async () => {
    const { result } = await renderHook(() => useTripActions(), { wrapper });

    for (let index = 0; index < 8; index += 1) {
      result.current.createTrip({ title: `Trip ${index}`, home_currency: 'EUR' });
    }

    expect(rawCount('trips')).toBe(8);
    expect(
      sqlite.native.prepare('SELECT count(*) AS n FROM trips WHERE is_dirty = 1').get(),
    ).toEqual({ n: 8 });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test('a custom category is a local write like any other, reusable across trips, never a system row', async () => {
    const { result } = await renderHook(
      () => ({ expense: useExpenseActions(), categories: useExpenseCategories() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.categories.loading).toBe(false));
    // The six system rows are constants, never stored on the device.
    expect(rawCount('expense_categories')).toBe(0);
    expect(result.current.categories.data.filter((c) => c.system)).toHaveLength(
      SYSTEM_EXPENSE_CATEGORIES.length,
    );

    const first = result.current.expense.createCategory({ name: 'Coffee' });
    const again = result.current.expense.createCategory({ name: ' coffee ' });

    // Creating one that exists (any case) answers with the existing row.
    expect(again.id).toBe(first.id);
    expect(rawCount('expense_categories')).toBe(1);
    expect(raw('expense_categories', first.id)).toMatchObject({
      is_dirty: 1,
      synced_at: null,
    });

    const tripA = newTrip();
    const tripB = newTrip();
    for (const trip of [tripA, tripB]) {
      const expense = result.current.expense.createExpense({
        trip_id: trip.id,
        home_currency: 'EUR',
        city_id: null,
        category_id: first.id,
        amount: '2.00',
        currency: 'EUR',
        spent_at: '2026-06-10',
        note: null,
      });
      expect(expense.category_id).toBe(first.id);
    }
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
