/**
 * `trip/[id]/offline-maps` — tasks.md T105 (FR-044; User Story 4, Acceptance
 * Scenario 3), on Atlas by T444 (004 FR-005, FR-007, FR-015, FR-021, FR-025, FR-029,
 * FR-030, FR-035, FR-037; contract C4-10, C4-11). The trip's live stops are mocked, as in
 * the other trip screens' suites; the offline packs run for real through
 * `useOfflinePacks` against jest.setup.ts's in-memory `offlineManager`.
 *
 * Pinned here: each of the trip's cities once, in a card, with its state as a chip (words
 * and an icon, never colour alone) and a city this device cannot place explained in
 * words; progress as text and the finished size; a storage caption; removal confirmed
 * first; failures in words with a way forward; every state designed with skeletons while
 * loading (feature 002 FR-027, 004 FR-021); nothing asked of Mapbox before it is
 * configured; and none of the pre-004 ids, names or actions lost.
 *
 * The title and Back are the navigator's now (`trip/[id]/_layout.tsx`, asserted in
 * trip-layout.test.tsx and offline-maps-header.test.tsx): this screen draws neither.
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import * as ExpoHaptics from 'expo-haptics';
import { readFileSync } from 'node:fs';
import { Alert, StyleSheet } from 'react-native';

import OfflineMapsScreen from '@/app/trip/[id]/offline-maps';
import type { StopWithPlace } from '@/db/repositories/stops';
import type { TripRow } from '@/db/schema';
import { OFFLINE_PACK_COPY } from '@/features/trips/offline-packs';
import { anyGlyph } from '../helpers/icons';

let mockParams: Record<string, string | string[]> = { id: 'trip-42' };

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => mockParams,
}));

const mockFree: { bytes: number | null } = { bytes: 1_700_000_000 };

jest.mock('@/lib/disk-space', () => ({
  freeDiskBytes: () => mockFree.bytes,
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
const { mockToast } = jest.requireMock('heroui-native') as {
  mockToast: { show: jest.Mock; hide: jest.Mock };
};
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

const hidden = { includeHiddenElements: true };

/** Rendered, with the device's packs read. */
async function renderScreen() {
  await render(<OfflineMapsScreen />);
  await waitFor(() => expect(screen.queryByLabelText('Checking saved maps')).toBeNull());
}

const status = (cityId: number) => screen.getByTestId(`offline-status-${cityId}`);
const classesOf = (node: { props: { className?: unknown } }) =>
  String(node.props.className ?? '')
    .split(/\s+/)
    .filter(Boolean);
/** The glyph a state draws: its id (registry glyph and weight). */
const glyphOf = (cityId: number) =>
  within(screen.getByTestId(`offline-status-${cityId}-icon`, hidden)).getByTestId(
    anyGlyph,
    hidden,
  ).props.testID as string;
/** The kit variant of every button on the screen, by test id. */
const variants = () =>
  Object.fromEntries(
    screen
      .getAllByRole('button')
      .filter((button) => button.props.variant !== undefined)
      .map((button) => [button.props.testID as string, button.props.variant as string]),
  );
const FAB = { 'coming-soon-offline-new-area': 'primary' };

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

