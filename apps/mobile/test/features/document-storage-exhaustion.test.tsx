/**
 * T139 — device storage exhausted while a document is captured
 * (sync-protocol.md §4: "fails the capture with a clear message and leaves no
 * half-written record"; FR-033, FR-041).
 *
 * A document is the stricter case: its image passes through THREE plaintext or
 * ciphertext files — the camera's or picker's temporary, the image editor's
 * re-encoded JPEG and the sealed vault file — and FR-033 forbids a plaintext
 * one outliving the capture. So the disk is made to fill at each step in turn
 * (the free-space check, the decode, the re-encode's write, the vault
 * directory, the sealed file's creation and write, the row) and every step
 * must leave the same thing behind: no row and NO FILE AT ALL on the fake disk.
 *
 * The hook then turns the failure into the words the screen shows — "not
 * enough space", not the generic "couldn’t be saved" — without reporting the
 * traveller's circumstance as a defect, and releases its lock so the next tap
 * counts.
 */
import { act, renderHook } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import { launchImageLibraryAsync } from 'expo-image-picker';
import type { PropsWithChildren } from 'react';

import { DatabaseProvider } from '@/db/client';
import { documentsRepository } from '@/db/repositories/documents';
import { tripsRepository } from '@/db/repositories/trips';
import { documents } from '@/db/schema';
import { MIN_DOCUMENT_FREE_BYTES, storeDocument } from '@/features/documents/capture';
import { DOCUMENT_CAPTURE_COPY } from '@/features/documents/document-copy';
import {
  CAPTURE_PROBLEM_TEXT,
  useDocumentCapture,
} from '@/features/documents/use-document-capture';
import { StorageFullError } from '@/lib/disk-space';
import { Sentry } from '@/lib/sentry';
import { kickUploadQueue } from '@/sync/upload-queue';

import { createTestDatabase, type TestSqlite } from '../db/sqlite-harness';
import {
  FAKE_CACHE_ROOT,
  FAKE_DOCUMENT_ROOT,
  type FakeFileSystemModule,
  type FakeImageManipulatorModule,
} from './document-doubles';

jest.mock('expo-file-system', () => require('./document-doubles').fileSystemDouble());
jest.mock('expo-crypto', () => require('./document-doubles').cryptoDouble());
jest.mock('expo-image-manipulator', () =>
  require('./document-doubles').imageManipulatorDouble(),
);
jest.mock('expo-camera', () => ({ scanFromURLAsync: jest.fn(async () => []) }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));
jest.mock('@/sync/upload-queue', () => ({
  kickUploadQueue: jest.fn(async () => undefined),
}));

