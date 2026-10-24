/**
 * The photo-library permission, one answer for three platforms — spec 006 T605 (FR-001 to
 * FR-004; plan D6-02, D6-03; owner decision 2026-10-22: "Add photos" asks before the picker).
 *
 *   - iOS, and Android 12 and below: `expo-image-picker`'s own calls
 *     (https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker.md). A
 *     `MediaLibraryPermissionResponse` says `granted`, `canAskAgain`, `status` and
 *     `accessPrivileges` ('all' | 'limited' | 'none'; limited is iOS 14+ and Android 14+).
 *   - Android 13 and above: the same module asks for NOTHING there — its permission list is empty
 *     on that API level and an empty list counts as all granted — so a real question needs React
 *     Native's `PermissionsAndroid` (https://reactnative.dev/docs/permissionsandroid):
 *     `READ_MEDIA_IMAGES`, and on 14 and above `READ_MEDIA_VISUAL_USER_SELECTED` beside it, which
 *     is what lets the system offer "Select photos". Both are declared by app.config.ts.
 *
 * The caller sees four states: `granted` and `limited` open the picker; `undetermined` asks;
 * `denied` says whether the system will still ask (`canAskAgain`) or the traveller has to go to
 * Settings. `PermissionsAndroid.check` is a boolean, so on Android 13 and above "not granted"
 * cannot be told from "never asked" and reads as `undetermined`; the request settles it.
 *
 * Nothing here logs. A native failure rejects, for the caller to report.
 */
import * as ImagePicker from 'expo-image-picker';
import { PermissionsAndroid, Platform, type Permission } from 'react-native';

export type LibraryAccess =
  { state: 'granted' } | { state: 'limited' } | { state: 'undetermined' } | Denied;

type Denied = { state: 'denied'; canAskAgain: boolean };

/** What a request can come to: never "not yet decided". */
export type LibraryAnswer = Exclude<LibraryAccess, { state: 'undetermined' }>;

const GRANTED = { state: 'granted' } as const;
const LIMITED = { state: 'limited' } as const;
const UNDETERMINED = { state: 'undetermined' } as const;

const { READ_MEDIA_IMAGES, READ_MEDIA_VISUAL_USER_SELECTED } =
  PermissionsAndroid.PERMISSIONS;

/** The first API level with READ_MEDIA_* (Android 13) and with partial access (Android 14). */
const ANDROID_MEDIA_PERMISSIONS = 33;
const ANDROID_PARTIAL_ACCESS = 34;

function androidApiLevel(): number | null {
  return Platform.OS === 'android' ? Number(Platform.Version) : null;
}

function usesAndroidMediaPermissions(): boolean {
  const level = androidApiLevel();
  return level !== null && level >= ANDROID_MEDIA_PERMISSIONS;
}

function hasPartialAccess(): boolean {
  const level = androidApiLevel();
  return level !== null && level >= ANDROID_PARTIAL_ACCESS;
}

// ---------------------------------------------------------------------------
// expo-image-picker: iOS and Android 12 and below
// ---------------------------------------------------------------------------

function fromPicker(response: ImagePicker.MediaLibraryPermissionResponse): LibraryAccess {
  if (response.granted)
    return response.accessPrivileges === 'limited' ? LIMITED : GRANTED;
  if ((response.status as string) === 'undetermined') return UNDETERMINED;
  return { state: 'denied', canAskAgain: response.canAskAgain };
}

function settled(access: LibraryAccess, canAskAgain: boolean): LibraryAnswer {
  return access.state === 'undetermined' ? { state: 'denied', canAskAgain } : access;
}

// ---------------------------------------------------------------------------
// PermissionsAndroid: Android 13 and above
// ---------------------------------------------------------------------------

type AndroidResult = 'granted' | 'denied' | 'never_ask_again';

/** The answers of the permissions asked, as one state: all, selected only, or refused. */
function fromAndroid(
  images: AndroidResult,
  selected: AndroidResult | undefined,
): LibraryAnswer {
  if (images === 'granted') return GRANTED;
  if (selected === 'granted') return LIMITED;
  const refusedForGood = images === 'never_ask_again' || selected === 'never_ask_again';
  return { state: 'denied', canAskAgain: !refusedForGood };
}

async function checkAndroid(): Promise<LibraryAccess> {
  if (await PermissionsAndroid.check(READ_MEDIA_IMAGES)) return GRANTED;
  if (
    hasPartialAccess() &&
    (await PermissionsAndroid.check(READ_MEDIA_VISUAL_USER_SELECTED))
  ) {
    return LIMITED;
  }
  return UNDETERMINED;
}

async function requestAndroid(): Promise<LibraryAnswer> {
  if (!hasPartialAccess()) {
    return fromAndroid(await PermissionsAndroid.request(READ_MEDIA_IMAGES), undefined);
  }
  const wanted: Permission[] = [READ_MEDIA_IMAGES, READ_MEDIA_VISUAL_USER_SELECTED];
  const answers = await PermissionsAndroid.requestMultiple(wanted);
  return fromAndroid(
    answers[READ_MEDIA_IMAGES],
    answers[READ_MEDIA_VISUAL_USER_SELECTED],
  );
}

// ---------------------------------------------------------------------------
// The two calls
// ---------------------------------------------------------------------------

/** Where the permission stands now, without asking. */
export async function checkLibraryAccess(): Promise<LibraryAccess> {
  if (usesAndroidMediaPermissions()) return checkAndroid();
  return fromPicker(await ImagePicker.getMediaLibraryPermissionsAsync());
}

/** Ask the traveller (the system's dialog, if the system will still show one). */
export async function requestLibraryAccess(): Promise<LibraryAnswer> {
  if (usesAndroidMediaPermissions()) return requestAndroid();
  const response = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return settled(fromPicker(response), response.canAskAgain);
}