describe('<OfflineMapsScreen> — the pictured header (F11; UI-SPEC 9.2)', () => {
  test('draws the shared area header: Back, the title and the subtitle of the picture', async () => {
    await renderScreen();

    expect(screen.getByTestId('offline-maps-title')).toHaveTextContent('Offline maps');
    expect(screen.getByTestId('offline-maps-subtitle')).toHaveTextContent(
      'Maps keep working with no signal.',
    );
    expect(screen.getAllByLabelText('Back')).toHaveLength(1);
    expect(screen.getByTestId('offline-maps-screen')).toBeTruthy();
  });

  test('names the trip in its section and says what the screen is for in a quiet note', async () => {
    await renderScreen();

    expect(screen.getByTestId('offline-maps-trip')).toHaveTextContent(
      'For Italy, spring 2026',
    );
    const note = screen.getByTestId('offline-maps-note');
    expect(note).toHaveTextContent(/opens without a connection/);
    expect(note).toHaveTextContent(/shared by every trip that visits the city/);
    expect(classesOf(note)).toEqual(expect.arrayContaining(['text-muted']));
  });

  test('before the trip is read, the page invents no name for it', async () => {
    mockTrip.data = null;
    await renderScreen();

    expect(screen.getByTestId('offline-maps-trip')).toHaveTextContent('For this trip');
    expect(screen.getByText(/opens without a connection/)).toBeTruthy();
    expect(screen.getByTestId('offline-city-100')).toBeTruthy();
  });

  test('handles an array param without crashing — expo-router can hand back one', async () => {
    mockParams = { id: ['trip-42', 'other'] };
    await renderScreen();
    expect(screen.getByTestId('offline-maps-trip')).toHaveTextContent(
      /Italy, spring 2026/,
    );
  });

  test('without an id in the route it still draws the page', async () => {
    mockParams = {};
    mockStops.data = [];
    await render(<OfflineMapsScreen />);

    expect(screen.getByTestId('offline-maps-screen')).toBeTruthy();
    expect(screen.getByText('No cities yet')).toBeTruthy();
  });

  test('the header is fixed and the body scrolls, leaving room under its last row for the floating button', async () => {
    await renderScreen();

    const scroll = screen.getByTestId('offline-maps-scroll');
    expect(scroll.props.contentContainerStyle.paddingBottom).toBeGreaterThanOrEqual(
      52 + 16 + 16,
    );
    expect(within(scroll).queryByTestId('offline-maps-title')).toBeNull();
  });
});

