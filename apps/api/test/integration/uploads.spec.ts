import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  MAX_PHOTO_BYTES,
  PhotoResponse,
  PhotosResponse,
  PhotoUploadResponse,
} from '@triptrackr/contracts';
import type { Sql } from 'postgres';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { QUEUE_NAMES, queueToken } from '@/common/queue/queue.constants';
import { MEDIA_JOB } from '@/modules/photos/media-job';

import {
  bearer,
  bootTestApp,
  enqueuedJobs,
  registerTraveller,
  type RegisteredTraveller,
} from '../support/app';
import { migrationSql } from '../support/db';
import { requireEnv } from '../support/env';
import { createTripFor } from '../support/expenses';
import {
  photoJpeg,
  photosBucket,
  putBytes,
  registerRaw,
  requestUploadUrl,
  uploadBytes,
  type PhotosBucket,
} from '../support/photos';

/**
 * The upload sequence: upload URL, byte upload, register metadata
 * (rest-api.md §5; FR-041; research D-12, D-34) — tasks.md T109.
 *
 * FR-041's obligation is that a record is not "saved" until its bytes are
 * uploaded. On the server that is one rule with two halves, both pinned here
 * against the real routes, a real signed PUT to RustFS and a real PostgreSQL:
 *
 *   - **The row appears only when the object store confirms the object.** The
 *     API never writes a photo in any state but `uploaded`; a registration
 *     that arrives first — the bytes not sent, not finished, or already gone —
 *     is refused with 409 and leaves NO row (not a `pending` one, not a
 *     `failed` one), so the gallery never lists a record whose original is
 *     not in the bucket. The same request repeated once the bytes have landed
 *     succeeds: `upload_state` goes from "no such row" to `uploaded` and
 *     nothing in between is ever stored.
 *   - **The key is the API's.** The upload URL is signed for a key the server
 *     chose under the caller's own prefix; a registration naming any other is
 *     refused before the bucket is asked, and one naming an object over the
 *     ceiling deletes that object.
 *
 * Every refusal is followed by the request that should now succeed, so a
 * refusal that merely breaks the route does not pass as a guard.
 */
