/**
 * The permission and the visibility question in `useCapture` — spec 006 T606 (FR-001 to FR-009,
 * FR-015, FR-016; User Stories 1 to 3; plan D6-03, D6-07).
 *
 * The hook over a real SQLite database, the picker, the library-permission module and the
 * native file and image modules faked. Every branch of the flow:
 *   - "Add photos": undetermined asks and then opens the picker when allowed; granted and limited
 *     open it at once; denied (can ask again, or not) opens nothing and says why; "Allow photo
 *     access" asks again; a failing permission API is reported and opens nothing;
 *   - a cancelled picker, or one that returns nothing, asks no question and writes nothing;
 *   - the camera keeps its own permission, never touches the library permission, and asks the
 *     same question about what it returned;
 *   - nothing is written until the question is answered; `public` stores every photo public,
 *     `private` and every dismissal store them private; a second answer is ignored;
 *   - one capture at a time, the sheet's time included; a screen left with the question open
 *     still adds the photos, private.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import type { PropsWithChildren } from 'react';

import { DatabaseProvider } from '@/db/client';
import { tripsRepository } from '@/db/repositories/trips';
import { photos } from '@/db/schema';
import {
  checkLibraryAccess,
  requestLibraryAccess,
} from '@/features/photos/library-permission';
import { useCapture } from '@/features/photos/use-capture';
import { Sentry } from '@/lib/sentry';
import { kickUploadQueue } from '@/sync/upload-queue';

import { createTestDatabase, type TestSqlite } from '../db/sqlite-harness';
import { captureAnswering, captureQuietly, start, answer } from './photo-capture-prompt';
import { CACHE, type FileSystemMock, type ManipulatorMock } from './photo-fakes';

jest.mock('expo-file-system', () =>
  jest.requireActual('./photo-fakes').createFileSystemMock(),
);
jest.mock('expo-image-manipulator', () =>
  jest.requireActual('./photo-fakes').createManipulatorMock(),
);
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));
jest.mock('@/features/photos/library-permission', () => ({
  checkLibraryAccess: jest.fn(),
  requestLibraryAccess: jest.fn(),
}));
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

const DECLINED =
  'TripTrackr needs your permission to read the photos you choose. Tap “Allow photo access” to be asked again.';
const BLOCKED =
  'Photo access is turned off for TripTrackr. You can turn it on in Settings.';

let sqlite: TestSqlite;
let tripId: string;

function wrapper({ children }: PropsWithChildren) {
  return <DatabaseProvider value={sqlite.db}>{children}</DatabaseProvider>;
}

function asset(name: string): ImagePicker.ImagePickerAsset {
  const uri = `${CACHE}/ImagePicker/${name}.jpg`;
  __fs.write(uri, 3_000_000);
  __manipulator.images.set(uri, { width: 4032, height: 3024 });
  return { uri, width: 4032, height: 3024, exif: null, type: 'image' };
}

function libraryReturns(names: string[]) {
  picker.launchImageLibraryAsync.mockResolvedValueOnce({
    canceled: false,
    assets: names.map(asset),
  });
}

function rows() {
  return sqlite.db.select().from(photos).all();
}

async function renderCapture() {
  return renderHook(() => useCapture(tripId), { wrapper });
}

/** Wait until the question is open and says it is about `count` photos. */
async function answerWaitsFor(
  hook: Awaited<ReturnType<typeof renderCapture>>,
  count: number,
) {
  await waitFor(() => expect(hook.result.current.prompt).toEqual({ count }));
}

beforeEach(async () => {
  __fs.reset();
  __manipulator.reset();
  check.mockReset().mockResolvedValue({ state: 'granted' });
  request.mockReset().mockResolvedValue({ state: 'granted' });
  sqlite = await createTestDatabase();
  tripId = tripsRepository.create(sqlite.db, {
    id: randomUUID(),
    title: 'Italy',
    home_currency: 'EUR',
  }).id;
});

afterEach(() => {
  sqlite.close();
});

