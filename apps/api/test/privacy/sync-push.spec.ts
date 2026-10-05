import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PushResult, SyncTable } from '@triptrackr/contracts';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import {
  bearer,
  bootTestApp,
  registerTraveller,
  type RegisteredTraveller,
} from '../support/app';
import { PASS_FIELDS, uploadDocument } from '../support/documents';
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
  rowOf,
  stopRecord,
  tripRecord,
  type Wire,
} from '../support/sync-push-fixtures';

/**
 * Adversarial suite — `POST /sync/push` as traveller B, against traveller A
 * (Constitution I and III; FR-027, FR-032; sync-protocol.md §2 "Identity cannot
 * be hijacked"; tasks.md T128, T199).
 *
 * A push is the one endpoint that WRITES rows on a caller-chosen id under a
 * caller-chosen parent, and answers with a row when it refuses — `conflict`
 * carries a `server_version`. Both are places a stranger could learn or change
 * something. Written from the wrong person's chair, each test is an attempt to
 * do one of the following, and asserts that it fails:
 *
 *   - overwrite, tombstone or reach A's row by pushing its id;
 *   - plant a row under A's trip by naming it as a parent;
 *   - be told anything about A's row in the refusal — the test that matters
 *     most is B pushing the id of A's PUBLIC trip and PUBLIC photo, rows B may
 *     legitimately read, because a `conflict` for them would put A's fields in
 *     B's response;
 *   - forge ownership with a key the wire format does not define.
 *
 * "A's rows are untouched" is asserted as byte equality of the whole stored
 * rows — sealed columns included — before and after every attack, not as "the
 * one field I thought of is unchanged".
 *
 * The control at the end matters as much: a push that refused everyone would
 * pass every block above while breaking offline sync.
 */
