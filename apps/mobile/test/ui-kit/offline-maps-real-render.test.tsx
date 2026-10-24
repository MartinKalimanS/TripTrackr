/**
 * 004 T444 - the offline maps screen over the REAL `heroui-native` under Jest (research
 * D4-13), as trip-screen-real-render.test.tsx does for the trip screen.
 *
 * `test/app/offline-maps.test.tsx` renders the screen over the stand-in. This file puts the
 * kit's own Card, Button, Text and Skeleton underneath it, so what the screen relies on is
 * checked against the real components: nothing throws (a card inside a card is a
 * development error; a kit component needs only the provider), the ids and names land on
 * the nodes a test or a Maestro flow finds them by, and our classes reach the chip. How a
 * class LOOKS (the soft fill, the hairline) is Uniwind's, on a device.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type * as HeroUI from 'heroui-native';

import OfflineMapsScreen from '@/app/trip/[id]/offline-maps';
import type { StopWithPlace } from '@/db/repositories/stops';
import type { TripRow } from '@/db/schema';

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => require('../mocks/reanimated-full'));
// The suite-wide stand-in is replaced by the real kit for THIS file only.
jest.mock('heroui-native', () => jest.requireActual('heroui-native'));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: 'trip-42' }),
}));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));
jest.mock('@/hooks/use-mapbox-ready', () => ({ useMapboxReady: () => 'ready' }));
jest.mock('@/lib/disk-space', () => ({ freeDiskBytes: () => 1_700_000_000 }));

const mockTrip: TripRow = {
  id: 'trip-42',
  title: 'Italy, spring 2026',
  home_currency: 'EUR',
  is_public: false,
  cover_photo_id: null,
  status: 'planning',
  created_at: 'x',
  updated_at: 'x',
  deleted_at: null,
  is_dirty: false,
  synced_at: 'x',
};

function stop(id: string, cityId: number, city: string): StopWithPlace {
  return {
    id,
    trip_id: 'trip-42',
    city_id: cityId,
    sort_order: cityId,
    arrive_date: '2026-05-10',
    depart_date: '2026-05-12',
    created_at: 'x',
    updated_at: 'x',
    deleted_at: null,
    is_dirty: false,
    synced_at: 'x',
    city_name: city,
    country_id: 1,
    country_name: 'Italy',
    lat: 41.9,
    lng: 12.5,
  };
}

const mockStops: { data: StopWithPlace[]; loading: boolean; error: Error | null } = {
  data: [],
  loading: false,
  error: null,
};
jest.mock('@/features/trips/use-trips', () => ({
  useTrip: () => ({ data: mockTrip, loading: false, error: null }),
  useTripStops: () => mockStops,
}));

const { offlineManager } = jest.requireMock('@rnmapbox/maps') as {
  offlineManager: {
    createPack: jest.Mock;
    unsubscribe: jest.Mock;
    __emitProgress: (name: string, update: Record<string, unknown>) => void;
    __emitError: (name: string, message: string) => void;
    __reset: () => void;
  };
};

const { HeroUINativeProvider } = jest.requireActual<typeof HeroUI>('heroui-native');
const CONFIG = { devInfo: { stylingPrinciples: false } };

// Under Jest the kit's `useThemeColor` asks Uniwind for `--color-*` variables the stylesheet
// transform never registered, so the kit's ghost Button cannot blend its hover colour and
// its colour kit reports it. That is the test environment, not the screen: only that
// message is dropped, every other error still prints.
const COLOUR_KIT_NOISE = /\[colorKit\.RGB\]/;
const consoleError = console.error.bind(console);
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (!COLOUR_KIT_NOISE.test(String(args[0]))) consoleError(...args);
  });
});
afterAll(() => jest.restoreAllMocks());

const classesOf = (node: { props: { className?: unknown } }) =>
  String(node.props.className ?? '')
    .split(/\s+/)
    .filter(Boolean);

async function renderScreen() {
  await render(
    <HeroUINativeProvider config={CONFIG}>
      <OfflineMapsScreen />
    </HeroUINativeProvider>,
  );
  await waitFor(() => expect(screen.queryByLabelText('Checking saved maps')).toBeNull());
}

/** A finished pack an earlier session left on the device. */
async function seedReady(cityId: number, bytes: number) {
  const name = `city-${cityId}`;
  await offlineManager.createPack(
    {
      name,
      bounds: [
        [0, 0],
        [0, 0],
      ],
    },
    () => undefined,
  );
  offlineManager.__emitProgress(name, {
    state: 2,
    percentage: 100,
    completedResourceSize: bytes,
  });
  offlineManager.unsubscribe(name);
}

