/**
 * The photos repository against a real SQLite database with the generated
 * migrations applied (Constitution III; tasks.md T211).
 *
 * What these prove: a capture is written private and `pending`, dirty, with
 * its app-private path; the gallery reads newest first by the time taken; a
 * refile dirties the row and nothing else; deletes are tombstones; and the
 * upload channel's marks mirror the server without ever dirtying a row, never
 * resurrect a tombstone, and never clean a row edited while its request was in
 * flight (FR-041, Constitution II).
 */
import { PhotoPullRecord } from '@triptrackr/contracts';
import { randomUUID } from 'expo-crypto';

import { geographyRepository } from '@/db/repositories/geography';
import { photosRepository, type CreatePhotoInput } from '@/db/repositories/photos';
import { tripsRepository } from '@/db/repositories/trips';
import { photos } from '@/db/schema';

import { createTestDatabase, type TestSqlite } from './sqlite-harness';

let sqlite: TestSqlite;

beforeEach(async () => {
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
});

afterEach(() => {
  jest.useRealTimers();
  sqlite.close();
});

function newTrip() {
  return tripsRepository.create(sqlite.db, {
    id: randomUUID(),
    title: 'Italy, spring 2026',
    home_currency: 'EUR',
  });
}

function addPhoto(tripId: string, overrides: Partial<CreatePhotoInput> = {}) {
  const id = overrides.id ?? randomUUID();
  return photosRepository.create(sqlite.db, {
    id,
    trip_id: tripId,
    city_id: null,
    taken_at: null,
    exif_lat: null,
    exif_lng: null,
    local_file_uri: `photos/${tripId}/${id}.jpg`,
    ...overrides,
  });
}

/** Run a write with the device clock at `iso`. */
function at<T>(iso: string, write: () => T): T {
  jest.setSystemTime(new Date(iso));
  return write();
}

function rawRow(id: string) {
  return sqlite.db
    .select()
    .from(photos)
    .all()
    .find((row) => row.id === id);
}

describe('photosRepository.create', () => {
  test('writes local-first: private, pending, dirty, and the row satisfies the wire record', () => {
    const trip = newTrip();
    const photo = addPhoto(trip.id, {
      city_id: 100,
      taken_at: '2026-05-12T16:30:05.000Z',
      exif_lat: 41.9,
      exif_lng: 12.5,
    });

    expect(photo).toMatchObject({
      trip_id: trip.id,
      city_id: 100,
      is_public: false,
      upload_state: 'pending',
      moderation_state: 'pending',
      has_thumbnail: false,
      is_dirty: true,
      synced_at: null,
      deleted_at: null,
      local_file_uri: `photos/${trip.id}/${photo.id}.jpg`,
    });
    expect(photo.created_at).toBe(photo.updated_at);
    const {
      is_dirty: _dirty,
      synced_at: _synced,
      local_file_uri: _file,
      ...wire
    } = photo;
    expect(PhotoPullRecord.safeParse(wire).success).toBe(true);
  });

  test('a photo with no metadata is still a photo', () => {
    const trip = newTrip();
    const photo = addPhoto(trip.id);
    expect(photo).toMatchObject({
      taken_at: null,
      exif_lat: null,
      exif_lng: null,
      city_id: null,
    });
  });

  test('refuses a photo for a trip that is not on this device', () => {
    expect(() => addPhoto(randomUUID())).toThrow();
    expect(sqlite.db.select().from(photos).all()).toEqual([]);
  });
});

