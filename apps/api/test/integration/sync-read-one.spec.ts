import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  DocumentPullRecord,
  ExpenseCategoryPullRecord,
  ExpensePullRecord,
  NotePullRecord,
  PhotoPullRecord,
  SYNC_TABLES,
  SYSTEM_EXPENSE_CATEGORIES,
  TripPullRecord,
  TripStopPullRecord,
  type SyncTable,
} from '@triptrackr/contracts';
import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import request from 'supertest';
import type { z } from 'zod';

import { runInRlsContext } from '@/common/rls/rls-context';
import { PullService } from '@/modules/sync/pull.service';

import {
  bearer,
  bootTestApp,
  registerTraveller,
  type RegisteredTraveller,
} from '../support/app';
import { apiSql, migrationSql } from '../support/db';
import { seedGeography } from '../support/geography';
import { buildDataset, type PullDataset } from '../support/sync-pull-dataset';
import { pullToEnd } from '../support/sync-pull-fixtures';

/**
 * `PullService.readOne` — the one row, in pull shape (tasks.md T127; the push
 * path builds a conflict's `server_version` from it, sync-protocol.md §2).
 *
 * Three properties carry it. It is the **same record** the feed serves, because
 * a second serialiser is a second way for `server_version` to disagree with
 * what the device already pulled. It **includes tombstones**, because a
 * conflict against a deleted row must still be answerable. And it is **blind to
 * anyone else's rows**: an id held by another traveller — even one on a trip
 * they made public, which RLS alone would let the caller read — answers exactly
 * as an id that does not exist.
 *
 * It runs here the way the push path runs it: inside a transaction on the API
 * role with the traveller's identity set, in the RLS context the request
 * middleware would have established.
 */
const RECORD_SCHEMAS: Readonly<Record<SyncTable, z.ZodType>> = {
  trips: TripPullRecord,
  trip_stops: TripStopPullRecord,
  expense_categories: ExpenseCategoryPullRecord,
  notes: NotePullRecord,
  expenses: ExpensePullRecord,
  photos: PhotoPullRecord,
  documents: DocumentPullRecord,
};

describe('PullService.readOne', () => {
  let app: NestExpressApplication;
  let service: PullService;
  let owner: Sql;
  let api: Sql;
  let a: RegisteredTraveller;
  let b: RegisteredTraveller;
  let data: PullDataset;

  beforeAll(async () => {
    app = await bootTestApp();
    service = app.get(PullService, { strict: false });
    owner = migrationSql();
    api = apiSql();
    await seedGeography(owner);
    a = await registerTraveller(app);
    b = await registerTraveller(app);
    data = await buildDataset(app, a);
  });

  afterAll(async () => {
    await api?.end();
    await owner?.end();
    await app?.close();
  });

  /** `readOne` as `userId`, in a transaction with RLS identity and context, as push runs it. */
  function readOneAs(traveller: RegisteredTraveller, table: SyncTable, id: string) {
    const userId = traveller.tokens.user.id;

    return api.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${userId}, true)`;
      return runInRlsContext({ tx, userId }, () => service.readOne(table, id));
    });
  }

  describe.each(SYNC_TABLES)('%s', (table) => {
    it('returns the owner’s row as the very record the pull feed serves', async () => {
      const id = data.byTable[table];

      const one = await readOneAs(a, table, id);
      const feed = await pullToEnd(app, a, { tables: [table] });
      const served = feed.records.find((r) => r.id === id);

      expect(one).not.toBeNull();
      expect(RECORD_SCHEMAS[table].safeParse(one).success).toBe(true);
      expect(one).toEqual(served?.record);
    });

    it('answers null to another traveller, exactly as for an id that does not exist', async () => {
      const theirs = await readOneAs(b, table, data.byTable[table]);
      const nothing = await readOneAs(b, table, randomUUID());

      expect(theirs).toBeNull();
      expect(theirs).toEqual(nothing);
    });
  });

  it('includes tombstones: a deleted note comes back with deleted_at set', async () => {
    const noteId = randomUUID();
    const created = await request(app.getHttpServer())
      .post(`/v1/trips/${data.tripId}/notes`)
      .set(bearer(a.tokens.access_token))
      .send({ id: noteId, body: 'short-lived', country_id: 1 });
    expect(created.status).toBe(201);
    const removed = await request(app.getHttpServer())
      .delete(`/v1/notes/${noteId}`)
      .set(bearer(a.tokens.access_token));
    expect(removed.status).toBe(204);

    const one = await readOneAs(a, 'notes', noteId);

    expect(NotePullRecord.parse(one)).toMatchObject({ id: noteId, body: 'short-lived' });
    expect((one as { deleted_at: string | null }).deleted_at).not.toBeNull();
  });

  it('does not disclose a public row of another traveller that RLS alone would let the caller read', async () => {
    const published = await request(app.getHttpServer())
      .patch(`/v1/trips/${data.tripId}`)
      .set(bearer(a.tokens.access_token))
      .send({ is_public: true });
    expect(published.status).toBe(200);
    const publicNote = randomUUID();
    const created = await request(app.getHttpServer())
      .post(`/v1/trips/${data.tripId}/notes`)
      .set(bearer(a.tokens.access_token))
      .send({ id: publicNote, body: 'for everyone', country_id: 1, is_public: true });
    expect(created.status).toBe(201);

    // Positive control: under RLS, B can read A's public trip and note…
    const bSees = await api.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${b.tokens.user.id}, true)`;
      return tx<{ id: string }[]>`
        SELECT id FROM notes WHERE id = ${publicNote}::uuid
      `;
    });
    expect(bSees).toHaveLength(1);

    // …and readOne still says nothing.
    expect(await readOneAs(b, 'trips', data.tripId)).toBeNull();
    expect(await readOneAs(b, 'notes', publicNote)).toBeNull();
    expect(await readOneAs(b, 'trip_stops', data.stopId)).toBeNull();
  });

  it('is null for a system expense category: reference data is not a sync row', async () => {
    const system = SYSTEM_EXPENSE_CATEGORIES[0].id;

    expect(await readOneAs(a, 'expense_categories', system)).toBeNull();
  });

  it('is null, not an error, for an id that is not a uuid', async () => {
    await expect(readOneAs(a, 'notes', 'not-a-uuid')).resolves.toBeNull();
    await expect(readOneAs(a, 'notes', "x'; DROP TABLE notes; --")).resolves.toBeNull();
  });

  it('reads the derived status, not the cached column', async () => {
    const cached = await owner<{ status: string }[]>`
      SELECT status FROM trips WHERE id = ${data.tripId}::uuid
    `;
    const one = await readOneAs(a, 'trips', data.tripId);

    // The fixture's only stop ended in 2020: `past`, whatever the column says.
    expect(cached[0]?.status).toBeDefined();
    expect(TripPullRecord.parse(one).status).toBe('past');
  });
});
