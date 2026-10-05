import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  SYNC_TABLES,
  SYSTEM_EXPENSE_CATEGORIES,
  type PushResult,
  type SyncTable,
} from '@triptrackr/contracts';
import request from 'supertest';

import {
  bearer,
  bootTestApp,
  registerTraveller,
  type RegisteredTraveller,
} from '../support/app';
import { uploadDocument } from '../support/documents';
import { createTripFor } from '../support/expenses';
import { createHarness, type Harness } from '../integration/harness';
import {
  categoryRecord,
  documentRecord,
  expenseRecord,
  insertPhotoRow,
  noteRecord,
  photoRecord,
  push,
  pushOne,
  rowOf,
  stopRecord,
  tripRecord,
  type Wire,
} from '../support/sync-push-fixtures';

/**
 * Contract test — tables pushed in `SYNC_TABLES` order apply a trip, its stop
 * and an expense against it in one cycle; a child whose parent has not been
 * applied is `rejected` with `parent_missing` and stays dirty; an `id` owned by
 * another traveller is `rejected` with `id_unavailable` and discloses nothing
 * (tasks.md T199; sync-protocol.md §2; research D-15, D-16).
 *
 * The first block is acceptance row 13 at the API: a trip, a stop and an
 * expense created in aeroplane mode, all arriving on one reconnect, the expense
 * referencing the right trip without any remapping — the row's identity was
 * fixed on the device, so nothing needs to be told what the server called it.
 *
 * The last two blocks are the disclosure half. `parent_missing` is one answer
 * for a parent that does not exist and one that exists under someone else, and
 * `id_unavailable` is one answer for an id someone else holds; neither carries a
 * field of the other traveller's row, and a refusal applies nothing.
 */
