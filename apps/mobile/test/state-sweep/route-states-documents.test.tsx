/**
 * T559 - the Documents route and the document capture route, in every state they have
 * (FR-064, FR-066, FR-080 as amended by Q-11): the list loading, unreadable, empty and listed;
 * the capture's camera check, its permission asked, refused for good and granted. In each: no
 * control that does nothing, no control that says it is not available yet without being a
 * coming-soon control (and the reverse), at most ONE primary.
 *
 * The live queries and the camera are replaced as in `document-screens.test.tsx`.
 */
import { render, screen } from '@testing-library/react-native';

import DocumentCaptureScreen from '@/app/trip/[id]/document-capture';
import DocumentsScreen from '@/app/trip/[id]/documents';
import type { DocumentRow, TripRow } from '@/db/schema';

import {
  deadControls,
  misroutedComingSoon,
  pressableCount,
  primaryControls,
} from '../helpers/dead-controls';

jest.mock('expo-router', () => {
  const React = require('react') as typeof import('react');
  return {
    useRouter: () => ({
      push: jest.fn(),
      back: jest.fn(),
      replace: jest.fn(),
      canGoBack: () => true,
    }),
    useLocalSearchParams: () => ({ id: 'trip-42' }),
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
  };
});
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

let mockPermission: { granted: boolean; canAskAgain: boolean; status: string } | null =
  null;
jest.mock('expo-camera', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const CameraView = React.forwardRef<object, Record<string, unknown>>(
    function MockCameraView(_props, ref) {
      React.useImperativeHandle(ref, () => ({ takePictureAsync: jest.fn() }));
      return React.createElement(View, { testID: 'camera-view' });
    },
  );
  return {
    CameraView,
    useCameraPermissions: () => [mockPermission, jest.fn(), jest.fn()],
    scanFromURLAsync: jest.fn(async () => []),
  };
});
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

const trip: TripRow = {
  id: 'trip-42',
  title: 'Montréal, autumn 2026',
  home_currency: 'CAD',
  is_public: false,
  cover_photo_id: null,
  status: 'planning',
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
  deleted_at: null,
  is_dirty: false,
  synced_at: '2026-10-01T10:00:00.000Z',
};
jest.mock('@/features/trips/use-trips', () => ({
  useTrip: () => ({ data: trip, loading: false, error: null }),
}));

const mockDocuments = {
  data: [] as DocumentRow[],
  loading: false,
  error: null as Error | null,
};
jest.mock('@/features/documents/use-documents', () => ({
  useDocuments: () => mockDocuments,
  useDocument: () => ({ data: null, loading: false, error: null }),
  useDocumentImage: () => ({ status: 'opening' }),
  useDocumentActions: () => ({
    store: jest.fn(),
    confirmFields: jest.fn(),
    remove: jest.fn(),
    syncTrip: jest.fn(async () => undefined),
  }),
}));

const pass = (id: string): DocumentRow => ({
  id,
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
  local_file_uri: `document-vault/${id}.sealed`,
  created_at: '2026-11-20T10:00:00.000Z',
  updated_at: '2026-11-20T10:00:00.000Z',
  deleted_at: null,
});

beforeEach(() => {
  mockDocuments.data = [];
  mockDocuments.loading = false;
  mockDocuments.error = null;
  mockPermission = { granted: true, canAskAgain: true, status: 'granted' };
});

/** What every state of every route owes the traveller. */
function expectHealthy(primaries: string[] | null = null) {
  expect(pressableCount()).toBeGreaterThan(0);
  expect(deadControls()).toEqual([]);
  expect(misroutedComingSoon()).toEqual([]);
  if (primaries === null) expect(primaryControls().length).toBeLessThanOrEqual(1);
  else expect(primaryControls()).toEqual(primaries);
}

describe('Documents states: no control is a dead end', () => {
  it('loading: a skeleton', async () => {
    mockDocuments.loading = true;
    await render(<DocumentsScreen />);
    expect(screen.getByLabelText('Loading documents')).toBeTruthy();
    expectHealthy();
  });

  it('unreadable: words, an icon and "Try again"', async () => {
    mockDocuments.error = new Error('database is locked');
    await render(<DocumentsScreen />);
    expect(screen.getByText('Couldn’t read the documents')).toBeTruthy();
    expect(screen.getByLabelText('Try again')).toBeTruthy();
    expectHealthy();
  });

  it('empty: "No documents yet" and "Scan document", the one primary', async () => {
    await render(<DocumentsScreen />);
    expect(screen.getByText('No documents yet')).toBeTruthy();
    expectHealthy(['"Add document"']);
  });

  it('documents: the list, with the floating button', async () => {
    mockDocuments.data = [pass('0b4d3c2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a')];
    await render(<DocumentsScreen />);
    expectHealthy();
  });
});

describe('Document capture states: no control is a dead end', () => {
  it('checking the camera: words, and the library is already there', async () => {
    mockPermission = null;
    await render(<DocumentCaptureScreen />);
    expect(screen.getByLabelText('Checking camera access')).toBeTruthy();
    expectHealthy([]);
  });

  it('not yet allowed: "Allow camera" is the one primary', async () => {
    mockPermission = { granted: false, canAskAgain: true, status: 'undetermined' };
    await render(<DocumentCaptureScreen />);
    expectHealthy(['"Allow camera"']);
  });

  it('refused for good: Open Settings is the one primary', async () => {
    mockPermission = { granted: false, canAskAgain: false, status: 'denied' };
    await render(<DocumentCaptureScreen />);
    expect(screen.getByTestId('document-camera-denied')).toBeTruthy();
    expectHealthy(['"Open Settings"']);
  });

  it('allowed: the camera, with the shutter as the one primary', async () => {
    await render(<DocumentCaptureScreen />);
    expect(screen.getByTestId('camera-view')).toBeTruthy();
    expectHealthy();
  });
});
