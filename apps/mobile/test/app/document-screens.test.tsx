/**
 * User Story 5 document screens — `trip/[id]/documents` (the list),
 * `trip/[id]/document-capture` (scan or pick) and `trip/[id]/document-view`
 * (the document, its fields, their confirmation) — tasks.md T118, T119
 * (FR-031..FR-035, FR-041; Acceptance Scenarios 5.3, 5.4, 5.5).
 *
 * The live-query hooks and actions are mocked (their own suite runs them
 * against a real database and the real vault); `expo-camera` becomes a
 * stand-in whose props a test drives exactly as the native view would —
 * `onCameraReady`, then `onBarcodeScanned` with a decoded payload. Pinned:
 * every state is designed; the first barcode is parsed with the shared BCBP
 * parser for today and stored for review; an unrecognised barcode or none is
 * manual entry, never an error; a denied camera is explained with the library
 * still offered; the fields are pre-filled, normalised and validated before
 * they are confirmed; every document screen blocks screen capture; and no
 * screen offers any way to share, export, copy or publish a document.
 */
import { parseBoardingPass, type DocumentParsedFields } from '@triptrackr/contracts';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import { scanFromURLAsync } from 'expo-camera';
import * as ExpoHaptics from 'expo-haptics';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { Alert, Dimensions, Linking, Share, StyleSheet } from 'react-native';

import DocumentCaptureScreen from '@/app/trip/[id]/document-capture';
import DocumentViewScreen from '@/app/trip/[id]/document-view';
import DocumentsScreen from '@/app/trip/[id]/documents';
import type { DocumentRow, TripRow } from '@/db/schema';
import {
  DOCUMENT_CAPTURE_COPY,
  FIELDS_STATUS_TEXT,
  UPLOAD_STATUS_TEXT,
} from '@/features/documents/document-copy';
import { DOCUMENT_FORM_COPY } from '@/features/documents/document-form';
import { formatIsoDate, todayIso } from '@/features/trips/stop-dates';
import { StorageFullError } from '@/lib/disk-space';
import { Sentry } from '@/lib/sentry';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string | string[]> = { id: 'trip-42' };

jest.mock('expo-router', () => {
  const React = require('react') as typeof import('react');
  return {
    useRouter: () => ({
      push: mockPush,
      back: mockBack,
      replace: mockReplace,
      canGoBack: () => true,
    }),
    useLocalSearchParams: () => mockParams,
    // Focus is mount here: the effect runs once, as on first focus.
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
  };
});

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

// The camera stand-in records its props and answers `takePictureAsync` on its
// ref; permissions are whatever the test sets.
const mockCameraRender = jest.fn();
const mockTakePicture = jest.fn();
let mockPermission: { granted: boolean; canAskAgain: boolean; status: string } | null =
  null;
const mockRequestPermission = jest.fn(async () => mockPermission);

