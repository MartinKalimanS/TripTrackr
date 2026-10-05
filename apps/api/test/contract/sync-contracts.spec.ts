import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  MAX_PUSH_BATCH,
  PullResponse,
  PushRequest,
  PushResponse,
  SYNC_TABLES,
  type SyncTable,
} from '@triptrackr/contracts';
import request from 'supertest';

import {
  bearer,
  bootTestApp,
  registerTraveller,
  type RegisteredTraveller,
} from '../support/app';
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
  pushRaw,
  rowOf,
  stopRecord,
  tripRecord,
  type Wire,
} from '../support/sync-push-fixtures';

/**
 * Contract test — every `/sync/push` body is validated with `PushRequest` and
 * every `/sync/pull` response conforms to `PullResponse`; a record carrying an
 * unknown key — an `is_public` smuggled onto an expense or a document, a
 * client-set `status` on a trip — is `rejected` with `reason: "invalid"` by the
 * strict schema (tasks.md T200; FR-013, FR-027, FR-032; research D-13).
 *
 * Two levels of refusal, deliberately different:
 *
 *   - the ENVELOPE (`table`, `records`, each record's `id`) is refused as a
 *     whole with 400 `VALIDATION_FAILED`, because a record with no parseable
 *     id cannot be reported on by id — the response has no slot for it — and
 *     applying "the rest" would hide from the device which record was dropped;
 *   - a RECORD that fails its table's strict schema is `rejected` / `invalid`
 *     on its own, and the rest of the batch proceeds: one traveller's malformed
 *     row must not hold back the day's other captures.
 */
