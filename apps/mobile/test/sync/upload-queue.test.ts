/**
 * T134 — the binary upload queue (FR-041; sync-protocol.md §4; Constitution II).
 *
 * The queue decides WHEN the bytes go and never HOW: each pass hands a trip to
 * the existing `uploadPendingPhotos` / `uploadPendingDocuments` (faked here,
 * succeeding by marking rows uploaded through the real repositories) over a
 * real SQLite database, with `expo-network` faked so the link can be made
 * Wi-Fi, cellular, or gone, and with fake clocks so the hold-back and the
 * backoff can be stepped through.
 *
 * Pinned, in the order the brief states them:
 *   - `countPendingUploads` is photos + documents, live, not `uploaded`;
 *   - Wi-Fi/Ethernet drains at once; cellular holds back for
 *     `CELLULAR_HOLD_BACK_MS` from the item's capture and then goes anyway —
 *     uploads are never starved, not across a restart and not by a wrong
 *     clock; offline does nothing and schedules nothing;
 *   - failed passes back off exponentially to a ceiling; success, progress, a
 *     connectivity transition and a finished sync cycle each reset it;
 *   - one drain at a time, and a kick that arrives mid-drain is not lost;
 *   - `kickUploadQueue` never rejects; unbinding stops everything.
 */
import { randomUUID } from 'expo-crypto';

import { documentsRepository } from '@/db/repositories/documents';
import { photosRepository } from '@/db/repositories/photos';
import { tripsRepository } from '@/db/repositories/trips';
import { uploadPendingDocuments } from '@/features/documents/upload';
import { uploadPendingPhotos } from '@/features/photos/upload';
import { Sentry } from '@/lib/sentry';
import { useSyncStatusStore } from '@/sync/engine';
import {
  BACKOFF_BASE_MS,
  BACKOFF_CEILING_MS,
  CELLULAR_HOLD_BACK_MS,
  backoffDelay,
  countPendingUploads,
  kickUploadQueue,
  startUploadQueue,
} from '@/sync/upload-queue';

import { createTestDatabase, type TestSqlite } from '../db/sqlite-harness';

interface MockLink {
  type: string;
  isConnected?: boolean;
  isInternetReachable?: boolean;
}

const mockNetwork = {
  state: { type: 'WIFI', isConnected: true, isInternetReachable: true } as MockLink,
  listeners: new Set<(state: MockLink) => void>(),
  failRead: false,
};

jest.mock('expo-network', () => ({
  NetworkStateType: {
    NONE: 'NONE',
    UNKNOWN: 'UNKNOWN',
    CELLULAR: 'CELLULAR',
    WIFI: 'WIFI',
    ETHERNET: 'ETHERNET',
    VPN: 'VPN',
    OTHER: 'OTHER',
    BLUETOOTH: 'BLUETOOTH',
    WIMAX: 'WIMAX',
  },
  getNetworkStateAsync: jest.fn(async () => {
    if (mockNetwork.failRead) throw new Error('The network module is unavailable');
    return mockNetwork.state;
  }),
  addNetworkStateListener: jest.fn((listener) => {
    mockNetwork.listeners.add(listener);
    return { remove: () => mockNetwork.listeners.delete(listener) };
  }),
}));
jest.mock('@/features/photos/upload', () => ({
  uploadPendingPhotos: jest.fn(async () => undefined),
}));
jest.mock('@/features/documents/upload', () => ({
  uploadPendingDocuments: jest.fn(async () => undefined),
}));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));
jest.mock('@/sync/engine', () => {
  const { create } = require('zustand');
  return { useSyncStatusStore: create(() => ({ lastSyncedAt: null })) };
});

const photoDrain = uploadPendingPhotos as jest.Mock;
const documentDrain = uploadPendingDocuments as jest.Mock;

const WIFI: MockLink = { type: 'WIFI', isConnected: true, isInternetReachable: true };
const ETHERNET: MockLink = {
  type: 'ETHERNET',
  isConnected: true,
  isInternetReachable: true,
};
const CELLULAR: MockLink = {
  type: 'CELLULAR',
  isConnected: true,
  isInternetReachable: true,
};
const OFFLINE: MockLink = {
  type: 'NONE',
  isConnected: false,
  isInternetReachable: false,
};

