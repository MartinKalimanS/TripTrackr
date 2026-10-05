import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PushResult, SyncTable } from '@triptrackr/contracts';

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
  push,
  pushOne,
  pushRaw,
  requireRow,
  stopRecord,
  tripRecord,
  type Wire,
} from '../support/sync-push-fixtures';

/**
 * Contract test — a push retried with the same client-generated `id` is an
 * idempotent upsert of the same key, returns the same result, and creates no
 * duplicate (tasks.md T124; sync-protocol.md §2 "Idempotent by id"; research
 * D-15).
 *
 * The case is the spec's "connectivity returns for two seconds and drops again
 * mid-synchronisation": the request reached the server and was applied, the
 * response did not reach the device, and the device — which cannot tell that
 * from a request that never arrived — sends the same body again. Because the
 * row's identity was fixed on the device, the retry addresses the same key; the
 * answer must be the one the lost response carried, and the row must be exactly
 * as the first request left it: `updated_at` not re-touched, nothing duplicated.
 */
describe('contract — a retried push is the same push', () => {
  let app: NestExpressApplication;
  let harness: Harness;
  let a: RegisteredTraveller;
  let tripId: string;

  beforeAll(async () => {
    app = await bootTestApp();
    harness = await createHarness();
    a = await registerTraveller(app);
    tripId = await createTripFor(app, a, 'CHF', 'Idempotency fixture');
  });

  afterAll(async () => {
    await harness?.close();
    await app?.close();
  });

  const pushAll = (table: SyncTable, records: readonly Wire[]) =>
    push(app, a, table, records);
  const stored = (table: SyncTable, id: string) => requireRow(harness.owner, table, id);
  const countOf = async (table: SyncTable, id: string): Promise<number> => {
    const rows = await harness.owner.unsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM ${table} WHERE id = $1::uuid`,
      [id],
    );

    return rows[0]?.n ?? 0;
  };

  describe.each([
    ['trips', () => tripRecord()],
    ['trip_stops', () => stopRecord(tripId)],
    ['expense_categories', () => categoryRecord()],
    ['notes', () => noteRecord(tripId)],
    ['expenses', () => expenseRecord(tripId)],
  ] as const)('%s', (table, make) => {
    it('answers the retry exactly as it answered the first request, with one row untouched', async () => {
      const record = make();
      const id = record.id as string;

      const first = await pushAll(table, [record]);
      const afterFirst = await stored(table, id);
      const second = await pushAll(table, [record]);
      const third = await pushAll(table, [record]);

      expect(first).toEqual([{ id, status: 'applied' }]);
      expect(second).toEqual(first);
      expect(third).toEqual(first);
      expect(await countOf(table, id)).toBe(1);
      // Every column, created_at and updated_at included, is byte-identical.
      expect(await stored(table, id)).toEqual(afterFirst);
    });

    it('applies the records of a replayed batch that the first attempt never reached', async () => {
      // Two records; the connection dropped after the first was applied.
      const reached = make();
      const missed = make();

      await pushAll(table, [reached]);
      const replay = await pushAll(table, [reached, missed]);

      expect(replay).toEqual([
        { id: reached.id, status: 'applied' },
        { id: missed.id, status: 'applied' },
      ]);
      expect(await countOf(table, missed.id as string)).toBe(1);
    });

    it('answers a replayed tombstone as applied, leaving the first tombstone alone', async () => {
      const record = make();
      const id = record.id as string;
      const deletion = { ...record, deleted: true, updated_at: minutesAgo(10) };

      await pushAll(table, [record]);
      const first = await pushAll(table, [deletion]);
      const afterFirst = await stored(table, id);
      const second = await pushAll(table, [deletion]);

      expect(second).toEqual(first);
      expect(await stored(table, id)).toEqual(afterFirst);
    });
  });

  describe.each(['photos', 'documents'] as const)('%s (existing rows only)', (table) => {
    it('answers the retry exactly as it answered the first request', async () => {
      let record: Wire;
      if (table === 'photos') {
        const id = await insertPhotoRow(harness.owner, tripId);
        record = photoRecord(tripId, id, { is_public: true });
      } else {
        const document = await uploadDocument(app, a, tripId, { type: 'other' });
        await harness.owner`
          UPDATE documents SET updated_at = ${minutesAgo(90)}::timestamptz
          WHERE id = ${document.id}::uuid
        `;
        record = documentRecord(tripId, document.id, { type: 'booking' });
      }
      const id = record.id as string;

      const first = await pushAll(table, [record]);
      const afterFirst = await stored(table, id);
      const second = await pushAll(table, [record]);

      expect(first).toEqual([{ id, status: 'applied' }]);
      expect(second).toEqual(first);
      expect(await stored(table, id)).toEqual(afterFirst);
    });
  });

  it('gives the retry of an over-allowance trip the same warning as the first request', async () => {
    // A traveller of their own: the allowance counts an account's live trips.
    const heavy = await registerTraveller(app);
    await push(
      app,
      heavy,
      'trips',
      Array.from({ length: 5 }, () => tripRecord()),
    );
    const sixth = tripRecord();

    const first = await push(app, heavy, 'trips', [sixth]);
    const retry = await push(app, heavy, 'trips', [sixth]);

    expect(first).toEqual([
      { id: sixth.id, status: 'applied', warnings: ['over_allowance'] },
    ]);
    expect(retry).toEqual(first);
  });

  describe('the same id twice in one batch', () => {
    it('applies them in input order through the same rule: an identical pair is one row, twice applied', async () => {
      const note = noteRecord(tripId);

      const results = await pushAll('notes', [note, note]);

      expect(results).toEqual([
        { id: note.id, status: 'applied' },
        { id: note.id, status: 'applied' },
      ]);
      expect(await countOf('notes', note.id as string)).toBe(1);
    });

    it('lets the later timestamp win whatever the order, and answers the loser with conflict', async () => {
      const v1 = noteRecord(tripId, { body: 'v1', updated_at: minutesAgo(20) });
      const v2 = { ...v1, body: 'v2', updated_at: minutesAgo(10) };

      const newestFirst = await pushAll('notes', [v2, v1]);

      expect(newestFirst[0]).toEqual({ id: v1.id, status: 'applied' });
      expect(newestFirst[1]).toMatchObject({ id: v1.id, status: 'conflict' });
      expect((await stored('notes', v1.id as string)).body).toBe('v2');

      const oldestFirst = noteRecord(tripId, { body: 'v1', updated_at: minutesAgo(20) });
      const results = await pushAll('notes', [
        oldestFirst,
        { ...oldestFirst, body: 'v2', updated_at: minutesAgo(10) },
      ]);

      expect(results.map((r: PushResult) => r.status)).toEqual(['applied', 'applied']);
      expect((await stored('notes', oldestFirst.id as string)).body).toBe('v2');
    });
  });

  it('creates one row when the same request arrives several times at once', async () => {
    const note = noteRecord(tripId, { body: 'Raced' });

    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        pushRaw(app, a, { table: 'notes', records: [note] }),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual(Array(6).fill(200));
    for (const response of responses) {
      expect(response.body).toEqual({ results: [{ id: note.id, status: 'applied' }] });
    }
    expect(await countOf('notes', note.id as string)).toBe(1);
  });

  it('keeps an edit applied when its response is lost and an older sibling is retried after it', async () => {
    const note = noteRecord(tripId, { body: 'v1', updated_at: minutesAgo(30) });
    await pushOne(app, a, 'notes', note);
    const edit = { ...note, body: 'v2', updated_at: minutesAgo(20) };
    await pushOne(app, a, 'notes', edit);

    // The retry of the FIRST push arrives after the edit. It is older, so it
    // must not roll the row back; the device is told which version won.
    const retried = await pushOne(app, a, 'notes', note);

    expect(retried).toMatchObject({ id: note.id, status: 'conflict' });
    expect((await stored('notes', note.id as string)).body).toBe('v2');
  });
});
