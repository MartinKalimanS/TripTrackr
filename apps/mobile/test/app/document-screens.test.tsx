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
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { scanFromURLAsync } from 'expo-camera';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { Alert, Linking, Share } from 'react-native';

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

jest.mock('@/features/documents/use-documents', () => ({
  useDocuments: () => mockDocuments,
  useDocument: () => mockDocument,
  useDocumentImage: () => mockImage,
  useDocumentActions: () => mockActions,
}));

const scan = scanFromURLAsync as jest.Mock;
const pick = launchImageLibraryAsync as jest.Mock;

/** The worked example in IATA Resolution 792: AC834 on day 326. */
const IATA_EXAMPLE = 'M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 326J001A0025 100';
const PASS_ID = '0b4d3c2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const BOOKING_ID = '9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a';
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
  scan.mockReset().mockResolvedValue([]);
  pick.mockReset();
});

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

describe('<DocumentsScreen> — trip/[id]/documents (T118)', () => {
  test('the empty state is designed, and says documents are private and encrypted', async () => {
    await render(<DocumentsScreen />);

    expect(screen.getByTestId('documents-title')).toHaveTextContent(
      /Documents · Montréal, autumn 2026/,
    );
    expect(screen.getByText('No documents yet')).toBeTruthy();
    expect(screen.getByTestId('documents-privacy')).toHaveTextContent(/Only you/);
  });

  test('"Add document" opens the capture screen for this trip', async () => {
    await render(<DocumentsScreen />);

    await fireEvent.press(screen.getByTestId('documents-add'));
    expect(mockPush).toHaveBeenCalledWith('/trip/trip-42/document-capture');
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

  test('gaining focus retries what the trip still owes the API', async () => {
    await render(<DocumentsScreen />);
    expect(mockActions.syncTrip).toHaveBeenCalledWith('trip-42');
  });

  test('loading and error states are designed, not blank', async () => {
    mockDocuments.loading = true;
    await render(<DocumentsScreen />);
    expect(screen.getByText('Loading documents')).toBeTruthy();

    mockDocuments.loading = false;
    mockDocuments.error = new Error('store closed');
    await screen.rerender(<DocumentsScreen />);
    expect(screen.getByText('Couldn’t read the documents')).toBeTruthy();
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
    expect(screen.getByText('Loading the document')).toBeTruthy();

    mockDocument.loading = false;
    mockDocument.error = new Error('store closed');
    await screen.rerender(<DocumentViewScreen />);
    expect(screen.getByText('Couldn’t read the document')).toBeTruthy();
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
