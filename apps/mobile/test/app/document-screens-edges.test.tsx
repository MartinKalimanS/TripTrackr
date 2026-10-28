/**
 * The edges of the User Story 5 document surfaces that `document-screens.test.tsx`
 * does not walk — tasks.md T118 (FR-031, FR-034). A library that will not open,
 * a camera that will not answer, a Settings page that will not open, a picture
 * that reports its own size (or an absurd or missing one), a list opened while
 * the app is away, and headers with nothing to name.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { Linking, StyleSheet } from 'react-native';

import DocumentCaptureScreen from '@/app/trip/[id]/document-capture';
import DocumentViewScreen from '@/app/trip/[id]/document-view';
import DocumentsScreen from '@/app/trip/[id]/documents';
import { DocumentCameraPermission } from '@/components/trip/document-camera-permission';
import { DocumentImage } from '@/components/trip/document-image';
import { DocumentsHeader } from '@/components/trip/documents-header';
import { DOCUMENT_CAPTURE_COPY } from '@/features/documents/document-copy';
import { Sentry } from '@/lib/sentry';
import { Palettes } from '@/theme';

import { asCss, mockThemeColors } from '../helpers/theme-colors';

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string | string[]> = { id: 'trip-42' };

jest.mock('expo-router', () => {
  const React = require('react') as typeof import('react');
  return {
    useRouter: () => ({ back: mockBack, replace: mockReplace, push: jest.fn() }),
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
  };
});

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

// The stand-in never attaches its ref, as a camera that has not started would not.
const mockCameraRender = jest.fn();

jest.mock('expo-camera', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  return {
    CameraView: function MockCameraView(props: Record<string, unknown>) {
      mockCameraRender(props);
      return React.createElement(View, { testID: 'camera-view' });
    },
    useCameraPermissions: () => [
      { granted: true, canAskAgain: true, status: 'granted' },
      jest.fn(),
      jest.fn(),
    ],
    scanFromURLAsync: jest.fn(async () => []),
  };
});

jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

let mockActive = true;
jest.mock('@/hooks/use-app-active', () => ({ useAppActive: () => mockActive }));

jest.mock('@/features/trips/use-trips', () => ({
  useTrip: () => ({ data: null, loading: false, error: null }),
}));

const mockStore = jest.fn();
const mockSyncTrip = jest.fn(async () => undefined);
const mockActions = { store: mockStore, syncTrip: mockSyncTrip };
let mockImage: { status: string; base64?: string } = { status: 'ready', base64: 'AAAA' };

jest.mock('@/features/documents/use-documents', () => ({
  useDocumentActions: () => mockActions,
  useDocumentImage: () => mockImage,
  useDocuments: () => ({ data: [], loading: false, error: null }),
  useDocument: () => ({ data: null, loading: false, error: null }),
}));

const pick = launchImageLibraryAsync as jest.Mock;

beforeEach(() => {
  mockBack.mockReset();
  mockReplace.mockReset();
  mockStore.mockReset();
  mockSyncTrip.mockClear();
  mockCameraRender.mockReset();
  (Sentry.captureException as jest.Mock).mockClear();
  mockParams = { id: 'trip-42' };
  mockActive = true;
  mockImage = { status: 'ready', base64: 'AAAA' };
  pick.mockReset();
});

describe('<DocumentCaptureScreen> — edges', () => {
  test('a library that will not open is said in words and reported, and the next try still works', async () => {
    const failure = new Error('permission revoked');
    pick.mockRejectedValueOnce(failure);
    await render(<DocumentCaptureScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('document-capture-library'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('document-capture-error')).toHaveTextContent(
        DOCUMENT_CAPTURE_COPY.libraryFailed,
      ),
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(failure);
    expect(mockStore).not.toHaveBeenCalled();

    pick.mockResolvedValueOnce({ canceled: true, assets: null });
    await act(async () => {
      fireEvent.press(screen.getByTestId('document-capture-library'));
    });
    expect(pick).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('document-capture-error')).toBeNull();
  });

  test('a camera that will not answer is said in words and reported, and nothing is stored', async () => {
    await render(<DocumentCaptureScreen />);
    await act(async () => {
      const props = mockCameraRender.mock.calls.at(-1)?.[0] as {
        onCameraReady: () => void;
      };
      props.onCameraReady();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('document-capture-shutter'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('document-scanner-error')).toHaveTextContent(
        DOCUMENT_CAPTURE_COPY.captureFailed,
      ),
    );
    expect(Sentry.captureException).toHaveBeenCalled();
    expect(mockStore).not.toHaveBeenCalled();
  });

  test('a trip id that arrives twice is the first one', async () => {
    mockParams = { id: ['trip-42', 'trip-99'] };
    pick.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///cache/pass.jpeg', width: 800, height: 600 }],
    });
    mockStore.mockResolvedValueOnce({ id: 'doc-1', type: 'boarding_pass' });
    await render(<DocumentCaptureScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('document-capture-library'));
    });

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        '/trip/trip-42/document-view?documentId=doc-1&review=1',
      ),
    );
  });

  test('Back leaves without storing anything', async () => {
    await render(<DocumentCaptureScreen />);

    await fireEvent.press(screen.getByLabelText('Back'));

    expect(mockBack).toHaveBeenCalled();
    expect(mockStore).not.toHaveBeenCalled();
  });
});

describe('<DocumentViewScreen> — edges', () => {
  test('a document id that arrives twice is the first; the viewer’s own bar still has the way back', async () => {
    mockParams = { id: 'trip-42', documentId: ['doc-1', 'doc-2'] };
    await render(<DocumentViewScreen />);

    expect(screen.getByText('This document isn’t on this device')).toBeTruthy();
    expect(screen.getByLabelText('Back')).toBeTruthy();
    expect(screen.queryByTestId('document-view-title')).toBeNull();
  });

  test('a document the store has not got is the empty state with no primary and no delete', async () => {
    await render(<DocumentViewScreen />);

    expect(screen.getByText('This document isn’t on this device')).toBeTruthy();
    expect(screen.queryByTestId('document-delete')).toBeNull();
    expect(screen.queryByLabelText('Try again')).toBeNull();
  });
});

describe('<DocumentsScreen> — edges', () => {
  test('a trip that is not on this device is not named, and its uploads are still retried', async () => {
    await render(<DocumentsScreen />);

    expect(screen.getByTestId('documents-title')).toHaveTextContent(/^Documents$/);
    expect(mockSyncTrip).toHaveBeenCalledWith('trip-42');
    expect(screen.getByTestId('documents-subtitle')).toHaveTextContent(/^0 documents$/);
  });

  test('uploads are not attempted while the app is away', async () => {
    mockActive = false;
    await render(<DocumentsScreen />);

    expect(mockSyncTrip).not.toHaveBeenCalled();
  });

  test('a trip id that arrives twice is the first one', async () => {
    mockParams = { id: ['trip-42', 'trip-99'] };
    await render(<DocumentsScreen />);

    expect(mockSyncTrip).toHaveBeenCalledWith('trip-42');
  });
});

describe('<DocumentCameraPermission> — edges', () => {
  test('Settings that will not open is reported, not thrown', async () => {
    const failure = new Error('no settings screen');
    jest.spyOn(Linking, 'openSettings').mockRejectedValueOnce(failure);
    await render(<DocumentCameraPermission canAskAgain={false} onAllow={jest.fn()} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('document-camera-settings'));
    });

    await waitFor(() => expect(Sentry.captureException).toHaveBeenCalledWith(failure));
  });
});

describe('<DocumentImage> — proportions', () => {
  const loaded = (width: number, height: number) => ({
    nativeEvent: { source: { width, height, uri: '' } },
  });
  const aspectRatio = () =>
    StyleSheet.flatten(screen.getByTestId('document-image').props.style).aspectRatio;

  test('a tall mobile pass is framed tall, not squeezed into a landscape box', async () => {
    await render(
      <DocumentImage
        documentId="d"
        path="p"
        description="A pass"
        kindLabel="Boarding pass"
      />,
    );
    expect(aspectRatio()).toBeCloseTo(4 / 3);

    await fireEvent(screen.getByTestId('document-image'), 'load', loaded(1170, 2532));

    expect(aspectRatio()).toBeCloseTo(1170 / 2532);
  });

  test('an absurd proportion is kept on screen, and a missing size keeps the default', async () => {
    await render(
      <DocumentImage
        documentId="d"
        path="p"
        description="A pass"
        kindLabel="Boarding pass"
      />,
    );

    await fireEvent(screen.getByTestId('document-image'), 'load', loaded(10, 1000));
    expect(aspectRatio()).toBeCloseTo(0.4);

    await fireEvent(screen.getByTestId('document-image'), 'load', loaded(4000, 100));
    expect(aspectRatio()).toBeCloseTo(2.5);

    await fireEvent(screen.getByTestId('document-image'), 'load', loaded(0, 0));
    expect(aspectRatio()).toBeCloseTo(4 / 3);
  });

  test('the picture is described for a screen reader', async () => {
    await render(
      <DocumentImage
        documentId="d"
        path="p"
        description="Picture of your pass"
        kindLabel="Boarding pass"
      />,
    );

    expect(screen.getByLabelText('Picture of your pass')).toBeTruthy();
  });
});

describe('<DocumentsHeader> — edges', () => {
  test('the privacy promise stands with or without a trip name; the title is "Documents" alone', async () => {
    await render(<DocumentsHeader tripTitle={null} count={null} />);

    expect(screen.getByTestId('documents-privacy')).toHaveTextContent(/Only you/);
    expect(screen.getByTestId('documents-title')).toHaveTextContent(/^Documents$/);
    expect(screen.queryByTestId('documents-subtitle')).toBeNull();

    await screen.rerender(<DocumentsHeader tripTitle="Rome" count={2} />);
    expect(screen.getByTestId('documents-title')).toHaveTextContent(/^Documents$/);
    expect(screen.getByTestId('documents-subtitle')).toHaveTextContent(
      'Rome · 2 documents',
    );
    expect(screen.getByTestId('documents-privacy')).toHaveTextContent(/Only you/);
  });

  test('the bar has Back, the "Only you" chip and the one pictured coming-soon control; nothing that sends a document', async () => {
    await render(<DocumentsHeader tripTitle={null} count={0} />);

    expect(screen.getByLabelText('Back')).toBeTruthy();
    expect(screen.getByTestId('privacy-chip')).toBeTruthy();
    expect(screen.getByTestId('coming-soon-documents-more')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByTestId('documents-add')).toBeNull();
  });
});

describe('<DocumentCameraPermission> — states', () => {
  test('each state names itself, says why in words, and has ONE way forward', async () => {
    await render(<DocumentCameraPermission canAskAgain onAllow={jest.fn()} />);
    expect(screen.getByText('Allow the camera')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByTestId('document-camera-settings')).toBeNull();

    await screen.rerender(
      <DocumentCameraPermission canAskAgain={false} onAllow={jest.fn()} />,
    );
    expect(screen.getByText('The camera is turned off')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByTestId('document-camera-allow')).toBeNull();
  });
});

describe('<DocumentImage> — states and frame', () => {
  test('opening, absent and unreadable are designed states with no picture and no way to take one out', async () => {
    mockImage = { status: 'opening' };
    await render(
      <DocumentImage
        documentId="d"
        path="p"
        description="A pass"
        kindLabel="Boarding pass"
      />,
    );
    expect(screen.getByLabelText('Opening the document')).toBeTruthy();

    mockImage = { status: 'absent' };
    await screen.rerender(
      <DocumentImage
        documentId="d"
        path="p"
        description="A pass"
        kindLabel="Boarding pass"
      />,
    );
    expect(screen.getByText('The image isn’t on this device')).toBeTruthy();

    mockImage = { status: 'unreadable' };
    await screen.rerender(
      <DocumentImage
        documentId="d"
        path="p"
        description="A pass"
        kindLabel="Boarding pass"
      />,
    );
    expect(screen.getByText('Couldn’t open this document')).toBeTruthy();
    expect(screen.queryByTestId('document-image')).toBeNull();
    expect(screen.queryAllByRole('button')).toEqual([]);
  });

  test('the picture sits on the white plate, contained, never cropped, with nothing over it', async () => {
    mockThemeColors('dark');
    await render(
      <DocumentImage
        documentId="d"
        path="p"
        description="A pass"
        kindLabel="Boarding pass"
      />,
    );

    expect(screen.getByTestId('document-image').props.resizeMode).toBe('contain');
    const plate = StyleSheet.flatten(screen.getByTestId('barcode-plate').props.style);
    expect(plate.backgroundColor).toBe(asCss(Palettes.dark.onPhoto));
    expect(plate.padding).toBeGreaterThanOrEqual(16);
    for (const key of ['boxShadow', 'shadowColor', 'opacity']) {
      expect(plate).not.toHaveProperty(key);
    }
  });
});
