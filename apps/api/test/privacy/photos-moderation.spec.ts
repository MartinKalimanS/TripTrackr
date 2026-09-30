import type { NestExpressApplication } from '@nestjs/platform-express';
import { PhotosResponse, PhotoOriginalResponse, type Photo } from '@triptrackr/contracts';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { StorageService } from '@/common/storage/storage.service';
import { processPhoto } from '@/workers/media.processor';
import { FailClosedPhotoScreening } from '@/workers/photo-screening';

import {
  bearer,
  bootTestApp,
  registerTraveller,
  type RegisteredTraveller,
} from '../support/app';
import { requireEnv } from '../support/env';
import { createTripFor } from '../support/expenses';
import {
  photoJpeg,
  photosBucket,
  registerPhoto,
  registerRaw,
  requestUploadUrl,
  uploadBytes,
  type PhotosBucket,
} from '../support/photos';
import { CITY, createHarness, type Harness } from '../integration/harness';

/**
 * Adversarial suite row 6 — B reads A's pending-moderation photo by every
 * available route, even one A set public on a public trip
 * (contracts/data-access-policy.md §4; FR-056, SC-014) — tasks.md T108, photo
 * half.
 *
 * Written as B, against A, twice over, as the document rows are:
 *
 *   - **At the database, through the API role.** The authority.
 *     `photos_public_read` (0005) admits a stranger to a photo only when the
 *     photo is public AND `approved` AND on a public, live trip. Every fixture
 *     below is one predicate short of that, and one is not — so "empty" cannot
 *     be mistaken for "the policy denies everything".
 *   - **Over HTTP, through every route the story ships**: the list, the
 *     original, a thumbnail URL, the patch, the delete, a guessed id, the
 *     upload URL and a registration onto A's trip, and a reuse of A's photo id.
 *     Each answers B exactly as it answers a request for something that does
 *     not exist — the same status, the same body — and A's photo is untouched
 *     afterwards.
 *
 * The signed URLs get their own test: a signed GET is a bearer capability with
 * no authorisation behind it, so what protects it is that B is never told one,
 * and that an unsigned or altered URL opens nothing.
 */
