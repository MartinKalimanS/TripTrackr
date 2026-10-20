import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  DocumentPullRecord,
  ExpensePullRecord,
  PhotoPullRecord,
  SYNC_TABLES,
  SYSTEM_EXPENSE_CATEGORIES,
  TripPullRecord,
} from '@triptrackr/contracts';
import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import request from 'supertest';

import { PULL_PAGE_SIZE } from '@/modules/sync/pull.service';

import {
  bearer,
  bootTestApp,
  registerTraveller,
  type RegisteredTraveller,
} from '../support/app';
import { migrationSql } from '../support/db';
import { PASS_FIELDS } from '../support/documents';
import { FOOD, createExpenseFor } from '../support/expenses';
import { COUNTRY, seedGeography } from '../support/geography';
import { bootPullApp } from '../support/sync-pull-app';
import { buildDataset, type PullDataset } from '../support/sync-pull-dataset';
import { flatten, pullPage, pullToEnd, type Pulled } from '../support/sync-pull-fixtures';

/**
 * Integration test — a pull with no cursor is a full snapshot, and it paginates
 * through `has_more` (sync-protocol.md §1; FR-042) — tasks.md T126.
 *
 * "Full" is judged against a real PostgreSQL + PostGIS and a real object store,
 * over every one of the seven tables, through the same routes a device's own
 * writes take. The other half of the claim is what a snapshot must *not*
 * contain: another traveller's rows, the six system categories, and any key
 * into the object store. The second traveller is there for that — a snapshot
 * that came back with one row too many would otherwise pass for a correct one.
 *
 * Paging is proved twice over. Once at the production page size, where a
 * traveller's whole history is a single page; and once at three rows a page
 * (`PULL_PAGE_LIMIT`), where the same history takes several and the resumption
 * properties — a stored cursor yields exactly the remainder, a row written
 * between two pages is found by the next — are reachable without writing 501
 * rows.
 */

const serverOf = (app: NestExpressApplication) => request(app.getHttpServer());

