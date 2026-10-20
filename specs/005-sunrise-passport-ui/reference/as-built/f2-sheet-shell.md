# F2 Home sheet, objective 1: the sheet shell and the Home states around it

Branch `feat/f2-sheet-shell` (from `feat/f2-sheet`). Pictures read: `home-peek`, `home`, `home-full`, `home-empty`,
`home-loading`, `home-offline`, `home-error`, `home-android`, `home-scale2` (prototype CSS: `.sheet`, `.grab-zone`, `.grab`,
`.fab`, `.fab.mini`, `.tabbar-fade`, `.banner`, `.invite`, `.fan`).

## Audit list (picture / CSS against the build)

| Item                                                                 | Before                                          | Now                                                                                                                                                                               |
| -------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surface: paper, radius 28 at the top, `lift2`                        | right                                           | pinned by tests (colour, corner, curve, lift)                                                                                                                                     |
| Top hairline (`0 -1px 0 hairline`)                                   | `StyleSheet.hairlineWidth` (about 0.33 dp)      | 1 dp, in the `hairline` colour                                                                                                                                                    |
| Grab zone 28, grabber 36x5 (Android 32x4) 10 dp in, hit 96x48        | right                                           | pinned; the zone got `home-sheet-zone`                                                                                                                                            |
| Detents 212 / 439 (52%) / 780 (top inset + 10)                       | right                                           | already pinned by `sheet-geometry.test.ts`                                                                                                                                        |
| Content: 20 at the sides, 16 gap, end above the tab zone + 16        | no gap                                          | `gap: 16` (needed by the banner), the rest pinned                                                                                                                                 |
| 48 dp ground fade above the pill                                     | exists (`tab-pill.tsx`, `Scrim kind="fade"`)    | unchanged (iOS pill only; Android has none, as the CSS)                                                                                                                           |
| FAB at peek: 56 round (Android rounded square), 16 above the pill    | right                                           | unchanged                                                                                                                                                                         |
| FAB at half: extended, right 16, 16 above the pill                   | 56 dp tall on both platforms, 24 dp padding     | 52 dp pill on iOS, 56 dp rounded square (radius 16) on Android, padding 16 before the plus and 20 after the words                                                                 |
| FAB label at large text                                              | grew with the text size                         | stops at 1.3x (FR-074, `home-scale2.png`): `Button capped`                                                                                                                        |
| Hidden at full and with no trips                                     | right                                           | unchanged                                                                                                                                                                         |
| Offline / error banner                                               | under the greeting                              | **first thing in the half sheet** (`home-offline.png`, `home-error.png`); still under the greeting at peek, with no trips and with an unreadable store (no half sheet to hold it) |
| Empty header                                                         | "Hello, Marta" + date + search disc             | "Welcome, Marta" over "0 of 195 countries", the sync chip only when something waits, no search disc (`home-empty.png`)                                                            |
| Invitation: 20 from the sides, radius 24, `lift2`, 16 above the pill | right (padding 16)                              | card content padded 20 / 76 top / 16 bottom, centred, 8 dp gap, primary full width, 12 dp above it                                                                                |
| Three fanned frames, 64 dp over the card top                         | grey fill, pin glyph                            | cream (`surface-secondary`) fill, 3 dp `surface` border, **photo glyph**, same size, tilt and `lift2`; no photographs                                                             |
| "Find trips in my photos"                                            | missing                                         | text button, `coming-soon-find-trips`, hint "Not available yet", toast "Finding trips in your photos is coming soon"                                                              |
| Loading skeleton                                                     | content-height sheet, bone date, no search disc | sheet as tall as the half detent, grabber 10 dp into a 28 dp zone, figures 4 dp below, bones 40x14, the day in text, search disc                                                  |

## What changed

- `ui/sheet.tsx`: 1 dp edge, `home-sheet-zone`. `home/home-sheet.tsx`: `banner` slot at the top of half, content `gap 16`.
- `home/home-header.tsx`, `greeting-header.tsx`: `banner` and `welcome` props. `home-globe.tsx`: banner in the sheet at half, `welcome` with no trips.
- `ui/plan-trip-fab.tsx`, `ui/button.tsx` (`capped`): the FAB's size, padding and cap.
- `globe/empty-state.tsx` (`invite`, `secondary`), `home/invitation-card.tsx`, `ui/state-art.tsx` (frames).
- `ui/screen-skeletons.tsx` (`sheetHeight`, `greetingDate`), `home/home-states.tsx`.
- Tests extended: `sheet`, `home-sheet`, `home-header`, `greeting-header`, `invitation-card`, `plan-trip-fab`, `button`, `screen-skeletons`, `home-screen`.

Assertions changed (each because a picture needs another value): the FAB's "at least 56 dp" is now 52 (iOS) / 56 (Android); the no-trips Home's
button list lost `coming-soon-search` (no disc in `home-empty.png`) and gained `coming-soon-find-trips`; the invitation's "one button" is now "one primary";
the skeleton's figure bones `h-12 w-3/4` are `h-10 w-2/3` plus a `h-3.5` label bone.

## Deviations and open items

1. **Hit area**: the prototype's 96x48 target starts 8 dp above the sheet (`top: -8px`); the build's starts at the sheet's top edge (a target outside the
   animated view is not reliable on Android).
2. **Text scale 2** (`home-scale2.png`): the picture's half sheet grows to about 660 dp; the build's half detent stays 439 dp (peek grows with the text
   size, half does not), so the content of half can be clipped at the largest sizes. Not changed here (it touches the geometry and the camera fit): owner to decide.
3. **The words**: the FAB says "Plan a trip" and the card "Your globe is waiting for its first trip" (the app's words win, UI-SPEC 10); the empty header says "Welcome".
4. The Trips screen shares `PlanTripFab`, so its button is now 52 dp on iOS too (the same `.fab` in the pictures).
5. The banner changes the header height when the sheet moves between half and peek, so the planet is re-fitted then (the existing refit on a changed header).
6. `StateArt frames` is shared: other empty states that use it now show the photo glyph too.

## Device checks for the owner

- Half sheet offline (airplane mode with a pending change): the banner is the first row in the sheet, the figures move down, the chip stays in the header.
  Lower to peek: the banner moves under the greeting. Failed sync: Retry in the chip and in the banner.
- Sheet edge reads as a 1 px line on light and dark; handle 36x5 (iOS) and 32x4 (Android), tap and drag.
- FAB: 52 dp pill on iOS, 56 dp rounded square on Android; at the largest text size its words stop growing.
- Empty Home (new account): "Welcome", "0 of 195 countries", the card with three cream frames over its top, "Find trips in my photos" shows a toast and does nothing else.
- Loading (kill and relaunch with a slow store): the skeleton sheet's top is where the half sheet will be, with no jump when the real sheet arrives.
