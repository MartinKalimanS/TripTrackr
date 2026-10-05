import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  DocumentPullRecord,
  ExpenseCategoryPullRecord,
  ExpensePullRecord,
  NotePullRecord,
  PhotoPullRecord,
  TripPullRecord,
  TripStopPullRecord,
  type SyncTable,
} from '@triptrackr/contracts';
import type { z } from 'zod';

import * as conflict from '@/modules/sync/push-conflict';

import { bootTestApp, registerTraveller, type RegisteredTraveller } from '../support/app';
import { uploadDocument } from '../support/documents';
import { createTripFor } from '../support/expenses';
import { createHarness, type Harness } from '../integration/harness';
import {
  categoryRecord,
  documentRecord,
  expenseRecord,
  insertPhotoRow,
  minutesAgo,
  noteRecord,
  photoRecord,
  pushOne,
  requireRow,
  stopRecord,
  tripRecord,
  updatedAtOf,
  type Wire,
} from '../support/sync-push-fixtures';

/**
 * Contract test — the push conflict rule applies last-write-wins and returns
 * `conflict` carrying `server_version` (tasks.md T123; FR-040; research D-02;
 * sync-protocol.md §2).
 *
 * The rule is written once, in `resolveConflict` (src/modules/sync/
 * push-conflict.ts), and pinned case by case in its unit suite. This suite
 * proves the other half of "exactly one place": that every one of the seven
 * tables' paths reaches it — and that what it decides is enforced end to end,
 * with `server_version` in that table's PULL shape (the contract a device
 * overwrites its row from).
 *
 * The tombstone cases carry scenario 12 of the acceptance suite — "delete a
 * record on one device while editing it on another: deterministic, no
 * resurrection" — including the ordering that plain last-write-wins gets wrong.
 */

interface Ctx {
  readonly app: NestExpressApplication;
  readonly harness: Harness;
  readonly traveller: RegisteredTraveller;
  readonly tripId: string;
}

interface TableCase {
  readonly table: SyncTable;
  /** The table's pull shape, which `server_version` must satisfy. */
  readonly pull: z.ZodType;
  /** Makes the row exist — as a device would have left it — and returns its pushed shape. */
  readonly seed: (ctx: Ctx) => Wire | Promise<Wire>;
  /** The column the suite edits (wire and table agree on its name) and the values it takes. */
  readonly column: string;
  readonly values: readonly [string | number | boolean, ...(string | number | boolean)[]];
}

const cases: readonly TableCase[] = [
  {
    table: 'trips',
    pull: TripPullRecord,
    seed: () => tripRecord({ title: 'Original' }),
    column: 'title',
    values: ['Edited on the phone', 'Edited on the tablet', 'Edited on the laptop'],
  },
  {
    table: 'trip_stops',
    pull: TripStopPullRecord,
    seed: (c) => stopRecord(c.tripId, { sort_order: 0 }),
    column: 'sort_order',
    values: [3, 4, 5],
  },
  {
    table: 'expense_categories',
    pull: ExpenseCategoryPullRecord,
    seed: () => categoryRecord(),
    column: 'name',
    values: ['Tea', 'Snacks', 'Gifts'],
  },
  {
    table: 'notes',
    pull: NotePullRecord,
    seed: (c) => noteRecord(c.tripId, { body: 'Original' }),
    column: 'body',
    values: ['first edit', 'second edit', 'third edit'],
  },
  {
    table: 'expenses',
    pull: ExpensePullRecord,
    seed: (c) => expenseRecord(c.tripId, { amount: '10.00' }),
    column: 'amount',
    values: ['20.00', '30.00', '40.00'],
  },
  {
    table: 'photos',
    pull: PhotoPullRecord,
    seed: async (c) => {
      const id = await insertPhotoRow(c.harness.owner, c.tripId);
      return photoRecord(c.tripId, id, { is_public: false });
    },
    column: 'is_public',
    values: [true, false, true],
  },
  {
    table: 'documents',
    pull: DocumentPullRecord,
    seed: async (c) => {
      const document = await uploadDocument(c.app, c.traveller, c.tripId, {
        type: 'other',
        parsed_json: null,
      });
      // Registration stamped it "now"; a device's earlier state is older.
      await c.harness.owner`
        UPDATE documents SET updated_at = ${minutesAgo(90)}::timestamptz
        WHERE id = ${document.id}::uuid
      `;
      return documentRecord(c.tripId, document.id, { type: 'other' });
    },
    column: 'type',
    values: ['booking', 'other', 'booking'],
  },
];