describe('<OfflineMapsScreen> — a card per city (FR-015, FR-044)', () => {
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

  test('a city with no country on record shows its name alone', async () => {
    mockStops.data = [stop({ country_id: null, country_name: null })];
    await renderScreen();

    expect(screen.getByText('Roma')).toBeTruthy();
    expect(screen.queryByText('Italy')).toBeNull();
    expect(status(100)).toHaveTextContent('Not saved on this device');
  });

  test('each city is a row with its map tile, a hairline between rows, and no card', async () => {
    mockStops.data = [rome, florence];
    await renderScreen();

    for (const id of [100, 101]) {
      expect(classesOf(screen.getByTestId(`offline-city-${id}`))).not.toContain(
        'bg-surface',
      );
      expect(screen.getByTestId(`offline-tile-${id}`, hidden)).toBeTruthy();
    }
    expect(screen.queryByTestId('offline-city-100-divider', hidden)).toBeNull();
    expect(screen.getByTestId('offline-city-101-divider', hidden)).toBeTruthy();
  });

  test('a map not saved draws its area dashed on the tile; a saved one draws it solid and filled', async () => {
    mockStops.data = [rome, florence];
    await seedReady(101, 8_100_000);
    await renderScreen();

    const area = (id: number) =>
      StyleSheet.flatten(
        screen.getByTestId(`offline-tile-${id}-area`, hidden).props.style,
      );
    expect(area(100).borderStyle).toBe('dashed');
    expect(screen.queryByTestId('offline-tile-100-fill', hidden)).toBeNull();
    expect(area(101).borderStyle).toBe('solid');
    expect(screen.getByTestId('offline-tile-101-fill', hidden)).toBeTruthy();
  });

  test('the tile is decoration: hidden from assistive technology, no geography, no label', async () => {
    await renderScreen();
    const tile = screen.getByTestId('offline-tile-100', hidden);
    expect(tile.props.accessibilityElementsHidden).toBe(true);
    expect(tile.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  test('keeps the reading order: the name, the country, the state, then the actions', async () => {
    await renderScreen();

    const wanted = ['Roma', 'Italy', 'offline-status-100', 'offline-download-100'];
    const reads = screen.container
      .queryAll(
        (node) =>
          wanted.includes(node.props.children as string) ||
          wanted.includes(node.props.testID as string),
      )
      .map((node) => (node.props.testID as string) ?? (node.props.children as string));
    expect(reads).toEqual(wanted);
  });
});

describe('<OfflineMapsScreen> — each state is a chip: words and an icon (FR-025)', () => {
  test('not saved, downloading and ready differ by words, by glyph and by ink — not by colour alone', async () => {
    mockStops.data = [
      rome,
      florence,
      stop({ id: 's3', city_id: 102, city_name: 'Pisa' }),
    ];
    await seedReady(101, 8_100_000);
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('Download Pisa for offline use'));

    expect(status(100)).toHaveTextContent('Not saved on this device');
    expect(status(101)).toHaveTextContent('Ready offline · 8.1 MB');
    expect(status(102)).toHaveTextContent('Downloading… 0%');
    expect(new Set([100, 101, 102].map(glyphOf)).size).toBe(3);

    expect(classesOf(status(100))).toContain('border-border');
    expect(classesOf(screen.getByText('Not saved on this device'))).toContain(
      'text-muted',
    );
    expect(classesOf(screen.getByText('Downloading… 0%'))).toContain('text-foreground');
    expect(classesOf(screen.getByText('Ready offline · 8.1 MB'))).toContain(
      'text-success',
    );
    expect(classesOf(status(101))).toContain('bg-success/15');
  });

  test('a download shows its progress as text, then ready with its size, announced as words', async () => {
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
    expect(status(100).props.accessibilityLabel).toBe('Downloading, 42%');

    await emitProgress('city-100', {
      state: 2,
      percentage: 100,
      completedResourceSize: 12_400_000,
    });
    expect(status(100)).toHaveTextContent('Ready offline · 12.4 MB');
    expect(status(100).props.accessibilityLabel).toBe('Ready offline, 12.4 megabytes');
    expect(status(100).props.accessibilityRole).toBe('text');
    expect(screen.getByLabelText('Remove Roma’s offline map')).toBeTruthy();
    expect(screen.queryByLabelText('Download Roma for offline use')).toBeNull();
  });

  test('a failure is shown in words, as an alert with its icon, with Try again and a way to remove what was saved', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('Download Roma for offline use'));
    await waitFor(() => expect(offlineManager.createPack).toHaveBeenCalled());
    await emitProgress('city-100', { percentage: 30 });

    await act(async () =>
      offlineManager.__emitError('city-100', 'Tile count limit exceeded'),
    );

    expect(status(100)).toHaveTextContent(OFFLINE_PACK_COPY.tooLarge);
    expect(status(100).props.accessibilityRole).toBe('alert');
    expect(screen.queryByTestId('offline-status-100-icon', hidden)).toBeNull();
    expect(screen.getByLabelText('Remove Roma’s offline map')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Try downloading Roma again'));

    const pack = await offlineManager.getPack('city-100');
    await waitFor(() => expect(pack!.resume).toHaveBeenCalledTimes(1));
    expect(status(100)).toHaveTextContent('Downloading… 30%');

    await emitProgress('city-100', { percentage: 100, completedResourceSize: 2_000_000 });
    expect(status(100)).toHaveTextContent('Ready offline · 2 MB');
  });
});

describe('<OfflineMapsScreen> — the actions (FR-005, FR-037)', () => {
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

  // T460 - FR-020: the destructive Button plays the warning as it is pressed; giving the
  // answer in the native question is a second, separate moment and plays it too.
  test.each([
    ['Remove Roma’s offline map', 'ready'],
    ['Stop downloading Roma', 'downloading'],
  ] as const)(
    'confirming "%s" plays the warning haptic, and the question alone does not',
    async (label, state) => {
      if (state === 'ready') {
        await seedReady(100, 12_400_000);
        await renderScreen();
      } else {
        await renderScreen();
        await fireEvent.press(screen.getByLabelText('Download Roma for offline use'));
        await waitFor(() => expect(offlineManager.createPack).toHaveBeenCalled());
        await emitProgress('city-100', { percentage: 20 });
      }
      let destructive: (() => void) | undefined;
      jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
        destructive = buttons?.find((button) => button.style === 'destructive')?.onPress;
      });
      await fireEvent.press(screen.getByLabelText(label));
      jest.mocked(ExpoHaptics).notificationAsync.mockClear();
      expect(offlineManager.deletePack).not.toHaveBeenCalled();

      await act(async () => destructive?.());

      expect(offlineManager.deletePack).toHaveBeenCalledWith('city-100');
      expect(jest.mocked(ExpoHaptics).notificationAsync.mock.calls).toEqual([
        ['warning'],
      ]);
    },
  );

  test('cancelling the confirmation plays no further haptic', async () => {
    await seedReady(100, 12_400_000);
    await renderScreen();
    answerAlertWith('cancel');

    await fireEvent.press(screen.getByLabelText('Remove Roma’s offline map'));
    jest.mocked(ExpoHaptics).notificationAsync.mockClear();

    expect(offlineManager.deletePack).not.toHaveBeenCalled();
    expect(jest.mocked(ExpoHaptics).notificationAsync).not.toHaveBeenCalled();
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

  test('keeps each control’s id, name and words', async () => {
    await seedReady(101, 8_100_000);
    mockStops.data = [rome, florence];
    await renderScreen();

    const download = screen.getByTestId('offline-download-100');
    expect(download.props.accessibilityLabel).toBe('Download Roma for offline use');
    expect(download.props.accessibilityRole).toBe('button');
    expect(screen.getByText('Download')).toBeTruthy();
    const remove = screen.getByTestId('offline-remove-101');
    expect(remove.props.accessibilityLabel).toBe('Remove Firenze’s offline map');
    expect(remove.props.accessibilityRole).toBe('button');

    await fireEvent.press(download);
    const stop = screen.getByTestId('offline-stop-100');
    expect(stop.props.accessibilityLabel).toBe('Stop downloading Roma');
    expect(screen.getByText('Stop')).toBeTruthy();
  });

  test('Try again keeps its id, name and words', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByLabelText('Download Roma for offline use'));
    await waitFor(() => expect(offlineManager.createPack).toHaveBeenCalled());
    await act(async () => offlineManager.__emitError('city-100', 'timed out'));

    const retry = screen.getByTestId('offline-download-100');
    expect(retry.props.accessibilityLabel).toBe('Try downloading Roma again');
    expect(screen.getByText('Try again')).toBeTruthy();
    expect(screen.getByTestId('offline-remove-100')).toBeTruthy();
  });

  test('the only primary is the floating "New area": Download and Try again are secondary, Stop and Remove destructive', async () => {
    mockStops.data = [rome, florence];
    await seedReady(101, 8_100_000);
    await renderScreen();
    expect(variants()).toMatchObject({ ...FAB, 'offline-download-100': 'secondary' });

    await fireEvent.press(screen.getByTestId('offline-download-100'));
    await waitFor(() => expect(offlineManager.createPack).toHaveBeenCalled());
    expect(variants()).toMatchObject({ ...FAB, 'offline-stop-100': 'danger-soft' });

    await act(async () => offlineManager.__emitError('city-100', 'timed out'));
    expect(variants()).toMatchObject({
      ...FAB,
      'offline-download-100': 'secondary',
      'offline-remove-100': 'danger-soft',
    });
    expect(Object.values(variants()).filter((v) => v === 'primary')).toHaveLength(1);
  });

  test('a download that never started offers Try again alone: nothing was saved, so nothing to remove', async () => {
    offlineManager.createPack.mockRejectedValueOnce(
      new Error('Tile count limit exceeded'),
    );
    await renderScreen();

    await fireEvent.press(screen.getByLabelText('Download Roma for offline use'));

    await waitFor(() =>
      expect(status(100)).toHaveTextContent(OFFLINE_PACK_COPY.tooLarge),
    );
    expect(screen.getByLabelText('Try downloading Roma again')).toBeTruthy();
    expect(screen.queryByLabelText('Remove Roma’s offline map')).toBeNull();
  });

  test('each action row wraps instead of clipping at the largest text size (FR-029)', async () => {
    await renderScreen();
    expect(classesOf(screen.getByTestId('offline-actions-100'))).toEqual(
      expect.arrayContaining(['flex-row', 'flex-wrap']),
    );
  });
});

