/**
 * `useOfflinePacks` — a trip's cities saved for use without a connection,
 * tasks.md T105 (FR-044; User Story 4, Acceptance Scenario 3).
 *
 * Runs against jest.setup.ts's in-memory `offlineManager`, which keeps packs
 * and plays the native progress and error events to the listeners the hook
 * registered. Pinned here: packs already on the device are read on mount; a
 * download reports progress and ends ready with its size; a failure is shown
 * in words and never leaves a city stuck downloading; "already exists" is
 * met by listening (and resuming), not by failing; a download still running
 * is listened to again when the screen comes back; nothing listens after
 * unmount; and a removal unsubscribes before it deletes.
 *
 * The record of downloads in flight lives for the JS runtime, as on the
 * device, so a test that leaves a download running uses cities of its own.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  OFFLINE_PACK_COPY,
  cityPackOptions,
  type OfflineCity,
} from '@/features/trips/offline-packs';
import { useOfflinePacks } from '@/features/trips/use-offline-pack';
import { Sentry } from '@/lib/sentry';

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

type Status = {
  name: string;
  state: number | string;
  percentage: number | null;
  completedResourceSize: number;
  completedTileSize: number;
};
type MockPack = {
  name: string;
  status: () => Promise<Status>;
  resume: jest.Mock;
  pause: jest.Mock;
};
type MockOfflineManager = {
  createPack: jest.Mock;
  getPacks: jest.Mock;
  getPack: jest.Mock<Promise<MockPack | undefined>, [string]>;
  deletePack: jest.Mock;
  subscribe: jest.Mock;
  unsubscribe: jest.Mock;
  __emitProgress: (name: string, update: Partial<Status>) => void;
  __emitError: (name: string, message: string) => void;
  __reset: () => void;
};

const { offlineManager } = jest.requireMock('@rnmapbox/maps') as {
  offlineManager: MockOfflineManager;
};

const city = (
  cityId: number,
  cityName: string,
  lat: number,
  lng: number,
): OfflineCity => ({
  cityId,
  cityName,
  countryName: 'Italy',
  lat,
  lng,
});
const rome = city(100, 'Roma', 41.9, 12.5);
const florence = city(101, 'Firenze', 43.77, 11.26);
/** Only ever left behind by an "earlier session"; never downloaded before its test. */
const naples = city(300, 'Napoli', 40.85, 14.27);
const bari = city(301, 'Bari', 41.12, 16.87);
/** Left downloading when their tests end. */
const venice = city(400, 'Venezia', 45.44, 12.33);
const milan = city(401, 'Milano', 45.46, 9.19);
const turin = city(500, 'Torino', 45.07, 7.69);
const genoa = city(600, 'Genova', 44.41, 8.93);

/** A pack an earlier session left on the device, with nothing listening to it. */
async function seedPack(cityId: number, status: Partial<Status>): Promise<MockPack> {
  const name = `city-${cityId}`;
  await offlineManager.createPack(
    {
      name,
      bounds: [
        [0, 0],
        [0, 0],
      ],
      metadata: { cityId },
    },
    () => undefined,
  );
  offlineManager.__emitProgress(name, status);
  offlineManager.unsubscribe(name);
  const pack = await offlineManager.getPack(name);
  jest.clearAllMocks();
  return pack!;
}

async function renderPacks(cities: readonly OfflineCity[]) {
  const rendered = await renderHook(() => useOfflinePacks(cities));
  await waitFor(() => expect(rendered.result.current.loading).toBe(false));
  return rendered;
}

const emitProgress = (name: string, update: Partial<Status>) =>
  act(async () => offlineManager.__emitProgress(name, update));
const emitError = (name: string, message: string) =>
  act(async () => offlineManager.__emitError(name, message));

beforeEach(() => {
  offlineManager.__reset();
});

