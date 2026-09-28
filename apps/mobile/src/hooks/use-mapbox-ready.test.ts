/**
 * `useMapboxReady` — no map mounts before Mapbox is configured (research D-30).
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useMapboxReady } from './use-mapbox-ready';

const mockLib = {
  token: 'pk.public' as string | null,
  ready: false,
  configure: jest.fn<Promise<boolean>, []>(),
};

jest.mock('@/lib/mapbox', () => ({
  mapboxAccessToken: () => mockLib.token,
  isMapboxReady: () => mockLib.ready,
  configureMapbox: () => mockLib.configure(),
}));

beforeEach(() => {
  mockLib.token = 'pk.public';
  mockLib.ready = false;
  mockLib.configure.mockReset().mockResolvedValue(true);
});

test('waits while Mapbox is being configured, then lets the map mount', async () => {
  let finish!: (ok: boolean) => void;
  mockLib.configure.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { result } = await renderHook(() => useMapboxReady());
  expect(result.current).toBe('starting');

  await act(async () => finish(true));
  expect(result.current).toBe('ready');
});

test('is ready at once when an earlier mount already configured it', async () => {
  mockLib.ready = true;
  const { result } = await renderHook(() => useMapboxReady());
  expect(result.current).toBe('ready');
});

test('is unavailable when the SDK refused the token', async () => {
  mockLib.configure.mockResolvedValue(false);
  const { result } = await renderHook(() => useMapboxReady());
  await waitFor(() => expect(result.current).toBe('unavailable'));
});

test('is unavailable, without trying, when the build has no token', async () => {
  mockLib.token = null;
  const { result } = await renderHook(() => useMapboxReady());
  expect(result.current).toBe('unavailable');
  expect(mockLib.configure).not.toHaveBeenCalled();
});

test('ignores a result that arrives after unmount', async () => {
  let finish!: (ok: boolean) => void;
  mockLib.configure.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { result, unmount } = await renderHook(() => useMapboxReady());
  await unmount();
  await act(async () => finish(true));
  expect(result.current).toBe('starting');
});
