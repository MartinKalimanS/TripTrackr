/**
 * Adding photos on the gallery screen, end to end — spec 006 T609 (User Stories 1 to 3; FR-001
 * to FR-009, FR-015; SC-001, SC-002): the "Add photos" button, the library permission, the
 * system picker, the "who can see these photos?" sheet and the grid.
 *
 * `trip/[id]/photos` renders for real over a real SQLite database, with the real live queries,
 * the real `useCapture` and the real sheet; only the platform is faked: the picker, the
 * library-permission module, the file system and image manipulator, the router and the image
 * view. What is pinned: the picker opens only after the permission allows it; the sheet appears
 * before anything is written; Add, with Public chosen or not, and every dismissal put the photos
 * in the grid with the right `is_public`; a refusal is the notice with its one action and the
 * gallery stays usable; the camera path asks the same question.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { Linking } from 'react-native';

import PhotosScreen from '@/app/trip/[id]/photos';
import { DatabaseProvider } from '@/db/client';
import { tripsRepository } from '@/db/repositories/trips';
import { photos } from '@/db/schema';
import {
  checkLibraryAccess,
  requestLibraryAccess,
} from '@/features/photos/library-permission';
import { kickUploadQueue } from '@/sync/upload-queue';

import { createTestDatabase, type TestSqlite } from '../db/sqlite-harness';
import {
  CACHE,
  type FileSystemMock,
  type ManipulatorMock,
} from '../features/photo-fakes';

const mockParams: { id: string } = { id: '' };
jest.mock('expo-router', () => {
  const { useEffect } = require('react') as typeof import('react');
  return {
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
    useRouter: () => ({
      back: jest.fn(),
      canGoBack: () => true,
      replace: jest.fn(),
      push: jest.fn(),
    }),
  };
});
jest.mock('expo-file-system', () =>
  jest.requireActual('../features/photo-fakes').createFileSystemMock(),
);
jest.mock('expo-image-manipulator', () =>
  jest.requireActual('../features/photo-fakes').createManipulatorMock(),
);
jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return { Image: (props: Record<string, unknown>) => React.createElement(Host, props) };
});
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));
jest.mock('@/features/photos/library-permission', () => ({
  checkLibraryAccess: jest.fn(),
  requestLibraryAccess: jest.fn(),
}));
jest.mock('@/hooks/use-app-active', () => ({ useAppActive: () => true }));
jest.mock('@/sync/upload-queue', () => ({
  kickUploadQueue: jest.fn(async () => undefined),
}));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const { __fs } = jest.requireMock('expo-file-system') as FileSystemMock;
const { __manipulator } = jest.requireMock('expo-image-manipulator') as ManipulatorMock;
const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;
const check = checkLibraryAccess as jest.Mock;
const request = requestLibraryAccess as jest.Mock;

const hidden = { includeHiddenElements: true };

let sqlite: TestSqlite;

function asset(name: string): ImagePicker.ImagePickerAsset {
  const uri = `${CACHE}/ImagePicker/${name}.jpg`;
  __fs.write(uri, 3_000_000);
  __manipulator.images.set(uri, { width: 4032, height: 3024 });
  return { uri, width: 4032, height: 3024, exif: null, type: 'image' };
}

function libraryReturns(...names: string[]) {
  picker.launchImageLibraryAsync.mockResolvedValueOnce({
    canceled: false,
    assets: names.map(asset),
  });
}

const rows = () => sqlite.db.select().from(photos).all();

async function openGallery() {
  return render(
    <DatabaseProvider value={sqlite.db}>
      <PhotosScreen />
    </DatabaseProvider>,
  );
}

const sheetIsOpen = () => screen.queryByTestId('photo-visibility-sheet', hidden) !== null;
const thumbnails = () => screen.queryAllByTestId(/^photo-thumbnail-/, hidden);

/**
 * The store reports a write to its live queries through the device's update hook; Jest has none,
 * so the suite fires it (test/db/sqlite-harness.ts) once the photos are written.
 */
