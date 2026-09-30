/**
 * Photo capture and selection — tasks.md T116, T211 (FR-028, FR-029, FR-041;
 * research D-34; sync-protocol.md §4; Constitution II, IV).
 *
 * `useCapture` over a real SQLite database, with the three native modules it
 * drives replaced by the contract-faithful fakes in photo-fakes.ts. What these
 * pin:
 *   - the library picker opens for several images with EXIF; the camera asks
 *     for permission first and a refusal is explained in words;
 *   - EXIF is read from the picker's asset BEFORE the re-encode, which makes a
 *     JPEG of at most 2048 px on the long edge and a ~400 px thumbnail;
 *   - both files land in app-private storage under a relative path, the row is
 *     written `pending` with the nearest trip city within 50 km, and the
 *     picker's and manipulator's cache copies are cleared;
 *   - a failure part-way leaves no half-written record — no row without its
 *     files, no files without their row — and says why (storage full, an
 *     unreadable image), reporting only what is a defect;
 *   - an upload is attempted right after a capture that added something.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import type { PropsWithChildren } from 'react';

import { DatabaseProvider } from '@/db/client';
import { geographyRepository } from '@/db/repositories/geography';
import { photosRepository } from '@/db/repositories/photos';
import { stopsRepository } from '@/db/repositories/stops';
import { tripsRepository } from '@/db/repositories/trips';
import { photos } from '@/db/schema';
import { describeCapture, MIN_FREE_BYTES } from '@/features/photos/capture';
import {
  photoFileOf,
  photoPath,
  thumbnailFileOf,
  thumbnailPath,
} from '@/features/photos/photo-files';
import { fitWithin } from '@/features/photos/reencode';
import { useCapture } from '@/features/photos/use-capture';
import { uploadPendingPhotos } from '@/features/photos/upload';
import { Sentry } from '@/lib/sentry';

import { createTestDatabase, type TestSqlite } from '../db/sqlite-harness';
import {
  CACHE,
  DOCUMENTS,
  type FileSystemMock,
  type ManipulatorMock,
} from './photo-fakes';

jest.mock('expo-file-system', () =>
  jest.requireActual('./photo-fakes').createFileSystemMock(),
);
jest.mock('expo-image-manipulator', () =>
  jest.requireActual('./photo-fakes').createManipulatorMock(),
);
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));
jest.mock('@/features/photos/upload', () => ({
  uploadPendingPhotos: jest.fn(async () => undefined),
}));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const { __fs } = jest.requireMock('expo-file-system') as FileSystemMock;
const { __manipulator, ImageManipulator } = jest.requireMock(
  'expo-image-manipulator',
) as ManipulatorMock;
const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;

let sqlite: TestSqlite;
let tripId: string;

function wrapper({ children }: PropsWithChildren) {
  return <DatabaseProvider value={sqlite.db}>{children}</DatabaseProvider>;
}

/** A photo the picker has copied into the cache, with the EXIF it read. */
function pickedAsset(
  name: string,
  exif: Record<string, unknown> | null,
  size = { width: 4032, height: 3024 },
): ImagePicker.ImagePickerAsset {
  const uri = `${CACHE}/ImagePicker/${name}.jpg`;
  __fs.write(uri, 3_000_000);
  __manipulator.images.set(uri, size);
  return { uri, width: size.width, height: size.height, exif, type: 'image' };
}

const ROME_EXIF = {
  DateTimeOriginal: '2026:05:12 18:30:05',
  OffsetTimeOriginal: '+02:00',
  GPSLatitude: 41.8986,
  GPSLatitudeRef: 'N',
  GPSLongitude: 12.4769,
  GPSLongitudeRef: 'E',
};

function libraryReturns(assets: ImagePicker.ImagePickerAsset[]) {
  picker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets });
}

