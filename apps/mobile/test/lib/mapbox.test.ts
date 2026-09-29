/**
 * Mapbox start-up — research D-30.
 *
 * The public token is inlined from `EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN` at build
 * time (https://docs.expo.dev/guides/environment-variables.md) and handed to
 * the SDK once per launch. Telemetry is switched off only after the token has
 * been accepted — Android reaches the telemetry switch through a map view,
 * which refuses to start without a token — and no map may mount before both
 * have happened (`useMapboxReady`).
 *
 * Each test loads a fresh copy of the module, so its once-per-launch memory
 * starts empty; the SDK and Sentry stand-ins come from the same copy.
 */
import { waitFor } from '@testing-library/react-native';

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

type Loaded = {
  lib: typeof import('@/lib/mapbox');
  secure: typeof import('@/lib/secure-store');
  Mapbox: {
    setAccessToken: jest.Mock;
    setTelemetryEnabled: jest.Mock;
    clearData: jest.Mock;
    offlineManager: {
      createPack: jest.Mock;
      getPacks: jest.Mock;
      deletePack: jest.Mock;
      __reset: () => void;
    };
  };
  Sentry: { captureException: jest.Mock };
  SecureStore: { getItemAsync: jest.Mock; setItemAsync: jest.Mock; __reset: () => void };
};

function load(): Loaded {
  let loaded: Loaded | undefined;
  jest.isolateModules(() => {
    loaded = {
      lib: require('@/lib/mapbox'),
      secure: require('@/lib/secure-store'),
      Mapbox: require('@rnmapbox/maps').default,
      Sentry: require('@/lib/sentry').Sentry,
      SecureStore: require('expo-secure-store'),
    };
  });
  // The keychain and the tile store are device state: start every test empty.
  loaded!.SecureStore.__reset();
  loaded!.Mapbox.offlineManager.__reset();
  return loaded!;
}