describe('on mount — what is already on the device', () => {
  test('is loading until the device has answered', async () => {
    let answer!: (packs: unknown[]) => void;
    offlineManager.getPacks.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const { result } = await renderHook(() => useOfflinePacks([rome]));
    expect(result.current.loading).toBe(true);
    expect(result.current.stateOf(100)).toEqual({ kind: 'none' });

    await act(async () => answer([]));
    expect(result.current.loading).toBe(false);
  });

  test('a finished city is ready with its size; a city with no pack is not saved', async () => {
    await seedPack(100, { state: 2, percentage: 100, completedResourceSize: 12_400_000 });
    const { result } = await renderPacks([rome, florence]);

    expect(result.current.error).toBeNull();
    expect(result.current.stateOf(100)).toEqual({ kind: 'ready', bytes: 12_400_000 });
    expect(result.current.stateOf(101)).toEqual({ kind: 'none' });
    expect(offlineManager.subscribe).not.toHaveBeenCalled();
  });

  test('packs of other trips’ cities, and packs this app did not name, are left alone', async () => {
    await seedPack(999, { percentage: 40 });
    await offlineManager.createPack(
      {
        name: 'offlinePack',
        bounds: [
          [0, 0],
          [0, 0],
        ],
      },
      () => undefined,
    );
    jest.clearAllMocks();

    const { result } = await renderPacks([rome]);

    expect(result.current.stateOf(100)).toEqual({ kind: 'none' });
    expect(result.current.stateOf(999)).toEqual({ kind: 'none' });
    expect(offlineManager.subscribe).not.toHaveBeenCalled();
  });

  test('a download cut off by the app closing shows as stopped, and Try again resumes it', async () => {
    const pack = await seedPack(300, { state: 'unknown', percentage: 30 });
    const { result } = await renderPacks([naples]);

    expect(result.current.stateOf(300)).toEqual({
      kind: 'error',
      message: OFFLINE_PACK_COPY.interrupted,
      partial: true,
    });
    // Nothing is downloading it, so nothing is listened to.
    expect(offlineManager.subscribe).not.toHaveBeenCalled();

    await act(async () => result.current.download(naples));

    expect(offlineManager.subscribe).toHaveBeenCalledWith(
      'city-300',
      expect.any(Function),
      expect.any(Function),
    );
    expect(pack.resume).toHaveBeenCalledTimes(1);
    expect(result.current.stateOf(300)).toEqual({ kind: 'downloading', percent: 30 });

    await emitProgress('city-300', { percentage: 100, completedResourceSize: 3_000_000 });
    expect(result.current.stateOf(300)).toEqual({ kind: 'ready', bytes: 3_000_000 });
  });

  test('a resume the SDK refuses is shown in words, not left downloading', async () => {
    const pack = await seedPack(301, { state: 'unknown', percentage: 30 });
    pack.resume.mockRejectedValueOnce(new Error('Unknown offline pack: city-301'));
    const { result } = await renderPacks([bari]);

    await act(async () => result.current.download(bari));

    expect(result.current.stateOf(301)).toEqual({
      kind: 'error',
      message: OFFLINE_PACK_COPY.failed,
      partial: true,
    });
    expect(offlineManager.unsubscribe).toHaveBeenCalledWith('city-301');
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
  });

  test('a running download that cannot be listened to again is shown in words, not stuck', async () => {
    const first = await renderPacks([genoa]);
    await act(async () => first.result.current.download(genoa));
    await emitProgress('city-600', { percentage: 25 });
    await first.unmount();
    offlineManager.subscribe.mockRejectedValueOnce(
      new Error('Unable to set pack observer'),
    );

    const second = await renderPacks([genoa]);

    expect(second.result.current.stateOf(600)).toEqual({
      kind: 'error',
      message: OFFLINE_PACK_COPY.failed,
      partial: true,
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
  });

  test('a saved map whose status cannot be read is flagged, and reported', async () => {
    const pack = await seedPack(100, { percentage: 100 });
    pack.status = () => Promise.reject(new Error('corrupt region'));

    const { result } = await renderPacks([rome]);

    expect(result.current.stateOf(100)).toEqual({
      kind: 'error',
      message: OFFLINE_PACK_COPY.unreadable,
      partial: true,
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
  });

  test('when the device’s packs cannot be read, says so; retry reads them again', async () => {
    offlineManager.getPacks.mockRejectedValueOnce(new Error('TileStoreError'));
    const { result } = await renderPacks([rome]);

    expect(result.current.error).toBeInstanceOf(Error);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));

    await act(async () => result.current.retry());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(offlineManager.getPacks).toHaveBeenCalledTimes(2);
  });
});

describe('download (FR-044)', () => {
  test('creates the city’s pack, reports whole percent, then ready with its size', async () => {
    const { result } = await renderPacks([rome]);

    await act(async () => result.current.download(rome));

    expect(offlineManager.createPack).toHaveBeenCalledWith(
      cityPackOptions(rome),
      expect.any(Function),
      expect.any(Function),
    );
    expect(result.current.stateOf(100)).toEqual({ kind: 'downloading', percent: 0 });

    await emitProgress('city-100', {
      percentage: 42.7,
      completedResourceSize: 5_000_000,
    });
    expect(result.current.stateOf(100)).toEqual({ kind: 'downloading', percent: 42 });

    await emitProgress('city-100', {
      state: 2,
      percentage: 100,
      completedResourceSize: 12_400_000,
    });
    expect(result.current.stateOf(100)).toEqual({ kind: 'ready', bytes: 12_400_000 });
  });

  test('a device-limit refusal is shown in words and never left downloading', async () => {
    const { result } = await renderPacks([rome]);
    await act(async () => result.current.download(rome));
    await emitProgress('city-100', { percentage: 30 });

    await emitError('city-100', 'Tile count limit exceeded');

    expect(result.current.stateOf(100)).toEqual({
      kind: 'error',
      message: OFFLINE_PACK_COPY.tooLarge,
      partial: true,
    });
    expect(offlineManager.unsubscribe).toHaveBeenCalledWith('city-100');

    // A late event from the failed attempt cannot put it back to "downloading".
    await emitProgress('city-100', { percentage: 35 });
    expect(result.current.stateOf(100)).toMatchObject({ kind: 'error' });
  });

  test('Try again meets "already exists" by listening and resuming, not by failing', async () => {
    const { result } = await renderPacks([rome]);
    await act(async () => result.current.download(rome));
    await emitProgress('city-100', { percentage: 30 });
    await emitError('city-100', 'The Internet connection appears to be offline.');
    expect(result.current.stateOf(100)).toMatchObject({
      message: OFFLINE_PACK_COPY.noConnection,
    });

    await act(async () => result.current.download(rome));

    await expect(offlineManager.createPack.mock.results[1]!.value).rejects.toThrow(
      /already exists/,
    );
    const pack = await offlineManager.getPack('city-100');
    expect(pack!.resume).toHaveBeenCalledTimes(1);
    expect(result.current.stateOf(100)).toEqual({ kind: 'downloading', percent: 30 });
    expect(Sentry.captureException).not.toHaveBeenCalled();

    await emitProgress('city-100', { percentage: 100, completedResourceSize: 8_000_000 });
    expect(result.current.stateOf(100)).toEqual({ kind: 'ready', bytes: 8_000_000 });
  });

  test('a city another screen finished meanwhile is simply ready', async () => {
    const { result } = await renderPacks([florence]);
    await seedPack(101, {
      state: 'complete',
      percentage: 100,
      completedResourceSize: 9e6,
    });

    await act(async () => result.current.download(florence));

    expect(result.current.stateOf(101)).toEqual({ kind: 'ready', bytes: 9e6 });
    expect(offlineManager.subscribe).not.toHaveBeenCalled();
    const pack = await offlineManager.getPack('city-101');
    expect(pack!.resume).not.toHaveBeenCalled();
  });

  test('a pack the SDK refuses to create is an error in words, reported, not left downloading', async () => {
    const { result } = await renderPacks([rome]);
    offlineManager.createPack.mockRejectedValueOnce(new Error('Request timed out'));

    await act(async () => result.current.download(rome));

    expect(result.current.stateOf(100)).toEqual({
      kind: 'error',
      message: OFFLINE_PACK_COPY.noConnection,
      partial: false,
    });
    // The SDK subscribes before it asks the native side; nothing may stay behind.
    expect(offlineManager.unsubscribe).toHaveBeenCalledWith('city-100');
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
  });

  test('a download still running is listened to again when the screen comes back', async () => {
    const first = await renderPacks([rome]);
    await act(async () => first.result.current.download(rome));
    await emitProgress('city-100', { percentage: 40 });

    await first.unmount();
    expect(offlineManager.unsubscribe).toHaveBeenCalledWith('city-100');
    // It carries on while nobody is looking.
    offlineManager.__emitProgress('city-100', { percentage: 50 });
    offlineManager.subscribe.mockClear();

    const second = await renderPacks([rome]);

    expect(second.result.current.stateOf(100)).toEqual({
      kind: 'downloading',
      percent: 50,
    });
    expect(offlineManager.subscribe).toHaveBeenCalledWith(
      'city-100',
      expect.any(Function),
      expect.any(Function),
    );

    await emitProgress('city-100', { percentage: 100, completedResourceSize: 7_000_000 });
    expect(second.result.current.stateOf(100)).toEqual({
      kind: 'ready',
      bytes: 7_000_000,
    });
  });

  test('a screen closing does not silence the newer one that took the download over', async () => {
    const older = await renderPacks([rome]);
    await act(async () => older.result.current.download(rome));
    await emitProgress('city-100', { percentage: 10 });

    // The SDK holds one listener per pack: the newer screen's replaces the older's.
    const newer = await renderPacks([rome]);
    expect(newer.result.current.stateOf(100)).toEqual({
      kind: 'downloading',
      percent: 10,
    });
    offlineManager.unsubscribe.mockClear();

    await older.unmount();
    expect(offlineManager.unsubscribe).not.toHaveBeenCalled();

    await emitProgress('city-100', { percentage: 60 });
    expect(newer.result.current.stateOf(100)).toEqual({
      kind: 'downloading',
      percent: 60,
    });
    await emitProgress('city-100', { percentage: 100, completedResourceSize: 4_000_000 });
    expect(newer.result.current.stateOf(100)).toEqual({
      kind: 'ready',
      bytes: 4_000_000,
    });
  });

  test('stops listening to every pack on unmount', async () => {
    const { result, unmount } = await renderPacks([venice, milan]);
    await act(async () => result.current.download(venice));
    await act(async () => result.current.download(milan));
    offlineManager.unsubscribe.mockClear();

    await unmount();

    expect(offlineManager.unsubscribe).toHaveBeenCalledWith('city-400');
    expect(offlineManager.unsubscribe).toHaveBeenCalledWith('city-401');
  });

  test('a download the SDK starts after the screen closed is not listened to', async () => {
    let finishDelete!: () => void;
    offlineManager.deletePack.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishDelete = resolve;
        }),
    );
    const { result, unmount } = await renderPacks([turin]);

    // Remove, then Download at once: the download waits for the removal.
    let removing!: Promise<void>;
    let downloading!: Promise<void>;
    await act(async () => {
      removing = result.current.remove(turin);
      downloading = result.current.download(turin);
    });
    expect(offlineManager.createPack).not.toHaveBeenCalled();

    await unmount();
    await act(async () => {
      finishDelete();
      await removing;
      await downloading;
    });

    // The download the traveller asked for carries on…
    expect(offlineManager.createPack).toHaveBeenCalledTimes(1);
    expect(await offlineManager.getPack('city-500')).toBeDefined();
    // …but no listener outlives the screen.
    const created = offlineManager.createPack.mock.invocationCallOrder[0]!;
    expect(
      Math.max(...offlineManager.unsubscribe.mock.invocationCallOrder),
    ).toBeGreaterThan(created);
  });
});

