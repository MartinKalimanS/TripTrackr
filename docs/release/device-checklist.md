# Device checklist: everything the owner must look at on a phone

Generated 2026-10-28 from the "device check" sections of the as-built notes (feature 005 F1 to F14, 006, 007).
Each block says where it came from; tick them off on one iPhone and one Android phone, in the light and dark
themes, at the largest text size, and with increased contrast. The gates they close are T507 to T512, T547,
T563, T566, T570 and T613. Record the outcome in `docs/roadmap/PROGRESS.md` and the feature's as-built note.

## Read this first: decisions that changed what you should see (newest wins)

- **Tab bar on Android** is the floating pill, the same as iOS (owner decision 2026-10-24). Ignore the checks of
  the flat Material bar in the F3 Android note; check instead that the pill floats at `max(inset - 10, 12)` over
  the bottom edge on gesture navigation and on three-button navigation, over the globe and over a list.
- **Empty Home** has no card and no "0 of 195 countries": the globe, the sheet at zero and the one "Plan a trip"
  button (feature 007). Ignore any check that expects the invitation card, its frames or the "Welcome" greeting.
- **Distances** are always kilometres, whatever the phone is set to; the number grouping follows the language.
- **Text** now draws in the Sunrise faces everywhere (the 004 text roles are gone, T564): look at the empty-state
  card, sign-in and sign-out warnings, document camera screens, photo viewer captions, city and anchor pickers and
  the conflict notice.
- **First-run tour** (feature 007): see its block at the end.

---

## F1 Map, objective 3: the Home header and the coming-soon control

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f1-map-header.md`_

### Device checks for the owner

1. Home light, 100% text: the search disc sits at the right of the sync chip, both vertically centred; with nothing to sync
   only the disc shows. Compare the date/greeting position with `home.png`.
2. The name ("Marta") is coral (`accentText`) and serif italic.
3. Tap search: one toast "Search is coming soon" above the tab bar (is it clear of the sheet at peek, half?); tap twice
   quickly: still one toast. TalkBack/VoiceOver read "Search, button, Not available yet".
4. Move the globe: the recentre disc appears at the left margin about 20 dp under the header; it does not move the planet.
5. Text size 1.15 and larger: chip above search, right-aligned, 8 dp apart; the greeting wraps to two lines at most.
6. Offline: chip with the wifi-off glyph, the banner under the greeting. Dark theme and increased contrast: search disc and chip
   are legible over the sky.

---

## F1 Map, objective 2: the pins and the callout (as built)

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f1-map-pins.md`_

### DEVICE checks for the owner (V2, T508)

1. Do the photo roundels appear on both platforms, with the right colours (no washed-out or dark PNG), a white ring, a soft lift?
2. A trip without a photograph: a coral, amber or blue gradient with its country code in white. Palette stable between launches.
3. The live trip: coral ring with the pulse growing out of it; ONE ring, not two; the card 42 dp from the pin.
4. Planned trip: dashed amber ring on iOS, solid on Android.
5. Dark theme: white-ish ring, light callout card, light cluster disc.
6. Many trips: dots cluster with "+N"; the count font renders (`DIN Pro Bold` glyphs from the style); first paint is not janky while
   badges are captured in batches of 12.
7. Roundels do not flash back to dots when the sheet moves or the theme flips (the keys include the scheme).
8. If anything misbehaves, set `roundelsEnabled` to `false`.

---

## F1 "Map", objective 1: the look of the Home globe (as built)

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f1-map-style.md`_

### DEVICE checks for the owner (iOS and Android)

1. Sky: does the peach to aqua gradient with the top right glow show BEHIND the planet? If the background is black or flat,
   `spaceColor` alpha 0 is not see-through on that platform: set `GlobeStyle.*.atmosphere.spaceColor` to the opaque sky
   colour (`#FFE6D0`, `#0A1626`); the gate's transparency test is then the one to change.
2. Halo: width and brightness against `home-peek.png` (tune `horizonBlend` .2 to .3, then `color` and `highColor` within the
   gate); the night halo should read teal, as bright as the gate allows.
3. Sea and land tone in day and night (the Standard lighting may shade `colorLand` and `colorWater`): compare with the
   pictures and retune `water`, `land`, `adminBoundaries`.
4. The 10 degree graticule: fine on the planet, gone by zoom 4; not busy on a small phone.
5. Visited and planned outlines: coral, and dashed amber, each on a white (night: navy) edge, no seams where countries meet.
6. No country, ocean or city names on the whole planet; they come back at zoom 5.
7. Arc gradients, planned dashes and journey legs still as before.