jest.mock('expo-camera', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const CameraView = React.forwardRef<object, Record<string, unknown>>(
    function MockCameraView(props, ref) {
      React.useImperativeHandle(ref, () => ({ takePictureAsync: mockTakePicture }));
      mockCameraRender(props);
      return React.createElement(View, { testID: 'camera-view' });
    },
  );
  return {
    CameraView,
    useCameraPermissions: () => [mockPermission, mockRequestPermission, jest.fn()],
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

const mockTrip = { data: trip as TripRow | null, loading: false, error: null };

jest.mock('@/features/trips/use-trips', () => ({ useTrip: () => mockTrip }));

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

const scan = scanFromURLAsync as jest.Mock;
const pick = launchImageLibraryAsync as jest.Mock;

/** The worked example in IATA Resolution 792: AC834 on day 326. */
const IATA_EXAMPLE = 'M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 326J001A0025 100';
const PASS_ID = '0b4d3c2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const BOOKING_ID = '9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a';
const OTHER_ID = '3c2b1a0f-9e8d-4c7b-a6f5-0e1d2c3b4a59';
const FIELDS: DocumentParsedFields = {
  flight_number: 'AC834',
  flight_date: '2026-11-22',
  passenger_name: 'DESMARAIS/LUC',
};
const GRANTED = { granted: true, canAskAgain: true, status: 'granted' };
const CAMERA_OUTPUT = 'file:///data/app/Caches/Camera/5A1B.jpg';

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

function cameraProps(): Record<string, (...args: unknown[]) => unknown> & {
  barcodeScannerSettings?: unknown;
} {
  const calls = mockCameraRender.mock.calls;
  return calls[calls.length - 1]?.[0] ?? {};
}

async function cameraReady() {
  await act(async () => {
    cameraProps().onCameraReady?.();
  });
}

/** Every control on screen, by its spoken label. */
function buttonLabels(): string[] {
  return screen
    .queryAllByRole('button')
    .map((button) => String(button.props.accessibilityLabel ?? ''));
}

const SHARING = /share|export|copy|public|publish|send|save to|download|print/i;

beforeEach(() => {
  mockParams = { id: 'trip-42' };
  mockTrip.data = trip;
  mockDocuments.data = [];
  mockDocuments.loading = false;
  mockDocuments.error = null;
  mockDocument.data = doc();
  mockDocument.loading = false;
  mockDocument.error = null;
  mockImage = { status: 'ready', base64: 'SlBFRyAxMDAweDc1MA==' };
  mockPermission = GRANTED;
  mockTakePicture.mockReset().mockResolvedValue({
    uri: CAMERA_OUTPUT,
    width: 4032,
    height: 3024,
    format: 'jpg',
  });
  mockActions.store.mockReset().mockResolvedValue(doc());
  mockActions.confirmFields.mockReset();
  mockActions.remove.mockReset();
  mockActions.syncTrip.mockClear();
  mockReaderMounted.mockReset();
  mockBack.mockReset();
  mockPush.mockReset();
  mockReplace.mockReset();
  scan.mockReset().mockResolvedValue([]);
  pick.mockReset();
});

/** Every button on screen drawn as the primary: FR-005 allows one per screen state. */
function primaries(): string[] {
  return screen
    .queryAllByRole('button')
    .filter((button) => button.props.variant === 'primary')
    .map((button) => String(button.props.accessibilityLabel));
}

/** Decorative glyphs are hidden from assistive technology, and so from a default query. */
const hidden = { includeHiddenElements: true };

const classesOf = (node: { props: { className?: unknown } }) =>
  String(node.props.className ?? '')
    .split(/\s+/)
    .filter(Boolean);

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

describe('<DocumentsScreen> — trip/[id]/documents (T118)', () => {
  test('the empty state is designed, names the next action, and says documents are private and encrypted', async () => {
    await render(<DocumentsScreen />);

    expect(screen.getByTestId('documents-title')).toHaveTextContent(/^Documents$/);
    expect(screen.getByTestId('documents-subtitle')).toHaveTextContent(
      'Montréal, autumn 2026 · 0 documents',
    );
    expect(screen.getByText('No documents yet')).toBeTruthy();
    expect(screen.getByText(/Scan a boarding pass or photograph a booking/)).toBeTruthy();
    expect(screen.getByTestId('documents-privacy')).toHaveTextContent(/Only you/);
  });

  test('draws its own bar as pictured: Back, the "Only you" chip and the title as the page heading (FR-044)', async () => {
    await render(<DocumentsScreen />);

    expect(screen.getAllByLabelText('Back')).toHaveLength(1);
    expect(screen.getByTestId('privacy-chip')).toBeTruthy();
    expect(screen.getByTestId('documents-title').props.accessibilityRole).toBe('header');
  });

  test('the pictured "more" control is a coming-soon control; there is no share control of any kind', async () => {
    mockDocuments.data = [doc()];
    await render(<DocumentsScreen />);

    const more = screen.getByTestId('coming-soon-documents-more');
    expect(more.props.accessibilityLabel).toBe('More');
    expect(more.props.accessibilityHint).toBe('Not available yet');
    expect(buttonLabels().filter((label) => SHARING.test(label))).toEqual([]);
  });

  test('"Add document" opens the capture screen for this trip', async () => {
    await render(<DocumentsScreen />);

    await fireEvent.press(screen.getByTestId('documents-add'));
    expect(mockPush).toHaveBeenCalledWith('/trip/trip-42/document-capture');
  });

  test('"Add document" is the one primary control, named as before, in every state (FR-005)', async () => {
    mockDocuments.data = [doc()];
    await render(<DocumentsScreen />);

    const add = screen.getByTestId('documents-add');
    expect(add.props.accessibilityRole).toBe('button');
    expect(add.props.accessibilityLabel).toBe('Add document');
    expect(primaries()).toEqual(['Add document']);

    mockDocuments.data = [];
    mockDocuments.loading = true;
    await screen.rerender(<DocumentsScreen />);
    expect(primaries()).toEqual(['Add document']);

    mockDocuments.loading = false;
    mockDocuments.error = new Error('store closed');
    await screen.rerender(<DocumentsScreen />);
    expect(primaries()).toEqual(['Add document']);
  });

  test('the privacy promise stands in every state, as words in a notice card', async () => {
    await render(<DocumentsScreen />);
    expect(screen.getByTestId('documents-privacy')).toHaveTextContent(/encrypted/);
    expect(screen.getByTestId('documents-privacy').props.accessibilityRole).toBe('text');

    mockDocuments.data = [doc()];
    await screen.rerender(<DocumentsScreen />);
    expect(screen.getByTestId('documents-privacy')).toBeTruthy();

    mockDocuments.data = [];
    mockDocuments.loading = true;
    await screen.rerender(<DocumentsScreen />);
    expect(screen.getByTestId('documents-privacy')).toBeTruthy();

    mockDocuments.loading = false;
    mockDocuments.error = new Error('store closed');
    await screen.rerender(<DocumentsScreen />);
    expect(screen.getByTestId('documents-privacy')).toBeTruthy();
  });

  test('rows say what each document is, its flight when known, and whether it is confirmed', async () => {
    mockDocuments.data = [
      doc({ parsed_confirmed_at: '2026-11-20T10:01:00.000Z' }),
      doc({ id: BOOKING_ID, type: 'booking', parsed_json: null }),
    ];
    await render(<DocumentsScreen />);

    expect(screen.getByTestId(`document-row-${PASS_ID}`)).toHaveTextContent(
      /Boarding pass/,
    );
    expect(screen.getByTestId(`document-flight-${PASS_ID}`)).toHaveTextContent(
      `AC834 · ${formatIsoDate('2026-11-22')}`,
    );
    expect(screen.getByTestId(`document-fields-status-${PASS_ID}`)).toHaveTextContent(
      FIELDS_STATUS_TEXT.confirmed,
    );
    expect(screen.getByTestId(`document-row-${BOOKING_ID}`)).toHaveTextContent(/Booking/);
    expect(screen.queryByTestId(`document-flight-${BOOKING_ID}`)).toBeNull();
    expect(screen.queryByTestId(`document-fields-status-${BOOKING_ID}`)).toBeNull();
  });

  test('an unconfirmed proposal reads "Check these details", never as fact', async () => {
    mockDocuments.data = [doc()];
    await render(<DocumentsScreen />);

    expect(screen.getByTestId(`document-fields-status-${PASS_ID}`)).toHaveTextContent(
      FIELDS_STATUS_TEXT.unconfirmed,
    );
  });

  test('pending and failed uploads are said in words, not only a colour', async () => {
    mockDocuments.data = [
      doc(),
      doc({ id: BOOKING_ID, type: 'booking', parsed_json: null, upload_state: 'failed' }),
    ];
    await render(<DocumentsScreen />);

    expect(screen.getByTestId(`document-row-${PASS_ID}`)).toHaveTextContent(
      /Not yet synced/,
    );
    expect(screen.getByTestId(`document-row-${BOOKING_ID}`)).toHaveTextContent(
      /Sync failed/,
    );
    expect(screen.getByTestId(`document-upload-${BOOKING_ID}`)).toHaveTextContent(
      UPLOAD_STATUS_TEXT.failed,
    );
  });

  test('an uploaded, clean document carries no pending badge', async () => {
    mockDocuments.data = [doc({ upload_state: 'uploaded', is_dirty: false })];
    await render(<DocumentsScreen />);

    expect(screen.getByTestId(`document-row-${PASS_ID}`)).not.toHaveTextContent(
      /Not yet synced|Sync failed/,
    );
  });

  test('tapping a row opens that document', async () => {
    mockDocuments.data = [doc()];
    await render(<DocumentsScreen />);

    await fireEvent.press(screen.getByTestId(`document-row-${PASS_ID}`));
    expect(mockPush).toHaveBeenCalledWith(
      `/trip/trip-42/document-view?documentId=${PASS_ID}`,
    );
  });

  test('a row is ONE control, named as it was read before plus its date, with its hint (FR-024, FR-030)', async () => {
    mockDocuments.data = [
      doc(),
      doc({ id: BOOKING_ID, type: 'booking', parsed_json: null }),
    ];
    await render(<DocumentsScreen />);

    const pass = screen.getByTestId(`document-row-${PASS_ID}`);
    expect(pass.props.accessibilityRole).toBe('button');
    expect(pass.props.accessibilityLabel).toBe(
      `Boarding pass. AC834 · ${formatIsoDate('2026-11-22')}. ${FIELDS_STATUS_TEXT.unconfirmed}. Not yet synced. Added ${formatIsoDate('2026-11-20')}`,
    );
    expect(pass.props.accessibilityHint).toBe('Opens the document');
    // The date stub is the row's cue, as pictured: no chevron.
    expect(screen.queryByTestId(`document-row-${PASS_ID}-cue`, hidden)).toBeNull();

    const booking = screen.getByTestId(`document-row-${BOOKING_ID}`);
    expect(booking.props.accessibilityLabel).toBe(
      `Booking. Not yet synced. Added ${formatIsoDate('2026-11-20')}`,
    );
    // The rows are not the screen's primary: the one primary stays "Add document".
    expect(primaries()).toEqual(['Add document']);
  });

  test('each row leads with an icon for its kind (US4 scenario 3)', async () => {
    mockDocuments.data = [
      doc(),
      doc({ id: BOOKING_ID, type: 'booking', parsed_json: null }),
      doc({ id: OTHER_ID, type: 'other', parsed_json: null }),
    ];
    await render(<DocumentsScreen />);

    for (const id of [PASS_ID, BOOKING_ID, OTHER_ID]) {
      expect(screen.getByTestId(`document-row-${id}-icon`, hidden)).toBeTruthy();
    }
    expect(screen.getByTestId(`document-row-${OTHER_ID}`)).toHaveTextContent(
      /Other document/,
    );
  });

  test('a document that is only on this device has a dashed edge AND its words; a saved one has neither (FR-034)', async () => {
    mockDocuments.data = [
      doc(),
      doc({ id: BOOKING_ID, type: 'booking', parsed_json: null, upload_state: 'failed' }),
      doc({
        id: OTHER_ID,
        type: 'other',
        parsed_json: null,
        upload_state: 'uploaded',
        is_dirty: false,
      }),
    ];
    await render(<DocumentsScreen />);

    for (const id of [PASS_ID, BOOKING_ID]) {
      expect(classesOf(screen.getByTestId(`document-row-${id}-surface`))).toEqual(
        expect.arrayContaining(['border-dashed', 'border-amber-line']),
      );
    }
    expect(screen.getByTestId(`document-row-${PASS_ID}`)).toHaveTextContent(
      /Not yet synced/,
    );
    expect(
      classesOf(screen.getByTestId(`document-row-${OTHER_ID}-surface`)),
    ).not.toContain('border-dashed');
  });

  test('gaining focus retries what the trip still owes the API', async () => {
    await render(<DocumentsScreen />);
    expect(mockActions.syncTrip).toHaveBeenCalledWith('trip-42');
  });

  test('while loading, rows are skeletons announced as ONE busy region, never the empty state (FR-021)', async () => {
    mockDocuments.loading = true;
    await render(<DocumentsScreen />);

    const region = screen.getByLabelText('Loading documents');
    expect(region.props.accessibilityRole).toBe('progressbar');
    expect(screen.getAllByLabelText('Loading documents')).toHaveLength(1);
    expect(screen.queryByText('No documents yet')).toBeNull();
    expect(screen.getByTestId('documents-screen')).toBeTruthy();
  });

  test('an error says what happened in words and offers to try again, which reads the list afresh (C4-10)', async () => {
    mockDocuments.error = new Error('store closed');
    mockDocuments.data = [doc()];
    await render(<DocumentsScreen />);

    expect(screen.getByText('Couldn’t read the documents')).toBeTruthy();
    expect(screen.queryByTestId(`document-row-${PASS_ID}`)).toBeNull();
    expect(mockReaderMounted).toHaveBeenCalledTimes(1);
    expect(mockActions.syncTrip).toHaveBeenCalledTimes(1);

    mockDocuments.error = null;
    await fireEvent.press(screen.getByLabelText('Try again'));

    // The reader was mounted again (a live query is re-run by subscribing again).
    expect(mockReaderMounted).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Couldn’t read the documents')).toBeNull();
    expect(screen.getByTestId(`document-row-${PASS_ID}`)).toBeTruthy();
  });

  test('the capture guard is held by the screen itself, so a retry never leaves a gap in it', async () => {
    mockDocuments.error = new Error('store closed');
    await render(<DocumentsScreen />);
    const guard = usePreventScreenCapture as jest.Mock;
    const keysBefore = new Set(guard.mock.calls.map((call) => call[0]));

    mockDocuments.error = null;
    await fireEvent.press(screen.getByLabelText('Try again'));

    expect(new Set(guard.mock.calls.map((call) => call[0]))).toEqual(keysBefore);
  });

  test('blocks screen capture, and offers no sharing of any kind', async () => {
    mockDocuments.data = [
      doc(),
      doc({ id: BOOKING_ID, type: 'booking', parsed_json: null }),
    ];
    await render(<DocumentsScreen />);

    expect(usePreventScreenCapture).toHaveBeenCalledWith(
      expect.stringMatching(/^document-/),
    );
    expect(buttonLabels().filter((label) => SHARING.test(label))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

describe('<DocumentCaptureScreen> — scan or pick (T118, research D-33)', () => {
  test('a boarding pass is scanned live for PDF417, Aztec and QR, once the camera is ready', async () => {
    await render(<DocumentCaptureScreen />);

    expect(screen.getByTestId('camera-view')).toBeTruthy();
    expect(cameraProps().barcodeScannerSettings).toEqual({
      barcodeTypes: ['pdf417', 'aztec', 'qr'],
    });
    expect(cameraProps().onBarcodeScanned).toBeUndefined();

    await cameraReady();
    expect(cameraProps().onBarcodeScanned).toEqual(expect.any(Function));
  });

  test('the first barcode takes the picture, is parsed for today, and is stored for review', async () => {
    await render(<DocumentCaptureScreen />);
    await cameraReady();

    await act(async () => {
      const { onBarcodeScanned } = cameraProps();
      onBarcodeScanned?.({ type: 'pdf417', data: IATA_EXAMPLE });
      onBarcodeScanned?.({ type: 'pdf417', data: IATA_EXAMPLE });
    });

    await waitFor(() => expect(mockActions.store).toHaveBeenCalledTimes(1));
    expect(mockTakePicture).toHaveBeenCalledTimes(1);
    expect(mockActions.store).toHaveBeenCalledWith({
      tripId: 'trip-42',
      type: 'boarding_pass',
      temporaryUri: CAMERA_OUTPUT,
      parsed: parseBoardingPass(IATA_EXAMPLE, todayIso()),
    });
    expect(scan).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith(
      `/trip/trip-42/document-view?documentId=${PASS_ID}&review=1`,
    );
  });

  test('an unrecognised barcode is stored without fields and opened for manual entry — never an error', async () => {
    await render(<DocumentCaptureScreen />);
    await cameraReady();

    await act(async () => {
      cameraProps().onBarcodeScanned?.({
        type: 'qr',
        data: 'https://example.com/booking/123',
      });
    });

    await waitFor(() =>
      expect(mockActions.store).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'boarding_pass', parsed: null }),
      ),
    );
    expect(mockReplace).toHaveBeenCalledWith(
      `/trip/trip-42/document-view?documentId=${PASS_ID}&review=1`,
    );
    expect(screen.queryByTestId('document-capture-error')).toBeNull();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  test('a pass photographed by hand is still searched for its barcode', async () => {
    scan.mockResolvedValueOnce([{ type: 'pdf417', data: IATA_EXAMPLE }]);
    await render(<DocumentCaptureScreen />);
    await cameraReady();

    await act(async () => {
      fireEvent.press(screen.getByTestId('document-capture-shutter'));
    });

    await waitFor(() => expect(mockActions.store).toHaveBeenCalled());
    expect(scan).toHaveBeenCalledWith(CAMERA_OUTPUT, ['pdf417', 'aztec', 'qr']);
    expect(mockActions.store).toHaveBeenCalledWith(
      expect.objectContaining({ parsed: parseBoardingPass(IATA_EXAMPLE, todayIso()) }),
    );
  });

  test('a booking is photographed, not scanned, and opened without a review', async () => {
    mockActions.store.mockResolvedValueOnce(
      doc({ id: BOOKING_ID, type: 'booking', parsed_json: null }),
    );
    await render(<DocumentCaptureScreen />);
    await fireEvent.press(screen.getByTestId('document-type-booking'));
    await cameraReady();
    expect(cameraProps().onBarcodeScanned).toBeUndefined();

    await act(async () => {
      fireEvent.press(screen.getByTestId('document-capture-shutter'));
    });

    await waitFor(() =>
      expect(mockActions.store).toHaveBeenCalledWith({
        tripId: 'trip-42',
        type: 'booking',
        temporaryUri: CAMERA_OUTPUT,
        parsed: null,
      }),
    );
    expect(scan).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith(
      `/trip/trip-42/document-view?documentId=${BOOKING_ID}`,
    );
  });

  test('a pass picked from the library is decoded from the image and stored for review', async () => {
    const picked = 'file:///data/app/Caches/ImagePicker/pass.jpeg';
    pick.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: picked, width: 1170, height: 2532 }],
    });
    scan.mockResolvedValueOnce([{ type: 'qr', data: IATA_EXAMPLE }]);
    await render(<DocumentCaptureScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('document-capture-library'));
    });

    await waitFor(() =>
      expect(mockActions.store).toHaveBeenCalledWith({
        tripId: 'trip-42',
        type: 'boarding_pass',
        temporaryUri: picked,
        parsed: parseBoardingPass(IATA_EXAMPLE, todayIso()),
      }),
    );
    expect(scan).toHaveBeenCalledWith(picked, ['pdf417', 'aztec', 'qr']);
  });

  test('a cancelled pick changes nothing', async () => {
    pick.mockResolvedValueOnce({ canceled: true, assets: null });
    await render(<DocumentCaptureScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('document-capture-library'));
    });

    expect(mockActions.store).not.toHaveBeenCalled();
    expect(screen.getByTestId('camera-view')).toBeTruthy();
  });

  test('checking the camera permission is a designed state', async () => {
    mockPermission = null;
    await render(<DocumentCaptureScreen />);
    expect(screen.getByText('Checking camera access')).toBeTruthy();
  });

  test('a camera not yet allowed is explained in words, with a way to allow it and the library still there', async () => {
    mockPermission = { granted: false, canAskAgain: true, status: 'undetermined' };
    await render(<DocumentCaptureScreen />);

    expect(screen.queryByTestId('camera-view')).toBeNull();
    expect(screen.getByTestId('document-camera-permission')).toHaveTextContent(
      DOCUMENT_CAPTURE_COPY.cameraAsk,
    );
    await fireEvent.press(screen.getByTestId('document-camera-allow'));
    expect(mockRequestPermission).toHaveBeenCalled();
    expect(screen.getByTestId('document-capture-library')).toBeTruthy();
  });

  test('a camera refused for good is explained, with a way to Settings, and the library still works', async () => {
    mockPermission = { granted: false, canAskAgain: false, status: 'denied' };
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    pick.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: CAMERA_OUTPUT, width: 800, height: 600 }],
    });
    await render(<DocumentCaptureScreen />);

    expect(screen.getByTestId('document-camera-permission')).toHaveTextContent(
      DOCUMENT_CAPTURE_COPY.cameraDenied,
    );
    await fireEvent.press(screen.getByTestId('document-camera-settings'));
    expect(openSettings).toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByTestId('document-capture-library'));
    });
    await waitFor(() => expect(mockActions.store).toHaveBeenCalled());
  });

  test('a capture on a full device says so in words, is not reported, and the camera comes back (T139)', async () => {
    mockActions.store.mockRejectedValueOnce(new StorageFullError());
    await render(<DocumentCaptureScreen />);
    await cameraReady();

    await act(async () => {
      fireEvent.press(screen.getByTestId('document-capture-shutter'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('document-capture-error')).toHaveTextContent(
        DOCUMENT_CAPTURE_COPY.noSpace,
      ),
    );
    // The traveller's circumstance, not a defect.
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(screen.getByTestId('camera-view')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test('a capture that cannot be saved is said in words and reported, and the camera comes back', async () => {
    const failure = new Error('The vault could not seal the file');
    mockActions.store.mockRejectedValueOnce(failure);
    await render(<DocumentCaptureScreen />);
    await cameraReady();

    await act(async () => {
      fireEvent.press(screen.getByTestId('document-capture-shutter'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('document-capture-error')).toHaveTextContent(
        DOCUMENT_CAPTURE_COPY.saveFailed,
      ),
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(failure);
    expect(screen.getByTestId('camera-view')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test('a picture the camera cannot take is said in words, and the next barcode still counts', async () => {
    mockTakePicture.mockRejectedValueOnce(new Error('Camera is not running'));
    await render(<DocumentCaptureScreen />);
    await cameraReady();

    await act(async () => {
      cameraProps().onBarcodeScanned?.({ type: 'pdf417', data: IATA_EXAMPLE });
    });
    await waitFor(() =>
      expect(screen.getByTestId('document-scanner-error')).toHaveTextContent(
        DOCUMENT_CAPTURE_COPY.captureFailed,
      ),
    );
    expect(Sentry.captureException).toHaveBeenCalled();

    await act(async () => {
      cameraProps().onBarcodeScanned?.({ type: 'pdf417', data: IATA_EXAMPLE });
    });
    await waitFor(() => expect(mockActions.store).toHaveBeenCalledTimes(1));
  });

  test('the live preview blocks screen capture', async () => {
    await render(<DocumentCaptureScreen />);
    expect(usePreventScreenCapture).toHaveBeenCalledWith(
      expect.stringMatching(/^document-/),
    );
    expect(buttonLabels().filter((label) => SHARING.test(label))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Capture, on Atlas (FR-005, FR-015, FR-033, FR-037)
// ---------------------------------------------------------------------------

describe('<DocumentCaptureScreen> — Atlas (T443)', () => {
  test('keeps its own bar, with the Back it always had and the title the flows know', async () => {
    await render(<DocumentCaptureScreen />);

    const back = screen.getByLabelText('Back');
    expect(back.props.accessibilityRole).toBe('button');
    expect(screen.getByTestId('document-capture-title')).toHaveTextContent(
      'Add a document',
    );
    await fireEvent.press(back);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test('the three kinds are one radio group with the ids and names they had', async () => {
    await render(<DocumentCaptureScreen />);

    const pass = screen.getByTestId('document-type-boarding_pass');
    expect(pass.props.accessibilityRole).toBe('radio');
    expect(pass.props.accessibilityLabel).toBe('Boarding pass');
    expect(pass.props.accessibilityState).toMatchObject({
      selected: true,
      checked: true,
    });
    expect(screen.getByTestId('document-type-booking').props.accessibilityLabel).toBe(
      'Booking',
    );
    expect(screen.getByTestId('document-type-other').props.accessibilityLabel).toBe(
      'Other document',
    );

    await fireEvent.press(screen.getByTestId('document-type-booking'));
    expect(
      screen.getByTestId('document-type-booking').props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(screen.getByTestId('document-capture-hint')).toHaveTextContent(
      'Fill the frame with the booking, then take the photo.',
    );
  });

  test('the shutter is the one primary while the camera is live; the library is secondary (FR-005)', async () => {
    await render(<DocumentCaptureScreen />);
    await cameraReady();

    expect(primaries()).toEqual(['Take photo']);
    expect(screen.getByTestId('document-capture-shutter').props.size).toBe('lg');
    expect(screen.getByTestId('document-capture-library').props.variant).toBe(
      'secondary',
    );
  });

  test('the controls sit OUTSIDE the full-width camera frame: nothing is drawn across the picture (FR-033)', async () => {
    await render(<DocumentCaptureScreen />);
    await cameraReady();

    const frame = screen.getByLabelText('Camera preview');
    expect(within(frame).getByTestId('camera-view')).toBeTruthy();
    expect(within(frame).queryByTestId('document-capture-shutter')).toBeNull();
    expect(within(frame).queryByTestId('document-capture-library')).toBeNull();

    // The frame is a hairline and nothing else: no fill, tint, shadow or translucency.
    const style = StyleSheet.flatten(frame.props.style);
    expect(style.borderWidth).toBeGreaterThan(0);
    for (const key of ['backgroundColor', 'boxShadow', 'shadowColor', 'opacity']) {
      expect(style).not.toHaveProperty(key);
    }
    expect(style.width).toBe('100%');
  });

  test('the shutter is inert and named while the camera starts, then ready', async () => {
    await render(<DocumentCaptureScreen />);

    const shutter = screen.getByTestId('document-capture-shutter');
    expect(shutter.props.accessibilityLabel).toBe('Take photo');
    expect(shutter.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText('Starting the camera…')).toBeTruthy();

    await cameraReady();
    expect(
      screen.getByTestId('document-capture-shutter').props.accessibilityState,
    ).toMatchObject({ disabled: false });
    expect(screen.queryByText('Starting the camera…')).toBeNull();
  });

  test('a capture in flight is said as a polite live region and the shutter and library are busy', async () => {
    let finish: (value: DocumentRow) => void = () => undefined;
    mockActions.store.mockReturnValueOnce(
      new Promise<DocumentRow>((done) => (finish = done)),
    );
    await render(<DocumentCaptureScreen />);
    await cameraReady();

    await act(async () => {
      fireEvent.press(screen.getByTestId('document-capture-shutter'));
    });

    const saving = await screen.findByText('Saving to this device…');
    expect(saving.props.accessibilityLiveRegion).toBe('polite');
    for (const id of ['document-capture-shutter', 'document-capture-library']) {
      expect(screen.getByTestId(id).props.accessibilityState).toMatchObject({
        busy: true,
      });
    }
    await act(async () => finish(doc()));
  });

  test('checking the permission has no primary; the library is already there', async () => {
    mockPermission = null;
    await render(<DocumentCaptureScreen />);

    const checking = screen.getByLabelText('Checking camera access');
    expect(checking.props.accessibilityRole).toBe('progressbar');
    expect(primaries()).toEqual([]);
    expect(screen.getByTestId('document-capture-library')).toBeTruthy();
  });

  test('not yet allowed: "Allow camera" is the one primary, the library a secondary', async () => {
    mockPermission = { granted: false, canAskAgain: true, status: 'undetermined' };
    await render(<DocumentCaptureScreen />);

    const allow = screen.getByTestId('document-camera-allow');
    expect(allow.props.accessibilityLabel).toBe('Allow camera');
    expect(allow.props.accessibilityRole).toBe('button');
    expect(primaries()).toEqual(['Allow camera']);
    expect(screen.getByTestId('document-camera-permission')).toBeTruthy();
    expect(screen.queryByTestId('document-capture-shutter')).toBeNull();
  });

  test('refused for good: "Open Settings" is the one primary', async () => {
    mockPermission = { granted: false, canAskAgain: false, status: 'denied' };
    await render(<DocumentCaptureScreen />);

    expect(screen.getByTestId('document-camera-settings').props.accessibilityLabel).toBe(
      'Open Settings',
    );
    expect(primaries()).toEqual(['Open Settings']);
    expect(screen.getByText('The camera is turned off')).toBeTruthy();
  });

  test('every refusal is an alert in words beside the camera, never colour alone', async () => {
    mockActions.store.mockRejectedValueOnce(new Error('vault'));
    await render(<DocumentCaptureScreen />);
    await cameraReady();

    await act(async () => {
      fireEvent.press(screen.getByTestId('document-capture-shutter'));
    });

    const error = await screen.findByTestId('document-capture-error');
    expect(error.props.accessibilityRole).toBe('alert');
    expect(error).toHaveTextContent(DOCUMENT_CAPTURE_COPY.saveFailed);
  });
});

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

describe('<DocumentViewScreen> — the document and its fields (T118, T119)', () => {
  beforeEach(() => {
    mockParams = { id: 'trip-42', documentId: PASS_ID };
  });

  test('shows the decrypted image as an in-memory data URI, the fields to check, and the upload state', async () => {
    await render(<DocumentViewScreen />);

    expect(screen.getByTestId('document-view-title')).toHaveTextContent('Boarding pass');
    expect(screen.getByTestId('document-image').props.source).toEqual({
      uri: 'data:image/jpeg;base64,SlBFRyAxMDAweDc1MA==',
    });
    expect(screen.getByTestId('document-field-flight-number')).toHaveTextContent('AC834');
    expect(screen.getByTestId('document-field-flight-date')).toHaveTextContent(
      formatIsoDate('2026-11-22'),
    );
    expect(screen.getByTestId('document-field-passenger-name')).toHaveTextContent(
      'DESMARAIS/LUC',
    );
    expect(screen.getByTestId('document-fields-status')).toHaveTextContent(
      FIELDS_STATUS_TEXT.unconfirmed,
    );
    expect(screen.getByTestId('document-upload-status')).toHaveTextContent(
      UPLOAD_STATUS_TEXT.pending,
    );
  });

  test.each([
    [1, 1],
    [1.15, 2],
    [2, 2],
  ])(
    'the bar title takes one line, two from a font scale of 1.15 (at %s: %s)',
    async (fontScale, lines) => {
      const window = jest
        .spyOn(Dimensions, 'get')
        .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale });
      await render(<DocumentViewScreen />);

      expect(screen.getByTestId('document-view-title').props.numberOfLines).toBe(lines);
      window.mockRestore();
    },
  );

  test('blocks screen capture while the document is shown (Acceptance 5.4)', async () => {
    await render(<DocumentViewScreen />);

    const keys = (usePreventScreenCapture as jest.Mock).mock.calls.map((call) => call[0]);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((key) => /^document-/.test(String(key)))).toBe(true);
  });

  test('offers no way to share, export, copy or publish the document (FR-032, Acceptance 5.5)', async () => {
    const share = jest.spyOn(Share, 'share');
    mockDocument.data = doc({ parsed_confirmed_at: '2026-11-20T10:01:00.000Z' });
    await render(<DocumentViewScreen />);

    expect(buttonLabels().length).toBeGreaterThan(0);
    expect(buttonLabels().filter((label) => SHARING.test(label))).toEqual([]);
    await fireEvent.press(screen.getByTestId('document-review'));
    expect(buttonLabels().filter((label) => SHARING.test(label))).toEqual([]);
    expect(share).not.toHaveBeenCalled();
  });

  test('checking the fields: pre-filled, a typed flight number normalised, and stored as confirmed', async () => {
    await render(<DocumentViewScreen />);

    await fireEvent.press(screen.getByTestId('document-review'));
    expect(screen.getByTestId('document-confirm-flight-number').props.value).toBe(
      'AC834',
    );
    expect(screen.getByTestId('document-confirm-passenger-name').props.value).toBe(
      'DESMARAIS/LUC',
    );
    expect(
      screen.getByTestId('document-confirm-flight-date').props.accessibilityValue,
    ).toEqual({ text: formatIsoDate('2026-11-22') });

    await fireEvent.changeText(
      screen.getByTestId('document-confirm-flight-number'),
      'ac 0834',
    );
    await fireEvent.changeText(
      screen.getByTestId('document-confirm-passenger-name'),
      ' DESMARAIS/LUC MR ',
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('document-confirm-save'));
    });

    await waitFor(() =>
      expect(mockActions.confirmFields).toHaveBeenCalledWith(PASS_ID, {
        flight_number: 'AC834',
        flight_date: '2026-11-22',
        passenger_name: 'DESMARAIS/LUC MR',
      }),
    );
    expect(screen.queryByTestId('document-confirm-form')).toBeNull();
    expect(screen.getByTestId('document-details')).toBeTruthy();
  });

  test('a flight number the pass could not carry is refused in words, and nothing is stored', async () => {
    await render(<DocumentViewScreen />);
    await fireEvent.press(screen.getByTestId('document-review'));

    await fireEvent.changeText(
      screen.getByTestId('document-confirm-flight-number'),
      'AC-834',
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('document-confirm-save'));
    });

    await waitFor(() =>
      expect(screen.getByText(DOCUMENT_FORM_COPY.flightNumberInvalid)).toBeTruthy(),
    );
    expect(mockActions.confirmFields).not.toHaveBeenCalled();
  });

  test('straight after a scan the form is open; "Not now" keeps the fields as an unconfirmed proposal', async () => {
    mockParams = { id: 'trip-42', documentId: PASS_ID, review: '1' };
    await render(<DocumentViewScreen />);

    expect(screen.getByTestId('document-confirm-form')).toBeTruthy();
    expect(screen.getByTestId('document-confirm-intro')).toHaveTextContent(/barcode/);

    await fireEvent.press(screen.getByTestId('document-confirm-not-now'));

    expect(mockActions.confirmFields).not.toHaveBeenCalled();
    expect(screen.queryByTestId('document-confirm-form')).toBeNull();
    expect(screen.getByTestId('document-fields-status')).toHaveTextContent(
      FIELDS_STATUS_TEXT.unconfirmed,
    );
  });

  test('a pass whose barcode could not be read offers manual entry on today’s date — not an error', async () => {
    mockParams = { id: 'trip-42', documentId: PASS_ID, review: '1' };
    mockDocument.data = doc({ parsed_json: null });
    await render(<DocumentViewScreen />);

    expect(screen.getByTestId('document-confirm-intro')).toHaveTextContent(
      DOCUMENT_CAPTURE_COPY.manualEntry,
    );
    expect(screen.getByTestId('document-confirm-flight-number').props.value).toBe('');
    expect(
      screen.getByTestId('document-confirm-flight-date').props.accessibilityValue,
    ).toEqual({ text: formatIsoDate(todayIso()) });

    await fireEvent.changeText(
      screen.getByTestId('document-confirm-flight-number'),
      'lh 0400',
    );
    await fireEvent.changeText(
      screen.getByTestId('document-confirm-passenger-name'),
      'MUSTERMANN/ERIKA',
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('document-confirm-save'));
    });

    await waitFor(() =>
      expect(mockActions.confirmFields).toHaveBeenCalledWith(PASS_ID, {
        flight_number: 'LH400',
        flight_date: todayIso(),
        passenger_name: 'MUSTERMANN/ERIKA',
      }),
    );
  });

  test('a pass with no fields yet invites them', async () => {
    mockDocument.data = doc({ parsed_json: null });
    await render(<DocumentViewScreen />);

    expect(screen.getByTestId('document-fields-status')).toHaveTextContent(
      FIELDS_STATUS_TEXT.none,
    );
    await fireEvent.press(screen.getByTestId('document-review'));
    expect(screen.getByTestId('document-confirm-form')).toBeTruthy();
  });

  test('confirmed fields read "Confirmed", and can still be corrected', async () => {
    mockDocument.data = doc({
      parsed_confirmed_at: '2026-11-20T10:01:00.000Z',
      upload_state: 'uploaded',
      is_dirty: false,
    });
    await render(<DocumentViewScreen />);

    expect(screen.getByTestId('document-fields-status')).toHaveTextContent(
      FIELDS_STATUS_TEXT.confirmed,
    );
    expect(screen.getByTestId('document-upload-status')).toHaveTextContent(
      UPLOAD_STATUS_TEXT.saved,
    );
    await fireEvent.press(screen.getByTestId('document-review'));
    expect(screen.getByTestId('document-confirm-form')).toBeTruthy();
  });

  test('a booking carries no fields and nothing to confirm', async () => {
    mockParams = { id: 'trip-42', documentId: BOOKING_ID, review: '1' };
    mockDocument.data = doc({ id: BOOKING_ID, type: 'booking', parsed_json: null });
    await render(<DocumentViewScreen />);

    expect(screen.getByTestId('document-view-title')).toHaveTextContent('Booking');
    expect(screen.queryByTestId('document-review')).toBeNull();
    expect(screen.queryByTestId('document-confirm-form')).toBeNull();
    expect(screen.queryByTestId('document-fields-status')).toBeNull();
  });

  test('a confirmation that cannot be written is reported and shown, and the form keeps what was typed', async () => {
    const failure = new Error('disk I/O error');
    mockActions.confirmFields.mockImplementationOnce(() => {
      throw failure;
    });
    await render(<DocumentViewScreen />);
    await fireEvent.press(screen.getByTestId('document-review'));
    await fireEvent.changeText(
      screen.getByTestId('document-confirm-flight-number'),
      'AC835',
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('document-confirm-save'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('document-confirm-error')).toHaveTextContent(
        DOCUMENT_FORM_COPY.saveFailed,
      ),
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(failure);
    expect(screen.getByTestId('document-confirm-flight-number').props.value).toBe(
      'AC835',
    );
  });

  test('deleting asks first, then removes the document and goes back', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });
    await render(<DocumentViewScreen />);

    await fireEvent.press(screen.getByTestId('document-delete'));

    expect(Alert.alert).toHaveBeenCalled();
    expect(mockActions.remove).toHaveBeenCalledWith(PASS_ID);
    expect(mockBack).toHaveBeenCalled();
  });

  test('a delete that fails is shown in words, and the document stays open', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });
    mockActions.remove.mockImplementationOnce(() => {
      throw new Error('locked');
    });
    await render(<DocumentViewScreen />);

    await fireEvent.press(screen.getByTestId('document-delete'));

    expect(screen.getByTestId('document-view-error')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  test('the image has designed states: opening, not on this device, and unreadable', async () => {
    mockImage = { status: 'opening' };
    await render(<DocumentViewScreen />);
    expect(screen.getByText('Opening the document')).toBeTruthy();

    mockImage = { status: 'absent' };
    await screen.rerender(<DocumentViewScreen />);
    expect(screen.getByText('The image isn’t on this device')).toBeTruthy();

    mockImage = { status: 'unreadable' };
    await screen.rerender(<DocumentViewScreen />);
    expect(screen.getByText('Couldn’t open this document')).toBeTruthy();
    expect(screen.queryByTestId('document-image')).toBeNull();
  });

  test('a document that is not on this device, and a store that will not answer, are designed states', async () => {
    mockDocument.data = null;
    await render(<DocumentViewScreen />);
    expect(screen.getByText('This document isn’t on this device')).toBeTruthy();

    mockDocument.loading = true;
    await screen.rerender(<DocumentViewScreen />);
    // A skeleton shaped like the screen (T559, FR-064), announced by name.
    expect(screen.getByLabelText('Loading the document')).toBeTruthy();

    mockDocument.loading = false;
    mockDocument.error = new Error('store closed');
    await screen.rerender(<DocumentViewScreen />);
    expect(screen.getByText('Couldn’t read the document')).toBeTruthy();
  });

  test('a store that will not answer offers to try again, which reads the document afresh (C4-10)', async () => {
    mockDocument.error = new Error('store closed');
    await render(<DocumentViewScreen />);
    expect(mockReaderMounted).toHaveBeenCalledTimes(1);

    mockDocument.error = null;
    await fireEvent.press(screen.getByLabelText('Try again'));

    expect(mockReaderMounted).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Couldn’t read the document')).toBeNull();
    expect(screen.getByTestId('document-view-title')).toHaveTextContent('Boarding pass');
  });
});

// ---------------------------------------------------------------------------
// The document, on Atlas (FR-005, FR-015, FR-033, FR-037)
// ---------------------------------------------------------------------------

describe('<DocumentViewScreen> — Atlas (T443)', () => {
  beforeEach(() => {
    mockParams = { id: 'trip-42', documentId: PASS_ID };
  });

  test('draws its own bar as pictured: a close disc named "Back", the kind as the heading and the "Only you" chip', async () => {
    await render(<DocumentViewScreen />);

    expect(screen.getAllByLabelText('Back')).toHaveLength(1);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('privacy-chip')).toBeTruthy();
    const title = screen.getByTestId('document-view-title');
    expect(title).toHaveTextContent('Boarding pass');
    expect(title.props.accessibilityRole).toBe('header');
  });

  test('the picture is the hero: on a white plate under a band, with nothing but the brightness control near it (FR-033, FR-050)', async () => {
    await render(<DocumentViewScreen />);

    const image = screen.getByTestId('document-image');
    expect(image.props.accessibilityRole).toBe('image');
    expect(image.props.accessibilityLabel).toBe('Picture of your boarding pass');
    const hero = screen.getByTestId('document-hero');
    expect(within(hero).getByTestId('barcode-plate')).toBeTruthy();
    expect(within(hero).getByTestId('document-hero-kind')).toHaveTextContent(
      'Boarding pass',
    );
    // The flight is on the band only once the traveller has confirmed it.
    expect(within(hero).queryByTestId('document-hero-flight')).toBeNull();
    // Nothing is drawn across the picture: no control is inside the hero.
    expect(within(hero).queryAllByRole('button')).toEqual([]);
    expect(StyleSheet.flatten(hero.props.style).transform).toEqual([{ rotate: '-1deg' }]);
  });

  test('a confirmed pass puts its flight number on the hero band', async () => {
    mockDocument.data = doc({ parsed_confirmed_at: '2026-11-21T09:00:00.000Z' });
    await render(<DocumentViewScreen />);

    expect(screen.getByTestId('document-hero-flight')).toHaveTextContent('AC834');
  });

  test('the pictured brightness line is a coming-soon control that changes nothing', async () => {
    await render(<DocumentViewScreen />);

    const boost = screen.getByTestId('coming-soon-document-brightness');
    expect(boost.props.accessibilityRole).toBe('button');
    expect(boost.props.accessibilityLabel).toBe('Raise brightness for the code');
    expect(boost.props.accessibilityHint).toBe('Not available yet');
    expect(screen.queryByText(/brightness is raised/i)).toBeNull();
  });

  test('the pictured share, copy and linked-stop rows are not drawn: a document is never shareable', async () => {
    await render(<DocumentViewScreen />);

    expect(screen.queryByText('Share a copy')).toBeNull();
    expect(screen.queryByLabelText('Copy reference')).toBeNull();
    expect(screen.queryByText('Linked to')).toBeNull();
    expect(buttonLabels().filter((label) => SHARING.test(label))).toEqual([]);
  });

  test('viewing a pass: there is no primary; checking is secondary and Delete is destructive (FR-005)', async () => {
    await render(<DocumentViewScreen />);

    expect(primaries()).toEqual([]);
    expect(screen.getByTestId('document-review').props.variant).toBe('secondary');
    expect(screen.getByTestId('document-review').props.accessibilityLabel).toBe(
      'Check details',
    );
    const remove = screen.getByTestId('document-delete');
    expect(remove.props.accessibilityLabel).toBe('Delete document');
    expect(remove.props.accessibilityRole).toBe('button');
    expect(remove.props.variant).toBe('danger-soft');
  });

  test('the review button is worded for what it will do', async () => {
    mockDocument.data = doc({ parsed_json: null });
    await render(<DocumentViewScreen />);
    expect(screen.getByTestId('document-review').props.accessibilityLabel).toBe(
      'Enter flight details',
    );

    mockDocument.data = doc({ parsed_confirmed_at: '2026-11-20T10:01:00.000Z' });
    await screen.rerender(<DocumentViewScreen />);
    expect(screen.getByTestId('document-review').props.accessibilityLabel).toBe(
      'Correct details',
    );
  });

  test('the fields read as label and value pairs inside one card; a booking has no fields card', async () => {
    await render(<DocumentViewScreen />);

    const card = screen.getByTestId('document-details');
    for (const [label, id] of [
      ['Flight', 'document-field-flight-number'],
      ['Date', 'document-field-flight-date'],
      ['Passenger', 'document-field-passenger-name'],
    ] as const) {
      expect(within(card).getByText(label)).toBeTruthy();
      expect(within(card).getByTestId(id)).toBeTruthy();
    }

    mockDocument.data = doc({ id: BOOKING_ID, type: 'booking', parsed_json: null });
    await screen.rerender(<DocumentViewScreen />);
    expect(screen.queryByTestId('document-details')).toBeNull();
  });

  test('the upload state is a badge AND words until the bytes have landed (FR-034, Constitution II)', async () => {
    await render(<DocumentViewScreen />);
    expect(screen.getByLabelText('Sync pending')).toBeTruthy();
    expect(screen.getByTestId('document-upload-status')).toHaveTextContent(
      UPLOAD_STATUS_TEXT.pending,
    );

    mockDocument.data = doc({ upload_state: 'failed' });
    await screen.rerender(<DocumentViewScreen />);
    expect(screen.getByLabelText('Sync failed')).toBeTruthy();
    expect(screen.getByTestId('document-upload-status')).toHaveTextContent(
      UPLOAD_STATUS_TEXT.failed,
    );

    mockDocument.data = doc({ upload_state: 'uploaded', is_dirty: false });
    await screen.rerender(<DocumentViewScreen />);
    expect(screen.queryByLabelText('Sync pending')).toBeNull();
    expect(screen.getByTestId('document-upload-status')).toHaveTextContent(
      UPLOAD_STATUS_TEXT.saved,
    );
  });

  test('a delete that failed is an alert in words above the control that caused it', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });
    mockActions.remove.mockImplementationOnce(() => {
      throw new Error('locked');
    });
    await render(<DocumentViewScreen />);

    await fireEvent.press(screen.getByTestId('document-delete'));

    expect(screen.getByTestId('document-view-error').props.accessibilityRole).toBe(
      'alert',
    );
    expect(screen.getByTestId('document-view-error')).toHaveTextContent(
      'That document could not be deleted. Please try again.',
    );
  });
});

describe('<DocumentConfirmForm> — Atlas (T443)', () => {
  beforeEach(() => {
    mockParams = { id: 'trip-42', documentId: PASS_ID, review: '1' };
  });

  test('is the screen’s one primary: "Confirm details"; "Not now" is a text button (FR-005)', async () => {
    await render(<DocumentViewScreen />);

    expect(primaries()).toEqual(['Confirm details']);
    const notNow = screen.getByTestId('document-confirm-not-now');
    expect(notNow.props.variant).toBe('ghost');
    expect(notNow.props.accessibilityLabel).toBe('Not now');
    expect(notNow.props.accessibilityHint).toBe(
      'Keeps the details as a suggestion you still need to check',
    );
    expect(screen.getByTestId('document-confirm-save').props.accessibilityLabel).toBe(
      'Confirm details',
    );
  });

  test('reads Flight details, why, the three fields, then the actions, with Not now first', async () => {
    await render(<DocumentViewScreen />);

    const form = screen.getByTestId('document-confirm-form');
    expect(within(form).getByText('Flight details')).toBeTruthy();
    const order = [
      'document-confirm-intro',
      'document-confirm-flight-number',
      'document-confirm-flight-date',
      'document-confirm-passenger-name',
      'document-confirm-not-now',
      'document-confirm-save',
    ].map((id) => within(form).getByTestId(id));
    const ids = form.queryAll(() => true).map((node) => node.props.testID);
    const positions = order.map((node) => ids.indexOf(node.props.testID));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  test('the text fields are labelled inputs that take the pass’s capitals and no autocorrect', async () => {
    await render(<DocumentViewScreen />);

    const flight = screen.getByTestId('document-confirm-flight-number');
    expect(flight.props.accessibilityLabel).toBe('Flight number');
    expect(flight.props.autoCapitalize).toBe('characters');
    expect(flight.props.autoCorrect).toBe(false);
    expect(flight.props.placeholder).toBe('AC834');

    const passenger = screen.getByTestId('document-confirm-passenger-name');
    expect(passenger.props.accessibilityLabel).toBe('Passenger name');
    expect(passenger.props.autoCapitalize).toBe('characters');
    expect(passenger.props.autoCorrect).toBe(false);
    expect(passenger.props.placeholder).toBe('SURNAME/GIVEN NAME');
  });

  test('the last field says Done, so the keyboard can be put away to reach Confirm details', async () => {
    await render(<DocumentViewScreen />);

    expect(
      screen.getByTestId('document-confirm-passenger-name').props.returnKeyType,
    ).toBe('done');
  });

  test('a refused flight number is words beside its field, an alert, and the field is marked invalid', async () => {
    await render(<DocumentViewScreen />);
    await fireEvent.changeText(
      screen.getByTestId('document-confirm-flight-number'),
      'AC-834',
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('document-confirm-save'));
    });

    const message = await screen.findByTestId('document-confirm-flight-number-error');
    expect(message.props.accessibilityRole).toBe('alert');
    expect(message).toHaveTextContent(DOCUMENT_FORM_COPY.flightNumberInvalid);
    expect(
      screen.getByTestId('document-confirm-flight-number').props['aria-invalid'],
    ).toBe(true);
    expect(mockActions.confirmFields).not.toHaveBeenCalled();
  });

  test('a failed write is an alert under the fields, above the actions', async () => {
    mockActions.confirmFields.mockImplementationOnce(() => {
      throw new Error('disk I/O error');
    });
    await render(<DocumentViewScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('document-confirm-save'));
    });

    const error = await screen.findByTestId('document-confirm-error');
    expect(error.props.accessibilityRole).toBe('alert');
  });

  test('is a form on the keyboard-aware, scrolling screen, so Confirm details can be scrolled above the keyboard', async () => {
    await render(<DocumentViewScreen />);

    // `Screen keyboardAware` is the library's KeyboardAwareScrollView, which pads the page
    // by the keyboard's height so the last control can always be scrolled into view, and
    // which lets a tap on a button through while a field has the keyboard up.
    const scrollers = screen
      .getByTestId('document-view-screen')
      .queryAll((node) => node.props.keyboardShouldPersistTaps === 'handled', {
        includeSelf: true,
      });
    expect(scrollers.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

describe('document screens — no route to sharing exists (FR-032, Constitution I)', () => {
  const fs = jest.requireActual('fs') as typeof import('fs');
  const path = jest.requireActual('path') as typeof import('path');
  const root = path.join(__dirname, '..', '..', 'src');
  const sources = [
    'app/trip/[id]/documents.tsx',
    'app/trip/[id]/document-capture.tsx',
    'app/trip/[id]/document-view.tsx',
    ...fs
      .readdirSync(path.join(root, 'components', 'trip'))
      .filter((name) => name.startsWith('document-'))
      .map((name) => `components/trip/${name}`),
  ];

  test.each(sources)(
    '%s imports no sharing, clipboard or media-library module',
    (file) => {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      expect(source).not.toMatch(
        /from '(expo-sharing|expo-media-library|expo-clipboard|@react-native-clipboard\/clipboard)'/,
      );
      expect(source).not.toMatch(/import[^;]*\bShare\b[^;]*from 'react-native'/);
      expect(source).not.toMatch(/is_public|isPublic/);
    },
  );
});

describe('document screens — composed from the Atlas adapter layer only (FR-036, C4-10 rule 1)', () => {
  const fs = jest.requireActual('fs') as typeof import('fs');
  const path = jest.requireActual('path') as typeof import('path');
  const root = path.join(__dirname, '..', '..', 'src');
  const sources = [
    'app/trip/[id]/documents.tsx',
    'app/trip/[id]/document-capture.tsx',
    'app/trip/[id]/document-view.tsx',
    'components/trip/documents-header.tsx',
    'components/trip/document-camera-permission.tsx',
    'components/trip/document-camera.tsx',
    'components/trip/document-confirm-form.tsx',
    'components/trip/document-details.tsx',
    'components/trip/document-image.tsx',
    'components/trip/document-list-item.tsx',
    'components/trip/document-ticket.tsx',
    'components/trip/document-hero.tsx',
    'components/trip/barcode-plate.tsx',
    'components/trip/brightness-boost.tsx',
    'components/trip/documents-skeleton.tsx',
  ];

  test.each(sources)('%s uses no retired primitive, kit or colour literal', (file) => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const specifiers = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
    for (const retired of [
      '@/components/ui/surface',
      '@/components/ui/pressable-surface',
      '@/components/ui/text-field',
      '@/components/ui/pill-group',
      '@/components/themed-text',
      '@/components/themed-view',
    ]) {
      expect(specifiers).not.toContain(retired);
    }
    expect(specifiers.some((from) => /^(heroui-native|uniwind)/.test(from))).toBe(false);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|\[#/);
    expect(source).not.toMatch(/use-appearance|Colors\[/);
  });

  test('no document source logs: document names, fields and pictures are never written out', () => {
    const logged = /console\.(log|info|warn|error|debug)|\bdebugger\b/;
    for (const file of sources) {
      expect(fs.readFileSync(path.join(root, file), 'utf8')).not.toMatch(logged);
    }
  });
});

/**
 * T460 - FR-020: confirming the fields of a document is a save (success haptic once the
 * fields are stored, none for a refusal or a failed write), and confirming the deletion
 * plays the warning. The real `useHaptics` is under this, so what is read is `expo-haptics`
 * (a global stand-in, jest.setup.ts). The destructive `Button` also plays the warning as it
 * is pressed; the native confirmation is a separate moment, so its answer is given by hand.
 */
// ---------------------------------------------------------------------------
// As pictured (005 T552; FR-049, FR-050)
// ---------------------------------------------------------------------------

describe('<DocumentsScreen> — as pictured (T552)', () => {
  const SAVED = { upload_state: 'uploaded', is_dirty: false } as const;

  test('the subtitle counts the documents; the FAB says "Scan document" and is named "Add document"', async () => {
    mockDocuments.data = [
      doc(),
      doc({ id: BOOKING_ID, type: 'booking', parsed_json: null }),
    ];
    await render(<DocumentsScreen />);

    expect(screen.getByTestId('documents-subtitle')).toHaveTextContent(
      'Montréal, autumn 2026 · 2 documents',
    );
    const add = screen.getByTestId('documents-add');
    expect(add.props.accessibilityLabel).toBe('Add document');
    expect(within(add).getByText('Scan document')).toBeTruthy();
    expect(screen.getAllByTestId('documents-add')).toHaveLength(1);
  });

  test('with no documents the empty state carries the one primary, "Scan document", and the FAB is not drawn twice', async () => {
    await render(<DocumentsScreen />);

    expect(screen.getAllByTestId('documents-add')).toHaveLength(1);
    expect(screen.getByText('Scan document')).toBeTruthy();
    expect(screen.getByText('No documents yet')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('documents-add'));
    expect(mockPush).toHaveBeenCalledWith('/trip/trip-42/document-capture');
  });

  test('a ticket shows a confirmed pass by its flight day and anything else by the day it was added', async () => {
    mockDocuments.data = [
      doc({ ...SAVED, parsed_confirmed_at: '2026-11-20T10:05:00.000Z' }),
      doc({ ...SAVED, id: BOOKING_ID, type: 'booking', parsed_json: null }),
    ];
    await render(<DocumentsScreen />);

    expect(
      screen.getByTestId(`document-row-${PASS_ID}-stub-day`, hidden),
    ).toHaveTextContent('22');
    expect(
      screen.getByTestId(`document-row-${BOOKING_ID}-stub-day`, hidden),
    ).toHaveTextContent('20');
    expect(
      screen.getByTestId(`document-row-${PASS_ID}`).props.accessibilityLabel,
    ).toMatch(/Flight date /);
    expect(
      screen.getByTestId(`document-row-${BOOKING_ID}`).props.accessibilityLabel,
    ).toMatch(/Added /);
  });

  test('the list says no passenger name', async () => {
    mockDocuments.data = [doc()];
    await render(<DocumentsScreen />);

    expect(screen.queryByText(/DESMARAIS/)).toBeNull();
  });
});

describe('<DocumentViewScreen> — as pictured (T552)', () => {
  beforeEach(() => {
    mockParams = { id: 'trip-42', documentId: PASS_ID };
  });

  test('the details are one group: the pass’s fields, then the day it was added, with the cloud tick only once uploaded', async () => {
    await render(<DocumentViewScreen />);

    const group = screen.getByTestId('document-info');
    expect(within(group).getByTestId('document-details')).toBeTruthy();
    expect(within(group).getByTestId('document-added-on')).toHaveTextContent(
      formatIsoDate('2026-11-20'),
    );
    expect(screen.queryByTestId('document-added-uploaded', hidden)).toBeNull();

    mockDocument.data = doc({ upload_state: 'uploaded', is_dirty: false });
    await screen.rerender(<DocumentViewScreen />);
    expect(screen.getByTestId('document-added-uploaded', hidden)).toBeTruthy();
    expect(screen.getByTestId('document-upload-status')).toHaveTextContent(
      UPLOAD_STATUS_TEXT.saved,
    );
  });

  test('a booking has the Added row and no fields', async () => {
    mockDocument.data = doc({ type: 'booking', parsed_json: null });
    await render(<DocumentViewScreen />);

    expect(screen.queryByTestId('document-details')).toBeNull();
    expect(screen.getByTestId('document-added')).toBeTruthy();
  });

  test('with the form open the fields leave the group and the Added row stays', async () => {
    mockParams = { id: 'trip-42', documentId: PASS_ID, review: '1' };
    await render(<DocumentViewScreen />);

    expect(screen.getByTestId('document-confirm-form')).toBeTruthy();
    expect(screen.queryByTestId('document-details')).toBeNull();
    expect(screen.getByTestId('document-added')).toBeTruthy();
  });

  test('Delete is the pictured word, named "Delete document", destructive and centred', async () => {
    await render(<DocumentViewScreen />);

    const remove = screen.getByTestId('document-delete');
    expect(remove.props.accessibilityLabel).toBe('Delete document');
    expect(remove.props.variant).toBe('danger-soft');
    expect(within(remove).getByText('Delete')).toBeTruthy();
  });

  test('the bar is drawn in every state, so a document that will not open can still be left', async () => {
    mockDocument.data = null;
    mockDocument.error = new Error('store closed');
    await render(<DocumentViewScreen />);

    expect(screen.getByLabelText('Back')).toBeTruthy();
    expect(screen.getByTestId('privacy-chip')).toBeTruthy();
    expect(screen.queryByTestId('document-view-title')).toBeNull();
  });
});

describe('<DocumentCaptureScreen> — as pictured (T552)', () => {
  test('shares the area bar: the tonal Back disc, the title and the "Only you" chip', async () => {
    await render(<DocumentCaptureScreen />);

    expect(screen.getByTestId('document-capture-title')).toHaveTextContent(
      'Add a document',
    );
    expect(screen.getByTestId('document-capture-title').props.accessibilityRole).toBe(
      'header',
    );
    expect(screen.getByTestId('privacy-chip')).toBeTruthy();
  });
});

describe('<DocumentViewScreen> — save and destructive-confirmation haptics (T460; FR-020)', () => {
  const haptics = jest.mocked(ExpoHaptics);
  const notified = () => haptics.notificationAsync.mock.calls.map(([kind]) => kind);

  beforeEach(() => {
    mockParams = { id: 'trip-42', documentId: PASS_ID };
    haptics.notificationAsync.mockClear();
  });

  const confirmFields = async () => {
    await render(<DocumentViewScreen />);
    await fireEvent.press(screen.getByTestId('document-review'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('document-confirm-save'));
    });
  };

  test('confirmed fields play the success haptic once', async () => {
    await confirmFields();
    await waitFor(() => expect(mockActions.confirmFields).toHaveBeenCalled());
    expect(notified()).toEqual(['success']);
  });

  test('fields that could not be stored play no success haptic', async () => {
    mockActions.confirmFields.mockImplementationOnce(() => {
      throw new Error('locked');
    });
    await confirmFields();
    await waitFor(() =>
      expect(screen.getByTestId('document-confirm-error')).toBeTruthy(),
    );
    expect(notified()).not.toContain('success');
  });

  test('confirming the deletion plays the warning haptic, and the question alone does not', async () => {
    let destructive: (() => void) | undefined;
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      destructive = buttons?.find((button) => button.style === 'destructive')?.onPress;
    });
    await render(<DocumentViewScreen />);
    await fireEvent.press(screen.getByTestId('document-delete'));
    haptics.notificationAsync.mockClear();
    expect(mockActions.remove).not.toHaveBeenCalled();

    await act(async () => destructive?.());

    expect(mockActions.remove).toHaveBeenCalledWith(PASS_ID);
    expect(notified()).toEqual(['warning']);
  });
});
