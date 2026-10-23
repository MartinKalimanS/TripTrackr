/**
 * T562 - the appearance sweep of the trip routes and the two forms: the trip, its photos,
 * notes, spending, documents (list, viewer, capture) and offline maps, and the Plan a trip and
 * Add an expense sheets, in the four themes and under reduced transparency (FR-072, FR-073,
 * FR-078, FR-079, SC-008). The data hooks are the mocked worlds of the existing suites
 * (`test/app/trip-screen-harness.tsx`, `photo-screen-harness.tsx`, `us2-screens`,
 * `document-screens`); the audit, its exceptions and the render helpers are in
 * `test/appearance/`.
 */
import { SYSTEM_EXPENSE_CATEGORIES } from '@triptrackr/contracts';
import { screen, waitFor } from '@testing-library/react-native';

import AddExpenseScreen from '@/app/modal/add-expense';
import AddTripScreen from '@/app/modal/add-trip';
import DocumentCaptureScreen from '@/app/trip/[id]/document-capture';
import DocumentViewScreen from '@/app/trip/[id]/document-view';
import DocumentsScreen from '@/app/trip/[id]/documents';
import ExpensesScreen from '@/app/trip/[id]/expenses';
import TripScreen from '@/app/trip/[id]/index';
import NotesScreen from '@/app/trip/[id]/notes';
import OfflineMapsScreen from '@/app/trip/[id]/offline-maps';
import PhotosScreen from '@/app/trip/[id]/photos';
import type { DocumentRow, ExpenseRow } from '@/db/schema';
import type { NoteWithPlace } from '@/db/repositories/notes';
import { useSessionStore } from '@/features/auth/session-store';

import { captureIntervals } from '../helpers/captured-interval';
import {
  florence,
  live,
  overview,
  resetTripScreen,
  rome,
  router,
} from '../app/trip-screen-harness';
import {
  failed,
  mockPhotos,
  pending,
  resetPhotoScreen,
  uploaded,
} from '../app/photo-screen-harness';

import { sweepScreen } from './sweep';

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () =>
  require('../app/trip-screen-harness').reanimatedModule(),
);
jest.mock('expo-router', () => ({
  ...require('../app/trip-screen-harness').routerModule(),
  // Focus is mount here: the effect runs once, as on first focus.
  useFocusEffect: (effect: () => void) =>
    (require('react') as typeof import('react')).useEffect(effect, [effect]),
}));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));
jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return { Image: (props: Record<string, unknown>) => React.createElement(Host, props) };
});
jest.mock('expo-file-system', () =>
  jest.requireActual('../features/photo-fakes').createFileSystemMock(),
);
jest.mock('@/components/trip/city-picker', () =>
  require('../app/trip-screen-harness').cityPickerModule(),
);
jest.mock('@/features/trips/use-trips', () =>
  require('../app/trip-screen-harness').tripsModule(),
);
jest.mock('@/features/trips/trip-overview', () =>
  require('../app/trip-screen-harness').overviewModule(),
);
jest.mock('@/features/trips/use-trip-sync', () =>
  require('../app/trip-screen-harness').syncModule(),
);
jest.mock('@/features/photos/use-photos', () =>
  require('../app/photo-screen-harness').photosModule(),
);
jest.mock('@/features/photos/use-capture', () =>
  require('../app/photo-screen-harness').captureModule(),
);
jest.mock('@/hooks/use-mapbox-ready', () => ({ useMapboxReady: () => 'ready' }));
jest.mock('@/lib/disk-space', () => ({ freeDiskBytes: () => 1_700_000_000 }));
jest.mock('expo-camera', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  return {
    CameraView: React.forwardRef(function MockCameraView() {
      return React.createElement(View, { testID: 'camera-view' });
    }),
    useCameraPermissions: () => [
      { granted: true, canAskAgain: true, status: 'granted' },
      jest.fn(),
      jest.fn(),
    ],
    scanFromURLAsync: jest.fn(async () => []),
  };
});
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

