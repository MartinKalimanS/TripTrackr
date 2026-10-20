import { SYSTEM_EXPENSE_CATEGORIES, type SyncTable } from '@triptrackr/contracts';
import type { Sql, TransactionSql } from 'postgres';

import { StorageService } from '@/common/storage/storage.service';
import {
  TOMBSTONE_RETENTION_DAYS,
  purgeTombstones,
  type PurgeStorage,
} from '@/workers/tombstone-purge.processor';

import { applyDatabaseTestEnv } from '../support/env';
import { AGES, PurgeFixtures, type Age, type Traveller } from '../support/purge-fixtures';
import { createHarness, type Harness } from './harness';

/**
 * The tombstone retention purge against the real thing (tasks.md T129;
 * sync-protocol.md §5; Constitution V; FR-039): migration 0013's two
 * `SECURITY DEFINER` keyholes on a real PostgreSQL + PostGIS, called as the API
 * role with no traveller identity, exactly as the worker calls them, and the
 * processor over them with a recording object store and with RustFS.
 * test/unit/tombstone-purge.processor.spec.ts pins the processor's ordering
 * against scripted stand-ins; this proves the SQL those stand-ins claim to
 * answer for.
 *
 * Ages are written by the database's own clock (test/support/purge-fixtures.ts),
 * and every test works on accounts of its own, removed afterwards: the purge
 * acts on the whole database, so a shared account would be counting leftovers.
 */

const TABLES = [
  'expenses',
  'notes',
  'photos',
  'documents',
  'trip_stops',
  'expense_categories',
  'trips',
] as const satisfies readonly SyncTable[];

type Counts = Readonly<Record<string, number>>;

/** Seeds one row of a table on a traveller's live trip, with the given tombstone age. */
type SeedRow = (f: PurgeFixtures, t: Traveller, age: Age) => Promise<string>;

const SEED: Readonly<Record<SyncTable, SeedRow>> = {
  trips: (f, t, age) => f.trip(t.id, age),
  trip_stops: (f, t, age) => f.stop(t.tripId, age),
  expense_categories: (f, t, age) => f.category(t.id, age),
  notes: (f, t, age) => f.note(t.tripId, age),
  expenses: (f, t, age) => f.expense(t.tripId, age),
  photos: async (f, t, age) => (await f.photo(t.tripId, age)).id,
  documents: async (f, t, age) => (await f.document(t.tripId, age)).id,
};

/** The tables whose rows hang off a trip, and how to seed one on a given trip. */
const CHILDREN = [
  ['trip_stops', (f, tripId, age) => f.stop(tripId, age)],
  ['notes', (f, tripId, age) => f.note(tripId, age)],
  ['expenses', (f, tripId, age) => f.expense(tripId, age)],
  ['photos', async (f, tripId, age) => (await f.photo(tripId, age)).id],
  ['documents', async (f, tripId, age) => (await f.document(tripId, age)).id],
] as const satisfies readonly (readonly [
  SyncTable,
  (f: PurgeFixtures, tripId: string, age: Age) => Promise<string>,
])[];

