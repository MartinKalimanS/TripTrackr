# Feature Specification: Photo Permission and Photo Visibility Prompt

**Feature Branch**: `feat/006-photos` (spec `006-photo-permission-visibility`)

**Created**: 2026-10-23

**Status**: Draft

**Input**: owner decision of 2026-10-22, recorded in `docs/roadmap/DECISIONS.md`: "Photos: the app asks
the traveller for photo-library permission before the picker opens; after a pick it asks whether the
photos are public or private, and no answer means private (the choice is stored only; nothing is
visible to anyone until the sharing story ships, which stays behind the offline-sync gate T141)".

## Overview

Today "Add photos" opens the system picker with no question asked: the picker is itself the grant,
which is why the Android storage and media permissions are blocked in `app.config.ts`
(`features/photos/use-capture.ts`, research D-34). The owner wants two things changed:

1. When the traveller adds photos from the **library**, TripTrackr asks for photo-library permission
   first, in the platform's own dialog, and never opens the picker without it.
2. Once photos have been chosen, from the library **or** the camera, TripTrackr asks whether they are
   **public** or **private**. Giving no answer means private, and the photos are still added.

It amends feature 001 User Story 5 Acceptance Scenario 1 ("stored privately against the trip") only in
that the traveller may now set a photo public at the moment it is added; nothing changes for a
traveller who does not. It does not build the public trip view (User Story 7, T152) or the screening
provider: a photo set public is stored and carried to the account, and stays unreachable to everyone
but its owner until both exist. The sheet says so.

Out of scope: changing the visibility of a photo already added (User Story 7), the camera permission
flow (unchanged), documents (they have no visibility and are never asked: Constitution I), saving
photos back to the library, picking videos.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - The app asks before it opens my library (Priority: P1)

A traveller taps "Add photos". If TripTrackr has not been allowed to read photos yet, the system asks
the traveller, in its own words plus a plain sentence from TripTrackr saying why. Allowing it (all
photos, or only the photos the traveller selects on iOS 14+ and Android 14+) opens the picker.

**Why this priority**: it is the owner's first requirement, and without the permission nothing else in
this feature can run.

**Independent Test**: on a freshly installed build, tap "Add photos" on a trip's gallery: the system
permission dialog appears before any picker; allowing it opens the picker.

**Acceptance Scenarios**:

1. **Given** photo access has not been decided, **When** the traveller taps "Add photos", **Then** the
   system permission dialog appears and the picker has not opened.
2. **Given** the traveller allows access to all photos, or (iOS, Android 14+) to selected photos only,
   **When** the dialog closes, **Then** the system picker opens.
3. **Given** access was granted earlier, **When** the traveller taps "Add photos", **Then** no dialog
   appears and the picker opens at once.
4. **Given** the traveller denies the dialog, **When** it closes, **Then** the picker has not opened and
   the gallery shows why (User Story 3).
5. **Given** the traveller taps "Take a photo", **Then** only the camera permission is involved: no
   photo-library dialog appears and none is needed.

### User Story 2 - The app asks who can see the photos I just chose (Priority: P1)

After the picker (or the camera) hands back at least one photo, a bottom sheet asks "Who can see these
photos?" with two choices: Private (selected) and Public. One button adds the photos. Whatever the
traveller does, even swiping the sheet away, the photos are added; with no answer they are private.

**Why this priority**: it is the owner's second requirement and the only place the traveller can state
a photo's visibility before it exists on the account (FR-053).

**Independent Test**: pick two photos from the library, leave the sheet on its default and tap "Add 2
photos": both are stored with `is_public = false`. Repeat choosing Public: both are stored with
`is_public = true`. Repeat swiping the sheet down: both are stored private.

**Acceptance Scenarios**:

1. **Given** the picker returned one or more photos, **When** it closes, **Then** the sheet "Who can see
   these photos?" (singular "this photo?" for one) is shown with Private selected.
2. **Given** the sheet, **When** the traveller taps "Add N photos" with Private selected, **Then** the N
   photos are added private.
