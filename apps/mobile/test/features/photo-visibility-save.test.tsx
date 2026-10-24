/**
 * Saving picked photos with the traveller's visibility choice — spec 006 T603 (FR-008, FR-009,
 * FR-012; Constitution I).
 *
 * `saveCapturedPhotos` over a real SQLite database with the file system and the image
 * manipulator replaced by the contract-faithful fakes of photo-fakes.ts. What these pin:
 *   - every photo of a pick is stored with its own `is_public` taken from the choice;
 *   - no choice, and the explicit `private`, are both private (FR-052);
 *   - a choice never changes anything else about a row (still pending, still dirty, moderation
 *     still `pending`: a public photo is unreachable until screening approves it, FR-056);
 *   - a photo that cannot be saved leaves no row, whatever was chosen.
 */
import { randomUUID } from 'expo-crypto';

import { photosRepository } from '@/db/repositories/photos';
import { tripsRepository } from '@/db/repositories/trips';
import { photos } from '@/db/schema';
import { saveCapturedPhotos, type CaptureAsset } from '@/features/photos/capture';

import { createTestDatabase, type TestSqlite } from '../db/sqlite-harness';
import { CACHE, type FileSystemMock, type ManipulatorMock } from './photo-fakes';

jest.mock('expo-file-system', () =>
  jest.requireActual('./photo-fakes').createFileSystemMock(),
);
jest.mock('expo-image-manipulator', () =>
  jest.requireActual('./photo-fakes').createManipulatorMock(),
);
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const { __fs } = jest.requireMock('expo-file-system') as FileSystemMock;
const { __manipulator } = jest.requireMock('expo-image-manipulator') as ManipulatorMock;

let sqlite: TestSqlite;
let tripId: string;

function asset(name: string): CaptureAsset {
  const uri = `${CACHE}/ImagePicker/${name}.jpg`;
  __fs.write(uri, 3_000_000);
  __manipulator.images.set(uri, { width: 4032, height: 3024 });
  return { uri, exif: null };
}

function rows() {
  return sqlite.db.select().from(photos).all();
}

beforeEach(async () => {
  __fs.reset();
  __manipulator.reset();
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

describe('saveCapturedPhotos and the visibility choice', () => {
  test('public: every photo of the pick is stored with is_public true', async () => {
    const outcomes = await saveCapturedPhotos(
      sqlite.db,
      tripId,
      [asset('a'), asset('b'), asset('c')],
      'public',
    );

    expect(outcomes.map((outcome) => outcome.kind)).toEqual(['added', 'added', 'added']);
    expect(rows()).toHaveLength(3);
    expect(rows().map((row) => row.is_public)).toEqual([true, true, true]);
  });

  test('private: every photo is stored with is_public false', async () => {
    await saveCapturedPhotos(sqlite.db, tripId, [asset('a'), asset('b')], 'private');

    expect(rows().map((row) => row.is_public)).toEqual([false, false]);
  });

  test('no choice is private (FR-052)', async () => {
    await saveCapturedPhotos(sqlite.db, tripId, [asset('a')]);

    expect(rows()[0]).toMatchObject({ is_public: false });
  });

  test('a choice changes nothing else: pending upload, dirty, moderation pending', async () => {
    await saveCapturedPhotos(sqlite.db, tripId, [asset('a')], 'public');

    expect(rows()[0]).toMatchObject({
      is_public: true,
      upload_state: 'pending',
      moderation_state: 'pending',
      is_dirty: true,
      synced_at: null,
      deleted_at: null,
    });
  });

  test('two picks, two choices: each photo keeps its own flag', async () => {
    await saveCapturedPhotos(sqlite.db, tripId, [asset('first')], 'public');
    await saveCapturedPhotos(sqlite.db, tripId, [asset('second')], 'private');

    const all = photosRepository.forTripQuery(sqlite.db, tripId).all();
    expect(all.map((row) => row.is_public).sort()).toEqual([false, true]);
  });

  test('a photo that cannot be saved leaves no row, public or not', async () => {
    const broken = asset('broken');
    __manipulator.images.delete(broken.uri);

    const outcomes = await saveCapturedPhotos(
      sqlite.db,
      tripId,
      [broken, asset('fine')],
      'public',
    );

    expect(outcomes.map((outcome) => outcome.kind)).toEqual(['skipped', 'added']);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ is_public: true });
  });
});
