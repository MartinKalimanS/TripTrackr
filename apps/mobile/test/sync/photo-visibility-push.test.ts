/**
 * How a photo's visibility choice reaches the account — spec 006 T604 (FR-012, SC-003;
 * Constitution I and II; rest-api.md §5; sync-protocol.md §2).
 *
 * The registration contract carries no visibility (`RegisterPhotoRequest`), and the API accepts
 * `is_public` for an existing photo through the sync push, so a public choice has to travel as an
 * ordinary local change AFTER the bytes are registered. Real SQLite, the real push and pull, a
 * routed `apiFetch` that validates every body against the contract. What these pin:
 *   - nothing about a photo is pushed before its bytes are registered;
 *   - a public photo is then pushed once, with `is_public: true`, stamped after the server's own
 *     registration stamp (the server's last-write-wins rule applies only a strictly newer record);
 *   - a private photo is cleaned by its registration and NEVER appears in a push, so it can never
 *     be sent as public (SC-003);
 *   - a pull of the registration's own version does not undo the choice before it is pushed.
 */
import { PushRequest } from '@triptrackr/contracts';

import { photosRepository } from '@/db/repositories/photos';
import { apiFetch } from '@/lib/api-client';
import { pullChanges } from '@/sync/pull';
import { pushDirtyRows } from '@/sync/push';

import {
  TRIP,
  at,
  contextFor,
  createTestDatabase,
  pullPage,
  read,
  seedTrip,
  uuid,
  wire,
  type TestSqlite,
} from './sync-core-fixtures';
import { routeApi, type ApiCall } from './sync-core-network';

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn(), captureMessage: jest.fn() },
  initSentry: jest.fn(),
}));
jest.mock('@/lib/api-client', () => ({
  ...jest.requireActual('@/lib/api-client'),
  apiFetch: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.Mock;

const PUBLIC_PHOTO = uuid(10);
const PRIVATE_PHOTO = uuid(11);
const server = { moderation_state: 'pending' as const, has_thumbnail: false };

let sqlite: TestSqlite;

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(at(0)));
  sqlite = await createTestDatabase();
  seedTrip(sqlite);
});

afterEach(() => {
  jest.useRealTimers();
  sqlite.close();
});

function addPhoto(id: string, isPublic: boolean) {
  return photosRepository.create(sqlite.db, {
    id,
    trip_id: TRIP,
    city_id: null,
    taken_at: null,
    exif_lat: null,
    exif_lng: null,
    local_file_uri: `photos/${TRIP}/${id}.jpg`,
    is_public: isPublic,
  });
}

/** What the upload does once the server has registered the object, `after` seconds on. */
function registered(id: string, secondsAfterCapture: number, serverSeconds: number) {
  const row = read(sqlite, 'photos', id);
  const start = Date.parse(at(0));
  jest.setSystemTime(new Date(start + secondsAfterCapture * 1000));
  photosRepository.markUploaded(sqlite.db, id, {
    sentUpdatedAt: row.updated_at as string,
    syncedAt: new Date(Date.now()).toISOString(),
    serverUpdatedAt: new Date(start + serverSeconds * 1000).toISOString(),
    server,
  });
}

function pushRoute() {
  return (call: ApiCall) => {
    const request = PushRequest.parse(call.body);
    return {
      results: request.records.map((record) => ({
        id: record.id,
        status: 'applied' as const,
      })),
    };
  };
}

/** Every photo record any request carried, as `[id, is_public]`. */
function pushedPhotos(calls: ApiCall[]): [string, unknown][] {
  return calls.flatMap((call) => {
    const request = PushRequest.parse(call.body);
    return request.table === 'photos'
      ? request.records.map((record): [string, unknown] => [
          record.id,
          (record as { is_public?: unknown }).is_public,
        ])
      : [];
  });
}

describe('a photo’s visibility choice and the sync push (spec 006)', () => {
  test('nothing about a photo is pushed before its bytes are registered', async () => {
    addPhoto(PUBLIC_PHOTO, true);
    addPhoto(PRIVATE_PHOTO, false);
    const calls = routeApi(mockApiFetch, { push: pushRoute() });

    await pushDirtyRows(contextFor(sqlite));

    expect(pushedPhotos(calls)).toEqual([]);
  });

  test('a public photo is pushed once registered, with is_public true; a private one never is', async () => {
    addPhoto(PUBLIC_PHOTO, true);
    addPhoto(PRIVATE_PHOTO, false);
    registered(PUBLIC_PHOTO, 5, 4);
    registered(PRIVATE_PHOTO, 5, 4);
    const calls = routeApi(mockApiFetch, { push: pushRoute() });

    const outcome = await pushDirtyRows(contextFor(sqlite));

    expect(outcome).toMatchObject({ pushed: 1, failure: null });
    expect(pushedPhotos(calls)).toEqual([[PUBLIC_PHOTO, true]]);
    expect(read(sqlite, 'photos', PUBLIC_PHOTO)).toMatchObject({
      is_public: true,
      is_dirty: false,
    });
    expect(read(sqlite, 'photos', PRIVATE_PHOTO)).toMatchObject({
      is_public: false,
      is_dirty: false,
    });
  });

  test('SC-003: no push ever carries is_public true for a photo whose choice was private', async () => {
    for (let n = 0; n < 5; n += 1) {
      const id = uuid(20 + n);
      addPhoto(id, false);
      registered(id, 3, 2);
    }
    addPhoto(PUBLIC_PHOTO, true);
    registered(PUBLIC_PHOTO, 3, 2);
    const calls = routeApi(mockApiFetch, { push: pushRoute() });

    await pushDirtyRows(contextFor(sqlite));
    await pushDirtyRows(contextFor(sqlite));

    const pushed = pushedPhotos(calls);
    expect(pushed).toEqual([[PUBLIC_PHOTO, true]]);
    expect(pushed.filter(([id]) => id !== PUBLIC_PHOTO)).toEqual([]);
  });

  test('the record is stamped after the registration’s own stamp, even from a slow device clock', async () => {
    addPhoto(PUBLIC_PHOTO, true);
    // The server registered it at +40 s on a clock ahead of this device's +6 s.
    registered(PUBLIC_PHOTO, 6, 40);
    const calls = routeApi(mockApiFetch, { push: pushRoute() });

    await pushDirtyRows(contextFor(sqlite));

    const [call] = calls;
    const request = PushRequest.parse(call?.body);
    const [record] = request.records;
    expect(Date.parse(record?.updated_at as string)).toBeGreaterThan(
      Date.parse(at(0)) + 40_000,
    );
  });

  test('pulling the registration’s own version does not undo the choice before it is pushed', async () => {
    addPhoto(PUBLIC_PHOTO, true);
    registered(PUBLIC_PHOTO, 6, 5);
    routeApi(mockApiFetch, {
      pull: () =>
        pullPage(
          {
            photos: [
              wire('photos', PUBLIC_PHOTO, {
                created_at: at(0),
                updated_at: new Date(Date.parse(at(0)) + 5000).toISOString(),
                is_public: false,
                upload_state: 'uploaded',
              }),
            ],
          },
          'cursor-1',
          false,
        ),
    });

    const outcome = await pullChanges(contextFor(sqlite));

    expect(outcome).toMatchObject({ pulled: 0, conflicts: 0, failure: null });
    expect(read(sqlite, 'photos', PUBLIC_PHOTO)).toMatchObject({
      is_public: true,
      is_dirty: true,
    });
  });
});
