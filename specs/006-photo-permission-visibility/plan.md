# Implementation Plan: Photo Permission and Photo Visibility Prompt

**Spec**: [spec.md](./spec.md) | **Tasks**: [tasks.md](./tasks.md) | **Device checks**: [quickstart.md](./quickstart.md)

Decisions are numbered `D6-nn`. Every Expo fact below was read from the v57 reference on 2026-10-23 or
from the installed package source (`expo-image-picker` 57.0.19, `react-native` 0.86); none is from memory.

## Summary

Add a permission step in front of the library picker and a visibility sheet behind both pickers. The
permission is a small module (`features/photos/library-permission.ts`) that hides the three platform
behaviours behind one result. The sheet is a state-driven form (`FormSheet host="modal"` inside a
`FormModal`) driven by `useCapture`, which already owns "one capture at a time". Visibility is stored in
the existing `photos.is_public` column and carried by the existing sync push.

## Decisions

### D6-01 Ask in the app before the picker opens

The owner decided (2026-10-22) that "Add photos" asks for photo-library permission. This supersedes only
the "no permission" part of research D-34 and of the header of `features/photos/use-capture.ts`; the
picker, the EXIF read, the re-encode and the camera flow of D-34 stand. Both stores accept a permission
the app can justify: the usage string says why (D6-05), and the Play declaration is recorded in
`docs/release/store-readiness.md` (D6-04).

### D6-02 Which API asks, per platform

| Platform             | Check and request                                                                                                | Verified fact                                                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS (all)            | `ImagePicker.getMediaLibraryPermissionsAsync()` / `requestMediaLibraryPermissionsAsync()`                        | Return `MediaLibraryPermissionResponse`: `granted`, `canAskAgain`, `status`, `expires`, and `accessPrivileges` `'all'` or `'limited'` or `'none'`.                                 |
| Android 12 and below | the same two calls                                                                                               | The module asks `WRITE_EXTERNAL_STORAGE` and `READ_EXTERNAL_STORAGE` (`ImagePickerModule.kt`, `getMediaLibraryPermissions`).                                                       |
| Android 13 and above | **`PermissionsAndroid`** (react-native core): `READ_MEDIA_IMAGES`, plus `READ_MEDIA_VISUAL_USER_SELECTED` on 14+ | The same module asks for **an empty list** there (`Build.VERSION_CODES.TIRAMISU` branch), and an empty list counts as all granted: it answers `granted: true` and shows no dialog. |

