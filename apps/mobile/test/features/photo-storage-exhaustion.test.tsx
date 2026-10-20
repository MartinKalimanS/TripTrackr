/**
 * T139 — device storage exhausted mid-capture (sync-protocol.md §4: "fails the
 * capture with a clear message and leaves no half-written record"; FR-041).
 *
 * The capture runs for real over a real SQLite database and the contract-
 * faithful fakes of photo-fakes.ts, and the disk is made to fill at EACH step
 * in turn — the free-space check, both re-encodes, making the directory, both
 * moves into app-private storage, and the row itself — in each of the ways the
 * SDK 57 reference leaves a full disk to show itself (there is no error code:
 * Android's "No space left on device", iOS's "there isn’t enough space",
 * SQLite's "database or disk is full", or no words at all and a low free-space
 * reading). What every step must leave behind is the same: no row, no staged
 * file, no cache file, the traveller's circumstance shown in words and not
 * reported as a defect, and no upload queued for a photo that does not exist.
 */
import { act, renderHook } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import type { PropsWithChildren } from 'react';

import { DatabaseProvider } from '@/db/client';
import { geographyRepository } from '@/db/repositories/geography';
import { photosRepository } from '@/db/repositories/photos';
import { tripsRepository } from '@/db/repositories/trips';
import { photos } from '@/db/schema';
import { MIN_FREE_BYTES } from '@/features/photos/capture';
import { PHOTO_COPY } from '@/features/photos/photo-copy';
import { useCapture } from '@/features/photos/use-capture';
import { Sentry } from '@/lib/sentry';
import { kickUploadQueue } from '@/sync/upload-queue';

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
jest.mock('@/sync/upload-queue', () => ({
  kickUploadQueue: jest.fn(async () => undefined),
}));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const { __fs } = jest.requireMock('expo-file-system') as FileSystemMock;
const { __manipulator } = jest.requireMock('expo-image-manipulator') as ManipulatorMock;
const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;

let sqlite: TestSqlite;
let tripId: string;

function wrapper({ children }: PropsWithChildren) {
  return <DatabaseProvider value={sqlite.db}>{children}</DatabaseProvider>;
}

function pickedAsset(name: string): ImagePicker.ImagePickerAsset {
  const uri = `${CACHE}/ImagePicker/${name}.jpg`;
  __fs.write(uri, 3_000_000);
  __manipulator.images.set(uri, { width: 4032, height: 3024 });
  return { uri, width: 4032, height: 3024, exif: null, type: 'image' };
}

function libraryReturns(assets: ImagePicker.ImagePickerAsset[]) {
  picker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets });
}

const allRows = () => sqlite.db.select().from(photos).all();
const stagedFiles = () =>
  [...__fs.files.keys()].filter((uri) => uri.startsWith(`${DOCUMENTS}/`));
const cachedFiles = () =>
  [...__fs.files.keys()].filter((uri) => uri.startsWith(`${CACHE}/`));

const isThumbnail = (path: string) => path.endsWith('.thumb.jpg');