const mockRouter = { replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const fileSystem = jest.requireMock('expo-file-system') as FakeFileSystemModule;
const manipulator = jest.requireMock(
  'expo-image-manipulator',
) as FakeImageManipulatorModule;
const crypto = jest.requireMock('expo-crypto') as { aesEncryptAsync: jest.Mock };
const secureStore = jest.requireMock('expo-secure-store') as { __reset: () => void };
const pick = launchImageLibraryAsync as jest.Mock;

const PICKED = `${FAKE_CACHE_ROOT}/ImagePicker/pass.jpeg`;
const MIB = 1024 * 1024;

let sqlite: TestSqlite;
let tripId: string;

function wrapper({ children }: PropsWithChildren) {
  return <DatabaseProvider value={sqlite.db}>{children}</DatabaseProvider>;
}

const rows = () => sqlite.db.select().from(documents).all();
const filesOnDisk = () => [...fileSystem.__files().keys()];

function capture() {
  return storeDocument(sqlite.db, {
    tripId,
    type: 'other',
    temporaryUri: PICKED,
    parsed: null,
  });
}

beforeEach(async () => {
  fileSystem.__reset();
  manipulator.__reset();
  secureStore.__reset();
  fileSystem.__seed(PICKED, 'RAW PICKED IMAGE');
  pick.mockReset().mockResolvedValue({ canceled: false, assets: [{ uri: PICKED }] });
  mockRouter.replace.mockReset();
  sqlite = await createTestDatabase();
  tripId = tripsRepository.create(sqlite.db, {
    id: randomUUID(),
    title: 'Montréal',
    home_currency: 'CAD',
  }).id;
});

afterEach(() => {
  sqlite.close();
});

const FULL_DISK = new Error('write failed: No space left on device');

interface Step {
  label: string;
  fill: () => void;
}

const STEPS: readonly Step[] = [
  {
    label: 'the free-space check, before any work',
    fill: () => fileSystem.__setFreeSpace(MIN_DOCUMENT_FREE_BYTES - 1),
  },
  {
    label: 'decoding the picture',
    fill: () => manipulator.__failNextRender(FULL_DISK),
  },
  {
    label: 'writing the re-encoded JPEG',
    fill: () => manipulator.__failNextSave(FULL_DISK),
  },
  {
    label: 'making the vault directory',
    fill: () =>
      fileSystem.__failCreate((uri) =>
        uri.endsWith('/document-vault') ? FULL_DISK : null,
      ),
  },
  {
    label: 'creating the sealed file (iOS wording)',
    fill: () =>
      fileSystem.__failCreate((uri) =>
        uri.endsWith('.sealed')
          ? new Error(
              'The file “x.sealed” couldn’t be saved because there isn’t enough space.',
            )
          : null,
      ),
  },
  {
    label: 'writing the sealed file',
    fill: () => fileSystem.__failNextWrite(FULL_DISK),
  },
  {
    label: 'sealing, when the failure says nothing but the free space now reads low',
    fill: () => {
      // Room at the start; gone by the time the encryption gives up.
      fileSystem.__setFreeSpace(MIN_DOCUMENT_FREE_BYTES + MIB);
      crypto.aesEncryptAsync.mockImplementationOnce(async () => {
        fileSystem.__setFreeSpace(MIN_DOCUMENT_FREE_BYTES - 1);
        throw new Error('Encryption failed');
      });
    },
  },
];

describe('storeDocument when the disk fills at each step', () => {
  test.each(STEPS.map((step) => [step.label, step] as const))(
    '%s: a StorageFullError, no row, and no file on disk',
    async (_label, step) => {
      step.fill();

      await expect(capture()).rejects.toBeInstanceOf(StorageFullError);

      expect(rows()).toEqual([]);
      // Not the camera's temporary, not the editor's JPEG, not a half-written seal.
      expect(filesOnDisk()).toEqual([]);
    },
  );

  test('the row failing for want of space takes the sealed file with it', async () => {
    const create = jest
      .spyOn(documentsRepository, 'create')
      .mockImplementationOnce(() => {
        throw new Error('SQLITE_FULL: database or disk is full');
      });

    try {
      await expect(capture()).rejects.toBeInstanceOf(StorageFullError);
    } finally {
      create.mockRestore();
    }

    expect(rows()).toEqual([]);
    expect(filesOnDisk()).toEqual([]);
  });

  test('a row that cannot be written, whose sealed file then cannot be deleted, still reports the original failure', async () => {
    const id = randomUUID();
    (jest.requireMock('expo-crypto').randomUUID as jest.Mock).mockReturnValueOnce(id);
    fileSystem.__failDelete(
      `${FAKE_DOCUMENT_ROOT}/document-vault/${id}.sealed`,
      new Error('Unable to delete file or directory'),
    );
    const create = jest
      .spyOn(documentsRepository, 'create')
      .mockImplementationOnce(() => {
        throw new Error('Document insert returned no row.');
      });

    try {
      await expect(capture()).rejects.toThrow('Document insert returned no row.');
    } finally {
      create.mockRestore();
    }

    expect(rows()).toEqual([]);
    // The leftover is ciphertext with no row: it is reported, not silently kept.
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Unable to delete file or directory' }),
    );
  });

  test('a failure that is not about space keeps its own error, and still leaves nothing', async () => {
    manipulator.__failNextRender(new Error('Could not decode image'));

    await expect(capture()).rejects.toThrow('Could not decode image');

    expect(rows()).toEqual([]);
    expect(filesOnDisk()).toEqual([]);
  });

  test('with room to spare the capture is stored and only the sealed file remains', async () => {
    fileSystem.__setFreeSpace(MIN_DOCUMENT_FREE_BYTES + MIB);

    const stored = await capture();

    expect(rows()).toHaveLength(1);
    expect(filesOnDisk()).toEqual([expect.stringContaining(`${stored.id}.sealed`)]);
  });

  test('once space is freed the same capture succeeds', async () => {
    fileSystem.__setFreeSpace(MIN_DOCUMENT_FREE_BYTES - 1);
    await expect(capture()).rejects.toBeInstanceOf(StorageFullError);

    fileSystem.__setFreeSpace(undefined);
    fileSystem.__seed(PICKED, 'RAW PICKED IMAGE');

    await expect(capture()).resolves.toMatchObject({ upload_state: 'pending' });
    expect(rows()).toHaveLength(1);
  });
});

describe('useDocumentCapture when the disk is full', () => {
  test('says so in words, releases its lock, reports nothing and opens nothing', async () => {
    fileSystem.__setFreeSpace(MIN_DOCUMENT_FREE_BYTES - 1);
    const { result } = await renderHook(() => useDocumentCapture(tripId, 'other'), {
      wrapper,
    });

    await act(async () => result.current.onLibrary());

    expect(result.current.problem).toBe('space');
    expect(CAPTURE_PROBLEM_TEXT.space).toBe(DOCUMENT_CAPTURE_COPY.noSpace);
    expect(DOCUMENT_CAPTURE_COPY.noSpace).toMatch(/free space/i);
    expect(result.current.busy).toBe(false);
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(kickUploadQueue).not.toHaveBeenCalled();
    expect(rows()).toEqual([]);
    expect(filesOnDisk()).toEqual([]);

    // The next tap counts: with space freed, the same picture is stored.
    fileSystem.__setFreeSpace(undefined);
    fileSystem.__seed(PICKED, 'RAW PICKED IMAGE');
    await act(async () => result.current.onLibrary());
    expect(result.current.problem).toBeNull();
    expect(rows()).toHaveLength(1);
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  });

  test('any other failure is the generic save problem and is reported as a defect', async () => {
    manipulator.__failNextRender(new Error('Could not decode image'));
    const { result } = await renderHook(() => useDocumentCapture(tripId, 'other'), {
      wrapper,
    });

    await act(async () => result.current.onLibrary());

    expect(result.current.problem).toBe('save');
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(rows()).toEqual([]);
  });
});