beforeEach(() => {
  offlineManager.__reset();
  mockStops.data = [stop('s1', 100, 'Roma'), stop('s2', 101, 'Firenze')];
  mockStops.loading = false;
  mockStops.error = null;
});

describe('the offline maps screen over the real kit', () => {
  test('renders the trip, a card per city, the chips, the caption and the actions without error', async () => {
    await seedReady(101, 8_100_000);
    await renderScreen();

    expect(screen.getByTestId('offline-maps-title')).toHaveTextContent('Offline maps');
    expect(screen.getByTestId('offline-maps-trip')).toHaveTextContent(
      'For Italy, spring 2026',
    );
    expect(screen.getByTestId('offline-city-100')).toBeTruthy();
    expect(screen.getByTestId('offline-city-101')).toBeTruthy();
    expect(screen.getByTestId('offline-status-100')).toHaveTextContent(
      'Not saved on this device',
    );
    expect(screen.getByTestId('offline-status-101')).toHaveTextContent(
      'Ready offline · 8.1 MB',
    );
    expect(screen.getByTestId('offline-storage')).toHaveTextContent(/8.1 MB/);
    expect(screen.getByTestId('offline-storage')).toHaveTextContent(/1.7 GB free/);
  });

  test('the storage card is the kit’s cream tile and holds no card (the nesting guard would throw); a row is no card', async () => {
    await renderScreen();

    expect(classesOf(screen.getByTestId('offline-storage'))).toContain(
      'bg-surface-secondary',
    );
    expect(classesOf(screen.getByTestId('offline-city-100'))).not.toContain('bg-surface');
  });

  test('each state is one announced text element, and a ready one is a soft success chip', async () => {
    await seedReady(101, 8_100_000);
    await renderScreen();

    const none = screen.getByTestId('offline-status-100');
    expect(none.props.accessibilityRole).toBe('text');
    expect(none.props.accessible).toBe(true);
    const ready = screen.getByTestId('offline-status-101');
    expect(ready.props.accessibilityLabel).toBe('Ready offline, 8.1 megabytes');
    expect(classesOf(ready)).toEqual(
      expect.arrayContaining(['bg-success/15', 'rounded-full', 'self-start']),
    );
  });

  test('Download, Remove and Stop are buttons the kit names and presses', async () => {
    await seedReady(101, 8_100_000);
    await renderScreen();

    const download = screen.getByTestId('offline-download-100');
    expect(download.props.accessibilityRole).toBe('button');
    expect(download.props.accessibilityLabel).toBe('Download Roma for offline use');
    const remove = screen.getByTestId('offline-remove-101');
    expect(remove.props.accessibilityLabel).toBe('Remove Firenze’s offline map');

    await fireEvent.press(download);
    await waitFor(() =>
      expect(offlineManager.createPack).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'city-100' }),
        expect.any(Function),
        expect.any(Function),
      ),
    );
    await act(async () => offlineManager.__emitProgress('city-100', { percentage: 25 }));
    expect(screen.getByTestId('offline-status-100')).toHaveTextContent(
      'Downloading… 25%',
    );
    expect(screen.getByTestId('offline-stop-100').props.accessibilityLabel).toBe(
      'Stop downloading Roma',
    );
  });

  test('while the stops load, the kit draws one named placeholder region instead of cities', async () => {
    mockStops.data = [];
    mockStops.loading = true;
    await render(
      <HeroUINativeProvider config={CONFIG}>
        <OfflineMapsScreen />
      </HeroUINativeProvider>,
    );

    const region = screen.getByLabelText('Loading the trip’s cities');
    expect(region.props.accessibilityRole).toBe('progressbar');
    expect(screen.queryByTestId('offline-city-100')).toBeNull();
  });

  test('a failed download is an alert in words, with Try again beside it', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('offline-download-100'));
    await waitFor(() => expect(offlineManager.createPack).toHaveBeenCalled());
    await act(async () =>
      offlineManager.__emitError(
        'city-100',
        'The Internet connection appears to be offline',
      ),
    );

    const failure = screen.getByTestId('offline-status-100');
    expect(failure.props.accessibilityRole).toBe('alert');
    expect(screen.getByTestId('offline-download-100').props.accessibilityLabel).toBe(
      'Try downloading Roma again',
    );
  });
});