beforeEach(async () => {
  __fs.reset();
  __manipulator.reset();
  sqlite = await createTestDatabase();
  geographyRepository.cacheCountries(sqlite.db, [
    { id: 1, iso_code: 'IT', name: 'Italy', continent: 'Europe' },
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

interface Step {
  label: string;
  fill: () => void;
}

const STEPS: readonly Step[] = [
  {
    label: 'the free-space check, before any work',
    fill: () => {
      __fs.state.availableDiskSpace = MIN_FREE_BYTES - 1;
    },
  },
  {
    label: 'the full-size re-encode',
    fill: () => {
      __manipulator.state.failSaveAt = 1;
    },
  },
  {
    label: 'the thumbnail re-encode',
    fill: () => {
      __manipulator.state.failSaveAt = 2;
    },
  },
  {
    label: 'making the trip’s photo directory',
    fill: () => {
      __fs.state.failCreate = (uri) =>
        uri.endsWith('/photos') || uri.includes('/photos/')
          ? new Error('ENOSPC: no space left on device, mkdir')
          : null;
    },
  },
  {
    label: 'moving the JPEG into app-private storage (Android wording)',
    fill: () => {
      __fs.state.failMove = (to) =>
        isThumbnail(to) ? null : new Error('write failed: No space left on device');
    },
  },
  {
    label: 'moving the thumbnail into app-private storage (iOS wording)',
    fill: () => {
      __fs.state.failMove = (to) =>
        isThumbnail(to)
          ? new Error(
              'The file “x.thumb.jpg” couldn’t be saved because there isn’t enough space.',
            )
          : null;
    },
  },
  {
    label: 'a move that fails without saying why while the free space reads low',
    fill: () => {
      __fs.state.failMove = () => {
        __fs.state.availableDiskSpace = MIN_FREE_BYTES - 1;
        return new Error('Unable to move file or directory: unknown');
      };
    },
  },
];

describe('the disk fills at each step of a photo capture', () => {
  test.each(STEPS.map((step) => [step.label, step] as const))(
    '%s: no row, no file, words — and nothing queued',
    async (_label, step) => {
      libraryReturns([pickedAsset('rome')]);
      step.fill();
      const { result } = await renderHook(() => useCapture(tripId), { wrapper });

      await act(() => result.current.addFromLibrary());

      expect(allRows()).toEqual([]);
      expect(stagedFiles()).toEqual([]);
      expect(cachedFiles()).toEqual([]);
      expect(result.current.message).toEqual({
        tone: 'error',
        text: PHOTO_COPY.noSpace,
      });
      // The traveller's circumstance, not a defect: nothing is reported.
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(kickUploadQueue).not.toHaveBeenCalled();
    },
  );

  test('the row itself failing for want of space takes its staged files with it', async () => {
    libraryReturns([pickedAsset('rome')]);
    const create = jest.spyOn(photosRepository, 'create').mockImplementationOnce(() => {
      throw new Error('SQLITE_FULL: database or disk is full');
    });
    const { result } = await renderHook(() => useCapture(tripId), { wrapper });

    try {
      await act(() => result.current.addFromLibrary());
    } finally {
      create.mockRestore();
    }

    expect(allRows()).toEqual([]);
    expect(stagedFiles()).toEqual([]);
    expect(cachedFiles()).toEqual([]);
    expect(result.current.message?.text).toBe(PHOTO_COPY.noSpace);
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(kickUploadQueue).not.toHaveBeenCalled();
  });

  test('a failure that is not about space is still a defect: reported, and worded as such', async () => {
    libraryReturns([pickedAsset('rome')]);
    __fs.state.failMove = () => new Error('Unable to move file or directory: denied');
    const { result } = await renderHook(() => useCapture(tripId), { wrapper });

    await act(() => result.current.addFromLibrary());

    expect(allRows()).toEqual([]);
    expect(stagedFiles()).toEqual([]);
    expect(result.current.message).toEqual({
      tone: 'error',
      text: PHOTO_COPY.saveFailed,
    });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});

describe('a pick the disk fills part-way through', () => {
  test('the photos saved before it keep their bytes; the one it stopped on leaves nothing', async () => {
    libraryReturns([pickedAsset('first'), pickedAsset('second')]);
    let moves = 0;
    // Moves go JPEG, thumbnail for the first photo; the second's JPEG is the third.
    __fs.state.failMove = () => {
      moves += 1;
      return moves === 3 ? new Error('ENOSPC: no space left on device') : null;
    };
    const { result } = await renderHook(() => useCapture(tripId), { wrapper });

    await act(() => result.current.addFromLibrary());

    const [saved, ...others] = allRows();
    expect(others).toEqual([]);
    expect(saved).toMatchObject({ upload_state: 'pending', is_dirty: true });
    expect(stagedFiles()).toHaveLength(2);
    expect(stagedFiles().every((uri) => uri.includes(saved!.id))).toBe(true);
    expect(cachedFiles()).toEqual([]);
    expect(result.current.message).toEqual({
      tone: 'error',
      text: '1 of 2 photos added. 1 couldn’t be saved — there isn’t enough free space on this device.',
    });
    // The photo that did land is queued; the one that did not is not.
    expect(kickUploadQueue).toHaveBeenCalledTimes(1);
  });

  test('once space is freed the same capture succeeds: nothing of the failure is left to block it', async () => {
    libraryReturns([pickedAsset('rome')]);
    __fs.state.failMove = () => new Error('No space left on device');
    const { result } = await renderHook(() => useCapture(tripId), { wrapper });
    await act(() => result.current.addFromLibrary());
    expect(allRows()).toEqual([]);

    __fs.state.failMove = null;
    libraryReturns([pickedAsset('rome-again')]);
    await act(() => result.current.addFromLibrary());

    expect(allRows()).toHaveLength(1);
    expect(stagedFiles()).toHaveLength(2);
    expect(result.current.message).toEqual({ tone: 'info', text: '1 photo added.' });
  });
});
