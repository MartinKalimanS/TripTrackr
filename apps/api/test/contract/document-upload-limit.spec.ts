import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  ApiError,
  DocumentContentResponse,
  DocumentResponse,
  MAX_DOCUMENT_BYTES,
} from '@triptrackr/contracts';
import request from 'supertest';

import { DOCUMENT_BODY_LIMIT } from '@/app.setup';

import {
  bearer,
  bootTestApp,
  registerTraveller,
  type RegisteredTraveller,
} from '../support/app';
import { boardingPassJpeg, uploadBody } from '../support/documents';
import { createTripFor } from '../support/expenses';

/**
 * "The upload route alone accepts a JSON body above the 1 MB limit — just enough
 * for MAX_DOCUMENT_BYTES in base64" (rest-api.md §6 contract obligations;
 * research D-32) — tasks.md T114.
 *
 * Against the real stack: a ~9 MB boarding-pass photo is stored and read back
 * whole, a document past the ceiling is `413 DOCUMENT_TOO_LARGE` at any size,
 * and every other route — the other document routes included — still refuses a
 * body over a megabyte. test/unit/document-upload-limit.spec.ts holds the same
 * line without Docker.
 */
describe('contract — the document upload route’s body limit', () => {
  let app: NestExpressApplication;
  let traveller: RegisteredTraveller;
  let tripId: string;

  beforeAll(async () => {
    app = await bootTestApp();
    traveller = await registerTraveller(app);
    tripId = await createTripFor(app, traveller, 'CHF', 'Large scans');
  });

  afterAll(async () => {
    await app?.close();
  });

  const auth = () => bearer(traveller.tokens.access_token);
  const server = () => request(app.getHttpServer());
  const megabytePlus = { padding: 'x'.repeat(1_100_000) };

  it('stores a ~9 MB document and gives the same bytes back', async () => {
    const image = boardingPassJpeg(9 * 1024 * 1024);

    const created = await server()
      .post(`/v1/trips/${tripId}/documents`)
      .set(auth())
      .send(uploadBody({ content_base64: image.toString('base64') }));

    expect(created.status).toBe(201);
    const { document } = DocumentResponse.parse(created.body);
    expect(document.byte_size).toBe(image.length);

    const content = await server()
      .get(`/v1/documents/${document.id}/content`)
      .set(auth());
    expect(content.status).toBe(200);
    expect(DocumentContentResponse.parse(content.body).content_base64).toBe(
      image.toString('base64'),
    );
  });

  it('refuses a document one byte past MAX_DOCUMENT_BYTES as 413 DOCUMENT_TOO_LARGE', async () => {
    const response = await server()
      .post(`/v1/trips/${tripId}/documents`)
      .set(auth())
      .send(
        uploadBody({
          content_base64: boardingPassJpeg(MAX_DOCUMENT_BYTES + 1).toString('base64'),
        }),
      );

    expect(response.status).toBe(413);
    expect(ApiError.safeParse(response.body).success).toBe(true);
    expect(response.body).toMatchObject({ error: { code: 'DOCUMENT_TOO_LARGE' } });
  });

  it('refuses a body past the route’s own limit with the same 413', async () => {
    const response = await server()
      .post(`/v1/trips/${tripId}/documents`)
      .set(auth())
      .send({ padding: 'x'.repeat(DOCUMENT_BODY_LIMIT) });

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ error: { code: 'DOCUMENT_TOO_LARGE' } });
  });

  it('keeps the megabyte on another route', async () => {
    const response = await server()
      .post(`/v1/trips/${tripId}/notes`)
      .set(auth())
      .send(megabytePlus);

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
  });

  it('keeps the megabyte on the other document routes', async () => {
    const document = await server()
      .post(`/v1/trips/${tripId}/documents`)
      .set(auth())
      .send(uploadBody());
    const { id } = DocumentResponse.parse(document.body).document;

    const patched = await server()
      .patch(`/v1/documents/${id}`)
      .set(auth())
      .send(megabytePlus);

    expect(patched.status).toBe(413);
    expect(patched.body).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
  });
});
