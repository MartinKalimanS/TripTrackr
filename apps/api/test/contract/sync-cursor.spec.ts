import type { NestExpressApplication } from '@nestjs/platform-express';
import { PullResponse } from '@triptrackr/contracts';
import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import request from 'supertest';

import { PULL_PAGE_SIZE } from '@/modules/sync/pull.service';

import { registerTraveller, type RegisteredTraveller } from '../support/app';
import { migrationSql } from '../support/db';
import { createTripFor } from '../support/expenses';
import { seedGeography } from '../support/geography';
import { bootPullApp } from '../support/sync-pull-app';
import {
  flatten,
  insertExpenseAt,
  insertNoteAt,
  microInstant,
  pullOnce,
  pullPage,
  pullToEnd,
} from '../support/sync-pull-fixtures';

/**
 * Contract test — the pull cursor is opaque over `(updated_at, id)` and no row
 * is skipped or repeated at a page boundary (sync-protocol.md §1; SC-011) —
 * tasks.md T121.
 *
 * The hazard is a cursor that is only a timestamp, or a timestamp that has been
 * through a JavaScript `Date`. PostgreSQL keeps microseconds and a `Date` keeps
 * milliseconds, so two rows a few microseconds apart look identical to a
 * cursor built from one of them, and whichever side of the boundary the second
 * one lands on, it is either served twice or never. A row never served is a
 * note that never reaches the traveller's other phone.
 *
 * Every scenario therefore forces the instants itself, in SQL, around the API:
 * rows that share an exact `updated_at`, rows that share only a millisecond,
 * and rows of different tables that tie — each straddling a page boundary,
 * with the page size shrunk to three (the `PULL_PAGE_LIMIT` token) so the
 * boundary is reachable with a handful of rows.
 *
 * Each scenario owns a traveller and a trip, because every spec file shares
 * one database and a pull is scoped to whoever asks.
 */