describe('remove', () => {
  test('unsubscribes before it deletes, then the city is not saved', async () => {
    await seedPack(100, { percentage: 100, completedResourceSize: 12_400_000 });
    const { result } = await renderPacks([rome]);
    expect(result.current.stateOf(100)).toMatchObject({ kind: 'ready' });

    await act(async () => result.current.remove(rome));

    expect(offlineManager.deletePack).toHaveBeenCalledWith('city-100');
    expect(offlineManager.unsubscribe.mock.invocationCallOrder[0]).toBeLessThan(
      offlineManager.deletePack.mock.invocationCallOrder[0]!,
    );
    expect(result.current.stateOf(100)).toEqual({ kind: 'none' });
    expect(await offlineManager.getPack('city-100')).toBeUndefined();
  });

  test('stopping a download: the cancellation it causes never reaches the screen', async () => {
    const { result } = await renderPacks([rome]);
    await act(async () => result.current.download(rome));
    await emitProgress('city-100', { percentage: 20 });

    await act(async () => result.current.remove(rome));
    await emitError('city-100', 'Canceled');

    expect(result.current.stateOf(100)).toEqual({ kind: 'none' });
  });

  test('a removal that fails is shown in words, keeping the saved part removable', async () => {
    await seedPack(100, { percentage: 100 });
    const { result } = await renderPacks([rome]);
    offlineManager.deletePack.mockRejectedValueOnce(new Error('database is locked'));

    await act(async () => result.current.remove(rome));

    expect(result.current.stateOf(100)).toEqual({
      kind: 'error',
      message: OFFLINE_PACK_COPY.removeFailed,
      partial: true,
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
  });
});