describe('sync snapshot — production page size', () => {
  let app: NestExpressApplication;
  let owner: Sql;
  let a: RegisteredTraveller;
  let b: RegisteredTraveller;
  let dataA: PullDataset;
  let dataB: PullDataset;

  beforeAll(async () => {
    app = await bootTestApp();
    owner = migrationSql();
    await seedGeography(owner);
    a = await registerTraveller(app);
    b = await registerTraveller(app);
    dataA = await buildDataset(app, a, 'A’s trip');
    dataB = await buildDataset(app, b, 'B’s trip');
  });

  afterAll(async () => {
    await owner?.end();
    await app?.close();
  });

  const byId = (records: Pulled[], id: string) => records.find((r) => r.id === id);

  it('returns everything in one page, across all seven tables, when no cursor is sent', async () => {
    const page = await pullPage(app, a);

    expect(page.has_more).toBe(false);
    expect(page.next_cursor.length).toBeGreaterThan(0);
    for (const table of SYNC_TABLES) {
      expect(page.changes[table].map((r) => r.id)).toEqual([dataA.byTable[table]]);
    }
  });

  it('never carries another traveller’s row, nor the six system categories', async () => {
    const { records } = await pullToEnd(app, a);

    const ids = records.map((r) => r.id);
    for (const id of Object.values(dataB.byTable)) expect(ids).not.toContain(id);
    for (const system of SYSTEM_EXPENSE_CATEGORIES) expect(ids).not.toContain(system.id);
    expect(records).toHaveLength(SYNC_TABLES.length);
  });

  it('keeps B’s snapshot to B’s rows as well: neither is a view of the other', async () => {
    const { records } = await pullToEnd(app, b);

    expect(records.map((r) => r.id).sort()).toEqual(Object.values(dataB.byTable).sort());
  });

  it('derives a trip’s status from its stops on read', async () => {
    const { records } = await pullToEnd(app, a, { tables: ['trips'] });

    // The only stop ended in 2020; whatever the cached column says, the feed says so.
    expect(TripPullRecord.parse(byId(records, dataA.tripId)?.record).status).toBe('past');
  });

  it('gives an expense its frozen conversion, and a pending one its pending flag', async () => {
    const pending = await createExpenseFor(app, a, dataA.tripId, {
      id: randomUUID(),
      category_id: FOOD,
      amount: '3.00',
      currency: 'XZQ',
    });

    const { records } = await pullToEnd(app, a, { tables: ['expenses'] });
    const converted = ExpensePullRecord.parse(byId(records, dataA.expenseId)?.record);
    const awaiting = ExpensePullRecord.parse(byId(records, pending.id)?.record);

    expect(converted).toMatchObject({
      amount: '12.50',
      currency: 'CHF',
      fx_pending: false,
    });
    expect(converted.fx_rate_to_home).not.toBeNull();
    expect(converted.amount_home).not.toBeNull();
    expect(awaiting).toMatchObject({
      amount: '3.00',
      currency: 'XZQ',
      fx_pending: true,
      fx_rate_to_home: null,
      amount_home: null,
    });
  });

  it('opens a boarding pass’s sealed fields for their owner and keeps every key off the wire', async () => {
    const { records } = await pullToEnd(app, a, { tables: ['documents'] });
    const row = byId(records, dataA.documentId);

    const parsed = DocumentPullRecord.parse(row?.record);
    expect(parsed.parsed_json).toEqual(PASS_FIELDS);
    expect(parsed.parsed_confirmed_at).not.toBeNull();
    expect(parsed.upload_state).toBe('uploaded');
    expect(Object.keys(row?.record ?? {}).sort()).toEqual(
      [
        'created_at',
        'deleted_at',
        'id',
        'parsed_confirmed_at',
        'parsed_json',
        'trip_id',
        'type',
        'updated_at',
        'upload_state',
      ].sort(),
    );
    expect(JSON.stringify(row?.record)).not.toMatch(/wrapped|storage|dek|sealed/i);
  });

  it('describes a photo by state alone: a thumbnail flag, never a storage key', async () => {
    const before = byId(
      (await pullToEnd(app, a, { tables: ['photos'] })).records,
      dataA.photoId,
    );
    expect(PhotoPullRecord.parse(before?.record)).toMatchObject({
      upload_state: 'uploaded',
      moderation_state: 'pending',
      has_thumbnail: false,
    });

    // What the media worker does once it has made one.
    await owner`
      UPDATE photos SET thumb_key = ${`${dataA.storageKey}.thumb.jpg`}, updated_at = now()
      WHERE id = ${dataA.photoId}::uuid
    `;
    const after = byId(
      (await pullToEnd(app, a, { tables: ['photos'] })).records,
      dataA.photoId,
    );

    expect(PhotoPullRecord.parse(after?.record).has_thumbnail).toBe(true);
    const wire = JSON.stringify(after?.record);
    expect(wire).not.toContain(dataA.storageKey);
    expect(wire).not.toContain('.thumb.jpg');
    expect(wire).not.toContain('thumb_key');
    expect(wire).not.toContain('storage');
  });

  it('keeps the page size at 500 and answers 401 without a session', async () => {
    const unauthenticated = await serverOf(app).get('/v1/sync/pull');

    expect(PULL_PAGE_SIZE).toBe(500);
    expect(unauthenticated.status).toBe(401);
  });
});