---

## F2 Home sheet, objective 2: the content at peek and half

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f2-sheet-content.md`_

### DEVICE checks for the owner

- Half: figures row against `home.png` (a chevron after all three labels, 14 /195, hairlines at the column edges).
  Tap Kilometres: one toast "Kilometres is coming soon".
- Now card: 24 dp corners, 8 dp padding, halo around the coral dot, 6 dp dots (two coral, one ringed, five grey).
- Peek: 56 dp thumbnail, "Portugal Road..." on one line, the card clear of the mini FAB; the up chevron once `onExpand` is wired.
- Font scale 1.15 and 2 (iOS Larger Text, Android font size): figures in one column, card title and line on two lines, 48 dp thumbnails.
- Dark and Android: halo tint, ring colours, same layout.

---

## F2 Home sheet: the Countries list (full position), as built

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f2-sheet-countries.md`_

### Device checks for the owner

1. Sheet at full: heading, subtitle and the round search button sit as in `home-full.png`; the sticky label "EUROPE · 9"
   stays under the sheet top while scrolling and its hairline is inset 20 dp.
2. Tap the search button: the field appears focused, the keyboard opens, the list filters; tap again: the field goes and
   everything is back.
3. Rows: flag 28x20, "2 trips · last Oct 2026", chevron; the last row scrolls clear above the tab pill.
4. A country with a trip still ahead says "planned <month>"; the live-trip country shows "Now".
5. Text size at 1.5x and 2x: names and second lines wrap, flags keep their size, nothing clips; dark and contrast look.
6. Android: 16 dp side margins; TalkBack finds "Collapse the countries list" in the heading and activates it.
7. Tap a country: the sheet lowers to half and the globe flies to it.

---

## F2 Home sheet, objective 1: the sheet shell and the Home states around it

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f2-sheet-shell.md`_

### Device checks for the owner

- Half sheet offline (airplane mode with a pending change): the banner is the first row in the sheet, the figures move down, the chip stays in the header.
  Lower to peek: the banner moves under the greeting. Failed sync: Retry in the chip and in the banner.
- Sheet edge reads as a 1 px line on light and dark; handle 36x5 (iOS) and 32x4 (Android), tap and drag.
- FAB: 52 dp pill on iOS, 56 dp rounded square on Android; at the largest text size its words stop growing.
- Empty Home (new account): "Welcome", "0 of 195 countries", the card with three cream frames over its top, "Find trips in my photos" shows a toast and does nothing else.
- Loading (kill and relaunch with a slow store): the skeleton sheet's top is where the half sheet will be, with no jump when the real sheet arrives.

---

## F3 Tab bar, Android navigation bar: as built

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f3-tabbar-android.md`_

### Device checks for the owner (Android phone)

1. Gesture navigation: the bar is about 88 dp, the indicator starts 12 dp below the hairline,
   the gesture pill sits under the label, nothing overlaps.
2. Switch to three-button navigation: the bar grows to 64 dp + the buttons' height, edge to edge,
   and the cream ground runs behind the buttons.
3. Selected tab: coral wash behind a FILLED icon, about 26% light and 28% dark, `ink` label; the
   others outline, grey-blue label, same weight.
4. Hold a tab without releasing: the capsule behind its icon greys, not the whole tab.
5. Large text (Settings, Font size at maximum): the bar grows, nothing clips, labels wrap.
6. Home: the "New trip" button floats 16 dp above the bar's hairline; Trips list ends clear of it.
7. Dark theme and a contrast theme: cream becomes navy, hairline stays one line.

---

## F3 Tab bar, objective 1: the iOS floating pill

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f3-tabbar-ios.md`_

### DEVICE checks for the owner (iPhone)

1. iOS 26: the glass pill over the globe and over a list: legible labels over a bright sky, and no doubled rim now that the glass also has the
   hairline and `lift2` (if it doubles, take `ring` off the `GlassView`, one line in `tab-surface.tsx`).
2. iOS 18 or earlier (or Settings > Accessibility > Display > Reduce Transparency off, with an older phone): the blur pill, dark theme: lighter
   navy than the ground, as `home-dark.png`.
3. Reduce Transparency on, and Increase Contrast on, light and dark: opaque pill with a visible ring.
4. The three glyphs against `home.png` (globe with meridians, rolling suitcase, person); label size and weight; selected capsule coral (light),
   grey-white (dark).
5. Tap each tab: the capsule springs, one light selection tick; tapping the current tab ticks nothing.
6. Text size at maximum: labels stop growing at 1.3x and wrap; the pill grows.
7. Fade above the pill on Trips with a long list, in light and dark (the picture's fade is faint).

---

## F4 Trips cards: as built (objective 1 of 2, the CARDS)

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f4-trips-cards.md`_

