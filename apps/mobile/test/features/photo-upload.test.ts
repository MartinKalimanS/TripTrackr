/**
 * The online path for photo bytes — tasks.md T116 (FR-041; rest-api.md §5;
 * sync-protocol.md §4; research D-34) — and the filing PATCH (FR-028).
 *
 * `apiFetch` and the native upload (`File.upload`) are mocked; the photos
 * repository runs on a real SQLite database. What these pin:
 *   - upload-url → PUT (image/jpeg, the file itself) → register with the
 *     photo's own id and EXIF fields → the row is `uploaded` and clean;
 *   - no connection, a timeout, a trip the server has not received yet, a
 *     signed-out device, a busy server: the photo stays pending, silently —
 *     the gallery's badge says so;
 *   - 409 PHOTO_UPLOAD_MISSING re-uploads once; 413 PHOTO_TOO_LARGE fails the
 *     upload for good; anything unexpected is reported and stays pending;
 *   - one upload per photo at a time, cancellable when the photo is deleted;
 *   - a refile of an uploaded photo is PATCHed and the row cleaned — unless it
 *     changed again meanwhile.
 */
import { RegisterPhotoRequest, type Photo } from '@triptrackr/contracts';
import { randomUUID } from 'expo-crypto';

import { photosRepository } from '@/db/repositories/photos';
import { tripsRepository } from '@/db/repositories/trips';
import type { PhotoRow } from '@/db/schema';
import { photoPath, thumbnailPath } from '@/features/photos/photo-files';
import { syncFiling } from '@/features/photos/refile';
import {
  cancelUpload,
  isWaitingError,
  UPLOAD_TIMEOUT_MS,
  uploadPendingPhotos,
  uploadPhoto,
} from '@/features/photos/upload';
import { ApiRequestError } from '@/lib/api-client';
import { Sentry } from '@/lib/sentry';

import { createTestDatabase, type TestSqlite } from '../db/sqlite-harness';
import { DOCUMENTS, type FileSystemMock, type MockUploadOptions } from './photo-fakes';

jest.mock('expo-file-system', () =>
  jest.requireActual('./photo-fakes').createFileSystemMock(),
);
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return { ...actual, apiFetch: jest.fn() };
});
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const { apiFetch } = jest.requireMock('@/lib/api-client') as { apiFetch: jest.Mock };
const { __fs } = jest.requireMock('expo-file-system') as FileSystemMock;

const OWNER = '0f9d0c1e-6f3a-4c1b-9a51-7a3b2c1d0e9f';
const SIGNED_URL = 'https://bucket.example/photos/abc?X-Amz-Signature=top-secret';

let sqlite: TestSqlite;
let tripId: string;

/** Fake clocks that still let promise and sqlite work run. */
const FAKE_TIMERS: Parameters<typeof jest.useFakeTimers>[0] = {
  doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
};

beforeEach(async () => {
  __fs.reset();
  // `clearAllMocks` (jest.setup.ts) keeps queued once-values; a failed test
  // must not leave them for the next one.
  apiFetch.mockReset();
  sqlite = await createTestDatabase();
  tripId = tripsRepository.create(sqlite.db, {
    id: randomUUID(),
    title: 'Italy',
    home_currency: 'EUR',
  }).id;
});

afterEach(() => {
  jest.useRealTimers();
  sqlite.close();
});

/** A captured photo: its row and both staged files. */
function captured(
  overrides: Partial<Parameters<typeof photosRepository.create>[1]> = {},
) {
  const id = overrides.id ?? randomUUID();
  const relative = photoPath(overrides.trip_id ?? tripId, id);
  __fs.write(`${DOCUMENTS}/${relative}`, 900_000);
  __fs.write(`${DOCUMENTS}/${thumbnailPath(relative)}`, 40_000);
  return photosRepository.create(sqlite.db, {
    id,
    trip_id: tripId,
    city_id: 100,
    taken_at: '2026-05-12T16:30:05.000Z',
    exif_lat: 41.9,
    exif_lng: 12.5,
    local_file_uri: relative,
    ...overrides,
  });
}

