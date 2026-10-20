import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  PhotoResponse,
  PhotoUploadResponse,
  type Photo,
  type RegisterPhotoInput,
} from '@triptrackr/contracts';
import request from 'supertest';

import { bearer, type RegisteredTraveller } from './app';
import { requireEnv } from './env';
import { jpeg } from './images';

/**
 * Fixtures for the photo suites (tasks.md T107–T109; rest-api.md §5; research
 * D-34): the upload-URL, byte-upload, register-metadata sequence driven
 * through the real routes and a real signed PUT to RustFS, plus a direct line
 * to the photos bucket — the view of someone holding the store itself.
 *
 * Every step is its own function so a suite can stop between two of them: the
 * point of T109 is precisely what the API says when registration comes before
 * the bytes have landed.
 */

/** A small real JPEG — the worker can thumbnail it, and the API never looks inside. */
export function photoJpeg(width = 640, height = 480): Promise<Buffer> {
  return jpeg({ width, height });
}

/** `POST /trips/:tripId/photos/upload-url`, insisting on a 200. */
export async function requestUploadUrl(
  app: NestExpressApplication,
  traveller: RegisteredTraveller,
  tripId: string,
  contentType = 'image/jpeg',
): Promise<PhotoUploadResponse> {
  const response = await request(app.getHttpServer())
    .post(`/v1/trips/${tripId}/photos/upload-url`)
    .set(bearer(traveller.tokens.access_token))
    .send({ content_type: contentType });

  if (response.status !== 200) {
    throw new Error(
      `Upload-URL fixture failed: ${response.status} ${JSON.stringify(response.body)}`,
    );
  }

  return PhotoUploadResponse.parse(response.body);
}

/**
 * The device's byte upload: a PUT to the pre-signed URL with the type the URL
 * was signed for. Returns the store's status, so a suite can assert on a
 * refusal as well as insisting on success with {@link uploadBytes}.
 */
export async function putBytes(
  target: Pick<PhotoUploadResponse, 'upload_url'>,
  bytes: Buffer,
  contentType = 'image/jpeg',
): Promise<number> {
  const response = await fetch(target.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: new Uint8Array(bytes),
  });
  await response.arrayBuffer();

  return response.status;
}

/** {@link putBytes}, insisting on a 2xx. */
export async function uploadBytes(
  target: Pick<PhotoUploadResponse, 'upload_url'>,
  bytes: Buffer,
  contentType = 'image/jpeg',
): Promise<void> {
  const status = await putBytes(target, bytes, contentType);
  if (status < 200 || status >= 300) {
    throw new Error(`The byte-upload fixture was refused with ${status}.`);
  }
}

/** `POST /trips/:tripId/photos`, unasserted: the caller reads the status. */
export function registerRaw(
  app: NestExpressApplication,
  traveller: RegisteredTraveller,
  tripId: string,
  body: RegisterPhotoInput | Record<string, unknown>,
) {
  return request(app.getHttpServer())
    .post(`/v1/trips/${tripId}/photos`)
    .set(bearer(traveller.tokens.access_token))
    .send(body);
}

export interface UploadedPhoto {
  readonly photo: Photo;
  readonly storageKey: string;
  readonly bytes: Buffer;
}

/**
 * The whole sequence for a well-behaved device: a URL, the bytes, the
 * registration. Insists on a 201.
 */
export async function registerPhoto(
  app: NestExpressApplication,
  traveller: RegisteredTraveller,
  tripId: string,
  overrides: Omit<RegisterPhotoInput, 'storage_key'> = {},
  bytes?: Buffer,
): Promise<UploadedPhoto> {
  const image = bytes ?? (await photoJpeg());
  const target = await requestUploadUrl(app, traveller, tripId);
  await uploadBytes(target, image);

  const response = await registerRaw(app, traveller, tripId, {
    ...overrides,
    storage_key: target.storage_key,
  });
  if (response.status !== 201) {
    throw new Error(
      `Photo fixture failed: ${response.status} ${JSON.stringify(response.body)}`,
    );
  }

  return {
    photo: PhotoResponse.parse(response.body).photo,
    storageKey: target.storage_key,
    bytes: image,
  };
}

export interface PhotosBucket {
  /** The stored bytes, or null when there is no such object. */
  read(storageKey: string): Promise<Buffer | null>;
  /** The object's length, or null when there is no such object. */
  size(storageKey: string): Promise<number | null>;
  /** Every key under a prefix — `<ownerId>/` lists one traveller's objects. */
  keys(prefix: string): Promise<string[]>;
  /** Removes an object, as a lifecycle rule or an operator might. */
  remove(storageKey: string): Promise<void>;
  close(): void;
}

/**
 * The photos bucket, read directly with the test credentials test/setup.ts
 * started RustFS with — around the API, as a credentialed reader would.
 */
export function photosBucket(): PhotosBucket {
  const bucket = requireEnv('S3_BUCKET_PHOTOS');
  const client = new S3Client({
    endpoint: requireEnv('S3_ENDPOINT'),
    region: requireEnv('S3_REGION'),
    forcePathStyle: true,
    credentials: {
      accessKeyId: requireEnv('S3_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('S3_SECRET_ACCESS_KEY'),
    },
  });
  const isAbsent = (error: unknown): boolean => {
    const { name } = error as { name?: unknown };
    return name === 'NoSuchKey' || name === 'NotFound';
  };

  return {
    async read(storageKey) {
      try {
        const object = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: storageKey }),
        );
        return object.Body ? Buffer.from(await object.Body.transformToByteArray()) : null;
      } catch (error: unknown) {
        if (isAbsent(error)) return null;
        throw error;
      }
    },
    async size(storageKey) {
      try {
        const head = await client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: storageKey }),
        );
        return head.ContentLength ?? null;
      } catch (error: unknown) {
        if (isAbsent(error)) return null;
        throw error;
      }
    },
    async keys(prefix) {
      const listed = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }),
      );
      return (listed.Contents ?? []).flatMap((object) =>
        object.Key ? [object.Key] : [],
      );
    },
    async remove(storageKey) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }));
    },
    close() {
      client.destroy();
    },
  };
}