function granted(granted: boolean, canAskAgain = true) {
  picker.requestCameraPermissionsAsync.mockResolvedValueOnce({
    granted,
    canAskAgain,
    expires: 'never',
    status: (granted ? 'granted' : 'denied') as ImagePicker.PermissionStatus,
  });
}

function allRows() {
  return sqlite.db.select().from(photos).all();
}

/** Every file on the fake disk under the app's documents directory. */
function stagedFiles() {
  return [...__fs.files.keys()].filter((uri) => uri.startsWith(`${DOCUMENTS}/`));
}

function cachedFiles() {
  return [...__fs.files.keys()].filter((uri) => uri.startsWith(`${CACHE}/`));
}

async function renderCapture() {
  const hook = await renderHook(() => useCapture(tripId), { wrapper });
  return hook;
}

beforeEach(async () => {
  __fs.reset();
  __manipulator.reset();
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
    {
      id: 101,
      country_id: 1,
      name: 'Firenze',
      ascii_name: 'Firenze',
      lat: 43.7696,
      lng: 11.2558,
      timezone: 'Europe/Rome',
      population: 360_000,
    },
  ]);
  tripId = tripsRepository.create(sqlite.db, {
    id: randomUUID(),
    title: 'Italy',
    home_currency: 'EUR',
  }).id;
  for (const cityId of [101, 100]) {
    stopsRepository.add(sqlite.db, {
      id: randomUUID(),
      trip_id: tripId,
      city_id: cityId,
      arrive_date: '2026-05-10',
      depart_date: '2026-05-12',
    });
  }
});

afterEach(() => {
  sqlite.close();
});