describe('photosRepository.forTripQuery', () => {
  test('lists newest first by time taken, then by when added; undated photos last', () => {
    jest.useFakeTimers();
    const trip = newTrip();
    const other = newTrip();
    const may12 = at('2026-06-01T10:00:00.000Z', () =>
      addPhoto(trip.id, { taken_at: '2026-05-12T16:30:05.000Z' }),
    );
    const undatedOld = at('2026-06-01T11:00:00.000Z', () => addPhoto(trip.id));
    const may14 = at('2026-06-01T12:00:00.000Z', () =>
      addPhoto(trip.id, { taken_at: '2026-05-14T09:00:00.000Z' }),
    );
    const undatedNew = at('2026-06-01T13:00:00.000Z', () => addPhoto(trip.id));
    addPhoto(other.id, { taken_at: '2026-05-20T09:00:00.000Z' });

    const listed = photosRepository.forTripQuery(sqlite.db, trip.id).all();
    expect(listed.map((row) => row.id)).toEqual([
      may14.id,
      may12.id,
      undatedNew.id,
      undatedOld.id,
    ]);
  });

  test('carries the filed city’s cached name, country, position and time zone', () => {
    const trip = newTrip();
    addPhoto(trip.id, { city_id: 100 });
    addPhoto(trip.id, { city_id: 777 });

    const listed = photosRepository.forTripQuery(sqlite.db, trip.id).all();
    expect(listed.find((row) => row.city_id === 100)).toMatchObject({
      city_name: 'Roma',
      country_name: 'Italy',
      city_lat: 41.9028,
      city_lng: 12.4964,
      city_timezone: 'Europe/Rome',
    });
    expect(listed.find((row) => row.city_id === 777)).toMatchObject({
      city_name: null,
      country_name: null,
      city_lat: null,
      city_timezone: null,
    });
  });
});

describe('photosRepository.refile', () => {
  test('files under another city or none, re-dirtying the row and touching nothing else', () => {
    jest.useFakeTimers();
    const trip = newTrip();
    const photo = at('2026-06-01T10:00:00.000Z', () =>
      addPhoto(trip.id, { city_id: 100, taken_at: '2026-05-12T16:30:05.000Z' }),
    );
    sqlite.native.prepare('UPDATE photos SET is_dirty = 0').run();

    const moved = at('2026-06-02T10:00:00.000Z', () =>
      photosRepository.refile(sqlite.db, photo.id, 777),
    );
    expect(moved).toMatchObject({
      city_id: 777,
      is_dirty: true,
      updated_at: '2026-06-02T10:00:00.000Z',
      created_at: photo.created_at,
      taken_at: photo.taken_at,
      upload_state: 'pending',
    });

    const unfiled = photosRepository.refile(sqlite.db, photo.id, null);
    expect(unfiled.city_id).toBeNull();
  });

  test('refuses a photo that is gone', () => {
    const trip = newTrip();
    const photo = addPhoto(trip.id);
    photosRepository.remove(sqlite.db, photo.id);

    expect(() => photosRepository.refile(sqlite.db, photo.id, 100)).toThrow(/not found/i);
    expect(() => photosRepository.refile(sqlite.db, randomUUID(), 100)).toThrow(
      /not found/i,
    );
  });
});

describe('photosRepository.remove', () => {
  test('is a tombstone: the row stays for the sync engine, dirty, and leaves every read', () => {
    const trip = newTrip();
    const photo = addPhoto(trip.id);
    sqlite.native.prepare('UPDATE photos SET is_dirty = 0').run();

    photosRepository.remove(sqlite.db, photo.id);

    expect(photosRepository.forTripQuery(sqlite.db, trip.id).all()).toEqual([]);
    expect(photosRepository.byId(sqlite.db, photo.id)).toBeNull();
    expect(photosRepository.pendingUploads(sqlite.db, trip.id)).toEqual([]);
    expect(rawRow(photo.id)).toMatchObject({
      is_dirty: true,
      deleted_at: expect.any(String),
    });
  });

  test('lets go of the staged file path, so a tombstone never resolves to a file', () => {
    const trip = newTrip();
    const photo = addPhoto(trip.id);
    expect(rawRow(photo.id)?.local_file_uri).toEqual(expect.any(String));

    photosRepository.remove(sqlite.db, photo.id);

    expect(rawRow(photo.id)?.local_file_uri).toBeNull();
  });
});

describe('photosRepository.pendingUploads', () => {
  test('is the trip’s live pending photos, oldest first', () => {
    jest.useFakeTimers();
    const trip = newTrip();
    const other = newTrip();
    const first = at('2026-06-01T10:00:00.000Z', () => addPhoto(trip.id));
    const second = at('2026-06-01T11:00:00.000Z', () => addPhoto(trip.id));
    const failed = at('2026-06-01T12:00:00.000Z', () => addPhoto(trip.id));
    photosRepository.markFailed(sqlite.db, failed.id);
    addPhoto(other.id);

    expect(
      photosRepository.pendingUploads(sqlite.db, trip.id).map((row) => row.id),
    ).toEqual([first.id, second.id]);
  });
});