3. **Given** the sheet, **When** the traveller selects Public and taps "Add N photos", **Then** the N photos
   are added with their own `is_public = true`.
4. **Given** the sheet, **When** the traveller dismisses it any way (swipe down, tap outside, Android
   Back, the system closing it), **Then** the N photos are added private and the gallery shows them.
5. **Given** the camera returned a photo, **Then** the same sheet appears for it.
6. **Given** the picker was cancelled or returned no photo, **Then** no sheet appears and nothing is added.
7. **Given** the sheet is open, **Then** no second pick can be started; the buttons show busy.
8. **Given** a document is being added, **Then** nothing asks about visibility, now or ever.

### User Story 3 - A refusal is a way forward, not a dead end (Priority: P2)

If photo access is off, the gallery says so in words with the one action that can fix it, and the rest
of the screen keeps working.

**Independent Test**: deny the dialog twice (Android) or once (iOS), tap "Add photos": the notice offers
"Open Settings" and opens the app's page in Settings; after one denial that can still be asked again it
offers "Allow photo access".

**Acceptance Scenarios**:

1. **Given** access is denied and the system will no longer ask, **When** the traveller taps "Add photos",
   **Then** a notice "Photo access is off" with one action "Open Settings" is shown, and no picker opens.
2. **Given** access is denied but the system can still ask, **Then** the notice has one action "Allow
   photo access", which asks again and, if allowed, opens the picker.
3. **Given** the notice, **Then** it can be dismissed and the gallery, the camera and the FAB still work.
4. **Given** Settings cannot be opened, **Then** a sentence says so (as the camera notice already does).

### Edge Cases

- **Limited access** (iOS 14+ "Selected photos", Android 14+ "Select photos and videos") counts as
  allowed: the picker opens and offers what the traveller shared.
- **Android 13+**: `expo-image-picker`'s own library request asks nothing there (plan D6-02), so the
  request is made with React Native's `PermissionsAndroid` for `READ_MEDIA_IMAGES` (and
  `READ_MEDIA_VISUAL_USER_SELECTED` on 14+). **Android 12 and below**: the module asks for storage.
- The traveller revokes access in Settings while the sheet is open or later: the next "Add photos" asks
  or explains again; photos already added stay.
- The sheet is open and the screen is left or the app is closed by the system: if the screen unmounts,
  the photos are added private (no answer); if the process dies, the picker's cache copies are lost and
  nothing was written (nothing half-written: sync-protocol §4).
- A pick above 20 photos is cut short by the picker (existing limit); the sheet counts what came back.
- Some photos of a pick cannot be saved (no space, unreadable): the existing message names how many
  were added; visibility applies to those that were.
- Offline: a public photo is stored locally like any other and reaches the account when its bytes do.
- Largest text size and the four themes: the sheet scrolls; no text is clipped.
- A trip deleted while the sheet is open: the save fails and the existing "could not be saved" message
  says so; nothing is written.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: "Add photos" MUST check photo-library permission before anything else happens, and MUST NOT
  open the picker without it (owner decision 2026-10-22).
- **FR-002**: When the permission is undetermined, the system's dialog MUST be shown, with the
  platform usage string stating why (App Store Review 5.1.1(i)); any in-app line before it MUST be one
  sentence.
- **FR-003**: Granted, or limited (iOS, Android 14+), MUST open the picker.
- **FR-004**: When denied, the gallery MUST show the shared `PermissionState` pattern with one action:
  "Open Settings" (`Linking.openSettings`) when the system can no longer ask, "Allow photo access" when
  it can; it MUST be dismissible and MUST NOT replace the gallery.
- **FR-005**: The camera path MUST keep its own camera permission and MUST NOT require or request the
  photo-library permission.
- **FR-006**: When the library picker or the camera returns at least one photo, a bottom sheet MUST ask
  "Who can see these photos?" ("this photo?" for one) before anything is written.
