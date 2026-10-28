# As built: photo permission and photo visibility prompt (spec 006)

Branch `feat/006-photos` (from `feat/ui-stack`), 2026-10-23. Owner decision of 2026-10-22
(`docs/roadmap/DECISIONS.md`). Spec, plan and tasks: this folder. Nothing here was run on a device.

## A new native build is required

The Android manifest and the iOS `NSPhotoLibraryUsageDescription` changed (`app.config.ts`). A JavaScript
reload or update cannot carry them: build a new development client, and a new preview or store build,
before any of the device checks in `quickstart.md`.

## What changed, against the owner's two requirements

1. **The app asks for the photo library before the picker opens** (`features/photos/library-permission.ts`,
   `useCapture`). iOS and Android 12 and below use `expo-image-picker`'s own calls. Android 13 and above use
   React Native's `PermissionsAndroid`, because `expo-image-picker`'s request asks for an empty list there
   and answers "granted" without a dialog (read in `ImagePickerModule.kt`, plan D6-02). Granted and limited
   open the picker; undetermined asks; denied shows the notice (below); no path opens the picker without the
   permission. The camera path keeps its own permission and never touches the library one.
2. **After a pick (library or camera) a sheet asks "Who can see these photos?"**
   (`components/trip/photo-visibility-sheet.tsx`): Private (selected, "Only you"), Public ("Can appear on a trip
   you choose to share", "Nothing is shared until you publish a trip"), one primary "Add N photos", an honest
   line ("Sharing isn't available yet, so for now only you can see a public photo. Closing this adds the
   photos as private."). Swipe, tap outside, Android Back, Close and leaving the screen all add the photos
   private; the first answer wins. Documents are never asked.

## Findings that changed the plan

- **The registration contract cannot carry visibility, and the old upload code would have dropped a public
  choice.** `RegisterPhotoRequest` is a strict object with no `is_public`; `markUploaded` then cleaned the row
  (`is_dirty = false`), so a photo public on the device stayed private on the account. The API does accept
  `is_public` for an existing photo through the sync push (`PhotosPushHandler.update`), and the server only
  applies a record strictly newer than the stored one, whose stamp the registration sets from the server's
  clock. Fix (test-first, no contract or API change): a public row stays dirty after registration with an
  `updated_at` after both the device clock and the registration answer's `updated_at`, and travels in the next
  push cycle; a private row is cleaned as before and is never pushed. This is not a leak (the database policy
  needs `approved` and a public trip, and nothing sets `approved`); it fixed a lost choice, so no STOP.
- **Android 13 and above: the picker module asks nothing** (above). A request through the module alone would
  have satisfied "the app asks" on paper and shown no dialog on most Android phones.
- **`ACCESS_MEDIA_LOCATION` is not declared** (plan D6-06): Android also needs `MediaStore.setRequireOriginal`
  to return an unredacted position, `expo-image-picker` 57.0.19 never calls it, and the permission would add a
  dialog and a disclosure for nothing. Android library photos keep the behaviour they had (the position may be
  redacted; the photo is then filed by hand). Device check 4 of `quickstart.md` decides whether a follow-up is
  worth it.

## Decisions and deviations

- **Notice action is a secondary, not a primary** (D6-12). The owner wrote "one primary action 'Open
  Settings'"; the notice sits above a gallery whose own primary, "Add photos", stays on screen, and the F14
  sweep set one primary per state, so the camera notice is already a secondary beside a text Dismiss. The
  library notice follows it. One prop (`primary`) reverses it. **Please confirm.**
- **No in-app sentence before the system dialog.** The brief allows one; the iOS usage string and the
  Android dialog already say why, and a pre-prompt is one more tap.
- **The sheet's header button reads "Close", not "Cancel"**, because leaving the sheet still adds the photos.
  `FormActions` gained two optional props for it (`cancelLabel`, `saveTestID`); every other form is unchanged.
  The confirm button is `photo-visibility-confirm` as the flows require.
- **No keyboard-visibility test** for the sheet (contract C4-10 rule 8): it has no text field. Stated, not
  skipped silently.
- **Viewer wording for a public photo** (D6-13, FR-018, added): "Public — for now only you can see this
  photo." The static "Private — only you can see your photos." contradicted a photo the traveller had just
  chosen public. The gallery footer note is unchanged.
- **`READ_EXTERNAL_STORAGE` un-blocked** as well as `READ_MEDIA_IMAGES`, and `READ_MEDIA_VISUAL_USER_SELECTED`
  added: a permission blocked from the manifest cannot be asked for, and the picker's Android 12 request asks
  storage (it also asks `WRITE_EXTERNAL_STORAGE`, which was never blocked and has `maxSdkVersion` 32).
  `READ_MEDIA_VIDEO`, `AD_ID` and the location permissions stay blocked.
- **`docs/legal/privacy-policy.md` is unchanged.** Its photo rows, "consent where the platform asks for it
  (camera, photo library access)" and "A photo you mark public is screened automatically before anyone else can
  see it" are all true with this feature. The draft banner and every placeholder stay.
- **Unresolved accessibility-label count 79 to 82** (`test/fixtures/testid-unresolved-count.json`,
  regenerated with `--write-unresolved`): the `FormCancel` branch that forwards a caller's label, and the
  sheet's radio group and radio names, composed from `VISIBILITY_COPY` at run time. No id or name was lost.
- The `FormModal` and `FormSheet` shared adapters were not edited. `packages/contracts` and `apps/api` were not
  touched, so their suites were not run.

## Evidence, one line per step

| Step | What                                         | Tests                                                     | Commit                  |
| ---- | -------------------------------------------- | --------------------------------------------------------- | ----------------------- |
| T601 | spec, plan, tasks, quickstart                | prettier                                                  | `8f248ac`               |
| T602 | repository stores `is_public`                | 2 in `photo-repository.test.ts`                           | `c730825`               |
| T603 | `saveCapturedPhotos` takes a visibility      | 6 in `photo-visibility-save.test.tsx`                     | `c60b146`               |
| T604 | a public choice survives registration        | 7 repository, 2 upload, 5 push and pull                   | `d56d247`               |
| T605 | library permission, three platforms          | 43 in `photo-library-permission.test.ts`                  | `951f485`               |
| T606 | `useCapture`: permission and the question    | 27 new, 70 in the three capture suites                    | `1dedc33`               |
| T607 | the sheet; `FormActions` props               | 24 sheet, 1 form-actions, fixed-heights entry             | `a48684f`, `051f1ab`    |
| T608 | the library refusal notice                   | 7 in `permission-denial.test.tsx`                         | `4924152`               |
| T609 | route wiring and screen test; viewer wording | 12 in `photo-visibility-screen.test.tsx`, 1 in the viewer | `9fd00a5`, `6482197`    |
| T610 | `app.config.ts`, store documents             | 10 in `photo-permissions-config.test.ts`                  | `af7075a`               |
| T611 | Maestro flows (edited, not run)              | parity guard resolves every selector                      | `0b73722`               |
| T612 | gates on the final tree, this note           | see "Gates on the final tree"                             | the commit that adds it |

## Gates on the final tree

- `npx jest --ci --maxWorkers=2` (`apps/mobile`): 426 suites passed, 9,878 tests passed, 3 skipped (the 3 were
  skipped before this work), 0 failed. The first full run, taken before the parity fix, had one failing suite
  (`testid-parity`, the `Cancel` literal; fixed in `051f1ab`), and every a11y, appearance, scale and state-sweep
  suite passed with the sheet in place.
- `npx tsc --noEmit`: exit 0. `npx eslint . --max-warnings=0`: exit 0.
- `npx prettier --check` on all 42 touched files and the five specs files (the route file through its
  character classes): clean.
- `node scripts/testid-baseline.mjs --check test/fixtures/testid-baseline.json`: parity holds (205 test ids,
  64 labels, every Maestro selector served); the unresolved-label count was regenerated, 79 to 82, for the
  reasons above. `node scripts/build-theme-css.mjs --check`: up to date. `test/scale/fixed-heights.test.ts`:
  10 passed, one allow-list entry added (the radio ring and dot, no text in them).
- Contrast of the sheet, computed from `theme.css`: muted text on the selected row 5.97 (light), 6.71 (dark),
  9.77 (light contrast), 10.37 (dark contrast); body text on it 12.49 or more.
- `packages/contracts` and `apps/api`: untouched, suites not run (no Docker suite was run either).

## Device checks (not done: they need a phone and the new native build)

`quickstart.md` has the table. The ones that decide something:

- **Permission dialogs**: iOS first run, Full Access, Limit Access, Don't Allow; Android 14 (Allow all, Select
  photos and videos, deny once, deny twice), Android 13, Android 12 or older. Confirms that Android 13 and
  above shows the dialog through `PermissionsAndroid`, and what the iOS picker offers under limited access.
- **The sheet**: swipe (iOS), Back and tap outside (Android), largest text, reduce motion, TalkBack and
  VoiceOver reading two radios, the four themes.
- **Location in Android library photos** with and without `ACCESS_MEDIA_LOCATION` (plan D6-06): record whether
  the position survives; do not add the permission alone.
- **A built manifest**: `npx expo prebuild --platform android` and read `AndroidManifest.xml` once: the two
  new permissions present, `READ_EXTERNAL_STORAGE` with `maxSdkVersion="32"`, `READ_MEDIA_VIDEO` and location
  absent, and that `android.permissions` did not drop a default permission the app relied on.
- **A public photo reaches the account**: offline add, go online, within about 30 s the server row has
  `is_public = true` and `moderation_state = 'pending'`; a second account cannot reach it.
- **Store forms** (owner): the Play "Photo and video permissions" declaration and the Data safety and App
  Privacy entries (`docs/release/store-readiness.md`, section 2.1).

## Privacy posture (for the PR text)

Every photo stays private unless the traveller selects Public in the sheet, per photo (FR-052, FR-053). A
public flag grants nothing yet: `photos_public_read` (migration 0005) admits a stranger only for
`is_public` and `moderation_state = 'approved'` and a public, live trip, and no screening provider or public
trip view exists. No new table, endpoint, column, sync field or contract change: the flag travels in the
existing `PhotoPushRecord`. Library access is used only to open the system picker and read the photos the
traveller chooses; contents, file names and positions are never logged. Documents keep no visibility flag
and are never asked. The Play and Apple forms must list the photo access.