describe('photo uploads — a record is not clean until the object store confirms (FR-041)', () => {
  let app: NestExpressApplication;
  let owner: Sql;
  let bucket: PhotosBucket;
  let traveller: RegisteredTraveller;
  let stranger: RegisteredTraveller;
  let tripId: string;
  let image: Buffer;

  beforeAll(async () => {
    app = await bootTestApp();
    owner = migrationSql();
    bucket = photosBucket();
    traveller = await registerTraveller(app);
    stranger = await registerTraveller(app);
    tripId = await createTripFor(app, traveller, 'CHF', 'Upload trip');
    image = await photoJpeg();
  });

  afterAll(async () => {
    bucket?.close();
    await owner?.end();
    await app?.close();
  });

  const server = () => request(app.getHttpServer());
  const auth = () => bearer(traveller.tokens.access_token);
  const register = (body: Record<string, unknown>) =>
    registerRaw(app, traveller, tripId, body);

  interface StoredPhoto {
    readonly id: string;
    readonly upload_state: string;
    readonly moderation_state: string;
    readonly is_public: boolean;
    readonly thumb_key: string | null;
  }

  /** Every row (tombstones included) naming this object, read around RLS. */
  const rowsFor = (storageKey: string) =>
    owner<StoredPhoto[]>`
      SELECT id, upload_state, moderation_state, is_public, thumb_key
      FROM photos WHERE storage_key = ${storageKey}
    `;

  const mediaJobs = () => enqueuedJobs(app, QUEUE_NAMES.media);
  const mediaJobsFor = (photoId: string) =>
    mediaJobs().filter((job) => (job.data as { photo_id?: string }).photo_id === photoId);

  describe('step 1 — the upload URL', () => {
    it('signs a PUT for a key the server chose under the caller’s own prefix', async () => {
      const response = await server()
        .post(`/v1/trips/${tripId}/photos/upload-url`)
        .set(auth())
        .send({ content_type: 'image/jpeg' });

      expect(response.status).toBe(200);
      const target = PhotoUploadResponse.parse(response.body);
      expect(target.storage_key.startsWith(`${traveller.tokens.user.id}/`)).toBe(true);
      expect(target.expires_in_seconds).toBeGreaterThan(0);
      const url = new URL(target.upload_url);
      expect(url.origin).toBe(new URL(requireEnv('S3_ENDPOINT')).origin);
      expect(url.pathname).toBe(
        `/${requireEnv('S3_BUCKET_PHOTOS')}/${target.storage_key}`,
      );
      expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
    });

    it('stores nothing: no row, no object, no job — and a fresh key on every call', async () => {
      const before = mediaJobs().length;

      const first = await requestUploadUrl(app, traveller, tripId);
      const second = await requestUploadUrl(app, traveller, tripId);

      expect(second.storage_key).not.toBe(first.storage_key);
      expect(await rowsFor(first.storage_key)).toHaveLength(0);
      expect(await bucket.size(first.storage_key)).toBeNull();
      expect(mediaJobs()).toHaveLength(before);
    });

    it.each(['image/gif', 'image/heic', 'application/pdf', 'text/html'])(
      'refuses to sign for %s',
      async (contentType) => {
        const response = await server()
          .post(`/v1/trips/${tripId}/photos/upload-url`)
          .set(auth())
          .send({ content_type: contentType });

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
      },
    );

    it('the signed URL accepts the bytes: the store, not the API, holds them', async () => {
      const target = await requestUploadUrl(app, traveller, tripId);

      expect(await putBytes(target, image)).toBe(200);

      expect((await bucket.read(target.storage_key))?.equals(image)).toBe(true);
      // Uploaded is not registered: the bucket holds bytes, the database no row.
      expect(await rowsFor(target.storage_key)).toHaveLength(0);
    });
  });

  describe('step 3 — registration is clean only once the bytes are confirmed', () => {
    it('refuses a registration that comes before the bytes, leaving no row of any state', async () => {
      const target = await requestUploadUrl(app, traveller, tripId);
      const jobs = mediaJobs().length;

      const early = await register({ storage_key: target.storage_key });

      expect(early.status).toBe(409);
      expect(early.body).toEqual({
        error: {
          code: 'PHOTO_UPLOAD_MISSING',
          message:
            'The photo has not finished uploading. Please upload it and try again.',
        },
      });
      expect(await rowsFor(target.storage_key)).toHaveLength(0);
      expect(mediaJobs()).toHaveLength(jobs);
    });

    it('takes the same registration once the bytes land: upload_state goes straight to uploaded', async () => {
      const target = await requestUploadUrl(app, traveller, tripId);
      const early = await register({ storage_key: target.storage_key });
      expect(early.status).toBe(409);

      await uploadBytes(target, image);
      const registered = await register({ storage_key: target.storage_key });

      expect(registered.status).toBe(201);
      const { photo } = PhotoResponse.parse(registered.body);
      expect(photo).toMatchObject({
        trip_id: tripId,
        upload_state: 'uploaded',
        // Private and unscreened, whatever the request said (FR-052, FR-056).
        is_public: false,
        moderation_state: 'pending',
        // The worker has not run: no thumbnail is claimed before one exists.
        has_thumbnail: false,
        thumbnail_url: null,
      });
      expect(await rowsFor(target.storage_key)).toEqual([
        {
          id: photo.id,
          upload_state: 'uploaded',
          moderation_state: 'pending',
          is_public: false,
          thumb_key: null,
        },
      ]);
    });

    it('hands the registered photo to the media worker exactly once', async () => {
      const target = await requestUploadUrl(app, traveller, tripId);
      await uploadBytes(target, image);

      const registered = await register({ storage_key: target.storage_key });

      const { photo } = PhotoResponse.parse(registered.body);
      expect(mediaJobsFor(photo.id)).toEqual([
        {
          name: MEDIA_JOB.name,
          data: { photo_id: photo.id },
          opts: { jobId: photo.id, delay: MEDIA_JOB.delayMs, removeOnComplete: true },
        },
      ]);
    });

    it('lists the registered photo as uploaded, and never one that is not', async () => {
      const unregistered = await requestUploadUrl(app, traveller, tripId);
      await uploadBytes(unregistered, image);
      const target = await requestUploadUrl(app, traveller, tripId);
      await uploadBytes(target, image);
      const { photo } = PhotoResponse.parse(
        (await register({ storage_key: target.storage_key })).body,
      );

      const listed = await server().get(`/v1/trips/${tripId}/photos`).set(auth());

      expect(listed.status).toBe(200);
      const photos = PhotosResponse.parse(listed.body).photos;
      expect(photos.find((entry) => entry.id === photo.id)?.upload_state).toBe(
        'uploaded',
      );
      expect(photos.every((entry) => entry.upload_state === 'uploaded')).toBe(true);
      // Bytes with no registration are not in the gallery.
      expect(await rowsFor(unregistered.storage_key)).toHaveLength(0);
    });

    it('treats an object with no bytes as not uploaded', async () => {
      const target = await requestUploadUrl(app, traveller, tripId);
      expect(await putBytes(target, Buffer.alloc(0))).toBe(200);

      const empty = await register({ storage_key: target.storage_key });

      expect(empty.status).toBe(409);
      expect(empty.body).toMatchObject({ error: { code: 'PHOTO_UPLOAD_MISSING' } });
      expect(await rowsFor(target.storage_key)).toHaveLength(0);

      // The same key, once real bytes replace the empty ones.
      await uploadBytes(target, image);
      expect((await register({ storage_key: target.storage_key })).status).toBe(201);
    });

    it('refuses an own-prefix key that was never signed, without a row', async () => {
      const invented = `${traveller.tokens.user.id}/${randomUUID()}`;

      const response = await register({ storage_key: invented });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ error: { code: 'PHOTO_UPLOAD_MISSING' } });
      expect(await rowsFor(invented)).toHaveLength(0);
    });

    it('refuses an object that landed and was removed before registration', async () => {
      const target = await requestUploadUrl(app, traveller, tripId);
      await uploadBytes(target, image);
      await bucket.remove(target.storage_key);

      const response = await register({ storage_key: target.storage_key });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ error: { code: 'PHOTO_UPLOAD_MISSING' } });
      expect(await rowsFor(target.storage_key)).toHaveLength(0);
    });

    it('rolls the registration back when the media worker cannot be told, so the retry finds no half-saved photo', async () => {
      const target = await requestUploadUrl(app, traveller, tripId);
      await uploadBytes(target, image);
      const queue = app.get<{ add: (...args: unknown[]) => Promise<unknown> }>(
        queueToken(QUEUE_NAMES.media),
        { strict: false },
      );
      const add = jest.spyOn(queue, 'add').mockRejectedValueOnce(new Error('redis down'));

      const refused = await register({ storage_key: target.storage_key });
      add.mockRestore();

      expect(refused.status).toBe(503);
      expect(refused.body).toMatchObject({
        error: { code: 'PHOTO_REGISTRATION_UNAVAILABLE' },
      });
      // The row was inserted before the enqueue and rolled back with the 5xx.
      expect(await rowsFor(target.storage_key)).toHaveLength(0);

      const retried = await register({ storage_key: target.storage_key });
      expect(retried.status).toBe(201);
      expect(await rowsFor(target.storage_key)).toHaveLength(1);
    });
  });

  describe('the key belongs to the API and to the caller', () => {
    it('refuses another traveller’s key with 422 before the bucket is asked, and their upload stays theirs', async () => {
      const strangersTrip = await createTripFor(app, stranger, 'CHF', 'Stranger’s trip');
      const theirs = await requestUploadUrl(app, stranger, strangersTrip);
      await uploadBytes(theirs, image);

      const claim = await register({ storage_key: theirs.storage_key });

      expect(claim.status).toBe(422);
      expect(claim.body).toMatchObject({
        error: {
          code: 'VALIDATION_FAILED',
          details: { issues: [{ path: 'storage_key' }] },
        },
      });
      expect(await rowsFor(theirs.storage_key)).toHaveLength(0);
      expect(await bucket.size(theirs.storage_key)).toBe(image.length);

      // The refusal did not consume the key: its owner registers it.
      const owned = await registerRaw(app, stranger, strangersTrip, {
        storage_key: theirs.storage_key,
      });
      expect(owned.status).toBe(201);
    });

    it.each([
      ['a path traversal', '../../etc/passwd'],
      ['a key with no object part', `${randomUUID()}`],
      ['a thumbnail key', `${randomUUID()}/${randomUUID()}.thumb.jpg`],
      ['a key with a third segment', `${randomUUID()}/${randomUUID()}/${randomUUID()}`],
    ])('refuses %s as a malformed key with 400', async (_name, storageKey) => {
      const response = await register({ storage_key: storageKey });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
      expect(await rowsFor(storageKey)).toHaveLength(0);
    });

    it('refuses a registration onto a trip that is not the caller’s, whatever the key', async () => {
      const target = await requestUploadUrl(app, traveller, tripId);
      await uploadBytes(target, image);
      const strangersTrip = await createTripFor(app, stranger, 'CHF', 'Not yours');

      const response = await registerRaw(app, traveller, strangersTrip, {
        storage_key: target.storage_key,
      });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'TRIP_NOT_FOUND' } });
      expect(await rowsFor(target.storage_key)).toHaveLength(0);
    });
  });

  describe('the size ceiling is measured on the stored object', () => {
    /** One byte over — the object store is asked, not the client's word. */
    let oversize: Buffer;

    beforeAll(() => {
      oversize = Buffer.alloc(MAX_PHOTO_BYTES + 1, 0x5a);
    });

    it('deletes an object over MAX_PHOTO_BYTES and answers 413 PHOTO_TOO_LARGE, leaving no row', async () => {
      const target = await requestUploadUrl(app, traveller, tripId);
      await uploadBytes(target, oversize);
      expect(await bucket.size(target.storage_key)).toBe(oversize.length);

      const response = await register({ storage_key: target.storage_key });

      expect(response.status).toBe(413);
      expect(response.body).toMatchObject({ error: { code: 'PHOTO_TOO_LARGE' } });
      expect(await rowsFor(target.storage_key)).toHaveLength(0);
      expect(await bucket.size(target.storage_key)).toBeNull();
    });

    it('never deletes bytes a registered photo points at: a replayed oversize PUT is refused as a reuse', async () => {
      const target = await requestUploadUrl(app, traveller, tripId);
      await uploadBytes(target, image);
      const first = await register({ storage_key: target.storage_key });
      expect(first.status).toBe(201);

      // A signed PUT can be replayed until it expires: the original is replaced.
      await uploadBytes(target, oversize);
      const again = await register({
        id: randomUUID(),
        storage_key: target.storage_key,
      });

      expect(again.status).toBe(409);
      expect(again.body).toMatchObject({ error: { code: 'PHOTO_UPLOAD_REUSED' } });
      expect(await bucket.size(target.storage_key)).toBe(oversize.length);
      expect(await rowsFor(target.storage_key)).toHaveLength(1);
    });
  });

  describe('retries', () => {
    it('answers a retried registration with the stored photo — 200, one row, one job', async () => {
      const target = await requestUploadUrl(app, traveller, tripId);
      await uploadBytes(target, image);
      const id = randomUUID();

      const first = await register({ id, storage_key: target.storage_key });
      const retry = await register({ id, storage_key: target.storage_key });

      expect(first.status).toBe(201);
      expect(retry.status).toBe(200);
      expect(PhotoResponse.parse(retry.body).photo).toEqual(
        PhotoResponse.parse(first.body).photo,
      );
      expect(await rowsFor(target.storage_key)).toHaveLength(1);
      expect(mediaJobsFor(id)).toHaveLength(1);
    });

    it('does not let a second photo claim an object a live photo already names', async () => {
      const target = await requestUploadUrl(app, traveller, tripId);
      await uploadBytes(target, image);
      expect((await register({ storage_key: target.storage_key })).status).toBe(201);

      const claim = await register({ id: randomUUID(), storage_key: target.storage_key });
      const anonymous = await register({ storage_key: target.storage_key });

      for (const response of [claim, anonymous]) {
        expect(response.status).toBe(409);
        expect(response.body).toMatchObject({ error: { code: 'PHOTO_UPLOAD_REUSED' } });
      }
      expect(await rowsFor(target.storage_key)).toHaveLength(1);
      expect(await bucket.size(target.storage_key)).toBe(image.length);
    });
  });
});