### Device checks for the owner (iPhone and Android)

1. Hero over a bright photograph and a dark one: the white pill, the live dot, the dashed strip and the caption are
   all legible; the top of the photograph is NOT darkened.
2. Hero with a generated cover (a trip without photos): the amber corner, the stamp with its code, the big ghost
   code bottom right; three different trips show the three palettes.
3. A pending trip: the "Not yet synced" badge on the hero, the ticket and the rows.
4. Ticket: the two notches sit on the card edge over the dashed line; at the largest text size it becomes a column.
5. Dark theme and increased contrast: the white pill, the stub edge, the ring round the hero.
6. Text size 1.5 and 2: titles wrap, nothing clips, the strip labels stay on one line.

---

## F4 Trips cards and list, the screen: as built

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f4-trips-screen.md`_

### Device checks for the owner

1. iPhone: "Trips" large title collapses on scroll; sync chip and Search sit at the trailing edge of
   the bar, 8 dp apart, vertically level with the title as in `trips.png`.
2. Tap Search: ONE toast "Search is coming soon" 16 dp from the sides, 8 dp above the tab pill (not
   behind it); the "Plan a trip" button rises above it and comes back after 5 s. Tap again while it
   is up: no second toast.
3. Android: standard header, 16 dp list margin, rounded-square button 56 dp, toast above the bar.
4. Scroll to the end: the last card stops 172 dp (176 Android) above the bottom edge, clear of the pill
   and the button; at text size 2 the button stays about 53 dp.
5. A 200+ account: the year strip sits at top 250 on the right edge (check it is not under the header
   on Android, where the scene starts below a 56 dp bar).
6. Loading, offline, failed-sync states in light, dark and a contrast theme; rows in the skeleton are
   72 dp apart in rhythm with the real rows.
7. Bring up a keyboard over the tab (not reachable from this screen today): the button disappears.

---

## F5 Trip screen, objective 2 (the stops and the states): as built

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f5-trip-stops.md`_

### Device checks for the owner

1. Compare iPhone 15 (390 x 844) with `trip.png`, `trip-dark.png`, `trip-long.png`: node, spine,
   thumbnails and the Add stop row at the pictured positions; selecting a day shows a tile that
   does not move the text.
2. Text size 1.5 and 2: the Stops heading wraps with the toggle under it; node figures do not clip;
   the dates line wraps; the three controls wrap under the text.
3. Drag a stop by its grip with the list long enough to scroll: auto-scroll still works; numbers
   and rail go neutral while carried.
