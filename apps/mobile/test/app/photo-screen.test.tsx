/**
 * The trip photo gallery — `trip/[id]/photos` (tasks.md T117; User Story 5,
 * Acceptance Scenarios 1, 2, 6; FR-028, FR-030, FR-041; feature 002).
 *
 * The live hooks, the capture hook and the actions are mocked (their own
 * suites run them against a real database and the native fakes); the screen,
 * its tiles and the photo view render for real. Pinned here:
 *   - every state is designed: loading, error, and an empty gallery inviting
 *     "Add photos" / "Take a photo";
 *   - the grid shows local THUMBNAILS, never the full image (Acceptance 5.6);
 *   - a photo whose bytes have not arrived says "Waiting to upload" — visibly
 *     and to a screen reader — and a failed upload is distinct, with a retry;
 *   - the photo view shows the full image, when and where it was taken, where
 *     its bytes are, and files it under another of the trip's cities or none;
 *     a filing its own position contradicts is surfaced;
 *   - there is no share or public control anywhere (private by default).
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, Alert, Linking, StyleSheet } from 'react-native';

import PhotosScreen from '@/app/trip/[id]/photos';
import type { PhotoWithPlace } from '@/db/repositories/photos';
import type { StopWithPlace } from '@/db/repositories/stops';
import type { TripRow } from '@/db/schema';
import type { CaptureMessage } from '@/features/photos/capture';
import { Sentry } from '@/lib/sentry';

import { DOCUMENTS } from '../features/photo-fakes';

const mockBack = jest.fn();
const mockParams: { id: string | string[] | undefined } = { id: 'trip-42' };
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('expo-file-system', () =>
  jest.requireActual('../features/photo-fakes').createFileSystemMock(),
);

// A View that carries every prop, so a test reads `source` and fires `onError`.
jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return {
    Image: (props: Record<string, unknown>) => React.createElement(Host, props),
  };
});

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const TRIP = '5e0c1d2a-3b4c-4d5e-8f90-a1b2c3d4e5f6';

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

const stop = (overrides: Partial<StopWithPlace>): StopWithPlace => ({
  id: 'stop-rome',
  trip_id: 'trip-42',
  city_id: 100,
  sort_order: 0,
  arrive_date: '2026-05-10',
  depart_date: '2026-05-12',
  created_at: 'x',
  updated_at: 'x',
  deleted_at: null,
  is_dirty: false,
  synced_at: 'x',
  city_name: 'Roma',
  country_id: 1,
  country_name: 'Italy',
  lat: 41.9028,
  lng: 12.4964,
  ...overrides,
});

const mockTrip = { data: trip as TripRow | null, loading: false, error: null };
const mockStops = {
  data: [
    stop({}),
    stop({
      id: 'stop-florence',
      city_id: 101,
      city_name: 'Firenze',
      lat: 43.7696,
      lng: 11.2558,
    }),
  ],
  loading: false,
  error: null,
};
jest.mock('@/features/trips/use-trips', () => ({
  useTrip: () => mockTrip,
  useTripStops: () => mockStops,
}));

const mockPhotos = {
  data: [] as PhotoWithPlace[],
  loading: false,
  error: null as Error | null,
};
const mockActions = {
  refile: jest.fn(),
  remove: jest.fn(),
  retryUpload: jest.fn(),
};
const mockUploads = jest.fn();
jest.mock('@/features/photos/use-photos', () => ({
  usePhotos: () => mockPhotos,
  usePhotoActions: () => mockActions,
  usePhotoUploads: (tripId: string) => mockUploads(tripId),
}));

const mockCapture = {
  busy: false,
  message: null as CaptureMessage | null,
  clearMessage: jest.fn(),
  addFromLibrary: jest.fn(async () => undefined),
  takePhoto: jest.fn(async () => undefined),
};
jest.mock('@/features/photos/use-capture', () => ({
  useCapture: () => mockCapture,
}));

function photo(id: string, overrides: Partial<PhotoWithPlace> = {}): PhotoWithPlace {
  const photoId = `${id.padEnd(8, '0').slice(0, 8)}-1111-4111-8111-111111111111`;
  return {
    id: photoId,
    trip_id: 'trip-42',
    city_id: 100,
    taken_at: '2026-05-12T16:30:05.000Z',
    exif_lat: 41.8986,
    exif_lng: 12.4769,
    is_public: false,
    upload_state: 'uploaded',
    moderation_state: 'pending',
    has_thumbnail: false,
    created_at: '2026-06-01T10:00:00.000Z',
    updated_at: '2026-06-01T10:00:00.000Z',
    deleted_at: null,
    is_dirty: false,
    synced_at: '2026-06-01T10:00:00.000Z',
    local_file_uri: `photos/${TRIP}/${photoId}.jpg`,
    city_name: 'Roma',
    country_name: 'Italy',
    city_lat: 41.9028,
    city_lng: 12.4964,
    city_timezone: 'Europe/Rome',
    ...overrides,
  };
}

const pending = photo('aaaaaaaa', {
  upload_state: 'pending',
  is_dirty: true,
  synced_at: null,
});
const failed = photo('bbbbbbbb', {
  upload_state: 'failed',
  is_dirty: true,
  synced_at: null,
});
const uploaded = photo('cccccccc');

beforeEach(() => {
  mockParams.id = 'trip-42';
  mockTrip.data = trip;
  mockPhotos.data = [];
  mockPhotos.loading = false;
  mockPhotos.error = null;
  mockCapture.busy = false;
  mockCapture.message = null;
  mockActions.refile.mockReset();
  mockActions.remove.mockReset();
  mockActions.retryUpload.mockReset();
});

describe('<PhotosScreen> — states', () => {
  test('an empty gallery invites the traveller to add or take photos, and says they are private', async () => {
    await render(<PhotosScreen />);

    expect(screen.getByTestId('photos-title')).toHaveTextContent(
      'Photos · Italy, spring 2026',
    );
    expect(screen.getByText('No photos yet')).toBeTruthy();
    expect(screen.getByText(/Add photos from your library or take one/)).toBeTruthy();
    expect(screen.getByLabelText('Add photos from your library')).toBeTruthy();
    expect(screen.getByLabelText('Take a photo with the camera')).toBeTruthy();
    expect(screen.getByText('Private — only you can see your photos.')).toBeTruthy();
    // The drain of pending uploads is asked for, for this trip.
    expect(mockUploads).toHaveBeenCalledWith('trip-42');
  });

  test('loading and a store that did not answer are designed states, not blanks', async () => {
    mockPhotos.loading = true;
    await render(<PhotosScreen />);
    expect(screen.getByText('Loading photos')).toBeTruthy();

    mockPhotos.loading = false;
    mockPhotos.error = new Error('boom');
    await screen.rerender(<PhotosScreen />);
    expect(screen.getByText('Couldn’t read the photos')).toBeTruthy();
  });

  test('Back leaves the gallery', async () => {
    await render(<PhotosScreen />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('<PhotosScreen> — the grid (Acceptance 5.1, 5.6; FR-041)', () => {
  test('draws each photo from its local thumbnail, never the full image', async () => {
    mockPhotos.data = [pending, failed, uploaded];
    await render(<PhotosScreen />);

    for (const shown of [pending, failed, uploaded]) {
      const image = screen.getByTestId(`photo-thumbnail-${shown.id}`);
      expect(image.props.source).toEqual({
        uri: `${DOCUMENTS}/photos/${TRIP}/${shown.id}.thumb.jpg`,
      });
      expect(image.props.recyclingKey).toBe(shown.id);
    }
  });

  test('a photo waiting for its bytes says so, visibly and to a screen reader', async () => {
    mockPhotos.data = [pending];
    await render(<PhotosScreen />);

    const tile = screen.getByTestId(`photo-tile-${pending.id}`);
    expect(within(tile).getByText('Waiting to upload')).toBeTruthy();
    expect(screen.getByTestId(`photo-open-${pending.id}`).props.accessibilityLabel).toBe(
      'Photo taken 12 May 2026, filed under Roma, Italy. Waiting to upload — saved on this device only.',
    );
  });

  test('a failed upload is distinct, and its retry reaches the queue', async () => {
    mockPhotos.data = [failed];
    await render(<PhotosScreen />);

    const tile = screen.getByTestId(`photo-tile-${failed.id}`);
    expect(within(tile).getByText('Upload failed')).toBeTruthy();
    expect(within(tile).queryByText('Waiting to upload')).toBeNull();
    const retry = screen.getByLabelText('Try uploading this photo again');
    await fireEvent.press(retry);
    expect(mockActions.retryUpload).toHaveBeenCalledWith(failed.id);
  });

  test('an uploaded photo carries no badge', async () => {
    mockPhotos.data = [uploaded];
    await render(<PhotosScreen />);

    const tile = screen.getByTestId(`photo-tile-${uploaded.id}`);
    expect(within(tile).queryByText('Waiting to upload')).toBeNull();
    expect(within(tile).queryByText('Upload failed')).toBeNull();
    expect(screen.getByTestId(`photo-open-${uploaded.id}`).props.accessibilityLabel).toBe(
      'Photo taken 12 May 2026, filed under Roma, Italy.',
    );
  });

  test('a photo with no file on this device, or one that fails to draw, shows a placeholder', async () => {
    const elsewhere = photo('dddddddd', { local_file_uri: null });
    mockPhotos.data = [elsewhere, uploaded];
    await render(<PhotosScreen />);

    expect(
      within(screen.getByTestId(`photo-tile-${elsewhere.id}`)).getByText('No preview'),
    ).toBeTruthy();

    await act(async () => {
      fireEvent(screen.getByTestId(`photo-thumbnail-${uploaded.id}`), 'error', {
        error: 'decode failed',
      });
    });
    expect(
      within(screen.getByTestId(`photo-tile-${uploaded.id}`)).getByText('No preview'),
    ).toBeTruthy();
  });

  test('a failed local write is shown, never swallowed', async () => {
    mockPhotos.data = [failed];
    mockActions.retryUpload.mockImplementationOnce(() => {
      throw new Error('disk I/O error');
    });
    await render(<PhotosScreen />);

    await fireEvent.press(screen.getByLabelText('Try uploading this photo again'));

    expect(screen.getByTestId('photos-write-error')).toHaveTextContent(
      'That change couldn’t be saved on this device. Please try again.',
    );
  });
});

describe('<PhotosScreen> — adding photos (Acceptance 5.1, 5.2)', () => {
  test('“Add photos” opens the library and “Take a photo” the camera', async () => {
    await render(<PhotosScreen />);

    await fireEvent.press(screen.getByLabelText('Add photos from your library'));
    expect(mockCapture.addFromLibrary).toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('Take a photo with the camera'));
    expect(mockCapture.takePhoto).toHaveBeenCalled();
  });

  test('while a capture runs both buttons are announced busy', async () => {
    mockCapture.busy = true;
    await render(<PhotosScreen />);

    expect(
      screen.getByLabelText('Add photos from your library').props.accessibilityState,
    ).toMatchObject({ busy: true });
    expect(
      screen.getByLabelText('Take a photo with the camera').props.accessibilityState,
    ).toMatchObject({ busy: true });
  });

  test('what a capture came to is said — a failure as an alert', async () => {
    mockCapture.message = { tone: 'info', text: '3 photos added.' };
    await render(<PhotosScreen />);
    expect(screen.getByTestId('photos-capture-message')).toHaveTextContent(
      '3 photos added.',
    );

    mockCapture.message = {
      tone: 'error',
      text: 'There isn’t enough free space on this device. Free some space and try again.',
    };
    await screen.rerender(<PhotosScreen />);
    expect(screen.getByTestId('photos-capture-error').props.accessibilityRole).toBe(
      'alert',
    );
  });

  test('a camera refusal the system will not ask again offers Settings', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    mockCapture.message = {
      tone: 'error',
      text: 'Camera access is turned off for TripTrackr. You can turn it on in Settings.',
      openSettings: true,
    };
    await render(<PhotosScreen />);

    await fireEvent.press(screen.getByLabelText('Open Settings'));
    expect(openSettings).toHaveBeenCalled();
  });
});

describe('<PhotosScreen> — the photo view', () => {
  async function openPhoto(shown: PhotoWithPlace) {
    mockPhotos.data = [shown];
    await render(<PhotosScreen />);
    await fireEvent.press(screen.getByTestId(`photo-open-${shown.id}`));
    return screen.getByTestId('photo-viewer');
  }

  test('shows the full image, when and where it was taken, and that it is private', async () => {
    const viewer = await openPhoto(uploaded);

    expect(within(viewer).getByTestId('photo-viewer-image').props.source).toEqual({
      uri: `${DOCUMENTS}/photos/${TRIP}/${uploaded.id}.jpg`,
    });
    expect(within(viewer).getByText('Taken 12 May 2026, 18:30 (Roma time)')).toBeTruthy();
    expect(within(viewer).getByTestId('photo-viewer-place')).toHaveTextContent(
      'Filed under Roma, Italy',
    );
    expect(within(viewer).getByText('Uploaded to your account.')).toBeTruthy();
    expect(
      within(viewer).getByText('Private — only you can see your photos.'),
    ).toBeTruthy();
    // Private by default: nothing offers to share or publish (User Story 7).
    expect(within(viewer).queryByLabelText(/share|public/i)).toBeNull();
    expect(within(viewer).queryByText(/share|make public/i)).toBeNull();
  });

  test('a pending photo is not presented as saved (FR-041)', async () => {
    const viewer = await openPhoto(pending);

    expect(within(viewer).getByText('Waiting to upload')).toBeTruthy();
    expect(
      within(viewer).getByText(
        'Saved on this device only. It uploads when you’re online.',
      ),
    ).toBeTruthy();
  });

  test('refiling under another city, or none, goes through the local write', async () => {
    const viewer = await openPhoto(uploaded);

    expect(
      within(viewer).getByTestId('photo-file-city:100').props.accessibilityState,
    ).toMatchObject({ selected: true });
    await fireEvent.press(within(viewer).getByTestId('photo-file-city:101'));
    expect(mockActions.refile).toHaveBeenCalledWith(uploaded.id, 101);

    await fireEvent.press(within(viewer).getByTestId('photo-file-none'));
    expect(mockActions.refile).toHaveBeenCalledWith(uploaded.id, null);
  });

  test('a refile that cannot be saved says so inside the view', async () => {
    mockActions.refile.mockImplementationOnce(() => {
      throw new Error('disk I/O error');
    });
    const viewer = await openPhoto(uploaded);

    await fireEvent.press(within(viewer).getByTestId('photo-file-city:101'));

    expect(within(viewer).getByTestId('photo-viewer-error')).toHaveTextContent(
      'That change couldn’t be saved on this device. Please try again.',
    );
  });

  test('a filing its own position contradicts is surfaced, not corrected', async () => {
    const viewer = await openPhoto(
      photo('eeeeeeee', {
        city_id: 101,
        city_name: 'Firenze',
        city_lat: 43.7696,
        city_lng: 11.2558,
      }),
    );

    expect(within(viewer).getByTestId('photo-viewer-mismatch')).toHaveTextContent(
      /taken about 23\d km from Firenze/,
    );
  });

  test('a failed upload can be retried from the view', async () => {
    const viewer = await openPhoto(failed);

    expect(
      within(viewer).getByText(
        'This photo couldn’t be uploaded. Try again, or delete it and add it again.',
      ),
    ).toBeTruthy();
    await fireEvent.press(
      within(viewer).getByLabelText('Try uploading this photo again'),
    );
    expect(mockActions.retryUpload).toHaveBeenCalledWith(failed.id);
  });

  test('delete asks first, then removes the photo and closes the view', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });
    const viewer = await openPhoto(uploaded);

    await fireEvent.press(within(viewer).getByLabelText('Delete this photo'));

    expect(Alert.alert).toHaveBeenCalled();
    expect(mockActions.remove).toHaveBeenCalledWith(uploaded.id);
    expect(screen.queryByTestId('photo-viewer')).toBeNull();
  });

  test('a photo with no file here says where it is instead of drawing nothing', async () => {
    const viewer = await openPhoto(photo('ffffffff', { local_file_uri: null }));

    expect(
      within(viewer).getByText('This photo isn’t stored on this device.'),
    ).toBeTruthy();
    expect(within(viewer).queryByTestId('photo-viewer-image')).toBeNull();
  });

  test('Close returns to the grid', async () => {
    await openPhoto(uploaded);
    await fireEvent.press(screen.getByLabelText('Close photo'));
    expect(screen.queryByTestId('photo-viewer')).toBeNull();
  });
});

/**
 * Edges the states above do not reach: the route parameter's shapes, the
 * notice's own controls, a full image that will not draw, an unfiled photo,
 * and the ring that says which tile has focus.
 */