// ---- notes, spending, documents: the data of the existing suites, one of each.
const mockFood = SYSTEM_EXPENSE_CATEGORIES[0].id;

const mockNote: NoteWithPlace = {
  id: 'note-1',
  trip_id: 'trip-42',
  country_id: 1,
  city_id: null,
  title: 'Cheese',
  body: 'Try the raclette.',
  is_public: false,
  created_at: '2026-05-10T10:00:00.000Z',
  updated_at: '2026-05-10T10:00:00.000Z',
  deleted_at: null,
  is_dirty: true,
  synced_at: null,
  country_name: 'Italy',
  city_name: null,
};
jest.mock('@/features/notes/use-notes', () => ({
  useNotes: () => ({ data: [mockNote], loading: false, error: null }),
  useNoteActions: () => ({
    createNote: jest.fn(),
    updateNote: jest.fn(),
    removeNote: jest.fn(),
  }),
}));

const mockExpense: ExpenseRow = {
  id: 'exp-1',
  trip_id: 'trip-42',
  city_id: 100,
  category_id: mockFood,
  amount: '9.00',
  currency: 'EUR',
  spent_at: '2026-05-11',
  note: 'Lunch',
  fx_rate_to_home: '0.888889',
  amount_home: '8.00',
  fx_pending: false,
  created_at: 'x',
  updated_at: 'x',
  deleted_at: null,
  is_dirty: true,
  synced_at: null,
};
jest.mock('@/features/expenses/use-expenses', () => ({
  useExpenses: () => ({ data: [mockExpense], loading: false, error: null }),
  useExpenseCategories: () => ({
    data: (
      require('@triptrackr/contracts') as typeof import('@triptrackr/contracts')
    ).SYSTEM_EXPENSE_CATEGORIES.map((c) => ({ ...c, system: true })),
    loading: false,
    error: null,
  }),
  useSpendingSummary: () => ({
    data: {
      home_currency: 'EUR',
      total_home: '18.00',
      by_category: [
        { category_id: mockFood, name: 'Food', total_home: '18.00', count: 2 },
      ],
      by_day: [{ date: '2026-05-11', total_home: '18.00', count: 2 }],
      rates_applied: [{ currency: 'EUR', rate: '0.888889', count: 1 }],
      rates_source: 'https://www.exchangerate-api.com',
      pending_conversion: {
        count: 1,
        by_currency: [{ currency: 'XTS', total: '5.00', count: 1 }],
      },
    },
    loading: false,
    error: null,
  }),
  useFxSnapshotInfo: () => ({
    asOf: '2026-05-01',
    source: 'https://www.exchangerate-api.com',
  }),
  useExpenseActions: () => ({
    createExpense: jest.fn(),
    updateExpense: jest.fn(),
    removeExpense: jest.fn(),
    createCategory: jest.fn(),
  }),
  useFxSnapshot: () => null,
}));
jest.mock('@/features/expenses/use-fx-rates', () => ({ useFxRates: jest.fn() }));

const PASS_ID = '0b4d3c2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const mockDocumentRow: DocumentRow = {
  id: PASS_ID,
  trip_id: 'trip-42',
  type: 'boarding_pass',
  parsed_json: {
    flight_number: 'AC834',
    flight_date: '2026-11-22',
    passenger_name: 'DESMARAIS/LUC',
  },
  parsed_confirmed_at: null,
  upload_state: 'pending',
  is_dirty: true,
  synced_at: null,
  local_file_uri: `document-vault/${PASS_ID}.sealed`,
  created_at: '2026-11-20T10:00:00.000Z',
  updated_at: '2026-11-20T10:00:00.000Z',
  deleted_at: null,
};
jest.mock('@/features/documents/use-documents', () => ({
  useDocuments: () => ({ data: [mockDocumentRow], loading: false, error: null }),
  useDocument: () => ({ data: mockDocumentRow, loading: false, error: null }),
  useDocumentImage: () => ({ status: 'ready', base64: 'SlBFRyAxMDAweDc1MA==' }),
  useDocumentActions: () => ({
    store: jest.fn(),
    confirmFields: jest.fn(),
    remove: jest.fn(),
    syncTrip: jest.fn(async () => undefined),
  }),
}));

