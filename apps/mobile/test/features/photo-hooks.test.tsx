/**
 * The photo hooks against a real SQLite database — tasks.md T211, T117
 * (FR-028, FR-041; Constitution II).
 *
 * `usePhotos` is a live query: a write shows the moment SQLite reports it.
 * `usePhotoActions` writes locally first and only then reaches the network —
 * a refile dirties the row and asks for its PATCH; a delete is a tombstone
 * that cancels the photo's upload and removes its files; a retry puts a
 * failed photo back in the queue. `usePhotoUploads` drains the trip's pending
 * uploads whenever the gallery gains focus with the app in the foreground.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import type { PropsWithChildren } from 'react';

import { DatabaseProvider } from '@/db/client';
import { geographyRepository } from '@/db/repositories/geography';
import { photosRepository } from '@/db/repositories/photos';
import { tripsRepository } from '@/db/repositories/trips';
import { photos } from '@/db/schema';
import { photoPath, thumbnailPath } from '@/features/photos/photo-files';
import { syncFiling } from '@/features/photos/refile';
import { cancelUpload, uploadPendingPhotos, uploadPhoto } from '@/features/photos/upload';
import {
  usePhotoActions,
  usePhotos,
  usePhotoUploads,
} from '@/features/photos/use-photos';

import { createTestDatabase, type TestSqlite } from '../db/sqlite-harness';
import { DOCUMENTS, type FileSystemMock } from './photo-fakes';

jest.mock('expo-file-system', () =>
  jest.requireActual('./photo-fakes').createFileSystemMock(),
);
jest.mock('@/features/photos/upload', () => ({
  uploadPendingPhotos: jest.fn(async () => undefined),
  uploadPhoto: jest.fn(async () => 'waiting'),
  cancelUpload: jest.fn(),
}));
jest.mock('@/features/photos/refile', () => ({
  syncFiling: jest.fn(async () => 'skipped'),
}));

// Focus is a navigator's to give; here every render of the screen is focused.
jest.mock('expo-router', () => {
  const { useEffect } = require('react') as typeof import('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});

const mockAppState = { active: true };
jest.mock('@/hooks/use-app-active', () => ({
  useAppActive: () => mockAppState.active,
}));

const { __fs } = jest.requireMock('expo-file-system') as FileSystemMock;

let sqlite: TestSqlite;
let tripId: string;

function wrapper({ children }: PropsWithChildren) {
  return <DatabaseProvider value={sqlite.db}>{children}</DatabaseProvider>;
}

function captured(
  overrides: Partial<Parameters<typeof photosRepository.create>[1]> = {},
) {
  const id = randomUUID();
  const relative = photoPath(tripId, id);
  __fs.write(`${DOCUMENTS}/${relative}`);
  __fs.write(`${DOCUMENTS}/${thumbnailPath(relative)}`);
  return photosRepository.create(sqlite.db, {
    id,
    trip_id: tripId,
    city_id: null,
    taken_at: null,
    exif_lat: null,
    exif_lng: null,
    local_file_uri: relative,
    ...overrides,
  });
}

beforeEach(async () => {
  __fs.reset();
  mockAppState.active = true;
  sqlite = await createTestDatabase();
  geographyRepository.cacheCountries(sqlite.db, [
    { id: 1, iso_code: 'IT', name: 'Italy', continent: 'Europe' },
  ]);
  geographyRepository.cacheCities(sqlite.db, [
    {
      id: 100,
      country_id: 1,
      name: 'Roma',
      ascii_name: 'Roma',
      lat: 41.9028,
      lng: 12.4964,
      timezone: 'Europe/Rome',
      population: 2_800_000,
    },
  ]);
  tripId = tripsRepository.create(sqlite.db, {
    id: randomUUID(),
    title: 'Italy',
    home_currency: 'EUR',
  }).id;
});

afterEach(() => {
  sqlite.close();
});

describe('usePhotos', () => {
  test('is a live query: loading, then the trip’s photos with their city, then each write', async () => {
    const { result } = await renderHook(() => usePhotos(tripId), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBeNull();

    let photoId = '';
    await act(async () => {
      photoId = captured({ city_id: 100 }).id;
      sqlite.emitChange('photos');
    });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.data[0]).toMatchObject({
      id: photoId,
      city_name: 'Roma',
      upload_state: 'pending',
    });
  });
});

describe('usePhotoActions', () => {
  test('refile writes locally first, then asks for the PATCH with the row as written', async () => {
    const photo = captured();
    const { result } = await renderHook(() => usePhotoActions(), { wrapper });

    let refiled: ReturnType<typeof photosRepository.refile> | null = null;
    await act(async () => {
      refiled = result.current.refile(photo.id, 100);
    });

    expect(photosRepository.byId(sqlite.db, photo.id)).toMatchObject({
      city_id: 100,
      is_dirty: true,
    });
    expect(syncFiling).toHaveBeenCalledWith(sqlite.db, refiled);
  });

  test('a refile that cannot be written throws, and nothing is sent', async () => {
    const { result } = await renderHook(() => usePhotoActions(), { wrapper });

    expect(() => result.current.refile(randomUUID(), 100)).toThrow(/not found/i);
    expect(syncFiling).not.toHaveBeenCalled();
  });

  test('remove tombstones the photo, cancels its upload and deletes its files', async () => {
    const photo = captured();
    const { result } = await renderHook(() => usePhotoActions(), { wrapper });

    await act(async () => result.current.remove(photo.id));

    expect(photosRepository.byId(sqlite.db, photo.id)).toBeNull();
    const [raw] = sqlite.db.select().from(photos).all();
    expect(raw).toMatchObject({ deleted_at: expect.any(String), is_dirty: true });
    expect(cancelUpload).toHaveBeenCalledWith(photo.id);
    expect([...__fs.files.keys()]).toEqual([]);
  });

  test('retryUpload puts a failed photo back in the queue and tries it', async () => {
    const photo = captured();
    photosRepository.markFailed(sqlite.db, photo.id);
    const { result } = await renderHook(() => usePhotoActions(), { wrapper });

    await act(async () => result.current.retryUpload(photo.id));

    expect(photosRepository.byId(sqlite.db, photo.id)?.upload_state).toBe('pending');
    expect(uploadPhoto).toHaveBeenCalledWith(sqlite.db, photo.id);
  });
});

describe('usePhotoUploads', () => {
  test('drains the trip’s pending uploads on focus, and again when the app returns', async () => {
    const { rerender } = await renderHook(() => usePhotoUploads(tripId), { wrapper });
    expect(uploadPendingPhotos).toHaveBeenCalledWith(sqlite.db, tripId);
    expect(uploadPendingPhotos).toHaveBeenCalledTimes(1);

    mockAppState.active = false;
    await rerender({});
    expect(uploadPendingPhotos).toHaveBeenCalledTimes(1);

    mockAppState.active = true;
    await rerender({});
    expect(uploadPendingPhotos).toHaveBeenCalledTimes(2);
  });
});