describe('<PhotosScreen> — edges', () => {
  const confirmDeletes = () =>
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });

  test('the trip is the first of a repeated segment; none at all is an empty id', async () => {
    mockParams.id = ['trip-42', 'trip-43'];
    await render(<PhotosScreen />);
    expect(mockUploads).toHaveBeenLastCalledWith('trip-42');

    mockParams.id = undefined;
    await screen.rerender(<PhotosScreen />);
    expect(mockUploads).toHaveBeenLastCalledWith('');
  });

  test('a trip that is not on this device leaves the title plain', async () => {
    mockTrip.data = null;
    await render(<PhotosScreen />);
    expect(screen.getByTestId('photos-title')).toHaveTextContent(/^Photos$/);
  });

  test('a capture message can be dismissed', async () => {
    mockCapture.message = { tone: 'info', text: '3 photos added.' };
    await render(<PhotosScreen />);

    await fireEvent.press(screen.getByLabelText('Dismiss this message'));

    expect(mockCapture.clearMessage).toHaveBeenCalled();
  });

  test('Settings that cannot be opened are said, and reported', async () => {
    jest.spyOn(Linking, 'openSettings').mockRejectedValue(new Error('no settings app'));
    mockCapture.message = {
      tone: 'error',
      text: 'Camera access is turned off for TripTrackr. You can turn it on in Settings.',
      openSettings: true,
    };
    await render(<PhotosScreen />);

    await fireEvent.press(screen.getByLabelText('Open Settings'));

    expect(
      await screen.findByText(
        'Settings couldn’t be opened. Open them from your home screen.',
      ),
    ).toBeTruthy();
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  test('the tile with focus or under a finger is ringed, and only while it is', async () => {
    mockPhotos.data = [uploaded];
    await render(<PhotosScreen />);
    const open = screen.getByTestId(`photo-open-${uploaded.id}`);
    const borderWidth = () =>
      StyleSheet.flatten(screen.getByTestId(`photo-frame-${uploaded.id}`).props.style)
        .borderWidth;
    expect(borderWidth()).toBe(StyleSheet.hairlineWidth);

    await fireEvent(open, 'focus');
    expect(borderWidth()).toBeGreaterThan(StyleSheet.hairlineWidth);
    await fireEvent(open, 'blur');
    expect(borderWidth()).toBe(StyleSheet.hairlineWidth);

    await fireEvent(open, 'pressIn');
    expect(borderWidth()).toBeGreaterThan(StyleSheet.hairlineWidth);
    await fireEvent(open, 'pressOut');
    expect(borderWidth()).toBe(StyleSheet.hairlineWidth);
  });

  test('a full image that will not draw says so instead of leaving a blank', async () => {
    mockPhotos.data = [uploaded];
    await render(<PhotosScreen />);
    await fireEvent.press(screen.getByTestId(`photo-open-${uploaded.id}`));
    const viewer = screen.getByTestId('photo-viewer');

    await act(async () => {
      fireEvent(within(viewer).getByTestId('photo-viewer-image'), 'error', {
        error: 'decode failed',
      });
    });

    expect(
      within(viewer).getByText(
        'This photo couldn’t be shown. Its file on this device may be damaged.',
      ),
    ).toBeTruthy();
    expect(within(viewer).queryByTestId('photo-viewer-image')).toBeNull();
  });

  test('a photo filed under no city says so, and No city is the one chosen', async () => {
    mockPhotos.data = [
      photo('99999999', {
        city_id: null,
        city_name: null,
        country_name: null,
        city_lat: null,
        city_lng: null,
        city_timezone: null,
      }),
    ];
    await render(<PhotosScreen />);
    await fireEvent.press(screen.getByLabelText(/not filed under a city/));
    const viewer = screen.getByTestId('photo-viewer');

    expect(within(viewer).getByTestId('photo-viewer-place')).toHaveTextContent(
      'Not filed under a city',
    );
    expect(
      within(viewer).getByTestId('photo-file-none').props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(within(viewer).queryByTestId('photo-viewer-mismatch')).toBeNull();
  });

  test('choosing the filing a photo already has writes nothing', async () => {
    mockPhotos.data = [uploaded];
    await render(<PhotosScreen />);
    await fireEvent.press(screen.getByTestId(`photo-open-${uploaded.id}`));

    await fireEvent.press(
      within(screen.getByTestId('photo-viewer')).getByTestId('photo-file-city:100'),
    );

    expect(mockActions.refile).not.toHaveBeenCalled();
  });

  test('a delete that cannot be saved keeps the view open and says so', async () => {
    confirmDeletes();
    mockActions.remove.mockImplementationOnce(() => {
      throw new Error('disk I/O error');
    });
    mockPhotos.data = [uploaded];
    await render(<PhotosScreen />);
    await fireEvent.press(screen.getByTestId(`photo-open-${uploaded.id}`));
    const viewer = screen.getByTestId('photo-viewer');

    await fireEvent.press(within(viewer).getByLabelText('Delete this photo'));

    expect(within(viewer).getByTestId('photo-viewer-error')).toHaveTextContent(
      'That change couldn’t be saved on this device. Please try again.',
    );
    expect(screen.getByTestId('photo-viewer')).toBeTruthy();
  });

  test('with reduced motion the photo view does not animate in (feature 002 FR-015)', async () => {
    const reduced = jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    mockPhotos.data = [uploaded];
    await render(<PhotosScreen />);
    await fireEvent.press(screen.getByTestId(`photo-open-${uploaded.id}`));
    await act(async () => undefined);

    expect(screen.getByTestId('photo-viewer-modal').props.animationType).toBe('none');
    reduced.mockRestore();
  });

  test('a photo that is deleted while it is open closes its own view', async () => {
    mockPhotos.data = [uploaded];
    await render(<PhotosScreen />);
    await fireEvent.press(screen.getByTestId(`photo-open-${uploaded.id}`));
    expect(screen.getByTestId('photo-viewer')).toBeTruthy();

    mockPhotos.data = [];
    await screen.rerender(<PhotosScreen />);

    expect(screen.queryByTestId('photo-viewer')).toBeNull();
  });
});
