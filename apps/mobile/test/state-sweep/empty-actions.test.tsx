/**
 * T559 - an empty state names one action (FR-064): the three screens whose "not here" state
 * said so in words and left the way out to the header now also name it as a button. A trip that
 * is not on this device ("Back to your trips"), a document that is not ("Back to documents") and
 * a trip with no city to save a map for ("Back to the trip"). Each is a secondary (the state
 * has no primary of its own to add; Offline maps keeps its pictured coming-soon New area), has
 * an id of its own, keeps the header's "Back" where it was, and leaves no control that does
 * nothing.
 *
 * The document viewer's wait is a skeleton shaped like the screen (FR-064), not a spinner.
 *
 * The live queries are replaced by plain objects, as in the screens' own suites.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import DocumentViewScreen from '@/app/trip/[id]/document-view';
import OfflineMapsScreen from '@/app/trip/[id]/offline-maps';
import { TripPlaceholder } from '@/components/trip/trip-states';
import type { StopWithPlace } from '@/db/repositories/stops';
import type { DocumentRow, TripRow } from '@/db/schema';
import { useAppearance } from '@/hooks/use-appearance';

import { appearance } from '../helpers/appearance';
import { deadControls, misroutedComingSoon } from '../helpers/dead-controls';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockRouter = { canGoBack: true };

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => mockRouter.canGoBack,
  }),
  useLocalSearchParams: () => ({ id: 'trip-42', documentId: 'doc-1' }),
}));
jest.mock('@/hooks/use-appearance');
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));
jest.mock('@/lib/disk-space', () => ({ freeDiskBytes: () => 1_700_000_000 }));
const mockMapbox: { state: 'starting' | 'ready' | 'unavailable' } = { state: 'ready' };
jest.mock('@/hooks/use-mapbox-ready', () => ({ useMapboxReady: () => mockMapbox.state }));

const mockTrip = {
  data: null as TripRow | null,
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

const mockDocument = {
  data: null as DocumentRow | null,
  loading: false,
  error: null as Error | null,
};
jest.mock('@/features/documents/use-documents', () => ({
  useDocument: () => mockDocument,
  useDocumentImage: () => ({ status: 'opening' }),
  useDocumentActions: () => ({
    confirmFields: jest.fn(),
    remove: jest.fn(),
    store: jest.fn(),
    syncTrip: jest.fn(),
  }),
}));

beforeEach(() => {
  (useAppearance as jest.Mock).mockReturnValue(appearance());
  mockBack.mockReset();
  mockReplace.mockReset();
  mockRouter.canGoBack = true;
  mockMapbox.state = 'ready';
  mockTrip.data = null;
  mockStops.data = [];
  mockStops.loading = false;
  mockStops.error = null;
  mockDocument.data = null;
  mockDocument.loading = false;
  mockDocument.error = null;
});

/** The buttons on screen drawn as the primary: FR-005 allows one per screen state. */
const primaries = () =>
  screen
    .queryAllByRole('button')
    .filter((button) => button.props.variant === 'primary')
    .map((button) => String(button.props.accessibilityLabel));

