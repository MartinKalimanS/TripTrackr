# F7 Photos, the shared area chrome and the screen: as built

Branch `feat/f7-photos-screen` (from `feat/f7-photos`). Tasks T548 (shared chrome) and T549 (the screen; the
`PhotoViewer` is the other F7 objective and is untouched). Pictures: `screens/more/photos.png`, `photos-dark.png`,
`photos-long.png`, `photos-scale1.5.png`, with `notes.png`, `documents.png`, `offline-maps.png` and `states.png` for the
chrome and the states. CSS: `prototype/extra/screens.css` (`.syncrow`, `.day`, `.dh`, `.mos`, `.pt`, `.ub`, `.fl`, `.mo`),
`extra/extra.css` (`.nav`, `.lt`, `.fab`, `.ibtn`, `.link`), `extra/src/frames/photos.html`.

Files. New: `components/ui/area-header.tsx`, `components/ui/area-fab.tsx` (each with a test), `components/trip/day-header.tsx`,
`photo-mosaic.tsx` (`PhotoMosaic`, `DaySection`), `upload-summary-pill.tsx`, `photos-skeleton.tsx`,
`features/photos/photo-days.ts`, `photo-mosaic.ts`, `upload-summary.ts`, `use-now.ts`. Rewritten: `app/trip/[id]/photos.tsx`,
`components/trip/photos-header.tsx`, `photo-tile.tsx`; extended: `photo-status.tsx` (`UploadBadge`, `FailedRetryPill`; the viewer's
`PhotoStatusBadge` and `PhotoRetryButton` are unchanged), `photo-copy.ts`. Small shared edits: `state-view.tsx` (`StateAction.accessibilityLabel`,
additive), `icon-registry.ts` (`checks`, 66 icons), `app/trip/[id]/_layout.tsx` (`photos` has `headerShown: false`). Removed:
`features/photos/photo-grid.ts` (the column count by text size, replaced by the mosaic).

## AreaHeader (`components/ui/area-header.tsx`): API for the other areas

```tsx
<AreaHeader
  title="Photos"                        // `title` role, an accessibility header
  subtitle="Portugal Road Trip · 128 photos"   // one line, ellipsis; null/undefined: not drawn
  privacy                               // the "Only you" PrivacyChip, before `actions` (Documents, Spending)
  actions={<ComingSoonButton ... variant="tonal" />}   // the controls at the end of the bar, drawn by the screen
  onBack={...}                          // default: router.back(), or home when nothing is beneath (HeaderBackButton)
  testID="photos-header" titleTestID="photos-title" subtitleTestID="photos-subtitle" />
```

`areaMargin(os?)` is the side margin (20, 16 on Android) that the header and the list below must share. The bar is at
least 44 dp tall, 8 dp between controls, below the status bar (`SafeAreaInsetsContext`, zero without a provider), Back is the
tonal 44 dp `HeaderBackButton` named exactly "Back". An area adopts it by dropping its `titled(...)` entry in
`trip/[id]/_layout.tsx` for `options={{ headerShown: false }}` and putting `AreaHeader` above its list (Photos is the pattern:
the header and the summary are fixed, the list scrolls).

## AreaFab (`components/ui/area-fab.tsx`)

```tsx
<AreaFab label="Add photos" accessibilityLabel="Add photos from your library" icon="images"
         testID="photos-add" onPress={...} busy={...} hidden={...} bottomInset={0} />
<ListScreen bottomInset={areaFabClearance(Platform.OS, fontScale)} ... />
```

A `primary` `lg` `Button`, `absolute`, 20 dp from the end, 16 dp above the bottom safe area (`bottomInset` adds to it), the second
lift, 52 dp pill on iOS and a 56 dp rounded square (16) on Android as minimums, label capped at 1.3 (`capped`), not drawn while the
keyboard is up (`useKeyboardState`), `hidden` draws nothing, `busy` is announced. `areaFabClearance(os, fontScale)` is what a list leaves
under its last item (button + 16 + 16).

## Fidelity audit (picture and CSS against the code before this change)

