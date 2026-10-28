import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Sql } from 'postgres';
import request from 'supertest';

import { QUEUE_NAMES } from '@/common/queue/queue.constants';
import { StorageService } from '@/common/storage/storage.service';
import {
  processAccountDeletion,
  type AccountDeletionDeps,
} from '@/workers/account-deletion.processor';

import {
  bearer,
  bootTestApp,
  enqueuedJobs,
  registerTraveller,
  type RegisteredTraveller,
} from '../support/app';
import { apiSql, migrationSql } from '../support/db';
import {
  documentsBucket,
  uploadDocument,
  type DocumentsBucket,
} from '../support/documents';
import { createExpenseFor, createTripFor } from '../support/expenses';
import { CITY, seedGeography } from '../support/geography';
import { registerPhoto, photosBucket, type PhotosBucket } from '../support/photos';

/**
 * Account deletion leaves nothing behind (tasks.md T188, T189; FR-006, SC-015;
 * data-model §9; Constitution V).
 *
 * A database cascade alone passes a database-only assertion while every photo and
 * boarding pass sits on in the bucket, so this suite checks BOTH halves, on the
 * real things: the routes, PostgreSQL with the migrations applied, and RustFS.
 *
 *   - rows: every table in `public` is searched for the traveller's id and the ids
 *     of the traveller's trips, as text, so a table nobody thought to list still
 *     counts (a new table with a user column cannot dodge this);
 *   - objects: nothing is left under `<userId>/` in either bucket, whether or not
 *     a row still points at it;
 *   - the other traveller keeps everything.
 */