describe('adding from the photo library', () => {
  test('opens the system picker for several images, with their EXIF', async () => {
    libraryReturns([]);
    const { result } = await renderCapture();

    await act(() => result.current.addFromLibrary());

    expect(picker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        exif: true,
      }),
    );
    // The library needs no permission prompt: the system picker is the grant.
    expect(picker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
  });

  test('Acceptance 5.1/5.2: each photo is stored privately, pending, filed by its position', async () => {
    const rome = pickedAsset('rome', ROME_EXIF);
    const plain = pickedAsset('plain', null);
    libraryReturns([rome, plain]);
    const { result } = await renderCapture();

    await act(() => result.current.addFromLibrary());

    const rows = allRows();
    expect(rows).toHaveLength(2);
    const dated = rows.find((row) => row.taken_at !== null)!;
    expect(dated).toMatchObject({
      trip_id: tripId,
      taken_at: '2026-05-12T16:30:05.000Z',
      exif_lat: 41.8986,
      exif_lng: 12.4769,
      city_id: 100,
      is_public: false,
      upload_state: 'pending',
      is_dirty: true,
      local_file_uri: photoPath(tripId, dated.id),
    });
    const undated = rows.find((row) => row.taken_at === null)!;
    expect(undated).toMatchObject({ exif_lat: null, exif_lng: null, city_id: null });
    expect(result.current.message).toEqual({ tone: 'info', text: '2 photos added.' });
  });

  test('both files land in app-private storage and every cache copy is cleared', async () => {
    libraryReturns([pickedAsset('rome', ROME_EXIF)]);
    const { result } = await renderCapture();

    await act(() => result.current.addFromLibrary());

    const [row] = allRows();
    const relative = photoPath(tripId, row!.id);
    expect(stagedFiles().sort()).toEqual(
      [
        `${DOCUMENTS}/photos/${tripId}/${row!.id}.jpg`,
        `${DOCUMENTS}/photos/${tripId}/${row!.id}.thumb.jpg`,
      ].sort(),
    );
    expect(photoFileOf(relative)?.exists).toBe(true);
    expect(thumbnailFileOf(relative)?.exists).toBe(true);
    expect(cachedFiles()).toEqual([]);
  });

  test('re-encodes as JPEG at most 2048 px on the long edge, with a ~400 px thumbnail', async () => {
    libraryReturns([
      pickedAsset('landscape', null, { width: 4032, height: 3024 }),
      pickedAsset('portrait', null, { width: 3024, height: 4032 }),
      pickedAsset('small', null, { width: 1200, height: 800 }),
    ]);
    const { result } = await renderCapture();

    await act(() => result.current.addFromLibrary());

    const sizes = __manipulator.saved.map(({ width, height, format }) => [
      width,
      height,
      format,
    ]);
    expect(sizes).toEqual([
      [2048, 1536, 'jpeg'],
      [400, 300, 'jpeg'],
      [1536, 2048, 'jpeg'],
      [300, 400, 'jpeg'],
      // Never enlarged: already within the limit, still re-encoded (EXIF dropped).
      [1200, 800, 'jpeg'],
      [400, 267, 'jpeg'],
    ]);
    for (const save of __manipulator.saved) {
      expect(save.compress).toBeGreaterThan(0);
      expect(save.compress).toBeLessThanOrEqual(1);
    }
  });

  test('a position more than 50 km from every stop files the photo under no city', async () => {
    libraryReturns([
      pickedAsset('orvieto', {
        ...ROME_EXIF,
        GPSLatitude: 42.7185,
        GPSLongitude: 12.1107,
      }),
    ]);
    const { result } = await renderCapture();

    await act(() => result.current.addFromLibrary());

    expect(allRows()[0]).toMatchObject({ exif_lat: 42.7185, city_id: null });
  });

  test('a cancelled picker writes nothing and says nothing', async () => {
    picker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: true,
      assets: null,
    });
    const { result } = await renderCapture();

    await act(() => result.current.addFromLibrary());

    expect(allRows()).toEqual([]);
    expect(result.current.message).toBeNull();
    expect(uploadPendingPhotos).not.toHaveBeenCalled();
  });

  test('a picker that fails to open is explained and reported', async () => {
    picker.launchImageLibraryAsync.mockRejectedValueOnce(new Error('picker gone'));
    const { result } = await renderCapture();

    await act(() => result.current.addFromLibrary());

    expect(result.current.message).toEqual({
      tone: 'error',
      text: 'Your photo library couldn’t be opened. Please try again.',
    });
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  test('an upload is attempted right after a capture that added something', async () => {
    libraryReturns([pickedAsset('rome', ROME_EXIF)]);
    const { result } = await renderCapture();

    await act(() => result.current.addFromLibrary());

    expect(uploadPendingPhotos).toHaveBeenCalledWith(sqlite.db, tripId);
  });
});

describe('taking a photo', () => {
  test('asks for the camera, then opens it for one image with EXIF', async () => {
    granted(true);
    picker.launchCameraAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [pickedAsset('shot', { DateTimeOriginal: '2026:05:12 10:00:00' })],
    });
    const { result } = await renderCapture();

    await act(() => result.current.takePhoto());

    expect(picker.requestCameraPermissionsAsync).toHaveBeenCalled();
    expect(picker.launchCameraAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mediaTypes: ['images'], exif: true }),
    );
    expect(allRows()).toHaveLength(1);
    expect(result.current.message).toEqual({ tone: 'info', text: '1 photo added.' });
  });

  test('a refusal is explained in words and the camera never opens', async () => {
    granted(false, true);
    const { result } = await renderCapture();

    await act(() => result.current.takePhoto());

    expect(picker.launchCameraAsync).not.toHaveBeenCalled();
    expect(result.current.message).toEqual({
      tone: 'error',
      text: 'TripTrackr needs your permission to use the camera. Tap “Take a photo” to be asked again.',
    });
    expect(allRows()).toEqual([]);
  });

  test('a refusal the system will not ask again points to Settings', async () => {
    granted(false, false);
    const { result } = await renderCapture();

    await act(() => result.current.takePhoto());

    expect(result.current.message).toEqual({
      tone: 'error',
      text: 'Camera access is turned off for TripTrackr. You can turn it on in Settings.',
      openSettings: true,
    });
  });

  test('a camera that cannot open is explained and reported', async () => {
    granted(true);
    picker.launchCameraAsync.mockRejectedValueOnce(new Error('no camera'));
    const { result } = await renderCapture();

    await act(() => result.current.takePhoto());

    expect(result.current.message).toEqual({
      tone: 'error',
      text: 'The camera couldn’t be opened. Please try again.',
    });
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});