describe('the tombstone purge on PostgreSQL and RustFS', () => {
  let harness: Harness;
  let fixtures: PurgeFixtures;

  beforeAll(async () => {
    applyDatabaseTestEnv();
    harness = await createHarness();
    fixtures = new PurgeFixtures(harness.owner);
  });

  afterEach(async () => {
    await fixtures?.cleanUp();
  });

  afterAll(async () => {
    await harness?.close();
  });

  /** `tombstone_purge`, as the worker calls it: the API role, no identity. */
  async function purge(days: number | null = TOMBSTONE_RETENTION_DAYS): Promise<Counts> {
    const rows = await harness.api<{ table_name: string; purged: string }[]>`
      SELECT table_name, purged FROM tombstone_purge(${days}::integer)
    `;

    return Object.fromEntries(rows.map((row) => [row.table_name, Number(row.purged)]));
  }

  /** `tombstone_purge_objects`, likewise, as `bucket/key` strings in a stable order. */
  async function listed(
    days: number | null = TOMBSTONE_RETENTION_DAYS,
  ): Promise<string[]> {
    const rows = await harness.api<{ bucket: string; object_key: string }[]>`
      SELECT bucket, object_key FROM tombstone_purge_objects(${days}::integer)
    `;

    return rows.map((row) => `${row.bucket}/${row.object_key}`).sort();
  }

  const bothPresent = async (table: SyncTable, ids: readonly string[]) =>
    Promise.all(ids.map((id) => fixtures.present(table, id)));

  describe('the two keyholes (migration 0013)', () => {
    const SIGNATURES = ['tombstone_purge_objects(integer)', 'tombstone_purge(integer)'];

    it('are SECURITY DEFINER with a pinned search_path, executable by the API role and nobody else', async () => {
      for (const signature of SIGNATURES) {
        const [fn] = await harness.owner<
          {
            definer: boolean;
            path: string[] | null;
            public_can: boolean;
            api_can: boolean;
          }[]
        >`
          SELECT p.prosecdef AS definer,
                 p.proconfig AS path,
                 has_function_privilege('public', p.oid, 'EXECUTE') AS public_can,
                 has_function_privilege('triptrackr_api', p.oid, 'EXECUTE') AS api_can
          FROM pg_proc p WHERE p.oid = ${signature}::regprocedure
        `;

        expect(fn).toEqual({
          definer: true,
          path: ['search_path=public, pg_temp'],
          public_can: false,
          api_can: true,
        });
      }
    });

    it('can be called by the API role with no traveller identity, which cannot reach the same rows directly', async () => {
      const t = await fixtures.traveller();
      const rows = await Promise.all(
        TABLES.map(
          async (table) => [table, await SEED[table](fixtures, t, AGES.old)] as const,
        ),
      );

      // Every direct route is shut: with no identity the owner policies cannot
      // even be evaluated, so the statement fails rather than finding nothing.
      for (const [table, id] of rows) {
        await expect(
          harness.api.unsafe(`SELECT id FROM ${table} WHERE id = $1::uuid`, [id]),
        ).rejects.toThrow();
        await expect(
          harness.api.unsafe(`DELETE FROM ${table} WHERE id = $1::uuid`, [id]),
        ).rejects.toThrow();
        expect(await fixtures.present(table, id)).toBe(true);
      }

      // The keyholes, on the same connection and with the same absence of
      // identity, reach exactly those rows and nothing else.
      expect(await listed()).toHaveLength(3);
      expect(await purge()).toEqual(
        Object.fromEntries(TABLES.map((table) => [table, 1])),
      );
      for (const [table, id] of rows) {
        expect(await fixtures.present(table, id)).toBe(false);
      }
    });

    it('leave a stranger who is signed in no more reach: another traveller’s due tombstones are invisible and undeletable to them', async () => {
      const owner = await fixtures.traveller();
      const stranger = await fixtures.traveller();
      const rows = await Promise.all(
        TABLES.map(
          async (table) => [table, await SEED[table](fixtures, owner, AGES.old)] as const,
        ),
      );

      for (const [table, id] of rows) {
        const seen = await harness.asUser(stranger.id, (tx) =>
          tx.unsafe(`SELECT id FROM ${table} WHERE id = $1::uuid`, [id]),
        );
        const deleted = await harness.asUser(stranger.id, (tx) =>
          tx.unsafe(`DELETE FROM ${table} WHERE id = $1::uuid RETURNING id`, [id]),
        );

        expect(seen).toHaveLength(0);
        expect(deleted).toHaveLength(0);
        expect(await fixtures.present(table, id)).toBe(true);
      }
    });
  });

  describe('the 90-day floor', () => {
    it.each([[0], [1], [89], [-30], [null]])(
      'a window of %s days is raised to 90: a tombstone five minutes short of it survives, one five minutes past it goes',
      async (days: number | null) => {
        const t = await fixtures.traveller();
        const short = await fixtures.note(t.tripId, AGES.justShort);
        const young = await fixtures.photo(t.tripId, AGES.young);
        const past = await fixtures.note(t.tripId, AGES.justDue);
        const pastPhoto = await fixtures.photo(t.tripId, AGES.justDue);

        // The listing keyhole honours the floor as well as the purge keyhole.
        expect(await listed(days)).toEqual(
          [`photos/${pastPhoto.key}`, `photos/${pastPhoto.key}.thumb.jpg`].sort(),
        );
        const counts = await purge(days);

        expect(counts).toMatchObject({ notes: 1, photos: 1 });
        expect(await bothPresent('notes', [short, past])).toEqual([true, false]);
        expect(await bothPresent('photos', [young.id, pastPhoto.id])).toEqual([
          true,
          false,
        ]);
      },
    );

    it('honours a longer window: 365 days leaves a 120-day tombstone alone and takes one older than a year', async () => {
      const t = await fixtures.traveller();
      const fourMonths = await fixtures.note(t.tripId, AGES.old);
      const overAYear = await fixtures.note(t.tripId, 400 * 24 * 60);
      const keptObject = await fixtures.document(t.tripId, AGES.old);

      expect(await listed(365)).toEqual([]);
      const counts = await purge(365);

      expect(counts.notes).toBe(1);
      expect(counts.documents).toBe(0);
      expect(await bothPresent('notes', [fourMonths, overAYear])).toEqual([true, false]);
      expect(await fixtures.present('documents', keptObject.id)).toBe(true);
    });
  });

  describe('what is removed', () => {
    it('reports exactly the seven tables, in child-before-parent order, zero where nothing was due', async () => {
      await fixtures.traveller();

      const rows = await harness.api<{ table_name: string; purged: string }[]>`
        SELECT table_name, purged FROM tombstone_purge(${TOMBSTONE_RETENTION_DAYS}::integer)
      `;

      expect(rows.map((row) => [row.table_name, Number(row.purged)])).toEqual(
        TABLES.map((table) => [table, 0]),
      );
    });

    it.each(TABLES)(
      '%s: only a row tombstoned longer ago than the window is removed — live rows and younger tombstones stay',
      async (table) => {
        const t = await fixtures.traveller();
        const seed = (age: Age) => SEED[table](fixtures, t, age);
        const due = [await seed(AGES.old), await seed(AGES.justDue)];
        const kept = [
          await seed(AGES.young),
          await seed(AGES.justShort),
          await seed(null),
        ];

        const counts = await purge();

        expect(counts[table]).toBe(2);
        expect(await bothPresent(table, due)).toEqual([false, false]);
        expect(await bothPresent(table, kept)).toEqual([true, true, true]);
        for (const other of TABLES.filter((name) => name !== table)) {
          expect(counts[other]).toBe(0);
        }
        // Whatever it was hanging from is untouched.
        expect(await fixtures.present('trips', t.tripId)).toBe(true);
      },
    );

    it('never purges a system category, whatever its deleted_at says', async () => {
      class Rolled extends Error {}
      let counts: Counts = {};
      let remaining = -1;

      // Inside a transaction that is rolled back: the six system rows are shared
      // by every other suite and must not be left tombstoned, even for a moment
      // that anyone else could see.
      await expect(
        harness.owner.begin(async (tx) => {
          await tx`
            UPDATE expense_categories
            SET deleted_at = now() - make_interval(mins => ${AGES.old})
            WHERE user_id IS NULL
          `;
          const rows = await tx<{ table_name: string; purged: string }[]>`
            SELECT table_name, purged FROM tombstone_purge(${TOMBSTONE_RETENTION_DAYS}::integer)
          `;
          counts = Object.fromEntries(
            rows.map((row) => [row.table_name, Number(row.purged)]),
          );
          const [left] = await tx<{ n: number }[]>`
            SELECT count(*)::int AS n FROM expense_categories WHERE user_id IS NULL
          `;
          remaining = left?.n ?? -1;
          throw new Rolled();
        }),
      ).rejects.toBeInstanceOf(Rolled);

      expect(counts.expense_categories).toBe(0);
      expect(remaining).toBe(SYSTEM_EXPENSE_CATEGORIES.length);
      const [after] = await harness.owner<{ n: number; tombstoned: number }[]>`
        SELECT count(*)::int AS n, count(deleted_at)::int AS tombstoned
        FROM expense_categories WHERE user_id IS NULL
      `;
      expect(after).toEqual({ n: SYSTEM_EXPENSE_CATEGORIES.length, tombstoned: 0 });
    });

    it('keeps a due category that a surviving expense still names, without failing on its foreign key', async () => {
      const t = await fixtures.traveller();
      const named = await fixtures.category(t.id, AGES.old);
      const byLive = await fixtures.expense(t.tripId, null, named);
      const inWindow = await fixtures.category(t.id, AGES.old);
      const byYoung = await fixtures.expense(t.tripId, AGES.young, inWindow);
      const unused = await fixtures.category(t.id, AGES.old);

      const counts = await purge();

      expect(counts.expense_categories).toBe(1);
      expect(await bothPresent('expense_categories', [named, inWindow, unused])).toEqual([
        true,
        true,
        false,
      ]);
      expect(await bothPresent('expenses', [byLive, byYoung])).toEqual([true, true]);
    });

    it('purges a due category together with the due expense that named it, expenses first', async () => {
      const t = await fixtures.traveller();
      const category = await fixtures.category(t.id, AGES.old);
      const expense = await fixtures.expense(t.tripId, AGES.old, category);

      const counts = await purge();

      expect(counts).toMatchObject({ expenses: 1, expense_categories: 1 });
      expect(await fixtures.present('expenses', expense)).toBe(false);
      expect(await fixtures.present('expense_categories', category)).toBe(false);
    });

    it('purges the category once the expense that held it has itself become due', async () => {
      const t = await fixtures.traveller();
      const category = await fixtures.category(t.id, AGES.old);
      const expense = await fixtures.expense(t.tripId, AGES.young, category);
      await purge();
      expect(await fixtures.present('expense_categories', category)).toBe(true);

      await fixtures.setAge('expenses', expense, AGES.old);
      await purge();

      expect(await bothPresent('expenses', [expense])).toEqual([false]);
      expect(await fixtures.present('expense_categories', category)).toBe(false);
    });
  });

  describe('a due trip', () => {
    it('with nothing beneath it goes, planner rows with it, and other trips are untouched', async () => {
      const t = await fixtures.traveller();
      const trip = await fixtures.trip(t.id, AGES.old);
      const day = await fixtures.itineraryDay(trip);

      const counts = await purge();

      expect(counts.trips).toBe(1);
      expect(await fixtures.present('trips', trip)).toBe(false);
      const days =
        await harness.owner`SELECT 1 FROM itinerary_days WHERE id = ${day}::uuid`;
      expect(days).toHaveLength(0);
      expect(await fixtures.present('trips', t.tripId)).toBe(true);
    });

    describe.each(CHILDREN)('with a %s row beneath it', (table, seedChild) => {
      it('stays while the child is live: content on a deleted trip is not ours to cascade away', async () => {
        const t = await fixtures.traveller();
        const trip = await fixtures.trip(t.id, AGES.old);
        const child = await seedChild(fixtures, trip, null);

        const counts = await purge();

        expect(counts.trips).toBe(0);
        expect(await fixtures.present('trips', trip)).toBe(true);
        expect(await fixtures.present(table, child)).toBe(true);
      });

      it('stays while the child is tombstoned inside the window', async () => {
        const t = await fixtures.traveller();
        const trip = await fixtures.trip(t.id, AGES.old);
        const child = await seedChild(fixtures, trip, AGES.young);

        const counts = await purge();

        expect(counts.trips).toBe(0);
        expect(await fixtures.present('trips', trip)).toBe(true);
        expect(await fixtures.present(table, child)).toBe(true);
      });

      it('goes, in the same run as the child, once the child is due too', async () => {
        const t = await fixtures.traveller();
        const trip = await fixtures.trip(t.id, AGES.old);
        const child = await seedChild(fixtures, trip, AGES.old);

        const counts = await purge();

        expect(counts.trips).toBe(1);
        expect(counts[table]).toBe(1);
        expect(await fixtures.present('trips', trip)).toBe(false);
        expect(await fixtures.present(table, child)).toBe(false);
      });
    });

    it('stays until its last child is due, then goes with it', async () => {
      const t = await fixtures.traveller();
      const trip = await fixtures.trip(t.id, AGES.old);
      const due = await fixtures.note(trip, AGES.old);
      const last = await fixtures.expense(trip, AGES.young);

      const first = await purge();

      expect(first).toMatchObject({ notes: 1, expenses: 0, trips: 0 });
      expect(await fixtures.present('notes', due)).toBe(false);
      expect(await fixtures.present('trips', trip)).toBe(true);

      await fixtures.setAge('expenses', last, AGES.justDue);
      const second = await purge();

      expect(second).toMatchObject({ expenses: 1, trips: 1 });
      expect(await fixtures.present('expenses', last)).toBe(false);
      expect(await fixtures.present('trips', trip)).toBe(false);
    });
  });

  describe('tombstone_purge_objects', () => {
    it('lists a due photo’s original and thumbnail and a due document, each in its own bucket — and only those', async () => {
      const t = await fixtures.traveller();
      const bare = await fixtures.photo(t.tripId, AGES.old);
      const filed = await fixtures.photo(t.tripId, AGES.justDue, true);
      const document = await fixtures.document(t.tripId, AGES.old);
      await fixtures.photo(t.tripId, AGES.young);
      await fixtures.photo(t.tripId, null);
      await fixtures.document(t.tripId, AGES.justShort);
      await fixtures.document(t.tripId, null);

      const objects = await listed();

      // The thumbnail is derived, not read from `thumb_key`: the media worker
      // writes the object before it records the key, so a photo deleted in
      // between has the object and no key.
      expect(objects).toEqual(
        [
          `photos/${bare.key}`,
          `photos/${bare.key}.thumb.jpg`,
          `photos/${filed.key}`,
          `photos/${filed.key}.thumb.jpg`,
          `documents/${document.key}`,
        ].sort(),
      );
    });

    it('only lists: every row is still stored afterwards', async () => {
      const t = await fixtures.traveller();
      const photo = await fixtures.photo(t.tripId, AGES.old);
      const document = await fixtures.document(t.tripId, AGES.old);

      await listed();

      expect(await fixtures.present('photos', photo.id)).toBe(true);
      expect(await fixtures.present('documents', document.id)).toBe(true);
    });

    it('lists nothing for a photo or document on a due trip that is not itself due', async () => {
      const t = await fixtures.traveller();
      const trip = await fixtures.trip(t.id, AGES.old);
      const photo = await fixtures.photo(trip, null);
      const document = await fixtures.document(trip, AGES.young);

      expect(await listed()).toEqual([]);
      await purge();
      expect(await fixtures.present('photos', photo.id)).toBe(true);
      expect(await fixtures.present('documents', document.id)).toBe(true);
    });

    it('locks the rows it lists until its transaction ends, so a late edit waits instead of un-deleting one', async () => {
      const t = await fixtures.traveller();
      const due = await fixtures.photo(t.tripId, AGES.old);
      const dueDocument = await fixtures.document(t.tripId, AGES.old);
      const young = await fixtures.photo(t.tripId, AGES.young);

      const during = await harness.api.begin(async (tx) => {
        await tx`SELECT bucket, object_key FROM tombstone_purge_objects(${TOMBSTONE_RETENTION_DAYS}::integer)`;

        return {
          photo: await lockState(harness.owner, 'photos', due.id),
          document: await lockState(harness.owner, 'documents', dueDocument.id),
          young: await lockState(harness.owner, 'photos', young.id),
        };
      });
      const after = await lockState(harness.owner, 'photos', due.id);

      expect(during).toEqual({ photo: 'locked', document: 'locked', young: 'free' });
      expect(after).toBe('free');
    });
  });

  describe('purgeTombstones over the real engine', () => {
    /** The processor's `sql`, writing down which keyhole each statement of its transaction calls. */
    function observing(sql: Sql, events: string[]): Sql {
      const recording = (tx: TransactionSql) =>
        ((strings: TemplateStringsArray, ...values: never[]) => {
          events.push(
            strings.join('?').includes('tombstone_purge_objects') ? 'list' : 'rows',
          );
          return tx(strings, ...values);
        }) as unknown as TransactionSql;

      return {
        begin: (fn: (tx: TransactionSql) => Promise<unknown>) =>
          sql.begin((tx) => fn(recording(tx))),
      } as unknown as Sql;
    }

    interface Store {
      readonly storage: PurgeStorage;
      readonly removed: string[];
    }

    function recordingStore(
      events: string[],
      options: { refuse?: string; whileRemoving?: () => Promise<void> } = {},
    ): Store {
      const removed: string[] = [];
      const storage: PurgeStorage = {
        removeObject: async (bucket, key) => {
          events.push(`remove ${bucket}`);
          removed.push(`${bucket}/${key}`);
          await options.whileRemoving?.();
          if (key === options.refuse) throw new Error('the store refused the delete');
        },
      };

      return { storage, removed };
    }

    it('removes the objects before it deletes the rows, and reports what it did', async () => {
      const t = await fixtures.traveller();
      const photo = await fixtures.photo(t.tripId, AGES.old);
      const document = await fixtures.document(t.tripId, AGES.old);
      const note = await fixtures.note(t.tripId, AGES.old);
      const young = await fixtures.photo(t.tripId, AGES.young);
      const events: string[] = [];
      const { storage, removed } = recordingStore(events);

      const result = await purgeTombstones({
        sql: observing(harness.api, events),
        storage,
      });

      expect(events[0]).toBe('list');
      expect(events.at(-1)).toBe('rows');
      expect(events.slice(1, -1).sort()).toEqual([
        'remove documents',
        'remove photos',
        'remove photos',
      ]);
      expect(removed.sort()).toEqual(
        [
          `photos/${photo.key}`,
          `photos/${photo.key}.thumb.jpg`,
          `documents/${document.key}`,
        ].sort(),
      );
      expect(result).toMatchObject({
        retentionDays: 90,
        objectsRemoved: 3,
        purged: { photos: 1, documents: 1, notes: 1, trips: 0 },
      });
      expect(await fixtures.present('photos', photo.id)).toBe(false);
      expect(await fixtures.present('documents', document.id)).toBe(false);
      expect(await fixtures.present('notes', note)).toBe(false);
      expect(await fixtures.present('photos', young.id)).toBe(true);
    });

    it('holds the rows locked while it removes their objects', async () => {
      const t = await fixtures.traveller();
      const photo = await fixtures.photo(t.tripId, AGES.old);
      const seen: string[] = [];
      const { storage } = recordingStore([], {
        whileRemoving: async () => {
          seen.push(await lockState(harness.owner, 'photos', photo.id));
        },
      });

      await purgeTombstones({ sql: harness.api, storage });

      expect(seen).toEqual(['locked', 'locked']);
    });

    it('rolls everything back when the store refuses a delete, and a retry then completes the job', async () => {
      const t = await fixtures.traveller();
      const photo = await fixtures.photo(t.tripId, AGES.old);
      const document = await fixtures.document(t.tripId, AGES.old);
      const note = await fixtures.note(t.tripId, AGES.old);
      const trip = await fixtures.trip(t.id, AGES.old);
      const refusing = recordingStore([], { refuse: `${photo.key}.thumb.jpg` });

      await expect(
        purgeTombstones({ sql: harness.api, storage: refusing.storage }),
      ).rejects.toThrow('the store refused the delete');

      // Not one row went: each key is still where its object can be found by it.
      expect(await fixtures.present('photos', photo.id)).toBe(true);
      expect(await fixtures.present('documents', document.id)).toBe(true);
      expect(await fixtures.present('notes', note)).toBe(true);
      expect(await fixtures.present('trips', trip)).toBe(true);
      expect(await lockState(harness.owner, 'photos', photo.id)).toBe('free');

      const retry = recordingStore([]);
      const result = await purgeTombstones({ sql: harness.api, storage: retry.storage });

      expect(result.objectsRemoved).toBe(3);
      expect(result.purged).toMatchObject({
        photos: 1,
        documents: 1,
        notes: 1,
        trips: 1,
      });
      expect(await fixtures.present('photos', photo.id)).toBe(false);
      expect(await fixtures.present('documents', document.id)).toBe(false);
      expect(await fixtures.present('trips', trip)).toBe(false);
    });

    it('does nothing at all — no store call, no row — when nothing is due', async () => {
      const t = await fixtures.traveller();
      const photo = await fixtures.photo(t.tripId, AGES.young);
      const note = await fixtures.note(t.tripId, null);
      const { storage, removed } = recordingStore([]);

      const result = await purgeTombstones({ sql: harness.api, storage });

      expect(removed).toEqual([]);
      expect(result.objectsRemoved).toBe(0);
      expect(Object.values(result.purged).every((n) => n === 0)).toBe(true);
      expect(await fixtures.present('photos', photo.id)).toBe(true);
      expect(await fixtures.present('notes', note)).toBe(true);
    });

    it('with the real object store: removes the originals, thumbnails and documents of due rows only, and treats an object already gone as done', async () => {
      const storage = new StorageService();
      const t = await fixtures.traveller();
      const due = await fixtures.photo(t.tripId, AGES.old);
      const neverThumbnailed = await fixtures.photo(t.tripId, AGES.old);
      const document = await fixtures.document(t.tripId, AGES.old);
      const young = await fixtures.photo(t.tripId, AGES.young);
      const bytes = Buffer.from('not really an image');
      const put = (bucket: 'photos' | 'documents', key: string) =>
        storage.putObject(bucket, key, bytes, 'image/jpeg');
      await Promise.all([
        put('photos', due.key),
        put('photos', `${due.key}.thumb.jpg`),
        put('photos', neverThumbnailed.key),
        put('documents', document.key),
        put('photos', young.key),
        put('photos', `${young.key}.thumb.jpg`),
      ]);

      const result = await purgeTombstones({ sql: harness.api, storage });

      expect(result.objectsRemoved).toBe(5);
      await expectGone(storage, 'photos', [
        due.key,
        `${due.key}.thumb.jpg`,
        neverThumbnailed.key,
        `${neverThumbnailed.key}.thumb.jpg`,
      ]);
      await expectGone(storage, 'documents', [document.key]);
      expect(await storage.objectSize('photos', young.key)).toBe(bytes.length);
      expect(await storage.objectSize('photos', `${young.key}.thumb.jpg`)).toBe(
        bytes.length,
      );
      expect(await fixtures.present('photos', due.id)).toBe(false);
      expect(await fixtures.present('photos', young.id)).toBe(true);
    });
  });
});

async function expectGone(
  storage: StorageService,
  bucket: 'photos' | 'documents',
  keys: readonly string[],
): Promise<void> {
  for (const key of keys) {
    expect(await storage.objectSize(bucket, key)).toBeNull();
  }
}

/**
 * Whether a second session could take the row lock an UPDATE needs, right now.
 * `NOWAIT` turns a wait into an immediate refusal (SQLSTATE 55P03), which is
 * the only way to ask "is this row held?" without hanging the test.
 */
async function lockState(
  owner: Sql,
  table: 'photos' | 'documents',
  id: string,
): Promise<'free' | 'locked'> {
  try {
    await owner.unsafe(
      `SELECT id FROM ${table} WHERE id = $1::uuid FOR NO KEY UPDATE NOWAIT`,
      [id],
    );

    return 'free';
  } catch (error: unknown) {
    if ((error as { code?: string }).code === '55P03') return 'locked';
    throw error;
  }
}
