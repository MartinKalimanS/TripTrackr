/**
 * T134 — deleting a photo with an upload in flight cancels the upload and
 * removes the staged files (sync-protocol.md §4: "Deleting a record with a
 * pending upload cancels the upload job and removes the staged file"; FR-039,
 * FR-041).
 *
 * The real `usePhotoActions().remove` and the real uploader, on a real SQLite
 * database over the fake file system of photo-fakes.ts, whose native upload
 * honours its `AbortSignal` the way `File.upload` does. Pinned: the PUT in
 * flight is aborted; the photo is never registered with the API; the row is a
 * dirty tombstone that nothing marks `uploaded`; both staged files are gone;
 * a photo deleted before the queue reaches it is never sent; and a deletion
 * during the registration call (after the bytes) cancels that too.
 */
import { act, renderHook } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import type { PropsWithChildren } from 'react';

import { DatabaseProvider } from '@/db/client';
import { photosRepository } from '@/db/repositories/photos';
import { tripsRepository } from '@/db/repositories/trips';
import { photos } from '@/db/schema';
import { photoPath, thumbnailPath } from '@/features/photos/photo-files';
import { uploadPendingPhotos, uploadPhoto } from '@/features/photos/upload';
import { usePhotoActions } from '@/features/photos/use-photos';
import { ApiRequestError } from '@/lib/api-client';
import { Sentry } from '@/lib/sentry';

import { createTestDatabase, type TestSqlite } from '../db/sqlite-harness';
import {
  DOCUMENTS,
  type FileSystemMock,
  type MockUploadOptions,
} from '../features/photo-fakes';

jest.mock('expo-file-system', () =>
  jest.requireActual('../features/photo-fakes').createFileSystemMock(),
);
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return { ...actual, apiFetch: jest.fn() };
});
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));
jest.mock('@/features/photos/refile', () => ({
  syncFiling: jest.fn(async () => 'skipped'),
}));
jest.mock('@/sync/upload-queue', () => ({
  kickUploadQueue: jest.fn(async () => undefined),
}));

const { apiFetch } = jest.requireMock('@/lib/api-client') as { apiFetch: jest.Mock };
const { __fs } = jest.requireMock('expo-file-system') as FileSystemMock;

const OWNER = '0f9d0c1e-6f3a-4c1b-9a51-7a3b2c1d0e9f';

let sqlite: TestSqlite;
let tripId: string;

function wrapper({ children }: PropsWithChildren) {
  return <DatabaseProvider value={sqlite.db}>{children}</DatabaseProvider>;
}

beforeEach(async () => {
  __fs.reset();
  apiFetch.mockReset();
  sqlite = await createTestDatabase();
  tripId = tripsRepository.create(sqlite.db, {
    id: randomUUID(),
    title: 'Italy',
    home_currency: 'EUR',
  }).id;
});

afterEach(() => {
  sqlite.close();
});

function captured() {
  const id = randomUUID();
  const relative = photoPath(tripId, id);
  __fs.write(`${DOCUMENTS}/${relative}`, 900_000);
  __fs.write(`${DOCUMENTS}/${thumbnailPath(relative)}`, 40_000);
  return photosRepository.create(sqlite.db, {
    id,
    trip_id: tripId,
    city_id: null,
    taken_at: null,
    exif_lat: null,
    exif_lng: null,
    local_file_uri: relative,
  });
}

const uploadTarget = () => ({
  upload_url: 'https://bucket.example/photos/abc?X-Amz-Signature=top-secret',
  storage_key: `${OWNER}/${randomUUID()}`,
  expires_in_seconds: 900,
});

function rawRow(id: string) {
  return sqlite.db
    .select()
    .from(photos)
    .all()
    .find((row) => row.id === id);
}

/** A native upload that stays open until its signal aborts. */
function putHangsUntilAborted() {
  let opened: () => void = () => undefined;
  const isOpen = new Promise<void>((resolve) => (opened = resolve));
  __fs.upload.mockImplementationOnce(
    (_uri: string, _url: string, options?: MockUploadOptions) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new Error('cancelled')));
        opened();
      }),
  );
  return isOpen;
}