const START = new Date('2026-06-01T10:00:00.000Z');
const FAKE_TIMERS: Parameters<typeof jest.useFakeTimers>[0] = {
  doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
  now: START,
};

let sqlite: TestSqlite;
let unbind: (() => void) | null = null;

/** The link changes: the new state is what a read answers, and every listener is told. */
async function setLink(link: MockLink) {
  mockNetwork.state = link;
  for (const listener of [...mockNetwork.listeners]) listener(link);
  await flush();
}

/** Let promise and sqlite work run without moving the clock. */
async function flush() {
  await jest.advanceTimersByTimeAsync(0);
}

function start() {
  unbind = startUploadQueue(sqlite.db);
  return unbind;
}

function newTrip(title = 'Italy') {
  return tripsRepository.create(sqlite.db, {
    id: randomUUID(),
    title,
    home_currency: 'EUR',
  });
}

function pendingPhoto(tripId: string) {
  return photosRepository.create(sqlite.db, {
    id: randomUUID(),
    trip_id: tripId,
    city_id: null,
    taken_at: null,
    exif_lat: null,
    exif_lng: null,
    local_file_uri: `photos/${tripId}/${randomUUID()}.jpg`,
  });
}

const FIELDS = {
  flight_number: 'AC834',
  flight_date: '2026-11-22',
  passenger_name: 'DESMARAIS/LUC',
};

function pendingDocument(tripId: string, type: 'other' | 'boarding_pass' = 'other') {
  return documentsRepository.create(sqlite.db, {
    id: randomUUID(),
    trip_id: tripId,
    type,
    parsed_json: type === 'boarding_pass' ? FIELDS : null,
    local_file_uri: `document-vault/${randomUUID()}.sealed`,
  });
}

/** Every uploader call, in order: `photos:<trip>` and `documents:<trip>`. */
const log: string[] = [];

/** What a successful drain of a trip does to the store, through the real repositories. */
function drainSucceeds() {
  photoDrain.mockImplementation(async (_db: unknown, tripId: string) => {
    log.push(`photos:${tripId}`);
    for (const photo of photosRepository.pendingUploads(sqlite.db, tripId)) {
      photosRepository.markUploaded(sqlite.db, photo.id, {
        sentUpdatedAt: photo.updated_at,
        syncedAt: photo.updated_at,
        server: { moderation_state: 'pending', has_thumbnail: false },
      });
    }
  });
  documentDrain.mockImplementation(async (_db: unknown, tripId: string) => {
    log.push(`documents:${tripId}`);
    for (const id of documentsRepository.needingUploadIds(sqlite.db, tripId)) {
      const document = documentsRepository.byId(sqlite.db, id);
      if (!document) continue;
      if (document.upload_state === 'pending') {
        documentsRepository.markUploaded(sqlite.db, id, document.updated_at);
      } else {
        documentsRepository.markSynced(sqlite.db, id, document.updated_at);
      }
    }
  });
}

/** A drain that reaches the server and gets nowhere: nothing is marked. */
function drainGoesNowhere() {
  photoDrain.mockImplementation(async (_db: unknown, tripId: string) => {
    log.push(`photos:${tripId}`);
  });
  documentDrain.mockImplementation(async (_db: unknown, tripId: string) => {
    log.push(`documents:${tripId}`);
  });
}

const drainedTrips = () => photoDrain.mock.calls.map((call) => call[1] as string);

beforeEach(async () => {
  jest.useFakeTimers(FAKE_TIMERS);
  log.length = 0;
  photoDrain.mockReset();
  documentDrain.mockReset();
  mockNetwork.state = WIFI;
  mockNetwork.listeners.clear();
  mockNetwork.failRead = false;
  (Sentry.captureException as jest.Mock).mockClear();
  useSyncStatusStore.setState({ lastSyncedAt: null });
  sqlite = await createTestDatabase();
  drainSucceeds();
});

afterEach(() => {
  unbind?.();
  unbind = null;
  jest.useRealTimers();
  sqlite.close();
});