describe('the upload channel’s marks (FR-041)', () => {
  const server = { moderation_state: 'pending' as const, has_thumbnail: false };

  test('markUploaded mirrors the server and cleans the row it registered', () => {
    const trip = newTrip();
    const photo = addPhoto(trip.id);

    photosRepository.markUploaded(sqlite.db, photo.id, {
      sentUpdatedAt: photo.updated_at,
      syncedAt: '2026-06-03T10:00:00.000Z',
      server: { moderation_state: 'pending', has_thumbnail: true },
    });

    expect(photosRepository.byId(sqlite.db, photo.id)).toMatchObject({
      upload_state: 'uploaded',
      has_thumbnail: true,
      is_dirty: false,
      synced_at: '2026-06-03T10:00:00.000Z',
      updated_at: photo.updated_at,
    });
  });

  test('markUploaded keeps a row dirty when it was refiled while the upload was in flight', () => {
    jest.useFakeTimers();
    const trip = newTrip();
    const photo = at('2026-06-01T10:00:00.000Z', () => addPhoto(trip.id));
    at('2026-06-01T10:00:05.000Z', () =>
      photosRepository.refile(sqlite.db, photo.id, 100),
    );

    photosRepository.markUploaded(sqlite.db, photo.id, {
      sentUpdatedAt: photo.updated_at,
      syncedAt: '2026-06-01T10:00:06.000Z',
      server,
    });

    expect(photosRepository.byId(sqlite.db, photo.id)).toMatchObject({
      upload_state: 'uploaded',
      city_id: 100,
      is_dirty: true,
      synced_at: null,
    });
  });

  test('markUploaded never resurrects a photo deleted while it uploaded', () => {
    const trip = newTrip();
    const photo = addPhoto(trip.id);
    photosRepository.remove(sqlite.db, photo.id);

    photosRepository.markUploaded(sqlite.db, photo.id, {
      sentUpdatedAt: photo.updated_at,
      syncedAt: '2026-06-03T10:00:00.000Z',
      server,
    });

    expect(rawRow(photo.id)).toMatchObject({
      upload_state: 'pending',
      is_dirty: true,
      deleted_at: expect.any(String),
    });
  });

  test('markFailed and markPending flip the upload state without dirtying or re-stamping', () => {
    const trip = newTrip();
    const photo = addPhoto(trip.id);
    sqlite.native.prepare('UPDATE photos SET is_dirty = 0').run();

    photosRepository.markFailed(sqlite.db, photo.id);
    expect(photosRepository.byId(sqlite.db, photo.id)).toMatchObject({
      upload_state: 'failed',
      is_dirty: false,
      updated_at: photo.updated_at,
    });

    photosRepository.markPending(sqlite.db, photo.id);
    expect(photosRepository.byId(sqlite.db, photo.id)).toMatchObject({
      upload_state: 'pending',
      is_dirty: false,
      updated_at: photo.updated_at,
    });
  });

  test('markSynced cleans a row the server now matches — unless it changed since', () => {
    jest.useFakeTimers();
    const trip = newTrip();
    const photo = at('2026-06-01T10:00:00.000Z', () => addPhoto(trip.id));
    const refiled = at('2026-06-01T10:01:00.000Z', () =>
      photosRepository.refile(sqlite.db, photo.id, 100),
    );

    photosRepository.markSynced(sqlite.db, photo.id, {
      sentUpdatedAt: photo.updated_at,
      syncedAt: '2026-06-01T10:02:00.000Z',
    });
    expect(photosRepository.byId(sqlite.db, photo.id)?.is_dirty).toBe(true);

    photosRepository.markSynced(sqlite.db, photo.id, {
      sentUpdatedAt: refiled.updated_at,
      syncedAt: '2026-06-01T10:02:00.000Z',
    });
    expect(photosRepository.byId(sqlite.db, photo.id)).toMatchObject({
      is_dirty: false,
      synced_at: '2026-06-01T10:02:00.000Z',
    });
  });
});