4. Map segment: one toast, List stays selected.
5. A trip with no stops: the plane sits centred in the dashed rings in light and dark.
6. Android: same rows (list margin 20 here, the sheet's own padding).

---

## F5 Trip screen, the top (header, hero, bar, progress, areas, day chips): as built

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f5-trip-top.md`_

### Device checks for the owner

1. iPhone: transparent header over the picture: Back at the left, Share and More at the right, 20 dp from
   the edge and level with Back (iOS 26 may wrap native header items in its own glass; check there is no
   double disc).
2. Scroll until the bar is complete: the bar fades in, then the three discs become bare ink glyphs on the
   bar (no flash of a dark disc on white); scroll back: the discs return.
3. Tap Share, then More: ONE toast each, no second toast while it is up; nothing opens.
4. The day chips pin 12 dp under the bar with 8 dp and a hairline below; tap a day: the first stop lands
   just below the hairline, not under it.
5. Scale 1.5 and 2: areas in two columns, the privacy line wraps beside its lock, the title grows upward in
   the hero, nothing clips; chips stay 56 dp min.
6. Dark, increased contrast, Android: tokens only; on Android the standard 56 dp header holds the three controls.
7. Sync error: Photos tile ringed in danger with the dot, "Retry" in the sync chip and the banner.

---

## F6 Forms, objective 2: the stop editor (as built)

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f6-forms-stop.md`_

### 5. DEVICE checks for the owner

1. Compare `add-stop.png` / `-dark` / `-kb` / `-scale1.5` / `-long` with the sheet on a 390 x 844 device (place field,
   route preview, dates block, stepper, chips, Note, sticky Save) in light, dark and both contrast themes; Android too.
2. **The coming-soon toast inside the page sheet.** The toast host is in the root tree; an iOS page-sheet `Modal` is a
   separate window, so the "... is coming soon" toast may be hidden behind it. If so, the toast needs a host inside
   `FormModal` (the shell objective's file).
3. Flag glyphs (Portugal, Italy, United Kingdom, United States) clipped in the 28 x 20 chip on both platforms.
4. Android date dialog from the new halves: `Previous month`, `Next month`, day cells (`03-globe`, `01-account-and-trip`).
5. Large text (1.5 and 2): the halves stack, the stepper drops under its words, the chip row scrolls, Save stays above
   the keyboard.
6. The 44 dp target of the 28 dp clear disc (VoiceOver and TalkBack focus frames).

---

## F6 Forms, objective 1 (the form sheet look, New trip, Add expense): as built

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f6-forms-trip.md`_

### DEVICE checks (the owner)

1. iOS: the sheet radius (28), the native grabber over the header (the header starts 8 dp below the
   top), the header centring at 390 dp and with "Only you", Cancel's tap area.
2. iOS and Android: New trip fits 844 dp with the keyboard down and, with it up, the name field and Save
   stay visible; the Maestro flows `01` to `05` still tap `currency-EUR` without scrolling (the chips sit
   below the three pictured rows: on a short phone `tapOn` may need a scroll).
3. The coming-soon toast appears INSIDE the form sheet (iOS draws it in a full-window overlay; Android
   draws it in the root and may sit behind a form sheet).
4. Add expense: the decimal pad's separator, the 56 dp figure at text scale 1.3 and 2 (capped at 1.3,
   one line), the caret colour, Save above the keypad on iOS and Android.
5. Dark and contrast: the dashed chips and the cover tile edge (`border`), the footer hairline.
6. The "Add note, date or place" row: expanding scrolls the day, city and note into view above the keypad.

---

## F7 Photos, the shared area chrome and the screen: as built

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f7-photos-screen.md`_

### Device checks for the owner

1. iPhone and Android: the header sits under the status bar as in `photos.png` (Back disc, select-all and more at the end, title
   and subtitle); the camera disc is the extra control.
2. A day of 14 photographs: five tiles and `+9`; tap it and the whole day opens; tiles are 114 dp on a 390 dp phone (Android 16 dp margins:
   about 117).
3. Offline: a photograph taken offline shows the dashed cloud disc and the line "N waiting to upload"; online it gains the tick for five
   minutes and the line goes. A failed upload (turn the server off) shows the Retry pill and "1 failed"; Retry on the pill and on the line.
4. Text size 1.5 and 2: three columns hold, the summary wraps with Retry under it, the FAB label stops at 1.3.
5. TalkBack and VoiceOver: each day is one header; a tile is read with its state; the `+N` tile reads "9 more photos from ...".
6. Dark and both contrast themes: the Retry pill (`danger` with `dangerInk`), the discs and the `+N` scrim over bright photographs.

---

## F7 Photos, objective 2: the photo viewer

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f7-photos-viewer.md`_

### Device checks (owner)

- T511: pinch, double-tap, pan, swipe, pull down on Reanimated 4.5.1 and Gesture Handler 2.32 (the toolkit was written against 4.1.1 / 2.28), iOS and Android; the zoom feel, that a vertical pull at scale 1 does not fight the swipe, that a pan while zoomed does not swipe.
- Gestures inside the RN `Modal` on Android (the adapter owns a `GestureHandlerRootView`).
- The toast inside the modal on both platforms (the kit uses `FullWindowOverlay` on iOS by default).
- Progressive loading with a large JPEG: thumbnail first, no flash when it is replaced; 3 mounted photos' memory.
- `blurRadius` ambient in light, dark and increased contrast; the glass controls over a white photograph (P11, 3:1).
- Status bar icons are light over the viewer and restored to the app's style after closing.
- T512 (Apple Zoom latency) does not apply: the viewer is a state-driven `Modal`, not a route.

---

## F8 Spending: as built

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f8-spending.md`_

### Device checks for the owner

1. iPhone and Android: header as in `expenses.png` (Back, chip, more), hero numeral with the sign raised, pill, bars with today in navy, category
   bar and legend; the FAB over the last row.
2. Maestro `02-notes-and-expenses` and `10-b-large-snapshot-resume`: `summary-total` text `1.?100.00` is matched through the accessible name on iOS and
   Android; `20.00` in rows; Delete is reached by a tap on the row first (no flow does it).
3. Text size 1.5 and 2: pill wraps, legend wraps over lines, bar columns widen and the chart scrolls; the numeral stops at 1.3.
4. Dark and both contrast themes: the Shopping and custom colours (muted, subtle inks) against the canvas as bar segments (not gated yet).
5. TalkBack and VoiceOver: the chart and the category bar are one image each with a sentence; each day heading names the day and its total.

---

## F9 Notes, the area and the editor sheet: as built

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f9-notes.md`_

### Device checks for the owner

1. iPhone and Android: header as `notes.png` (Back disc, search disc, title, trip line), cards as pictured, "Today" and dates.
2. Write a note offline: the card says "On this device" with the cloud; online it becomes the tick. Edit one: the sheet shows the
   state under the title and the date chip.
3. Keyboard: with the editor open on a small phone, the format strip and Save sit above the keyboard; the body scrolls; Dismiss
   keyboard works.
4. The coming-soon toast for the five strip controls appears above the editor's modal (the stop editor has the same question).
5. Text scale 1.5 and 2: the title takes two lines, the foot row wraps, nothing clips; the FAB label stops at 1.3.
6. TalkBack and VoiceOver: each day is one header; a card reads title, place, preview and offers Edit and Delete; the sync
   glyph has its name.
7. Dark and both contrast themes: amber ink on the cream tile, the tick, the trash.
8. Maestro `02-notes-and-expenses`: `notes-add`, `note-editor-*`, "Edit Cheese" and the filter chips still resolve (not run here).

---

## F10 Documents, the list, the viewer and the capture screens: as built

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f10-documents.md`_

### Device checks for the owner

1. iPhone and Android: the list and viewer sit under the status bar as in `documents.png` and `document-view.png`; Android margins are 16 dp.
2. The notches: half circles on the perforation at the top and bottom of each ticket, the canvas colour in light AND dark (no visible
   seam); on Android the dashed perforation stays dashed (a one-sided dashed border can draw solid on some devices).
3. The hero over a real boarding-pass photo: the barcode sits on pure white in dark mode, is not blurred by the -1 deg tilt, and a
   second phone can scan it from the screen.
4. Text size 1.5 and 2: tickets stack, nothing clips; the FAB label stops at 1.3.
5. Screen capture is still blocked on the list, the viewer and the capture screen (a screenshot is black on Android).
6. Maestro `05-photos-and-documents`: "No documents yet", the `documents-add` tap, the confirm form, "Uploaded to your account.",
   `Back` on the viewer, "Boarding pass" and "AC834 · ..." on the list.
7. VoiceOver / TalkBack: a ticket reads "Boarding pass. AC834 · date. Check these details. Not yet synced. Added date" as one button.

---

## F11 Offline maps: as built

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f11-offline-maps.md`_

### DEVICE checks for the owner

1. Compare light, dark and both contrast themes with the pictures; text scale 1.5 and 2 (rows and the head wrap).
2. Android: FAB clearance over the gesture bar; free-space figure shown (Paths.availableDiskSpace).
3. Download a city, watch it move to "Downloaded" and the bar grow; remove it with the trash icon.
4. Airplane mode: the screen and saved maps still work.

---

## F12 Apple: Sign in with Apple drawn by Apple, as built

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f12-apple.md`_

### DEVICE checks the owner must do (Jest has no pixels, no Apple logo and no VoiceOver: none of these is claimed)

1. **Welcome, light and dark, iOS:** the native button against `welcome.png` / `welcome-dark.png`: black / white, 52 dp, capsule, the
   same width as Google, the logo and title Apple's (system font, larger than the picture's 17 dp label), no outline.
2. **Text scale 1.5 and 2 (and 1.15):** the frame grows with `pillMinHeight` (66 dp, 88 dp); the title and logo scale with it and the title
   still fits ("Continue with Apple" in about 350 dp at 88 dp high may be shrunk or truncated by the system: confirm it is not clipped
   badly). At scale 2 Google's label may wrap to two lines and be taller than Apple's frame: confirm the pair still reads as equal.
3. **Increased contrast (both) and Android:** black on white and white on navy read; Android shows Google and email only, no Apple.
4. **Maestro / testID:** on a device build, `tapOn: { id: 'apple-sign-in' }` (iOS) finds the native button, and `assertVisible` works.
5. **Device language:** set the device to another language (for example German or Portuguese); Apple's title is translated on all three
   screens (needs `CFBundleAllowMixedLocalizations`, which the config plugin writes; check the built `Info.plist`).
6. **VoiceOver:** the button is read in the device language as a button; while a sign-in is in flight VoiceOver reads the English
   title as unavailable and busy, and "Signing in with Apple..." is announced once; Google stays reachable.
7. **Sign in with Apple end to end** on a real device from Welcome, Sign in and Create account: the sheet, a cancelled sheet (says
   nothing), a refusal (said inline), and a first sign-in with a name.
8. **Busy look:** the busy button is not dimmed (the work stays readable) and the disabled one (another sign-in under way, or the
   form submitting) is; confirm both read.

---

## F12 Welcome, sign in, create account: as built

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f12-auth.md`_

### DEVICE checks the owner must do (Jest renders no styles, no fonts and no real SVG paint)

1. **Welcome, light and dark, iOS and Android:** compare with `welcome.png` / `welcome-dark.png`: sky, globe size and position
   (disc top 73 dp below the status bar, radius 0.654 x width), coral countries and arcs, the stamp (does `TextPath` draw
   "FIRST STAMP" and the date on a device, as `Stamp` device check V5), the sheet's top corners and lift, the wordmark mark.
2. **Brand buttons:** Apple black / white and Google light / dark against Apple's HIG and Google's branding guidelines; swap the
   Apple glyph for Apple's artwork before release (store-readiness "Branded sign-in buttons"). **Done in code, see `f12-apple.md`
   (its DEVICE checks replace this one for Apple).**
3. **Sign in with Apple on a real iOS device and Google on both platforms, started from Welcome**, including a cancelled sheet
   and a refusal (error shown inline under the buttons).
4. **Text scale 1.3, 1.5 and 2 on Android** (`01-appearance`): Welcome scrolls; `assertVisible` on `welcome-sign-in` and
   `welcome-create-account` needs them on screen. If a flow run fails at the largest scale, add a `scrollUntilVisible` to the
   flow (not edited here) rather than removing the link. Run `01-account-and-trip`, `01-appearance`, `02` to `05`, `00-smoke`
   and `offline/00-a-setup-account` (tap by id, unchanged).
5. **Increased contrast:** the Apple / Google buttons are the brands' fixed colours; confirm the lines read on both grounds.
6. **Keyboard:** the forms are unchanged (keyboard-aware scroller, return key submits); confirm the summary, then the focused
   field, scrolls above the keyboard after tapping a summary link.
7. **TalkBack / VoiceOver:** the summary is announced once (assertive live region on Android, `announceForAccessibility` on iOS);
   the globe, mark and stamp are skipped; the legal links read as links; "Forgot password?" reads "Not available yet".
8. **Owner decisions left open:** the real Terms and Privacy URLs; whether a turning globe is wanted; whether the pictured
   "or with email" order (social above the form) should replace UI-SPEC 7's "under the form".

---

## F13 You (identity, passport, stamps, groups): as built

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f13-you.md`_

### Device checks for the owner

1. iPhone 15 and an Android phone: the screen against `profile.png` / `profile-dark.png`: identity row, switch, navy card (gradient,
   amber corner, rings), recap row, stamps page with its notch; the second column 20 dp lower; margins 20 (Android 16).
2. The stamps in the real face: curved text on the circle and scallop, the wear holes (V5), the notch colour against the canvas in
   dark, and that a stamp multiplies into the cream page in light only.
3. A passport of 100+ countries (or temporarily lower `STAMP_RASTER_FROM`): the baked stamps keep colour, transparency and tilt on both
   platforms, scrolling stays smooth, and the page fills in without a jump (V2/V5; view-shot of a hidden, laid-out view).
4. Stamp landing: a country first arrived in the last 7 days comes down once per launch with the heavy haptic; none with Reduce Motion.
5. Text scale 1.5 and 2, all four themes: figures stack in one column from 1.15 and shrink rather than clip; the identity name wraps;
   the period pill does not clip (five or more years scroll).
6. Share, Settings and the recap row each show one "is coming soon" toast above the tab pill and do nothing else.
7. `offline/11-a-sign-out-unsynced` on a device: the scrolls reach Sign out and the warning; Stay, Sign out anyway and the online push all
   still behave (unchanged guard). Delete account still says "Coming soon".
8. iOS: no large title on this tab, the name is the heading to VoiceOver; Android: standard "You" header with the content below it.

---

## F14 Accessibility sweep (T560), as built

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f14-a11y.md`_

### DEVICE checks (not run; the owner does them, T560)

None of this was run on VoiceOver or TalkBack. Do it on the oldest supported iPhone and on an Android phone, light and dark, at the default
text size and at the largest.

**Walk script** (swipe right to move, double-tap to activate; note anything unnamed, read twice, out of order or missed):

1. **Home.** Heading "Hello, name"; "Search" says "Not available yet". The globe is ONE element: "Globe showing N trips across M countries.
   Every trip is also listed in the Trips tab." Open the actions (VoiceOver rotor, Actions; TalkBack actions menu): Next trip, Previous
   trip, Recentre the globe, Open countries; Next trip says the trip's name aloud. The three figures are announced ONCE each with the
   final value ("14 of 195 countries", "22 trips", "61,480 kilometres travelled") while they count. The sheet handle "Countries and trips"
   says Peek, Half or Full and offers More and Less. Open countries: the list is reachable without dragging, each row "Portugal, 2 trips,
   last visited Oct 2026", the continent labels are headings; swipe to the LAST country (it must be there); "Collapse the countries list"
   works. Question for the walk: does the handle read first, last, or in position?
2. **Trips.** "N trips"; the filter reads as tabs with their counts and which is selected; each card "title, status, N stops"; the year headers
   are headings with "N trips, 9,380 kilometres"; swipe to the LAST trip of a long list (200 trips): it must be reachable; "Plan a trip"; the
   year strip is adjustable.
3. **A trip.** Back and the title announced ONCE; the status; the five areas "Photos for this trip"... and the privacy line; the stops
   "Stop 1: Roma, Italy. dates" with Move up, Move down, Edit dates, Remove stop among the actions; "Add stop"; where the day strip reads
   (after the stops in the tree: better there or in position?); no stop number, spine or thumbnail read separately.
4. **You.** The name is a heading; "Traveller since 2021"; the period switch reads as radios with the selected one; each passport figure is
   one stop, in words; each stamp "Stamp: Portugal, 12 October 2026" and nothing of its art; the order of the stamps (column by column or row
   by row?); Account and App as headings; "Sign out" and "Delete account" (unavailable).
5. **Both platforms:** Welcome (one heading, the ways in), Sign in and Create account (is each field read twice?), a form (Cancel, title,
   fields, Save), a photo grid (each photo says its upload state), the document list, offline maps.
6. **Switch access or a keyboard:** every control reachable, a visible focus ring at 3:1.
7. **A language change:** set the device to German with the app open, return: figures group as "61.480" and months follow (deviation 5).

---

## F14 Retire Atlas (T564): as built

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f14-atlas.md`_

### Device and owner checks

None: no screen, style or token value changed. Check that the contrast themes, the Home statistics and the photo gallery look as before
on the next device run (T566); they were not touched.

---

## F14 Delight (count-up policy, stamp landing, pulse, haptics): as built

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f14-delight.md`_

### Device checks for the owner

1. Home: pull the sheet to half: the three figures count one after another in under a second; pull to peek and back to half: they count again; with
   a trip added or synced while the sheet is at half they change without a replay. VoiceOver / TalkBack reads "14 of 195 countries" once, never
   "3, 17, 42".
2. You: open the tab: the four passport figures count once; switch the period: the figures change at once; leave the tab and return: no replay.
3. A country first arrived in the last 7 days (and a second and third): the stamps come down newest first about 120 ms apart, each with its own firm
   thud, once per launch; the second visit and a period switch do not play them; kill and reopen the app: they fall again.
4. The live pin pulses slowly on Home (iOS, Android), pauses with the app in the background.
5. Haptics, iOS and Android: the sheet gives one tick per change of detent and none when a drag springs back; one tick per tab change and none on the
   current tab; one per chip, segment or year change and none on the selected one; nothing during a scroll.
6. Reduce Motion (iOS) / Remove animations (Android): no count, no pulse (a faint still ring), no stamp animation, no haptic anywhere above.

---

## F14 Text-scale sweep (T561): as built

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f14-scale.md`_

### DEVICE checks (listed, not claimed)

1. iOS largest accessibility size (Settings, Accessibility, Display and Text Size, Larger Text, maximum) and Android 200 percent
   (Display size and text, Font size; and the `01-appearance` flow at `font_scale 1.3` and `2.0`), each in light, dark and both contrast
   themes, on: Home (peek, half, full), Trips, a trip, the stop editor, Add expense, Photos, Spending, Notes, Documents and a document,
   Offline maps, You, Welcome, Sign in, Create account. Look for clipped, overlapping or hidden text and unreachable buttons.
2. Welcome at 1.3, 1.5 and 2: the stamp is gone from 1.3, the sheet rises over the globe, Apple (iOS), Google, Continue with email and
   the Sign in link can all be scrolled to and tapped; run `01-appearance` (it now scrolls first) and `01-account-and-trip`.
3. The per-day chart: the tallest bar's top and both label lines whole at 1.3 and above; the chart scrolls sideways.
4. The stop editor's route preview with real cities at 2: the codes whole.
5. Photos at 2 with a day of 100 or more photographs: the `+N` tile shows the whole count (shrunk).
6. Home half at 2 (the open question above): what the traveller sees at half and at full.
7. Tab pill and Android bar at 2: labels wrap, the pill grows, nothing is cut; labels stop growing at 1.3.
8. Period switch with five or more years at 2: segments wrap and the pill scrolls.

---

## F14 State sweep (every route: loading, empty, error; denial; no handler; Tier 3): as built

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f14-states.md`_

### DEVICE checks (the owner)

1. **Camera refused, both places.** Turn the camera off for TripTrackr in the phone's Settings. Add a document: the card says the
   camera is turned off, "Open Settings" opens the app's page (iOS and Android), and "Choose from library" still works. Photos, the
   camera disc: a notice with "Open Settings" and "Dismiss"; "Add photos" is still the coral button. Turn the camera on again and reopen
   Add a document: the camera shows (the system may restart the app when a permission changes).
2. **VoiceOver and TalkBack.** The denial is read once when it appears (polite live region); "Back to your trips", "Back to
   documents", "Back to the trip" are read as buttons; "Download a new area" is read with "Not available yet"; the document skeleton is
   one "Loading the document" region, not a stack of anonymous boxes.
3. **Skeleton.** Open a document on a cold start: the card and rows shimmer, still under reduced motion, and the document replaces
   them without a jump.
4. **Four themes** (T562) for the permission surface, the three new buttons and the document skeleton.
5. **Text scales 1.5 and 2** (T561): the permission surface and the empty-state buttons wrap and never clip.

---

## F14 Themes, motion and transparency sweep (T562): as built

_Source: `specs/005-sunrise-passport-ui/reference/as-built/f14-themes.md`_

### Device checks (not claimed)

D1. iOS, app open: Settings > Accessibility > Display and Text Size > Increase Contrast, Reduce Transparency; Motion > Reduce Motion;
Display and Brightness > Dark. On Home, Trips, a trip, a form sheet: each change repaints without leaving the app; the pill goes
from glass or blur to solid at once; no haptic after Reduce Motion; nothing stays in the previous theme.
D2. Android, app open: dark mode, High contrast text, Remove animations: same checks on the Material bar and the list screens.
D3. iOS 26 Liquid Glass: Reduce Transparency swaps the `GlassView` for the solid pill with no flash (T510, V4).
D4. The globe and map lighting, the sky, the status bar and the sheet change together with the theme (FR-078): Mapbox is not drawn
under Jest.
D5. The kit's shimmer in the two contrast themes (`skeletonHighlight`, translucent highlight over an opaque bone): decide whether it is
acceptable or the highlight should be solid there; class-level opacity of disabled controls and the toast countdown.
D6. Frame rates and the sheet drag after the `useColors` store subscription (T563 baselines).

---

## As built: photo permission and photo visibility prompt (spec 006)

_Source: `specs/006-photo-permission-visibility/as-built.md`_

### Device checks (not done: they need a phone and the new native build)

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

---

## 007 First-run tour: as built

_Source: `specs/007-first-run-tour/as-built.md`_

### Device checks the owner must do

1. Create an account on a phone: the globe is open (no card, no "0 of 195 countries"), the tour starts, each
   step lights the right control on iOS and Android (totals, Plan a trip, Trips tab, You tab), Next and Done work.
2. The X, Skip and the Android back button close it at every step; it does not return after a restart.
3. You > Take the tour replays it from step 1. A sign-in with an account that has trips shows no tour.
4. Largest text size: the card scrolls and every button stays reachable; TalkBack and VoiceOver read the card
   (TalkBack may still reach controls behind the dim: look at it).
5. The ring and the totals row line up after the sheet settles (the overlay measures again after 350 ms).