describe('countPendingUploads', () => {
  test('is photos plus documents, live, whose bytes are not confirmed', async () => {
    const trip = newTrip();
    expect(await countPendingUploads(sqlite.db)).toBe(0);

    pendingPhoto(trip.id);
    const failed = pendingPhoto(trip.id);
    photosRepository.markFailed(sqlite.db, failed.id);
    const uploaded = pendingPhoto(trip.id);
    photosRepository.markUploaded(sqlite.db, uploaded.id, {
      sentUpdatedAt: uploaded.updated_at,
      syncedAt: uploaded.updated_at,
      server: { moderation_state: 'pending', has_thumbnail: false },
    });
    const doomed = pendingPhoto(trip.id);
    photosRepository.remove(sqlite.db, doomed.id);
    const otherTrip = newTrip('Elsewhere');
    pendingDocument(trip.id);
    pendingDocument(otherTrip.id);
    const sent = pendingDocument(trip.id);
    documentsRepository.markUploaded(sqlite.db, sent.id, sent.updated_at);
    const gone = pendingDocument(trip.id);
    documentsRepository.remove(sqlite.db, gone.id);

    // pending + failed photo, and two pending documents.
    expect(await countPendingUploads(sqlite.db)).toBe(4);
  });

  test('an uploaded document with an unsent confirmation is not "pending bytes"', async () => {
    const trip = newTrip();
    const document = pendingDocument(trip.id, 'boarding_pass');
    documentsRepository.markUploaded(sqlite.db, document.id, document.updated_at);
    documentsRepository.confirmFields(sqlite.db, document.id, FIELDS);

    // The bytes are in; the engine's dirty-row count owns the unsent edit.
    expect(await countPendingUploads(sqlite.db)).toBe(0);
  });

  test('rejects when the store cannot be read — a wrong "nothing pending" would let a sign-out lose bytes', async () => {
    sqlite.close();
    await expect(countPendingUploads(sqlite.db)).rejects.toBeDefined();
    sqlite = await createTestDatabase();
  });
});