Sources: <https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/> ("`requestMediaLibraryPermissionsAsync`",
"`MediaLibraryPermissionResponse`", "`PermissionResponse`": `canAskAgain` "if not, one should be directed
to the Settings app"; `accessPrivileges` `'limited'` "only available on Android API 34+ and iOS 14.0+");
`node_modules/expo-image-picker/android/src/main/java/expo/modules/imagepicker/ImagePickerModule.kt`
lines 140 to 192 and 258 to 266; <https://reactnative.dev/docs/permissionsandroid>.

Alternative rejected: `expo-media-library`'s `requestPermissionsAsync` would ask on Android 13+, but the
package is not installed (it is only listed in `bundledNativeModules.json`), adding it is a
`package.json` and lockfile change and a second native module for one dialog, and its own page warns
that full media access "is allowed only for apps that require broad access to photos" on Play
(<https://docs.expo.dev/versions/v57.0.0/sdk/media-library/>). `PermissionsAndroid` needs nothing new. If
the owner prefers the library, only `library-permission.ts` changes.

### D6-03 One result for three platforms

`library-permission.ts` exports `checkLibraryAccess()` and `requestLibraryAccess()`, both returning
`granted` | `limited` | `undetermined` | `denied` (`canAskAgain`). The mapping, each row a test:

| Platform response                                                                                             | Result                                         | The hook does                  |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------ |
| `granted` and `accessPrivileges` not `'limited'` (iOS; Android 12 and below; Android 13+ `READ_MEDIA_IMAGES`) | `granted`                                      | opens the picker               |
| `accessPrivileges: 'limited'`, or Android 14+ `READ_MEDIA_VISUAL_USER_SELECTED` granted alone                 | `limited`                                      | opens the picker               |
| `status: 'undetermined'` (iOS, Android 12 and below)                                                          | `undetermined`                                 | requests, then maps the answer |
| Android 13+ `check` false (the API cannot tell never-asked from denied)                                       | `undetermined`                                 | requests, then maps the answer |
| `denied` with `canAskAgain: true`; Android 13+ request answered `denied`                                      | `denied`, `canAskAgain: true`                  | notice "Allow photo access"    |
| `denied` with `canAskAgain: false`; Android 13+ request answered `never_ask_again`                            | `denied`, `canAskAgain: false`                 | notice "Open Settings"         |
| Any call that throws                                                                                          | reported to Sentry, `libraryUnavailable` words | no picker                      |

`useCapture` gains `allowLibraryAccess()` (the notice's "Allow photo access": request, then open the
picker if allowed). `addFromLibrary()` checks first and requests only when `undetermined`: a traveller who
denied once is shown the notice, not another dialog on every tap.

### D6-04 Native configuration (`app.config.ts`), and a new native build

Today `android.blockedPermissions` removes `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO` and
`READ_EXTERNAL_STORAGE` because the picker "needs no storage permission" (comment in `app.config.ts`,
`STORE_COMPLIANCE.md`, `docs/release/store-readiness.md`). With the owner's decision:

- `READ_MEDIA_IMAGES` is **un-blocked and declared** (Android 13+); nothing declares it today
  (`expo-image-picker` and `expo-file-system` declare only `READ_EXTERNAL_STORAGE` with
  `maxSdkVersion="32"`, read from their `AndroidManifest.xml`).
- `READ_MEDIA_VISUAL_USER_SELECTED` is **added** through `android.permissions` (Android 14+ partial
  access; without it the system cannot offer "Select photos").
- `READ_EXTERNAL_STORAGE` is **un-blocked** (Android 12 and below): the picker's request asks it, and a
  permission that is blocked from the manifest is refused with no dialog. Its `maxSdkVersion="32"` comes
  from the libraries' own manifests, so it is absent from Android 13+.
- Still blocked: `READ_MEDIA_VIDEO` (images only), `AD_ID`, and the two location permissions.
- Not added: `ACCESS_MEDIA_LOCATION` (D6-06).

A permission change is native: **a new dev-client and store build is required**; a JavaScript update
cannot add them. Play's "Photo and video permissions" policy restricts `READ_MEDIA_IMAGES` to apps whose
core functionality needs broad access and recommends the photo picker
(<https://developer.android.com/training/data-storage/shared/media>, "Caution"; policy
<https://support.google.com/googleplay/android-developer/answer/14115180>): the owner's decision is
recorded as a risk with the declaration to prepare, not worked around.

### D6-05 iOS usage string

`expo-image-picker`'s plugin prop `photosPermission` sets `NSPhotoLibraryUsageDescription` and is iOS only
(default "Allow $(PRODUCT_NAME) to access your photos"; the v57 page's table). The present string says the
app "reads the photos you choose ... It never browses your library on its own", which a library
permission makes misleading. New text, one honest sentence: "TripTrackr uses your photo library so you can
add photos to a trip and read where and when they were taken." (`PERMISSION_COPY.photos`). Apple 5.1.1(i)
requires the string to say why; it is also what the dialog shows. `cameraPermission` is unchanged.

### D6-06 `ACCESS_MEDIA_LOCATION` is not added

Android hides a photo's position unless the app declares `ACCESS_MEDIA_LOCATION`, asks for it at runtime
**and** opens the original with `MediaStore.setRequireOriginal(uri)`
(<https://developer.android.com/training/data-storage/shared/media>, "Media location permission" and
"Photographs"). `expo-image-picker` 57.0.19 reads EXIF from `contentResolver.openInputStream(uri)`
(`exporters/ImageExporter.kt`) and never calls `setRequireOriginal` (a search of its Android source finds
no occurrence). Declaring and asking for the permission would add a second dialog and a location
disclosure for a gain nothing in the code can deliver, so it is left out; Android library photos keep the
behaviour documented in `use-capture.ts` (filed by hand when the position is redacted). This is a device
check in `quickstart.md`; if the owner wants it, it is a follow-up feature (permission, runtime request and
a native read of the original), not a config line.

### D6-07 The visibility sheet

- Component `components/trip/photo-visibility-sheet.tsx`: `FormModal testID="photo-visibility"` around a
  `FormSheet host="modal" testID="photo-visibility-sheet"`, mounted only while a prompt is open (a
  cancelled draft does not linger, as `NoteEditor`). Title "Who can see these photos?" / "this photo?";
  Cancel in the header is the dismissal; the footer is the one primary "Add N photos".
- Two rows built on `Tappable` with `accessibilityRole="radio"` and `accessibilityState={{ checked,
selected }}` inside a `View accessibilityRole="radiogroup"`; ids `photo-visibility-private`,
  `photo-visibility-public`, confirm `photo-visibility-confirm`. A drawn ring and dot (token classes only)
  show the selection, never colour alone (the label, the dot and the `checked` state say it).
- One muted line: "Sharing trips is not available yet. For now a public photo is seen only by you."
- State machine inside `useCapture`: `pick -> prompt (Promise) -> save`. `busy` is true from the tap
  until the photos are saved, so the sheet is covered by the existing one-at-a-time guard. The prompt
  resolves `'public'` only from the confirm button with Public selected; dismissal, Cancel, Back, swipe
  and unmount all resolve `'private'`. Nothing is written before it resolves.
- Reduced motion, swipe, Back and the Android top inset are `FormModal`'s own; the body is `FormSheet`'s
  scroller, so the largest text size scrolls. No text field, so no keyboard to test (the C4-10 rule 8
  keyboard test is not applicable: stated in `as-built.md`).

### D6-08 Persistence and sync (verified)

- `photos.is_public` exists (default `false`; `db/schema.ts`), `moderation_state` defaults `pending`.
  `photosRepository.create` today forces `is_public: false`; it takes `is_public?` (default `false`) like
  the notes repository, and `saveCapturedPhotos` takes the visibility.
- The registration contract carries **no** visibility: `RegisterPhotoRequest` is a `strictObject` of
  `id`, `storage_key`, `city_id`, `taken_at`, `exif_lat`, `exif_lng` (`packages/contracts/src/api/photos.ts`).
  The API accepts `is_public` for an existing photo "at any time, pending screening included" through
  `PATCH /photos/:id` and through the sync push (`PhotosPushHandler.update`, `apps/api/src/modules/sync/push-media.ts`,
  `PhotoPushRecord.is_public`). Push never creates a photo and a photo row is pushable only once
  `upload_state = 'uploaded'` (`pushable()` in `db/repositories/sync.ts`).
- Problem found: `markUploaded` cleans the row (`is_dirty = false`) by compare-and-set on the `updated_at`
  the registration was built from, so a public choice would never be pushed and the account would keep
  `is_public = false` while the device says public. That fails closed, but it loses the traveller's
  choice. Fix, test-first: for a row whose `is_public` is true, registration is not the whole write. The
  row stays dirty with a new `updated_at`, strictly after both the device clock and the `updated_at` the
  registration answer carries, because the server's last-write-wins rule applies an incoming record only
  when it is strictly newer (`push-conflict.ts`, rule 2) and a registration stamps the row with the
  server's clock. It then travels in the next push cycle (30 s timer, `triggers.ts`) as a normal change.
  A private row is cleaned exactly as before, so a private choice is never sent as `true` (the record is
  built from the row: `toPushRecord`).
- A pull while the row is dirty keeps the local row when it is strictly newer (`pull.ts`, `applyRecord`),
  which the bumped `updated_at` guarantees.
- No contract, API, migration or sync-record change: the API and contracts suites are not touched.

### D6-09 Fail closed

`photos_public_read` (migration 0005) admits a stranger only when `is_public`, `moderation_state =
'approved'` and the trip is public and live; the push handler never writes `moderation_state`. No
screener and no public trip view exist (T152 and User Story 7), so nothing can become visible. The copy
says so (FR-010); the privacy policy paragraph "A photo you mark public is screened automatically before
anyone else can see it" stays true and is not edited.

### D6-10 Documents

`features/documents/capture.ts` keeps launching the system picker with no library permission and asks no
visibility question. With `READ_MEDIA_IMAGES` declared the picker behaves the same. Out of scope.

### D6-11 Tests

Hook tests over the real SQLite harness for every branch (permission mappings, picker cancelled,
camera, dismissal, Public, N photos, busy guard); module tests per platform with `Platform` and
`PermissionsAndroid` faked; sheet tests (default, roles, names, text scale, dismissal); repository, save
and push tests for `is_public`; a screen test of the photos route; the config test for the manifest and
the plugin string; Maestro flows edited, not run.

### D6-12 The refusal notice is a secondary action

The notice sits above a gallery whose own primary ("Add photos") stays on screen, and a state has exactly
one primary (FR-005 of feature 004; the F14 sweep, `as-built/f14-states.md`). So "Allow photo access" and
"Open Settings" are the notice's one action, drawn secondary beside a text "Dismiss", exactly as the camera
notice is (`PermissionState` without `primary`). The owner's "one primary action" is read as "one action,
named for what fixes it". Reversible with one prop (`primary`) if the owner wants the louder button.

### D6-13 The photo view says what "public" means today

`PrivateNote` read "Private — only you can see your photos." for every photo, which contradicts a photo the
traveller just chose public. For a public photo the view says "Public — for now only you can see this
photo." (FR-018). The gallery's footer note is about the gallery as a whole and is unchanged.

## Technical Context

TypeScript, Expo SDK 57, React Native 0.86, `expo-image-picker` 57.0.19, Jest with the repository's
harnesses. Files touched are listed per task in `tasks.md`.

## Constitution Check

- I (privacy structural): default private, per-photo flag, no new surface, fail closed in the database.
  Documents untouched. Passes.
- II (offline): the choice is written locally first; the public flag follows the bytes. Passes.
- III (test-first, 80 %): tasks write the failing test first. Passes.
- IV (verify before render): positions are still read from the chosen file only. Passes.
- V: not affected.
