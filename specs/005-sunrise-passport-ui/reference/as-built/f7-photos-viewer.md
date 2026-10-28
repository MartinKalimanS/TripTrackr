# F7 Photos, objective 2: the photo viewer

Branch `feat/f7-photos-viewer` (from `feat/f7-photos`). Pictures read: `more/photo-viewer.png`, `more/photo-viewer-dark.png`
(and the prototype `extra/src/frames/photo-viewer.html`, `extra/screens.css` `.viewer .ambient .amb-scrim .vtop .vphoto
.vsheet .vmeta .vplace .vcap .vact .abtn`). Contract C5-26 `PhotoViewer`; UI-SPEC 9.2; task T549 (viewer part only).
Owner answer Q-11: pictured controls without a capability are drawn and show one toast.

## Audit list (picture / contract against the build before)

| Item                                                                     | Before                                             | Now                                                                                                                                                          |
| ------------------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ground                                                                   | the canvas, a scrolling `Screen`                   | `bg-toast-surface` (dark in all four themes) + the photo's thumbnail blurred 34 (`expo-image` `blurRadius`, scale 1.2) + `scrim-button` + top `Scrim`        |
| Photo                                                                    | 50 percent of the window, `MediaFrame md`, no zoom | a card (margin 20, radius 24, hairline, `overflow: hidden`) filling the room between the bar and the sheet; the zoom toolkit inside                          |
| Pinch zoom, double-tap zoom, pan                                         | none                                               | `Gallery` of `react-native-zoom-toolkit` (max 6, window 3), inside the new `components/ui/photo-viewer` adapter, the only importer of the toolkit            |
| Swipe between photos, "N of M" pill                                      | none                                               | `photos` + `onChange` props; pill only with more than one photo (no invented count)                                                                          |
| Pull down to close                                                       | none                                               | `onVerticalPull` worklet: released and (96 dp or 900 dp/s) closes through `scheduleOnRN`                                                                     |
| Close                                                                    | secondary text `Button` "Close" in the page        | glass 44 dp `IconButton`, named "Close photo", id `photo-viewer-close`, at left 20, top inset + 12                                                           |
| Share, More (top right)                                                  | absent (and a test said no share anywhere)         | `ComingSoonButton` glass, `coming-soon-share`, `coming-soon-more`                                                                                            |
| Place line, time                                                         | body text under the photo                          | place (headline, `photo-viewer-place`, "Filed under Roma, Italy") over the time (callout muted), pending/failed badge at the right, as `.vmeta`              |
| Mismatch note                                                            | callout under the place                            | kept, `photo-viewer-mismatch`, under the meta row                                                                                                            |
| Caption row (pen icon, input-like, 52 dp)                                | absent                                             | coming-soon row "Add a caption" (a prompt; no input, no stored or invented caption), `photo-viewer-caption`                                                  |
| Actions Share / Save copy / Delete (three 64 dp tiles, radius 16, cream) | one destructive `Button` "Delete"                  | three tiles; Share and Save copy coming-soon (`photo-viewer-share`, `photo-viewer-save-copy`); Delete real, danger ink, asks first (`Alert`), warning haptic |
| Sheet: paper, 28 dp top corners, 36 by 5 grabber                         | none                                               | `bg-surface`, `Radii.sheet`, decorative grabber; scrolls past 55 percent of the window so text scales 1.5 and 2 never push a control off                     |
| Filing chips, retry, upload detail, write error, private note            | present                                            | kept inside the sheet (`photo-file-<key>`, "Try uploading this photo again", `photo-viewer-error`)                                                           |
| Progressive loading                                                      | the full image only                                | the thumbnail under the full image (cross-fade 180 ms, none with reduced motion), natural size read from the first to load so zoom bounds are the photo's    |
| Honest error                                                             | text, no id                                        | `photo-viewer-image-unavailable` (text), the thumbnail does NOT stand in; `photo-viewer-error` stays the write-error region                                  |
| Status bar and safe areas                                                | `Screen` padding                                   | `StatusBar style="light"`; top bar padded by the top inset, the sheet by the bottom inset (from `SafeAreaInsetsContext`)                                     |
| Reduced motion                                                           | modal fade off                                     | modal `none`, snap-back duration 0, no cross-fade                                                                                                            |
| Android Back                                                             | `onRequestClose`                                   | unchanged (pinned)                                                                                                                                           |
| Toast inside the modal                                                   | n/a                                                | the modal's own `ToastZone` (a root toast would sit behind a native modal)                                                                                   |

## What changed

- `components/ui/photo-viewer.tsx` (new, + test): `PhotoGallery`, `ProgressivePhoto`, `pullClosesViewer`, `fitWithin`.
- `components/trip/photo-viewer.tsx`: rebuilt (same props, plus optional `photos` and `onChange`).
- `jest.setup.ts`: `import 'react-native-gesture-handler/jestSetup'` (a `GestureHandlerRootView` does not render under Jest without it).
- Tests: `test/app/photo-viewer.test.tsx` (new, 49 cases); `photo-screen.test.tsx` and `photo-screen-atlas.test.tsx` edited where the picture
  contradicts an old assertion: no Share anywhere (now: no publish/visibility control; Share is coming-soon), Close is a secondary
  "Close" text button (now the glass disc), Delete is the one `destructive` `Button` (now the tile), the image's first ancestor is the hairline frame (now the stage).

## Deviations

1. **Flag beside the place** (picture): not drawn. A photo's row has no country code; inventing one is not allowed.
2. **"Uploading 62%"** pill: the existing pending / failed badge. Bytes sent are not kept.
3. **"7 of 128" and swiping**: built, but `photos.tsx` (other objective) does not pass `photos`/`onChange` yet, so today the viewer
   shows one photo with zoom and pull-down. Wiring: `<PhotoViewer photos={gallery.photos} onChange={gallery.open} .../>`.
4. **Card shadow** (`shadow-2` in the CSS): not drawn; the existing rule "no shadow across a photograph" (FR-024/025) wins, and on the dark ground it is invisible.
5. **Ambient blur** uses `blurRadius` 34; `expo-image` blur is not CSS blur, so the look is a device check.
6. **Photo not full-bleed**: the picture and prototype draw a card on the ambient, so that is built (the brief said full-bleed).

## Device checks (owner)

- T511: pinch, double-tap, pan, swipe, pull down on Reanimated 4.5.1 and Gesture Handler 2.32 (the toolkit was written against 4.1.1 / 2.28), iOS and Android; the zoom feel, that a vertical pull at scale 1 does not fight the swipe, that a pan while zoomed does not swipe.
- Gestures inside the RN `Modal` on Android (the adapter owns a `GestureHandlerRootView`).
- The toast inside the modal on both platforms (the kit uses `FullWindowOverlay` on iOS by default).
- Progressive loading with a large JPEG: thumbnail first, no flash when it is replaced; 3 mounted photos' memory.
- `blurRadius` ambient in light, dark and increased contrast; the glass controls over a white photograph (P11, 3:1).
- Status bar icons are light over the viewer and restored to the app's style after closing.
- T512 (Apple Zoom latency) does not apply: the viewer is a state-driven `Modal`, not a route.