describe('a failure part-way leaves no half-written record (sync-protocol.md §4)', () => {
  test('storage filling up while the files are staged: no row, no files, and words', async () => {
    libraryReturns([pickedAsset('rome', ROME_EXIF)]);
    __fs.state.failMove = (to) =>
      to.endsWith('.thumb.jpg') ? new Error('No space left on device') : null;
    const { result } = await renderCapture();

    await act(() => result.current.addFromLibrary());

    expect(allRows()).toEqual([]);
    expect(stagedFiles()).toEqual([]);
    expect(cachedFiles()).toEqual([]);
    expect(result.current.message).toEqual({
      tone: 'error',
      text: 'There isn’t enough free space on this device. Free some space and try again.',
    });
    // The traveller's circumstance, not a defect.
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(uploadPendingPhotos).not.toHaveBeenCalled();
  });

  test('storage filling up during the re-encode: nothing staged, nothing left in the cache', async () => {
    libraryReturns([pickedAsset('rome', ROME_EXIF)]);
    __manipulator.state.failSaveAt = 2; // the thumbnail's save
    const { result } = await renderCapture();

    await act(() => result.current.addFromLibrary());

    expect(allRows()).toEqual([]);
    expect(stagedFiles()).toEqual([]);
    expect(cachedFiles()).toEqual([]);
    expect(result.current.message?.text).toMatch(/enough free space/);
  });

  test('a row that cannot be written takes its staged files with it', async () => {
    libraryReturns([pickedAsset('rome', ROME_EXIF)]);
    tripId = randomUUID(); // not on this device: the insert is refused
    const { result } = await renderCapture();

    await act(() => result.current.addFromLibrary());

    expect(allRows()).toEqual([]);
    expect(stagedFiles()).toEqual([]);
    expect(result.current.message).toEqual({
      tone: 'error',
      text: 'The photo couldn’t be saved on this device. Please try again.',
    });
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  test('too little free space is caught before any work is done', async () => {
    libraryReturns([pickedAsset('rome', ROME_EXIF)]);
    __fs.state.availableDiskSpace = MIN_FREE_BYTES - 1;
    const { result } = await renderCapture();

    await act(() => result.current.addFromLibrary());

    expect(ImageManipulator.manipulate).not.toHaveBeenCalled();
    expect(allRows()).toEqual([]);
    expect(result.current.message?.text).toMatch(/enough free space/);
  });

  test('an image that decodes to nothing is unreadable, not a zero-pixel photo', async () => {
    libraryReturns([pickedAsset('empty', null, { width: 0, height: 0 })]);
    const { result } = await renderCapture();

    await act(() => result.current.addFromLibrary());

    expect(allRows()).toEqual([]);
    expect(__manipulator.saved).toEqual([]);
    expect(result.current.message).toEqual({
      tone: 'error',
      text: 'This image couldn’t be read. Try a different photo.',
    });
  });

  test('an image that cannot be decoded is skipped with words, the others still added', async () => {
    const broken = pickedAsset('broken', ROME_EXIF);
    __manipulator.images.delete(broken.uri);
    libraryReturns([pickedAsset('first', ROME_EXIF), broken, pickedAsset('third', null)]);
    const { result } = await renderCapture();

    await act(() => result.current.addFromLibrary());

    expect(allRows()).toHaveLength(2);
    expect(result.current.message).toEqual({
      tone: 'error',
      text: '2 of 3 photos added. 1 couldn’t be read — try a different photo.',
    });
    expect(uploadPendingPhotos).toHaveBeenCalled();
  });
});

describe('one capture at a time', () => {
  test('is busy while it works, and a second tap meanwhile is ignored', async () => {
    let finish: (value: ImagePicker.ImagePickerResult) => void = () => undefined;
    picker.launchImageLibraryAsync.mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve)),
    );
    const { result } = await renderCapture();

    let first: Promise<void> = Promise.resolve();
    await act(async () => {
      first = result.current.addFromLibrary();
    });
    expect(result.current.busy).toBe(true);

    await act(() => result.current.addFromLibrary());
    expect(picker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish({ canceled: false, assets: [pickedAsset('rome', ROME_EXIF)] });
      await first;
    });
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(allRows()).toHaveLength(1);
  });

  test('clearMessage clears the last word', async () => {
    granted(false, true);
    const { result } = await renderCapture();
    await act(() => result.current.takePhoto());
    expect(result.current.message).not.toBeNull();

    await act(async () => result.current.clearMessage());
    expect(result.current.message).toBeNull();
  });
});