async function gridShows(count: number) {
  await waitFor(() => expect(rows()).toHaveLength(count));
  await act(async () => sqlite.emitChange('photos'));
  await waitFor(() => expect(thumbnails()).toHaveLength(count));
}

beforeEach(async () => {
  __fs.reset();
  __manipulator.reset();
  check.mockReset().mockResolvedValue({ state: 'granted' });
  request.mockReset().mockResolvedValue({ state: 'granted' });
  sqlite = await createTestDatabase();
  mockParams.id = tripsRepository.create(sqlite.db, {
    id: randomUUID(),
    title: 'Italy',
    home_currency: 'EUR',
  }).id;
});

afterEach(() => {
  jest.restoreAllMocks();
  sqlite.close();
});

describe('Add photos: permission, picker, sheet, grid', () => {
  test('asks for the library, opens the picker, asks who can see the photos, then fills the grid', async () => {
    check.mockResolvedValue({ state: 'undetermined' });
    libraryReturns('a', 'b');
    await openGallery();
    expect(thumbnails()).toHaveLength(0);

    await fireEvent.press(await screen.findByTestId('photos-add'));

    // The sheet is up and nothing is written yet.
    expect(await screen.findByText('Who can see these photos?')).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(1);
    expect(picker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
    expect(rows()).toEqual([]);
    expect(
      screen.getByTestId('photo-visibility-confirm', hidden).props.accessibilityLabel,
    ).toBe('Add 2 photos');
    expect(
      screen.getByTestId('photo-visibility-private', hidden).props.accessibilityState,
    ).toMatchObject({
      checked: true,
    });

    await fireEvent.press(screen.getByTestId('photo-visibility-confirm', hidden));

    await gridShows(2);
    expect(sheetIsOpen()).toBe(false);
    expect(rows().map((row) => row.is_public)).toEqual([false, false]);
    expect(screen.getByTestId('photos-capture-message')).toHaveTextContent(
      '2 photos added.',
    );
    expect(kickUploadQueue).toHaveBeenCalledWith('capture');
  });

  test('Public chosen: the photos reach the grid and are stored public', async () => {
    libraryReturns('a', 'b', 'c');
    await openGallery();

    await fireEvent.press(await screen.findByTestId('photos-add'));
    await screen.findByText('Who can see these photos?');
    await fireEvent.press(screen.getByTestId('photo-visibility-public', hidden));
    await fireEvent.press(screen.getByTestId('photo-visibility-confirm', hidden));

    await gridShows(3);
    expect(rows().map((row) => row.is_public)).toEqual([true, true, true]);
  });

  test.each([
    [
      'Close',
      () => fireEvent.press(screen.getByTestId('photo-visibility-cancel', hidden)),
    ],
    [
      'the swipe, a tap outside or Android’s Back',
      () =>
        act(async () =>
          screen.getByTestId('photo-visibility-modal', hidden).props.onRequestClose(),
        ),
    ],
  ])('dismissed with %s: the photos are still added, private', async (_how, dismiss) => {
    libraryReturns('a', 'b');
    await openGallery();

    await fireEvent.press(await screen.findByTestId('photos-add'));
    await screen.findByText('Who can see these photos?');
    await dismiss();

    await gridShows(2);
    expect(sheetIsOpen()).toBe(false);
    expect(rows().map((row) => row.is_public)).toEqual([false, false]);
  });

  test('one photo: the singular title and "Add 1 photo"', async () => {
    libraryReturns('a');
    await openGallery();

    await fireEvent.press(await screen.findByTestId('photos-add'));

    expect(await screen.findByText('Who can see this photo?')).toBeTruthy();
    expect(
      screen.getByTestId('photo-visibility-confirm', hidden).props.accessibilityLabel,
    ).toBe('Add 1 photo');
  });

  test('a cancelled picker shows no sheet and adds nothing', async () => {
    picker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: true,
      assets: null,
    });
    await openGallery();

    await fireEvent.press(await screen.findByTestId('photos-add'));
    await waitFor(() => expect(picker.launchImageLibraryAsync).toHaveBeenCalledTimes(1));

    expect(sheetIsOpen()).toBe(false);
    expect(rows()).toEqual([]);
  });

  test('with photos on the screen the floating button does the same', async () => {
    libraryReturns('first');
    await openGallery();
    await fireEvent.press(await screen.findByTestId('photos-add'));
    await screen.findByText('Who can see this photo?');
    await fireEvent.press(screen.getByTestId('photo-visibility-confirm', hidden));
    await gridShows(1);

    libraryReturns('second');
    await fireEvent.press(screen.getByTestId('photos-add'));
    await screen.findByText('Who can see this photo?');
    await fireEvent.press(screen.getByTestId('photo-visibility-public', hidden));
    await fireEvent.press(screen.getByTestId('photo-visibility-confirm', hidden));

    await gridShows(2);
    expect(
      rows()
        .map((row) => row.is_public)
        .sort(),
    ).toEqual([false, true]);
  });
});

