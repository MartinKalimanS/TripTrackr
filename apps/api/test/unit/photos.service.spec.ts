import { HttpException, HttpStatus } from '@nestjs/common';
import {
  MAX_PHOTO_BYTES,
  PatchPhotoRequest,
  RegisterPhotoRequest,
  type RegisterPhotoInput,
  type Trip,
} from '@triptrackr/contracts';
import type { TransactionSql } from 'postgres';

import { resetEnvCache } from '@/common/config/env.schema';
import { runInRlsContext } from '@/common/rls/rls-context';
import type { StorageBucket, StorageService } from '@/common/storage/storage.service';
import type { MediaJobProducer } from '@/modules/photos/media-job.producer';
import type {
  NewPhoto,
  PhotoPatch,
  PhotoRow,
  PhotosRepository,
} from '@/modules/photos/photos.repository';
import { PhotosService } from '@/modules/photos/photos.service';
import { tripNotFound, type TripsService } from '@/modules/trips/trips.service';

import { applyUnitTestEnv } from '../support/env';
import { CITY } from '../support/geography';

/**
 * Photo decisions (rest-api.md §5; FR-028, FR-030, FR-041, FR-056; research
 * D-34; tasks.md T112), against a stubbed repository, owner view, bucket and
 * queue.
 *
 * test/integration/uploads.spec.ts (T109) proves the sequence against
 * PostgreSQL and RustFS; the moderation gate and the adversarial rows have
 * their own suites. Pinned here are the branches around them:
 *
 *   - registration refuses a key outside the caller's prefix (422), a missing
 *     or empty object (409), an object over the limit — deleting it (413) — and
 *     a key another live photo already holds (409), in that order, and a key
 *     already held is never measured, so the oversize branch cannot delete the
 *     bytes of a photo that exists;
 *   - a retried registration by client id is the same registration (200 with the
 *     stored photo, nothing re-checked or re-enqueued); an id held by anything
 *     else is one identical 409 `PHOTO_ID_UNAVAILABLE`;
 *   - a registered photo is `uploaded`, `pending` and private, and is enqueued;
 *   - the list signs thumbnails only — never an original — and the original is
 *     signed only on its own route;
 *   - `is_public` is accepted while screening is pending (the contract
 *     obligation on PATCH), and the answer says the photo is still pending.
 */

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const STRANGER_ID = '99999999-9999-4999-8999-999999999999';
const TRIP_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_TRIP_ID = '33333333-3333-4333-8333-333333333333';
const STRANGER_TRIP_ID = '44444444-4444-4444-8444-444444444444';
const PHOTO_ID = '55555555-5555-4555-8555-555555555555';
const GENERATED_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KEY = `${OWNER_ID}/77777777-7777-4777-8777-777777777777`;
const OTHER_KEY = `${OWNER_ID}/88888888-8888-4888-8888-888888888888`;
const STRANGER_KEY = `${STRANGER_ID}/77777777-7777-4777-8777-777777777777`;
const UNKNOWN_CITY = 999_999;
const CREATED_AT = new Date('2026-06-02T08:00:00.000Z');
const UPDATED_AT = new Date('2026-06-03T09:30:00.000Z');
const SIGNED = 'https://store.example.test/signed';

const OWN_TRIPS: ReadonlySet<string> = new Set([TRIP_ID, OTHER_TRIP_ID]);

function ownTrip(id: string): Trip {
  return {
    id,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    title: 'Swiss photos',
    home_currency: 'CHF',
    is_public: false,
    cover_photo_id: null,
    status: 'planning',
    stops: [],
  };
}

