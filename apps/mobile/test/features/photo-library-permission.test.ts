/**
 * The photo-library permission, one answer for three platforms — spec 006 T605 (FR-001 to FR-004;
 * plan D6-02, D6-03).
 *
 *   - iOS and Android 12 and below: `expo-image-picker`'s own `getMediaLibraryPermissionsAsync` and
 *     `requestMediaLibraryPermissionsAsync` (v57: `granted`, `canAskAgain`, `status`,
 *     `accessPrivileges` 'all' | 'limited' | 'none');
 *   - Android 13 and above: that module asks for NOTHING there (an empty permission list counts as
 *     all granted), so `PermissionsAndroid` asks for `READ_MEDIA_IMAGES`, and on 14 and above also
 *     `READ_MEDIA_VISUAL_USER_SELECTED` (the partial grant, "Select photos").
 *
 * Every row of the mapping table in plan D6-03 is a test below. `Platform` and the two native
 * permission APIs are faked.
 */
import * as ImagePicker from 'expo-image-picker';
import { PermissionsAndroid, Platform } from 'react-native';

import {
  checkLibraryAccess,
  requestLibraryAccess,
} from '@/features/photos/library-permission';

jest.mock('expo-image-picker', () => ({
  getMediaLibraryPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
}));

const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;

const IMAGES = 'android.permission.READ_MEDIA_IMAGES';
const SELECTED = 'android.permission.READ_MEDIA_VISUAL_USER_SELECTED';

const versionDescriptor = Object.getOwnPropertyDescriptor(Platform, 'Version');
let restoreOs: { restore: () => void } | null = null;

function device(os: 'ios' | 'android', version: number | string) {
  restoreOs = jest.replaceProperty(Platform, 'OS', os);
  Object.defineProperty(Platform, 'Version', { configurable: true, get: () => version });
}

afterEach(() => {
  restoreOs?.restore();
  restoreOs = null;
  if (versionDescriptor) Object.defineProperty(Platform, 'Version', versionDescriptor);
  jest.restoreAllMocks();
});

function response(
  granted: boolean,
  status: 'granted' | 'denied' | 'undetermined',
  canAskAgain: boolean,
  accessPrivileges?: 'all' | 'limited' | 'none',
): ImagePicker.MediaLibraryPermissionResponse {
  return {
    granted,
    status: status as ImagePicker.PermissionStatus,
    canAskAgain,
    expires: 'never',
    ...(accessPrivileges ? { accessPrivileges } : {}),
  };
}

describe('iOS and Android 12 and below (expo-image-picker)', () => {
  describe.each([
    ['iOS 17', 'ios', '17.4'],
    ['Android 12', 'android', 32],
    ['Android 8', 'android', 26],
  ] as const)('%s', (_name, os, version) => {
    beforeEach(() => device(os, version));

    test('allowed to all photos is granted', async () => {
      picker.getMediaLibraryPermissionsAsync.mockResolvedValue(
        response(true, 'granted', true, 'all'),
      );
      await expect(checkLibraryAccess()).resolves.toEqual({ state: 'granted' });
    });

    test('granted without accessPrivileges (Android 12 and below) is granted', async () => {
      picker.getMediaLibraryPermissionsAsync.mockResolvedValue(
        response(true, 'granted', true),
      );
      await expect(checkLibraryAccess()).resolves.toEqual({ state: 'granted' });
    });

    test('limited access is limited, and still usable', async () => {
      picker.getMediaLibraryPermissionsAsync.mockResolvedValue(
        response(true, 'granted', true, 'limited'),
      );
      await expect(checkLibraryAccess()).resolves.toEqual({ state: 'limited' });
    });

    test('never asked is undetermined', async () => {
      picker.getMediaLibraryPermissionsAsync.mockResolvedValue(
        response(false, 'undetermined', true, 'none'),
      );
      await expect(checkLibraryAccess()).resolves.toEqual({ state: 'undetermined' });
    });

    test('denied and the system can still ask: denied, can ask again', async () => {
      picker.getMediaLibraryPermissionsAsync.mockResolvedValue(
        response(false, 'denied', true, 'none'),
      );
      await expect(checkLibraryAccess()).resolves.toEqual({
        state: 'denied',
        canAskAgain: true,
      });
    });

    test('denied and the system will not ask again: denied, cannot ask again', async () => {
      picker.getMediaLibraryPermissionsAsync.mockResolvedValue(
        response(false, 'denied', false, 'none'),
      );
      await expect(checkLibraryAccess()).resolves.toEqual({
        state: 'denied',
        canAskAgain: false,
      });
    });

    test('a request that is allowed is granted; a limited one is limited', async () => {
      picker.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce(
        response(true, 'granted', true, 'all'),
      );
      await expect(requestLibraryAccess()).resolves.toEqual({ state: 'granted' });
      picker.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce(
        response(true, 'granted', true, 'limited'),
      );
      await expect(requestLibraryAccess()).resolves.toEqual({ state: 'limited' });
    });

    test('a request that is refused is denied, with what the system says about asking again', async () => {
      picker.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce(
        response(false, 'denied', true, 'none'),
      );
      await expect(requestLibraryAccess()).resolves.toEqual({
        state: 'denied',
        canAskAgain: true,
      });
      picker.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce(
        response(false, 'denied', false, 'none'),
      );
      await expect(requestLibraryAccess()).resolves.toEqual({
        state: 'denied',
        canAskAgain: false,
      });
    });

    test('a request that stays undetermined (a mixed answer) is a refusal, never "ask again later"', async () => {
      picker.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce(
        response(false, 'undetermined', true),
      );
      await expect(requestLibraryAccess()).resolves.toEqual({
        state: 'denied',
        canAskAgain: true,
      });
    });

    test('never touches PermissionsAndroid', async () => {
      const check = jest.spyOn(PermissionsAndroid, 'check');
      const request = jest.spyOn(PermissionsAndroid, 'request');
      picker.getMediaLibraryPermissionsAsync.mockResolvedValue(
        response(true, 'granted', true, 'all'),
      );
      picker.requestMediaLibraryPermissionsAsync.mockResolvedValue(
        response(true, 'granted', true, 'all'),
      );

      await checkLibraryAccess();
      await requestLibraryAccess();

      expect(check).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    });
  });

  test('a native failure rejects, for the caller to report', async () => {
    device('ios', '17.4');
    picker.getMediaLibraryPermissionsAsync.mockRejectedValue(new Error('native'));
    await expect(checkLibraryAccess()).rejects.toThrow('native');
  });
});

