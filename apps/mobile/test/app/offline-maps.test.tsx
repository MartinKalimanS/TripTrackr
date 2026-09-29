/**
 * `trip/[id]/offline-maps` — tasks.md T105 (FR-044; User Story 4, Acceptance
 * Scenario 3). The trip's live stops are mocked, as in the other trip
 * screens' suites; the offline packs run for real through `useOfflinePacks`
 * against jest.setup.ts's in-memory `offlineManager`.
 *
 * Pinned here: each of the trip's cities once, with a city this device cannot
 * place explained in words; progress as text and the finished size; removal
 * confirmed first; failures in words with a way forward; every state designed
 * (feature 002 FR-027); and nothing asked of Mapbox before it is configured.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import OfflineMapsScreen from '@/app/trip/[id]/offline-maps';
import type { StopWithPlace } from '@/db/repositories/stops';
import type { TripRow } from '@/db/schema';
import { OFFLINE_PACK_COPY } from '@/features/trips/offline-packs';

const mockBack = jest.fn();
let mockParams: Record<string, string | string[]> = { id: 'trip-42' };

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: mockBack,
    replace: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const trip: TripRow = {
  id: 'trip-42',
  title: 'Italy, spring 2026',
  home_currency: 'EUR',
  is_public: false,
  cover_photo_id: null,
  status: 'planning',
  created_at: '2026-04-01T10:00:00.000Z',
  updated_at: '2026-04-01T10:00:00.000Z',
  deleted_at: null,
  is_dirty: false,
  synced_at: '2026-04-01T10:00:00.000Z',
};

function stop(overrides: Partial<StopWithPlace>): StopWithPlace {
  return {
    id: 'stop-rome',
    trip_id: 'trip-42',
    city_id: 100,
    sort_order: 0,
    arrive_date: '2026-05-10',
    depart_date: '2026-05-12',
    created_at: '2026-04-01T10:00:00.000Z',
    updated_at: '2026-04-01T10:00:00.000Z',
    deleted_at: null,
    is_dirty: false,
    synced_at: '2026-04-01T10:00:00.000Z',
    city_name: 'Roma',
    country_id: 1,
    country_name: 'Italy',
    lat: 41.9,
    lng: 12.5,
    ...overrides,
  };
}

const rome = stop({});
const florence = stop({
  id: 'stop-florence',
  city_id: 101,
  sort_order: 1,
  city_name: 'Firenze',
  lat: 43.77,
  lng: 11.26,
});
const romeAgain = stop({ id: 'stop-rome-again', sort_order: 2 });
const uncached = stop({
  id: 'stop-uncached',
  city_id: 777,
  sort_order: 3,
  city_name: null,
  country_id: null,
  country_name: null,
  lat: null,
  lng: null,
});

const mockTrip = {
  data: trip as TripRow | null,
  loading: false,
  error: null as Error | null,
};
const mockStops = {
  data: [] as StopWithPlace[],
  loading: false,
  error: null as Error | null,
};

jest.mock('@/features/trips/use-trips', () => ({
  useTrip: () => mockTrip,
  useTripStops: () => mockStops,
}));

// Start-up itself is pinned in src/hooks/use-mapbox-ready.test.ts; here it is a switch.
const mockMapbox: { state: 'starting' | 'ready' | 'unavailable' } = { state: 'ready' };

jest.mock('@/hooks/use-mapbox-ready', () => ({
  useMapboxReady: () => mockMapbox.state,
}));

type MockPack = { resume: jest.Mock };
const { offlineManager } = jest.requireMock('@rnmapbox/maps') as {
  offlineManager: {
    createPack: jest.Mock;
    getPacks: jest.Mock;
    getPack: jest.Mock<Promise<MockPack | undefined>, [string]>;
    deletePack: jest.Mock;
    unsubscribe: jest.Mock;
    __emitProgress: (name: string, update: Record<string, unknown>) => void;
    __emitError: (name: string, message: string) => void;
    __reset: () => void;
  };
};

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
  jest.clearAllMocks();
}

const emitProgress = (name: string, update: Record<string, unknown>) =>
  act(async () => offlineManager.__emitProgress(name, update));

let alert: jest.SpyInstance | null = null;

/** Answers the confirmation the way the traveller does, and records it. */
function answerAlertWith(style: 'destructive' | 'cancel') {
  alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.find((button) => button.style === style)?.onPress?.();
  });
  return alert;
}

