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
import { photosRepository, type CoverCandidate } from '@/db/repositories/photos';
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
  jest.restoreAllMocks();
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

/**
 * Covers no longer hold the list's loading flag, so after it settles the photo
 * query's answer is flushed too (it resolves in the same turn on this driver).
 * `renders` counts every render of the hook, to tell "re-ran and found nothing
 * new" from "never re-ran".
 */
async function renderTrips() {
  const renders = { count: 0 };
  const view = await renderHook(
    () => {
      renders.count += 1;
      return useTrips(TODAY);
    },
    { wrapper },
  );
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  await act(async () => undefined);
  return { ...view, renders };
}

/** A write to `photos` followed by the change event, and the re-render it causes. */
async function writePhotos(renders: { count: number }, write: () => void): Promise<void> {
  const before = renders.count;
  await act(async () => {
    write();
    sqlite.emitChange('photos');
  });
  await waitFor(() => expect(renders.count).toBeGreaterThan(before));
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

describe('useTrips — covers are decorative', () => {
  test('a failing cover query still returns every trip, with typographic covers and no error', async () => {
    addTrip(ITALY, 'Italy');
    addTrip(PERU, 'Peru');
    addStop(uuid(10), ITALY, '2026-05-10', '2026-05-12');
    sqlite.native.exec('DROP TABLE photos');

    const { result } = await renderTrips();

    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toHaveLength(2);
    expect(summaryOf(result.current.data, ITALY)).toMatchObject({
      stopCount: 1,
      status: 'active',
      cover: { kind: 'typographic', initial: 'I', status: 'active' },
    });
    expect(summaryOf(result.current.data, PERU).cover).toEqual({
      kind: 'typographic',
      initial: 'P',
      status: 'planning',
    });
  });

  test('a failing trips query is still the list’s error', async () => {
    sqlite.native.exec('DROP TABLE trips');

    const view = await renderHook(() => useTrips(TODAY), { wrapper });

    await waitFor(() => expect(view.result.current.error).not.toBeNull());
  });

  test('does not wait for the cover query: typographic covers first, the photo once it arrives', async () => {
    addTrip(ITALY, 'Italy');
    const photoId = addPhoto(1, ITALY, { takenAt: '2026-05-10T10:00:00.000Z' });
    const real = photosRepository.coverCandidatesQuery(sqlite.db);
    let deliver: (rows: CoverCandidate[]) => void = () => undefined;
    const pending = new Promise<CoverCandidate[]>((resolve) => {
      deliver = resolve;
    });
    // The query's own shape (`useLiveQuery` reads its table), answering later.
    const held = Object.assign(Object.create(real) as object, {
      then: (ok: (rows: CoverCandidate[]) => unknown, fail: (e: unknown) => unknown) =>
        pending.then(ok, fail),
    });
    jest
      .spyOn(photosRepository, 'coverCandidatesQuery')
      .mockReturnValue(held as unknown as typeof real);

    const { result } = await renderTrips();

    expect(result.current.loading).toBe(false);
    expect(summaryOf(result.current.data, ITALY).cover).toEqual({
      kind: 'typographic',
      initial: 'I',
      status: 'planning',
    });

    await act(async () => deliver(real.all()));

    await waitFor(() =>
      expect(summaryOf(result.current.data, ITALY).cover).toEqual({
        kind: 'photo',
        photoId,
        thumbnailUri: thumbnail(ITALY, photoId),
      }),
    );
    expect(result.current.loading).toBe(false);
  });
});

describe('useTrips — photos that match no live trip', () => {
  test('are ignored, and never become another trip’s cover', async () => {
    const GONE = uuid(0);
    addTrip(GONE, 'Gone');
    addTrip(ITALY, 'Italy', uuid(100));
    addPhoto(0, GONE, { takenAt: '2020-01-01T00:00:00.000Z' });
    sqlite.native.exec(`UPDATE trips SET deleted_at = '${NOW}' WHERE id = '${GONE}'`);
    const own = addPhoto(2, ITALY, { takenAt: '2026-05-10T10:00:00.000Z' });

    const { result } = await renderTrips();

    expect(result.current.data.map((summary) => summary.trip.id)).toEqual([ITALY]);
    // `cover_photo_id` names the removed trip's photo: it is not Italy's to use.
    expect(summaryOf(result.current.data, ITALY).cover).toEqual({
      kind: 'photo',
      photoId: own,
      thumbnailUri: thumbnail(ITALY, own),
    });
  });
});

describe('useTrips — referential stability', () => {
  test('a photos write that changes no cover input keeps the list, every summary and every cover reference-equal', async () => {
    addTrip(ITALY, 'Italy');
    addTrip(PERU, 'Peru');
    addPhoto(1, ITALY, { takenAt: '2026-05-10T10:00:00.000Z' });
    const notTheCover = addPhoto(2, ITALY, { takenAt: '2026-05-12T10:00:00.000Z' });
    const { result, renders } = await renderTrips();
    const before = result.current.data;

    await writePhotos(renders, () =>
      photosRepository.markUploaded(sqlite.db, notTheCover, {
        sentUpdatedAt: NOW,
        syncedAt: NOW,
        server: { moderation_state: 'approved', has_thumbnail: true },
      }),
    );

    const after = result.current.data;
    expect(after).toBe(before);
    expect(summaryOf(after, ITALY).cover).toBe(summaryOf(before, ITALY).cover);
    expect(summaryOf(after, PERU).cover).toBe(summaryOf(before, PERU).cover);
  });

  test('a photos write that changes one trip’s cover replaces only that trip’s cover and summary', async () => {
    addTrip(ITALY, 'Italy');
    addTrip(PERU, 'Peru');
    const first = addPhoto(1, ITALY, { takenAt: '2026-05-10T10:00:00.000Z' });
    const second = addPhoto(2, ITALY, { takenAt: '2026-05-12T10:00:00.000Z' });
    addPhoto(3, PERU, { takenAt: '2026-08-01T10:00:00.000Z' });
    const { result, renders } = await renderTrips();
    const before = result.current.data;
    expect(summaryOf(before, ITALY).cover).toMatchObject({ photoId: first });

    await writePhotos(renders, () =>
      sqlite.native.exec(
        `UPDATE photos SET deleted_at = '${NOW}', local_file_uri = NULL WHERE id = '${first}'`,
      ),
    );

    const after = result.current.data;
    expect(summaryOf(after, ITALY).cover).toMatchObject({ photoId: second });
    expect(summaryOf(after, ITALY).cover).not.toBe(summaryOf(before, ITALY).cover);
    expect(summaryOf(after, ITALY)).not.toBe(summaryOf(before, ITALY));
    expect(summaryOf(after, PERU)).toBe(summaryOf(before, PERU));
  });

  test('renaming a trip produces a new summary only for that trip', async () => {
    addTrip(ITALY, 'Italy');
    addTrip(PERU, 'Peru');
    addPhoto(1, ITALY, { takenAt: '2026-05-10T10:00:00.000Z' });
    addStop(uuid(10), ITALY, '2026-05-10', '2026-05-12');
    const { result } = await renderTrips();
    const before = result.current.data;

    await act(async () => {
      sqlite.native.exec(
        `UPDATE trips SET title = 'Italy 2026', updated_at = '2026-07-01T00:00:00.000Z' WHERE id = '${ITALY}'`,
      );
      sqlite.emitChange('trips');
    });
    await waitFor(() =>
      expect(summaryOf(result.current.data, ITALY).trip.title).toBe('Italy 2026'),
    );

    const after = result.current.data;
    expect(summaryOf(after, ITALY)).not.toBe(summaryOf(before, ITALY));
    // Same photo, same stops: the parts that did not change are the same objects.
    expect(summaryOf(after, ITALY).cover).toBe(summaryOf(before, ITALY).cover);
    expect(summaryOf(after, ITALY).dateRange).toBe(summaryOf(before, ITALY).dateRange);
    // The trips query returned fresh row objects for Peru too; the summary is kept.
    expect(summaryOf(after, PERU)).toBe(summaryOf(before, PERU));
  });

  test('adding a stop produces a new summary only for that trip', async () => {
    addTrip(ITALY, 'Italy');
    addTrip(PERU, 'Peru');
    addStop(uuid(10), PERU, '2026-08-01', '2026-08-20');
    const { result } = await renderTrips();
    const before = result.current.data;

    await act(async () => {
      addStop(uuid(11), ITALY, '2026-05-10', '2026-05-12');
      sqlite.emitChange('trip_stops');
    });
    await waitFor(() => expect(summaryOf(result.current.data, ITALY).stopCount).toBe(1));

    const after = result.current.data;
    expect(summaryOf(after, ITALY)).not.toBe(summaryOf(before, ITALY));
    expect(summaryOf(after, PERU)).toBe(summaryOf(before, PERU));
    expect(summaryOf(after, PERU).dateRange).toBe(summaryOf(before, PERU).dateRange);
  });

  test('a typographic cover is replaced when its status changes, and kept when it does not', async () => {
    addTrip(ITALY, 'Italy');
    addStop(uuid(10), ITALY, '2026-05-10', '2026-05-12');
    const { result } = await renderTrips();
    const before = summaryOf(result.current.data, ITALY).cover;
    expect(before).toMatchObject({ kind: 'typographic', status: 'active' });

    await act(async () => {
      addStop(uuid(11), ITALY, '2026-05-11', '2026-05-11', { order: 1 });
      sqlite.emitChange('trip_stops');
    });
    await waitFor(() => expect(summaryOf(result.current.data, ITALY).stopCount).toBe(2));
    expect(summaryOf(result.current.data, ITALY).cover).toBe(before);

    await act(async () => {
      sqlite.native.exec(
        `UPDATE trip_stops SET arrive_date = '2026-05-08', depart_date = '2026-05-09'`,
      );
      sqlite.emitChange('trip_stops');
    });
    await waitFor(() =>
      expect(summaryOf(result.current.data, ITALY).cover).toMatchObject({
        status: 'past',
      }),
    );
    expect(summaryOf(result.current.data, ITALY).cover).not.toBe(before);
  });
});
