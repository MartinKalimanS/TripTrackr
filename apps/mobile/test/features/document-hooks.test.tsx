/**
 * T211 (document half) — documents as live local queries, the actions bound
 * to the open store, and the decrypted image for the viewer, against a real
 * SQLite database, the real vault over its faithful doubles, and `apiFetch`
 * mocked at the module boundary.
 *
 * Pinned: a stored document appears in the trip's live list the moment its
 * table changes; storing and confirming each start an upload attempt at once
 * (a simple retry until User Story 6's queue); deleting tombstones the row and
 * deletes its sealed file; and the viewer's image is decrypted in memory,
 * with a designed state for "not on this device" and "cannot be opened".
 */
import type { DocumentParsedFields } from '@triptrackr/contracts';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import type { PropsWithChildren } from 'react';

import { DatabaseProvider } from '@/db/client';
import { documentsRepository } from '@/db/repositories/documents';
import { tripsRepository } from '@/db/repositories/trips';
import {
  useDocument,
  useDocumentActions,
  useDocumentImage,
  useDocuments,
} from '@/features/documents/use-documents';
import { ApiRequestError } from '@/lib/api-client';
import { Sentry } from '@/lib/sentry';
import { kickUploadQueue } from '@/sync/upload-queue';

import { createTestDatabase, type TestSqlite } from '../db/sqlite-harness';
import {
  FAKE_CACHE_ROOT,
  fakeJpegText,
  type FakeFileSystemModule,
} from './document-doubles';

jest.mock('expo-file-system', () => require('./document-doubles').fileSystemDouble());
jest.mock('expo-crypto', () => require('./document-doubles').cryptoDouble());
jest.mock('expo-image-manipulator', () =>
  require('./document-doubles').imageManipulatorDouble(),
);
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return { ...actual, apiFetch: jest.fn() };
});
jest.mock('@/sync/upload-queue', () => ({
  kickUploadQueue: jest.fn(async () => undefined),
}));

const { apiFetch } = jest.requireMock('@/lib/api-client') as { apiFetch: jest.Mock };
const fileSystem = jest.requireMock('expo-file-system') as FakeFileSystemModule;
const secureStore = jest.requireMock('expo-secure-store') as { __reset: () => void };

const FIELDS: DocumentParsedFields = {
  flight_number: 'AC834',
  flight_date: '2026-11-22',
  passenger_name: 'DESMARAIS/LUC',
};
const CAMERA_OUTPUT = `${FAKE_CACHE_ROOT}/Camera/5A1B.jpg`;

let sqlite: TestSqlite;

function wrapper({ children }: PropsWithChildren) {
  return <DatabaseProvider value={sqlite.db}>{children}</DatabaseProvider>;
}

beforeEach(async () => {
  fileSystem.__reset();
  secureStore.__reset();
  fileSystem.__seed(CAMERA_OUTPUT, 'RAW CAMERA JPEG');
  apiFetch
    .mockReset()
    .mockRejectedValue(new ApiRequestError(0, { code: 'NETWORK', message: 'offline' }));
  sqlite = await createTestDatabase();
});

afterEach(() => {
  sqlite.close();
});

function newTrip() {
  return tripsRepository.create(sqlite.db, {
    id: randomUUID(),
    title: 'Montréal',
    home_currency: 'CAD',
  });
}

