/**
 * T559 - the camera denial screens, designed to one standard (FR-066; contract C5-28
 * `PermissionState`; research D5-14): an icon, what is off, what to do about it, "Open
 * Settings" (`Linking.openSettings`), and exactly ONE primary action in the state. Both places
 * the camera can be refused are pinned: the document camera (a screen state: no shutter until
 * the camera is allowed) and the gallery's "Take a photo" (a notice under the header: the
 * screen's own primary is "Add photos").
 *
 * The photo library has no denial to design: the system picker is itself the grant (research
 * D-34; `app.config.ts` blocks the storage and media permissions), so no photographs permission
 * is ever asked for or refused.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { DocumentCameraPermission } from '@/components/trip/document-camera-permission';
import { PhotosHeader } from '@/components/trip/photos-header';
import { DOCUMENT_CAPTURE_COPY } from '@/features/documents/document-copy';
import type { CaptureMessage } from '@/features/photos/capture';
import { PHOTO_COPY } from '@/features/photos/photo-copy';
import type { PhotoCapture } from '@/features/photos/use-capture';

import { anyGlyph, glyphsIn } from '../helpers/icons';
import { deadControls, pressableCount } from '../helpers/dead-controls';

jest.mock('@/hooks/use-appearance');
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true }),
}));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};

beforeEach(() => {
  const { appearance } = jest.requireActual('../helpers/appearance') as {
    appearance: () => unknown;
  };
  useAppearance.mockReturnValue(appearance());
});
afterEach(() => jest.restoreAllMocks());

const hidden = { includeHiddenElements: true };

/** The buttons on screen drawn as the primary: FR-005 allows one per screen state. */
const primaries = () =>
  screen
    .getAllByRole('button')
    .filter((button) => button.props.variant === 'primary')
    .map((button) => String(button.props.accessibilityLabel));

describe('the document camera: refused for good', () => {
  const renderDenied = () =>
    render(<DocumentCameraPermission canAskAgain={false} onAllow={jest.fn()} />);

  it('says what is off and what to do, with a camera glyph in a roundel', async () => {
    await renderDenied();
    expect(screen.getByText('The camera is turned off')).toBeTruthy();
    expect(screen.getByTestId('document-camera-permission')).toHaveTextContent(
      DOCUMENT_CAPTURE_COPY.cameraDenied,
    );
    expect(glyphsIn().map((glyph) => glyph.name)).toEqual(['camera']);
    expect(screen.queryByTestId(anyGlyph)).toBeNull();
    expect(screen.getByTestId('document-camera-denied-icon', hidden)).toBeTruthy();
  });

  it('Open Settings opens the app\u2019s page in Settings and is the ONE primary', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await renderDenied();

    const settings = screen.getByTestId('document-camera-settings');
    expect(settings).toBe(screen.getByLabelText('Open Settings'));
    expect(primaries()).toEqual(['Open Settings']);

    await fireEvent.press(settings);
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('is a polite live region, so a screen reader hears the camera turn off', async () => {
    await renderDenied();
    expect(
      screen.getByTestId('document-camera-denied').props.accessibilityLiveRegion,
    ).toBe('polite');
  });

  it('has no control that does nothing', async () => {
    await renderDenied();
    expect(pressableCount()).toBe(1);
    expect(deadControls()).toEqual([]);
  });
});

describe('the document camera: not yet allowed', () => {
  it('has "Allow camera" as its ONE primary and no control that does nothing', async () => {
    const onAllow = jest.fn();
    await render(<DocumentCameraPermission canAskAgain onAllow={onAllow} />);

    expect(primaries()).toEqual(['Allow camera']);
    expect(deadControls()).toEqual([]);
    await fireEvent.press(screen.getByTestId('document-camera-allow'));
    expect(onAllow).toHaveBeenCalledTimes(1);
  });
});

describe('the gallery: the camera is refused for good', () => {
  const capture = (message: CaptureMessage | null): PhotoCapture => ({
    busy: false,
    message,
    clearMessage: jest.fn(),
    addFromLibrary: jest.fn(),
    takePhoto: jest.fn(),
  });
  const blocked: CaptureMessage = {
    tone: 'error',
    text: PHOTO_COPY.cameraBlocked,
    openSettings: true,
  };

  const renderHeader = (message: CaptureMessage | null, clearMessage = jest.fn()) =>
    render(
      <PhotosHeader
        tripTitle="Rome"
        count={0}
        summary={null}
        capture={{ ...capture(message), clearMessage }}
        writeError={null}
        onRetryFailed={jest.fn()}
      />,
    );

  it('says what is off and what to do, in the same state as every refusal', async () => {
    await renderHeader(blocked);
    expect(screen.getByText('Camera access is off')).toBeTruthy();
    expect(screen.getByTestId('photos-capture-error')).toHaveTextContent(
      PHOTO_COPY.cameraBlocked,
    );
    expect(screen.getByTestId('photos-camera-denied-icon', hidden)).toBeTruthy();
    expect(screen.getByTestId('photos-camera-denied').props.accessibilityLiveRegion).toBe(
      'polite',
    );
  });

  it('Open Settings is a secondary beside a text Dismiss, and no primary: "Add photos" is the screen\u2019s', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    const clearMessage = jest.fn();
    await renderHeader(blocked, clearMessage);

    const settings = screen.getByLabelText('Open Settings');
    expect(settings.props.variant).toBe('secondary');
    expect(screen.getByLabelText('Dismiss this message').props.variant).toBe('ghost');
    expect(
      screen.queryAllByRole('button').filter((b) => b.props.variant === 'primary'),
    ).toHaveLength(0);

    await fireEvent.press(settings);
    expect(openSettings).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByLabelText('Dismiss this message'));
    expect(clearMessage).toHaveBeenCalledTimes(1);
  });

  it('says in words when Settings cannot be opened', async () => {
    jest.spyOn(Linking, 'openSettings').mockRejectedValue(new Error('no settings app'));
    await renderHeader(blocked);

    await fireEvent.press(screen.getByLabelText('Open Settings'));

    expect(await screen.findByTestId('photos-settings-error')).toHaveTextContent(
      PHOTO_COPY.settingsUnavailable,
    );
  });

  it('has no control that does nothing', async () => {
    await renderHeader(blocked);
    expect(pressableCount()).toBeGreaterThan(3);
    expect(deadControls()).toEqual([]);
  });

  it('a refusal the system will ask about again stays a plain notice with Dismiss', async () => {
    await renderHeader({ tone: 'error', text: PHOTO_COPY.cameraDeclined });
    expect(screen.queryByTestId('photos-camera-denied')).toBeNull();
    expect(screen.getByTestId('photos-capture-error')).toHaveTextContent(
      PHOTO_COPY.cameraDeclined,
    );
    expect(screen.queryByLabelText('Open Settings')).toBeNull();
    expect(screen.getByLabelText('Dismiss this message')).toBeTruthy();
  });
});