describe('Android 13 (READ_MEDIA_IMAGES through PermissionsAndroid)', () => {
  beforeEach(() => device('android', 33));

  test('already granted is granted, without asking the picker module anything', async () => {
    const check = jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);

    await expect(checkLibraryAccess()).resolves.toEqual({ state: 'granted' });

    expect(check).toHaveBeenCalledWith(IMAGES);
    expect(picker.getMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
  });

  test('not granted cannot tell never-asked from denied: undetermined, so the caller asks', async () => {
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    await expect(checkLibraryAccess()).resolves.toEqual({ state: 'undetermined' });
  });

  test('a request that is allowed is granted', async () => {
    const request = jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue('granted');

    await expect(requestLibraryAccess()).resolves.toEqual({ state: 'granted' });

    expect(request).toHaveBeenCalledWith(IMAGES);
    expect(picker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
  });

  test('denied once can be asked again; never_ask_again cannot', async () => {
    const request = jest.spyOn(PermissionsAndroid, 'request');
    request.mockResolvedValueOnce('denied');
    await expect(requestLibraryAccess()).resolves.toEqual({
      state: 'denied',
      canAskAgain: true,
    });
    request.mockResolvedValueOnce('never_ask_again');
    await expect(requestLibraryAccess()).resolves.toEqual({
      state: 'denied',
      canAskAgain: false,
    });
  });

  test('asks for the images only on 13: no partial-access permission exists there', async () => {
    const multiple = jest.spyOn(PermissionsAndroid, 'requestMultiple');
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('granted');

    await requestLibraryAccess();

    expect(multiple).not.toHaveBeenCalled();
  });
});

describe('Android 14 and above (partial access)', () => {
  beforeEach(() => device('android', 34));

  function checks(images: boolean, selected: boolean) {
    return jest
      .spyOn(PermissionsAndroid, 'check')
      .mockImplementation(async (permission) =>
        permission === IMAGES ? images : permission === SELECTED ? selected : false,
      );
  }

  test('all photos is granted', async () => {
    checks(true, false);
    await expect(checkLibraryAccess()).resolves.toEqual({ state: 'granted' });
  });

  test('only the selected photos is limited', async () => {
    checks(false, true);
    await expect(checkLibraryAccess()).resolves.toEqual({ state: 'limited' });
  });

  test('neither is undetermined', async () => {
    checks(false, false);
    await expect(checkLibraryAccess()).resolves.toEqual({ state: 'undetermined' });
  });

  test('one request asks for both permissions together, as the system dialog needs', async () => {
    const multiple = jest
      .spyOn(PermissionsAndroid, 'requestMultiple')
      .mockResolvedValue({ [IMAGES]: 'granted', [SELECTED]: 'granted' } as never);

    await expect(requestLibraryAccess()).resolves.toEqual({ state: 'granted' });

    expect(multiple).toHaveBeenCalledWith([IMAGES, SELECTED]);
  });

  test('"Select photos and videos" is limited, even though the images permission reads as refused', async () => {
    jest
      .spyOn(PermissionsAndroid, 'requestMultiple')
      .mockResolvedValue({ [IMAGES]: 'never_ask_again', [SELECTED]: 'granted' } as never);

    await expect(requestLibraryAccess()).resolves.toEqual({ state: 'limited' });
  });

  test('"Don\'t allow" once can be asked again; twice cannot', async () => {
    const multiple = jest.spyOn(PermissionsAndroid, 'requestMultiple');
    multiple.mockResolvedValueOnce({ [IMAGES]: 'denied', [SELECTED]: 'denied' } as never);
    await expect(requestLibraryAccess()).resolves.toEqual({
      state: 'denied',
      canAskAgain: true,
    });
    multiple.mockResolvedValueOnce({
      [IMAGES]: 'never_ask_again',
      [SELECTED]: 'never_ask_again',
    } as never);
    await expect(requestLibraryAccess()).resolves.toEqual({
      state: 'denied',
      canAskAgain: false,
    });
  });

  test('a native failure rejects, for the caller to report', async () => {
    jest
      .spyOn(PermissionsAndroid, 'requestMultiple')
      .mockRejectedValue(new Error('gone'));
    await expect(requestLibraryAccess()).rejects.toThrow('gone');
  });
});