function photoRow(overrides: Partial<PhotoRow> = {}): PhotoRow {
  return {
    id: PHOTO_ID,
    tripId: TRIP_ID,
    cityId: null,
    storageKey: KEY,
    thumbKey: null,
    takenAt: null,
    exifLat: null,
    exifLng: null,
    isPublic: false,
    moderationState: 'pending',
    uploadState: 'uploaded',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function insertedRow(photo: NewPhoto): PhotoRow {
  return photoRow({
    id: photo.id ?? GENERATED_ID,
    tripId: photo.tripId,
    storageKey: photo.storageKey,
    cityId: photo.cityId,
    takenAt: photo.takenAt,
    exifLat: photo.exifLat,
    exifLng: photo.exifLng,
  });
}

interface World {
  /** The caller's own live photos. */
  readonly visible?: readonly PhotoRow[];
  /** Ids held by rows the caller cannot see: another traveller's, or tombstoned. */
  readonly hiddenIds?: readonly string[];
  /** Object sizes in the bucket; absent means not there. */
  readonly objects?: Readonly<Record<string, number>>;
  readonly knownCities?: readonly number[];
}

function stubRepository(world: World) {
  const live = new Map((world.visible ?? []).map((row) => [row.id, row]));
  const taken = new Set([...live.keys(), ...(world.hiddenIds ?? [])]);
  const cities = new Set(world.knownCities ?? [CITY.zurich]);

  return {
    listForTrip: jest.fn((tripId: string) =>
      Promise.resolve([...live.values()].filter((row) => row.tripId === tripId)),
    ),
    findOwnedLive: jest.fn((id: string) => Promise.resolve(live.get(id) ?? null)),
    findOriginalKey: jest.fn((id: string) =>
      Promise.resolve(live.get(id)?.storageKey ?? null),
    ),
    storageKeyInUse: jest.fn((key: string) =>
      Promise.resolve([...live.values()].some((row) => row.storageKey === key)),
    ),
    insert: jest.fn((photo: NewPhoto) =>
      Promise.resolve(
        photo.id !== undefined && taken.has(photo.id) ? null : insertedRow(photo),
      ),
    ),
    update: jest.fn((id: string, patch: PhotoPatch) => {
      const current = live.get(id);
      return Promise.resolve(
        current
          ? {
              ...current,
              ...(patch.isPublic !== undefined && { isPublic: patch.isPublic }),
              ...(patch.cityId !== undefined && { cityId: patch.cityId }),
              updatedAt: UPDATED_AT,
            }
          : null,
      );
    }),
    tombstone: jest.fn((id: string) => Promise.resolve(live.delete(id))),
    cityExists: jest.fn((id: number) => Promise.resolve(cities.has(id))),
  } satisfies PhotosRepository;
}

function stubStorage(objects: Readonly<Record<string, number>> = {}) {
  return {
    createUploadUrl: jest.fn((_bucket: StorageBucket, ownerId: string, _type: string) =>
      Promise.resolve({
        url: `${SIGNED}/put`,
        storageKey: `${ownerId}/cccccccc-cccc-4ccc-8ccc-cccccccccccc`,
        expiresInSeconds: 120,
      }),
    ),
    createDownloadUrl: jest.fn((_bucket: StorageBucket, key: string) =>
      Promise.resolve(`${SIGNED}/${key}`),
    ),
    objectSize: jest.fn((_bucket: StorageBucket, key: string) =>
      Promise.resolve(objects[key] ?? null),
    ),
    deleteObject: jest.fn((_bucket: StorageBucket, _key: string) => Promise.resolve()),
  };
}

function harness(world: World = {}) {
  const repository = stubRepository(world);
  const storage = stubStorage(world.objects ?? { [KEY]: 2_048 });
  const media = { enqueue: jest.fn((_id: string) => Promise.resolve()) };
  const trips = {
    loadOwned: jest.fn((tripId: string) =>
      OWN_TRIPS.has(tripId)
        ? Promise.resolve(ownTrip(tripId))
        : Promise.reject(tripNotFound()),
    ),
  };
  const service = new PhotosService(
    repository,
    trips as unknown as TripsService,
    storage as unknown as StorageService,
    media as unknown as MediaJobProducer,
  );

  return { service, repository, storage, media, trips };
}

/** Runs `fn` as the owner, the way RlsSessionMiddleware would. */
function asOwner<T>(fn: () => Promise<T>): Promise<T> {
  return runInRlsContext({ tx: {} as TransactionSql, userId: OWNER_ID }, fn);
}

function registration(input: Partial<RegisterPhotoInput> = {}): RegisterPhotoRequest {
  return RegisterPhotoRequest.parse({ storage_key: KEY, ...input });
}

async function refusal(
  call: Promise<unknown>,
): Promise<{ status: number; body: unknown }> {
  const outcome: unknown = await call.then(
    () => new Error('Expected a refusal, but the call succeeded.'),
    (error: unknown) => error,
  );
  if (!(outcome instanceof HttpException)) throw outcome;
  return { status: outcome.getStatus(), body: outcome.getResponse() };
}

function invalid(path: string, message: string) {
  return {
    error: {
      code: 'VALIDATION_FAILED',
      message:
        'Some of the information provided is not valid. Please check it and try again.',
      details: { issues: [{ path, message }] },
    },
  };
}

beforeAll(() => applyUnitTestEnv({ S3_SIGNED_URL_TTL_SECONDS: '120' }));
afterAll(() => resetEnvCache());

describe('PhotosService.createUploadUrl — a pre-signed PUT for a key the server chose', () => {
  it('signs a PUT under the caller’s own prefix with the declared type', async () => {
    const { service, storage } = harness();

    const upload = await asOwner(() =>
      service.createUploadUrl(TRIP_ID, { content_type: 'image/webp' }),
    );

    expect(storage.createUploadUrl).toHaveBeenCalledWith(
      'photos',
      OWNER_ID,
      'image/webp',
    );
    expect(upload).toEqual({
      upload_url: `${SIGNED}/put`,
      storage_key: `${OWNER_ID}/cccccccc-cccc-4ccc-8ccc-cccccccccccc`,
      expires_in_seconds: 120,
    });
  });

  it("refuses a stranger's trip as TRIP_NOT_FOUND before signing anything", async () => {
    const { service, storage } = harness();

    const { status, body } = await refusal(
      asOwner(() =>
        service.createUploadUrl(STRANGER_TRIP_ID, { content_type: 'image/jpeg' }),
      ),
    );

    expect(status).toBe(HttpStatus.NOT_FOUND);
    expect(body).toMatchObject({ error: { code: 'TRIP_NOT_FOUND' } });
    expect(storage.createUploadUrl).not.toHaveBeenCalled();
  });
});

describe('PhotosService.register — the bytes must have landed (FR-041)', () => {
  it('records the photo uploaded, pending and private, enqueues it, and says it was created', async () => {
    const { service, repository, media } = harness();

    const { photo, created } = await asOwner(() =>
      service.register(
        TRIP_ID,
        registration({
          city_id: CITY.zurich,
          taken_at: '2026-06-03T14:30:00+02:00',
          exif_lat: 47.3769,
          exif_lng: 8.5417,
        }),
      ),
    );

    expect(created).toBe(true);
    expect(repository.insert).toHaveBeenCalledWith({
      id: undefined,
      tripId: TRIP_ID,
      storageKey: KEY,
      cityId: CITY.zurich,
      takenAt: new Date('2026-06-03T12:30:00.000Z'),
      exifLat: 47.3769,
      exifLng: 8.5417,
    });
    expect(photo).toEqual({
      id: GENERATED_ID,
      created_at: CREATED_AT.toISOString(),
      updated_at: CREATED_AT.toISOString(),
      trip_id: TRIP_ID,
      city_id: CITY.zurich,
      taken_at: '2026-06-03T12:30:00.000Z',
      exif_lat: 47.3769,
      exif_lng: 8.5417,
      is_public: false,
      upload_state: 'uploaded',
      moderation_state: 'pending',
      has_thumbnail: false,
      thumbnail_url: null,
    });
    expect(media.enqueue).toHaveBeenCalledWith(GENERATED_ID);
  });

  it('refuses a key outside the caller’s prefix with 422, before looking at the bucket', async () => {
    const { service, storage, repository } = harness({
      objects: { [STRANGER_KEY]: 2_048 },
    });

    const { status, body } = await refusal(
      asOwner(() =>
        service.register(TRIP_ID, registration({ storage_key: STRANGER_KEY })),
      ),
    );

    expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(body).toEqual(invalid('storage_key', 'Expected a storage key issued to you'));
    expect(storage.objectSize).not.toHaveBeenCalled();
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it.each([
    ['not there', {}],
    ['empty', { [KEY]: 0 }],
  ])(
    'answers 409 PHOTO_UPLOAD_MISSING when the object is %s, and records nothing',
    async (_label, objects) => {
      const { service, repository, media } = harness({ objects });

      const { status, body } = await refusal(
        asOwner(() => service.register(TRIP_ID, registration())),
      );

      expect(status).toBe(HttpStatus.CONFLICT);
      expect(body).toEqual({
        error: {
          code: 'PHOTO_UPLOAD_MISSING',
          message:
            'The photo has not finished uploading. Please upload it and try again.',
        },
      });
      expect(repository.insert).not.toHaveBeenCalled();
      expect(media.enqueue).not.toHaveBeenCalled();
    },
  );

  it('deletes an object over the limit and answers 413 PHOTO_TOO_LARGE', async () => {
    const { service, storage, repository } = harness({
      objects: { [KEY]: MAX_PHOTO_BYTES + 1 },
    });

    const { status, body } = await refusal(
      asOwner(() => service.register(TRIP_ID, registration())),
    );

    expect(status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(body).toMatchObject({ error: { code: 'PHOTO_TOO_LARGE' } });
    expect(storage.deleteObject).toHaveBeenCalledWith('photos', KEY);
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it('accepts an object exactly at the limit', async () => {
    const { service } = harness({ objects: { [KEY]: MAX_PHOTO_BYTES } });

    const { created } = await asOwner(() => service.register(TRIP_ID, registration()));

    expect(created).toBe(true);
  });

  it('refuses a key another live photo holds with 409, without measuring or deleting its bytes', async () => {
    const { service, storage, repository } = harness({
      visible: [photoRow({ id: PHOTO_ID, storageKey: KEY })],
      // Replaced after registration with something oversized: deleting it here
      // would destroy the bytes of the photo that already exists.
      objects: { [KEY]: MAX_PHOTO_BYTES + 1 },
    });

    const { status, body } = await refusal(
      asOwner(() => service.register(TRIP_ID, registration({ id: GENERATED_ID }))),
    );

    expect(status).toBe(HttpStatus.CONFLICT);
    expect(body).toEqual({
      error: {
        code: 'PHOTO_UPLOAD_REUSED',
        message:
          'That upload is already saved as another photo. Please request a new upload and try again.',
      },
    });
    expect(storage.objectSize).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it('refuses an unknown city as VALIDATION_FAILED, not a database error', async () => {
    const { service, repository } = harness();

    const { status, body } = await refusal(
      asOwner(() => service.register(TRIP_ID, registration({ city_id: UNKNOWN_CITY }))),
    );

    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body).toEqual(invalid('city_id', 'Unknown city'));
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it('refuses a capture time the wire could not carry back', async () => {
    const { service, repository } = harness();

    const { status, body } = await refusal(
      asOwner(() =>
        service.register(
          TRIP_ID,
          registration({ taken_at: '9999-12-31T23:59:59-12:00' }),
        ),
      ),
    );

    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body).toEqual(
      invalid('taken_at', 'Expected a capture time between the years 0000 and 9999'),
    );
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it("refuses a stranger's trip as TRIP_NOT_FOUND before anything else", async () => {
    const { service, repository, storage } = harness();

    const { status } = await refusal(
      asOwner(() => service.register(STRANGER_TRIP_ID, registration({ id: PHOTO_ID }))),
    );

    expect(status).toBe(HttpStatus.NOT_FOUND);
    expect(repository.findOwnedLive).not.toHaveBeenCalled();
    expect(storage.objectSize).not.toHaveBeenCalled();
  });

  it('propagates a queue that cannot take the job, so the registration does not stand', async () => {
    const { service, media } = harness();
    media.enqueue.mockRejectedValueOnce(new Error('queue unavailable'));

    await expect(
      asOwner(() => service.register(TRIP_ID, registration())),
    ).rejects.toThrow('queue unavailable');
  });
});

describe('PhotosService.register — a retried registration is the same registration (research D-15)', () => {
  it('answers with the stored photo, re-checking and re-enqueueing nothing', async () => {
    const stored = photoRow({ thumbKey: `${KEY}.thumb.jpg`, isPublic: true });
    const { service, repository, storage, media } = harness({ visible: [stored] });

    const { photo, created } = await asOwner(() =>
      service.register(TRIP_ID, registration({ id: PHOTO_ID })),
    );

    expect(created).toBe(false);
    expect(photo).toMatchObject({
      id: PHOTO_ID,
      is_public: true,
      has_thumbnail: true,
      thumbnail_url: `${SIGNED}/${KEY}.thumb.jpg`,
    });
    expect(storage.objectSize).not.toHaveBeenCalled();
    expect(repository.insert).not.toHaveBeenCalled();
    expect(media.enqueue).not.toHaveBeenCalled();
  });

  it('answers with the photo a concurrent retry stored first', async () => {
    const { service, repository, media } = harness();
    repository.insert.mockResolvedValueOnce(null);
    repository.findOwnedLive
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(photoRow({ id: PHOTO_ID }));

    const { photo, created } = await asOwner(() =>
      service.register(TRIP_ID, registration({ id: PHOTO_ID })),
    );

    expect(created).toBe(false);
    expect(photo.id).toBe(PHOTO_ID);
    expect(media.enqueue).not.toHaveBeenCalled();
  });

  it('refuses an id held elsewhere — a stranger’s, another trip, another upload — with one identical 409', async () => {
    const stranger = harness({ hiddenIds: [PHOTO_ID] });
    const otherTrip = harness({
      visible: [photoRow({ id: PHOTO_ID, tripId: OTHER_TRIP_ID, storageKey: OTHER_KEY })],
    });
    const otherUpload = harness({
      visible: [photoRow({ id: PHOTO_ID, storageKey: OTHER_KEY })],
    });

    const refusals = await Promise.all(
      [stranger, otherTrip, otherUpload].map(({ service }) =>
        refusal(asOwner(() => service.register(TRIP_ID, registration({ id: PHOTO_ID })))),
      ),
    );

    expect(refusals[0]).toEqual({
      status: HttpStatus.CONFLICT,
      body: {
        error: {
          code: 'PHOTO_ID_UNAVAILABLE',
          message: 'That photo id is already in use. Please retry with a new id.',
        },
      },
    });
    expect(refusals[1]).toEqual(refusals[0]);
    expect(refusals[2]).toEqual(refusals[0]);
    expect(stranger.media.enqueue).not.toHaveBeenCalled();
  });
});

describe('PhotosService.list and original — thumbnails by default, originals on request (FR-030)', () => {
  it('lists the trip’s photos, signing thumbnails only and never an original', async () => {
    const withThumb = photoRow({ id: PHOTO_ID, thumbKey: `${KEY}.thumb.jpg` });
    const withoutThumb = photoRow({ id: GENERATED_ID, storageKey: OTHER_KEY });
    const { service, storage } = harness({ visible: [withThumb, withoutThumb] });

    const photos = await asOwner(() => service.list(TRIP_ID));

    expect(photos.map((p) => [p.id, p.has_thumbnail, p.thumbnail_url])).toEqual([
      [PHOTO_ID, true, `${SIGNED}/${KEY}.thumb.jpg`],
      [GENERATED_ID, false, null],
    ]);
    expect(storage.createDownloadUrl).toHaveBeenCalledTimes(1);
    expect(storage.createDownloadUrl).not.toHaveBeenCalledWith('photos', KEY);
    expect(storage.createDownloadUrl).not.toHaveBeenCalledWith('photos', OTHER_KEY);
  });

  it("lists nothing from a stranger's trip: TRIP_NOT_FOUND before any photo is read", async () => {
    const { service, repository } = harness({
      visible: [photoRow({ tripId: STRANGER_TRIP_ID })],
    });

    const { status } = await refusal(asOwner(() => service.list(STRANGER_TRIP_ID)));

    expect(status).toBe(HttpStatus.NOT_FOUND);
    expect(repository.listForTrip).not.toHaveBeenCalled();
  });

  it('signs the original, with the TTL it was signed for', async () => {
    const { service, storage } = harness({ visible: [photoRow()] });

    const original = await asOwner(() => service.original(PHOTO_ID));

    expect(original).toEqual({ url: `${SIGNED}/${KEY}`, expires_in_seconds: 120 });
    expect(storage.createDownloadUrl).toHaveBeenCalledWith('photos', KEY);
  });

  it('answers PHOTO_NOT_FOUND for an original the caller cannot reach', async () => {
    const { service, storage } = harness();

    const { status, body } = await refusal(asOwner(() => service.original(PHOTO_ID)));

    expect(status).toBe(HttpStatus.NOT_FOUND);
    expect(body).toEqual({
      error: {
        code: 'PHOTO_NOT_FOUND',
        message: 'Photo does not exist or you do not have access.',
      },
    });
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });
});

describe('PhotosService.patch — visibility and filing (rest-api.md §5)', () => {
  it('accepts is_public while screening is pending, and answers that it is still pending', async () => {
    const { service, repository } = harness({ visible: [photoRow()] });

    const photo = await asOwner(() =>
      service.patch(PHOTO_ID, PatchPhotoRequest.parse({ is_public: true })),
    );

    expect(photo).toMatchObject({
      id: PHOTO_ID,
      is_public: true,
      moderation_state: 'pending',
      updated_at: UPDATED_AT.toISOString(),
    });
    expect(repository.update).toHaveBeenCalledWith(PHOTO_ID, {
      isPublic: true,
      cityId: undefined,
    });
  });

  it('refiles under a known city, and unfiles with null', async () => {
    const { service, repository } = harness({
      visible: [photoRow({ cityId: CITY.zurich })],
    });

    const unfiled = await asOwner(() =>
      service.patch(PHOTO_ID, PatchPhotoRequest.parse({ city_id: null })),
    );
    const refiled = await asOwner(() =>
      service.patch(PHOTO_ID, PatchPhotoRequest.parse({ city_id: CITY.zurich })),
    );

    expect(unfiled.city_id).toBeNull();
    expect(refiled.city_id).toBe(CITY.zurich);
    expect(repository.cityExists).toHaveBeenCalledTimes(1);
  });

  it('refuses an unknown city before writing', async () => {
    const { service, repository } = harness({ visible: [photoRow()] });

    const { body } = await refusal(
      asOwner(() =>
        service.patch(PHOTO_ID, PatchPhotoRequest.parse({ city_id: UNKNOWN_CITY })),
      ),
    );

    expect(body).toEqual(invalid('city_id', 'Unknown city'));
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('answers one PHOTO_NOT_FOUND for a photo it cannot see and one tombstoned mid-patch', async () => {
    const hidden = harness({ hiddenIds: [PHOTO_ID] });
    const racing = harness({ visible: [photoRow()] });
    racing.repository.update.mockResolvedValueOnce(null);

    const unseen = await refusal(
      asOwner(() =>
        hidden.service.patch(PHOTO_ID, PatchPhotoRequest.parse({ is_public: true })),
      ),
    );
    const vanished = await refusal(
      asOwner(() =>
        racing.service.patch(PHOTO_ID, PatchPhotoRequest.parse({ is_public: true })),
      ),
    );

    expect(unseen.status).toBe(HttpStatus.NOT_FOUND);
    expect(unseen.body).toMatchObject({ error: { code: 'PHOTO_NOT_FOUND' } });
    expect(vanished).toEqual(unseen);
    expect(hidden.repository.update).not.toHaveBeenCalled();
  });
});

describe('PhotosService.remove — a tombstone (FR-039)', () => {
  it('tombstones a visible photo once; deleting it again is PHOTO_NOT_FOUND', async () => {
    const { service } = harness({ visible: [photoRow()] });

    await expect(asOwner(() => service.remove(PHOTO_ID))).resolves.toBeUndefined();
    const again = await refusal(asOwner(() => service.remove(PHOTO_ID)));

    expect(again.status).toBe(HttpStatus.NOT_FOUND);
    expect(again.body).toMatchObject({ error: { code: 'PHOTO_NOT_FOUND' } });
  });
});