describe('sync snapshot — three rows a page', () => {
  const PAGE = 3;
  let app: NestExpressApplication;
  let owner: Sql;
  let a: RegisteredTraveller;
  let dataA: PullDataset;

  beforeAll(async () => {
    app = await bootPullApp({ pageSize: PAGE });
    owner = migrationSql();
    await seedGeography(owner);
    a = await registerTraveller(app);
    dataA = await buildDataset(app, a, 'Paged snapshot');
    // More notes than a page, so the snapshot cannot fit in one.
    for (let i = 0; i < 4; i += 1) await addNote(a, dataA.tripId, `filler ${i}`);
  });

  afterAll(async () => {
    await owner?.end();
    await app?.close();
  });

  async function addNote(traveller: RegisteredTraveller, tripId: string, body: string) {
    const id = randomUUID();
    const response = await serverOf(app)
      .post(`/v1/trips/${tripId}/notes`)
      .set(bearer(traveller.tokens.access_token))
      .send({ id, body, country_id: COUNTRY.switzerland });
    if (response.status !== 201)
      throw new Error(`Note fixture failed: ${response.status}`);
    return id;
  }

  const keyOf = (r: Pulled) => `${r.table}:${r.id}`;

  it('paginates through has_more: full pages, then a last one that says it is', async () => {
    const { pages, records } = await pullToEnd(app, a);

    // 7 dataset rows + 4 notes = 11 rows at 3 a page: 4 pages.
    expect(records).toHaveLength(11);
    expect(pages).toHaveLength(4);
    expect(pages.map((p) => p.has_more)).toEqual([true, true, true, false]);
    expect(pages.map((p) => flatten(p).length)).toEqual([3, 3, 3, 2]);
    expect(new Set(records.map(keyOf)).size).toBe(11);
  });

  it('serves every table’s row exactly once over the pages, tombstones included', async () => {
    const removed = await serverOf(app)
      .delete(`/v1/notes/${dataA.noteId}`)
      .set(bearer(a.tokens.access_token));
    expect(removed.status).toBe(204);

    const { records } = await pullToEnd(app, a);

    for (const table of SYNC_TABLES) {
      expect(
        records.filter((r) => r.table === table && r.id === dataA.byTable[table]),
      ).toHaveLength(1);
    }
    expect(records.find((r) => r.id === dataA.noteId)?.deleted_at).not.toBeNull();
  });

  it('resumes from a stored mid-way cursor with exactly the remainder', async () => {
    const { pages, records } = await pullToEnd(app, a);
    const midway = pages[1]?.next_cursor;
    expect(midway).toBeDefined();
    const servedBeforeStop = pages.slice(0, 2).flatMap(flatten).map(keyOf);

    const resumed = await pullToEnd(app, a, { cursor: midway });

    const remainder = resumed.records.map(keyOf);
    expect(remainder).toEqual(records.slice(servedBeforeStop.length).map(keyOf));
    expect(remainder.filter((key) => servedBeforeStop.includes(key))).toEqual([]);
    expect(remainder.length + servedBeforeStop.length).toBe(records.length);
  });

  it('finds a row written between two pages on the next pull, without a repeat of anything served', async () => {
    const first = await pullPage(app, a);
    const served = flatten(first).map(keyOf);
    expect(first.has_more).toBe(true);

    const written = await addNote(a, dataA.tripId, 'written between pages');
    const rest = await pullToEnd(app, a, { cursor: first.next_cursor });

    const remainder = rest.records.map(keyOf);
    expect(remainder).toContain(`notes:${written}`);
    expect(remainder.filter((key) => served.includes(key))).toEqual([]);
  });

  it('re-serves a row that changed after it was served, once, with its new content', async () => {
    const noteId = await addNote(a, dataA.tripId, 'before the edit');
    // The device has now synced everything, the new note included.
    const { pages } = await pullToEnd(app, a);
    const stored = pages.at(-1)?.next_cursor;

    const patch = await serverOf(app)
      .patch(`/v1/notes/${noteId}`)
      .set(bearer(a.tokens.access_token))
      .send({ body: 'after the edit' });
    expect(patch.status).toBe(200);
    const next = await pullToEnd(app, a, { cursor: stored });

    expect(next.records.map(keyOf)).toEqual([`notes:${noteId}`]);
    expect(next.records[0]?.record.body).toBe('after the edit');
  });

  it('answers an idle feed with no rows and the very cursor it was given', async () => {
    const { pages } = await pullToEnd(app, a);
    const stored = pages.at(-1)?.next_cursor as string;

    const idle = await pullPage(app, a, { cursor: stored });

    expect(flatten(idle)).toEqual([]);
    expect(idle.has_more).toBe(false);
    expect(idle.next_cursor).toBe(stored);
  });

  it('answers a snapshot of nothing with a non-empty cursor that also means "from the start"', async () => {
    const empty = await registerTraveller(app);

    const first = await pullPage(app, empty);
    const tripId = await createTrip(empty);
    const later = await pullToEnd(app, empty, { cursor: first.next_cursor });

    expect(flatten(first)).toEqual([]);
    expect(first.next_cursor.length).toBeGreaterThan(0);
    expect(later.records.map((r) => r.id)).toEqual([tripId]);
  });

  async function createTrip(traveller: RegisteredTraveller): Promise<string> {
    const response = await serverOf(app)
      .post('/v1/trips')
      .set(bearer(traveller.tokens.access_token))
      .send({ title: 'First trip', home_currency: 'CHF' });
    return (response.body as { trip: { id: string } }).trip.id;
  }
});