describe('contract — the push conflict rule (last-write-wins, in one place)', () => {
  let app: NestExpressApplication;
  let harness: Harness;
  let a: RegisteredTraveller;
  let tripId: string;

  beforeAll(async () => {
    app = await bootTestApp();
    harness = await createHarness();
    a = await registerTraveller(app);
    tripId = await createTripFor(app, a, 'CHF', 'Conflict fixture');
  });

  afterAll(async () => {
    await harness?.close();
    await app?.close();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const push = (table: SyncTable, record: Wire) => pushOne(app, a, table, record);
  const stored = (table: SyncTable, id: string) => requireRow(harness.owner, table, id);

  describe.each(cases)('$table', (tableCase) => {
    const { table, column } = tableCase;
    const [first, second, third] = tableCase.values;
    let record: Wire;
    let id: string;

    const edit = (value: unknown, minutes: number): Wire => ({
      ...record,
      [column]: value,
      updated_at: minutesAgo(minutes),
    });

    beforeAll(async () => {
      const seeded = await tableCase.seed({ app, harness, traveller: a, tripId });
      id = seeded.id as string;
      // The row as a first device left it: an hour old.
      record = { ...seeded, updated_at: minutesAgo(60) };

      await expect(push(table, record)).resolves.toEqual({ id, status: 'applied' });
    });

    it('applies an incoming record that is newer, and stores its timestamp', async () => {
      const newer = edit(first, 30);

      await expect(push(table, newer)).resolves.toEqual({ id, status: 'applied' });

      const row = await stored(table, id);
      expect(row[column]).toBe(first);
      expect(updatedAtOf(row)).toBe(newer.updated_at);
    });

    it('answers an older record with conflict carrying the stored row in its pull shape', async () => {
      const before = await stored(table, id);

      const result = await push(table, edit(second, 45));

      expect(result).toMatchObject({ id, status: 'conflict' });
      const serverVersion = (result as { server_version: Record<string, unknown> })
        .server_version;
      expect(tableCase.pull.safeParse(serverVersion).success).toBe(true);
      expect(serverVersion.id).toBe(id);
      expect(serverVersion[column]).toBe(first);
      // Pull may carry more precision than a millisecond; the instant is what must agree.
      expect(new Date(serverVersion.updated_at as string).getTime()).toBe(
        (before.updated_at as Date).getTime(),
      );
      expect(serverVersion.deleted_at).toBeNull();

      // Nothing was written for the loser.
      expect(await stored(table, id)).toEqual(before);
    });

    it('answers an equal timestamp with a different payload as a conflict: the stored row wins', async () => {
      const before = await stored(table, id);
      const tied = { ...record, [column]: second, updated_at: updatedAtOf(before) };

      await expect(push(table, tied)).resolves.toMatchObject({ id, status: 'conflict' });

      expect(await stored(table, id)).toEqual(before);
    });

    it('answers an equal timestamp with an identical payload as applied, touching nothing', async () => {
      const before = await stored(table, id);
      const retried = { ...record, [column]: first, updated_at: updatedAtOf(before) };

      await expect(push(table, retried)).resolves.toEqual({ id, status: 'applied' });

      expect(await stored(table, id)).toEqual(before);
    });

    it('decides through the one exported rule, exactly once per record', async () => {
      const spy = jest.spyOn(conflict, 'resolveConflict');

      await push(table, edit(second, 120));
      await push(table, edit(third, 1));

      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  describe('a tombstone is an ordinary change, and it wins (FR-039; scenario 12)', () => {
    const makeNote = async (): Promise<{ id: string; note: Wire }> => {
      const note = noteRecord(tripId, { body: 'Doomed', updated_at: minutesAgo(60) });
      await push('notes', note);

      return { id: note.id as string, note };
    };

    it('sets deleted_at on the stored row', async () => {
      const { id, note } = await makeNote();
      const deletion = { ...note, deleted: true, updated_at: minutesAgo(30) };

      await expect(push('notes', deletion)).resolves.toEqual({ id, status: 'applied' });

      const row = await stored('notes', id);
      expect(row.deleted_at).toBeInstanceOf(Date);
      expect(updatedAtOf(row)).toBe(deletion.updated_at);
    });

    it('refuses an edit after the tombstone, however new, and returns the tombstone', async () => {
      const { id, note } = await makeNote();
      await push('notes', { ...note, deleted: true, updated_at: minutesAgo(30) });
      const before = await stored('notes', id);

      const result = await push('notes', {
        ...note,
        body: 'Resurrect me',
        updated_at: minutesAgo(1),
      });

      expect(result).toMatchObject({ id, status: 'conflict' });
      const serverVersion = (result as { server_version: Record<string, unknown> })
        .server_version;
      expect(NotePullRecord.parse(serverVersion).deleted_at).not.toBeNull();
      expect(serverVersion.body).toBe('Doomed');
      expect(await stored('notes', id)).toEqual(before);
    });

    it('applies a delete that is OLDER than the stored edit: the outcome does not depend on who synced first', async () => {
      // Device A deleted 40 minutes ago; device B edited 10 minutes ago and
      // synced first. A then syncs its older delete.
      const { id, note } = await makeNote();
      await push('notes', { ...note, body: 'Edited later', updated_at: minutesAgo(10) });
      const editedAt = new Date(updatedAtOf(await stored('notes', id))).getTime();

      await expect(
        push('notes', { ...note, deleted: true, updated_at: minutesAgo(40) }),
      ).resolves.toEqual({ id, status: 'applied' });

      const row = await stored('notes', id);
      expect(row.deleted_at).toBeInstanceOf(Date);
      // Stored past the version other devices already hold, so their next
      // pull cannot sort it before their cursor and miss it.
      expect(new Date(updatedAtOf(row)).getTime()).toBeGreaterThan(editedAt);
    });

    it('reaches the same end state in both orders', async () => {
      const edit = { body: 'Typed on B', updated_at: minutesAgo(10) };
      const deletion = { deleted: true, updated_at: minutesAgo(40) };

      const deleteFirst = await makeNote();
      await push('notes', { ...deleteFirst.note, ...deletion });
      const editAfter = await push('notes', { ...deleteFirst.note, ...edit });

      const editFirst = await makeNote();
      await push('notes', { ...editFirst.note, ...edit });
      const deleteAfter = await push('notes', { ...editFirst.note, ...deletion });

      expect(editAfter).toMatchObject({ status: 'conflict' });
      expect(deleteAfter).toMatchObject({ status: 'applied' });
      expect((await stored('notes', deleteFirst.id)).deleted_at).not.toBeNull();
      expect((await stored('notes', editFirst.id)).deleted_at).not.toBeNull();
    });

    it('answers a repeated delete as applied and leaves the tombstone as it was', async () => {
      const { id, note } = await makeNote();
      await push('notes', { ...note, deleted: true, updated_at: minutesAgo(30) });
      const before = await stored('notes', id);

      await expect(
        push('notes', { ...note, deleted: true, updated_at: minutesAgo(5) }),
      ).resolves.toEqual({ id, status: 'applied' });

      expect(await stored('notes', id)).toEqual(before);
    });

    it('takes a trip’s children with it when the trip is deleted, as the REST delete does', async () => {
      const trip = tripRecord({ updated_at: minutesAgo(60) });
      const tripPk = trip.id as string;
      await push('trips', trip);
      const stop = stopRecord(tripPk);
      const note = noteRecord(tripPk);
      const expense = expenseRecord(tripPk);
      await push('trip_stops', stop);
      await push('notes', note);
      await push('expenses', expense);

      await push('trips', { ...trip, deleted: true, updated_at: minutesAgo(5) });

      for (const [table, child] of [
        ['trip_stops', stop],
        ['notes', note],
        ['expenses', expense],
      ] as const) {
        const row = await stored(table, child.id as string);
        expect(row.deleted_at).toBeInstanceOf(Date);
      }
    });
  });
});