describe('sync pull — the cursor (contract)', () => {
  const PAGE = 3;
  let app: NestExpressApplication;
  let owner: Sql;

  beforeAll(async () => {
    app = await bootPullApp({ pageSize: PAGE });
    owner = migrationSql();
    await seedGeography(owner);
  });

  afterAll(async () => {
    await owner?.end();
    await app?.close();
  });

  /** A traveller with one trip and nothing else, so a snapshot holds only what a test adds. */
  async function freshTraveller(): Promise<{
    traveller: RegisteredTraveller;
    tripId: string;
  }> {
    const traveller = await registerTraveller(app);
    const tripId = await createTripFor(app, traveller);
    return { traveller, tripId };
  }

  const seededIds = (ids: readonly string[]) => [...ids].sort();

  describe('rows that share the exact same updated_at', () => {
    it('are each served exactly once when they straddle a page boundary', async () => {
      const { traveller, tripId } = await freshTraveller();
      const tie = microInstant(123);
      const ids = await Promise.all(
        Array.from({ length: 8 }, () => insertNoteAt(owner, tripId, tie)),
      );

      const { pages, records } = await pullToEnd(app, traveller, { tables: ['notes'] });

      const served = records.map((r) => r.id);
      // 8 tied rows at 3 a page: three pages, the boundaries inside the tie.
      expect(pages.length).toBeGreaterThanOrEqual(3);
      expect(served).toHaveLength(8);
      expect(new Set(served).size).toBe(8);
      expect(served).toEqual(seededIds(ids));
    });

    it('keep the order (updated_at, id) across pages, so a cursor can only move forward', async () => {
      const { traveller, tripId } = await freshTraveller();
      const early = microInstant(10, '2026-07-01T12:00:00');
      const tie = microInstant(20, '2026-07-01T12:00:00');
      const late = microInstant(30, '2026-07-01T12:00:00');
      await insertNoteAt(owner, tripId, late);
      await Promise.all(
        Array.from({ length: 4 }, () => insertNoteAt(owner, tripId, tie)),
      );
      await insertNoteAt(owner, tripId, early);

      const { records } = await pullToEnd(app, traveller, { tables: ['notes'] });

      const keys = records.map((r) => `${r.updated_at}|${r.id}`);
      expect(keys).toEqual([...keys].sort());
      expect(records.map((r) => r.updated_at)).toEqual([early, tie, tie, tie, tie, late]);
    });
  });

  describe('rows that share only a millisecond', () => {
    it('are told apart by their microseconds: none skipped, none repeated, instants exact', async () => {
      const { traveller, tripId } = await freshTraveller();
      // Five instants inside one millisecond. A cursor rounded to a `Date` has
      // one value for all five, so a boundary after the third either repeats
      // the first three or drops the last two.
      const instants = [0, 1, 2, 3, 4].map((micro) => microInstant(micro));
      const ids = new Map<string, string>();
      for (const instant of [...instants].reverse()) {
        ids.set(instant, await insertNoteAt(owner, tripId, instant));
      }

      const { records } = await pullToEnd(app, traveller, { tables: ['notes'] });

      expect(records.map((r) => r.updated_at)).toEqual(instants);
      expect(records.map((r) => r.id)).toEqual(instants.map((i) => ids.get(i)));
    });

    it('are emitted at full microsecond precision and still satisfy PullResponse', async () => {
      const { traveller, tripId } = await freshTraveller();
      await insertNoteAt(owner, tripId, microInstant(987));

      const response = await pullOnce(app, traveller, { tables: ['notes'] });

      expect(response.status).toBe(200);
      const page = PullResponse.parse(response.body);
      expect(page.changes.notes.map((n) => n.updated_at)).toEqual([microInstant(987)]);
    });
  });

  describe('rows of different tables that tie', () => {
    it('are served once each when the tie group straddles a page boundary', async () => {
      const { traveller, tripId } = await freshTraveller();
      const tie = microInstant(555);
      const notes = await Promise.all(
        Array.from({ length: 4 }, () => insertNoteAt(owner, tripId, tie)),
      );
      const expenses = await Promise.all(
        Array.from({ length: 4 }, () => insertExpenseAt(owner, tripId, tie)),
      );

      const { pages, records } = await pullToEnd(app, traveller, {
        tables: ['notes', 'expenses'],
      });

      const served = records.map((r) => `${r.table}:${r.id}`);
      expect(pages.length).toBeGreaterThanOrEqual(3);
      expect(new Set(served).size).toBe(8);
      expect(new Set(served)).toEqual(
        new Set([
          ...notes.map((id) => `notes:${id}`),
          ...expenses.map((id) => `expenses:${id}`),
        ]),
      );
    });

    it('are ordered by id across tables, page by page', async () => {
      const { traveller, tripId } = await freshTraveller();
      const tie = microInstant(556);
      await Promise.all([
        ...Array.from({ length: 3 }, () => insertNoteAt(owner, tripId, tie)),
        ...Array.from({ length: 3 }, () => insertExpenseAt(owner, tripId, tie)),
      ]);

      const { pages } = await pullToEnd(app, traveller, {
        tables: ['notes', 'expenses'],
      });

      const order = pages.flatMap((page) =>
        flatten(page)
          .map((r) => r.id)
          .sort(),
      );
      // Within a page the order is by id; across pages every id of a page is
      // below every id of the next — i.e. the concatenation is globally sorted.
      expect(order).toEqual([...order].sort());
      expect(new Set(order).size).toBe(6);
    });

    it('serves both when one id is used in two tables at the same instant and the page ends between them', async () => {
      const { traveller, tripId } = await freshTraveller();
      const tie = microInstant(557);
      const [low, mid, shared] = [randomUUID(), randomUUID(), randomUUID()].sort();
      await insertNoteAt(owner, tripId, tie, { id: low });
      await insertNoteAt(owner, tripId, tie, { id: mid });
      await insertNoteAt(owner, tripId, tie, { id: shared });
      // Same id, same instant, in another table: the order (updated_at, id) is
      // a tie, so the cursor has to carry the table too or this row is lost.
      await insertExpenseAt(owner, tripId, tie, { id: shared });

      const { pages, records } = await pullToEnd(app, traveller, {
        tables: ['notes', 'expenses'],
      });

      // Three notes fill the first page; the boundary falls between the note
      // and the expense that share an id.
      expect(pages[0]?.changes.notes).toHaveLength(3);
      expect(records.map((r) => `${r.table}:${r.id}`).sort()).toEqual(
        [`notes:${low}`, `notes:${mid}`, `notes:${shared}`, `expenses:${shared}`].sort(),
      );
    });
  });

  describe('the token', () => {
    it('is opaque: base64url, and neither the row id nor the instant can be read from it', async () => {
      const { traveller, tripId } = await freshTraveller();
      const instant = microInstant(42);
      const id = await insertNoteAt(owner, tripId, instant);

      const page = await pullPage(app, traveller, { tables: ['notes'] });

      expect(page.next_cursor).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(page.next_cursor).not.toContain(id);
      expect(page.next_cursor).not.toContain('2026');
      expect(page.next_cursor).not.toContain(instant);
    });

    it('is non-empty when the page is empty, and resuming from it returns nothing and the same cursor', async () => {
      const { traveller } = await freshTraveller();

      const first = await pullPage(app, traveller, { tables: ['notes'] });
      const second = await pullPage(app, traveller, {
        tables: ['notes'],
        cursor: first.next_cursor,
      });

      expect(first.next_cursor.length).toBeGreaterThan(0);
      expect(first.has_more).toBe(false);
      expect(flatten(first)).toEqual([]);
      expect(flatten(second)).toEqual([]);
      expect(second.next_cursor).toBe(first.next_cursor);
    });

    it('does not let a client build one: a bare instant, a bare id or a hand-made token is a 400', async () => {
      const { traveller } = await freshTraveller();
      const b64 = (value: unknown) =>
        Buffer.from(JSON.stringify(value)).toString('base64url');
      const forged = [
        '2026-07-01T12:00:00.123456Z',
        randomUUID(),
        `2026-07-01T12:00:00.123456Z|${randomUUID()}`,
        b64({ t: '2026-07-01T12:00:00.123456Z' }),
        b64({ t: 'yesterday', i: randomUUID(), k: 'notes' }),
        b64({ t: '2026-02-30T12:00:00.123456Z', i: randomUUID(), k: 'notes' }),
        b64({ t: '2026-07-01T12:00:00.123Z', i: randomUUID(), k: 'notes' }),
        b64({ t: '2026-07-01T12:00:00.123456Z', i: 'not-a-uuid', k: 'notes' }),
        b64({ t: '2026-07-01T12:00:00.123456Z', i: randomUUID(), k: 'countries' }),
        b64({ t: '2026-07-01T12:00:00.123456Z', i: randomUUID(), k: 'notes', x: 1 }),
        b64(['2026-07-01T12:00:00.123456Z', randomUUID()]),
        b64(null),
      ];

      for (const cursor of forged) {
        const response = await pullOnce(app, traveller, { cursor });
        expect({ cursor, status: response.status }).toEqual({ cursor, status: 400 });
        expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
      }
    });

    it.each([
      ['garbage', 'not a cursor at all'],
      ['text that is not base64url', '%%%%'],
      ['valid base64url that is not JSON', Buffer.from('hello').toString('base64url')],
      ['a truncated token', 'eyJ0IjoiMjAyNi0wNy0wMVQxMj'],
      ['an empty token', ''],
    ])('refuses %s with 400 VALIDATION_FAILED', async (_label, cursor) => {
      const { traveller } = await freshTraveller();

      const response = await pullOnce(app, traveller, { cursor });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    });

    it('cannot be reordered: a token with its fields swapped is refused, not reinterpreted', async () => {
      const { traveller, tripId } = await freshTraveller();
      await insertNoteAt(owner, tripId, microInstant(1));
      const { next_cursor } = await pullPage(app, traveller, { tables: ['notes'] });

      const parts = JSON.parse(
        Buffer.from(next_cursor, 'base64url').toString(),
      ) as Record<string, unknown>;
      const swapped = Buffer.from(
        JSON.stringify({ ...parts, t: parts.i, i: parts.t }),
      ).toString('base64url');

      const response = await pullOnce(app, traveller, { cursor: swapped });

      expect(response.status).toBe(400);
    });

    it('is honoured when the table subset changes between calls', async () => {
      const { traveller, tripId } = await freshTraveller();
      const early = await insertNoteAt(owner, tripId, microInstant(1));
      const late = await insertNoteAt(owner, tripId, microInstant(900));
      const first = await pullPage(app, traveller, { tables: ['notes'] });
      expect(first.changes.notes.map((n) => n.id)).toEqual([early, late]);

      const resumed = await pullPage(app, traveller, {
        tables: ['notes', 'expenses'],
        cursor: first.next_cursor,
      });

      expect(flatten(resumed)).toEqual([]);
    });
  });

  describe('the query', () => {
    it.each([
      ['an unknown table', { tables: ['notes', 'itinerary_items'] }],
      ['an empty table list', { tables: [''] }],
      ['a reference table', { tables: ['countries'] }],
    ])('refuses %s with 400 VALIDATION_FAILED', async (_label, params) => {
      const { traveller } = await freshTraveller();

      const response = await pullOnce(app, traveller, params);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    });

    it('refuses a query parameter the contract does not name', async () => {
      const { traveller } = await freshTraveller();

      const response = await pullOnce(app, traveller).query({ limit: '5000' });

      expect(response.status).toBe(400);
    });

    it('accepts the comma-separated table list and answers only for the tables named', async () => {
      const { traveller, tripId } = await freshTraveller();
      await insertNoteAt(owner, tripId, microInstant(5));
      await insertExpenseAt(owner, tripId, microInstant(6));

      const page = await pullPage(app, traveller, { tables: ['trips', 'notes'] });

      expect(page.changes.trips).toHaveLength(1);
      expect(page.changes.notes).toHaveLength(1);
      expect(page.changes.expenses).toEqual([]);
      expect(page.changes.photos).toEqual([]);
    });

    it('defaults to every table when `tables` is omitted', async () => {
      const { traveller, tripId } = await freshTraveller();
      await insertNoteAt(owner, tripId, microInstant(5));
      await insertExpenseAt(owner, tripId, microInstant(6));

      const page = await pullPage(app, traveller);

      expect(page.changes.trips).toHaveLength(1);
      expect(page.changes.notes).toHaveLength(1);
      expect(page.changes.expenses).toHaveLength(1);
    });

    it('serves a repeated table name once', async () => {
      const { traveller, tripId } = await freshTraveller();
      await insertNoteAt(owner, tripId, microInstant(5));

      const page = await pullPage(app, traveller, { tables: ['notes', 'notes'] });

      expect(page.changes.notes).toHaveLength(1);
    });
  });

  describe('the response', () => {
    it('is never stored by a cache: it carries a passenger name', async () => {
      const { traveller } = await freshTraveller();

      const response = await pullOnce(app, traveller);

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('requires a signed-in traveller', async () => {
      const response = await request(app.getHttpServer()).get('/v1/sync/pull');

      expect(response.status).toBe(401);
    });

    it('caps a page at the page size and says there is more', async () => {
      const { traveller, tripId } = await freshTraveller();
      await Promise.all(
        Array.from({ length: PAGE + 2 }, (_, i) =>
          insertNoteAt(owner, tripId, microInstant(100 + i)),
        ),
      );

      const first = await pullPage(app, traveller, { tables: ['notes'] });

      expect(first.changes.notes).toHaveLength(PAGE);
      expect(first.has_more).toBe(true);
    });

    it('says there is no more when a page ends exactly on the last row', async () => {
      const { traveller, tripId } = await freshTraveller();
      await Promise.all(
        Array.from({ length: PAGE }, (_, i) =>
          insertNoteAt(owner, tripId, microInstant(200 + i)),
        ),
      );

      const only = await pullPage(app, traveller, { tables: ['notes'] });

      expect(only.changes.notes).toHaveLength(PAGE);
      expect(only.has_more).toBe(false);
    });
  });

  it('the production page is 500 rows', () => {
    expect(PULL_PAGE_SIZE).toBe(500);
  });
});
