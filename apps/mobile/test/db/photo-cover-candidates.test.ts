/**
 * `photosRepository.coverCandidatesQuery` against a real SQLite database with
 * the generated migrations applied (tasks.md T429; research D4-09).
 *
 * What these prove: only live photos that still name a staged file come back;
 * the earliest-taken (then earliest-added) photo of each trip comes first,
 * undated photos last; and the rows carry the five columns the cover rule
 * needs and nothing else — no blob, no big text, no place join. Thumbnails are
 * the only thing ever drawn from them, on the device.
 */
import { randomUUID } from 'expo-crypto';

import { photosRepository } from '@/db/repositories/photos';
import { photos, trips } from '@/db/schema';

import { createTestDatabase, type TestSqlite } from './sqlite-harness';

let sqlite: TestSqlite;

beforeEach(async () => {
  sqlite = await createTestDatabase();
});

afterEach(() => {
  sqlite.close();
});

function newTrip(title = 'Italy') {
  const id = randomUUID();
  sqlite.db
    .insert(trips)
    .values({
      id,
      title,
      home_currency: 'EUR',
      created_at: '2026-06-01T10:00:00.000Z',
      updated_at: '2026-06-01T10:00:00.000Z',
    })
    .run();
  return id;
}

interface PhotoSeed {
  id: string;
  taken_at?: string | null;
  created_at?: string;
  deleted_at?: string | null;
  local_file_uri?: string | null;
}

function addPhoto(tripId: string, seed: PhotoSeed) {
  const created = seed.created_at ?? '2026-06-01T10:00:00.000Z';
  sqlite.db
    .insert(photos)
    .values({
      id: seed.id,
      trip_id: tripId,
      taken_at: seed.taken_at ?? null,
      created_at: created,
      updated_at: created,
      deleted_at: seed.deleted_at ?? null,
      local_file_uri:
        seed.local_file_uri === undefined
          ? `photos/${tripId}/${seed.id}.jpg`
          : seed.local_file_uri,
    })
    .run();
}

const candidates = () => photosRepository.coverCandidatesQuery(sqlite.db).all();
const idsOf = (rows: { id: string }[]) => rows.map((row) => row.id);

describe('photosRepository.coverCandidatesQuery', () => {
  test('is empty when there are no photos', () => {
    newTrip();

    expect(candidates()).toEqual([]);
  });

  test('returns exactly the columns the cover rule reads', () => {
    const tripId = newTrip();
    addPhoto(tripId, { id: 'p1', taken_at: '2026-05-12T16:30:05.000Z' });

    const [row] = candidates();

    expect(row).toEqual({
      id: 'p1',
      trip_id: tripId,
      taken_at: '2026-05-12T16:30:05.000Z',
      created_at: '2026-06-01T10:00:00.000Z',
      local_file_uri: `photos/${tripId}/p1.jpg`,
    });
  });

  test('leaves out tombstoned photos', () => {
    const tripId = newTrip();
    addPhoto(tripId, { id: 'kept' });
    addPhoto(tripId, {
      id: 'deleted',
      taken_at: '2020-01-01T00:00:00.000Z',
      deleted_at: '2026-06-02T10:00:00.000Z',
    });

    expect(idsOf(candidates())).toEqual(['kept']);
  });

  test('leaves out photos whose staged file path is gone', () => {
    const tripId = newTrip();
    addPhoto(tripId, { id: 'kept' });
    addPhoto(tripId, {
      id: 'no-file',
      taken_at: '2020-01-01T00:00:00.000Z',
      local_file_uri: null,
    });

    expect(idsOf(candidates())).toEqual(['kept']);
  });

  test('puts the earliest-taken photo first, then earliest-added, then lowest id', () => {
    const tripId = newTrip();
    addPhoto(tripId, { id: 'late', taken_at: '2026-05-20T08:00:00.000Z' });
    addPhoto(tripId, { id: 'early', taken_at: '2026-05-02T08:00:00.000Z' });
    addPhoto(tripId, {
      id: 'tie-added-later',
      taken_at: '2026-05-10T08:00:00.000Z',
      created_at: '2026-06-01T10:00:09.000Z',
    });
    addPhoto(tripId, {
      id: 'tie-b',
      taken_at: '2026-05-10T08:00:00.000Z',
      created_at: '2026-06-01T10:00:01.000Z',
    });
    addPhoto(tripId, {
      id: 'tie-a',
      taken_at: '2026-05-10T08:00:00.000Z',
      created_at: '2026-06-01T10:00:01.000Z',
    });

    expect(idsOf(candidates())).toEqual([
      'early',
      'tie-a',
      'tie-b',
      'tie-added-later',
      'late',
    ]);
  });

  test('puts undated photos after every dated one, earliest-added first', () => {
    const tripId = newTrip();
    addPhoto(tripId, { id: 'undated-new', created_at: '2026-06-03T10:00:00.000Z' });
    addPhoto(tripId, {
      id: 'dated',
      taken_at: '2030-01-01T00:00:00.000Z',
      created_at: '2026-06-09T10:00:00.000Z',
    });
    addPhoto(tripId, { id: 'undated-old', created_at: '2026-06-02T10:00:00.000Z' });

    expect(idsOf(candidates())).toEqual(['dated', 'undated-old', 'undated-new']);
  });

  // The order is plain text order, which is chronological because every writer
  // emits a UTC instant ending in `Z`: the device's `toISOString()` (3 fractional
  // digits, `nowIso()` and `features/photos/exif.ts`) and the server's pull
  // (`INSTANT_FORMAT`, 6 digits: apps/api sync-records.ts). The contract's
  // `IsoDateTime` (`offset: true`) would admit other offsets, but nothing writes
  // one, so no normalisation is done. Precision differs below the millisecond
  // only, which this suite does not rely on.
  test('orders UTC instants of mixed precision chronologically (device milliseconds, server microseconds)', () => {
    const tripId = newTrip();
    addPhoto(tripId, { id: 'p-ms-late', taken_at: '2026-05-12T10:00:01.250Z' });
    addPhoto(tripId, { id: 'p-us-before', taken_at: '2026-05-12T09:59:59.999999Z' });
    addPhoto(tripId, { id: 'p-us-late', taken_at: '2026-05-13T00:00:00.000001Z' });
    addPhoto(tripId, { id: 'p-ms-noon', taken_at: '2026-05-12T10:00:00.000Z' });

    expect(idsOf(candidates())).toEqual([
      'p-us-before',
      'p-ms-noon',
      'p-ms-late',
      'p-us-late',
    ]);
  });

  test('keeps each trip’s photos together, in that order, across trips', () => {
    const first = newTrip('First');
    const second = newTrip('Second');
    addPhoto(first, { id: 'f-late', taken_at: '2026-05-20T08:00:00.000Z' });
    addPhoto(second, { id: 's-early', taken_at: '2026-01-02T08:00:00.000Z' });
    addPhoto(first, { id: 'f-early', taken_at: '2026-05-02T08:00:00.000Z' });
    addPhoto(second, { id: 's-undated' });

    const rows = candidates();
    const byTrip = (tripId: string) =>
      idsOf(rows.filter((row) => row.trip_id === tripId));

    expect(byTrip(first)).toEqual(['f-early', 'f-late']);
    expect(byTrip(second)).toEqual(['s-early', 's-undated']);
    // Contiguous per trip: the in-memory join can take the first row of a run.
    const tripOrder = rows.map((row) => row.trip_id);
    expect(tripOrder).toEqual([...tripOrder].sort());
  });
});
