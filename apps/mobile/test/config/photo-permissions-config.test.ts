/**
 * @jest-environment node
 *
 * Spec 006 T610 (FR-017; plan D6-04, D6-05, D6-06): what the native configuration declares now
 * that "Add photos" asks for the photo library (owner decision 2026-10-22). Before, the Android
 * storage and media permissions were blocked because the system picker needed none; now:
 *
 *   - `READ_MEDIA_IMAGES` (Android 13+) and `READ_MEDIA_VISUAL_USER_SELECTED` (Android 14+,
 *     "Select photos") are declared through `android.permissions`, and `READ_EXTERNAL_STORAGE`
 *     (Android 12 and below, `maxSdkVersion` 32 from the libraries' own manifests) is no longer
 *     blocked: a permission blocked from the manifest cannot be asked for;
 *   - everything the product does not use stays blocked: videos, the advertising id, and the two
 *     location permissions (the globe never reads the device's position);
 *   - `ACCESS_MEDIA_LOCATION` is NOT declared: without `MediaStore.setRequireOriginal`, which
 *     expo-image-picker never calls, it would add a dialog and a disclosure for nothing;
 *   - the iOS usage string says why, honestly: to add photos to a trip and read where and when
 *     they were taken.
 *
 * The permission changes are native: a new build is required (as-built.md).
 */
import { resolvedConfig } from './expo-font-plugin';

type PluginEntry = string | [string] | [string, Record<string, unknown>];

const MEDIA_IMAGES = 'android.permission.READ_MEDIA_IMAGES';
const MEDIA_SELECTED = 'android.permission.READ_MEDIA_VISUAL_USER_SELECTED';
const MEDIA_VIDEO = 'android.permission.READ_MEDIA_VIDEO';
const READ_STORAGE = 'android.permission.READ_EXTERNAL_STORAGE';
const MEDIA_LOCATION = 'android.permission.ACCESS_MEDIA_LOCATION';

function pluginProps(name: string): Record<string, unknown> {
  const entry = ((resolvedConfig().plugins ?? []) as PluginEntry[]).find(
    (candidate) => (typeof candidate === 'string' ? candidate : candidate[0]) === name,
  );
  return (Array.isArray(entry) ? entry[1] : undefined) ?? {};
}

describe('app.config.ts: Android photo permissions', () => {
  const { android } = resolvedConfig();

  test('declares the image permissions the library request needs', () => {
    expect(android?.permissions).toEqual(
      expect.arrayContaining([MEDIA_IMAGES, MEDIA_SELECTED]),
    );
  });

  test('declares nothing else of its own: no video, no media location, no storage write', () => {
    expect(android?.permissions).toEqual([MEDIA_IMAGES, MEDIA_SELECTED]);
  });

  test('no longer blocks what the request needs', () => {
    const blocked = android?.blockedPermissions ?? [];
    expect(blocked).not.toContain(MEDIA_IMAGES);
    expect(blocked).not.toContain(MEDIA_SELECTED);
    expect(blocked).not.toContain(READ_STORAGE);
  });

  test('still blocks what the product does not use', () => {
    expect(android?.blockedPermissions).toEqual(
      expect.arrayContaining([
        'com.google.android.gms.permission.AD_ID',
        MEDIA_VIDEO,
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
      ]),
    );
  });

  test('neither declares nor blocks ACCESS_MEDIA_LOCATION (plan D6-06)', () => {
    expect(android?.permissions ?? []).not.toContain(MEDIA_LOCATION);
    expect(android?.blockedPermissions ?? []).not.toContain(MEDIA_LOCATION);
  });

  test('never lists a permission both ways', () => {
    const declared = new Set(android?.permissions ?? []);
    expect(
      (android?.blockedPermissions ?? []).filter((name) => declared.has(name)),
    ).toEqual([]);
  });
});

describe('app.config.ts: the iOS photo-library usage string', () => {
  const { photosPermission, cameraPermission } = pluginProps('expo-image-picker') as {
    photosPermission: string;
    cameraPermission: string;
  };

  test('says why, honestly: add photos to a trip, read where and when they were taken', () => {
    expect(photosPermission).toBe(
      'TripTrackr uses your photo library so you can add photos to a trip and read where and when they were taken.',
    );
  });

  test('is one sentence and makes no promise the permission now breaks', () => {
    expect(photosPermission.match(/[.!?](\s|$)/g)).toHaveLength(1);
    expect(photosPermission).not.toMatch(/never browses|only the photos you choose/i);
  });

  test('is not template text and is not the camera string', () => {
    expect(photosPermission).not.toMatch(/\$\(PRODUCT_NAME\)|Allow .* to access/i);
    expect(photosPermission).not.toBe(cameraPermission);
  });

  test('is the only library string: the add-to-library string is unchanged', () => {
    const { ios } = resolvedConfig();
    expect(ios?.infoPlist?.NSPhotoLibraryAddUsageDescription).toBe(
      'TripTrackr saves photos you export from a trip to your library.',
    );
  });
});