describe('Add photos asks for the photo library first (User Story 1)', () => {
  test('undetermined asks, and the picker opens only after the answer is yes', async () => {
    const order: string[] = [];
    check.mockImplementation(async () => {
      order.push('check');
      return { state: 'undetermined' };
    });
    request.mockImplementation(async () => {
      order.push('request');
      return { state: 'granted' };
    });
    picker.launchImageLibraryAsync.mockImplementationOnce(async () => {
      order.push('picker');
      return { canceled: true, assets: null };
    });
    const hook = await renderCapture();

    await captureQuietly(hook);

    expect(order).toEqual(['check', 'request', 'picker']);
  });

  test('already granted: no question, the picker opens at once', async () => {
    check.mockResolvedValue({ state: 'granted' });
    libraryReturns(['a']);
    const hook = await renderCapture();

    await captureAnswering(hook);

    expect(request).not.toHaveBeenCalled();
    expect(picker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
  });

  test('limited access counts as allowed: no question, the picker opens', async () => {
    check.mockResolvedValue({ state: 'limited' });
    libraryReturns(['a']);
    const hook = await renderCapture();

    await captureAnswering(hook);

    expect(request).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(1);
  });

  test('a question answered "selected photos only" opens the picker', async () => {
    check.mockResolvedValue({ state: 'undetermined' });
    request.mockResolvedValue({ state: 'limited' });
    libraryReturns(['a']);
    const hook = await renderCapture();

    await captureAnswering(hook);

    expect(picker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
  });

  test('a question answered no opens nothing, writes nothing, and says why (can ask again)', async () => {
    check.mockResolvedValue({ state: 'undetermined' });
    request.mockResolvedValue({ state: 'denied', canAskAgain: true });
    const hook = await renderCapture();

    await captureQuietly(hook);

    expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(rows()).toEqual([]);
    expect(hook.result.current.message).toEqual({
      tone: 'error',
      text: DECLINED,
      permission: 'library',
    });
    expect(kickUploadQueue).not.toHaveBeenCalled();
  });

  test('a question answered no for good points to Settings', async () => {
    check.mockResolvedValue({ state: 'undetermined' });
    request.mockResolvedValue({ state: 'denied', canAskAgain: false });
    const hook = await renderCapture();

    await captureQuietly(hook);

    expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(hook.result.current.message).toEqual({
      tone: 'error',
      text: BLOCKED,
      permission: 'library',
      openSettings: true,
    });
  });

  test('refused earlier and the system will not ask again: no new question, Settings', async () => {
    check.mockResolvedValue({ state: 'denied', canAskAgain: false });
    const hook = await renderCapture();

    await captureQuietly(hook);

    expect(request).not.toHaveBeenCalled();
    expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(hook.result.current.message).toMatchObject({
      permission: 'library',
      openSettings: true,
    });
  });

  test('refused earlier but the system can ask again: no question on this tap, the notice offers it', async () => {
    check.mockResolvedValue({ state: 'denied', canAskAgain: true });
    const hook = await renderCapture();

    await captureQuietly(hook);

    expect(request).not.toHaveBeenCalled();
    expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(hook.result.current.message).toEqual({
      tone: 'error',
      text: DECLINED,
      permission: 'library',
    });
  });

  test('"Allow photo access" asks again and, when allowed, opens the picker and asks who sees them', async () => {
    check.mockResolvedValue({ state: 'denied', canAskAgain: true });
    request.mockResolvedValue({ state: 'granted' });
    libraryReturns(['a', 'b']);
    const hook = await renderCapture();

    await captureAnswering(hook, 'allowLibraryAccess', 'private');

    expect(request).toHaveBeenCalledTimes(1);
    expect(rows()).toHaveLength(2);
    expect(hook.result.current.message).toEqual({
      tone: 'info',
      text: '2 photos added.',
    });
  });

  test('"Allow photo access" refused for good turns into the Settings notice', async () => {
    check.mockResolvedValue({ state: 'denied', canAskAgain: true });
    request.mockResolvedValue({ state: 'denied', canAskAgain: false });
    const hook = await renderCapture();

    await captureQuietly(hook, 'allowLibraryAccess');

    expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(hook.result.current.message).toMatchObject({
      permission: 'library',
      openSettings: true,
    });
  });

  test('"Allow photo access" does not ask when the system will not: it shows Settings', async () => {
    check.mockResolvedValue({ state: 'denied', canAskAgain: false });
    const hook = await renderCapture();

    await captureQuietly(hook, 'allowLibraryAccess');

    expect(request).not.toHaveBeenCalled();
    expect(hook.result.current.message).toMatchObject({ openSettings: true });
  });

  test('a permission API that fails is reported, opens nothing, and says so', async () => {
    check.mockRejectedValue(new Error('native permission module gone'));
    const hook = await renderCapture();

    await captureQuietly(hook);

    expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalled();
    expect(hook.result.current.message).toEqual({
      tone: 'error',
      text: 'Your photo library couldn’t be opened. Please try again.',
    });
  });

  test('a cancelled picker asks no question and writes nothing', async () => {
    picker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: true,
      assets: null,
    });
    const hook = await renderCapture();

    await captureQuietly(hook);

    expect(rows()).toEqual([]);
    expect(hook.result.current.message).toBeNull();
    expect(kickUploadQueue).not.toHaveBeenCalled();
  });

  test('a picker that returns nothing asks no question and writes nothing', async () => {
    picker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [] });
    const hook = await renderCapture();

    await captureQuietly(hook);

    expect(rows()).toEqual([]);
    expect(hook.result.current.message).toBeNull();
  });
});

