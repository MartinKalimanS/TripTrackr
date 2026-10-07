/**
 * tasks.md T429 (FR-011, FR-012; data-model.md §4, §5; research D4-09) —
 * `useTrips` hands every trip a `cover` and a `dateRange`, derived on the device
 * from three live local queries (trips, stops, photos) joined in memory.
 *
 * Real SQLite, no network. A write followed by the change event a device would
 * emit must show up in the next render with no reload.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { DatabaseProvider } from '@/db/client';
import { photos, tripStops, trips } from '@/db/schema';
import { useTrips, type TripSummary } from '@/features/trips/use-trips';

import { createTestDatabase, type TestSqlite } from '../db/sqlite-harness';

// `thumbnailUri` joins the documents directory as a string; the module needs
// `expo-file-system` and Sentry to import, neither is used by a read.
jest.mock('expo-file-system', () => ({
  Paths: { document: { uri: 'file:///data/app/documents/' } },
  File: class {},
  Directory: class {},
}));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DOCUMENTS = 'file:///data/app/documents';
const NOW = '2026-06-01T10:00:00.000Z';
const TODAY = '2026-05-11';

const ITALY = uuid(1);
const PERU = uuid(2);

let sqlite: TestSqlite;

function wrapper({ children }: PropsWithChildren) {
  return <DatabaseProvider value={sqlite.db}>{children}</DatabaseProvider>;
}

beforeEach(async () => {
  sqlite = await createTestDatabase();
});

afterEach(() => {
  sqlite.close();
});

function addTrip(id: string, title: string, coverPhotoId: string | null = null) {
  sqlite.db
    .insert(trips)
    .values({
      id,
      title,
      home_currency: 'EUR',
      cover_photo_id: coverPhotoId,
      created_at: NOW,
      updated_at: NOW,
    })
    .run();
}

function addStop(
  id: string,
  tripId: string,
  arrive: string,
  depart: string,
  { deleted = false, order = 0 } = {},
) {
  sqlite.db
    .insert(tripStops)
    .values({
      id,
      trip_id: tripId,
      city_id: 100,
      sort_order: order,
      arrive_date: arrive,
      depart_date: depart,
      created_at: NOW,
      updated_at: NOW,
      deleted_at: deleted ? NOW : null,
    })
    .run();
}

function addPhoto(
  n: number,
  tripId: string,
  { takenAt = null as string | null, localFile = true, deleted = false } = {},
) {
  const id = uuid(100 + n);
  sqlite.db
    .insert(photos)
    .values({
      id,
      trip_id: tripId,
      taken_at: takenAt,
      created_at: NOW,
      updated_at: NOW,
      deleted_at: deleted ? NOW : null,
      local_file_uri: localFile ? `photos/${tripId}/${id}.jpg` : null,
    })
    .run();
  return id;
}

const thumbnail = (tripId: string, photoId: string) =>
  `${DOCUMENTS}/photos/${tripId}/${photoId}.thumb.jpg`;

async function renderTrips() {
  const view = await renderHook(() => useTrips(TODAY), { wrapper });
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

function summaryOf(data: TripSummary[], id: string): TripSummary {
  const found = data.find((summary) => summary.trip.id === id);
  if (!found) throw new Error(`No summary for ${id}`);
  return found;
}

describe('useTrips — dateRange', () => {
  test('is null for a trip with no stops', async () => {
    addTrip(ITALY, 'Italy');

    const { result } = await renderTrips();

    expect(summaryOf(result.current.data, ITALY).dateRange).toBeNull();
  });

  test('is the stop’s own dates for a single stop', async () => {
    addTrip(ITALY, 'Italy');
    addStop(uuid(10), ITALY, '2026-05-10', '2026-05-12');

    const { result } = await renderTrips();

    expect(summaryOf(result.current.data, ITALY).dateRange).toEqual({
      start: '2026-05-10',
      end: '2026-05-12',
    });
  });

  test('is the earliest arrival to the latest departure, whatever the stop order', async () => {
    addTrip(ITALY, 'Italy');
    addStop(uuid(10), ITALY, '2026-05-12', '2026-05-15', { order: 0 });
    addStop(uuid(11), ITALY, '2026-05-10', '2026-05-12', { order: 1 });
    addStop(uuid(12), ITALY, '2026-05-14', '2026-05-18', { order: 2 });
    addStop(uuid(13), ITALY, '2026-05-13', '2026-05-14', { order: 3 });

    const { result } = await renderTrips();

    expect(summaryOf(result.current.data, ITALY).dateRange).toEqual({
      start: '2026-05-10',
      end: '2026-05-18',
    });
  });

  test('compares calendar days across month and year boundaries', async () => {
    addTrip(ITALY, 'Italy');
    addStop(uuid(10), ITALY, '2026-12-28', '2027-01-03', { order: 0 });
    addStop(uuid(11), ITALY, '2026-12-02', '2026-12-28', { order: 1 });

    const { result } = await renderTrips();

    expect(summaryOf(result.current.data, ITALY).dateRange).toEqual({
      start: '2026-12-02',
      end: '2027-01-03',
    });
  });

  test('leaves out a removed stop, and its trip’s status and count with it', async () => {
    addTrip(ITALY, 'Italy');
    addStop(uuid(10), ITALY, '2026-05-10', '2026-05-12', { order: 0 });
    addStop(uuid(11), ITALY, '2026-01-01', '2026-09-30', { order: 1, deleted: true });

    const { result } = await renderTrips();

    const italy = summaryOf(result.current.data, ITALY);
    expect(italy.dateRange).toEqual({ start: '2026-05-10', end: '2026-05-12' });
    expect(italy.stopCount).toBe(1);
  });

  test('is null again when the last stop is removed', async () => {
    addTrip(ITALY, 'Italy');
    addStop(uuid(10), ITALY, '2026-05-10', '2026-05-12');
    const { result } = await renderTrips();
    expect(summaryOf(result.current.data, ITALY).dateRange).not.toBeNull();

    await act(async () => {
      sqlite.native.exec(`UPDATE trip_stops SET deleted_at = '${NOW}'`);
      sqlite.emitChange('trip_stops');
    });

    await waitFor(() =>
      expect(summaryOf(result.current.data, ITALY).dateRange).toBeNull(),
    );
  });

  test('never borrows another trip’s stops', async () => {
    addTrip(ITALY, 'Italy');
    addTrip(PERU, 'Peru');
    addStop(uuid(10), ITALY, '2026-05-10', '2026-05-12');
    addStop(uuid(11), PERU, '2026-08-01', '2026-08-20');

    const { result } = await renderTrips();

    expect(summaryOf(result.current.data, ITALY).dateRange).toEqual({
      start: '2026-05-10',
      end: '2026-05-12',
    });
    expect(summaryOf(result.current.data, PERU).dateRange).toEqual({
      start: '2026-08-01',
      end: '2026-08-20',
    });
  });
});

describe('useTrips — cover', () => {
  test('is typographic, with the initial and derived status, when the trip has no photo', async () => {
    addTrip(ITALY, 'italy, spring');
    addStop(uuid(10), ITALY, '2026-05-10', '2026-05-12');

    const { result } = await renderTrips();

    expect(summaryOf(result.current.data, ITALY).cover).toEqual({
      kind: 'typographic',
      initial: 'I',
      status: 'active',
    });
  });

  test('is the earliest photo’s thumbnail when none is designated', async () => {
    addTrip(ITALY, 'Italy');
    addPhoto(1, ITALY, { takenAt: '2026-05-12T10:00:00.000Z' });
    const earliest = addPhoto(2, ITALY, { takenAt: '2026-05-10T10:00:00.000Z' });
    addPhoto(3, ITALY);

    const { result } = await renderTrips();

    expect(summaryOf(result.current.data, ITALY).cover).toEqual({
      kind: 'photo',
      photoId: earliest,
      thumbnailUri: thumbnail(ITALY, earliest),
    });
  });

  test('is the designated photo when `cover_photo_id` names one of the trip’s own', async () => {
    const designated = uuid(103);
    addTrip(ITALY, 'Italy', designated);
    addPhoto(1, ITALY, { takenAt: '2026-05-01T10:00:00.000Z' });
    addPhoto(3, ITALY, { takenAt: '2026-05-20T10:00:00.000Z' });

    const { result } = await renderTrips();

    expect(summaryOf(result.current.data, ITALY).cover).toEqual({
      kind: 'photo',
      photoId: designated,
      thumbnailUri: thumbnail(ITALY, designated),
    });
  });

  test('keeps each trip’s cover its own, and ignores a designation of another trip’s photo', async () => {
    const perusPhoto = uuid(105);
    addTrip(ITALY, 'Italy', perusPhoto);
    addTrip(PERU, 'Peru');
    const italys = addPhoto(1, ITALY, { takenAt: '2026-05-10T10:00:00.000Z' });
    addPhoto(5, PERU, { takenAt: '2020-01-01T00:00:00.000Z' });

    const { result } = await renderTrips();

    expect(summaryOf(result.current.data, ITALY).cover).toMatchObject({
      kind: 'photo',
      photoId: italys,
    });
    expect(summaryOf(result.current.data, PERU).cover).toMatchObject({
      kind: 'photo',
      photoId: perusPhoto,
    });
  });

  test('skips deleted photos and photos with no staged file', async () => {
    addTrip(ITALY, 'Italy');
    addPhoto(1, ITALY, { takenAt: '2026-05-01T10:00:00.000Z', deleted: true });
    addPhoto(2, ITALY, { takenAt: '2026-05-02T10:00:00.000Z', localFile: false });
    const usable = addPhoto(3, ITALY, { takenAt: '2026-05-09T10:00:00.000Z' });

    const { result } = await renderTrips();

    expect(summaryOf(result.current.data, ITALY).cover).toMatchObject({
      kind: 'photo',
      photoId: usable,
    });
  });

  test('a photo added after the first render becomes the cover on the photos change event', async () => {
    addTrip(ITALY, 'Italy');
    const { result } = await renderTrips();
    expect(summaryOf(result.current.data, ITALY).cover.kind).toBe('typographic');

    let added = '';
    await act(async () => {
      added = addPhoto(1, ITALY, { takenAt: '2026-05-10T10:00:00.000Z' });
      sqlite.emitChange('photos');
    });

    await waitFor(() =>
      expect(summaryOf(result.current.data, ITALY).cover).toMatchObject({
        kind: 'photo',
        photoId: added,
      }),
    );
  });

  test('falls back to typographic when the cover photo is deleted', async () => {
    addTrip(ITALY, 'Italy');
    addPhoto(1, ITALY);
    const { result } = await renderTrips();
    expect(summaryOf(result.current.data, ITALY).cover.kind).toBe('photo');

    await act(async () => {
      sqlite.native.exec(
        `UPDATE photos SET deleted_at = '${NOW}', local_file_uri = NULL`,
      );
      sqlite.emitChange('photos');
    });

    await waitFor(() =>
      expect(summaryOf(result.current.data, ITALY).cover.kind).toBe('typographic'),
    );
  });

  test('keeps the existing fields beside the new ones', async () => {
    addTrip(ITALY, 'Italy');
    addStop(uuid(10), ITALY, '2026-05-10', '2026-05-12');

    const { result } = await renderTrips();

    expect(result.current.error).toBeNull();
    expect(summaryOf(result.current.data, ITALY)).toMatchObject({
      trip: { id: ITALY, title: 'Italy' },
      stopCount: 1,
      status: 'active',
      dateRange: { start: '2026-05-10', end: '2026-05-12' },
      cover: { kind: 'typographic', initial: 'I', status: 'active' },
    });
  });
});