// ---- the world every trip screen starts from: two stops, a few of everything.
function prepareTrip(): void {
  // The figures count up on a frame timer: held, so nothing ticks after a test has ended.
  captureIntervals();
  resetTripScreen();
  resetPhotoScreen();
  router.params = { id: 'trip-42', tripId: 'trip-42', documentId: PASS_ID };
  live.stops.data = [rome, florence];
  overview.counts = { photos: 3, notes: 1, expenses: 1, documents: 1 };
  overview.spendingTotal = '18.00';
  mockPhotos.data = [uploaded, pending, failed];
  useSessionStore.setState({
    status: 'signed-in',
    user: {
      id: '6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e4f',
      email: 'marta@example.com',
      display_name: 'Marta',
      avatar_url: null,
      bio: null,
      home_currency: 'EUR',
      is_profile_public: false,
      email_verified_at: null,
      created_at: '2021-06-15T10:00:00.000Z',
    },
  });
}

/** Rome's map is saved on the device (a finished pack an earlier session left). */
async function seedSavedMap() {
  const { offlineManager } = jest.requireMock('@rnmapbox/maps') as {
    offlineManager: {
      createPack: (options: object, progress: () => void) => Promise<void>;
      unsubscribe: (name: string) => void;
      __emitProgress: (name: string, update: object) => void;
      __reset: () => void;
    };
  };
  offlineManager.__reset();
  const name = `city-${rome.city_id}`;
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
    completedResourceSize: 12_000_000,
  });
  offlineManager.unsubscribe(name);
}

const loaded = async () =>
  waitFor(() => expect(screen.queryByLabelText('Checking saved maps')).toBeNull());

sweepScreen('Trip', () => <TripScreen />, prepareTrip);
sweepScreen('Photos', () => <PhotosScreen />, prepareTrip);
sweepScreen('Notes', () => <NotesScreen />, prepareTrip);
sweepScreen('Spending', () => <ExpensesScreen />, prepareTrip);
sweepScreen('Documents', () => <DocumentsScreen />, prepareTrip);
sweepScreen('Document viewer', () => <DocumentViewScreen />, prepareTrip);
sweepScreen('Document capture', () => <DocumentCaptureScreen />, prepareTrip);
sweepScreen(
  'Offline maps',
  () => <OfflineMapsScreen />,
  async () => {
    prepareTrip();
    await seedSavedMap();
  },
  loaded,
);
sweepScreen('Plan a trip (sheet)', () => <AddTripScreen />, prepareTrip);
sweepScreen('Add an expense (sheet)', () => <AddExpenseScreen />, prepareTrip);

// ---- the states a screen shows before and instead of its content (FR-064): a skeleton, the
// trip that is not on this device, a gallery with nothing in it.
sweepScreen(
  'Trip (loading)',
  () => <TripScreen />,
  () => {
    prepareTrip();
    live.trip.data = null;
    live.trip.loading = true;
  },
);
sweepScreen(
  'Trip (not on this device)',
  () => <TripScreen />,
  () => {
    prepareTrip();
    live.trip.data = null;
  },
);
sweepScreen(
  'Photos (loading)',
  () => <PhotosScreen />,
  () => {
    prepareTrip();
    mockPhotos.data = [];
    mockPhotos.loading = true;
  },
);
sweepScreen(
  'Photos (empty)',
  () => <PhotosScreen />,
  () => {
    prepareTrip();
    mockPhotos.data = [];
  },
);
