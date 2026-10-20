import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  DocumentContentResponse,
  DocumentsResponse,
  type Document,
} from '@triptrackr/contracts';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import {
  bearer,
  bootTestApp,
  registerTraveller,
  type RegisteredTraveller,
} from '../support/app';
import {
  PASS_FIELDS,
  PLAINTEXT_MARKER,
  boardingPassJpeg,
  uploadBody,
  uploadDocument,
} from '../support/documents';
import { createTripFor } from '../support/expenses';
import { createHarness, type Harness } from '../integration/harness';

/**
 * Adversarial suite row 4 — B reads A's documents by every available route
 * (contracts/data-access-policy.md §4; FR-032, SC-012) — tasks.md T108,
 * document half.
 *
 * Written as B, against A, twice over, as the expense rows are:
 *
 *   - **At the database, through the API role.** The authority. The policy
 *     `documents_owner_only` (0005) has no public-read counterpart — row 14
 *     asserts that absence in the catalogue — so A's rows do not exist for B,
 *     for reading or for writing, whatever a request path does.
 *   - **Over HTTP, through every route the story ships**: the list, the
 *     content, the patch, the delete, a guessed id, an upload onto A's trip and
 *     a reuse of A's document id. Each answers B exactly as it answers a request
 *     for something that does not exist — the same status, the same body — and
 *     A's document is untouched afterwards.
 *
 * The positive controls — A sees and reads A's document — are what make
 * "empty" meaningful.
 */