describe('pure helpers', () => {
  test.each([
    [4032, 3024, 2048, { width: 2048 }],
    [3024, 4032, 2048, { height: 2048 }],
    [2048, 2048, 2048, null],
    [1200, 800, 2048, null],
    [4000, 4000, 400, { width: 400 }],
  ])('fitWithin(%i, %i, %i)', (width, height, edge, expected) => {
    expect(fitWithin(width, height, edge)).toEqual(expected);
  });

  test.each([
    [[], null],
    [[{ kind: 'added', photoId: 'a' }], { tone: 'info', text: '1 photo added.' }],
    [
      [{ kind: 'skipped', reason: 'unreadable' }],
      { tone: 'error', text: 'This image couldn’t be read. Try a different photo.' },
    ],
    [
      [
        { kind: 'skipped', reason: 'failed' },
        { kind: 'skipped', reason: 'noSpace' },
      ],
      {
        tone: 'error',
        text: 'None of the 2 photos could be added. There isn’t enough free space on this device. Free some space and try again.',
      },
    ],
    [
      [
        { kind: 'added', photoId: 'a' },
        { kind: 'skipped', reason: 'failed' },
      ],
      {
        tone: 'error',
        text: '1 of 2 photos added. 1 couldn’t be saved on this device — please try again.',
      },
    ],
  ] as const)('describeCapture(%j)', (outcomes, expected) => {
    expect(describeCapture(outcomes)).toEqual(expected);
  });

  test('paths are relative to the documents directory and cannot escape it', () => {
    const trip = randomUUID();
    const photo = randomUUID();
    expect(photoPath(trip, photo)).toBe(`photos/${trip}/${photo}.jpg`);
    expect(thumbnailPath(photoPath(trip, photo))).toBe(
      `photos/${trip}/${photo}.thumb.jpg`,
    );
    expect(photoFileOf(photoPath(trip, photo))?.uri).toBe(
      `${DOCUMENTS}/photos/${trip}/${photo}.jpg`,
    );
    expect(photoFileOf(`photos/${trip}/../../secret.jpg`)).toBeNull();
    expect(photoFileOf('/etc/passwd')).toBeNull();
    expect(photoFileOf(null)).toBeNull();
    expect(thumbnailFileOf('photos/x/y.jpg')).toBeNull();
  });

  test('a photo with a staged file resolves; its repository row agrees', async () => {
    libraryReturns([pickedAsset('rome', ROME_EXIF)]);
    const { result } = await renderCapture();
    await act(() => result.current.addFromLibrary());

    const [row] = allRows();
    expect(photosRepository.byId(sqlite.db, row!.id)?.local_file_uri).toBe(
      photoPath(tripId, row!.id),
    );
  });
});