describe('contract — parents before children, and ids that are not yours', () => {
  let app: NestExpressApplication;
  let harness: Harness;
  let a: RegisteredTraveller;
  let b: RegisteredTraveller;

  beforeAll(async () => {
    app = await bootTestApp();
    harness = await createHarness();
    a = await registerTraveller(app);
    b = await registerTraveller(app);
  });

  afterAll(async () => {
    await harness?.close();
    await app?.close();
  });

  const exists = async (table: SyncTable, id: unknown): Promise<boolean> =>
    (await rowOf(harness.owner, table, id as string)) !== undefined;
  const ghost = '00000000-0000-4000-8000-00000000dead';

  describe('one cycle, in dependency order (acceptance row 13)', () => {
    it('applies a trip, its stop, a custom category, a note and an expense against it', async () => {
      const trip = tripRecord({ title: 'Created on the plane' });
      const tripId = trip.id as string;
      const stop = stopRecord(tripId);
      const category = categoryRecord();
      const note = noteRecord(tripId);
      const expense = expenseRecord(tripId, { category_id: category.id });
      const byTable: Record<string, Wire[]> = {
        trips: [trip],
        trip_stops: [stop],
        expense_categories: [category],
        notes: [note],
        expenses: [expense],
      };

      const results: Record<string, PushResult[]> = {};
      for (const table of SYNC_TABLES) {
        const records = byTable[table];
        if (records) results[table] = await push(app, a, table, records);
      }

      for (const [table, tableResults] of Object.entries(results)) {
        expect(tableResults).toEqual(
          byTable[table]?.map((record) => ({ id: record.id, status: 'applied' })),
        );
      }
      // The expense references the trip and the category the device named.
      const stored = await rowOf(harness.owner, 'expenses', expense.id as string);
      expect(stored).toMatchObject({ trip_id: tripId, category_id: category.id });
    });

    it('shows the pushed trip, with its stop, to the owner through the REST API', async () => {
      const trip = tripRecord();
      await push(app, a, 'trips', [trip]);
      await push(app, a, 'trip_stops', [stopRecord(trip.id as string)]);

      const response = await request(app.getHttpServer())
        .get(`/v1/trips/${trip.id as string}`)
        .set(bearer(a.tokens.access_token));

      expect(response.status).toBe(200);
      expect(response.body.trip.stops).toHaveLength(1);
    });

    it('takes the system categories without being sent them', async () => {
      const tripId = await createTripFor(app, a);

      const result = await pushOne(
        app,
        a,
        'expenses',
        expenseRecord(tripId, { category_id: SYSTEM_EXPENSE_CATEGORIES[2].id }),
      );

      expect(result).toMatchObject({ status: 'applied' });
    });
  });

  describe('a child whose parent has not been applied', () => {
    it('is rejected parent_missing, applies nothing, and is applied once the parent arrives', async () => {
      const trip = tripRecord();
      const tripId = trip.id as string;
      const stop = stopRecord(tripId);
      const note = noteRecord(tripId);
      const expense = expenseRecord(tripId);

      // The trip's push "failed": its children arrive first.
      const early = {
        stops: await push(app, a, 'trip_stops', [stop]),
        notes: await push(app, a, 'notes', [note]),
        expenses: await push(app, a, 'expenses', [expense]),
      };

      for (const [rejected, record] of [
        [early.stops, stop],
        [early.notes, note],
        [early.expenses, expense],
      ] as const) {
        expect(rejected).toEqual([
          { id: record.id, status: 'rejected', reason: 'parent_missing' },
        ]);
      }
      expect(await exists('trip_stops', stop.id)).toBe(false);
      expect(await exists('notes', note.id)).toBe(false);
      expect(await exists('expenses', expense.id)).toBe(false);

      // The next cycle: the parent, then the children that stayed dirty.
      await push(app, a, 'trips', [trip]);
      expect(await push(app, a, 'trip_stops', [stop])).toEqual([
        { id: stop.id, status: 'applied' },
      ]);
      expect(await push(app, a, 'notes', [note])).toEqual([
        { id: note.id, status: 'applied' },
      ]);
      expect(await push(app, a, 'expenses', [expense])).toEqual([
        { id: expense.id, status: 'applied' },
      ]);
    });

    it('rejects only the orphan of a mixed batch and applies the rest', async () => {
      const tripId = await createTripFor(app, a);
      const good = noteRecord(tripId);
      const orphan = noteRecord(ghost);
      const alsoGood = noteRecord(tripId);

      const results = await push(app, a, 'notes', [good, orphan, alsoGood]);

      expect(results).toEqual([
        { id: good.id, status: 'applied' },
        { id: orphan.id, status: 'rejected', reason: 'parent_missing' },
        { id: alsoGood.id, status: 'applied' },
      ]);
      expect(await exists('notes', good.id)).toBe(true);
      expect(await exists('notes', orphan.id)).toBe(false);
      expect(await exists('notes', alsoGood.id)).toBe(true);
    });

    it('rejects an expense whose category does not exist', async () => {
      const tripId = await createTripFor(app, a);

      const result = await pushOne(
        app,
        a,
        'expenses',
        expenseRecord(tripId, { category_id: ghost }),
      );

      expect(result).toMatchObject({ status: 'rejected', reason: 'parent_missing' });
    });

    it('rejects a note pushed against a trip that has been deleted', async () => {
      const trip = tripRecord();
      await push(app, a, 'trips', [trip]);
      await pushOne(app, a, 'trips', { ...trip, deleted: true });

      const result = await pushOne(app, a, 'notes', noteRecord(trip.id as string));

      expect(result).toMatchObject({ status: 'rejected', reason: 'parent_missing' });
    });

    it('never creates a photo or a document: an unknown id is parent_missing until its upload registers it', async () => {
      const tripId = await createTripFor(app, a);
      const photoId = '11111111-1111-4111-8111-00000000aaaa';
      const documentId = '11111111-1111-4111-8111-00000000bbbb';

      const photo = await pushOne(app, a, 'photos', photoRecord(tripId, photoId));
      const document = await pushOne(
        app,
        a,
        'documents',
        documentRecord(tripId, documentId),
      );

      expect(photo).toEqual({
        id: photoId,
        status: 'rejected',
        reason: 'parent_missing',
      });
      expect(document).toEqual({
        id: documentId,
        status: 'rejected',
        reason: 'parent_missing',
      });
      expect(await exists('photos', photoId)).toBe(false);
      expect(await exists('documents', documentId)).toBe(false);
    });
  });

  describe('a parent or an id that belongs to another traveller', () => {
    it('answers a note against B’s trip exactly as it answers one against no trip', async () => {
      const theirs = await createTripFor(app, b, 'EUR', 'B’s private trip');

      const againstTheirs = await pushOne(app, a, 'notes', noteRecord(theirs));
      const againstNothing = await pushOne(app, a, 'notes', noteRecord(ghost));

      expect(againstTheirs).toMatchObject({
        status: 'rejected',
        reason: 'parent_missing',
      });
      expect({ ...againstTheirs, id: undefined }).toEqual({
        ...againstNothing,
        id: undefined,
      });
    });

    it('answers an expense filed under B’s custom category exactly as under none', async () => {
      const bCategory = categoryRecord();
      await push(app, b, 'expense_categories', [bCategory]);
      const tripId = await createTripFor(app, a);

      const underTheirs = await pushOne(
        app,
        a,
        'expenses',
        expenseRecord(tripId, { category_id: bCategory.id }),
      );
      const underNone = await pushOne(
        app,
        a,
        'expenses',
        expenseRecord(tripId, { category_id: ghost }),
      );

      expect(underTheirs).toMatchObject({ status: 'rejected', reason: 'parent_missing' });
      expect({ ...underTheirs, id: undefined }).toEqual({ ...underNone, id: undefined });
    });

    it.each([
      ['trips', (b: Wire) => tripRecord({ id: b.id })],
      ['expense_categories', (b: Wire) => categoryRecord({ id: b.id })],
    ] as const)(
      'refuses a %s id that B already holds with id_unavailable and nothing else',
      async (table, mine) => {
        const theirs = table === 'trips' ? tripRecord() : categoryRecord();
        await push(app, b, table, [theirs]);

        const result = await pushOne(app, a, table, mine(theirs));

        // The whole answer: no field of B's row, no hint of whose it is.
        expect(result).toEqual({
          id: theirs.id,
          status: 'rejected',
          reason: 'id_unavailable',
        });
      },
    );

    it.each([
      ['trip_stops', (tripId: string) => stopRecord(tripId)],
      ['notes', (tripId: string) => noteRecord(tripId)],
      ['expenses', (tripId: string) => expenseRecord(tripId)],
    ] as const)(
      'refuses a %s id that B already holds with id_unavailable, leaving B’s row as it was',
      async (table, make) => {
        const bTrip = await createTripFor(app, b, 'EUR');
        const theirs = make(bTrip);
        await push(app, b, table, [theirs]);
        const before = await rowOf(harness.owner, table, theirs.id as string);
        const aTrip = await createTripFor(app, a);

        const result = await pushOne(app, a, table, { ...make(aTrip), id: theirs.id });

        expect(result).toEqual({
          id: theirs.id,
          status: 'rejected',
          reason: 'id_unavailable',
        });
        expect(await rowOf(harness.owner, table, theirs.id as string)).toEqual(before);
      },
    );

    it('refuses a system category id as a custom category', async () => {
      const result = await pushOne(
        app,
        a,
        'expense_categories',
        categoryRecord({ id: SYSTEM_EXPENSE_CATEGORIES[0].id, name: 'Hijacked' }),
      );

      expect(result).toEqual({
        id: SYSTEM_EXPENSE_CATEGORIES[0].id,
        status: 'rejected',
        reason: 'id_unavailable',
      });
    });

    it('answers a photo or document id that B holds exactly as an id that nobody holds', async () => {
      const bTrip = await createTripFor(app, b, 'EUR');
      const photoId = await insertPhotoRow(harness.owner, bTrip);
      const document = await uploadDocument(app, b, bTrip);
      const aTrip = await createTripFor(app, a);

      const theirPhoto = await pushOne(app, a, 'photos', photoRecord(aTrip, photoId));
      const theirDocument = await pushOne(
        app,
        a,
        'documents',
        documentRecord(aTrip, document.id),
      );

      expect(theirPhoto).toEqual({
        id: photoId,
        status: 'rejected',
        reason: 'parent_missing',
      });
      expect(theirDocument).toEqual({
        id: document.id,
        status: 'rejected',
        reason: 'parent_missing',
      });
    });

    it('rejects only the colliding record of a batch', async () => {
      const theirs = tripRecord();
      await push(app, b, 'trips', [theirs]);
      const mine = tripRecord();

      const results = await push(app, a, 'trips', [
        mine,
        tripRecord({ id: theirs.id }),
        tripRecord(),
      ]);

      expect(results.map((result) => result.status)).toEqual([
        'applied',
        'rejected',
        'applied',
      ]);
    });
  });
});