function uploadTarget() {
  return {
    upload_url: SIGNED_URL,
    storage_key: `${OWNER}/${randomUUID()}`,
    expires_in_seconds: 900,
  };
}

function serverPhoto(row: PhotoRow, overrides: Partial<Photo> = {}): { photo: Photo } {
  return {
    photo: {
      id: row.id,
      trip_id: row.trip_id,
      city_id: row.city_id,
      taken_at: row.taken_at,
      exif_lat: row.exif_lat,
      exif_lng: row.exif_lng,
      is_public: false,
      upload_state: 'uploaded',
      moderation_state: 'pending',
      has_thumbnail: false,
      created_at: row.created_at,
      updated_at: row.updated_at,
      thumbnail_url: null,
      ...overrides,
    },
  };
}

function apiError(status: number, code: string) {
  return new ApiRequestError(status, { code, message: `${code} happened` });
}

function row(id: string) {
  return photosRepository.byId(sqlite.db, id);
}

/** The paths apiFetch was called with, in order. */
function apiPaths() {
  return apiFetch.mock.calls.map((call) => call[1] as string);
}

describe('uploadPhoto — the happy path (FR-041)', () => {
  test('upload-url, then the PUT of the JPEG itself, then registration under the photo’s own id', async () => {
    const photo = captured();
    const target = uploadTarget();
    apiFetch
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(serverPhoto(photo, { has_thumbnail: true }));

    await expect(uploadPhoto(sqlite.db, photo.id)).resolves.toBe('uploaded');

    expect(apiFetch).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      `/trips/${tripId}/photos/upload-url`,
      expect.objectContaining({ method: 'POST', body: { content_type: 'image/jpeg' } }),
    );
    expect(__fs.upload).toHaveBeenCalledTimes(1);
    const [fileUri, url, options] = __fs.upload.mock.calls[0]!;
    expect(fileUri).toBe(`${DOCUMENTS}/${photo.local_file_uri}`);
    expect(url).toBe(SIGNED_URL);
    expect(options).toMatchObject({
      httpMethod: 'PUT',
      uploadType: 0, // UploadType.BINARY_CONTENT: the file is the whole body
      headers: { 'Content-Type': 'image/jpeg' },
    });

    const [, registerPath, registerOptions] = apiFetch.mock.calls[1]!;
    expect(registerPath).toBe(`/trips/${tripId}/photos`);
    expect(registerOptions).toMatchObject({ method: 'POST' });
    expect(registerOptions.body).toEqual({
      id: photo.id,
      storage_key: target.storage_key,
      city_id: 100,
      taken_at: '2026-05-12T16:30:05.000Z',
      exif_lat: 41.9,
      exif_lng: 12.5,
    });
    expect(RegisterPhotoRequest.safeParse(registerOptions.body).success).toBe(true);

    expect(row(photo.id)).toMatchObject({
      upload_state: 'uploaded',
      has_thumbnail: true,
      is_dirty: false,
      synced_at: expect.any(String),
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  test('a photo with no metadata registers nulls, both coordinates or neither', async () => {
    const photo = captured({
      city_id: null,
      taken_at: null,
      exif_lat: null,
      exif_lng: null,
    });
    apiFetch
      .mockResolvedValueOnce(uploadTarget())
      .mockResolvedValueOnce(serverPhoto(photo));

    await uploadPhoto(sqlite.db, photo.id);

    expect(apiFetch.mock.calls[1]![2].body).toMatchObject({
      city_id: null,
      taken_at: null,
      exif_lat: null,
      exif_lng: null,
    });
  });
});

describe('uploadPhoto — waiting quietly (the pending badge says it)', () => {
  test.each([
    ['no connection', apiError(0, 'NETWORK')],
    ['a timeout', apiError(0, 'TIMEOUT')],
    ['a trip the server has not received yet', apiError(404, 'TRIP_NOT_FOUND')],
    ['a device that was signed out', apiError(401, 'SESSION_EXPIRED')],
    ['too many requests', apiError(429, 'RATE_LIMITED')],
    ['a server in trouble', apiError(503, 'UNAVAILABLE')],
    [
      'a response the app does not understand (already reported)',
      apiError(200, 'INVALID_RESPONSE'),
    ],
  ])('%s at upload-url leaves the photo pending', async (_label, error) => {
    const photo = captured();
    apiFetch.mockRejectedValueOnce(error);

    await expect(uploadPhoto(sqlite.db, photo.id)).resolves.toBe('waiting');

    expect(row(photo.id)).toMatchObject({ upload_state: 'pending', is_dirty: true });
    expect(__fs.upload).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  test('a PUT that never reaches the bucket leaves the photo pending, unregistered', async () => {
    const photo = captured();
    apiFetch.mockResolvedValueOnce(uploadTarget());
    __fs.upload.mockRejectedValueOnce(
      new Error('The Internet connection appears to be offline.'),
    );

    await expect(uploadPhoto(sqlite.db, photo.id)).resolves.toBe('waiting');

    expect(apiPaths()).toEqual([`/trips/${tripId}/photos/upload-url`]);
    expect(row(photo.id)?.upload_state).toBe('pending');
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  test('a bucket answering 503 is waited out quietly', async () => {
    const photo = captured();
    apiFetch.mockResolvedValueOnce(uploadTarget());
    __fs.upload.mockResolvedValueOnce({ status: 503, headers: {}, body: 'Slow Down' });

    await expect(uploadPhoto(sqlite.db, photo.id)).resolves.toBe('waiting');
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  test('a PUT that hangs is abandoned after UPLOAD_TIMEOUT_MS and tried again later', async () => {
    jest.useFakeTimers(FAKE_TIMERS);
    const photo = captured();
    apiFetch.mockResolvedValueOnce(uploadTarget());
    __fs.upload.mockImplementationOnce(
      (_uri: string, _url: string, options?: MockUploadOptions) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () =>
            reject(new Error('AbortError')),
          );
        }),
    );

    const outcome = uploadPhoto(sqlite.db, photo.id);
    await jest.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS);

    await expect(outcome).resolves.toBe('waiting');
    expect(row(photo.id)?.upload_state).toBe('pending');
  });
});

describe('uploadPhoto — the refusals rest-api.md §5 defines', () => {
  test('409 PHOTO_UPLOAD_MISSING re-uploads once, then registers', async () => {
    const photo = captured();
    apiFetch
      .mockResolvedValueOnce(uploadTarget())
      .mockRejectedValueOnce(apiError(409, 'PHOTO_UPLOAD_MISSING'))
      .mockResolvedValueOnce(uploadTarget())
      .mockResolvedValueOnce(serverPhoto(photo));

    await expect(uploadPhoto(sqlite.db, photo.id)).resolves.toBe('uploaded');

    expect(apiPaths()).toEqual([
      `/trips/${tripId}/photos/upload-url`,
      `/trips/${tripId}/photos`,
      `/trips/${tripId}/photos/upload-url`,
      `/trips/${tripId}/photos`,
    ]);
    expect(__fs.upload).toHaveBeenCalledTimes(2);
    expect(row(photo.id)?.upload_state).toBe('uploaded');
  });

  test('a second 409 is not chased again: reported, and the photo stays pending', async () => {
    const photo = captured();
    apiFetch
      .mockResolvedValueOnce(uploadTarget())
      .mockRejectedValueOnce(apiError(409, 'PHOTO_UPLOAD_MISSING'))
      .mockResolvedValueOnce(uploadTarget())
      .mockRejectedValueOnce(apiError(409, 'PHOTO_UPLOAD_MISSING'));

    await expect(uploadPhoto(sqlite.db, photo.id)).resolves.toBe('waiting');

    expect(apiFetch).toHaveBeenCalledTimes(4);
    expect(row(photo.id)?.upload_state).toBe('pending');
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  test('413 PHOTO_TOO_LARGE fails the upload for good — shown, and reported (the resize should prevent it)', async () => {
    const photo = captured();
    apiFetch
      .mockResolvedValueOnce(uploadTarget())
      .mockRejectedValueOnce(apiError(413, 'PHOTO_TOO_LARGE'));

    await expect(uploadPhoto(sqlite.db, photo.id)).resolves.toBe('failed');

    expect(row(photo.id)).toMatchObject({ upload_state: 'failed', is_dirty: true });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['a validation refusal', apiError(422, 'VALIDATION_FAILED')],
    ['a missing configuration', apiError(0, 'CONFIG')],
    ['a programming error', new TypeError('undefined is not a function')],
  ])('%s is reported, and the photo stays pending', async (_label, error) => {
    const photo = captured();
    apiFetch.mockResolvedValueOnce(uploadTarget()).mockRejectedValueOnce(error);

    await expect(uploadPhoto(sqlite.db, photo.id)).resolves.toBe('waiting');

    expect(row(photo.id)?.upload_state).toBe('pending');
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  test('a bucket refusing the signed PUT is reported without the signed URL', async () => {
    const photo = captured();
    apiFetch.mockResolvedValueOnce(uploadTarget());
    __fs.upload.mockResolvedValueOnce({
      status: 403,
      headers: {},
      body: 'SignatureDoesNotMatch',
    });

    await expect(uploadPhoto(sqlite.db, photo.id)).resolves.toBe('waiting');

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const [reported] = (Sentry.captureException as jest.Mock).mock.calls[0]!;
    expect(String(reported.message)).toMatch(/403/);
    expect(JSON.stringify(reported)).not.toMatch(/top-secret|X-Amz/);
    expect(String(reported.message)).not.toMatch(/top-secret|X-Amz/);
  });

  test('a pending photo whose file has vanished fails for good, without touching the network', async () => {
    const photo = captured();
    __fs.files.delete(`${DOCUMENTS}/${photo.local_file_uri}`);

    await expect(uploadPhoto(sqlite.db, photo.id)).resolves.toBe('failed');

    expect(row(photo.id)?.upload_state).toBe('failed');
    expect(apiFetch).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});

describe('uploadPhoto — only what is pending, one at a time', () => {
  test('an uploaded, failed, deleted or unknown photo is skipped', async () => {
    const failed = captured();
    photosRepository.markFailed(sqlite.db, failed.id);
    const deleted = captured();
    photosRepository.remove(sqlite.db, deleted.id);

    for (const id of [failed.id, deleted.id, randomUUID()]) {
      await expect(uploadPhoto(sqlite.db, id)).resolves.toBe('skipped');
    }
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test('never two uploads of the same photo at once', async () => {
    const photo = captured();
    apiFetch
      .mockResolvedValueOnce(uploadTarget())
      .mockResolvedValueOnce(serverPhoto(photo));

    const [first, second] = await Promise.all([
      uploadPhoto(sqlite.db, photo.id),
      uploadPhoto(sqlite.db, photo.id),
    ]);

    expect([first, second]).toEqual(['uploaded', 'skipped']);
    expect(__fs.upload).toHaveBeenCalledTimes(1);
  });

  test('cancelUpload stops a photo’s upload when it is deleted, and nothing resurrects it', async () => {
    const photo = captured();
    apiFetch.mockResolvedValueOnce(uploadTarget());
    let putStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => (putStarted = resolve));
    __fs.upload.mockImplementationOnce(
      (_uri: string, _url: string, options?: MockUploadOptions) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () =>
            reject(new Error('cancelled')),
          );
          putStarted();
        }),
    );

    const outcome = uploadPhoto(sqlite.db, photo.id);
    await started;
    photosRepository.remove(sqlite.db, photo.id);
    cancelUpload(photo.id);

    await expect(outcome).resolves.toBe('waiting');
    expect(apiPaths()).toEqual([`/trips/${tripId}/photos/upload-url`]);
    expect(row(photo.id)).toBeNull();
    // Cancelling a photo that is not uploading is harmless.
    expect(() => cancelUpload(randomUUID())).not.toThrow();
  });
});

describe('uploadPendingPhotos — the simple retry until User Story 6’s queue', () => {
  test('uploads the trip’s pending photos oldest first and leaves other trips alone', async () => {
    jest.useFakeTimers(FAKE_TIMERS);
    jest.setSystemTime(new Date('2026-06-01T10:00:00.000Z'));
    const first = captured();
    jest.setSystemTime(new Date('2026-06-01T11:00:00.000Z'));
    const second = captured();
    const failed = captured();
    photosRepository.markFailed(sqlite.db, failed.id);
    const elsewhere = tripsRepository.create(sqlite.db, {
      id: randomUUID(),
      title: 'Elsewhere',
      home_currency: 'EUR',
    });
    const otherTrip = captured({ trip_id: elsewhere.id });
    apiFetch
      .mockResolvedValueOnce(uploadTarget())
      .mockResolvedValueOnce(serverPhoto(first))
      .mockResolvedValueOnce(uploadTarget())
      .mockResolvedValueOnce(serverPhoto(second));

    await uploadPendingPhotos(sqlite.db, tripId);

    expect(apiFetch.mock.calls.map((call) => call[2].body?.id).filter(Boolean)).toEqual([
      first.id,
      second.id,
    ]);
    expect(row(first.id)?.upload_state).toBe('uploaded');
    expect(row(second.id)?.upload_state).toBe('uploaded');
    expect(row(failed.id)?.upload_state).toBe('failed');
    expect(row(otherTrip.id)?.upload_state).toBe('pending');
  });

  test('stops at the first photo that has to wait — no point trying the rest offline', async () => {
    captured();
    captured();
    apiFetch.mockRejectedValue(apiError(0, 'NETWORK'));

    await uploadPendingPhotos(sqlite.db, tripId);

    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  test('a drain asked for while one runs runs once more when it ends', async () => {
    const first = captured();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    apiFetch
      .mockImplementationOnce(async () => {
        await gate;
        return uploadTarget();
      })
      .mockResolvedValueOnce(serverPhoto(first));

    const running = uploadPendingPhotos(sqlite.db, tripId);
    const late = captured();
    apiFetch
      .mockResolvedValueOnce(uploadTarget())
      .mockResolvedValueOnce(serverPhoto(late));
    await uploadPendingPhotos(sqlite.db, tripId); // returns at once: one is running
    release();
    await running;

    expect(row(first.id)?.upload_state).toBe('uploaded');
    expect(row(late.id)?.upload_state).toBe('uploaded');
  });

  test('never rejects, even when the store cannot be read', async () => {
    sqlite.close();
    await expect(uploadPendingPhotos(sqlite.db, tripId)).resolves.toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalled();
    sqlite = await createTestDatabase();
  });
});

describe('isWaitingError', () => {
  test.each([
    [apiError(0, 'NETWORK'), true],
    [apiError(0, 'TIMEOUT'), true],
    [apiError(401, 'UNAUTHORIZED'), true],
    [apiError(404, 'TRIP_NOT_FOUND'), true],
    [apiError(429, 'RATE_LIMITED'), true],
    [apiError(500, 'UNKNOWN'), true],
    [apiError(0, 'CONFIG'), false],
    [apiError(404, 'PHOTO_NOT_FOUND'), false],
    [apiError(409, 'PHOTO_UPLOAD_MISSING'), false],
    [apiError(422, 'VALIDATION_FAILED'), false],
    [new Error('boom'), false],
  ])('%s → %s', (error, waiting) => {
    expect(isWaitingError(error)).toBe(waiting);
  });
});

describe('syncFiling — a refile reaches an uploaded photo (FR-028)', () => {
  function uploadedPhoto() {
    const photo = captured();
    photosRepository.markUploaded(sqlite.db, photo.id, {
      sentUpdatedAt: photo.updated_at,
      syncedAt: '2026-06-01T10:00:00.000Z',
      server: { moderation_state: 'pending', has_thumbnail: true },
    });
    return photo;
  }

  test('PATCHes the new filing and cleans the row', async () => {
    const photo = uploadedPhoto();
    const refiled = photosRepository.refile(sqlite.db, photo.id, 101);
    apiFetch.mockResolvedValueOnce(
      serverPhoto(refiled, { city_id: 101, has_thumbnail: true }),
    );

    await expect(syncFiling(sqlite.db, refiled)).resolves.toBe('synced');

    expect(apiFetch).toHaveBeenCalledWith(
      expect.anything(),
      `/photos/${photo.id}`,
      expect.objectContaining({ method: 'PATCH', body: { city_id: 101 } }),
    );
    expect(row(photo.id)).toMatchObject({ city_id: 101, is_dirty: false });
  });

  test('filing under no city sends an explicit null', async () => {
    const photo = uploadedPhoto();
    const refiled = photosRepository.refile(sqlite.db, photo.id, null);
    apiFetch.mockResolvedValueOnce(serverPhoto(refiled, { city_id: null }));

    await syncFiling(sqlite.db, refiled);

    expect(apiFetch.mock.calls[0]![2].body).toEqual({ city_id: null });
  });

  test('a photo still uploading is not PATCHed: its registration will carry the filing', async () => {
    const photo = captured();
    const refiled = photosRepository.refile(sqlite.db, photo.id, 101);

    await expect(syncFiling(sqlite.db, refiled)).resolves.toBe('skipped');

    expect(apiFetch).not.toHaveBeenCalled();
    expect(row(photo.id)?.is_dirty).toBe(true);
  });

  test('offline, the row stays dirty for the sync engine, silently', async () => {
    const photo = uploadedPhoto();
    const refiled = photosRepository.refile(sqlite.db, photo.id, 101);
    apiFetch.mockRejectedValueOnce(apiError(0, 'NETWORK'));

    await expect(syncFiling(sqlite.db, refiled)).resolves.toBe('waiting');

    expect(row(photo.id)?.is_dirty).toBe(true);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  test('an unexpected refusal is reported and the row stays dirty', async () => {
    const photo = uploadedPhoto();
    const refiled = photosRepository.refile(sqlite.db, photo.id, 101);
    apiFetch.mockRejectedValueOnce(apiError(404, 'PHOTO_NOT_FOUND'));

    await expect(syncFiling(sqlite.db, refiled)).resolves.toBe('waiting');

    expect(row(photo.id)?.is_dirty).toBe(true);
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  test('an answer to an older refile does not clean a newer one', async () => {
    jest.useFakeTimers(FAKE_TIMERS);
    jest.setSystemTime(new Date('2026-06-02T10:00:00.000Z'));
    const photo = uploadedPhoto();
    const first = photosRepository.refile(sqlite.db, photo.id, 101);
    jest.setSystemTime(new Date('2026-06-02T10:00:01.000Z'));
    apiFetch.mockImplementationOnce(async () => {
      photosRepository.refile(sqlite.db, photo.id, null); // the traveller changes it again
      return serverPhoto(first, { city_id: 101 });
    });

    await syncFiling(sqlite.db, first);

    expect(row(photo.id)).toMatchObject({ city_id: null, is_dirty: true });
  });
});
