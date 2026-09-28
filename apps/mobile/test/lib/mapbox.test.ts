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
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

type Loaded = {
  lib: typeof import('@/lib/mapbox');
  Mapbox: { setAccessToken: jest.Mock; setTelemetryEnabled: jest.Mock };
  Sentry: { captureException: jest.Mock };
};

function load(): Loaded {
  let loaded: Loaded | undefined;
  jest.isolateModules(() => {
    loaded = {
      lib: require('@/lib/mapbox'),
      Mapbox: require('@rnmapbox/maps').default,
      Sentry: require('@/lib/sentry').Sentry,
    };
  });
  return loaded!;
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