/** Rendered, with the device's packs read. */
async function renderScreen() {
  await render(<OfflineMapsScreen />);
  await waitFor(() => expect(screen.queryByLabelText('Checking saved maps')).toBeNull());
}

const status = (cityId: number) => screen.getByTestId(`offline-status-${cityId}`);

beforeEach(() => {
  offlineManager.__reset();
  mockParams = { id: 'trip-42' };
  mockTrip.data = trip;
  mockStops.data = [rome];
  mockStops.loading = false;
  mockStops.error = null;
  mockMapbox.state = 'ready';
});

afterEach(() => {
  alert?.mockRestore();
  alert = null;
});

describe('<OfflineMapsScreen> — trip/[id]/offline-maps (T105, FR-044)', () => {
  test('names the trip, says what the screen is for, and offers a way back', async () => {
    await renderScreen();

    expect(screen.getByTestId('offline-maps-title')).toHaveTextContent(
      'Offline maps · Italy, spring 2026',
    );
    expect(screen.getByText(/opens without a connection/)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalled();
  });

  test('lists each of the trip’s cities once, with its country, not saved yet', async () => {
    mockStops.data = [rome, florence, romeAgain];
    await renderScreen();

    expect(screen.getAllByTestId(/^offline-city-/)).toHaveLength(2);
    expect(screen.getByText('Roma')).toBeTruthy();
    expect(screen.getByText('Firenze')).toBeTruthy();
    expect(screen.getAllByText('Italy')).toHaveLength(2);
    expect(status(100)).toHaveTextContent('Not saved on this device');
    expect(screen.getByLabelText('Download Roma for offline use')).toBeTruthy();
    expect(screen.getByLabelText('Download Firenze for offline use')).toBeTruthy();
  });

  test('a download shows its progress as text, then ready with its size', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByLabelText('Download Roma for offline use'));
    expect(status(100)).toHaveTextContent('Downloading… 0%');
    await waitFor(() =>
      expect(offlineManager.createPack).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'city-100' }),
        expect.any(Function),
        expect.any(Function),
      ),
    );

    await emitProgress('city-100', {
      percentage: 42.4,
      completedResourceSize: 5_000_000,
    });
    expect(status(100)).toHaveTextContent('Downloading… 42%');

    await emitProgress('city-100', {
      state: 2,
      percentage: 100,
      completedResourceSize: 12_400_000,
    });
    expect(status(100)).toHaveTextContent('Ready offline · 12.4 MB');
    expect(status(100).props.accessibilityLabel).toBe('Ready offline, 12.4 megabytes');
    expect(screen.getByLabelText('Remove Roma’s offline map')).toBeTruthy();
    expect(screen.queryByLabelText('Download Roma for offline use')).toBeNull();
  });

  test('a failure is shown in words, with Try again and a way to remove what was saved', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('Download Roma for offline use'));
    await waitFor(() => expect(offlineManager.createPack).toHaveBeenCalled());
    await emitProgress('city-100', { percentage: 30 });

    await act(async () =>
      offlineManager.__emitError('city-100', 'Tile count limit exceeded'),
    );

    expect(status(100)).toHaveTextContent(OFFLINE_PACK_COPY.tooLarge);
    expect(status(100).props.accessibilityRole).toBe('alert');
    expect(screen.getByLabelText('Remove Roma’s offline map')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Try downloading Roma again'));

    const pack = await offlineManager.getPack('city-100');
    await waitFor(() => expect(pack!.resume).toHaveBeenCalledTimes(1));
    expect(status(100)).toHaveTextContent('Downloading… 30%');

    await emitProgress('city-100', { percentage: 100, completedResourceSize: 2_000_000 });
    expect(status(100)).toHaveTextContent('Ready offline · 2 MB');
  });

  test('remove asks first — the map goes for every trip that visits the city — then deletes it', async () => {
    await seedReady(100, 12_400_000);
    await renderScreen();
    expect(status(100)).toHaveTextContent('Ready offline · 12.4 MB');
    const confirm = answerAlertWith('destructive');

    await fireEvent.press(screen.getByLabelText('Remove Roma’s offline map'));

    expect(confirm).toHaveBeenCalledWith(
      'Remove Roma’s offline map?',
      expect.stringMatching(/every trip that visits Roma/),
      expect.arrayContaining([expect.objectContaining({ text: 'Remove' })]),
    );
    await waitFor(() =>
      expect(offlineManager.deletePack).toHaveBeenCalledWith('city-100'),
    );
    expect(status(100)).toHaveTextContent('Not saved on this device');
    expect(screen.getByLabelText('Download Roma for offline use')).toBeTruthy();
  });

  test('cancelling the confirmation keeps the map', async () => {
    await seedReady(100, 12_400_000);
    await renderScreen();
    answerAlertWith('cancel');

    await fireEvent.press(screen.getByLabelText('Remove Roma’s offline map'));

    expect(offlineManager.deletePack).not.toHaveBeenCalled();
    expect(status(100)).toHaveTextContent('Ready offline · 12.4 MB');
  });

  test('Stop, while downloading, asks and then stops the download', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('Download Roma for offline use'));
    await waitFor(() => expect(offlineManager.createPack).toHaveBeenCalled());
    await emitProgress('city-100', { percentage: 20 });
    expect(status(100)).toHaveTextContent('Downloading… 20%');
    const confirm = answerAlertWith('destructive');

    await fireEvent.press(screen.getByLabelText('Stop downloading Roma'));

    expect(confirm).toHaveBeenCalledWith(
      'Stop downloading Roma?',
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ text: 'Stop' })]),
    );
    await waitFor(() =>
      expect(offlineManager.deletePack).toHaveBeenCalledWith('city-100'),
    );
    expect(status(100)).toHaveTextContent('Not saved on this device');
  });

  test('a city this device cannot place is explained, with nothing to press for it', async () => {
    mockStops.data = [rome, uncached];
    await renderScreen();

    expect(screen.getByTestId('offline-unplaced')).toHaveTextContent(
      'City #777 can’t be saved yet: this device doesn’t have its location.',
    );
    expect(screen.queryByTestId('offline-city-777')).toBeNull();
    expect(screen.getAllByTestId(/^offline-city-/)).toHaveLength(1);
  });

  test('when no city can be placed, a designed empty state says why — and Mapbox is not asked', async () => {
    mockStops.data = [uncached, stop({ ...uncached, id: 'stop-other', city_id: 778 })];
    await render(<OfflineMapsScreen />);

    expect(screen.getByText('No city can be saved yet')).toBeTruthy();
    expect(
      screen.getByText(
        'City #777, City #778 can’t be saved yet: this device doesn’t have their location.',
      ),
    ).toBeTruthy();
    expect(offlineManager.getPacks).not.toHaveBeenCalled();
  });

  test('a trip with no stops shows the designed empty state', async () => {
    mockStops.data = [];
    await render(<OfflineMapsScreen />);
    expect(screen.getByText('No cities yet')).toBeTruthy();
  });

  test('a designed loading state while the stops are read, and an error state if they fail', async () => {
    mockStops.loading = true;
    await render(<OfflineMapsScreen />);
    expect(screen.getByLabelText('Loading the trip’s cities')).toBeTruthy();

    mockStops.loading = false;
    mockStops.error = new Error('locked');
    await screen.rerender(<OfflineMapsScreen />);
    expect(screen.getByText('Couldn’t read the trip’s cities')).toBeTruthy();
  });

  test('without a usable Mapbox token, a designed error — and nothing asked of Mapbox', async () => {
    mockMapbox.state = 'unavailable';
    await render(<OfflineMapsScreen />);

    expect(screen.getByText('Offline maps aren’t available in this build')).toBeTruthy();
    expect(offlineManager.getPacks).not.toHaveBeenCalled();
  });

  test('waits, with a designed loading state, while Mapbox starts', async () => {
    mockMapbox.state = 'starting';
    await render(<OfflineMapsScreen />);

    expect(screen.getByLabelText('Getting maps ready')).toBeTruthy();
    expect(offlineManager.getPacks).not.toHaveBeenCalled();
  });

  test('when the saved maps cannot be read, says so, and Try again reads them again', async () => {
    offlineManager.getPacks.mockRejectedValueOnce(new Error('TileStoreError'));
    await render(<OfflineMapsScreen />);

    expect(await screen.findByText('Couldn’t check the saved maps')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Try again'));

    expect(await screen.findByTestId('offline-city-100')).toBeTruthy();
    expect(status(100)).toHaveTextContent('Not saved on this device');
  });

  test('handles an array param without crashing — expo-router can hand back one', async () => {
    mockParams = { id: ['trip-42', 'other'] };
    await renderScreen();
    expect(screen.getByTestId('offline-maps-title')).toHaveTextContent(
      /Italy, spring 2026/,
    );
  });

  test('before the trip is read, the title still says where the traveller is', async () => {
    mockTrip.data = null;
    await renderScreen();
    expect(screen.getByTestId('offline-maps-title')).toHaveTextContent('Offline maps');
  });
});