describe('privacy — documents are unreachable by any route but the owner’s (row 4)', () => {
  describe('at the database, as the API role', () => {
    let harness: Harness;
    let A: string;
    let B: string;
    let documentId: string;

    beforeAll(async () => {
      harness = await createHarness();
      A = harness.accountA.id;
      B = harness.accountB.id;

      // On A's PUBLIC trip: the case where a leak would be plausible, because
      // B can read the trip itself.
      const [row] = await harness.owner<{ id: string }[]>`
        INSERT INTO documents (trip_id, type, storage_key, content_type, byte_size,
                               wrapped_dek, dek_key_id, parsed_sealed, upload_state)
        VALUES (${harness.accountA.publicTripId}::uuid, 'boarding_pass',
                ${`${A}/sealed-object`}, 'image/jpeg', 2048,
                ${Buffer.alloc(60, 1)}, 'v1', ${Buffer.alloc(80, 2)}, 'uploaded')
        RETURNING id
      `;
      if (!row) throw new Error('The document fixture was not inserted.');
      documentId = row.id;
    });

    afterAll(async () => {
      await harness?.close();
    });

    it('B reading A’s documents by trip id gets nothing, even on A’s public trip', async () => {
      const asB = await harness.asUser(
        B,
        (tx) =>
          tx`SELECT id FROM documents WHERE trip_id = ${harness.accountA.publicTripId}::uuid`,
      );
      expect(asB).toHaveLength(0);

      // B can see the public trip itself — so the emptiness is the policy on
      // `documents`, not on `trips`.
      const trip = await harness.asUser(
        B,
        (tx) =>
          tx`SELECT id FROM trips WHERE id = ${harness.accountA.publicTripId}::uuid`,
      );
      expect(trip).toHaveLength(1);
    });

    it('B reading A’s document by its direct id gets nothing — not its key, not its object key', async () => {
      const asB = await harness.asUser(
        B,
        (tx) =>
          tx`SELECT storage_key, wrapped_dek FROM documents WHERE id = ${documentId}::uuid`,
      );
      expect(asB).toHaveLength(0);
    });

    it('B cannot even count A’s documents', async () => {
      const count = (userId: string) =>
        harness.asUser(
          userId,
          (tx) => tx<{ n: string }[]>`
            SELECT count(*)::text AS n FROM documents
            WHERE trip_id IN (${harness.accountA.publicTripId}::uuid,
                              ${harness.accountA.privateTripId}::uuid)
          `,
        );

      expect((await count(B))[0]?.n).toBe('0');
      expect((await count(A))[0]?.n).toBe('1');
    });

    it('B’s UPDATE and DELETE of A’s document touch nothing', async () => {
      const updated = await harness.asUser(
        B,
        (tx) => tx`
          UPDATE documents SET storage_key = 'hijacked', parsed_sealed = NULL
          WHERE id = ${documentId}::uuid RETURNING id
        `,
      );
      const deleted = await harness.asUser(
        B,
        (tx) => tx`DELETE FROM documents WHERE id = ${documentId}::uuid RETURNING id`,
      );

      expect(updated).toHaveLength(0);
      expect(deleted).toHaveLength(0);
      const [still] = await harness.owner<
        { storage_key: string; parsed_sealed: Buffer }[]
      >`
        SELECT storage_key, parsed_sealed FROM documents WHERE id = ${documentId}::uuid
      `;
      expect(still?.storage_key).toBe(`${A}/sealed-object`);
      expect(still?.parsed_sealed.equals(Buffer.alloc(80, 2))).toBe(true);
    });

    it('B cannot file a document under A’s trip', async () => {
      await expect(
        harness.asUser(
          B,
          (tx) => tx`
            INSERT INTO documents (trip_id, type, storage_key, content_type, byte_size,
                                   wrapped_dek, dek_key_id)
            VALUES (${harness.accountA.publicTripId}::uuid, 'other', 'planted',
                    'image/png', 1, ${Buffer.alloc(60)}, 'v1')
          `,
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('positive control: A sees A’s document', async () => {
      const asA = await harness.asUser(
        A,
        (tx) => tx`SELECT id FROM documents WHERE id = ${documentId}::uuid`,
      );
      expect(asA).toHaveLength(1);
    });
  });

  describe('over HTTP, through every document route', () => {
    let app: NestExpressApplication;
    let harness: Harness;
    let a: RegisteredTraveller;
    let b: RegisteredTraveller;
    let tripId: string;
    let image: Buffer;
    let document: Document;

    beforeAll(async () => {
      app = await bootTestApp();
      harness = await createHarness();
      a = await registerTraveller(app);
      b = await registerTraveller(app);
      tripId = await createTripFor(app, a, 'CHF', 'A’s trip');
      // Made public, so that B can reach the trip and still not the document.
      await request(app.getHttpServer())
        .patch(`/v1/trips/${tripId}`)
        .set(bearer(a.tokens.access_token))
        .send({ is_public: true });

      image = boardingPassJpeg(8_000);
      document = await uploadDocument(app, a, tripId, {
        content_base64: image.toString('base64'),
        parsed_json: PASS_FIELDS,
      });
    });

    afterAll(async () => {
      await harness?.close();
      await app?.close();
    });

    const asB = () => bearer(b.tokens.access_token);
    const server = () => request(app.getHttpServer());
    const ghost = '00000000-0000-4000-8000-00000000dead';

    /** Nothing A stored may appear in anything B is told. */
    function discloses(body: unknown): boolean {
      const text = JSON.stringify(body);
      return (
        text.includes(PASS_FIELDS.passenger_name) ||
        text.includes(PASS_FIELDS.flight_number) ||
        text.includes(image.toString('base64').slice(0, 64)) ||
        text.includes(PLAINTEXT_MARKER) ||
        text.includes(document.id)
      );
    }

    it('the list answers B exactly as for a trip that does not exist', async () => {
      const theirs = await server().get(`/v1/trips/${tripId}/documents`).set(asB());
      const nothing = await server().get(`/v1/trips/${ghost}/documents`).set(asB());

      expect(theirs.status).toBe(404);
      expect(theirs.body).toEqual(nothing.body);
      expect(theirs.body).toMatchObject({ error: { code: 'TRIP_NOT_FOUND' } });
      expect(discloses(theirs.body)).toBe(false);
    });

    it('the content answers B exactly as for a document that does not exist', async () => {
      const theirs = await server()
        .get(`/v1/documents/${document.id}/content`)
        .set(asB());
      const nothing = await server().get(`/v1/documents/${ghost}/content`).set(asB());

      expect(theirs.status).toBe(404);
      expect(theirs.body).toEqual(nothing.body);
      expect(theirs.body).toMatchObject({ error: { code: 'DOCUMENT_NOT_FOUND' } });
      expect(discloses(theirs.body)).toBe(false);
    });

    it('a guessed id is the same not-found', async () => {
      const guessed = await server()
        .get(`/v1/documents/${randomUUID()}/content`)
        .set(asB());
      const theirs = await server()
        .get(`/v1/documents/${document.id}/content`)
        .set(asB());

      expect(guessed.status).toBe(404);
      expect(guessed.body).toEqual(theirs.body);
    });

    it.each([
      ['a confirmation', { confirmed: true }],
      ['a correction', { parsed_json: { ...PASS_FIELDS, passenger_name: 'B WAS HERE' } }],
      ['a clear', { parsed_json: null }],
      ['a type change', { type: 'other' }],
    ])('PATCH answers %s from B as not-found', async (_name, body) => {
      const theirs = await server()
        .patch(`/v1/documents/${document.id}`)
        .set(asB())
        .send(body);
      const nothing = await server()
        .patch(`/v1/documents/${ghost}`)
        .set(asB())
        .send(body);

      expect(theirs.status).toBe(404);
      expect(theirs.body).toEqual(nothing.body);
    });

    it('DELETE answers B as not-found', async () => {
      const theirs = await server().delete(`/v1/documents/${document.id}`).set(asB());
      const nothing = await server().delete(`/v1/documents/${ghost}`).set(asB());

      expect(theirs.status).toBe(404);
      expect(theirs.body).toEqual(nothing.body);
    });

    it('B cannot file a document under A’s trip', async () => {
      const response = await server()
        .post(`/v1/trips/${tripId}/documents`)
        .set(asB())
        .send(uploadBody());

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'TRIP_NOT_FOUND' } });
    });

    it('B reusing A’s document id is refused without learning anything about it', async () => {
      const bTrip = await createTripFor(app, b, 'CHF', 'B’s trip');

      const response = await server()
        .post(`/v1/trips/${bTrip}/documents`)
        .set(asB())
        .send(uploadBody({ id: document.id }));

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: {
          code: 'DOCUMENT_ID_UNAVAILABLE',
          message: 'That document id is already in use. Please retry with a new id.',
        },
      });
    });

    it('B’s direct SELECT through the API role finds none of A’s document', async () => {
      const rows = await harness.asUser(
        b.tokens.user.id,
        (tx) => tx`SELECT id FROM documents WHERE id = ${document.id}::uuid`,
      );
      expect(rows).toHaveLength(0);
    });

    it('A’s document is exactly as A left it, and A still reads it', async () => {
      const listed = await server()
        .get(`/v1/trips/${tripId}/documents`)
        .set(bearer(a.tokens.access_token));
      const content = await server()
        .get(`/v1/documents/${document.id}/content`)
        .set(bearer(a.tokens.access_token));

      expect(listed.status).toBe(200);
      expect(DocumentsResponse.parse(listed.body).documents).toEqual([document]);
      expect(content.status).toBe(200);
      expect(DocumentContentResponse.parse(content.body).content_base64).toBe(
        image.toString('base64'),
      );
    });
  });
});