describe('contract — the wire format of /sync/push and /sync/pull', () => {
  let app: NestExpressApplication;
  let harness: Harness;
  let a: RegisteredTraveller;
  let tripId: string;

  beforeAll(async () => {
    app = await bootTestApp();
    harness = await createHarness();
    a = await registerTraveller(app);
    tripId = await createTripFor(app, a, 'CHF', 'Contract fixture');
  });

  afterAll(async () => {
    await harness?.close();
    await app?.close();
  });

  const exists = async (table: SyncTable, id: unknown): Promise<boolean> =>
    (await rowOf(harness.owner, table, id as string)) !== undefined;
  const ghost = '00000000-0000-4000-8000-00000000dead';

  /** One valid record per table, in `SYNC_TABLES` order. */
  const validRecords = (): Record<SyncTable, Wire> => ({
    trips: tripRecord(),
    trip_stops: stopRecord(tripId),
    expense_categories: categoryRecord(),
    notes: noteRecord(tripId),
    expenses: expenseRecord(tripId),
    photos: photoRecord(tripId, ghost),
    documents: documentRecord(tripId, ghost),
  });

  describe('the fixtures are contract-valid (so a refusal below is about the key, not the fixture)', () => {
    it.each(SYNC_TABLES)('%s: a valid record parses as a PushRequest', (table) => {
      const body = { table, records: [validRecords()[table]] };

      expect(PushRequest.safeParse(body).success).toBe(true);
    });
  });

  describe('the envelope: refused as a whole, nothing applied', () => {
    const note = () => noteRecord(tripId);

    it.each([
      ['an unknown table', { table: 'users', records: [{ id: ghost }] }],
      ['no table', { records: [{ id: ghost }] }],
      ['no records', { table: 'notes' }],
      ['an empty records list', { table: 'notes', records: [] }],
      ['records that are not a list', { table: 'notes', records: { id: ghost } }],
      [
        'an unknown top-level key',
        { table: 'notes', records: [{ id: ghost }], force: true },
      ],
      ['a body that is not an object', ['notes']],
    ])('answers %s with 400 VALIDATION_FAILED', async (_name, body) => {
      const response = await pushRaw(app, a, body);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    });

    it('answers more than MAX_PUSH_BATCH records with 400, and applies none', async () => {
      const records = Array.from({ length: MAX_PUSH_BATCH + 1 }, () => ({ id: ghost }));

      const response = await pushRaw(app, a, { table: 'notes', records });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    });

    it.each([
      ['no id', (record: Wire) => ({ ...record, id: undefined })],
      ['a null id', (record: Wire) => ({ ...record, id: null })],
      ['an id that is not a uuid', (record: Wire) => ({ ...record, id: 'not-a-uuid' })],
      ['a numeric id', (record: Wire) => ({ ...record, id: 42 })],
    ])(
      'answers a record with %s with 400 for the whole request, applying the valid neighbours of none',
      async (_name, corrupt) => {
        const neighbour = note();
        const broken = corrupt(note());

        const response = await pushRaw(app, a, {
          table: 'notes',
          records: [neighbour, broken],
        });

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
        expect(await exists('notes', neighbour.id)).toBe(false);
      },
    );

    it('answers a record that is not an object with 400', async () => {
      const response = await pushRaw(app, a, { table: 'notes', records: [null] });

      expect(response.status).toBe(400);
    });

    it('requires a session', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/sync/push')
        .send({ table: 'notes', records: [note()] });

      expect(response.status).toBe(401);
    });

    it('refuses a forged token exactly as no token', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/sync/push')
        .set(bearer('forged.token.value'))
        .send({ table: 'notes', records: [note()] });

      expect(response.status).toBe(401);
    });
  });

  describe('a record with a key the strict schema does not know is rejected invalid — alone', () => {
    const smuggles: readonly (readonly [SyncTable, string, Wire])[] = [
      ['expenses', 'is_public on an expense (FR-027)', { is_public: true }],
      ['expenses', 'visibility on an expense (FR-027)', { visibility: 'public' }],
      ['expenses', 'shared_with on an expense (FR-027)', { shared_with: [ghost] }],
      ['documents', 'is_public on a document (FR-032)', { is_public: true }],
      ['documents', 'visibility on a document (FR-032)', { visibility: 'public' }],
      ['documents', 'a storage key on a document', { storage_key: 'somewhere/else' }],
      ['documents', 'a wrapped key on a document', { wrapped_dek: 'AAAA' }],
      ['trips', 'a client-set status on a trip (FR-013)', { status: 'active' }],
      ['trips', 'an owner id on a trip', { owner_id: ghost }],
      ['trip_stops', 'an unknown key on a stop', { colour: 'red' }],
      ['expense_categories', 'a user id on a category', { user_id: ghost }],
      ['notes', 'an unknown key on a note', { pinned: true }],
      ['photos', 'a storage key on a photo', { storage_key: 'somewhere/else' }],
      ['photos', 'an upload state on a photo', { upload_state: 'uploaded' }],
      ['photos', 'a moderation state on a photo', { moderation_state: 'approved' }],
    ];

    it.each(smuggles)('%s: %s', async (table, _name, extra) => {
      // A photo must exist for a valid record of it to be applied; a
      // document's neighbour is refused for another reason, asserted below.
      const good: Wire =
        table === 'photos'
          ? photoRecord(tripId, await insertPhotoRow(harness.owner, tripId))
          : validRecords()[table];
      const smuggled: Wire = {
        ...validRecords()[table],
        ...(table === 'photos' && { id: await insertPhotoRow(harness.owner, tripId) }),
        ...extra,
      };

      const results = await push(app, a, table, [good, smuggled]);

      expect(results[1]).toEqual({
        id: smuggled.id,
        status: 'rejected',
        reason: 'invalid',
      });
      if (table !== 'photos' && table !== 'documents') {
        expect(await exists(table, smuggled.id)).toBe(false);
      }
      // The neighbour before it is unaffected.
      expect(results[0]?.id).toBe(good.id);
      if (table !== 'documents') {
        expect(results[0]?.status).toBe('applied');
      }
    });

    it('does not store a smuggled visibility on an expense anywhere', async () => {
      const expense = expenseRecord(tripId, { is_public: true });

      await pushOne(app, a, 'expenses', expense);

      expect(await exists('expenses', expense.id)).toBe(false);
    });

    it('refuses a record of another table’s shape', async () => {
      const result = await pushOne(app, a, 'expenses', noteRecord(tripId));

      expect(result).toMatchObject({ status: 'rejected', reason: 'invalid' });
    });
  });

  describe('a record with a value the contract refuses is rejected invalid — alone', () => {
    const refused: readonly (readonly [SyncTable, string, Wire])[] = [
      ['trips', 'an empty title', { title: '   ' }],
      ['trips', 'a lower-case currency', { home_currency: 'chf' }],
      ['trips', 'a non-boolean is_public', { is_public: 'yes' }],
      ['trips', 'a missing deleted flag', { deleted: undefined }],
      ['trips', 'a timestamp that is not ISO-8601', { updated_at: 'yesterday' }],
      ['trips', 'a timestamp without an offset', { updated_at: '2026-08-26T10:12:03' }],
      [
        'trip_stops',
        'a departure before the arrival (FR-011)',
        { depart_date: '2026-09-01' },
      ],
      ['trip_stops', 'a negative position', { sort_order: -1 }],
      ['trip_stops', 'an unknown city', { city_id: 999_999 }],
      ['expense_categories', 'a name over sixty characters', { name: 'x'.repeat(61) }],
      ['notes', 'no anchor at all (FR-019)', { country_id: null, city_id: null }],
      ['notes', 'an unknown country', { country_id: 999_999 }],
      ['notes', 'an unknown city', { city_id: 999_999 }],
      ['notes', 'a body over twenty thousand characters', { body: 'x'.repeat(20_001) }],
      ['expenses', 'three decimals in an amount', { amount: '1.234' }],
      ['expenses', 'an amount that is not a decimal', { amount: 'twelve' }],
      ['expenses', 'a lower-case currency', { currency: 'chf' }],
      ['expenses', 'an unknown city', { city_id: 999_999 }],
      ['expenses', 'a rate without the converted amount', { fx_rate_to_home: '0.9' }],
      ['expenses', 'a converted amount without the rate', { amount_home: '11.25' }],
    ];

    it.each(refused)('%s: %s', async (table, _name, change) => {
      const good = validRecords()[table];
      const bad: Wire = { ...validRecords()[table], ...change };

      const results = await push(app, a, table, [bad, good]);

      // toMatchObject: a trip past the account's allowance is still applied,
      // with a warning that is not what this test is about.
      expect(results).toMatchObject([
        { id: bad.id, status: 'rejected', reason: 'invalid' },
        { id: good.id, status: 'applied' },
      ]);
      expect(await exists(table, bad.id)).toBe(false);
    });
  });

  describe('the response', () => {
    it('is one result per record, in input order, and is a PushResponse', async () => {
      const first = noteRecord(tripId);
      const second = noteRecord(tripId, { is_public: 'maybe' });
      const third = noteRecord(ghost);
      const fourth = noteRecord(tripId);

      const response = await pushRaw(app, a, {
        table: 'notes',
        records: [first, second, third, fourth],
      });

      expect(response.status).toBe(200);
      const parsed = PushResponse.parse(response.body);
      expect(parsed.results.map((result) => result.id)).toEqual([
        first.id,
        second.id,
        third.id,
        fourth.id,
      ]);
      expect(parsed.results.map((result) => result.status)).toEqual([
        'applied',
        'rejected',
        'rejected',
        'applied',
      ]);
    });

    it('answers a batch of exactly MAX_PUSH_BATCH records', async () => {
      const records = Array.from({ length: MAX_PUSH_BATCH }, (_, index) =>
        noteRecord(tripId, { body: `bulk ${index}` }),
      );

      const response = await pushRaw(app, a, { table: 'notes', records });

      expect(response.status).toBe(200);
      const results = PushResponse.parse(response.body).results;
      expect(results).toHaveLength(MAX_PUSH_BATCH);
      expect(results.every((result) => result.status === 'applied')).toBe(true);
    });
  });

  describe('the payload ceiling', () => {
    it('admits a chunk of about 800 KB of maximum-length notes — what the mobile client sends', async () => {
      const records = Array.from({ length: 38 }, () =>
        noteRecord(tripId, { body: 'x'.repeat(20_000) }),
      );
      const bytes = Buffer.byteLength(JSON.stringify({ table: 'notes', records }));
      expect(bytes).toBeGreaterThan(700_000);
      expect(bytes).toBeLessThan(1024 * 1024);

      const response = await pushRaw(app, a, { table: 'notes', records });

      expect(response.status).toBe(200);
    });

    it('answers a body over the one-megabyte limit with 413 PAYLOAD_TOO_LARGE, applying nothing', async () => {
      const records = Array.from({ length: 60 }, () =>
        noteRecord(tripId, { body: 'é'.repeat(20_000) }),
      );
      expect(
        Buffer.byteLength(JSON.stringify({ table: 'notes', records })),
      ).toBeGreaterThan(1024 * 1024);

      const response = await pushRaw(app, a, { table: 'notes', records });

      expect(response.status).toBe(413);
      expect(response.body).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
      expect(await exists('notes', records[0]?.id)).toBe(false);
    });
  });

  describe('GET /sync/pull conforms to PullResponse', () => {
    it('returns the pushed rows of every table in their pull shapes, strictly', async () => {
      const traveller = await registerTraveller(app);
      const trip = tripRecord();
      const tid = trip.id as string;
      const category = categoryRecord();
      await push(app, traveller, 'trips', [trip]);
      await push(app, traveller, 'trip_stops', [stopRecord(tid)]);
      await push(app, traveller, 'expense_categories', [category]);
      await push(app, traveller, 'notes', [noteRecord(tid)]);
      await push(app, traveller, 'expenses', [
        expenseRecord(tid, { category_id: category.id }),
      ]);
      const photoId = await insertPhotoRow(harness.owner, tid);
      await harness.owner`UPDATE photos SET updated_at = now() WHERE id = ${photoId}::uuid`;

      const response = await request(app.getHttpServer())
        .get('/v1/sync/pull')
        .set(bearer(traveller.tokens.access_token));

      expect(response.status).toBe(200);
      const parsed = PullResponse.parse(response.body);
      expect(parsed.changes.trips).toHaveLength(1);
      expect(parsed.changes.trip_stops).toHaveLength(1);
      expect(parsed.changes.expense_categories).toHaveLength(1);
      expect(parsed.changes.notes).toHaveLength(1);
      expect(parsed.changes.expenses).toHaveLength(1);
      expect(parsed.changes.photos).toHaveLength(1);
    });
  });
});
