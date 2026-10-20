import type { NestExpressApplication } from '@nestjs/platform-express';
import { PullResponse, SYNC_TABLES } from '@triptrackr/contracts';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import {
  bearer,
  bootTestApp,
  registerTraveller,
  type RegisteredTraveller,
} from '../support/app';
import { PASS_FIELDS } from '../support/documents';
import { COUNTRY } from '../support/geography';
import { buildDataset, type PullDataset } from '../support/sync-pull-dataset';
import { flatten, pullOnce, pullPage, pullToEnd } from '../support/sync-pull-fixtures';
import { createHarness, type Harness } from '../integration/harness';

/** A boarding pass no other fixture carries, so its presence in a body can only be A’s. */
const A_PASS = { ...PASS_FIELDS, passenger_name: 'ALDER/ADA' };

/**
 * Adversarial suite — `GET /sync/pull` as traveller B, against traveller A
 * (Constitution I and III; FR-027, FR-032, FR-053, FR-056, FR-057;
 * sync-protocol.md §1 "Only rows belonging to the authenticated traveller's
 * trips are ever returned") — tasks.md T127, T126.
 *
 * A pull is a bulk read of every table the traveller owns, so the question is
 * what else it could be talked into carrying. The row-level policies OR an
 * owner policy with a public-read one (0005): under RLS alone B *can* read A's
 * public trip, its stops, its public notes and its approved public photos, so a
 * feed that trusted the policies to scope it would hand B all of them. The
 * tests are built on exactly that case. A publishes a trip, a note and a
 * photo, each of them readable by B at the database — asserted first, as the
 * control that gives the emptiness afterwards its meaning — and B's pull still
 * carries none.
 *
 * Nor is a cursor a way in: it is a position in the caller's own feed, not a
 * capability, and A's is worth nothing in B's hands.
 */