/** A city saved on this device, as the offline-maps screen saves one. */
function savePack({ Mapbox }: Loaded, name = 'city-100') {
  return Mapbox.offlineManager.createPack(
    {
      name,
      bounds: [
        [1, 1],
        [0, 0],
      ],
    },
    jest.fn(),
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

beforeEach(() => {
  process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN = 'pk.public';
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN;
});

describe('mapboxAccessToken', () => {
  test('is the public token from the build', () => {
    expect(load().lib.mapboxAccessToken()).toBe('pk.public');
  });

  test('is null when the build has none, or an empty one', () => {
    const { lib } = load();
    delete process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN;
    expect(lib.mapboxAccessToken()).toBeNull();
    process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN = '';
    expect(lib.mapboxAccessToken()).toBeNull();
  });
});

describe('configureMapbox', () => {
  test('sets the token, and only once it is accepted switches telemetry off', async () => {
    const { lib, Mapbox } = load();
    const accepted = deferred<string>();
    Mapbox.setAccessToken.mockReturnValueOnce(accepted.promise);

    const setup = lib.configureMapbox();
    expect(Mapbox.setAccessToken).toHaveBeenCalledWith('pk.public');
    expect(Mapbox.setTelemetryEnabled).not.toHaveBeenCalled();
    expect(lib.isMapboxReady()).toBe(false);

    accepted.resolve('pk.public');
    await expect(setup).resolves.toBe(true);
    expect(Mapbox.setTelemetryEnabled).toHaveBeenCalledWith(false);
    expect(lib.isMapboxReady()).toBe(true);
  });

  test('runs once however many callers ask', async () => {
    const { lib, Mapbox } = load();
    const [first, second] = [lib.configureMapbox(), lib.configureMapbox()];
    expect(second).toBe(first);
    await expect(first).resolves.toBe(true);
    await lib.configureMapbox();
    expect(Mapbox.setAccessToken).toHaveBeenCalledTimes(1);
  });

  test('does nothing, and says so, without a token', async () => {
    const { lib, Mapbox } = load();
    delete process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN;

    await expect(lib.configureMapbox()).resolves.toBe(false);
    expect(Mapbox.setAccessToken).not.toHaveBeenCalled();
    expect(Mapbox.setTelemetryEnabled).not.toHaveBeenCalled();
    expect(lib.isMapboxReady()).toBe(false);
  });

  test('a token the SDK refuses is reported, leaves the map unavailable, and is retried', async () => {
    const { lib, Mapbox, Sentry } = load();
    const failure = new Error('native module unavailable');
    Mapbox.setAccessToken.mockRejectedValueOnce(failure);

    await expect(lib.configureMapbox()).resolves.toBe(false);
    expect(Sentry.captureException).toHaveBeenCalledWith(failure);
    expect(Mapbox.setTelemetryEnabled).not.toHaveBeenCalled();
    expect(lib.isMapboxReady()).toBe(false);

    await expect(lib.configureMapbox()).resolves.toBe(true);
    expect(Mapbox.setAccessToken).toHaveBeenCalledTimes(2);
  });

  test('a telemetry switch that throws is reported but does not take the globe away', async () => {
    const { lib, Mapbox, Sentry } = load();
    const failure = new Error('telemetry unavailable');
    Mapbox.setTelemetryEnabled.mockImplementationOnce(() => {
      throw failure;
    });

    await expect(lib.configureMapbox()).resolves.toBe(true);
    expect(Sentry.captureException).toHaveBeenCalledWith(failure);
    expect(lib.isMapboxReady()).toBe(true);
  });
});

describe('configureMapbox — a sign-out the app closed part-way through (research D-06)', () => {
  test('finishes the wipe it recorded before any map may mount', async () => {
    const loaded = load();
    const { lib, secure, Mapbox } = loaded;
    await savePack(loaded);
    await secure.markOfflineMapsWipePending();
    const clearing = deferred<void>();
    Mapbox.clearData.mockReturnValueOnce(clearing.promise);

    const setup = lib.configureMapbox();
    await waitFor(() => expect(Mapbox.clearData).toHaveBeenCalled());
    expect(Mapbox.offlineManager.deletePack).toHaveBeenCalledWith('city-100');
    expect(lib.isMapboxReady()).toBe(false);

    clearing.resolve();
    await expect(setup).resolves.toBe(true);
    await expect(Mapbox.offlineManager.getPacks()).resolves.toEqual([]);
    await expect(secure.isOfflineMapsWipePending()).resolves.toBe(false);
    expect(lib.isMapboxReady()).toBe(true);
  });

  test('with nothing recorded, start-up leaves the offline store alone', async () => {
    const loaded = load();
    const { lib, Mapbox } = loaded;
    await savePack(loaded);

    await expect(lib.configureMapbox()).resolves.toBe(true);

    expect(Mapbox.offlineManager.deletePack).not.toHaveBeenCalled();
    expect(Mapbox.clearData).not.toHaveBeenCalled();
  });

  test('a keychain that cannot be read is reported and does not take the globe away', async () => {
    const { lib, Mapbox, Sentry, SecureStore } = load();
    const failure = new Error('Keychain unavailable');
    SecureStore.getItemAsync.mockRejectedValueOnce(failure);

    await expect(lib.configureMapbox()).resolves.toBe(true);

    expect(Sentry.captureException).toHaveBeenCalledWith(failure);
    expect(Mapbox.clearData).not.toHaveBeenCalled();
    expect(lib.isMapboxReady()).toBe(true);
  });
});

describe('clearOfflineMaps — at sign-out (research D-06, amended 2026-09-29)', () => {
  test('forgets every saved city and the browsing cache once start-up has finished', async () => {
    const loaded = load();
    const { lib, secure, Mapbox } = loaded;
    await savePack(loaded, 'city-100');
    await savePack(loaded, 'city-200');

    await lib.clearOfflineMaps();

    expect(Mapbox.setAccessToken).toHaveBeenCalled();
    expect(Mapbox.offlineManager.deletePack.mock.calls).toEqual([
      ['city-100'],
      ['city-200'],
    ]);
    expect(Mapbox.clearData).toHaveBeenCalledTimes(1);
    await expect(Mapbox.offlineManager.getPacks()).resolves.toEqual([]);
    await expect(secure.isOfflineMapsWipePending()).resolves.toBe(false);
  });

  test('records the wipe before it begins, so the next start-up can finish one cut short', async () => {
    const { lib, secure, Mapbox } = load();
    let recordedDuringWipe: boolean | null = null;
    Mapbox.offlineManager.getPacks.mockImplementationOnce(async () => {
      recordedDuringWipe = await secure.isOfflineMapsWipePending();
      return [];
    });

    await lib.clearOfflineMaps();

    expect(recordedDuringWipe).toBe(true);
    await expect(secure.isOfflineMapsWipePending()).resolves.toBe(false);
  });

  test('leaves the store alone in a build without a token, which never created it', async () => {
    delete process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN;
    const { lib, secure, Mapbox } = load();

    await lib.clearOfflineMaps();

    expect(Mapbox.offlineManager.getPacks).not.toHaveBeenCalled();
    expect(Mapbox.clearData).not.toHaveBeenCalled();
    await expect(secure.isOfflineMapsWipePending()).resolves.toBe(false);
  });

  test('when the SDK refuses the token, the wipe is kept for the start-up that succeeds', async () => {
    const loaded = load();
    const { lib, secure, Mapbox } = loaded;
    await savePack(loaded);
    Mapbox.setAccessToken.mockRejectedValueOnce(new Error('native module unavailable'));

    await lib.clearOfflineMaps();
    expect(Mapbox.offlineManager.deletePack).not.toHaveBeenCalled();
    await expect(secure.isOfflineMapsWipePending()).resolves.toBe(true);

    await expect(lib.configureMapbox()).resolves.toBe(true);
    await expect(Mapbox.offlineManager.getPacks()).resolves.toEqual([]);
    await expect(secure.isOfflineMapsWipePending()).resolves.toBe(false);
  });

  test('a store that refuses is reported, never thrown, and the wipe is kept', async () => {
    const loaded = load();
    const { lib, secure, Mapbox, Sentry } = loaded;
    await savePack(loaded);
    const refusal = new Error('database locked');
    Mapbox.offlineManager.deletePack.mockRejectedValueOnce(refusal);

    await expect(lib.clearOfflineMaps()).resolves.toBeUndefined();

    expect(Sentry.captureException).toHaveBeenCalledWith(refusal);
    await expect(secure.isOfflineMapsWipePending()).resolves.toBe(true);
  });

  test('a pack still listed afterwards is not taken as gone: reported, and the wipe kept', async () => {
    // On iOS deletePack resolves once removal is requested, not done.
    const loaded = load();
    const { lib, secure, Mapbox, Sentry } = loaded;
    await savePack(loaded);
    Mapbox.offlineManager.deletePack.mockResolvedValueOnce(undefined);

    await lib.clearOfflineMaps();

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/^1 offline map pack/) }),
    );
    await expect(secure.isOfflineMapsWipePending()).resolves.toBe(true);
  });

  test('a keychain that cannot record the wipe is reported; the wipe still runs', async () => {
    const loaded = load();
    const { lib, Mapbox, Sentry, SecureStore } = loaded;
    await savePack(loaded);
    const failure = new Error('Keychain unavailable');
    SecureStore.setItemAsync.mockRejectedValueOnce(failure);

    await lib.clearOfflineMaps();

    expect(Sentry.captureException).toHaveBeenCalledWith(failure);
    expect(Mapbox.offlineManager.deletePack).toHaveBeenCalledWith('city-100');
    expect(Mapbox.clearData).toHaveBeenCalledTimes(1);
  });
});