describe('the Wi-Fi preference (sync-protocol.md §4.2)', () => {
  test.each([
    ['Wi-Fi', WIFI],
    ['Ethernet', ETHERNET],
  ])(
    'on %s a kick drains at once, photos then documents, oldest trip first',
    async (_name, link) => {
      mockNetwork.state = link;
      const older = newTrip('Older');
      pendingPhoto(older.id);
      jest.setSystemTime(new Date(START.getTime() + 1000));
      const newer = newTrip('Newer');
      pendingDocument(newer.id);
      pendingPhoto(newer.id);
      start();

      await kickUploadQueue('capture');

      // Oldest capture first; within a trip the photos, then the documents; and
      // only what a trip actually has pending is asked for.
      expect(log).toEqual([
        `photos:${older.id}`,
        `photos:${newer.id}`,
        `documents:${newer.id}`,
      ]);
      expect(photoDrain.mock.calls[0]?.[0]).toBe(sqlite.db);
      expect(await countPendingUploads(sqlite.db)).toBe(0);
    },
  );

  test('binding the queue looks for work at once, without a kick', async () => {
    const trip = newTrip();
    pendingPhoto(trip.id);

    start();
    await flush();

    expect(drainedTrips()).toEqual([trip.id]);
  });

  test('does nothing when nothing is pending, and schedules nothing', async () => {
    newTrip();
    start();

    await kickUploadQueue('focus');

    expect(photoDrain).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test.each([
    ['no connection at all', OFFLINE],
    [
      'an unreachable internet',
      { type: 'WIFI', isConnected: true, isInternetReachable: false },
    ],
    ['an unknown connection', { type: 'UNKNOWN', isConnected: false }],
    ['a connection of type NONE that does not say it is down', { type: 'NONE' }],
    ['a connection of type UNKNOWN that does not say it is down', { type: 'UNKNOWN' }],
  ])('%s: does nothing and schedules nothing', async (_name, link) => {
    mockNetwork.state = link;
    const trip = newTrip();
    pendingPhoto(trip.id);
    start();

    await kickUploadQueue('capture');
    await jest.advanceTimersByTimeAsync(BACKOFF_CEILING_MS * 3);

    expect(photoDrain).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('on cellular a fresh capture is held back, then goes once its hold-back has passed', async () => {
    mockNetwork.state = CELLULAR;
    const trip = newTrip();
    pendingPhoto(trip.id);
    start();

    await kickUploadQueue('capture');
    expect(photoDrain).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(CELLULAR_HOLD_BACK_MS - 1);
    expect(photoDrain).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(drainedTrips()).toEqual([trip.id]);
    expect(await countPendingUploads(sqlite.db)).toBe(0);
  });

  test('on cellular a kick before the hold-back is over does not start it early', async () => {
    mockNetwork.state = CELLULAR;
    const trip = newTrip();
    pendingPhoto(trip.id);
    start();
    await jest.advanceTimersByTimeAsync(CELLULAR_HOLD_BACK_MS / 2);

    await kickUploadQueue('foreground');
    await kickUploadQueue('focus');
    expect(photoDrain).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(CELLULAR_HOLD_BACK_MS / 2);
    expect(drainedTrips()).toEqual([trip.id]);
  });

  test('NEVER starved: a photo already older than the hold-back goes over cellular at once, even after a restart', async () => {
    mockNetwork.state = CELLULAR;
    const trip = newTrip();
    pendingPhoto(trip.id);
    jest.setSystemTime(new Date(START.getTime() + CELLULAR_HOLD_BACK_MS + 1));

    // A relaunch: a brand-new binding, no memory of having waited.
    start();
    await flush();

    expect(drainedTrips()).toEqual([trip.id]);
  });

  test('a capture stamped in the future (a wrong clock, since corrected) is not trusted: it is due, not parked', async () => {
    mockNetwork.state = CELLULAR;
    const trip = newTrip();
    jest.setSystemTime(new Date('2031-01-01T00:00:00.000Z'));
    pendingPhoto(trip.id);
    jest.setSystemTime(START);

    start();
    await flush();

    expect(drainedTrips()).toEqual([trip.id]);
  });

  test.each(['sign-out', 'manual'])(
    'a traveller waiting on it (%s) is not held back on cellular',
    async (reason) => {
      mockNetwork.state = CELLULAR;
      const trip = newTrip();
      pendingPhoto(trip.id);
      start();
      await flush();
      expect(photoDrain).not.toHaveBeenCalled();

      await kickUploadQueue(reason);

      expect(drainedTrips()).toEqual([trip.id]);
    },
  );

  test('but even an urgent kick does nothing offline', async () => {
    mockNetwork.state = OFFLINE;
    const trip = newTrip();
    pendingPhoto(trip.id);
    start();

    await kickUploadQueue('sign-out');

    expect(photoDrain).not.toHaveBeenCalled();
  });

  test.each([
    ['a VPN', 'VPN'],
    ['an unclassified link', 'OTHER'],
    ['Bluetooth tethering', 'BLUETOOTH'],
  ])(
    '%s cannot be told from metered, so it is held back like cellular',
    async (_name, type) => {
      mockNetwork.state = { type, isConnected: true, isInternetReachable: true };
      const trip = newTrip();
      pendingPhoto(trip.id);
      start();

      await kickUploadQueue('capture');

      expect(photoDrain).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(CELLULAR_HOLD_BACK_MS);
      expect(drainedTrips()).toEqual([trip.id]);
    },
  );

  test('a link the module cannot read is treated as metered, never as a reason to stop', async () => {
    mockNetwork.failRead = true;
    const trip = newTrip();
    pendingPhoto(trip.id);
    start();

    await kickUploadQueue('capture');
    expect(photoDrain).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(CELLULAR_HOLD_BACK_MS);
    expect(drainedTrips()).toEqual([trip.id]);
  });

  test('reaching Wi-Fi during the hold-back uploads at once and drops the wait', async () => {
    mockNetwork.state = CELLULAR;
    const trip = newTrip();
    pendingPhoto(trip.id);
    start();
    await flush();
    expect(photoDrain).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(1);

    await setLink(WIFI);

    expect(drainedTrips()).toEqual([trip.id]);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('losing the connection drops the wait and schedules nothing; regaining it drains', async () => {
    mockNetwork.state = CELLULAR;
    const trip = newTrip();
    pendingPhoto(trip.id);
    start();
    await flush();
    expect(jest.getTimerCount()).toBe(1);

    await setLink(OFFLINE);
    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(CELLULAR_HOLD_BACK_MS * 2);
    expect(photoDrain).not.toHaveBeenCalled();

    await setLink(WIFI);
    expect(drainedTrips()).toEqual([trip.id]);
  });

  test('going from Wi-Fi to cellular mid-backoff swaps the backoff for the hold-back', async () => {
    drainGoesNowhere();
    const trip = newTrip();
    pendingPhoto(trip.id);
    start();
    await flush();
    expect(photoDrain).toHaveBeenCalledTimes(1); // failed on Wi-Fi: a 15 s retry is scheduled
    expect(jest.getTimerCount()).toBe(1);

    await setLink(CELLULAR);
    expect(photoDrain).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);

    await jest.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    expect(photoDrain).toHaveBeenCalledTimes(1); // the old backoff is gone
    await jest.advanceTimersByTimeAsync(CELLULAR_HOLD_BACK_MS - BACKOFF_BASE_MS - 1);
    expect(photoDrain).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1); // the capture's hold-back is over
    expect(photoDrain).toHaveBeenCalledTimes(2);
  });
});

describe('exponential backoff', () => {
  test('backoffDelay doubles from the base to the ceiling and stays there', () => {
    const delays = [1, 2, 3, 4, 5, 6, 7, 8].map(backoffDelay);
    expect(delays.slice(0, 5)).toEqual([
      BACKOFF_BASE_MS,
      BACKOFF_BASE_MS * 2,
      BACKOFF_BASE_MS * 4,
      BACKOFF_BASE_MS * 8,
      BACKOFF_BASE_MS * 16,
    ]);
    expect(delays.slice(5)).toEqual([
      BACKOFF_CEILING_MS,
      BACKOFF_CEILING_MS,
      BACKOFF_CEILING_MS,
    ]);
    expect(Math.max(...delays)).toBeLessThanOrEqual(BACKOFF_CEILING_MS);
    expect(backoffDelay(0)).toBe(BACKOFF_BASE_MS);
    expect(backoffDelay(10_000)).toBe(BACKOFF_CEILING_MS);
  });

  test('a pass that gets nowhere is retried after 15 s, 30 s, 60 s … and never less often than the ceiling', async () => {
    drainGoesNowhere();
    const trip = newTrip();
    pendingPhoto(trip.id);
    start();
    await flush();
    expect(photoDrain).toHaveBeenCalledTimes(1);

    const expected = [15, 30, 60, 120, 240, 300, 300].map((seconds) => seconds * 1000);
    let calls = 1;
    for (const delay of expected) {
      await jest.advanceTimersByTimeAsync(delay - 1);
      expect(photoDrain).toHaveBeenCalledTimes(calls);
      await jest.advanceTimersByTimeAsync(1);
      calls += 1;
      expect(photoDrain).toHaveBeenCalledTimes(calls);
    }
  });

  test('a retry that finally uploads everything ends the retries and resets the backoff', async () => {
    drainGoesNowhere();
    const trip = newTrip();
    const photo = pendingPhoto(trip.id);
    start();
    await flush();
    await jest.advanceTimersByTimeAsync(BACKOFF_BASE_MS); // second failure: next wait is 30 s

    drainSucceeds();
    await jest.advanceTimersByTimeAsync(BACKOFF_BASE_MS * 2);
    expect(photosRepository.byId(sqlite.db, photo.id)?.upload_state).toBe('uploaded');
    expect(jest.getTimerCount()).toBe(0);

    // The next trouble starts from the base again, not from 60 s.
    drainGoesNowhere();
    pendingPhoto(trip.id);
    await kickUploadQueue('capture');
    const calls = photoDrain.mock.calls.length;
    await jest.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    expect(photoDrain).toHaveBeenCalledTimes(calls + 1);
  });

  test('progress without finishing retries after the base delay, not a longer one', async () => {
    const trip = newTrip();
    const waitsForServer = pendingPhoto(trip.id);
    pendingPhoto(trip.id);
    // One photo uploads; the other (say, its trip is not on the server yet) cannot.
    photoDrain.mockImplementation(async (_db: unknown, tripId: string) => {
      for (const photo of photosRepository.pendingUploads(sqlite.db, tripId)) {
        if (photo.id === waitsForServer.id) continue;
        photosRepository.markUploaded(sqlite.db, photo.id, {
          sentUpdatedAt: photo.updated_at,
          syncedAt: photo.updated_at,
          server: { moderation_state: 'pending', has_thumbnail: false },
        });
      }
    });
    start();
    await flush();
    expect(photoDrain).toHaveBeenCalledTimes(1); // progress: the next look is one base away

    await jest.advanceTimersByTimeAsync(BACKOFF_BASE_MS - 1);
    expect(photoDrain).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(photoDrain).toHaveBeenCalledTimes(2); // nothing more now: the first failure

    await jest.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    expect(photoDrain).toHaveBeenCalledTimes(3); // …retried after the base again
    await jest.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    expect(photoDrain).toHaveBeenCalledTimes(3); // …then the wait has doubled
    await jest.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    expect(photoDrain).toHaveBeenCalledTimes(4);
  });

  test('a connectivity transition resets the backoff and tries at once', async () => {
    drainGoesNowhere();
    const trip = newTrip();
    pendingPhoto(trip.id);
    start();
    await flush();
    await jest.advanceTimersByTimeAsync(BACKOFF_BASE_MS); // 2nd failure
    await jest.advanceTimersByTimeAsync(BACKOFF_BASE_MS * 2); // 3rd failure: next wait 60 s
    const before = photoDrain.mock.calls.length;

    await setLink(OFFLINE);
    await setLink(WIFI);
    expect(photoDrain).toHaveBeenCalledTimes(before + 1);

    // …and the wait after that failure is the base again, not 60 s.
    await jest.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    expect(photoDrain).toHaveBeenCalledTimes(before + 2);
  });

  test('a kick while waiting retries at once, but does not reset the backoff', async () => {
    drainGoesNowhere();
    const trip = newTrip();
    pendingPhoto(trip.id);
    start();
    await flush();
    expect(photoDrain).toHaveBeenCalledTimes(1);

    await kickUploadQueue('focus');
    expect(photoDrain).toHaveBeenCalledTimes(2);

    // Two failures so far: the wait is now 30 s, not 15.
    await jest.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    expect(photoDrain).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    expect(photoDrain).toHaveBeenCalledTimes(3);
  });

  test('a finished sync cycle kicks the queue and resets the backoff (a trip may have reached the server)', async () => {
    drainGoesNowhere();
    const trip = newTrip();
    const photo = pendingPhoto(trip.id);
    start();
    await flush();
    await jest.advanceTimersByTimeAsync(BACKOFF_BASE_MS);
    await jest.advanceTimersByTimeAsync(BACKOFF_BASE_MS * 2);
    const before = photoDrain.mock.calls.length;

    drainSucceeds();
    useSyncStatusStore.setState({ lastSyncedAt: '2026-06-01T10:05:00.000Z' });
    await flush();

    expect(photoDrain).toHaveBeenCalledTimes(before + 1);
    expect(photosRepository.byId(sqlite.db, photo.id)?.upload_state).toBe('uploaded');
  });

  test('any other change to the sync status does not kick the queue', async () => {
    const trip = newTrip();
    start();
    await flush();
    pendingPhoto(trip.id);
    mockNetwork.state = OFFLINE;

    useSyncStatusStore.setState({ lastSyncedAt: null });
    await flush();

    expect(photoDrain).not.toHaveBeenCalled();
  });
});

describe('one drain at a time', () => {
  test('kicks made while a drain runs join it instead of starting another', async () => {
    const trip = newTrip();
    pendingPhoto(trip.id);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    photoDrain.mockImplementationOnce(async () => {
      await gate;
      for (const photo of photosRepository.pendingUploads(sqlite.db, trip.id)) {
        photosRepository.markUploaded(sqlite.db, photo.id, {
          sentUpdatedAt: photo.updated_at,
          syncedAt: photo.updated_at,
          server: { moderation_state: 'pending', has_thumbnail: false },
        });
      }
    });
    start();
    await flush();
    expect(photoDrain).toHaveBeenCalledTimes(1);

    const second = kickUploadQueue('focus');
    const third = kickUploadQueue('foreground');
    await flush();
    expect(photoDrain).toHaveBeenCalledTimes(1);

    release();
    await jest.advanceTimersByTimeAsync(0);
    await Promise.all([second, third]);

    // One drain served all three kicks; it finished the queue, so nothing looped.
    expect(photoDrain).toHaveBeenCalledTimes(1);
    expect(await countPendingUploads(sqlite.db)).toBe(0);
  });

  test('a photo captured mid-drain is picked up by the pass the drain makes once more, not left for the backoff', async () => {
    const trip = newTrip();
    pendingPhoto(trip.id);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    photoDrain.mockImplementationOnce(async (_db: unknown, tripId: string) => {
      // The drain took its list before the late photo existed.
      const snapshot = photosRepository.pendingUploads(sqlite.db, tripId);
      await gate;
      for (const photo of snapshot) {
        photosRepository.markUploaded(sqlite.db, photo.id, {
          sentUpdatedAt: photo.updated_at,
          syncedAt: photo.updated_at,
          server: { moderation_state: 'pending', has_thumbnail: false },
        });
      }
    });
    start();
    await flush();

    const late = pendingPhoto(trip.id);
    const kicked = kickUploadQueue('capture');
    release();
    await jest.advanceTimersByTimeAsync(0);
    await kicked;

    expect(photoDrain).toHaveBeenCalledTimes(2);
    expect(photosRepository.byId(sqlite.db, late.id)?.upload_state).toBe('uploaded');
    expect(await countPendingUploads(sqlite.db)).toBe(0);
  });

  test('a pass that gets nowhere is not repeated in a hurry just because someone kicked meanwhile', async () => {
    drainGoesNowhere();
    const trip = newTrip();
    pendingPhoto(trip.id);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    photoDrain.mockImplementationOnce(async () => gate);
    start();
    await flush();

    const joined = kickUploadQueue('focus');
    release();
    await jest.advanceTimersByTimeAsync(0);
    await joined;

    expect(photoDrain).toHaveBeenCalledTimes(1);
  });
});

describe('lifecycle and failure', () => {
  test('a kick with no queue bound is a quiet no-op', async () => {
    await expect(kickUploadQueue('capture')).resolves.toBeUndefined();
    expect(photoDrain).not.toHaveBeenCalled();
  });

  test('unbinding stops uploads, drops every timer, and later kicks do nothing', async () => {
    drainGoesNowhere();
    const trip = newTrip();
    pendingPhoto(trip.id);
    const stop = start();
    await flush();
    expect(jest.getTimerCount()).toBe(1);
    expect(mockNetwork.listeners.size).toBe(1);

    stop();
    stop(); // idempotent

    expect(jest.getTimerCount()).toBe(0);
    expect(mockNetwork.listeners.size).toBe(0);
    const calls = photoDrain.mock.calls.length;
    await kickUploadQueue('capture');
    await setLink(OFFLINE);
    await setLink(WIFI);
    useSyncStatusStore.setState({ lastSyncedAt: '2026-06-01T11:00:00.000Z' });
    await jest.advanceTimersByTimeAsync(BACKOFF_CEILING_MS);
    expect(photoDrain).toHaveBeenCalledTimes(calls);
  });

  test('a drain in progress stops before its next trip once unbound', async () => {
    const first = newTrip('First');
    pendingPhoto(first.id);
    jest.setSystemTime(new Date(START.getTime() + 1000));
    const second = newTrip('Second');
    pendingPhoto(second.id);
    let stop: () => void = () => undefined;
    photoDrain.mockImplementationOnce(async () => {
      stop();
    });

    stop = start();
    await flush();

    expect(drainedTrips()).toEqual([first.id]);
  });

  test('binding a second database replaces the first: the first one’s wait is dropped', async () => {
    mockNetwork.state = CELLULAR;
    const trip = newTrip();
    pendingPhoto(trip.id);
    start();
    await flush();
    expect(jest.getTimerCount()).toBe(1);
    expect(mockNetwork.listeners.size).toBe(1);

    const other = await createTestDatabase();
    unbind = startUploadQueue(other.db);
    await flush();

    // Nothing pending in the new store: one listener, no timers, no uploads.
    expect(mockNetwork.listeners.size).toBe(1);
    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(CELLULAR_HOLD_BACK_MS * 2);
    expect(photoDrain).not.toHaveBeenCalled();
    other.close();
  });

  test('never rejects: a store that cannot be read is reported, and retried with backoff', async () => {
    const trip = newTrip();
    pendingPhoto(trip.id);
    start();
    await flush();
    photoDrain.mockClear();
    sqlite.close();

    await expect(kickUploadQueue('capture')).resolves.toBeUndefined();

    expect(Sentry.captureException).toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(1);
    sqlite = await createTestDatabase();
  });

  test('never rejects: an uploader that throws is reported and the pass counts as failed', async () => {
    const trip = newTrip();
    pendingPhoto(trip.id);
    const failure = new Error('uploader blew up');
    photoDrain.mockRejectedValue(failure);
    start();
    await flush();

    await expect(kickUploadQueue('capture')).resolves.toBeUndefined();

    expect(Sentry.captureException).toHaveBeenCalledWith(failure);
    // Two failed passes so far (the bind and the kick): the next wait is 30 s,
    // and when it comes the uploader works.
    drainSucceeds();
    await jest.advanceTimersByTimeAsync(BACKOFF_BASE_MS * 2);
    expect(await countPendingUploads(sqlite.db)).toBe(0);
  });
});

describe('what the queue considers work', () => {
  test('is exactly what the uploaders would pick up — never failed, uploaded-and-clean or deleted records', async () => {
    const settled = newTrip('Nothing owed');
    const editedAfterUpload = newTrip('An unsent confirmation');
    const pendingBytes = newTrip('A document not yet sent');
    const pendingPhotoTrip = newTrip('A photo not yet sent');

    // Nothing owed: a failed photo, a deleted pending photo, a failed document,
    // a deleted pending document, and one uploaded and clean.
    photosRepository.markFailed(sqlite.db, pendingPhoto(settled.id).id);
    photosRepository.remove(sqlite.db, pendingPhoto(settled.id).id);
    documentsRepository.markUploadFailed(sqlite.db, pendingDocument(settled.id).id);
    documentsRepository.remove(sqlite.db, pendingDocument(settled.id).id);
    const clean = pendingDocument(settled.id);
    documentsRepository.markUploaded(sqlite.db, clean.id, clean.updated_at);

    // Owed: a confirmation made after the bytes went, a pending document, a pending photo.
    const sent = pendingDocument(editedAfterUpload.id, 'boarding_pass');
    documentsRepository.markUploaded(sqlite.db, sent.id, sent.updated_at);
    documentsRepository.confirmFields(sqlite.db, sent.id, FIELDS);
    pendingDocument(pendingBytes.id);
    pendingPhoto(pendingPhotoTrip.id);

    const owedPerRepositories = [
      settled.id,
      editedAfterUpload.id,
      pendingBytes.id,
      pendingPhotoTrip.id,
    ].filter(
      (tripId) =>
        photosRepository.pendingUploads(sqlite.db, tripId).length > 0 ||
        documentsRepository.needingUploadIds(sqlite.db, tripId).length > 0,
    );
    expect(owedPerRepositories).toHaveLength(3);
    expect(owedPerRepositories).not.toContain(settled.id);

    start();
    await flush();

    const visited = new Set(log.map((entry) => entry.split(':')[1]));
    expect(visited).toEqual(new Set(owedPerRepositories));
    expect(log).toContain(`documents:${editedAfterUpload.id}`);
    expect(log).not.toContain(`photos:${editedAfterUpload.id}`);
    expect(log).toContain(`photos:${pendingPhotoTrip.id}`);
    expect(log).not.toContain(`documents:${pendingPhotoTrip.id}`);
  });
});
