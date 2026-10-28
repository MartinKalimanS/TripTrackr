/**
 * Feature 008 (T803) - what this phone forgets when the account is deleted (FR-005): every staged
 * photo and sealed document file the rows name, the offline maps, and the encrypted database file
 * itself. Real SQLite and the faithful file-system double, as the upload suites; the three native
 * doors (close, delete the database, clear the maps) are stand-ins, because they have no Jest form.
 */
import { randomUUID } from 'expo-crypto';

import { documentsRepository } from '@/db/repositories/documents';
import { photosRepository } from '@/db/repositories/photos';
import { tripsRepository } from '@/db/repositories/trips';
import { sealBase64, vaultPathFor } from '@/features/documents/document-vault';
import { photoPath } from '@/features/photos/photo-files';
import { wipeLocalAccount, type WipeDeps } from '@/features/auth/wipe-local-account';
import { Sentry } from '@/lib/sentry';

import { createTestDatabase, type TestSqlite } from '../db/sqlite-harness';
import type { FakeFileSystemModule } from './document-doubles';

jest.mock('expo-file-system', () => require('./document-doubles').fileSystemDouble());
jest.mock('expo-crypto', () => require('./document-doubles').cryptoDouble());
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const fileSystem = jest.requireMock('expo-file-system') as FakeFileSystemModule;
const captureException = Sentry.captureException as jest.Mock;

const USER = '6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e4f';

const filesOnDisk = () => [...fileSystem.__files().keys()];

let sqlite: TestSqlite;
let deps: jest.Mocked<WipeDeps>;

beforeEach(async () => {
  fileSystem.__reset();
  captureException.mockReset();
  sqlite = await createTestDatabase();
  deps = {
    closeDatabase: jest.fn().mockResolvedValue(undefined),
    deleteDatabase: jest.fn().mockResolvedValue(undefined),
    clearMaps: jest.fn().mockResolvedValue(undefined),
  };
});

afterEach(() => sqlite.close());

function newTrip() {
  return tripsRepository.create(sqlite.db, {
    id: randomUUID(),
    title: 'Lisbon',
    home_currency: 'EUR',
  });
}

/** A photo as capture leaves it: the row names the staged JPEG and its thumbnail. */
function stagedPhoto(tripId: string) {
  const id = randomUUID();
  const path = photoPath(tripId, id);
  fileSystem.__seed(`${fileSystem.Paths.document.uri}/${path}`, 'jpeg');
  fileSystem.__seed(
    `${fileSystem.Paths.document.uri}/${path.replace(/\.jpg$/, '.thumb.jpg')}`,
    'thumb',
  );
  return photosRepository.create(sqlite.db, {
    id,
    trip_id: tripId,
    city_id: null,
    taken_at: null,
    exif_lat: null,
    exif_lng: null,
    local_file_uri: path,
  });
}

async function sealedDocument(tripId: string) {
  const id = randomUUID();
  const sealed = await sealBase64(id, Buffer.from('boarding pass').toString('base64'));
  return documentsRepository.create(sqlite.db, {
    id,
    trip_id: tripId,
    type: 'boarding_pass',
    parsed_json: null,
    local_file_uri: sealed.path,
  });
}

describe('wipeLocalAccount (FR-005)', () => {
  test('removes every staged photo, its thumbnail and every sealed document the rows name', async () => {
    const trip = newTrip();
    stagedPhoto(trip.id);
    stagedPhoto(trip.id);
    const document = await sealedDocument(trip.id);
    expect(filesOnDisk().length).toBeGreaterThanOrEqual(5);
    expect(filesOnDisk().some((path) => path.includes(vaultPathFor(document.id)))).toBe(
      true,
    );

    const result = await wipeLocalAccount(sqlite.db, USER, deps);

    expect(filesOnDisk()).toEqual([]);
    expect(result.failures).toBe(0);
    expect(result.filesNamed).toBe(3);
  });

  test('a photo the traveller had already deleted names no file any more: it is skipped, not an error', async () => {
    const trip = newTrip();
    const photo = stagedPhoto(trip.id);
    photosRepository.remove(sqlite.db, photo.id);

    const result = await wipeLocalAccount(sqlite.db, USER, deps);

    // The tombstone let go of its path when it was made (the caller deletes the file then).
    expect(result).toEqual({ filesNamed: 0, failures: 0 });
  });

  test('clears the offline maps, closes the database and deletes its file, in that order', async () => {
    const order: string[] = [];
    deps.clearMaps.mockImplementation(() => {
      order.push('maps');
      return Promise.resolve();
    });
    deps.closeDatabase.mockImplementation(() => {
      order.push('close');
      return Promise.resolve();
    });
    deps.deleteDatabase.mockImplementation((name: string) => {
      order.push(`delete ${name}`);
      return Promise.resolve();
    });

    await wipeLocalAccount(sqlite.db, USER, deps);

    expect(order).toEqual(['maps', 'close', `delete triptrackr-${USER}.db`]);
  });

  test('a file that will not go is reported and counted, and the rest of the wipe carries on', async () => {
    const trip = newTrip();
    const photo = stagedPhoto(trip.id);
    fileSystem.__failDelete(
      `${fileSystem.Paths.document.uri}/${photo.local_file_uri}`,
      new Error(`cannot delete ${photo.local_file_uri} of ${trip.title}`),
    );

    const result = await wipeLocalAccount(sqlite.db, USER, deps);

    expect(result.failures).toBeGreaterThan(0);
    expect(captureException).toHaveBeenCalled();
    expect(deps.deleteDatabase).toHaveBeenCalledTimes(1);
  });

  test('a step that throws is reported, never thrown: the sign-out must still finish', async () => {
    deps.clearMaps.mockRejectedValueOnce(new Error('maps are locked'));
    deps.deleteDatabase.mockRejectedValueOnce(new Error('file is busy'));

    const result = await wipeLocalAccount(sqlite.db, USER, deps);

    expect(result.failures).toBe(2);
    expect(captureException).toHaveBeenCalledTimes(2);
  });

  test('reports nothing about the traveller: no path, id or title reaches an error report', async () => {
    const trip = newTrip();
    const photo = stagedPhoto(trip.id);
    fileSystem.__failDelete(
      `${fileSystem.Paths.document.uri}/${photo.local_file_uri}`,
      new Error(`cannot delete ${photo.local_file_uri} of ${trip.title}`),
    );

    await wipeLocalAccount(sqlite.db, USER, deps);

    const text = JSON.stringify(captureException.mock.calls);
    expect(text).not.toContain(trip.id);
    expect(text).not.toContain(USER);
    expect(text).not.toContain('Lisbon');
  });
});
