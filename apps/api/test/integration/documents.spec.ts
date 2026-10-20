import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  DocumentContentResponse,
  DocumentResponse,
  DocumentsResponse,
  MAX_DOCUMENT_BYTES,
  type Document,
} from '@triptrackr/contracts';
import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import request from 'supertest';

import {
  bearer,
  bootTestApp,
  registerTraveller,
  type RegisteredTraveller,
} from '../support/app';
import { migrationSql } from '../support/db';
import {
  PASS_FIELDS,
  boardingPassJpeg,
  documentsBucket,
  screenshotPng,
  uploadBody,
  uploadDocument,
  type DocumentsBucket,
} from '../support/documents';
import { createTripFor } from '../support/expenses';

/**
 * Documents through HTTP, against PostgreSQL and RustFS (rest-api.md §6;
 * FR-031..FR-035; research D-32, D-33) — tasks.md T114, T115.
 *
 * A traveller stores a boarding pass against a trip; the API seals it before
 * the bucket sees it and answers with metadata and the extracted fields, never
 * a key. A retried upload is the same upload. The fields are a proposal until
 * confirmed, and the traveller confirms, corrects or clears them by PATCH.
 * test/integration/document-encryption.spec.ts looks at what lands at rest;
 * test/privacy/documents.spec.ts at who else can reach it.
 */