describe('<OfflineMapsScreen> — the storage card (FR-015; F11, UI-SPEC 9.2)', () => {
  const card = () => screen.getByTestId('offline-storage');
  const used = () => screen.getByTestId('offline-storage-used');
  const NONE_SAVED = 'None of this trip’s cities are saved on this device yet.';

  beforeEach(() => {
    mockFree.bytes = 1_700_000_000;
  });

  test('says what the trip’s finished maps take, as the picture does, and reads as one element', async () => {
    mockStops.data = [rome, florence];
    await seedReady(100, 12_400_000);
    await seedReady(101, 8_100_000);
    await renderScreen();

    expect(used()).toHaveTextContent('20.5 MB');
    expect(within(card()).getByText('used by this trip’s maps')).toBeTruthy();
    expect(card().props.accessibilityLabel).toBe(
      'Maps for this trip’s cities use 20.5 megabytes on this device. 1.7 gigabytes free.',
    );
  });

  test('shows the room the device reports at the end of the head, and the bar and its legend', async () => {
    mockStops.data = [rome];
    await seedReady(100, 100_000_000);
    mockFree.bytes = 300_000_000;
    await renderScreen();

    expect(screen.getByTestId('offline-storage-free')).toHaveTextContent('300 MB free');
    const bar = screen.getByTestId('offline-storage-bar', hidden);
    expect(StyleSheet.flatten(bar.props.style).height).toBe(12);
    expect(
      StyleSheet.flatten(screen.getByTestId('offline-storage-maps', hidden).props.style)
        .width,
    ).toBe('25%');
    const legend = within(screen.getByTestId('offline-storage-legend', hidden));
    expect(legend.getByText('Maps', hidden)).toBeTruthy();
    expect(legend.getByText('Free', hidden)).toBeTruthy();
    expect(legend.queryByText('Photos waiting', hidden)).toBeNull();
  });

  test('when the device cannot say how much is free, nothing is made up: no figure, no bar, no legend', async () => {
    mockFree.bytes = null;
    mockStops.data = [rome];
    await seedReady(100, 12_400_000);
    await renderScreen();

    expect(screen.queryByTestId('offline-storage-free')).toBeNull();
    expect(screen.queryByTestId('offline-storage-bar', hidden)).toBeNull();
    expect(screen.queryByTestId('offline-storage-legend', hidden)).toBeNull();
    expect(used()).toHaveTextContent('12.4 MB');
    expect(card().props.accessibilityLabel).toBe(
      'Maps for this trip’s cities use 12.4 megabytes on this device.',
    );
  });

  test('says when none is saved, and follows a download as it finishes and a removal as it happens', async () => {
    await renderScreen();
    expect(used()).toHaveTextContent(NONE_SAVED);
    expect(screen.getByTestId('offline-storage-free')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Download Roma for offline use'));
    await waitFor(() => expect(offlineManager.createPack).toHaveBeenCalled());
    await emitProgress('city-100', { percentage: 40, completedResourceSize: 5_000_000 });
    expect(used()).toHaveTextContent(NONE_SAVED);

    await emitProgress('city-100', {
      state: 2,
      percentage: 100,
      completedResourceSize: 12_400_000,
    });
    expect(used()).toHaveTextContent('12.4 MB');

    answerAlertWith('destructive');
    await fireEvent.press(screen.getByLabelText('Remove Roma’s offline map'));
    await waitFor(() => expect(used()).toHaveTextContent(NONE_SAVED));
  });

  test('reads the free space again when a download finishes', async () => {
    await renderScreen();
    mockFree.bytes = 900_000_000;
    await fireEvent.press(screen.getByLabelText('Download Roma for offline use'));
    await waitFor(() => expect(offlineManager.createPack).toHaveBeenCalled());
    await emitProgress('city-100', {
      state: 2,
      percentage: 100,
      completedResourceSize: 12_400_000,
    });
    expect(screen.getByTestId('offline-storage-free')).toHaveTextContent('900 MB free');
  });

  test('is a cream tile, not a control, and draws no "Photos waiting" segment (the store has no sizes)', async () => {
    await renderScreen();
    expect(card().props.onPress).toBeUndefined();
    expect(screen.queryByText('Photos waiting', hidden)).toBeNull();
  });

  test('is shown only with the list: not while loading, not for an unreadable store, not in an empty state', async () => {
    offlineManager.getPacks.mockRejectedValueOnce(new Error('TileStoreError'));
    await render(<OfflineMapsScreen />);
    expect(await screen.findByText('Couldn’t check the saved maps')).toBeTruthy();
    expect(screen.queryByTestId('offline-storage')).toBeNull();

    mockStops.data = [uncached];
    await screen.rerender(<OfflineMapsScreen />);
    expect(screen.getByText('No city can be saved yet')).toBeTruthy();
    expect(screen.queryByTestId('offline-storage')).toBeNull();
  });
});

describe('<OfflineMapsScreen> — "For this trip" and "Downloaded" (F11)', () => {
  test('a finished map moves to "Downloaded" with the trash icon; the others stay under the trip’s name', async () => {
    mockStops.data = [rome, florence];
    await seedReady(101, 8_100_000);
    await renderScreen();

    const headings = screen
      .getAllByRole('header')
      .map((node) => node.props.children as string);
    expect(headings).toEqual(
      expect.arrayContaining(['For Italy, spring 2026', 'Downloaded']),
    );
    expect(status(101)).toHaveTextContent('Ready offline · 8.1 MB');
    const trash = screen.getByTestId('offline-remove-101');
    expect(trash.props.accessibilityLabel).toBe('Remove Firenze’s offline map');
    expect(within(trash).queryByText('Remove')).toBeNull();
    expect(screen.queryByTestId('coming-soon-offline-map-101')).toBeNull();
    expect(screen.getByTestId('coming-soon-offline-map-100')).toBeTruthy();
  });

  test('with every city saved the trip section says so, and nothing is left to download', async () => {
    await seedReady(100, 12_400_000);
    await renderScreen();

    expect(screen.getByTestId('offline-all-saved')).toHaveTextContent(
      'Every city of this trip is saved on this device.',
    );
    expect(screen.queryByLabelText('Download Roma for offline use')).toBeNull();
  });

  test('with nothing saved there is no "Downloaded" section', async () => {
    await renderScreen();
    expect(screen.queryByText('Downloaded')).toBeNull();
  });

  test('the trash icon asks first, then really removes the map', async () => {
    await seedReady(100, 12_400_000);
    await renderScreen();
    const confirm = answerAlertWith('cancel');

    await fireEvent.press(screen.getByTestId('offline-remove-100'));
    expect(confirm).toHaveBeenCalledWith(
      'Remove Roma’s offline map?',
      expect.stringContaining('every trip that visits Roma'),
      expect.any(Array),
    );
    expect(offlineManager.deletePack).not.toHaveBeenCalled();

    alert?.mockRestore();
    answerAlertWith('destructive');
    await fireEvent.press(screen.getByTestId('offline-remove-100'));
    await waitFor(() =>
      expect(offlineManager.deletePack).toHaveBeenCalledWith('city-100'),
    );
  });

  test('a map not saved shows no size: the app cannot know it', async () => {
    await renderScreen();
    const row = within(screen.getByTestId('offline-city-100'));
    expect(row.queryByText(/\d\s?(MB|GB|KB)/)).toBeNull();
  });
});

describe('<OfflineMapsScreen> — the pictured controls without a capability (Q-11)', () => {
  beforeEach(() => mockToast.show.mockClear());

  test('"Map >" is drawn on each map still to do, named from its city, and its only effect is one toast', async () => {
    mockStops.data = [rome, florence];
    await renderScreen();

    for (const [id, name] of [
      [100, 'Roma on the map'],
      [101, 'Firenze on the map'],
    ] as const) {
      const link = screen.getByTestId(`coming-soon-offline-map-${id}`);
      expect(link.props.accessibilityLabel).toBe(name);
      expect(link.props.accessibilityHint).toBe('Not available yet');
      expect(link.props.accessibilityRole).toBe('button');
    }
    await fireEvent.press(screen.getByTestId('coming-soon-offline-map-100'));
    expect(mockToast.show).toHaveBeenCalledTimes(1);
    expect(mockToast.show.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ id: 'coming-soon' }),
    );
    expect(offlineManager.createPack).not.toHaveBeenCalled();
    expect(offlineManager.deletePack).not.toHaveBeenCalled();
  });

  test('"New area" is the one primary: a floating button named "Download a new area", one toast, nothing else', async () => {
    await renderScreen();

    const fab = screen.getByTestId('coming-soon-offline-new-area');
    expect(fab.props.accessibilityLabel).toBe('Download a new area');
    expect(fab.props.variant).toBe('primary');
    expect(within(fab).getByText('New area')).toBeTruthy();
    await fireEvent.press(fab);
    expect(mockToast.show).toHaveBeenCalledTimes(1);
    expect(offlineManager.createPack).not.toHaveBeenCalled();
  });
});