describe('the camera keeps its own permission (FR-005)', () => {
  function cameraGranted() {
    picker.requestCameraPermissionsAsync.mockResolvedValueOnce({
      granted: true,
      canAskAgain: true,
      expires: 'never',
      status: 'granted' as ImagePicker.PermissionStatus,
    });
  }

  test('asks the camera permission only, then asks who can see the photo', async () => {
    cameraGranted();
    picker.launchCameraAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [asset('shot')],
    });
    const hook = await renderCapture();

    const started = await start(hook, 'takePhoto');
    await answer(hook, started, 'public');

    expect(picker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(check).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ is_public: true });
    expect(hook.result.current.message).toEqual({ tone: 'info', text: '1 photo added.' });
  });

  test('a camera refused asks no question and writes nothing', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      canAskAgain: false,
      expires: 'never',
      status: 'denied' as ImagePicker.PermissionStatus,
    });
    const hook = await renderCapture();

    await captureQuietly(hook, 'takePhoto');

    expect(rows()).toEqual([]);
    expect(hook.result.current.message).toMatchObject({ openSettings: true });
    expect(check).not.toHaveBeenCalled();
  });

  test('a cancelled camera asks no question', async () => {
    cameraGranted();
    picker.launchCameraAsync.mockResolvedValueOnce({ canceled: true, assets: null });
    const hook = await renderCapture();

    await captureQuietly(hook, 'takePhoto');

    expect(rows()).toEqual([]);
  });
});

describe('who can see these photos (User Story 2)', () => {
  test('nothing is written until the question is answered, and the capture is busy meanwhile', async () => {
    libraryReturns(['a', 'b', 'c']);
    const hook = await renderCapture();

    const started = await start(hook);
    await answerWaitsFor(hook, 3);

    expect(rows()).toEqual([]);
    expect(hook.result.current.busy).toBe(true);
    expect(kickUploadQueue).not.toHaveBeenCalled();

    await answer(hook, started, 'private');
    expect(rows()).toHaveLength(3);
  });

  test('the question counts the photos that came back', async () => {
    libraryReturns(['a', 'b']);
    const hook = await renderCapture();

    const started = await start(hook);
    await answerWaitsFor(hook, 2);
    await answer(hook, started, 'private');

    expect(hook.result.current.prompt).toBeNull();
  });

  test('public: every photo of the pick is stored public, each with its own flag', async () => {
    libraryReturns(['a', 'b', 'c']);
    const hook = await renderCapture();

    await captureAnswering(hook, 'addFromLibrary', 'public');

    expect(rows().map((row) => row.is_public)).toEqual([true, true, true]);
    expect(rows().every((row) => row.moderation_state === 'pending')).toBe(true);
    expect(hook.result.current.message).toEqual({
      tone: 'info',
      text: '3 photos added.',
    });
    expect(kickUploadQueue).toHaveBeenCalledWith('capture');
  });

  test('private: every photo is stored private', async () => {
    libraryReturns(['a', 'b']);
    const hook = await renderCapture();

    await captureAnswering(hook, 'addFromLibrary', 'private');

    expect(rows().map((row) => row.is_public)).toEqual([false, false]);
  });

  test('any dismissal adds the photos, private (FR-008)', async () => {
    libraryReturns(['a', 'b']);
    const hook = await renderCapture();

    await captureAnswering(hook, 'addFromLibrary', 'dismiss');

    expect(rows().map((row) => row.is_public)).toEqual([false, false]);
    expect(hook.result.current.message).toEqual({
      tone: 'info',
      text: '2 photos added.',
    });
    expect(kickUploadQueue).toHaveBeenCalledWith('capture');
  });

  test('a second answer is ignored: the first one wins', async () => {
    libraryReturns(['a']);
    const hook = await renderCapture();

    const started = await start(hook);
    await answerWaitsFor(hook, 1);
    await act(async () => {
      hook.result.current.dismissPrompt();
      hook.result.current.answerPrompt('public');
      await started.done;
    });

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ is_public: false });
  });

  test('a second tap while the question is open is ignored', async () => {
    libraryReturns(['a']);
    const hook = await renderCapture();

    const started = await start(hook);
    await answerWaitsFor(hook, 1);
    await act(async () => {
      await hook.result.current.addFromLibrary();
      await hook.result.current.takePhoto();
      await hook.result.current.allowLibraryAccess();
    });

    expect(picker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
    expect(picker.launchCameraAsync).not.toHaveBeenCalled();
    await answer(hook, started, 'private');
    expect(rows()).toHaveLength(1);
  });

  test('is free again once the photos are added', async () => {
    libraryReturns(['a']);
    const hook = await renderCapture();

    await captureAnswering(hook);

    expect(hook.result.current.busy).toBe(false);
    libraryReturns(['b']);
    await captureAnswering(hook, 'addFromLibrary', 'public');
    expect(
      rows()
        .map((row) => row.is_public)
        .sort(),
    ).toEqual([false, true]);
  });

  test('a screen left with the question open still adds the photos, private', async () => {
    libraryReturns(['a', 'b']);
    const hook = await renderCapture();

    const started = await start(hook);
    await answerWaitsFor(hook, 2);
    // The cleanup of a passive effect runs when the act scope ends, so it ends before the wait.
    await act(async () => {
      hook.unmount();
    });
    await started.done;

    expect(rows().map((row) => row.is_public)).toEqual([false, false]);
  });

  test('photos that cannot be saved are named, the others keep the choice', async () => {
    const broken = asset('broken');
    __manipulator.images.delete(broken.uri);
    picker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [broken, asset('fine')],
    });
    const hook = await renderCapture();

    await captureAnswering(hook, 'addFromLibrary', 'public');

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ is_public: true });
    expect(hook.result.current.message?.text).toMatch(/^1 of 2 photos added\./);
  });
});