describe('a trip that is not on this device', () => {
  it('names the way back, and goes back when there is somewhere to go', async () => {
    await render(<TripPlaceholder loading={false} failed={false} />);

    expect(screen.getByText('This trip isn’t on this device')).toBeTruthy();
    const back = screen.getByTestId('trip-missing-back');
    expect(back).toBe(screen.getByLabelText('Back to your trips'));
    expect(back.props.variant).toBe('secondary');
    expect(primaries()).toEqual([]);

    await fireEvent.press(back);
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('opens the trips tab when it was reached from a link and there is nothing to go back to', async () => {
    mockRouter.canGoBack = false;
    await render(<TripPlaceholder loading={false} failed={false} />);

    await fireEvent.press(screen.getByTestId('trip-missing-back'));

    expect(mockReplace).toHaveBeenCalledWith('/trips');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('has no control that does nothing, and the failed and loading states are unchanged', async () => {
    await render(<TripPlaceholder loading={false} failed={false} />);
    expect(deadControls()).toEqual([]);

    await screen.rerender(<TripPlaceholder loading={false} failed />);
    expect(screen.getByText('Couldn’t read this trip')).toBeTruthy();
    expect(screen.queryByTestId('trip-missing-back')).toBeNull();

    await screen.rerender(<TripPlaceholder loading failed={false} />);
    expect(screen.getByTestId('trip-skeleton')).toBeTruthy();
    expect(screen.queryByTestId('trip-missing-back')).toBeNull();
  });
});

describe('a document that is not on this device', () => {
  it('names the way back beside the bar’s Back, and does what the bar does', async () => {
    await render(<DocumentViewScreen />);

    expect(screen.getByText('This document isn’t on this device')).toBeTruthy();
    expect(screen.getByLabelText('Back')).toBe(screen.getByTestId('document-view-close'));
    const back = screen.getByTestId('document-missing-back');
    expect(back).toBe(screen.getByLabelText('Back to documents'));
    expect(back.props.variant).toBe('secondary');

    await fireEvent.press(back);
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(deadControls()).toEqual([]);
  });

  it('leaves the other states as they were', async () => {
    mockDocument.loading = true;
    await render(<DocumentViewScreen />);
    expect(screen.queryByTestId('document-missing-back')).toBeNull();

    mockDocument.loading = false;
    mockDocument.error = new Error('store closed');
    await screen.rerender(<DocumentViewScreen />);
    expect(screen.queryByTestId('document-missing-back')).toBeNull();
    expect(screen.getByLabelText('Try again')).toBeTruthy();
  });
});

describe('offline maps for a trip with no city to save', () => {
  const noPlace: StopWithPlace = {
    id: 'stop-1',
    trip_id: 'trip-42',
    city_id: 777,
    sort_order: 0,
    arrive_date: '2026-05-10',
    depart_date: '2026-05-12',
    created_at: '2026-04-01T10:00:00.000Z',
    updated_at: '2026-04-01T10:00:00.000Z',
    deleted_at: null,
    is_dirty: false,
    synced_at: null,
    city_name: null,
    country_id: null,
    country_name: null,
    lat: null,
    lng: null,
  } as StopWithPlace;

  it.each([
    ['no stops', [] as StopWithPlace[], 'No cities yet'],
    ['no stop this device can place', [noPlace], 'No city can be saved yet'],
  ])('with %s it says so and names the way back', async (_name, stops, title) => {
    mockStops.data = stops;
    await render(<OfflineMapsScreen />);

    expect(screen.getByText(title)).toBeTruthy();
    const back = screen.getByTestId('offline-maps-empty-back');
    expect(back).toBe(screen.getByLabelText('Back to the trip'));
    expect(back.props.variant).toBe('secondary');
    // The one primary is the pictured New area button, a coming-soon control (Q-11).
    expect(primaries()).toEqual(['Download a new area']);

    await fireEvent.press(back);
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(deadControls()).toEqual([]);
  });

  it('draws no such button while the cities are read, or when the read failed', async () => {
    mockStops.loading = true;
    await render(<OfflineMapsScreen />);
    expect(screen.queryByTestId('offline-maps-empty-back')).toBeNull();

    mockStops.loading = false;
    mockStops.error = new Error('store closed');
    await screen.rerender(<OfflineMapsScreen />);
    expect(screen.queryByTestId('offline-maps-empty-back')).toBeNull();
  });
});

describe('a document that is still being read (FR-064: a skeleton shaped like the screen)', () => {
  it('is a skeleton under ONE progressbar with the name the spinner had, never the empty state', async () => {
    mockDocument.loading = true;
    await render(<DocumentViewScreen />);

    const region = screen.getByLabelText('Loading the document');
    expect(region).toBe(screen.getByTestId('document-view-skeleton'));
    expect(region.props.accessibilityRole).toBe('progressbar');
    expect(screen.queryByText('This document isn’t on this device')).toBeNull();
    expect(screen.queryByTestId('document-missing-back')).toBeNull();
    // The bar is there, so the wait can be left.
    expect(screen.getByLabelText('Back')).toBeTruthy();
    expect(deadControls()).toEqual([]);
  });
});

describe('the other states of the same two screens: no control is a dead end', () => {
  it('a document that cannot be read: words, an icon and "Try again"', async () => {
    mockDocument.error = new Error('store closed');
    await render(<DocumentViewScreen />);
    expect(screen.getByLabelText('Try again')).toBeTruthy();
    expect(deadControls()).toEqual([]);
  });

  const ARRANGEMENTS: [string, () => void][] = [
    [
      'the trip’s cities are being read',
      () => {
        mockStops.loading = true;
      },
    ],
    [
      'the trip’s cities cannot be read',
      () => {
        mockStops.error = new Error('x');
      },
    ],
    [
      'maps are not set up in this build',
      () => {
        mockMapbox.state = 'unavailable';
      },
    ],
    [
      'the map engine is starting',
      () => {
        mockMapbox.state = 'starting';
      },
    ],
  ];

  it.each(ARRANGEMENTS)('offline maps: %s', async (_name, arrange) => {
    mockStops.data = [];
    arrange();
    await render(<OfflineMapsScreen />);
    expect(screen.getByTestId('offline-maps-screen')).toBeTruthy();
    expect(deadControls()).toEqual([]);
    expect(misroutedComingSoon()).toEqual([]);
  });
});
