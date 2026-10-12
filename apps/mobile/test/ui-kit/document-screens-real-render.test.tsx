/**
 * 004 T443 - the three document screens over the REAL `heroui-native` under Jest
 * (research D4-13).
 *
 * `test/app/document-screens.test.tsx` renders them over the stand-in. This file puts the
 * kit's own Card, Button, Chip, Field and Skeleton underneath, so what the screens rely on
 * is checked against the real components: nothing throws (a card inside a card is a
 * development error; a kit component needs only the provider), the ids and names land on
 * the nodes a test or a Maestro flow finds them by, and our classes reach the card. How a
 * class LOOKS (the dashed edge, the hairline) is Uniwind's, on a device.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type * as HeroUI from 'heroui-native';

import DocumentCaptureScreen from '@/app/trip/[id]/document-capture';
import DocumentViewScreen from '@/app/trip/[id]/document-view';
import DocumentsScreen from '@/app/trip/[id]/documents';
import type { DocumentRow } from '@/db/schema';

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => require('../mocks/reanimated-full'));
// The suite-wide stand-in is replaced by the real kit for THIS file only.
jest.mock('heroui-native', () => jest.requireActual('heroui-native'));

// `mock`-prefixed so Jest's hoisted factory may reference them.
const mockPush = jest.fn();
let mockParams: Record<string, string> = { id: 'trip-42' };
jest.mock('expo-router', () => {
  const React = require('react') as typeof import('react');
  return {
    useRouter: () => ({
      push: mockPush,
      back: jest.fn(),
      replace: jest.fn(),
      canGoBack: () => true,
    }),
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
  };
});
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));
jest.mock('@/features/trips/use-trips', () => ({
  useTrip: () => ({
    data: { id: 'trip-42', title: 'Montréal, autumn 2026' },
    loading: false,
    error: null,
  }),
}));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

let mockPermission: { granted: boolean; canAskAgain: boolean } | null = {
  granted: true,
  canAskAgain: true,
};
jest.mock('expo-camera', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  return {
    CameraView: React.forwardRef(function MockCameraView() {
      return React.createElement(View, { testID: 'camera-view' });
    }),
    useCameraPermissions: () => [mockPermission, jest.fn(), jest.fn()],
    scanFromURLAsync: jest.fn(async () => []),
  };
});

const mockDocuments: { data: DocumentRow[]; loading: boolean; error: Error | null } = {
  data: [],
  loading: false,
  error: null,
};
const mockDocument: { data: DocumentRow | null; loading: boolean; error: Error | null } =
  { data: null, loading: false, error: null };
jest.mock('@/features/documents/use-documents', () => ({
  useDocuments: () => mockDocuments,
  useDocument: () => mockDocument,
  useDocumentImage: () => ({ status: 'ready', base64: 'AAAA' }),
  useDocumentActions: () => ({
    store: jest.fn(),
    confirmFields: jest.fn(),
    remove: jest.fn(),
    syncTrip: jest.fn(async () => undefined),
  }),
}));

const { HeroUINativeProvider } = jest.requireActual<typeof HeroUI>('heroui-native');
const CONFIG = { devInfo: { stylingPrinciples: false } };

// Under Jest the kit's `useThemeColor` asks Uniwind for `--color-*` variables the stylesheet
// transform never registered, so the kit's ghost Button (our `text` variant) cannot blend
// its hover colour and its colour kit reports it. That is the test environment, not the
// screens: only that message is dropped, every other error still prints.
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

const PASS: DocumentRow = {
  id: 'pass-1',
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
  local_file_uri: 'document-vault/pass-1.sealed',
  created_at: '2026-11-20T10:00:00.000Z',
  updated_at: '2026-11-20T10:00:00.000Z',
  deleted_at: null,
};
const SAVED: DocumentRow = {
  ...PASS,
  id: 'booking-1',
  type: 'booking',
  parsed_json: null,
  upload_state: 'uploaded',
  is_dirty: false,
  synced_at: '2026-11-20T10:05:00.000Z',
};

function renderOver(screenElement: React.ReactElement) {
  return render(
    <HeroUINativeProvider config={CONFIG}>{screenElement}</HeroUINativeProvider>,
  );
}

beforeEach(() => {
  mockParams = { id: 'trip-42' };
  mockPermission = { granted: true, canAskAgain: true };
  mockDocuments.data = [PASS, SAVED];
  mockDocuments.loading = false;
  mockDocuments.error = null;
  mockDocument.data = PASS;
  mockDocument.loading = false;
  mockDocument.error = null;
  mockPush.mockReset();
});

describe('the document list over the real kit', () => {
  test('renders the context line, the privacy notice, the one primary and a card per document without error', async () => {
    await renderOver(<DocumentsScreen />);

    expect(screen.getByTestId('documents-title')).toHaveTextContent(
      'Documents · Montréal, autumn 2026',
    );
    expect(screen.getByTestId('documents-privacy')).toBeTruthy();
    const add = screen.getByTestId('documents-add');
    expect(add.props.accessibilityRole).toBe('button');
    expect(add.props.accessibilityLabel).toBe('Add document');
  });

  test('a row is one named button the kit presses, in a card with its edge from the document’s state', async () => {
    await renderOver(<DocumentsScreen />);

    const row = screen.getByTestId('document-row-pass-1');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityHint).toBe('Opens the document');
    await fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith(
      '/trip/trip-42/document-view?documentId=pass-1',
    );

    expect(classesOf(screen.getByTestId('document-row-pass-1-surface'))).toEqual(
      expect.arrayContaining(['bg-surface', 'border-dashed', 'border-amber-line']),
    );
    expect(classesOf(screen.getByTestId('document-row-booking-1-surface'))).not.toContain(
      'border-dashed',
    );
  });

  test('while it loads the kit draws one named placeholder region instead of rows', async () => {
    mockDocuments.data = [];
    mockDocuments.loading = true;
    await renderOver(<DocumentsScreen />);

    expect(screen.getByLabelText('Loading documents').props.accessibilityRole).toBe(
      'progressbar',
    );
    expect(screen.queryByTestId('document-row-pass-1')).toBeNull();
  });
});

describe('the document and its form over the real kit', () => {
  beforeEach(() => {
    mockParams = { id: 'trip-42', documentId: 'pass-1' };
  });

  test('the fields card, the upload badge and the two controls render without error', async () => {
    await renderOver(<DocumentViewScreen />);

    expect(screen.getByTestId('document-details')).toBeTruthy();
    expect(screen.getByTestId('document-review').props.accessibilityLabel).toBe(
      'Check details',
    );
    expect(screen.getByTestId('document-delete').props.accessibilityLabel).toBe(
      'Delete document',
    );
    expect(screen.getByLabelText('Sync pending')).toBeTruthy();
  });

  test('the form is labelled inputs the kit names, with Confirm details and Not now as buttons', async () => {
    mockParams = { id: 'trip-42', documentId: 'pass-1', review: '1' };
    await renderOver(<DocumentViewScreen />);

    const flight = screen.getByTestId('document-confirm-flight-number');
    expect(flight.props.accessibilityLabel).toBe('Flight number');
    expect(flight.props.value).toBe('AC834');
    expect(screen.getByTestId('document-confirm-save').props.accessibilityRole).toBe(
      'button',
    );
    expect(screen.getByTestId('document-confirm-not-now').props.accessibilityLabel).toBe(
      'Not now',
    );
  });
});

describe('the capture screen over the real kit', () => {
  test('the kinds are radios the kit names; the shutter and the library are buttons', async () => {
    await renderOver(<DocumentCaptureScreen />);

    expect(screen.getByTestId('document-type-booking').props.accessibilityRole).toBe(
      'radio',
    );
    expect(screen.getByTestId('document-capture-library').props.accessibilityRole).toBe(
      'button',
    );
    expect(screen.getByLabelText('Back').props.accessibilityRole).toBe('button');
  });

  test('a camera that is not allowed is a card with its one way forward', async () => {
    mockPermission = { granted: false, canAskAgain: true };
    await renderOver(<DocumentCaptureScreen />);

    expect(screen.getByTestId('document-camera-permission')).toBeTruthy();
    expect(screen.getByTestId('document-camera-allow').props.accessibilityRole).toBe(
      'button',
    );
  });
});
