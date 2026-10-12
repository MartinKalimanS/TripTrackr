/**
 * The trip photo gallery — `trip/[id]/photos` (tasks.md T117, restyled for Atlas by T442;
 * User Story 5, Acceptance Scenarios 1, 2, 6; FR-028, FR-030, FR-041; feature 002;
 * 004 FR-015, FR-021, FR-035, FR-037).
 *
 * The live hooks, the capture hook and the actions are mocked (their own
 * suites run them against a real database and the native fakes; the shared fixtures are
 * `photo-screen-harness.tsx`); the screen, its tiles and the photo view render for real.
 * Pinned here:
 *   - every state is designed: skeleton tiles while loading, an error with a retry that
 *     reads again, and an empty gallery whose words name the next action;
 *   - the grid shows local THUMBNAILS, never the full image (Acceptance 5.6);
 *   - a photo whose bytes have not arrived says "Waiting to upload" — visibly
 *     and to a screen reader — and a failed upload is distinct, with a retry;
 *   - the photo view shows the full image, when and where it was taken, where
 *     its bytes are, and files it under another of the trip's cities or none;
 *     a filing its own position contradicts is surfaced;
 *   - there is no share or public control anywhere (private by default);
 *   - the title and the way back are the navigator's (`trip/[id]/_layout.tsx`, whose suite
 *     is `photos-header.test.tsx`), so the screen draws no Back.
 *
 * What the restyle promises (emphasis, boundaries, nothing across a photograph, the
 * sources) is `photo-screen-atlas.test.tsx`.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import * as ExpoHaptics from 'expo-haptics';
import { AccessibilityInfo, Alert, Linking } from 'react-native';

import PhotosScreen from '@/app/trip/[id]/photos';
import type { PhotoWithPlace } from '@/db/repositories/photos';
import { Sentry } from '@/lib/sentry';

import { DOCUMENTS } from '../features/photo-fakes';
import {
  TRIP,
  failed,
  hidden,
  mockActions,
  mockCapture,
  mockPhotos,
  mockTrip,
  mockUploads,
  mockUsePhotos,
  pending,
  photo,
  readingOrder,
  resetPhotoScreen,
  styleOf,
  uploaded,
} from './photo-screen-harness';
import { anyGlyph } from '../helpers/icons';

// The screen asks the router for its params only: the title and Back belong to the
// navigator (`trip/[id]/_layout.tsx`), so a screen that reached for `useRouter` would fail.
const mockParams: { id: string | string[] | undefined } = { id: 'trip-42' };
jest.mock('expo-router', () => ({
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

jest.mock('@/features/trips/use-trips', () =>
  require('./photo-screen-harness').tripsModule(),
);
jest.mock('@/features/photos/use-photos', () =>
  require('./photo-screen-harness').photosModule(),
);
jest.mock('@/features/photos/use-capture', () =>
  require('./photo-screen-harness').captureModule(),
);

beforeEach(() => {
  mockParams.id = 'trip-42';
  resetPhotoScreen();
});

describe('<PhotosScreen> — states', () => {
  test('an empty gallery says what to do next, offers both ways in, and says photos are private', async () => {
    await render(<PhotosScreen />);

    expect(screen.getByText('No photos yet')).toBeTruthy();
    // The empty state names the next action in words; the two controls are the ones above.
    expect(screen.getByText(/Add photos from your library or take one/)).toBeTruthy();
    expect(screen.getByLabelText('Add photos from your library')).toBeTruthy();
    expect(screen.getByLabelText('Take a photo with the camera')).toBeTruthy();
    expect(screen.getByText('Private — only you can see your photos.')).toBeTruthy();
    // The drain of pending uploads is asked for, for this trip.
    expect(mockUploads).toHaveBeenCalledWith('trip-42');
  });

  test('the trip’s name is the first thing on the page; the native header says "Photos"', async () => {
    await render(<PhotosScreen />);

    expect(screen.getByTestId('photos-title')).toHaveTextContent('Italy, spring 2026');
    // "Photos" is the navigator's title (`_layout.tsx`): not drawn a second time here.
    expect(screen.queryByText('Photos')).toBeNull();
  });

  test('loading is skeleton tiles shaped like the grid, announced as ONE busy region, never the empty state', async () => {
    mockPhotos.loading = true;
    await render(<PhotosScreen />);

    const region = screen.getByLabelText('Loading photos');
    expect(region.props.accessibilityRole).toBe('progressbar');
    expect(screen.getAllByLabelText('Loading photos')).toHaveLength(1);
    expect(screen.queryByText('No photos yet')).toBeNull();
    expect(screen.queryByTestId(/^photo-tile-/)).toBeNull();
    expect(screen.getByTestId('photos-screen')).toBeTruthy();
  });

  test('the skeleton has the grid’s own number of tiles per row, so nothing reflows when photos arrive', async () => {
    mockPhotos.data = Array.from({ length: 8 }, (_, index) => photo(`${index}aaaaaaa`));
    await render(<PhotosScreen />);
    const first = screen.getByTestId(`photo-tile-${mockPhotos.data[0]!.id}`);
    const columns = (first.parent as unknown as { children: unknown[] }).children.length;
    expect(columns).toBeGreaterThanOrEqual(1);

    mockPhotos.data = [];
    mockPhotos.loading = true;
    await screen.rerender(<PhotosScreen />);
    const wrapper = screen.getByLabelText('Loading photos').children[0] as unknown as {
      children: { children: unknown[] }[];
    };
    expect(wrapper.children).toHaveLength(3);
    for (const row of wrapper.children) expect(row.children).toHaveLength(columns);
  });

  test('a store that did not answer says so in words and shows no stale tiles', async () => {
    mockPhotos.error = new Error('boom');
    mockPhotos.loading = true; // a failed live read never reports its first result
    mockPhotos.data = [uploaded];
    await render(<PhotosScreen />);

    expect(screen.getByText('Couldn’t read the photos')).toBeTruthy();
    expect(screen.getByText('The local store did not answer.')).toBeTruthy();
    expect(screen.queryByText('boom')).toBeNull();
    expect(screen.queryByLabelText('Loading photos')).toBeNull();
    expect(screen.queryByText('No photos yet')).toBeNull();
    expect(screen.queryByTestId(`photo-tile-${uploaded.id}`)).toBeNull();
  });

  test('the error offers "Try again", which reads the photos again (C4-10 rule 2)', async () => {
    mockPhotos.error = new Error('boom');
    await render(<PhotosScreen />);
    const reads = mockUsePhotos.mock.calls.length;

    // The store answers this time.
    mockPhotos.error = null;
    await fireEvent.press(screen.getByLabelText('Try again'));

    expect(mockUsePhotos.mock.calls.length).toBeGreaterThan(reads);
    expect(screen.queryByText('Couldn’t read the photos')).toBeNull();
    expect(screen.getByText('No photos yet')).toBeTruthy();
  });

  test('draws no Back of its own: the native header carries it (trip-layout.test.tsx)', async () => {
    await render(<PhotosScreen />);
    expect(screen.queryByLabelText('Back')).toBeNull();
    expect(screen.queryByText('Back')).toBeNull();
  });

  test('the controls and the note keep their reading order: title, add, take, the write error, the note', async () => {
    mockPhotos.data = [failed];
    mockActions.retryUpload.mockImplementationOnce(() => {
      throw new Error('disk I/O error');
    });
    await render(<PhotosScreen />);
    await fireEvent.press(screen.getByLabelText('Try uploading this photo again'));

    const order = readingOrder();
    const at = (needle: string) => order.indexOf(needle);
    expect(at('photos-title')).toBeGreaterThanOrEqual(0);
    expect(at('photos-title')).toBeLessThan(at('photos-add'));
    expect(at('photos-add')).toBeLessThan(at('photos-take'));
    expect(at('photos-take')).toBeLessThan(at('photos-write-error'));
    expect(at('photos-write-error')).toBeLessThan(
      at('Private — only you can see your photos.'),
    );
    expect(at('Private — only you can see your photos.')).toBeLessThan(
      at(`photo-tile-${failed.id}`),
    );
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
    // In words and with the alert icon, never colour alone (FR-025).
    expect(screen.getByTestId('photos-write-error').props.accessibilityRole).toBe(
      'alert',
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

  test('what a capture came to is said — a failure as an alert, with an icon as well as the words', async () => {
    mockCapture.message = { tone: 'info', text: '3 photos added.' };
    await render(<PhotosScreen />);
    expect(screen.getByTestId('photos-capture-message')).toHaveTextContent(
      '3 photos added.',
    );
    expect(
      screen.getByTestId('photos-capture-message').props.accessibilityLiveRegion,
    ).toBe('polite');
    expect(screen.queryByTestId('photos-capture-error')).toBeNull();

    mockCapture.message = {
      tone: 'error',
      text: 'There isn’t enough free space on this device. Free some space and try again.',
    };
    await screen.rerender(<PhotosScreen />);
    const error = screen.getByTestId('photos-capture-error');
    expect(error.props.accessibilityRole).toBe('alert');
    expect(error).toHaveTextContent(/enough free space/);
    expect(within(error).getByTestId(anyGlyph, hidden)).toBeTruthy();
    expect(screen.queryByTestId('photos-capture-message')).toBeNull();
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

  // T460 - FR-020: the destructive Button plays the warning as it is pressed; confirming the
  // deletion in the native question is a second, separate moment and plays it too.
  test('confirming the deletion plays the warning haptic, and the question alone does not', async () => {
    let destructive: (() => void) | undefined;
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      destructive = buttons?.find((button) => button.style === 'destructive')?.onPress;
    });
    const viewer = await openPhoto(uploaded);
    await fireEvent.press(within(viewer).getByLabelText('Delete this photo'));
    jest.mocked(ExpoHaptics).notificationAsync.mockClear();
    expect(mockActions.remove).not.toHaveBeenCalled();

    await act(async () => destructive?.());

    expect(mockActions.remove).toHaveBeenCalledWith(uploaded.id);
    expect(jest.mocked(ExpoHaptics).notificationAsync.mock.calls).toEqual([['warning']]);
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

  test('a trip that is not on this device leaves its name out; the header still says "Photos"', async () => {
    mockTrip.data = null;
    await render(<PhotosScreen />);
    expect(screen.queryByTestId('photos-title')).toBeNull();
    expect(screen.getByTestId('photos-add')).toBeTruthy();
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

    const said = await screen.findByText(
      'Settings couldn’t be opened. Open them from your home screen.',
    );
    expect(said).toBeTruthy();
    expect(Sentry.captureException).toHaveBeenCalled();
    // Said as an alert with the icon, like every other failure (FR-025).
    const alert = screen.getByTestId('photos-settings-error');
    expect(alert.props.accessibilityRole).toBe('alert');
    expect(within(alert).getByTestId(anyGlyph, hidden)).toBeTruthy();
  });

  test('the tile under a finger is ringed outside the picture and paints no fill (the held state itself is tappable.test.tsx)', async () => {
    mockPhotos.data = [uploaded];
    await render(<PhotosScreen />);
    const open = screen.getByTestId(`photo-open-${uploaded.id}`);
    const frameBefore = styleOf(screen.getByTestId(`photo-frame-${uploaded.id}`));
    expect(styleOf(open).outlineWidth).toBeUndefined();

    // What the responder system sends when a finger goes down on the tile.
    await fireEvent(open, 'responderGrant', {
      persist: jest.fn(),
      currentTarget: 1,
      nativeEvent: { touches: [{ pageX: 0, pageY: 0 }], changedTouches: [] },
    });

    expect(styleOf(open).outlineWidth).toBeGreaterThan(0);
    expect(styleOf(open).backgroundColor).toBeUndefined();
    // The ring is the control's; the picture's own frame does not change.
    expect(styleOf(screen.getByTestId(`photo-frame-${uploaded.id}`))).toEqual(
      frameBefore,
    );
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