describe('deleting a photo while its bytes are uploading', () => {
  test('aborts the PUT, never registers the photo, tombstones the row and removes both files', async () => {
    const photo = captured();
    apiFetch.mockResolvedValueOnce(uploadTarget());
    const putOpen = putHangsUntilAborted();
    const { result } = await renderHook(() => usePhotoActions(), { wrapper });

    const outcome = uploadPhoto(sqlite.db, photo.id);
    await putOpen;
    await act(async () => result.current.remove(photo.id));

    await expect(outcome).resolves.toBe('waiting');
    const signal = __fs.upload.mock.calls[0]?.[2]?.signal;
    expect(signal?.aborted).toBe(true);
    // Only the signed URL was asked for: the photo was never registered.
    expect(apiFetch.mock.calls.map((call) => call[1])).toEqual([
      `/trips/${tripId}/photos/upload-url`,
    ]);
    expect(rawRow(photo.id)).toMatchObject({
      deleted_at: expect.any(String),
      is_dirty: true,
      upload_state: 'pending',
      local_file_uri: null,
    });
    expect(photosRepository.byId(sqlite.db, photo.id)).toBeNull();
    expect([...__fs.files.keys()]).toEqual([]);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  test('a deletion while the registration is in flight cancels that request too', async () => {
    const photo = captured();
    apiFetch.mockResolvedValueOnce(uploadTarget());
    let registrationSignal: AbortSignal | undefined;
    let registering: () => void = () => undefined;
    const isRegistering = new Promise<void>((resolve) => (registering = resolve));
    apiFetch.mockImplementationOnce(
      (_schema: unknown, _path: string, options: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          registrationSignal = options.signal;
          options.signal?.addEventListener('abort', () =>
            reject(new ApiRequestError(0, { code: 'NETWORK', message: 'aborted' })),
          );
          registering();
        }),
    );
    const { result } = await renderHook(() => usePhotoActions(), { wrapper });

    const outcome = uploadPhoto(sqlite.db, photo.id);
    await isRegistering;
    await act(async () => result.current.remove(photo.id));

    await expect(outcome).resolves.toBe('waiting');
    expect(registrationSignal?.aborted).toBe(true);
    // Never marked uploaded, however the race fell.
    expect(rawRow(photo.id)).toMatchObject({ upload_state: 'pending', is_dirty: true });
    expect(photosRepository.byId(sqlite.db, photo.id)).toBeNull();
    expect([...__fs.files.keys()]).toEqual([]);
  });
});

describe('a photo deleted before the queue reaches it', () => {
  test('is never sent, and the photos after it still are', async () => {
    const doomed = captured();
    const kept = captured();
    const { result } = await renderHook(() => usePhotoActions(), { wrapper });
    await act(async () => result.current.remove(doomed.id));
    apiFetch.mockImplementation(
      async (_schema: unknown, path: string, options: { body?: { id: string } }) => {
        if (path.endsWith('/upload-url')) return uploadTarget();
        return {
          photo: {
            id: options.body?.id,
            trip_id: tripId,
            city_id: null,
            taken_at: null,
            exif_lat: null,
            exif_lng: null,
            is_public: false,
            upload_state: 'uploaded',
            moderation_state: 'pending',
            has_thumbnail: false,
            created_at: kept.created_at,
            updated_at: kept.updated_at,
            thumbnail_url: null,
          },
        };
      },
    );

    await uploadPendingPhotos(sqlite.db, tripId);

    const registered = apiFetch.mock.calls
      .filter((call) => !(call[1] as string).endsWith('/upload-url'))
      .map((call) => (call[2] as { body: { id: string } }).body.id);
    expect(registered).toEqual([kept.id]);
    expect(__fs.upload).toHaveBeenCalledTimes(1);
    expect(photosRepository.byId(sqlite.db, kept.id)?.upload_state).toBe('uploaded');
  });
});