describe('useDocuments / useDocument / useDocumentActions', () => {
  test('a stored document appears in the live list, local-first, and the upload queue is asked to look for work', async () => {
    const trip = newTrip();
    const { result } = await renderHook(
      () => ({ list: useDocuments(trip.id), actions: useDocumentActions() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.loading).toBe(false));
    expect(result.current.list.data).toEqual([]);

    let documentId = '';
    await act(async () => {
      const stored = await result.current.actions.store({
        tripId: trip.id,
        type: 'boarding_pass',
        temporaryUri: CAMERA_OUTPUT,
        parsed: FIELDS,
      });
      documentId = stored.id;
      sqlite.emitChange('documents');
    });

    await waitFor(() => expect(result.current.list.data).toHaveLength(1));
    expect(result.current.list.data[0]).toMatchObject({
      id: documentId,
      parsed_json: FIELDS,
      upload_state: 'pending',
    });
    // The queue decides when the bytes go (Wi-Fi now, cellular later): the hook
    // only asks it to look, and never reaches for the network itself.
    expect(kickUploadQueue).toHaveBeenCalledWith('capture');
    expect(apiFetch).not.toHaveBeenCalled();
    expect(documentsRepository.byId(sqlite.db, documentId)?.upload_state).toBe('pending');
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  test('confirming the fields stores them as confirmed and asks the upload queue to send them', async () => {
    const trip = newTrip();
    const { result } = await renderHook(() => useDocumentActions(), { wrapper });
    let documentId = '';
    await act(async () => {
      documentId = (
        await result.current.store({
          tripId: trip.id,
          type: 'boarding_pass',
          temporaryUri: CAMERA_OUTPUT,
          parsed: null,
        })
      ).id;
    });
    (kickUploadQueue as jest.Mock).mockClear();

    let confirmed: { parsed_confirmed_at: string | null } | null = null;
    await act(async () => {
      confirmed = result.current.confirmFields(documentId, FIELDS);
    });

    expect(confirmed).toMatchObject({ parsed_confirmed_at: expect.any(String) });
    expect(kickUploadQueue).toHaveBeenCalledWith('confirm');
  });

  test('useDocument follows one document, and removing it tombstones the row and deletes its sealed file', async () => {
    const trip = newTrip();
    const { result: actions } = await renderHook(() => useDocumentActions(), { wrapper });
    let documentId = '';
    await act(async () => {
      documentId = (
        await actions.current.store({
          tripId: trip.id,
          type: 'other',
          temporaryUri: CAMERA_OUTPUT,
          parsed: null,
        })
      ).id;
    });
    const { result } = await renderHook(() => useDocument(documentId), { wrapper });
    await waitFor(() => expect(result.current.data?.id).toBe(documentId));

    await act(async () => {
      actions.current.remove(documentId);
      sqlite.emitChange('documents');
    });

    await waitFor(() => expect(result.current.data).toBeNull());
    expect([...fileSystem.__files().keys()]).toEqual([]);
    expect(documentsRepository.byId(sqlite.db, documentId)).toBeNull();
  });

  test('a sealed file that will not delete is reported; the deletion itself still stands', async () => {
    const trip = newTrip();
    const { result } = await renderHook(() => useDocumentActions(), { wrapper });
    let documentId = '';
    await act(async () => {
      documentId = (
        await result.current.store({
          tripId: trip.id,
          type: 'other',
          temporaryUri: CAMERA_OUTPUT,
          parsed: null,
        })
      ).id;
    });
    const [sealedUri] = [...fileSystem.__files().keys()];
    const failure = new Error('EACCES');
    fileSystem.__failDelete(sealedUri ?? '', failure);

    await act(async () => {
      expect(() => result.current.remove(documentId)).not.toThrow();
    });

    expect(Sentry.captureException).toHaveBeenCalledWith(failure);
    expect(documentsRepository.byId(sqlite.db, documentId)).toBeNull();
  });

  test('syncTrip asks the upload queue to look for whatever the API is still owed', async () => {
    const trip = newTrip();
    const { result } = await renderHook(() => useDocumentActions(), { wrapper });

    await act(async () => {
      await result.current.syncTrip(trip.id);
    });

    expect(kickUploadQueue).toHaveBeenCalledWith('focus');
    // The hook itself never talks to the API: the queue owns when and over what.
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe('useDocumentImage — the viewer’s image, decrypted in memory', () => {
  async function storedId(tripId: string) {
    const { result } = await renderHook(() => useDocumentActions(), { wrapper });
    let id = '';
    await act(async () => {
      id = (
        await result.current.store({
          tripId,
          type: 'boarding_pass',
          temporaryUri: CAMERA_OUTPUT,
          parsed: null,
        })
      ).id;
    });
    return documentsRepository.byId(sqlite.db, id);
  }

  test('opens the sealed file to base64 — nothing is written back to disk', async () => {
    const document = await storedId(newTrip().id);
    const before = fileSystem.__files();

    const seen: string[] = [];
    const { result } = await renderHook(() => {
      const image = useDocumentImage(
        document?.id ?? '',
        document?.local_file_uri ?? null,
      );
      seen.push(image.status);
      return image;
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(seen[0]).toBe('opening');
    const ready = result.current as { status: 'ready'; base64: string };
    expect(Buffer.from(ready.base64, 'base64').toString()).toBe(fakeJpegText(1000, 750));
    expect(fileSystem.__files()).toEqual(before);
  });

  test('a document whose bytes are not on this device says so', async () => {
    const { result } = await renderHook(() => useDocumentImage(randomUUID(), null));
    expect(result.current).toEqual({ status: 'absent' });
  });

  test('a sealed file that cannot be opened is reported and shown as unreadable', async () => {
    const document = await storedId(newTrip().id);
    secureStore.__reset(); // another device key

    const { result } = await renderHook(() =>
      useDocumentImage(document?.id ?? '', document?.local_file_uri ?? null),
    );

    await waitFor(() => expect(result.current).toEqual({ status: 'unreadable' }));
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