describe('<OfflineMapsScreen> — a city this device cannot place', () => {
  test('is explained, with nothing to press for it', async () => {
    mockStops.data = [rome, uncached];
    await renderScreen();

    expect(screen.getByTestId('offline-unplaced')).toHaveTextContent(
      'City #777 can’t be saved yet: this device doesn’t have its location.',
    );
    expect(screen.queryByTestId('offline-city-777')).toBeNull();
    expect(screen.getAllByTestId(/^offline-city-/)).toHaveLength(1);
  });

  test('says "their" for more than one', async () => {
    mockStops.data = [
      rome,
      uncached,
      stop({ ...uncached, id: 'stop-other', city_id: 778 }),
    ];
    await renderScreen();

    expect(screen.getByTestId('offline-unplaced')).toHaveTextContent(
      'City #777, City #778 can’t be saved yet: this device doesn’t have their location.',
    );
  });
});

describe('<OfflineMapsScreen> — every state is designed (FR-021, FR-035; C4-10 rule 2)', () => {
  test('while the stops are read: placeholder cards in ONE busy region, never the empty state', async () => {
    mockStops.loading = true;
    await render(<OfflineMapsScreen />);

    const region = screen.getByLabelText('Loading the trip’s cities');
    expect(region.props.accessibilityRole).toBe('progressbar');
    expect(screen.getAllByLabelText('Loading the trip’s cities')).toHaveLength(1);
    expect(screen.queryByText('No cities yet')).toBeNull();
    expect(screen.getByTestId('offline-maps-screen')).toBeTruthy();
  });

  test('if the stops cannot be read, says so in words with an icon — the live read has nothing to re-run', async () => {
    mockStops.error = new Error('locked');
    await render(<OfflineMapsScreen />);

    expect(screen.getByText('Couldn’t read the trip’s cities')).toBeTruthy();
    expect(screen.getByText('The local store did not answer.')).toBeTruthy();
    expect(screen.queryByLabelText('Try again')).toBeNull();
  });

  test('the words win over the spinner when a failed read also reports loading', async () => {
    mockStops.error = new Error('locked');
    mockStops.loading = true;
    await render(<OfflineMapsScreen />);

    expect(screen.getByText('Couldn’t read the trip’s cities')).toBeTruthy();
    expect(screen.queryByLabelText('Loading the trip’s cities')).toBeNull();
  });

  test('a trip with no stops names the next step', async () => {
    mockStops.data = [];
    await render(<OfflineMapsScreen />);

    expect(screen.getByText('No cities yet')).toBeTruthy();
    expect(
      screen.getByText('Add a stop to this trip, then save its city’s map here.'),
    ).toBeTruthy();
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

  test('without a usable Mapbox token, a designed error — and nothing asked of Mapbox', async () => {
    mockMapbox.state = 'unavailable';
    await render(<OfflineMapsScreen />);

    expect(screen.getByText('Offline maps aren’t available in this build')).toBeTruthy();
    expect(
      screen.getByText('Map access isn’t set up in this version of the app.'),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Try again')).toBeNull();
    expect(offlineManager.getPacks).not.toHaveBeenCalled();
  });

  test('waits, with placeholders, while Mapbox starts', async () => {
    mockMapbox.state = 'starting';
    await render(<OfflineMapsScreen />);

    const region = screen.getByLabelText('Getting maps ready');
    expect(region.props.accessibilityRole).toBe('progressbar');
    expect(offlineManager.getPacks).not.toHaveBeenCalled();
  });

  test('while the device’s saved maps are read, placeholders — then the cities', async () => {
    let finish: (packs: unknown[]) => void = () => undefined;
    offlineManager.getPacks.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await render(<OfflineMapsScreen />);

    expect(screen.getByLabelText('Checking saved maps').props.accessibilityRole).toBe(
      'progressbar',
    );
    expect(screen.queryByTestId('offline-city-100')).toBeNull();
    expect(screen.queryByTestId('offline-storage')).toBeNull();

    await act(async () => finish([]));
    expect(await screen.findByTestId('offline-city-100')).toBeTruthy();
    expect(screen.queryByLabelText('Checking saved maps')).toBeNull();
  });

  test('when the saved maps cannot be read, says so, and Try again reads them again', async () => {
    offlineManager.getPacks.mockRejectedValueOnce(new Error('TileStoreError'));
    await render(<OfflineMapsScreen />);

    expect(await screen.findByText('Couldn’t check the saved maps')).toBeTruthy();
    expect(screen.getByText('The map store on this device did not answer.')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Try again'));

    expect(await screen.findByTestId('offline-city-100')).toBeTruthy();
    expect(status(100)).toHaveTextContent('Not saved on this device');
  });
});

describe('<OfflineMapsScreen> — built on the adapter layer (C4-6, C4-10 rule 1)', () => {
  test.each([
    '@/app/trip/[id]/offline-maps',
    '@/components/trip/offline-city-card',
    '@/components/trip/storage-bar',
    '@/components/trip/offline-map-tile',
    '@/components/trip/offline-maps-skeleton',
  ])(
    '%s uses no retired primitive, no kit, no appearance hook and no colour',
    (module) => {
      const source = readFileSync(require.resolve(module), 'utf8');

      expect(source).not.toMatch(
        /\bSurface\b|PressableSurface|ThemedText|ThemedView|TextField|PillGroup/,
      );
      expect(source).not.toMatch(/from 'heroui-native'|from 'uniwind'/);
      // A hex colour is a quoted literal; "City #777" in a comment is not one.
      // The screen paints its own canvas behind the fixed header, as Photos does; nothing else may.
      if (!module.endsWith('offline-maps')) expect(source).not.toMatch(/use-appearance/);
      expect(source).not.toMatch(/Colors[|['"`]#[0-9a-fA-F]{3,8}['"`]/);
      expect(source).not.toMatch(/rgba?\(/);
    },
  );

  test('performs no network call: the screen is device-only', () => {
    const source = readFileSync(require.resolve('@/app/trip/[id]/offline-maps'), 'utf8');
    expect(source).not.toMatch(/apiFetch|fetch\(|api-client/);
  });
});