- **FR-007**: The sheet MUST offer two radio-style choices: **Private** ("Only you"), selected by
  default, and **Public** ("Can appear on a trip you choose to share"; second line "Nothing is shared
  until you publish a trip"), and one primary button "Add N photos" ("Add 1 photo" for one).
- **FR-008**: Dismissing the sheet in any way MUST add the photos as private.
- **FR-009**: The choice MUST apply to every photo of that pick, and each photo MUST be stored with its
  own `is_public` (FR-053 of feature 001).
- **FR-010**: The sheet MUST NOT promise that public photos are visible to anyone now: one short line
  MUST say that sharing trips is not available yet and a public photo is seen only by its owner for now
  (the public trip view and automated screening are not built; FR-056 of feature 001).
- **FR-011**: Documents MUST never be asked about visibility.
- **FR-012**: `is_public` MUST be stored from the choice (default `false`), and MUST reach the account
  only as an ordinary local change through the existing sync push once the photo's bytes are registered;
  a photo whose choice was private MUST never be sent with `is_public: true`.
- **FR-013**: No photo content, filename or location MUST be logged or sent to diagnostics.
- **FR-014**: The sheet MUST be accessible: a `radiogroup` of two `radio`s with names and checked state,
  reachable in reading order, reduced motion honoured (no slide), body scrolls at the largest text size,
  correct in all four themes, closable with Android Back.
- **FR-015**: A cancelled picker, a picker that returns nothing, or a refused permission MUST add
  nothing and show no sheet.
- **FR-016**: One capture at a time: a second tap while a capture or the sheet is open MUST be ignored.
- **FR-017**: The native configuration MUST declare only the permissions this needs (plan D6-04), with an
  honest iOS usage string, and the release notes MUST say a new native build is required.

### Key Entities

- **Photo** (existing): gains no field. Its `is_public` (default `false`) is set at creation from the
  traveller's choice; `moderation_state` still starts `pending` and is only ever copied from the server.
- **Visibility choice**: transient, per pick (`private` | `public`), never stored beyond each photo's own
  flag.

## Privacy posture _(required by AGENTS.md)_

- **Default and structure.** Every photo is private unless the traveller selects Public in this sheet
  (FR-052). The choice is per photo (FR-053): the sheet sets the same value for the photos of one pick,
  each stored with its own flag, and a later story can change them one at a time.
- **What a public flag grants.** Nothing yet. The API's `photos_public_read` policy (migration 0005)
  admits a stranger only when `is_public = true` **and** `moderation_state = 'approved'` **and** the
  trip is itself public and live. No screening provider and no public trip view exist, so a public photo
  stays `pending` and unreachable by anyone but its owner (fail closed, FR-056). The sheet says so.
- **No new surface.** No table, endpoint, column, sync field or contract change. The flag travels in the
  existing `PhotoPushRecord.is_public` after registration, exactly as a refile does.
- **Photo-library access** is requested only to open the system picker and read the photos the
  traveller chooses; the app never browses, enumerates or uploads the library, and a photo's position
  and time are read from the chosen file only (Constitution IV). Contents and locations are never logged.
- **Documents** keep no visibility flag and are never asked (Constitution I).
- **Store disclosures.** The Play Data safety form and the App Store privacy label already list photos;
  the Play "Photo and video permissions" declaration is now required (`docs/release/store-readiness.md`).

## Success Criteria _(mandatory)_

- **SC-001**: With permission undetermined or denied, the system picker is never opened (tests assert
  `launchImageLibraryAsync` is not called on every refused branch).
- **SC-002**: Across every dismissal path (swipe, tap outside, Android Back, unmount), 100 % of picked
  photos are stored with `is_public = false`; with Public chosen, 100 % with `true`.
- **SC-003**: No photo whose choice was private is ever included in a push with `is_public: true`.
- **SC-004**: All existing test ids and accessible names are unchanged; the new ids are additive
  (`photo-visibility-sheet`, `photo-visibility-private`, `photo-visibility-public`,
  `photo-visibility-confirm`).
- **SC-005**: The sheet and the denial notice pass the reflow (1, 1.5, 2), four-theme and reduced-motion
  suites.
