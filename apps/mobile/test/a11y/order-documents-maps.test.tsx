/**
 * T560 - the reading order of the documents and the offline maps of a trip (feature 005;
 * FR-070, FR-075, FR-076, SC-015; UI-SPEC 9.2): Back and the header's controls, the heading and
 * its line, the privacy words, each document ONE button that reads its type, its details and
 * whether it is confirmed and synced (in words), the floating "Add document" last; for the maps,
 * the storage lines, then each city with its state in words and its two buttons. The mocked world
 * is `document-screens.test.tsx`'s and `offline-maps.test.tsx`'s.
 */
import { waitFor, render, screen } from '@testing-library/react-native';
import type { DocumentParsedFields } from '@triptrackr/contracts';

import DocumentsScreen from '@/app/trip/[id]/documents';
import OfflineMapsScreen from '@/app/trip/[id]/offline-maps';
import type { DocumentRow, TripRow } from '@/db/schema';
import type { StopWithPlace } from '@/db/repositories/stops';

import {
  accessibleNodes,
  exposedArt,
  expectReadingOrder,
  unnamed,
} from '../helpers/a11y-nodes';

let mockParams: Record<string, string | string[]> = { id: 'trip-42' };

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) =>
    (require('react') as typeof import('react')).useEffect(effect, [effect]),
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

const mockDocuments = {
  data: [] as DocumentRow[],
  loading: false,
  error: null as Error | null,
};
const mockDocument = {
  data: null as DocumentRow | null,
  loading: false,
  error: null as Error | null,
};
let mockImage: { status: string; base64?: string } = { status: 'opening' };
const mockActions = {
  store: jest.fn(),
  confirmFields: jest.fn(),
  remove: jest.fn(),
  syncTrip: jest.fn(async () => undefined),
};

// A live query is read (subscribed) when its reader mounts. A retry that remounts the
// reader is the only way to re-run one, so each reader reports its own mount.
const mockReaderMounted = jest.fn();

jest.mock('@/features/documents/use-documents', () => {
  const React = require('react') as typeof import('react');
  const useReading = (result: unknown, name: string) => {
    React.useEffect(() => {
      mockReaderMounted(name);
    }, [name]);
    return result;
  };
  return {
    useDocuments: () => useReading(mockDocuments, 'documents'),
    useDocument: () => useReading(mockDocument, 'document'),
    useDocumentImage: () => mockImage,
    useDocumentActions: () => mockActions,
  };
});

const PASS_ID = '0b4d3c2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const OTHER_ID = '3c2b1a0f-9e8d-4c7b-a6f5-0e1d2c3b4a59';
const FIELDS: DocumentParsedFields = {
  flight_number: 'AC834',
  flight_date: '2026-11-22',
  passenger_name: 'DESMARAIS/LUC',
};

function doc(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: PASS_ID,
    trip_id: 'trip-42',
    type: 'boarding_pass',
    parsed_json: FIELDS,
    parsed_confirmed_at: null,
    upload_state: 'pending',
    is_dirty: true,
    synced_at: null,
    local_file_uri: `document-vault/${PASS_ID}.sealed`,
    created_at: '2026-11-20T10:00:00.000Z',
    updated_at: '2026-11-20T10:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  offlineManager.__reset();
  mockParams = { id: 'trip-42' };
  mockTrip.data = trip;
  mockStops.data = [rome, florence];
  mockStops.loading = false;
  mockStops.error = null;
  mockMapbox.state = 'ready';
  mockDocuments.data = [];
  mockDocuments.loading = false;
  mockDocuments.error = null;
});

const documents = () => [
  doc(),
  doc({
    id: OTHER_ID,
    parsed_confirmed_at: '2026-11-21T10:00:00.000Z',
    upload_state: 'uploaded',
    is_dirty: false,
  }),
];

describe('Documents reading order', () => {
  test('Back, privacy, the heading, the words, each document, then Add document', async () => {
    mockDocuments.data = documents();
    await render(<DocumentsScreen />);
    const nodes = accessibleNodes();
    expectReadingOrder(nodes, [
      'Back',
      'privacy-chip',
      'documents-title',
      'documents-subtitle',
      'documents-privacy',
      `document-row-${PASS_ID}`,
      `document-row-${OTHER_ID}`,
      'documents-add',
    ]);
    expect(unnamed(nodes)).toEqual([]);
    expect(exposedArt()).toEqual([]);
  });

  test('each document is ONE button that says whether it needs checking and whether it is synced', async () => {
    mockDocuments.data = documents();
    await render(<DocumentsScreen />);
    const rows = accessibleNodes().filter((node) => node.id?.startsWith('document-row-'));
    expect(rows.every((node) => node.role === 'button')).toBe(true);
    expect(rows[0]!.name).toMatch(/Check these details. Not yet synced/);
    expect(rows[1]!.name).toMatch(/Confirmed/);
    expect(rows[1]!.name).not.toMatch(/Not yet synced/);
  });

  test('no documents: the words and the one way to add the first', async () => {
    await render(<DocumentsScreen />);
    const nodes = accessibleNodes();
    expect(nodes.some((node) => node.id === 'documents-add')).toBe(true);
    expect(unnamed(nodes)).toEqual([]);
    expect(exposedArt()).toEqual([]);
  });
});

describe('Offline maps reading order', () => {
  async function renderMaps() {
    await render(<OfflineMapsScreen />);
    await waitFor(() =>
      expect(screen.queryByLabelText('Checking saved maps')).toBeNull(),
    );
  }

  test('Back, the heading, the storage, then each city with its state and its buttons, the note, the new area', async () => {
    await renderMaps();
    const nodes = accessibleNodes();
    expectReadingOrder(nodes, [
      'Back',
      'offline-maps-title',
      'offline-maps-subtitle',
      'offline-storage-used',
      'offline-storage-free',
      'offline-maps-trip',
      'Roma',
      'offline-status-100',
      'offline-download-100',
      'Firenze',
      'offline-status-101',
      'offline-download-101',
      'offline-maps-note',
      'coming-soon-offline-new-area',
    ]);
    expect(unnamed(nodes)).toEqual([]);
    expect(exposedArt()).toEqual([]);
  });

  test('a city says in words whether it is saved, and its buttons name the city', async () => {
    await renderMaps();
    const nodes = accessibleNodes();
    expect(nodes.find((node) => node.id === 'offline-status-100')?.name).toBe(
      'Not saved on this device',
    );
    expect(nodes.find((node) => node.id === 'offline-download-100')?.name).toBe(
      'Download Roma for offline use',
    );
  });
});