| Rule (picture / prototype)                                                          | Before                                                       | Now                                                                                                                      |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Header: tonal Back disc left; title 28/32; subtitle "Trip · N photos" (muted, 1 ln) | native header "Photos" + trip name as a headline in the body | `AreaHeader` (native header hidden for the route); subtitle ellipsis; no count until the store answers                   |
| Pictured select-all and more discs at the right                                     | MISSING                                                      | `ComingSoonButton` `coming-soon-photos-select`, `coming-soon-photos-more`, `tonal` (Q-11: one toast, nothing else)       |
| Summary pill: cream, hairline, ring, words, dot, "1 failed", Retry at the end       | MISSING                                                      | `UploadSummaryPill`; wraps with Retry under the words at large text; hidden when nothing is unfinished                   |
| Day header: numeral 36/40 (52 dp room), place, "Wed · Oct · 14 photos"              | one flat grid, no days                                       | `groupByDay` (local day in the city's zone, newest first, undated last) + `DayHeader` (one announced header)             |
| Mosaic: 3 columns, 114 dp tiles on 350, gap 4, large tile 2x2 + two stacked         | rows of 1 to 4 tiles by text size, gap 16, captions under    | `photo-mosaic.ts` cells; geometry from the window width; large tile alternates side per day; 3 columns at all text sizes |
| `+N` on a full-tile scrim (14 photos show 5 + "+9")                                 | MISSING                                                      | `visibleTiles`: 6 tiles, sixth = `+(count - 5)`; the tile opens the whole day; name "9 more photos from ..."             |
| Uploading ring, queued dashed cloud disc, tick, failed Retry pill on a scrim        | a caption capsule under the tile and a text "Try again"      | disc 28 dp (dashed cloud = waiting, tick = just uploaded from here), danger pill with alert + "Retry", scrim             |
| No overlay on a thumbnail, no tint                                                  | nothing over a thumbnail                                     | a safe photograph is bare (test); marks are the pictured exception (see deviations)                                      |
| FAB "Add photos" bottom end, 20 / 16, hides with the keyboard                       | a primary button at the top of the list                      | `AreaFab`; the empty state carries the one primary instead when there are no photos                                      |
| Skeleton mirrors content                                                            | square tiles in a grid                                       | `PhotosSkeleton`: day header bones + the same mosaic cells (a test compares frames); one `progressbar`                   |
| Empty "No photos yet", three empty frames, "Add photos"                             | icon + words, two buttons above                              | `EmptyState variant="frames"` with a primary "Add photos" (name "Add photos from your library"); words unchanged         |
| Permission denied: icon, words, Open Settings                                       | inline notice with Open Settings                             | unchanged (kept inline: a camera refusal must not hide the gallery); `photos-settings-error` kept                        |
| Dark, contrast, scales 1.5 and 2, Android                                           | tokens                                                       | tokens only (`scrimButton`, `onPhoto`, `danger`/`dangerInk`: gated); Android margin 16 (`areaMargin`), square FAB        |

## Deviations (and why)

- **Marks on a thumbnail.** The 004 rule "no overlay on a thumbnail" (FR-033) is amended for the states the pictures draw (FR-045):
  the 28 dp disc, the Retry pill, the failed tile's scrim and the `+N` scrim. A photograph that is safe is bare. UI-SPEC 3.8 (a count
  sits on a scrim that covers the whole tile) says the same.
- **"Uploading 2 of 5" and the uploading ring (62 %) are not drawn.** The store has `pending`, `failed`, `uploaded` and no progress,
  so the line says "2 waiting to upload" and "1 failed" (the app's word "Waiting to upload"), and the ring in the pill is the share of
  the trip's photographs whose bytes have arrived. No invented number. A tile's uploading ring is therefore never shown: queued and
  being sent look the same (dashed cloud), which is the truth the store has.
- **The tick** is "uploaded from this device in the last five minutes" (`isJustSynced`: `synced_at` and a local file); older tiles carry
  nothing. A photograph downloaded from another device never shows it.
- **"Retry"** is the visible word on the pill and the summary line (as pictured, and already the Banner's word); the names stay
  "Try uploading this photo again" (a tile) and "Retry failed upload(s)" (the line).
- **"Take a photo"** is not pictured but is the app's: a tonal camera disc first in the bar's controls (`photos-take`, "Take a photo
  with the camera", announced busy). **"Private - only you can see your photos."** is not pictured: it is now the last line of the list
  (and in the empty state), and there is no lock chip in the bar (the pictures have none for Photos).
- **Tile radius 16** on every tile (the owner's brief and UI-SPEC 2.3), not the prototype's 12 on small tiles and 16 on the large one.
- **FAB icon** is `images` (Phosphor has no image-plus); the picture draws a Lucide image-plus.
- **Lead tile side** alternates by day (the prototype's second day has it on the right); the lead is always the first photograph
  (FR-045), where the prototype's second day leads with its second.
- **One or two photographs** fill the 3 x 2 block (a wide tile; the large tile and a tall one): the prototype does not show these days.
- **Scroll.** The header and the summary are fixed above the list (as in the prototype, where only `.scroll` scrolls).

## Tests

`test/features/photo-days.test.ts` (grouping: zone, order, undated, place, words, no PluralRules), `photo-mosaic.test.ts` (cells, no
overlap, `+N` rule, 114 dp geometry), `upload-summary.test.ts` (the line, the tick), `use-now.test.tsx`;
`components/ui/area-header.test.tsx`, `area-fab.test.tsx`; `test/app/photo-gallery-pictured.test.tsx` (days, frames on screen at scale 1 and
2, `+N`, expand, summary and Retry-all, FAB and the keyboard, coming-soon controls); updated: `photo-screen.test.tsx`,
`photo-screen-atlas.test.tsx` (marks by icon and word, no GridSkeleton/columns), `photos-header.test.tsx` (the route has no native header;
Back through the real router), `trip-layout.test.tsx` (`photos` hidden), `photo-screen-real-render.test.tsx`, `photo-presentation.test.ts`
(`gridColumns` removed with the file), `icon-registry.test.tsx` (`checks`). `testid-unresolved-count.json` regenerated (93 to 98 test ids,
68 to 70 labels): `AreaHeader`, `AreaFab` and `PhotosSkeleton` forward their ids as props, which the extractor cannot read; every call site
writes the id as a literal (`titleTestID="photos-title"`).

## Device checks for the owner

1. iPhone and Android: the header sits under the status bar as in `photos.png` (Back disc, select-all and more at the end, title
   and subtitle); the camera disc is the extra control.
2. A day of 14 photographs: five tiles and `+9`; tap it and the whole day opens; tiles are 114 dp on a 390 dp phone (Android 16 dp margins:
   about 117).
3. Offline: a photograph taken offline shows the dashed cloud disc and the line "N waiting to upload"; online it gains the tick for five
   minutes and the line goes. A failed upload (turn the server off) shows the Retry pill and "1 failed"; Retry on the pill and on the line.
4. Text size 1.5 and 2: three columns hold, the summary wraps with Retry under it, the FAB label stops at 1.3.
5. TalkBack and VoiceOver: each day is one header; a tile is read with its state; the `+N` tile reads "9 more photos from ...".
6. Dark and both contrast themes: the Retry pill (`danger` with `dangerInk`), the discs and the `+N` scrim over bright photographs.