describe('Add photos: the permission is refused', () => {
  test('asked and denied (can ask again): no picker, the notice offers "Allow photo access"', async () => {
    check.mockResolvedValue({ state: 'undetermined' });
    request.mockResolvedValueOnce({ state: 'denied', canAskAgain: true });
    await openGallery();

    await fireEvent.press(await screen.findByTestId('photos-add'));

    expect(await screen.findByText('Photo access is off')).toBeTruthy();
    expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(sheetIsOpen()).toBe(false);
    expect(screen.getByLabelText('Allow photo access')).toBeTruthy();
    expect(screen.queryByLabelText('Open Settings')).toBeNull();
    // The gallery is still usable: Add photos and Take a photo are there.
    expect(screen.getByTestId('photos-take')).toBeTruthy();
    expect(screen.getByTestId('photos-add')).toBeTruthy();
  });

  test('"Allow photo access" asks again, opens the picker and then the sheet', async () => {
    check.mockResolvedValue({ state: 'denied', canAskAgain: true });
    libraryReturns('a');
    await openGallery();
    await fireEvent.press(await screen.findByTestId('photos-add'));
    await screen.findByText('Photo access is off');
    expect(request).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('Allow photo access'));

    expect(await screen.findByText('Who can see this photo?')).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('photo-visibility-confirm', hidden));
    await gridShows(1);
    expect(screen.queryByText('Photo access is off')).toBeNull();
  });

  test('refused for good: "Open Settings" opens Settings and nothing else opens', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    check.mockResolvedValue({ state: 'denied', canAskAgain: false });
    await openGallery();

    await fireEvent.press(await screen.findByTestId('photos-add'));
    await screen.findByText('Photo access is off');
    await fireEvent.press(screen.getByLabelText('Open Settings'));

    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(sheetIsOpen()).toBe(false);
    expect(rows()).toEqual([]);
  });

  test('the notice can be dismissed', async () => {
    check.mockResolvedValue({ state: 'denied', canAskAgain: false });
    await openGallery();
    await fireEvent.press(await screen.findByTestId('photos-add'));
    await screen.findByText('Photo access is off');

    await fireEvent.press(screen.getByLabelText('Dismiss this message'));

    expect(screen.queryByText('Photo access is off')).toBeNull();
  });
});

describe('Take a photo', () => {
  test('asks the camera, opens it, and asks the same question about what it returned', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValueOnce({
      granted: true,
      canAskAgain: true,
      expires: 'never',
      status: 'granted' as ImagePicker.PermissionStatus,
    });
    picker.launchCameraAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [asset('shot')],
    });
    await openGallery();

    await fireEvent.press(await screen.findByTestId('photos-take'));

    expect(await screen.findByText('Who can see this photo?')).toBeTruthy();
    expect(check).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('photo-visibility-public', hidden));
    await fireEvent.press(screen.getByTestId('photo-visibility-confirm', hidden));

    await gridShows(1);
    expect(rows()[0]).toMatchObject({ is_public: true });
  });
});