describe('privacy — a pull is the caller’s own mirror and nobody else’s', () => {
  let app: NestExpressApplication;
  let harness: Harness;
  let a: RegisteredTraveller;
  let b: RegisteredTraveller;
  let dataA: PullDataset;
  let dataB: PullDataset;
  let publicNoteId: string;

  const server = () => request(app.getHttpServer());
  const asA = () => bearer(a.tokens.access_token);

  beforeAll(async () => {
    app = await bootTestApp();
    harness = await createHarness();
    a = await registerTraveller(app);
    b = await registerTraveller(app);
    dataA = await buildDataset(app, a, 'A’s trip, which A publishes', A_PASS);
    dataB = await buildDataset(app, b, 'B’s own trip');

    // A makes everything it can public: the trip (and so its stops), a note,
    // and a photo that has passed screening. Each is now readable by B under
    // RLS — the situation in which only a narrowing predicate protects A.
    const published = await server()
      .patch(`/v1/trips/${dataA.tripId}`)
      .set(asA())
      .send({ is_public: true });
    if (published.status !== 200) throw new Error('The trip fixture was not published.');

    publicNoteId = randomUUID();
    const note = await server().post(`/v1/trips/${dataA.tripId}/notes`).set(asA()).send({
      id: publicNoteId,
      body: 'for all',
      country_id: COUNTRY.japan,
      is_public: true,
    });
    if (note.status !== 201) throw new Error('The public note fixture was not created.');

    await harness.owner`
      UPDATE photos SET is_public = true, moderation_state = 'approved'
      WHERE id = ${dataA.photoId}::uuid
    `;
  });

  afterAll(async () => {
    await harness?.close();
    await app?.close();
  });

  /** Everything B's pull returned, as one string a search can run over. */
  async function bEverythingAsText(params: { cursor?: string } = {}): Promise<string> {
    const { pages } = await pullToEnd(app, b, params);
    return JSON.stringify(pages);
  }

  describe('the control: what B can read under RLS alone', () => {
    it('A’s public trip, stops, public note and approved public photo are all readable by B at the database', async () => {
      const read = async (table: string, id: string) =>
        harness.asUser(
          b.tokens.user.id,
          (tx) => tx`SELECT id FROM ${tx(table)} WHERE id = ${id}::uuid`,
        );

      expect(await read('trips', dataA.tripId)).toHaveLength(1);
      expect(await read('trip_stops', dataA.stopId)).toHaveLength(1);
      expect(await read('notes', publicNoteId)).toHaveLength(1);
      expect(await read('photos', dataA.photoId)).toHaveLength(1);
    });

    it('and A’s expenses, documents, private note and category are not, even now', async () => {
      const read = async (table: string, id: string) =>
        harness.asUser(
          b.tokens.user.id,
          (tx) => tx`SELECT id FROM ${tx(table)} WHERE id = ${id}::uuid`,
        );

      expect(await read('expenses', dataA.expenseId)).toHaveLength(0);
      expect(await read('documents', dataA.documentId)).toHaveLength(0);
      expect(await read('notes', dataA.noteId)).toHaveLength(0);
      expect(await read('expense_categories', dataA.categoryId)).toHaveLength(0);
    });
  });

  describe('B’s pull', () => {
    it('carries none of A’s rows, public ones included, and exactly B’s own', async () => {
      const { records } = await pullToEnd(app, b);

      const ids = records.map((r) => r.id);
      for (const id of [...Object.values(dataA.byTable), publicNoteId]) {
        expect(ids).not.toContain(id);
      }
      expect(ids.sort()).toEqual(Object.values(dataB.byTable).sort());
    });

    it('names no table’s A row when B asks for each table by name', async () => {
      const a_ids = new Set([...Object.values(dataA.byTable), publicNoteId]);

      for (const table of SYNC_TABLES) {
        const { records } = await pullToEnd(app, b, { tables: [table] });
        expect(records.filter((r) => a_ids.has(r.id))).toEqual([]);
      }
    });

    it('never contains A’s passenger name, A’s titles or A’s ids anywhere in the body', async () => {
      const text = await bEverythingAsText();

      expect(text).not.toContain(A_PASS.passenger_name.replace('/', '\\/'));
      expect(text).not.toContain(A_PASS.passenger_name);
      expect(text).not.toContain('A’s trip');
      expect(text).not.toContain('for all');
      expect(text).not.toContain(a.tokens.user.id);
      for (const id of Object.values(dataA.byTable)) expect(text).not.toContain(id);
    });

    it('is not widened by A’s cursor: a position is not a capability', async () => {
      const aPages = await pullToEnd(app, a);
      const cursorOfA = aPages.pages.at(-1)?.next_cursor;
      const fromStart = await pullPage(app, b, {});
      expect(cursorOfA).toBeDefined();

      const withA = await pullToEnd(app, b, { cursor: cursorOfA });

      // Resumed from A's (later) position B sees only what B has written since
      // — never A's rows, which sit before it and after it alike.
      const ids = withA.records.map((r) => r.id);
      for (const id of Object.values(dataA.byTable)) expect(ids).not.toContain(id);
      expect(fromStart.changes.trips.map((t) => t.id)).toEqual([dataB.tripId]);
    });

    it('is unaffected by A deleting and republishing: A’s tombstones are not B’s to see', async () => {
      const removed = await server().delete(`/v1/notes/${publicNoteId}`).set(asA());
      expect(removed.status).toBe(204);

      const { records } = await pullToEnd(app, b);

      expect(records.map((r) => r.id)).not.toContain(publicNoteId);
      expect(records.filter((r) => r.deleted_at !== null)).toEqual([]);
    });

    it('does not reveal, in a refusal, anything about a row it was not allowed', async () => {
      const forged = Buffer.from(
        JSON.stringify({
          t: '2026-07-01T12:00:00.123456Z',
          i: dataA.tripId,
          k: 'trips',
        }),
      ).toString('base64url');

      const asB = await pullOnce(app, b, { cursor: forged });

      // A well-formed cursor naming A's id is just a position: B gets B's own
      // rows after it (here, everything B wrote is later) and no error that
      // distinguishes A's id from any other.
      expect(asB.status).toBe(200);
      expect(flatten(PullResponse.parse(asB.body)).map((r) => r.id)).not.toContain(
        dataA.tripId,
      );
      expect(JSON.stringify(asB.body)).not.toContain(dataA.noteId);
    });
  });

  describe('without a session', () => {
    it('answers 401 to no credentials and to a forged bearer token, with nothing in the body', async () => {
      const none = await server().get('/v1/sync/pull');
      const forged = await server().get('/v1/sync/pull').set(bearer('not.a.token'));

      expect(none.status).toBe(401);
      expect(forged.status).toBe(401);
      expect(JSON.stringify(none.body)).not.toContain(dataA.tripId);
      expect(JSON.stringify(forged.body)).not.toContain(dataA.tripId);
    });
  });

  describe('positive control', () => {
    it('A’s own pull carries A’s rows, the public ones too: emptiness for B means something', async () => {
      const { records } = await pullToEnd(app, a);

      const ids = records.map((r) => r.id);
      for (const id of Object.values(dataA.byTable)) expect(ids).toContain(id);
    });
  });
});