describe('DELETE /me and the sweep that finishes it', () => {
  let app: NestExpressApplication;
  let owner: Sql;
  let api: Sql;
  let storage: StorageService;
  let photos: PhotosBucket;
  let documents: DocumentsBucket;

  beforeAll(async () => {
    app = await bootTestApp();
    owner = migrationSql();
    api = apiSql();
    await seedGeography(owner);
    storage = new StorageService();
    photos = photosBucket();
    documents = documentsBucket();
  });

  afterAll(async () => {
    photos?.close();
    documents?.close();
    await api?.end();
    await owner?.end();
    await app?.close();
  });

  const server = () => request(app.getHttpServer());
  const deps = (overrides: Partial<AccountDeletionDeps> = {}): AccountDeletionDeps => ({
    sql: api,
    storage,
    ...overrides,
  });

  interface Content {
    readonly userId: string;
    readonly tripIds: string[];
    readonly photoKeys: string[];
    readonly documentKeys: string[];
  }

  /** Everything a traveller can own, made through the routes and the buckets. */
  async function fillAccount(traveller: RegisteredTraveller): Promise<Content> {
    const [row] = await owner<{ id: string }[]>`
      SELECT id FROM users WHERE email = ${traveller.email}
    `;
    const userId = row!.id;
    const token = bearer(traveller.tokens.access_token);

    const tripId = await createTripFor(app, traveller, 'CHF', 'Residue trip');
    const second = await createTripFor(app, traveller, 'EUR', 'A second trip');
    await server()
      .post(`/v1/trips/${tripId}/stops`)
      .set(token)
      .send({
        city_id: CITY.zurich,
        arrive_date: '2026-06-01',
        depart_date: '2026-06-03',
      })
      .expect(201);
    await server()
      .post(`/v1/trips/${tripId}/notes`)
      .set(token)
      .send({ body: 'A note that must not outlive the account.', city_id: CITY.zurich })
      .expect(201);
    await createExpenseFor(app, traveller, tripId, { amount: '12.50' });

    const live = await registerPhoto(app, traveller, tripId);
    const tombstoned = await registerPhoto(app, traveller, tripId);
    await server().delete(`/v1/photos/${tombstoned.photo.id}`).set(token).expect(204);
    // The thumbnail the media worker would have derived beside the original.
    await storage.putObject(
      'photos',
      `${live.storageKey}.thumb.jpg`,
      Buffer.from('thumbnail bytes'),
      'image/jpeg',
    );
    // A file nothing points at any more: still the traveller's, still must go.
    await storage.putObject(
      'photos',
      `${userId}/orphan-without-a-row`,
      Buffer.from('orphan'),
      'image/jpeg',
    );
    const document = await uploadDocument(app, traveller, tripId);

    return {
      userId,
      tripIds: [tripId, second],
      photoKeys: [live.storageKey, tombstoned.storageKey],
      documentKeys: [document.id],
    };
  }

  /** How many rows of `public` mention any of `needles`, by table, as text. */
  async function residueRows(
    needles: readonly string[],
  ): Promise<Record<string, number>> {
    const tables = await owner<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('__drizzle_migrations', 'schema_migrations')
    `;
    const found: Record<string, number> = {};
    for (const { table_name } of tables) {
      const [counted] = await owner<{ n: string }[]>`
        SELECT count(*)::text AS n FROM ${owner(table_name)} t
        WHERE t::text LIKE ANY (${owner.array(needles.map((id) => `%${id}%`))})
      `;
      if (Number(counted?.n) > 0) found[table_name] = Number(counted?.n);
    }
    return found;
  }

  const objectsOf = async (userId: string) => ({
    photos: await photos.keys(`${userId}/`),
    documents: await documents.keys(`${userId}/`),
  });

  async function request202(traveller: RegisteredTraveller, body: unknown) {
    return server()
      .delete('/v1/me')
      .set(bearer(traveller.tokens.access_token))
      .send(body as object);
  }

  describe('the request', () => {
    it('refuses a caller with no token', async () => {
      const response = await server().delete('/v1/me').send({ password: 'x' });
      expect(response.status).toBe(401);
    });

    it('refuses a wrong password and changes nothing', async () => {
      const traveller = await registerTraveller(app);
      const response = await request202(traveller, {
        password: 'not the password at all',
      });

      expect(response.status).toBe(403);
      const [user] = await owner<{ deletion_requested_at: Date | null }[]>`
        SELECT deletion_requested_at FROM users WHERE email = ${traveller.email}
      `;
      expect(user?.deletion_requested_at).toBeNull();
      expect(
        enqueuedJobs(app, QUEUE_NAMES.storageSweep).map((job) => job.data),
      ).not.toContainEqual(expect.objectContaining({ email: traveller.email }));
      // Still signed in: the refresh token was not revoked.
      const me = await server().get('/v1/me').set(bearer(traveller.tokens.access_token));
      expect(me.status).toBe(200);
    });

    it('refuses a request with no password for an account that has one', async () => {
      const traveller = await registerTraveller(app);
      const response = await request202(traveller, {});
      expect(response.status).toBe(403);
    });

    it('accepts the right password: 202, the account is marked, every session ends, a sweep is queued', async () => {
      const traveller = await registerTraveller(app);
      const response = await request202(traveller, { password: traveller.password });

      expect(response.status).toBe(202);
      expect(response.body).toEqual({ status: 'deletion_requested' });

      const [user] = await owner<{ id: string; deletion_requested_at: Date | null }[]>`
        SELECT id, deletion_requested_at FROM users WHERE email = ${traveller.email}
      `;
      expect(user?.deletion_requested_at).not.toBeNull();
      const [tokens] = await owner<{ n: string }[]>`
        SELECT count(*)::text AS n FROM refresh_tokens
        WHERE user_id = ${user!.id}::uuid AND revoked_at IS NULL
      `;
      expect(Number(tokens?.n)).toBe(0);

      const queued = enqueuedJobs(app, QUEUE_NAMES.storageSweep).filter(
        (job) => (job.data as { userId?: string }).userId === user!.id,
      );
      expect(queued).toHaveLength(1);
      expect(queued[0]!.name).toBe('account-deletion');

      // The credentials no longer work.
      const login = await server()
        .post('/v1/auth/login')
        .send({ email: traveller.email, password: traveller.password });
      expect(login.status).toBe(401);
      const refresh = await server()
        .post('/v1/auth/refresh')
        .send({ refresh_token: traveller.tokens.refresh_token });
      expect(refresh.status).toBe(401);
    });

    it('is idempotent: asking again answers 202 and queues no second sweep', async () => {
      const traveller = await registerTraveller(app);
      await request202(traveller, { password: traveller.password }).then((r) =>
        expect(r.status).toBe(202),
      );
      const again = await request202(traveller, { password: traveller.password });
      expect(again.status).toBe(202);

      const [user] = await owner<{ id: string }[]>`
        SELECT id FROM users WHERE email = ${traveller.email}
      `;
      const queued = enqueuedJobs(app, QUEUE_NAMES.storageSweep).filter(
        (job) => (job.data as { userId?: string }).userId === user!.id,
      );
      expect(queued).toHaveLength(1);
    });

    it('once requested, the profile route no longer answers for that account', async () => {
      const traveller = await registerTraveller(app);
      await request202(traveller, { password: traveller.password });
      const me = await server().get('/v1/me').set(bearer(traveller.tokens.access_token));
      expect(me.status).toBe(401);
    });
  });

  describe('the sweep (T188) leaves no residue (T189, SC-015)', () => {
    let victim: Content;
    let victimAccount: RegisteredTraveller;
    let bystander: Content;
    let bystanderAccount: RegisteredTraveller;
    let result: Awaited<ReturnType<typeof processAccountDeletion>>;

    beforeAll(async () => {
      victimAccount = await registerTraveller(app, { displayName: 'Leaving' });
      bystanderAccount = await registerTraveller(app, { displayName: 'Staying' });
      victim = await fillAccount(victimAccount);
      bystander = await fillAccount(bystanderAccount);
      // Something that mentions the leaving traveller from the other side.
      await owner`
        INSERT INTO follows (follower_id, followee_id)
        VALUES (${bystander.userId}::uuid, ${victim.userId}::uuid),
               (${victim.userId}::uuid, ${bystander.userId}::uuid)
      `;
      await owner`
        INSERT INTO blocks (blocker_id, blocked_id)
        VALUES (${bystander.userId}::uuid, ${victim.userId}::uuid)
      `;
      await owner`
        INSERT INTO reports (reporter_id, target_type, target_id, reason)
        VALUES (${bystander.userId}::uuid, 'user', ${victim.userId}::uuid, 'spam'),
               (${bystander.userId}::uuid, 'trip', ${victim.tripIds[0]!}::uuid, 'spam')
      `;
      await owner`
        INSERT INTO planner_requests (user_id, cache_key)
        VALUES (${victim.userId}::uuid, 'lisbon-4-days')
      `;
    });

    it('the fixture really holds what the test claims to remove', async () => {
      const before = await residueRows([victim.userId, ...victim.tripIds]);
      expect(Object.keys(before)).toEqual(
        expect.arrayContaining([
          'users',
          'trips',
          'trip_stops',
          'notes',
          'expenses',
          'photos',
          'documents',
          'refresh_tokens',
          'follows',
          'blocks',
          'reports',
          'planner_requests',
        ]),
      );
      const objects = await objectsOf(victim.userId);
      expect(objects.photos.length).toBeGreaterThanOrEqual(4);
      expect(objects.documents.length).toBeGreaterThanOrEqual(1);
    });

    it('removes every row and every object, and reports it only when it is done', async () => {
      await request202(victimAccount, { password: victimAccount.password }).then((r) =>
        expect(r.status).toBe(202),
      );

      result = await processAccountDeletion(deps(), { userId: victim.userId });

      expect(result.completed).toBe(true);
      expect(await residueRows([victim.userId, ...victim.tripIds])).toEqual({});
      expect(await objectsOf(victim.userId)).toEqual({ photos: [], documents: [] });
    });

    it('leaves the other traveller, row for row and object for object', async () => {
      const rows = await residueRows([bystander.userId, ...bystander.tripIds]);
      expect(rows['users']).toBe(1);
      expect(rows['trips']).toBe(2);
      expect(rows['photos']).toBe(2);
      expect(rows['documents']).toBe(1);
      expect(rows['notes']).toBe(1);
      expect(rows['expenses']).toBe(1);
      const objects = await objectsOf(bystander.userId);
      for (const key of bystander.photoKeys) expect(objects.photos).toContain(key);
      expect(objects.documents.length).toBeGreaterThanOrEqual(1);
    });

    it('running it again is harmless: nothing to do, still complete', async () => {
      const again = await processAccountDeletion(deps(), { userId: victim.userId });
      expect(again.completed).toBe(true);
      expect(again.objectsRemoved).toBe(0);
    });
  });

  describe('when the store refuses (no partial state)', () => {
    it('keeps the account, its rows and the key list until every object is gone, then finishes on the retry', async () => {
      const traveller = await registerTraveller(app);
      const content = await fillAccount(traveller);
      await request202(traveller, { password: traveller.password }).then((r) =>
        expect(r.status).toBe(202),
      );

      const refusing: AccountDeletionDeps['storage'] = {
        listObjects: (bucket, prefix) => storage.listObjects(bucket, prefix),
        removeObject: () => Promise.reject(new Error('the store is unreachable')),
      };
      await expect(
        processAccountDeletion(deps({ storage: refusing }), { userId: content.userId }),
      ).rejects.toThrow('the store is unreachable');

      // Nothing was finalised: the account row, its trips and the objects are all still there,
      // so the keys are not lost and the retry has everything it needs.
      const [stillThere] = await owner<{ n: string }[]>`
        SELECT count(*)::text AS n FROM users WHERE id = ${content.userId}::uuid
      `;
      expect(Number(stillThere?.n)).toBe(1);
      expect((await objectsOf(content.userId)).photos.length).toBeGreaterThan(0);

      const retried = await processAccountDeletion(deps(), { userId: content.userId });
      expect(retried.completed).toBe(true);
      expect(await residueRows([content.userId, ...content.tripIds])).toEqual({});
      expect(await objectsOf(content.userId)).toEqual({ photos: [], documents: [] });
    });

    it('refuses to finish an account nobody asked to delete', async () => {
      const traveller = await registerTraveller(app);
      const content = await fillAccount(traveller);

      await expect(
        processAccountDeletion(deps(), { userId: content.userId }),
      ).rejects.toThrow(/not been requested/i);

      const [user] = await owner<{ n: string }[]>`
        SELECT count(*)::text AS n FROM users WHERE id = ${content.userId}::uuid
      `;
      expect(Number(user?.n)).toBe(1);
      expect((await objectsOf(content.userId)).photos.length).toBeGreaterThan(0);
    });
  });
});