describe('privacy — a pending photo is unreachable by any route but the owner’s (row 6)', () => {
  describe('at the database, as the API role', () => {
    let harness: Harness;
    let A: string;
    let B: string;

    const ids: Record<
      'pending' | 'rejected' | 'unpublished' | 'privateTrip' | 'tombstoned' | 'visible',
      string
    > = {
      pending: '',
      rejected: '',
      unpublished: '',
      privateTrip: '',
      tombstoned: '',
      visible: '',
    };

    beforeAll(async () => {
      harness = await createHarness();
      A = harness.accountA.id;
      B = harness.accountB.id;

      const insert = async (
        tripId: string,
        label: string,
        state: {
          isPublic: boolean;
          moderation: 'pending' | 'approved' | 'rejected';
          deleted?: boolean;
        },
      ): Promise<string> => {
        const [row] = await harness.owner<{ id: string }[]>`
          INSERT INTO photos (trip_id, storage_key, thumb_key, is_public,
                              moderation_state, upload_state, deleted_at)
          VALUES (${tripId}::uuid, ${`${A}/${label}`}, ${`${A}/${label}.thumb.jpg`},
                  ${state.isPublic}, ${state.moderation}, 'uploaded',
                  ${state.deleted ? new Date() : null})
          RETURNING id
        `;
        if (!row) throw new Error(`The ${label} fixture was not inserted.`);
        return row.id;
      };
      const publicTrip = harness.accountA.publicTripId;

      // The row the task is about: public, on a public trip, unscreened.
      ids.pending = await insert(publicTrip, 'pending', {
        isPublic: true,
        moderation: 'pending',
      });
      // One predicate short each: screened out, not published, trip private,
      // tombstoned.
      ids.rejected = await insert(publicTrip, 'rejected', {
        isPublic: true,
        moderation: 'rejected',
      });
      ids.unpublished = await insert(publicTrip, 'unpublished', {
        isPublic: false,
        moderation: 'approved',
      });
      ids.privateTrip = await insert(harness.accountA.privateTripId, 'private-trip', {
        isPublic: true,
        moderation: 'approved',
      });
      ids.tombstoned = await insert(publicTrip, 'tombstoned', {
        isPublic: true,
        moderation: 'approved',
        deleted: true,
      });
      // The control: every predicate met.
      ids.visible = await insert(publicTrip, 'visible', {
        isPublic: true,
        moderation: 'approved',
      });
    });

    afterAll(async () => {
      await harness?.close();
    });

    const idsOf = (rows: readonly { id: string }[]) => rows.map((row) => row.id).sort();

    it('B reading A’s photos by trip id gets only the one photo that meets every predicate — never the pending one', async () => {
      const asB = await harness.asUser(
        B,
        (tx) =>
          tx<{ id: string }[]>`
            SELECT id FROM photos WHERE trip_id = ${harness.accountA.publicTripId}::uuid
          `,
      );
      const trip = await harness.asUser(
        B,
        (tx) =>
          tx`SELECT id FROM trips WHERE id = ${harness.accountA.publicTripId}::uuid`,
      );

      // B reads the trip, so the missing rows are the photo policy's doing.
      expect(trip).toHaveLength(1);
      expect(idsOf(asB)).toEqual([ids.visible]);
      expect(idsOf(asB)).not.toContain(ids.pending);
    });

    it('B reading the pending photo by its direct id gets nothing — not its keys, not its position', async () => {
      const asB = await harness.asUser(
        B,
        (tx) => tx`
          SELECT storage_key, thumb_key, exif_lat, exif_lng, taken_at
          FROM photos WHERE id = ${ids.pending}::uuid
        `,
      );

      expect(asB).toHaveLength(0);
    });

    it.each(['rejected', 'unpublished', 'privateTrip', 'tombstoned'] as const)(
      'B reading A’s %s photo gets nothing: one predicate short of public is not public',
      async (name) => {
        const asB = await harness.asUser(
          B,
          (tx) => tx`SELECT id FROM photos WHERE id = ${ids[name]}::uuid`,
        );

        expect(asB).toHaveLength(0);
      },
    );

    it('B cannot even count A’s photos beyond the one that is public', async () => {
      const count = (userId: string) =>
        harness.asUser(
          userId,
          (tx) => tx<{ n: string }[]>`
            SELECT count(*)::text AS n FROM photos
            WHERE trip_id IN (${harness.accountA.publicTripId}::uuid,
                              ${harness.accountA.privateTripId}::uuid)
          `,
        );

      expect((await count(B))[0]?.n).toBe('1');
      // Owner policy: every row of the owner's trips, tombstones included.
      expect((await count(A))[0]?.n).toBe('6');
    });

    it('B’s UPDATE and DELETE of A’s photos touch nothing — the pending one, and the public one B can read', async () => {
      const attempts = [ids.pending, ids.visible];

      for (const id of attempts) {
        const updated = await harness.asUser(
          B,
          (tx) => tx`
            UPDATE photos SET is_public = false, moderation_state = 'approved',
                              storage_key = 'hijacked'
            WHERE id = ${id}::uuid RETURNING id
          `,
        );
        const deleted = await harness.asUser(
          B,
          (tx) => tx`DELETE FROM photos WHERE id = ${id}::uuid RETURNING id`,
        );

        expect(updated).toHaveLength(0);
        expect(deleted).toHaveLength(0);
      }

      const [still] = await harness.owner<
        { storage_key: string; is_public: boolean; moderation_state: string }[]
      >`
        SELECT storage_key, is_public, moderation_state
        FROM photos WHERE id = ${ids.pending}::uuid
      `;
      expect(still).toEqual({
        storage_key: `${A}/pending`,
        is_public: true,
        moderation_state: 'pending',
      });
    });

    it('B cannot file a photo under A’s trip, public or not', async () => {
      for (const tripId of [
        harness.accountA.publicTripId,
        harness.accountA.privateTripId,
      ]) {
        await expect(
          harness.asUser(
            B,
            (tx) => tx`
              INSERT INTO photos (trip_id, storage_key, upload_state)
              VALUES (${tripId}::uuid, 'planted', 'uploaded')
            `,
          ),
        ).rejects.toThrow(/row-level security/i);
      }
    });

    it('positive control: A sees every one of A’s photos, the pending one included', async () => {
      const asA = await harness.asUser(
        A,
        (tx) => tx<{ id: string }[]>`
          SELECT id FROM photos WHERE id IN (${ids.pending}::uuid, ${ids.rejected}::uuid)
        `,
      );

      expect(idsOf(asA)).toEqual([ids.pending, ids.rejected].sort());
    });
  });

  describe('over HTTP, through every photo route', () => {
    let app: NestExpressApplication;
    let harness: Harness;
    let bucket: PhotosBucket;
    let a: RegisteredTraveller;
    let b: RegisteredTraveller;
    let tripId: string;
    let photo: Photo;
    let storageKey: string;
    let thumbnailKey: string;
    let thumbnailUrl: string;
    let originalBytes: Buffer;

    beforeAll(async () => {
      app = await bootTestApp();
      harness = await createHarness();
      bucket = photosBucket();
      a = await registerTraveller(app);
      b = await registerTraveller(app);
      tripId = await createTripFor(app, a, 'CHF', 'A’s trip');
      // Made public, so that B can reach the trip and still not the photo.
      await request(app.getHttpServer())
        .patch(`/v1/trips/${tripId}`)
        .set(bearer(a.tokens.access_token))
        .send({ is_public: true });

      const registered = await registerPhoto(app, a, tripId, {
        city_id: CITY.paris,
        taken_at: '2026-06-02T10:00:00.000Z',
        exif_lat: 48.8566,
        exif_lng: 2.3522,
      });
      storageKey = registered.storageKey;
      thumbnailKey = `${storageKey}.thumb.jpg`;
      originalBytes = registered.bytes;

      // A sets it public — on a public trip. Moderation is still pending.
      const patched = await request(app.getHttpServer())
        .patch(`/v1/photos/${registered.photo.id}`)
        .set(bearer(a.tokens.access_token))
        .send({ is_public: true });
      if (patched.status !== 200) throw new Error('The photo fixture was not published.');

      // The media worker, as the process runs it: the API role with no traveller
      // identity, reaching the photo through its keyholes. It leaves the photo
      // pending (research D-34) and gives it a thumbnail to sign.
      await processPhoto(
        { photo_id: registered.photo.id },
        {
          sql: harness.api,
          storage: app.get(StorageService, { strict: false }),
          screening: new FailClosedPhotoScreening(),
        },
      );

      const listed = await request(app.getHttpServer())
        .get(`/v1/trips/${tripId}/photos`)
        .set(bearer(a.tokens.access_token));
      const [current] = PhotosResponse.parse(listed.body).photos;
      if (!current?.thumbnail_url) throw new Error('The photo fixture has no thumbnail.');
      photo = current;
      thumbnailUrl = current.thumbnail_url;
    });

    afterAll(async () => {
      bucket?.close();
      await harness?.close();
      await app?.close();
    });

    const asA = () => bearer(a.tokens.access_token);
    const asB = () => bearer(b.tokens.access_token);
    const server = () => request(app.getHttpServer());
    const ghost = '00000000-0000-4000-8000-00000000dead';

    /** Nothing A stored, or was signed, may appear in anything B is told. */
    function discloses(body: unknown): boolean {
      const text = JSON.stringify(body);
      return (
        text.includes(photo.id) ||
        text.includes(storageKey) ||
        text.includes(thumbnailKey) ||
        text.includes(thumbnailUrl) ||
        text.includes('exif') ||
        text.includes('thumbnail_url')
      );
    }

    it('starts from the case the row names: public, on a public trip, and still pending', () => {
      expect(photo).toMatchObject({
        is_public: true,
        moderation_state: 'pending',
        upload_state: 'uploaded',
        has_thumbnail: true,
      });
    });

    it('the list answers B exactly as for a trip that does not exist', async () => {
      const theirs = await server().get(`/v1/trips/${tripId}/photos`).set(asB());
      const nothing = await server().get(`/v1/trips/${ghost}/photos`).set(asB());

      expect(theirs.status).toBe(404);
      expect(theirs.body).toEqual(nothing.body);
      expect(theirs.body).toMatchObject({ error: { code: 'TRIP_NOT_FOUND' } });
      expect(discloses(theirs.body)).toBe(false);
    });

    it('the original answers B exactly as for a photo that does not exist', async () => {
      const theirs = await server().get(`/v1/photos/${photo.id}/original`).set(asB());
      const nothing = await server().get(`/v1/photos/${ghost}/original`).set(asB());

      expect(theirs.status).toBe(404);
      expect(theirs.body).toEqual(nothing.body);
      expect(theirs.body).toMatchObject({ error: { code: 'PHOTO_NOT_FOUND' } });
      expect(discloses(theirs.body)).toBe(false);
    });

    it('a guessed id is the same not-found', async () => {
      const guessed = await server()
        .get(`/v1/photos/${randomUUID()}/original`)
        .set(asB());
      const theirs = await server().get(`/v1/photos/${photo.id}/original`).set(asB());

      expect(guessed.status).toBe(404);
      expect(guessed.body).toEqual(theirs.body);
    });

    it.each([
      ['an unpublish', { is_public: false }],
      ['a refiling', { city_id: CITY.tokyo }],
      ['an unfiling', { city_id: null }],
      ['both', { is_public: false, city_id: CITY.tokyo }],
    ])('PATCH answers %s from B as not-found', async (_name, body) => {
      const theirs = await server().patch(`/v1/photos/${photo.id}`).set(asB()).send(body);
      const nothing = await server().patch(`/v1/photos/${ghost}`).set(asB()).send(body);

      expect(theirs.status).toBe(404);
      expect(theirs.body).toEqual(nothing.body);
      expect(discloses(theirs.body)).toBe(false);
    });

    it('DELETE answers B as not-found', async () => {
      const theirs = await server().delete(`/v1/photos/${photo.id}`).set(asB());
      const nothing = await server().delete(`/v1/photos/${ghost}`).set(asB());

      expect(theirs.status).toBe(404);
      expect(theirs.body).toEqual(nothing.body);
    });

    it('B cannot obtain an upload URL for, or register a photo on, A’s trip', async () => {
      const bTrip = await createTripFor(app, b, 'CHF', 'B’s trip');
      const bTarget = await requestUploadUrl(app, b, bTrip);
      await uploadBytes(bTarget, await photoJpeg());

      const url = await server()
        .post(`/v1/trips/${tripId}/photos/upload-url`)
        .set(asB())
        .send({ content_type: 'image/jpeg' });
      const registration = await registerRaw(app, b, tripId, {
        storage_key: bTarget.storage_key,
      });

      expect(url.status).toBe(404);
      expect(url.body).toMatchObject({ error: { code: 'TRIP_NOT_FOUND' } });
      expect(registration.status).toBe(404);
      expect(registration.body).toMatchObject({ error: { code: 'TRIP_NOT_FOUND' } });
    });

    it('B registering A’s object key on B’s own trip is refused without saying whether the object exists', async () => {
      const bTrip = await createTripFor(app, b, 'CHF', 'B’s claim');
      const invented = `${a.tokens.user.id}/${randomUUID()}`;

      const real = await registerRaw(app, b, bTrip, { storage_key: storageKey });
      const absent = await registerRaw(app, b, bTrip, { storage_key: invented });

      expect(real.status).toBe(422);
      expect(real.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
      expect(real.body).toEqual(absent.body);
      expect(absent.status).toBe(422);
      expect(discloses(real.body)).toBe(false);
    });

    it('B reusing A’s photo id is refused without learning anything about it', async () => {
      const bTrip = await createTripFor(app, b, 'CHF', 'B’s reuse');
      const bTarget = await requestUploadUrl(app, b, bTrip);
      await uploadBytes(bTarget, await photoJpeg());

      const response = await registerRaw(app, b, bTrip, {
        id: photo.id,
        storage_key: bTarget.storage_key,
      });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: {
          code: 'PHOTO_ID_UNAVAILABLE',
          message: 'That photo id is already in use. Please retry with a new id.',
        },
      });
    });

    it('B’s direct SELECT through the API role finds none of A’s photo', async () => {
      const rows = await harness.asUser(
        b.tokens.user.id,
        (tx) => tx`SELECT id FROM photos WHERE id = ${photo.id}::uuid`,
      );

      expect(rows).toHaveLength(0);
    });

    it('a thumbnail URL is a capability only A holds: unsigned or altered, the bucket opens nothing', async () => {
      const base = `${requireEnv('S3_ENDPOINT')}/${requireEnv('S3_BUCKET_PHOTOS')}`;
      const signed = new URL(thumbnailUrl);
      // A's signature, carried to A's original.
      const swapped = new URL(thumbnailUrl);
      swapped.pathname = swapped.pathname.replace(thumbnailKey, storageKey);

      const owns = await fetch(thumbnailUrl);
      const unsignedThumb = await fetch(`${base}/${thumbnailKey}`);
      const unsignedOriginal = await fetch(`${base}/${storageKey}`);
      const wrongObject = await fetch(swapped);
      const bareSignature = new URL(`${base}/${thumbnailKey}`);
      bareSignature.search = signed.search.replace(/X-Amz-Signature=[0-9a-f]+/, '');
      const unsigned = await fetch(bareSignature);

      // Positive control: the URL A was given works for whoever holds it.
      expect(owns.status).toBe(200);
      expect(owns.headers.get('content-type')).toBe('image/jpeg');
      expect(unsignedThumb.status).toBe(403);
      expect(unsignedOriginal.status).toBe(403);
      expect(wrongObject.status).toBe(403);
      expect(unsigned.status).toBe(403);
      await Promise.all(
        [owns, unsignedThumb, unsignedOriginal, wrongObject, unsigned].map((response) =>
          response.arrayBuffer(),
        ),
      );
    });

    it('A’s photo is exactly as A left it, and A still reads it', async () => {
      const listed = await server().get(`/v1/trips/${tripId}/photos`).set(asA());
      const original = await server().get(`/v1/photos/${photo.id}/original`).set(asA());

      expect(listed.status).toBe(200);
      const [current] = PhotosResponse.parse(listed.body).photos;
      expect(current).toMatchObject({
        id: photo.id,
        city_id: CITY.paris,
        is_public: true,
        moderation_state: 'pending',
        has_thumbnail: true,
      });
      expect(current?.updated_at).toBe(photo.updated_at);
      expect(original.status).toBe(200);
      const url = PhotoOriginalResponse.parse(original.body).url;
      expect(
        Buffer.from(await (await fetch(url)).arrayBuffer()).equals(originalBytes),
      ).toBe(true);
      expect(await bucket.size(storageKey)).toBe(originalBytes.length);
    });

    describe('once a screener approves it (User Story 7), the gate opens for reading only', () => {
      beforeAll(async () => {
        await harness.owner`
          UPDATE photos SET moderation_state = 'approved' WHERE id = ${photo.id}::uuid
        `;
      });

      it('B now reads the original — and only the original', async () => {
        const original = await server().get(`/v1/photos/${photo.id}/original`).set(asB());
        const list = await server().get(`/v1/trips/${tripId}/photos`).set(asB());

        expect(original.status).toBe(200);
        expect(PhotoOriginalResponse.parse(original.body).url).toContain(storageKey);
        // The curated public list is User Story 7's (FR-055); until then the
        // list is the owner's and B is told nothing of it.
        expect(list.status).toBe(404);
      });

      it('B still cannot change, refile, unpublish or delete it', async () => {
        const patch = await server()
          .patch(`/v1/photos/${photo.id}`)
          .set(asB())
          .send({ is_public: false });
        const remove = await server().delete(`/v1/photos/${photo.id}`).set(asB());

        expect(patch.status).toBe(404);
        expect(remove.status).toBe(404);
        const [row] = await harness.owner<
          { is_public: boolean; deleted_at: Date | null }[]
        >`
          SELECT is_public, deleted_at FROM photos WHERE id = ${photo.id}::uuid
        `;
        expect(row).toEqual({ is_public: true, deleted_at: null });
      });
    });
  });
});