describe('privacy — B cannot read, overwrite or learn anything of A through /sync/push', () => {
  let app: NestExpressApplication;
  let harness: Harness;
  let a: RegisteredTraveller;
  let b: RegisteredTraveller;

  // A's rows, one per table, all readable by B where the policies allow it.
  const ids = {} as Record<SyncTable, string>;
  let aPublicTripId: string;
  let aPrivateTripId: string;
  let bTripId: string;

  const SECRET = 'A-SECRET-MARKER-7f3c';

  beforeAll(async () => {
    app = await bootTestApp();
    harness = await createHarness();
    a = await registerTraveller(app);
    b = await registerTraveller(app);

    aPublicTripId = await createTripFor(app, a, 'CHF', `A public ${SECRET}`);
    aPrivateTripId = await createTripFor(app, a, 'CHF', `A private ${SECRET}`);
    bTripId = await createTripFor(app, b, 'EUR', 'B’s own trip');
    await request(app.getHttpServer())
      .patch(`/v1/trips/${aPublicTripId}`)
      .set(bearer(a.tokens.access_token))
      .send({ is_public: true })
      .expect(200);

    const category = categoryRecord({ name: `A category ${SECRET}` });
    const stop = stopRecord(aPublicTripId);
    const note = noteRecord(aPublicTripId, {
      title: SECRET,
      body: SECRET,
      is_public: true,
    });
    const expense = expenseRecord(aPrivateTripId, {
      note: SECRET,
      category_id: category.id,
    });
    await push(app, a, 'expense_categories', [category]);
    await push(app, a, 'trip_stops', [stop]);
    await push(app, a, 'notes', [note]);
    await push(app, a, 'expenses', [expense]);
    const photoId = await insertPhotoRow(harness.owner, aPublicTripId, {
      isPublic: true,
      moderationState: 'approved',
      exifLat: 47.37,
      exifLng: 8.54,
    });
    const document = await uploadDocument(app, a, aPrivateTripId, {
      type: 'boarding_pass',
      parsed_json: PASS_FIELDS,
    });

    ids.trips = aPublicTripId;
    ids.trip_stops = stop.id as string;
    ids.expense_categories = category.id as string;
    ids.notes = note.id as string;
    ids.expenses = expense.id as string;
    ids.photos = photoId;
    ids.documents = document.id;
  });

  afterAll(async () => {
    await harness?.close();
    await app?.close();
  });

  /** A's rows, whole — every column, sealed ones included — as comparable text. */
  const snapshotOfA = async (): Promise<string> => {
    const out: Record<string, unknown> = {};
    for (const [table, id] of Object.entries(ids)) {
      out[table] = await rowOf(harness.owner, table as SyncTable, id);
    }
    out.privateTrip = await rowOf(harness.owner, 'trips', aPrivateTripId);

    return JSON.stringify(out, (_key, value: unknown) =>
      Buffer.isBuffer(value) ? value.toString('base64') : value,
    );
  };

  /** What B's pushes may say back: nothing of A's. */
  const assertNothingOfAInBody = (body: unknown): void => {
    const text = JSON.stringify(body);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain('DESMARAIS');
    expect(text).not.toContain('47.37');
    expect(text).not.toContain('server_version');
  };

  /** Forged-up-to-date copies of A's rows, as B would send them. */
  const copiesOfAsRows = (overrides: Wire = {}): readonly [SyncTable, Wire][] => [
    ['trips', tripRecord({ id: ids.trips, title: 'B owns this now', ...overrides })],
    [
      'trip_stops',
      stopRecord(bTripId, { id: ids.trip_stops, sort_order: 7, ...overrides }),
    ],
    [
      'expense_categories',
      categoryRecord({ id: ids.expense_categories, name: 'B renamed it', ...overrides }),
    ],
    [
      'notes',
      noteRecord(bTripId, {
        id: ids.notes,
        body: 'B rewrote it',
        is_public: false,
        ...overrides,
      }),
    ],
    [
      'expenses',
      expenseRecord(bTripId, { id: ids.expenses, amount: '99999.00', ...overrides }),
    ],
    [
      'photos',
      photoRecord(bTripId, ids.photos, { is_public: false, city_id: null, ...overrides }),
    ],
    [
      'documents',
      documentRecord(bTripId, ids.documents, {
        type: 'other',
        parsed_json: null,
        parsed_confirmed_at: null,
        ...overrides,
      }),
    ],
  ];

  /**
   * Push never creates a photo or a document, so a delete of an id the caller
   * cannot see is answered `applied` with nothing written: the same answer as
   * for an id that does not exist anywhere (contract: sync-push-rules). That
   * is the only answer that is also private — a refusal for an id that exists
   * under A and an acceptance for one that does not would let B probe which
   * ids are A's.
   */
  const deletesWhatPushNeverCreates = (
    table: SyncTable,
    overrides: Readonly<{ updated_at: string; deleted?: boolean }>,
  ): boolean =>
    (table === 'photos' || table === 'documents') && overrides.deleted === true;

  const expectAnswerOfAnUnknownId = async (
    table: SyncTable,
    record: Wire,
    result: PushResult | undefined,
  ): Promise<void> => {
    const unknownId = randomUUID();
    const forUnknown = await pushOne(app, b, table, { ...record, id: unknownId });

    expect(result).toEqual({ id: record.id, status: 'applied' });
    expect(forUnknown).toEqual({ id: unknownId, status: 'applied' });
    expect(await rowOf(harness.owner, table, unknownId)).toBeUndefined();
  };

  describe.each([
    ['newer than A’s row', { updated_at: new Date().toISOString() }],
    ['older than A’s row', { updated_at: '2001-01-01T00:00:00.000Z' }],
    ['a tombstone', { deleted: true, updated_at: new Date().toISOString() }],
    [
      'a tombstone from a clock far in the future',
      { deleted: true, updated_at: '2999-01-01T00:00:00.000Z' },
    ],
  ] as const)('B pushes A’s ids as %s', (_name, overrides) => {
    it.each([
      ['trips'],
      ['trip_stops'],
      ['expense_categories'],
      ['notes'],
      ['expenses'],
      ['photos'],
      ['documents'],
    ] as const)(
      '%s: refused, nothing disclosed, A’s rows byte-identical',
      async (table) => {
        const before = await snapshotOfA();
        const record = copiesOfAsRows(overrides).find(([t]) => t === table)?.[1] as Wire;

        const response = await pushRaw(app, b, { table, records: [record] });

        expect(response.status).toBe(200);
        const result = (response.body as { results: PushResult[] }).results[0];
        if (deletesWhatPushNeverCreates(table, overrides)) {
          await expectAnswerOfAnUnknownId(table, record, result);
        } else {
          expect(result?.status).toBe('rejected');
          expect(['id_unavailable', 'parent_missing']).toContain(
            (result as { reason?: string }).reason,
          );
          // The entire answer, to the letter: an id, a status, a reason.
          expect(Object.keys(result ?? {}).sort()).toEqual(['id', 'reason', 'status']);
        }
        assertNothingOfAInBody(response.body);
        expect(await snapshotOfA()).toBe(before);
      },
    );
  });

  describe('B names A’s trip as a parent', () => {
    it.each([
      ['A’s public trip', () => aPublicTripId],
      ['A’s private trip', () => aPrivateTripId],
    ])('plants nothing under %s', async (_name, parent) => {
      const tripId = parent();
      const before = await snapshotOfA();
      const records: readonly [SyncTable, Wire][] = [
        ['trip_stops', stopRecord(tripId)],
        ['notes', noteRecord(tripId)],
        ['expenses', expenseRecord(tripId)],
        ['photos', photoRecord(tripId, ids.photos)],
        ['documents', documentRecord(tripId, ids.documents)],
      ];

      for (const [table, record] of records) {
        const result = await pushOne(app, b, table, record);

        expect(result).toMatchObject({ status: 'rejected', reason: 'parent_missing' });
        if (table !== 'photos' && table !== 'documents') {
          expect(await rowOf(harness.owner, table, record.id as string)).toBeUndefined();
        }
      }
      const planted = await harness.owner`
        SELECT
          (SELECT count(*)::int FROM trip_stops WHERE trip_id = ${tripId}::uuid) AS stops,
          (SELECT count(*)::int FROM notes WHERE trip_id = ${tripId}::uuid) AS notes,
          (SELECT count(*)::int FROM expenses WHERE trip_id = ${tripId}::uuid) AS expenses
      `;
      expect(planted[0]).toEqual({
        stops: tripId === aPublicTripId ? 1 : 0,
        notes: tripId === aPublicTripId ? 1 : 0,
        expenses: tripId === aPrivateTripId ? 1 : 0,
      });
      expect(await snapshotOfA()).toBe(before);
    });

    it('answers a note filed under A’s trip exactly as one filed under a trip that does not exist', async () => {
      const underHers = await pushOne(app, b, 'notes', noteRecord(aPrivateTripId));
      const underNone = await pushOne(
        app,
        b,
        'notes',
        noteRecord('00000000-0000-4000-8000-00000000dead'),
      );

      expect({ ...underHers, id: null }).toEqual({ ...underNone, id: null });
    });

    it('does not let B file an expense under A’s custom category', async () => {
      const result = await pushOne(
        app,
        b,
        'expenses',
        expenseRecord(bTripId, { category_id: ids.expense_categories }),
      );

      expect(result).toMatchObject({ status: 'rejected', reason: 'parent_missing' });
    });
  });

  describe('forged ownership', () => {
    it.each([
      ['trips', 'an owner id', { owner_id: '__A__' }],
      ['expense_categories', 'a user id', { user_id: '__A__' }],
      ['trips', 'a status', { status: 'past' }],
      ['expenses', 'a visibility flag', { is_public: true }],
      ['documents', 'a visibility flag', { is_public: true }],
      ['photos', 'an approved moderation state', { moderation_state: 'approved' }],
      ['photos', 'a storage key pointing at A’s object', { storage_key: '__A__' }],
    ] as const)(
      '%s with %s is refused as invalid and stores nothing',
      async (table, _name, extra) => {
        const forged = JSON.parse(
          JSON.stringify(extra).replaceAll('__A__', a.tokens.user.id),
        ) as Wire;
        const fresh = {
          trips: tripRecord(),
          expense_categories: categoryRecord(),
          expenses: expenseRecord(bTripId),
          documents: documentRecord(bTripId, ids.documents),
          photos: photoRecord(bTripId, ids.photos),
        }[table];

        const result = await pushOne(app, b, table, { ...fresh, ...forged });

        expect(result).toMatchObject({ status: 'rejected', reason: 'invalid' });
        if (table === 'trips' || table === 'expense_categories' || table === 'expenses') {
          expect(await rowOf(harness.owner, table, fresh.id as string)).toBeUndefined();
        }
      },
    );

    it('owns what it creates: a pushed trip and category belong to the session, nobody else', async () => {
      const trip = tripRecord();
      const category = categoryRecord();

      await push(app, b, 'trips', [trip]);
      await push(app, b, 'expense_categories', [category]);

      expect((await rowOf(harness.owner, 'trips', trip.id as string))?.owner_id).toBe(
        b.tokens.user.id,
      );
      expect(
        (await rowOf(harness.owner, 'expense_categories', category.id as string))
          ?.user_id,
      ).toBe(b.tokens.user.id);
    });

    it('cannot take A’s id by pushing it under another table name', async () => {
      const result = await pushOne(app, b, 'notes', {
        ...tripRecord({ id: ids.trips }),
      });

      expect(result).toMatchObject({ status: 'rejected', reason: 'invalid' });
    });
  });

  describe('a batch that mixes B’s own rows with A’s', () => {
    it('applies B’s, refuses A’s, and leaves A’s as they were', async () => {
      const before = await snapshotOfA();
      const mine = noteRecord(bTripId);

      const results = await push(app, b, 'notes', [
        mine,
        noteRecord(bTripId, { id: ids.notes, body: 'overwrite attempt' }),
        noteRecord(bTripId),
      ]);

      expect(results.map((result) => result.status)).toEqual([
        'applied',
        'rejected',
        'applied',
      ]);
      expect(await snapshotOfA()).toBe(before);
    });

    it('cannot be used to probe: A’s id and an unused id differ only in whether B may create it', async () => {
      const results = await push(app, b, 'trips', [
        tripRecord({ id: ids.trips }),
        tripRecord(),
      ]);

      // The one thing a caller learns — that an id is taken — is the thing
      // the protocol must say so the honest client regenerates it.
      expect(results[0]).toMatchObject({ status: 'rejected', reason: 'id_unavailable' });
      expect(results[1]).toMatchObject({ status: 'applied' });
    });
  });

  describe('without a session', () => {
    it('is refused and writes nothing', async () => {
      const trip = tripRecord();

      const response = await request(app.getHttpServer())
        .post('/v1/sync/push')
        .send({ table: 'trips', records: [trip] });

      expect(response.status).toBe(401);
      expect(await rowOf(harness.owner, 'trips', trip.id as string)).toBeUndefined();
    });
  });

  describe('control: the refusals above are about A’s rows, not about pushing', () => {
    it('lets A push her own rows through the same endpoint, and B cannot then read them', async () => {
      const note = noteRecord(aPrivateTripId, { body: `${SECRET} control` });

      const result = await pushOne(app, a, 'notes', note);
      const visibleToB = await harness.asUser(
        b.tokens.user.id,
        (tx) => tx`SELECT id FROM notes WHERE id = ${note.id as string}::uuid`,
      );

      expect(result).toEqual({ id: note.id, status: 'applied' });
      expect(visibleToB).toHaveLength(0);
    });

    it('lets A edit her own public trip and note, and answers her stale edit with her own row', async () => {
      const edit = await pushOne(
        app,
        a,
        'notes',
        noteRecord(aPublicTripId, {
          id: ids.notes,
          title: SECRET,
          body: `${SECRET} edited`,
          is_public: true,
          updated_at: new Date().toISOString(),
        }),
      );
      const stale = await pushOne(
        app,
        a,
        'notes',
        noteRecord(aPublicTripId, {
          id: ids.notes,
          body: 'older',
          updated_at: minutesAgo(600),
        }),
      );

      expect(edit).toEqual({ id: ids.notes, status: 'applied' });
      expect(stale).toMatchObject({ status: 'conflict' });
    });
  });
});
