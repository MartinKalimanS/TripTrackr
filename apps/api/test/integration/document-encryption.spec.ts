import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  DocumentContentResponse,
  DocumentsResponse,
  type Document,
} from '@triptrackr/contracts';
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
  JPEG_SIGNATURE,
  PASS_FIELDS,
  PLAINTEXT_MARKER,
  boardingPassJpeg,
  documentsBucket,
  uploadDocument,
  type DocumentsBucket,
} from '../support/documents';
import { createTripFor } from '../support/expenses';

/**
 * A document at rest is ciphertext (FR-033; research D-04, D-32, D-33) —
 * tasks.md T110.
 *
 * FR-033's adversary holds the underlying stores: a database dump, a bucket
 * credential. These tests take exactly that view — the row through the owner
 * connection, the object straight from RustFS with the test credentials — and
 * find nothing readable in either: not the image, not its signature, not the
 * passenger's name or the flight. Only the owner's own request through the API
 * gets the bytes and the fields back.
 *
 * The last test is the write-capable version of the same adversary: moving one
 * document's key and object onto another row does not make them open there.
 */

/** AES-256-GCM as EnvelopeService lays it out: nonce ‖ ciphertext ‖ tag. */
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/** What must not be readable at rest: the three fields, and the image's own text. */
const READABLE = [
  PASS_FIELDS.passenger_name,
  PASS_FIELDS.flight_number,
  PASS_FIELDS.flight_date,
  PLAINTEXT_MARKER,
];

/**
 * True when `bytes` holds any of {@link READABLE} as text — or as the lower-case
 * hex a dump prints a `bytea` column in, which is how plaintext in a binary
 * column would surface in `row_to_json`.
 */
function carriesReadable(bytes: Buffer): boolean {
  return READABLE.some((text) => {
    const plain = Buffer.from(text, 'utf8');
    return (
      bytes.includes(plain) || bytes.includes(Buffer.from(plain.toString('hex'), 'ascii'))
    );
  });
}

interface StoredRow {
  readonly storage_key: string;
  readonly wrapped_dek: Buffer;
  readonly dek_key_id: string;
  readonly parsed_sealed: Buffer | null;
}

describe('documents at rest are ciphertext (FR-033)', () => {
  let app: NestExpressApplication;
  let owner: Sql;
  let bucket: DocumentsBucket;
  let traveller: RegisteredTraveller;
  let image: Buffer;
  let document: Document;
  let row: StoredRow;

  beforeAll(async () => {
    app = await bootTestApp();
    owner = migrationSql();
    bucket = documentsBucket();
    traveller = await registerTraveller(app);
    const tripId = await createTripFor(app, traveller, 'CHF', 'Sealed trip');

    image = boardingPassJpeg(20_000);
    document = await uploadDocument(app, traveller, tripId, {
      content_base64: image.toString('base64'),
      parsed_json: PASS_FIELDS,
      confirmed: true,
    });

    const [stored] = await owner<StoredRow[]>`
      SELECT storage_key, wrapped_dek, dek_key_id, parsed_sealed
      FROM documents WHERE id = ${document.id}::uuid
    `;
    if (!stored) throw new Error('The uploaded document has no row.');
    row = stored;
  });

  afterAll(async () => {
    bucket?.close();
    await owner?.end();
    await app?.close();
  });

  const server = () => request(app.getHttpServer());

  it('keeps the key and the fields in the row as bytes naming neither the passenger nor the flight', async () => {
    // The key is wrapped (longer than a bare 32-byte DEK: nonce and tag), and
    // the fields are sealed.
    expect(Buffer.isBuffer(row.wrapped_dek)).toBe(true);
    expect(row.wrapped_dek.length).toBe(32 + NONCE_BYTES + TAG_BYTES);
    expect(Buffer.isBuffer(row.parsed_sealed)).toBe(true);
    expect(carriesReadable(row.parsed_sealed as Buffer)).toBe(false);
    expect(carriesReadable(row.wrapped_dek)).toBe(false);

    // The whole row as a dump would print it.
    const [dumped] = await owner<{ dump: string }[]>`
      SELECT row_to_json(d)::text AS dump FROM documents d WHERE d.id = ${document.id}::uuid
    `;
    expect(dumped?.dump).toBeDefined();
    expect(carriesReadable(Buffer.from(dumped?.dump ?? '', 'utf8'))).toBe(false);
  });

  it('keeps only ciphertext in the bucket: not the image, not its signature, not its text', async () => {
    const object = await bucket.read(row.storage_key);

    expect(object).not.toBeNull();
    const stored = object as Buffer;
    expect(stored.equals(image)).toBe(false);
    expect(stored.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)).toBe(false);
    expect(carriesReadable(stored)).toBe(false);
    expect(stored.length).toBe(image.length + NONCE_BYTES + TAG_BYTES);
    // Nor does the bucket learn what kind of file the ciphertext hides.
    expect(await bucket.contentType(row.storage_key)).toBe('application/octet-stream');
    // Server-chosen key under the owner's prefix, not derived from the document.
    expect(row.storage_key.startsWith(`${traveller.tokens.user.id}/`)).toBe(true);
    expect(row.storage_key).not.toContain(document.id);
  });

  it('gives the owner the original bytes back through GET /documents/:id/content', async () => {
    const response = await server()
      .get(`/v1/documents/${document.id}/content`)
      .set(bearer(traveller.tokens.access_token));

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const content = DocumentContentResponse.parse(response.body);
    expect(content.content_base64).toBe(image.toString('base64'));
    expect(Buffer.from(content.content_base64, 'base64').equals(image)).toBe(true);
  });

  it('gives the owner the fields back decrypted, and only through the API', async () => {
    const response = await server()
      .get(`/v1/trips/${document.trip_id}/documents`)
      .set(bearer(traveller.tokens.access_token));

    expect(response.status).toBe(200);
    const listed = DocumentsResponse.parse(response.body).documents;
    expect(listed.find((entry) => entry.id === document.id)?.parsed_json).toEqual(
      PASS_FIELDS,
    );
  });

  it('refuses a key and object moved onto another row, and fields moved with them', async () => {
    // A second traveller's own document — then the stores are rearranged under
    // it, as someone with write access to the database could.
    const attacker = await registerTraveller(app);
    const attackersTrip = await createTripFor(app, attacker);
    const decoy = await uploadDocument(app, attacker, attackersTrip, {
      parsed_json: PASS_FIELDS,
    });
    await owner`
      UPDATE documents
      SET storage_key = ${row.storage_key},
          wrapped_dek = ${row.wrapped_dek},
          dek_key_id = ${row.dek_key_id},
          parsed_sealed = ${row.parsed_sealed}
      WHERE id = ${decoy.id}::uuid
    `;
    const asAttacker = bearer(attacker.tokens.access_token);

    const content = await server()
      .get(`/v1/documents/${decoy.id}/content`)
      .set(asAttacker);
    const listed = await server()
      .get(`/v1/trips/${attackersTrip}/documents`)
      .set(asAttacker);

    // The key is bound to the victim's id: it does not unwrap for the decoy's.
    expect(content.status).toBe(500);
    expect(listed.status).toBe(500);
    expect(content.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong on our end. Please try again.',
      },
    });
    expect(JSON.stringify(listed.body)).not.toContain(PASS_FIELDS.passenger_name);
  });
});
