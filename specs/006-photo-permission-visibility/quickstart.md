# Quickstart: device checks for the photo permission and visibility prompt

Nothing here can be proven in Jest: the permission dialogs, the system pickers and the permission
state kept by the OS belong to the platforms. **A new native build is required first** (the manifest and
the iOS usage string changed): `eas build --profile development` for each platform, then reinstall;
a JavaScript reload is not enough. Sign in, open a trip with at least one stop, open its photos.

Reset between runs: iOS, Settings, General, Transfer or Reset iPhone, Reset Location and Privacy, or
delete and reinstall; Android, `adb shell pm reset-permissions` or "Permissions" in the app's Settings
page, then Force stop.

## 1. Permission dialogs

| #    | Device                                                     | Do                                                    | Expect                                                                                                                                                  |
| ---- | ---------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | iOS 17 or newer, first run                                 | Tap "Add photos"                                      | The system dialog with the TripTrackr sentence appears **before** the picker; no picker yet                                                             |
| 1.2  | iOS, choose "Allow Full Access"                            | Tap "Add photos" again                                | The picker opens at once, no dialog                                                                                                                     |
| 1.3  | iOS, reset, choose "Limit Access..." and select two photos | Tap "Add photos"                                      | The picker opens (limited counts as allowed); record whether it offers only the shared photos or the whole library (the iOS picker runs out of process) |
| 1.4  | iOS, reset, choose "Don't Allow"                           | Tap "Add photos"                                      | A notice "Photo access is off" with one action "Open Settings"; no picker; "Open Settings" opens TripTrackr's Settings page                             |
| 1.5  | Android 14, first run                                      | Tap "Add photos"                                      | A system dialog "Select photos and videos" / "Allow all" / "Don't allow" appears before the picker                                                      |
| 1.6  | Android 14, choose "Select photos and videos"              | Tap "Add photos"                                      | The photo picker opens (limited counts as allowed); no second dialog                                                                                    |
| 1.7  | Android 14, reset, deny once                               | Tap "Add photos"                                      | A notice "Photo access is off" with "Allow photo access"; tapping it asks again                                                                         |
| 1.8  | Android 14, deny twice                                     | Tap "Add photos"                                      | A notice with "Open Settings" (the system no longer asks)                                                                                               |
| 1.9  | Android 13, first run                                      | Tap "Add photos"                                      | The "Allow TripTrackr to access photos and media on your device?" dialog (`READ_MEDIA_IMAGES`) appears before the picker                                |
| 1.10 | Android 12 or older                                        | Tap "Add photos"                                      | The storage dialog ("Allow TripTrackr to access photos, media and files") appears before the picker                                                     |
| 1.11 | Any                                                        | Tap "Take a photo" with the library permission denied | Only the camera permission is asked; the camera opens                                                                                                   |
| 1.12 | Any, document screen                                       | Add a document from the library                       | Unchanged: no photo question, no visibility question                                                                                                    |

## 2. The visibility sheet

| #   | Do                                                               | Expect                                                                                                                      |
| --- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | Pick 2 photos, leave the sheet as it is, tap "Add 2 photos"      | Title "Who can see these photos?", Private selected ("Only you"), the sharing-not-available line; both photos appear        |
| 2.2 | Pick 1 photo                                                     | Title "Who can see this photo?", button "Add 1 photo"                                                                       |
| 2.3 | Pick 2, select Public, tap "Add 2 photos"                        | Both appear; (developer check) both rows have `is_public = 1` in the local store                                            |
| 2.4 | Pick 2, swipe the sheet down (iOS)                               | Both photos appear, private                                                                                                 |
| 2.5 | Pick 2, press Android Back; repeat tapping outside the sheet     | Both photos appear, private                                                                                                 |
| 2.6 | Take a photo with the camera                                     | The same sheet appears; both choices work                                                                                   |
| 2.7 | Cancel the picker                                                | No sheet, nothing added                                                                                                     |
| 2.8 | Settings, Display size and text to the largest; Reduce motion on | The sheet scrolls, nothing is clipped, the sheet does not slide; TalkBack and VoiceOver read two radio buttons, one checked |
| 2.9 | Light, dark and both contrast themes                             | Selected and unselected rows are told apart without colour (ring and dot), the muted line is readable                       |

## 3. Visibility reaches the account, and nowhere else

1. Offline: add 1 private and 1 public photo. Both show "Waiting to upload".
2. Go online. Both upload; within about 30 s the public photo's row is pushed (developer check: the
   server row has `is_public = true`, `moderation_state = 'pending'`; the private one `false`).
3. Sign in as a second account and confirm neither photo is reachable by any route (privacy suite
   covers it; this is the human look).

## 4. Location in Android library photos (decides plan D6-06)

1. Pick a geotagged photo from the library on Android 13 and 14 and open it: record whether the viewer
   says it is filed by position or by hand (does the position survive?).
2. If the position is lost, that is the documented redaction. Only then decide whether to open a follow-up
   for `ACCESS_MEDIA_LOCATION` (declare, ask at runtime, read the original). Do not add the permission
   alone: without `MediaStore.setRequireOriginal` it changes nothing.

## 5. Store forms (owner)

- Play Console, App content, "Photo and video permissions": declare `READ_MEDIA_IMAGES`, explain that
  the traveller chooses photos to add to a trip, and expect a review.
- Data safety and the App Store privacy label: photos are already listed; confirm "Photos or Videos" is
  marked as collected and linked to the user.
