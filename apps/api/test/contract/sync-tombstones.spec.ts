import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Sql } from 'postgres';
import request from 'supertest';

import {
  bearer,
  bootTestApp,
  registerTraveller,
  type RegisteredTraveller,
} from '../support/app';
import { migrationSql } from '../support/db';
import { seedGeography } from '../support/geography';
import { buildDataset, type PullDataset } from '../support/sync-pull-dataset';
import { flatten, pullPage, pullToEnd, type Pulled } from '../support/sync-pull-fixtures';

/**
 * Contract test — soft-deleted rows are returned by `/sync/pull` and by no
 * other read path (sync-protocol.md §1; FR-039) — tasks.md T122.
 *
 * Both halves matter and they fail in opposite directions. A tombstone the feed
 * does not carry is a deletion that never reaches the traveller's other phone,
 * and the row comes back the next time that phone pushes. A tombstone any other
 * read path *does* carry is a deleted note, expense or document that the
 * traveller sees again — FR-039's named failure. So every scenario asserts the
 * feed and the REST surface side by side, for every synchronised table.
 *
 * Two shapes of deletion are covered because they tombstone differently: a
 * single row on a live trip, and a whole trip, which tombstones its children in
 * the same transaction.
 */
describe('sync tombstones (contract)', () => {
  let app: NestExpressApplication;
  let owner: Sql;
  let traveller: RegisteredTraveller;

  beforeAll(async () => {
    app = await bootTestApp();
    owner = migrationSql();
    await seedGeography(owner);
    traveller = await registerTraveller(app);
  });

  afterAll(async () => {
    await owner?.end();
    await app?.close();
  });

  const auth = () => bearer(traveller.tokens.access_token);
  const server = () => request(app.getHttpServer());
  const get = (path: string) => server().get(`/v1${path}`).set(auth());
  const del = (path: string) => server().delete(`/v1${path}`).set(auth());

  const pulled = async (): Promise<Map<string, Pulled>> => {
    const { records } = await pullToEnd(app, traveller);
    return new Map(records.map((r) => [`${r.table}:${r.id}`, r]));
  };

  /** Ids of a REST list body (an untyped HTTP response), whatever its envelope key. */
  const idsOf = (body: unknown, key: string): string[] =>
    ((body as Record<string, unknown>)[key] as { id: string }[]).map((item) => item.id);

  describe('rows deleted one at a time on a trip that stays', () => {
    let data: PullDataset;

    beforeAll(async () => {
      data = await buildDataset(app, traveller, 'Trip that stays');

      expect((await del(`/trips/${data.tripId}/stops/${data.stopId}`)).status).toBe(204);
      expect((await del(`/notes/${data.noteId}`)).status).toBe(204);
      expect((await del(`/expenses/${data.expenseId}`)).status).toBe(204);
      expect((await del(`/photos/${data.photoId}`)).status).toBe(204);
      expect((await del(`/documents/${data.documentId}`)).status).toBe(204);
      // There is no REST route that deletes a category; the row is tombstoned
      // the way a pushed `deleted: true` will tombstone it.
      await owner`
        UPDATE expense_categories SET deleted_at = now(), updated_at = now()
        WHERE id = ${data.categoryId}::uuid
      `;
    });

    it.each([
      ['trip_stops', (d: PullDataset) => d.stopId],
      ['expense_categories', (d: PullDataset) => d.categoryId],
      ['notes', (d: PullDataset) => d.noteId],
      ['expenses', (d: PullDataset) => d.expenseId],
      ['photos', (d: PullDataset) => d.photoId],
      ['documents', (d: PullDataset) => d.documentId],
    ] as const)(
      '/sync/pull carries the deleted %s row, with deleted_at set',
      async (table, pick) => {
        const all = await pulled();

        const row = all.get(`${table}:${pick(data)}`);

        expect(row).toBeDefined();
        expect(row?.deleted_at).not.toBeNull();
        expect(row?.deleted_at).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
      },
    );

    it('/sync/pull still carries the live trip, with deleted_at null', async () => {
      const row = (await pulled()).get(`trips:${data.tripId}`);

      expect(row?.deleted_at).toBeNull();
    });

    it('the trip routes show the trip without its deleted stop', async () => {
      const one = await get(`/trips/${data.tripId}`);
      const list = await get('/trips');

      expect(one.status).toBe(200);
      expect(idsOf(one.body.trip as Record<string, unknown>, 'stops')).not.toContain(
        data.stopId,
      );
      const listed = (list.body.trips as { id: string; stops: { id: string }[] }[]).find(
        (t) => t.id === data.tripId,
      );
      expect(listed?.stops.map((s) => s.id)).not.toContain(data.stopId);
    });

    it('the notes list does not show the deleted note', async () => {
      const response = await get(`/trips/${data.tripId}/notes`);

      expect(response.status).toBe(200);
      expect(idsOf(response.body, 'notes')).not.toContain(data.noteId);
    });

    it('the expenses list and summary do not count the deleted expense', async () => {
      const list = await get(`/trips/${data.tripId}/expenses`);
      const summary = await get(`/trips/${data.tripId}/expenses/summary`);

      expect(list.status).toBe(200);
      expect(idsOf(list.body, 'expenses')).not.toContain(data.expenseId);
      expect(summary.status).toBe(200);
      expect(JSON.stringify(summary.body)).not.toContain('12.50');
    });

    it('the photos list does not show the deleted photo, and its original is not signed', async () => {
      const list = await get(`/trips/${data.tripId}/photos`);
      const original = await get(`/photos/${data.photoId}/original`);

      expect(list.status).toBe(200);
      expect(idsOf(list.body, 'photos')).not.toContain(data.photoId);
      expect(original.status).toBe(404);
    });

    it('the documents list does not show the deleted document, and its content is not served', async () => {
      const list = await get(`/trips/${data.tripId}/documents`);
      const content = await get(`/documents/${data.documentId}/content`);

      expect(list.status).toBe(200);
      expect(idsOf(list.body, 'documents')).not.toContain(data.documentId);
      expect(content.status).toBe(404);
    });

    it('the category list does not show the deleted custom category', async () => {
      const response = await get('/expense-categories');

      expect(response.status).toBe(200);
      expect(idsOf(response.body, 'categories')).not.toContain(data.categoryId);
    });
  });

  describe('a trip deleted with everything on it', () => {
    let data: PullDataset;

    beforeAll(async () => {
      data = await buildDataset(app, traveller, 'Trip that goes');
      expect((await del(`/trips/${data.tripId}`)).status).toBe(204);
    });

    it.each([
      ['trips', (d: PullDataset) => d.tripId],
      ['trip_stops', (d: PullDataset) => d.stopId],
      ['notes', (d: PullDataset) => d.noteId],
      ['expenses', (d: PullDataset) => d.expenseId],
      ['photos', (d: PullDataset) => d.photoId],
      ['documents', (d: PullDataset) => d.documentId],
    ] as const)('/sync/pull carries the %s row as a tombstone', async (table, pick) => {
      const row = (await pulled()).get(`${table}:${pick(data)}`);

      expect(row).toBeDefined();
      expect(row?.deleted_at).not.toBeNull();
    });

    it('the category, which belongs to the traveller and not the trip, is untouched', async () => {
      const row = (await pulled()).get(`expense_categories:${data.categoryId}`);

      expect(row?.deleted_at).toBeNull();
    });

    it('no other read path can reach the trip or anything under it', async () => {
      const list = await get('/trips');
      const responses = await Promise.all([
        get(`/trips/${data.tripId}`),
        get(`/trips/${data.tripId}/notes`),
        get(`/trips/${data.tripId}/expenses`),
        get(`/trips/${data.tripId}/photos`),
        get(`/trips/${data.tripId}/documents`),
        get(`/photos/${data.photoId}/original`),
        get(`/documents/${data.documentId}/content`),
      ]);

      expect(idsOf(list.body, 'trips')).not.toContain(data.tripId);
      expect(responses.map((r) => r.status)).toEqual([404, 404, 404, 404, 404, 404, 404]);
    });
  });

  describe('a deletion reaches a device that already synced', () => {
    it('arrives on the next pull from the stored cursor, as exactly the one changed row', async () => {
      const data = await buildDataset(app, traveller, 'Synced then deleted');
      const { pages } = await pullToEnd(app, traveller);
      const stored = pages.at(-1)?.next_cursor;
      expect(stored).toBeDefined();

      expect((await del(`/notes/${data.noteId}`)).status).toBe(204);
      const next = await pullPage(app, traveller, { cursor: stored });

      const changed = flatten(next);
      expect(changed.map((r) => `${r.table}:${r.id}`)).toEqual([`notes:${data.noteId}`]);
      expect(changed[0]?.deleted_at).not.toBeNull();
    });

    it('does not reappear once a later pull has delivered it', async () => {
      const data = await buildDataset(app, traveller, 'Deleted and delivered');
      expect((await del(`/notes/${data.noteId}`)).status).toBe(204);
      const { pages } = await pullToEnd(app, traveller);
      const stored = pages.at(-1)?.next_cursor;

      const again = await pullPage(app, traveller, { cursor: stored });

      expect(flatten(again)).toEqual([]);
    });
  });
});
