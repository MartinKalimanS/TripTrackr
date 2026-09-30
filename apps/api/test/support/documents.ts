import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  DocumentResponse,
  type CreateDocumentInput,
  type Document,
  type DocumentParsedFields,
} from '@triptrackr/contracts';
import { randomBytes } from 'node:crypto';
import request from 'supertest';

import { bearer, type RegisteredTraveller } from './app';
import { requireEnv } from './env';

/**
 * Fixtures for the document suites (rest-api.md §6; research D-32, D-33):
 * images that are images as far as the API's signature check can tell, the
 * three fields a boarding pass yields, an upload through the real route, and a
 * direct line to the documents bucket in RustFS — the view of the adversary
 * FR-033 names, someone holding the store itself.
 */

export const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
export const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** Readable text inside the fixture image: if it shows up anywhere at rest, the seal failed. */
export const PLAINTEXT_MARKER = 'BOARDING PASS DESMARAIS/LUC AC834 PNR XK7Q2Z';

/** The fields the device's parser would extract from that pass (FR-035). */
export const PASS_FIELDS: DocumentParsedFields = {
  flight_number: 'AC834',
  flight_date: '2026-06-02',
  passenger_name: 'DESMARAIS/LUC',
};

/** A JPEG-signed image of about `bytes` bytes, carrying {@link PLAINTEXT_MARKER}. */
export function boardingPassJpeg(bytes = 4_096): Buffer {
  const head = Buffer.concat([
    JPEG_SIGNATURE,
    Buffer.from([0xe0]),
    Buffer.from(` JFIF ${PLAINTEXT_MARKER} `, 'ascii'),
  ]);
  const filler = randomBytes(Math.max(0, bytes - head.length - 2));

  return Buffer.concat([head, filler, Buffer.from([0xff, 0xd9])]);
}

/** A PNG-signed image. */
export function screenshotPng(bytes = 2_048): Buffer {
  return Buffer.concat([PNG_SIGNATURE, randomBytes(Math.max(0, bytes - 8))]);
}

/** An upload body, ready to send: a JPEG boarding pass unless told otherwise. */
export function uploadBody(
  overrides: Partial<CreateDocumentInput> = {},
): Record<string, unknown> {
  return {
    type: 'boarding_pass',
    content_type: 'image/jpeg',
    content_base64: boardingPassJpeg().toString('base64'),
    ...overrides,
  };
}

/** Uploads through `POST /trips/:tripId/documents` and insists on a 201. */
export async function uploadDocument(
  app: NestExpressApplication,
  traveller: RegisteredTraveller,
  tripId: string,
  overrides: Partial<CreateDocumentInput> = {},
): Promise<Document> {
  const response = await request(app.getHttpServer())
    .post(`/v1/trips/${tripId}/documents`)
    .set(bearer(traveller.tokens.access_token))
    .send(uploadBody(overrides));

  if (response.status !== 201) {
    throw new Error(
      `Document fixture failed: ${response.status} ${JSON.stringify(response.body)}`,
    );
  }

  return DocumentResponse.parse(response.body).document;
}

export interface DocumentsBucket {
  /** The stored bytes, or null when there is no such object. */
  read(storageKey: string): Promise<Buffer | null>;
  /** The object's declared Content-Type. */
  contentType(storageKey: string): Promise<string | undefined>;
  /** Every key under a prefix — `<ownerId>/` lists one traveller's objects. */
  keys(prefix: string): Promise<string[]>;
  close(): void;
}

/**
 * The documents bucket, read directly with the test credentials test/setup.ts
 * started RustFS with — around the API, as a credentialed reader would.
 */
export function documentsBucket(): DocumentsBucket {
  const bucket = requireEnv('S3_BUCKET_DOCUMENTS');
  const client = new S3Client({
    endpoint: requireEnv('S3_ENDPOINT'),
    region: requireEnv('S3_REGION'),
    forcePathStyle: true,
    credentials: {
      accessKeyId: requireEnv('S3_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('S3_SECRET_ACCESS_KEY'),
    },
  });

  return {
    async read(storageKey) {
      try {
        const object = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: storageKey }),
        );
        return object.Body ? Buffer.from(await object.Body.transformToByteArray()) : null;
      } catch (error: unknown) {
        if ((error as { name?: unknown }).name === 'NoSuchKey') return null;
        throw error;
      }
    },
    async contentType(storageKey) {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: storageKey }),
      );
      return head.ContentType;
    },
    async keys(prefix) {
      const listed = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }),
      );
      return (listed.Contents ?? []).flatMap((object) =>
        object.Key ? [object.Key] : [],
      );
    },
    close() {
      client.destroy();
    },
  };
}