describe('documents', () => {
  let app: NestExpressApplication;
  let owner: Sql;
  let bucket: DocumentsBucket;
  let traveller: RegisteredTraveller;
  let tripId: string;

  beforeAll(async () => {
    app = await bootTestApp();
    owner = migrationSql();
    bucket = documentsBucket();
    traveller = await registerTraveller(app);
    tripId = await createTripFor(app, traveller, 'CHF', 'Montréal, June');
  });

  afterAll(async () => {
    bucket?.close();
    await owner?.end();
    await app?.close();
  });

  const auth = () => bearer(traveller.tokens.access_token);
  const server = () => request(app.getHttpServer());
  const upload = (body: Record<string, unknown>) =>
    server().post(`/v1/trips/${tripId}/documents`).set(auth()).send(body);
  const objectsOf = (who: RegisteredTraveller) => bucket.keys(`${who.tokens.user.id}/`);

  async function rowOf(id: string) {
    const [row] = await owner<
      {
        content_type: string;
        byte_size: number;
        upload_state: string;
        storage_key: string;
        parsed_sealed: Buffer | null;
        parsed_confirmed_at: Date | null;
        deleted_at: Date | null;
      }[]
    >`
      SELECT content_type, byte_size, upload_state, storage_key, parsed_sealed,
             parsed_confirmed_at, deleted_at
      FROM documents WHERE id = ${id}::uuid
    `;
    return row;
  }

  describe('POST /trips/:tripId/documents (FR-031, FR-033)', () => {
    it('stores a boarding pass: 201, its metadata and proposed fields, no key and no storage key', async () => {
      const image = boardingPassJpeg(6_000);

      const response = await upload(
        uploadBody({
          content_base64: image.toString('base64'),
          parsed_json: PASS_FIELDS,
        }),
      );

      expect(response.status).toBe(201);
      // Strict: a storage key, a wrapped key or a visibility flag fails the parse.
      const { document } = DocumentResponse.parse(response.body);
      expect(document).toMatchObject({
        trip_id: tripId,
        type: 'boarding_pass',
        content_type: 'image/jpeg',
        byte_size: image.length,
        parsed_json: PASS_FIELDS,
        parsed_confirmed_at: null,
        upload_state: 'uploaded',
      });

      const row = await rowOf(document.id);
      expect(row).toMatchObject({
        content_type: 'image/jpeg',
        byte_size: image.length,
        upload_state: 'uploaded',
        parsed_confirmed_at: null,
      });
      expect(Buffer.isBuffer(row?.parsed_sealed)).toBe(true);
      expect(await bucket.read(row?.storage_key ?? '')).not.toBeNull();
    });

    it('honours a client id; a retried upload answers 200 with the stored document and writes no second object', async () => {
      const id = randomUUID();
      const body = uploadBody({ id, parsed_json: PASS_FIELDS });
      const before = (await objectsOf(traveller)).length;

      const first = await upload(body);
      const retry = await upload(body);

      expect(first.status).toBe(201);
      expect(retry.status).toBe(200);
      expect(DocumentResponse.parse(retry.body)).toEqual(
        DocumentResponse.parse(first.body),
      );
      expect((await objectsOf(traveller)).length).toBe(before + 1);
    });

    it('stores fields the traveller confirmed on the device as confirmed', async () => {
      const response = await upload(
        uploadBody({ parsed_json: PASS_FIELDS, confirmed: true }),
      );

      expect(response.status).toBe(201);
      const { document } = DocumentResponse.parse(response.body);
      expect(document.parsed_confirmed_at).not.toBeNull();
      expect((await rowOf(document.id))?.parsed_confirmed_at).not.toBeNull();
    });

    it('stores a PNG declared as PNG, and a booking without fields', async () => {
      const png = await upload(
        uploadBody({
          type: 'booking',
          content_type: 'image/png',
          content_base64: screenshotPng().toString('base64'),
        }),
      );

      expect(png.status).toBe(201);
      expect(DocumentResponse.parse(png.body).document).toMatchObject({
        type: 'booking',
        content_type: 'image/png',
        parsed_json: null,
      });
    });

    it('refuses bytes that are not the declared type as 422 VALIDATION_FAILED, storing nothing', async () => {
      const id = randomUUID();
      const before = (await objectsOf(traveller)).length;

      const response = await upload(uploadBody({ id, content_type: 'image/png' }));

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({
        error: {
          code: 'VALIDATION_FAILED',
          details: { issues: [{ path: 'content_base64' }] },
        },
      });
      expect(await rowOf(id)).toBeUndefined();
      expect((await objectsOf(traveller)).length).toBe(before);
    });

    it('refuses a document over MAX_DOCUMENT_BYTES as 413 DOCUMENT_TOO_LARGE, storing nothing', async () => {
      const id = randomUUID();
      const before = (await objectsOf(traveller)).length;

      const response = await upload(
        uploadBody({
          id,
          content_base64: boardingPassJpeg(MAX_DOCUMENT_BYTES + 1).toString('base64'),
        }),
      );

      expect(response.status).toBe(413);
      expect(response.body).toMatchObject({ error: { code: 'DOCUMENT_TOO_LARGE' } });
      expect(await rowOf(id)).toBeUndefined();
      expect((await objectsOf(traveller)).length).toBe(before);
    });

    it('refuses fields on a booking, and a confirmation of nothing, at the wire', async () => {
      const onBooking = await upload(
        uploadBody({ type: 'booking', parsed_json: PASS_FIELDS }),
      );
      const confirmsNothing = await upload(uploadBody({ confirmed: true }));

      expect(onBooking.status).toBe(400);
      expect(confirmsNothing.status).toBe(400);
      expect(onBooking.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    });

    it('refuses an id another traveller holds with 409, disclosing nothing and leaving no object behind', async () => {
      const stranger = await registerTraveller(app);
      const strangersTrip = await createTripFor(app, stranger);
      const id = randomUUID();
      await uploadDocument(app, stranger, strangersTrip, { id });
      const before = (await objectsOf(traveller)).length;

      const response = await upload(uploadBody({ id }));

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: {
          code: 'DOCUMENT_ID_UNAVAILABLE',
          message: 'That document id is already in use. Please retry with a new id.',
        },
      });
      expect((await objectsOf(traveller)).length).toBe(before);
    });

    it("refuses an upload onto someone else's trip with the trip's not-found", async () => {
      const stranger = await registerTraveller(app);

      const response = await server()
        .post(`/v1/trips/${tripId}/documents`)
        .set(bearer(stranger.tokens.access_token))
        .send(uploadBody());

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'TRIP_NOT_FOUND' } });
    });
  });

  describe('GET /trips/:tripId/documents', () => {
    it('lists live documents newest first, fields decrypted, never cached', async () => {
      const listTrip = await createTripFor(app, traveller, 'CHF', 'Listing trip');
      const older = await uploadDocument(app, traveller, listTrip, {
        parsed_json: PASS_FIELDS,
      });
      const newer = await uploadDocument(app, traveller, listTrip, {
        type: 'other',
        content_type: 'image/png',
        content_base64: screenshotPng().toString('base64'),
      });

      const response = await server().get(`/v1/trips/${listTrip}/documents`).set(auth());

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      const { documents } = DocumentsResponse.parse(response.body);
      expect(documents.map((document) => document.id)).toEqual([newer.id, older.id]);
      expect(documents[1]?.parsed_json).toEqual(PASS_FIELDS);
    });
  });

  describe('GET /documents/:id/content (FR-033)', () => {
    it('answers the original bytes, base64, with their type, marked no-store', async () => {
      const image = boardingPassJpeg(9_000);
      const document = await uploadDocument(app, traveller, tripId, {
        content_base64: image.toString('base64'),
      });

      const response = await server()
        .get(`/v1/documents/${document.id}/content`)
        .set(auth());

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(DocumentContentResponse.parse(response.body)).toEqual({
        id: document.id,
        content_type: 'image/jpeg',
        content_base64: image.toString('base64'),
      });
    });

    it('answers DOCUMENT_NOT_FOUND for an id that does not exist', async () => {
      const response = await server()
        .get(`/v1/documents/${randomUUID()}/content`)
        .set(auth());

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'DOCUMENT_NOT_FOUND' } });
    });
  });

  describe('PATCH /documents/:id — confirm, correct, clear (FR-035, Constitution IV)', () => {
    const corrected = { ...PASS_FIELDS, passenger_name: 'DESMARAIS/LUC MR' };

    async function proposed(): Promise<Document> {
      return uploadDocument(app, traveller, tripId, { parsed_json: PASS_FIELDS });
    }

    async function patch(id: string, body: Record<string, unknown>) {
      return server().patch(`/v1/documents/${id}`).set(auth()).send(body);
    }

    it('confirms the stored proposal', async () => {
      const document = await proposed();

      const response = await patch(document.id, { confirmed: true });

      expect(response.status).toBe(200);
      const after = DocumentResponse.parse(response.body).document;
      expect(after.parsed_json).toEqual(PASS_FIELDS);
      expect(after.parsed_confirmed_at).not.toBeNull();
    });

    it('replaces the proposal with a correction and clears any confirmation', async () => {
      const document = await proposed();
      await patch(document.id, { confirmed: true });

      const response = await patch(document.id, { parsed_json: corrected });

      const after = DocumentResponse.parse(response.body).document;
      expect(after.parsed_json).toEqual(corrected);
      expect(after.parsed_confirmed_at).toBeNull();
    });

    it('stores corrected fields sent with confirmed as confirmed', async () => {
      const document = await proposed();

      const response = await patch(document.id, {
        parsed_json: corrected,
        confirmed: true,
      });

      const after = DocumentResponse.parse(response.body).document;
      expect(after.parsed_json).toEqual(corrected);
      expect(after.parsed_confirmed_at).not.toBeNull();
    });

    it('clears the fields and the confirmation with parsed_json: null', async () => {
      const document = await uploadDocument(app, traveller, tripId, {
        parsed_json: PASS_FIELDS,
        confirmed: true,
      });

      const response = await patch(document.id, { parsed_json: null });

      expect(DocumentResponse.parse(response.body).document).toMatchObject({
        parsed_json: null,
        parsed_confirmed_at: null,
      });
      expect(await rowOf(document.id)).toMatchObject({
        parsed_sealed: null,
        parsed_confirmed_at: null,
      });
    });

    it('answers a confirmation with nothing stored as 409 DOCUMENT_NOTHING_TO_CONFIRM', async () => {
      const document = await uploadDocument(app, traveller, tripId);

      const response = await patch(document.id, { confirmed: true });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        error: { code: 'DOCUMENT_NOTHING_TO_CONFIRM' },
      });
    });

    it('refuses a type change that would strand fields as 422; clearing them in the same patch is fine', async () => {
      const document = await proposed();

      const stranded = await patch(document.id, { type: 'booking' });
      const cleared = await patch(document.id, { type: 'booking', parsed_json: null });

      expect(stranded.status).toBe(422);
      expect(stranded.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
      expect(cleared.status).toBe(200);
      expect(DocumentResponse.parse(cleared.body).document).toMatchObject({
        type: 'booking',
        parsed_json: null,
      });
    });

    it('refuses an empty patch and an unknown key', async () => {
      const document = await proposed();

      const empty = await patch(document.id, {});
      const smuggled = await patch(document.id, { trip_id: randomUUID() });

      expect(empty.status).toBe(400);
      expect(smuggled.status).toBe(400);
    });
  });

  describe('DELETE /documents/:id (FR-039)', () => {
    it('tombstones the document: gone from the list and the content route, kept as a row', async () => {
      const document = await uploadDocument(app, traveller, tripId);

      const deleted = await server().delete(`/v1/documents/${document.id}`).set(auth());
      expect(deleted.status).toBe(204);

      const listed = await server().get(`/v1/trips/${tripId}/documents`).set(auth());
      expect(
        DocumentsResponse.parse(listed.body).documents.map(
          (listedDocument) => listedDocument.id,
        ),
      ).not.toContain(document.id);
      const content = await server()
        .get(`/v1/documents/${document.id}/content`)
        .set(auth());
      expect(content.status).toBe(404);
      expect((await rowOf(document.id))?.deleted_at).not.toBeNull();

      const again = await server().delete(`/v1/documents/${document.id}`).set(auth());
      expect(again.status).toBe(404);
      expect(again.body).toMatchObject({ error: { code: 'DOCUMENT_NOT_FOUND' } });
    });
  });
});
