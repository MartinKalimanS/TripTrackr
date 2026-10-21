# F5 Trip screen, objective 2 (the stops and the states): as built

Branch `feat/f5-trip-stops` (from `feat/f5-trip`). Pictures: `screens/core/trip.png`, `trip-dark`,
`trip-zero`, `trip-loading`, `trip-off`, `trip-err`, `trip-nocover`, `trip-long`, `trip-scale1.5`,
`trip-scale2`. CSS: `prototype/styles.css` (`.sec-cap`, `.seg`, `.timeline`, `.stop`, `.rail`,
`.node`, `.spine`, `.transit`, `.add-stop`, `.empty`, `.sk`), `build.py` (`stops_head`,
`trip_detail`). The top of the screen (hero, collapsed bar, progress row, areas, day chips) is the
other objective and untouched.

## Audit (picture and CSS against the code before this change)

| Rule                                                                                        | Before                                                          | Now                                                                                        |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| "Stops 3": `headline`, count muted                                                          | right                                                           | unchanged                                                                                  |
| List / Map toggle, 136 dp, List on                                                          | MISSING                                                         | coming-soon: `trip-stops-view` radiogroup, `coming-soon-trip-map` (one toast)              |
| Rail 32, node 28 (done navy + tick, here coral + 4 dp tint halo, next hollow 2 dp ink ring) | right                                                           | unchanged                                                                                  |
| Node figure 13 dp bold, capped                                                              | 14/20, uncapped (clips the 28 dp node at scale 1.5)             | `caption` 13/18, `capped` (1.3), tabular                                                   |
| Spine 3 dp solid navy, coral to the current stop, dotted `border` after it; lead 8; gap 12  | right                                                           | unchanged                                                                                  |
| Body: place `callout`, text and 56 dp thumbnail (radius 16) on the 20 dp margin, centred    | text 12 dp in, thumbnail 12 dp short of the margin (card p-3)   | card padding taken back by a -8 margin: exact positions with or without tile / dashed edge |
| Dates and nights on one `label` muted line                                                  | dates at 14/20 `numeric`, nights on a second line               | one wrapping line, `stop-meta-<id>`: dates, " · ", nights; tabular                         |
| Transit row: quiet connector, 13/18 600 muted, 36 dp, dotted rail                           | `label` strong (14/20)                                          | `caption` 13/18; distance only (route glyph), never a drive time                           |
| NOW chip                                                                                    | right                                                           | unchanged                                                                                  |
| Dashed "Add stop" row, 52, 2 dp dashed `border`, 4 dp below the 28 dp the rows leave        | 24 dp below the last row                                        | `marginTop` 4: 28 dp as pictured                                                           |
| Zero stops: ghost stamp 96 with a plane, "No stops yet", muted label (max 280), one primary | rings only, 16 dp `body`, gap 12                                | plane (24 dp icon scaled 1.6 = the prototype's 2x), `label`, gap 8, 16 dp side padding     |
| Loading skeleton: 150 x 28 and 48 x 36 status, 90 dp line + 136 x 32 pill, rows 76 dp apart | 160 x 36 / 80 x 36, 96 dp line, 128 x 36, rows 68 dp apart      | as pictured; `StopsSkeleton` for the stops alone (3 rows, was 2 generic rows)              |
| Offline / error banner, Retry, warn Photos pill                                             | banner slot in `SheetHead` (other objective)                    | unchanged here                                                                             |
| No-cover generated cover                                                                    | hero (other objective); stop thumbnails use the generated thumb | unchanged here                                                                             |
| Drag to reorder (react-native-sortables, auto-scroll), controls, accessibilityActions       | right                                                           | unchanged                                                                                  |
| Text scale >= 1.15, dark, contrast                                                          | semantic classes only                                           | unchanged (no colour literal added); header wraps, toggle keeps its 136 dp minimum         |

## Changes

- `trip-states.tsx`: `StopsHeader` (+ `StopsViewToggle`), `ZeroStops` (+ `GhostPlane`), `StopsBody`
  uses `StopsSkeleton`.
- `stop-row.tsx`, `stop-rail.tsx`, `transit-row.tsx`, `add-stop-row.tsx`: the rows above.
- `screen-skeletons.tsx`: `StopsSkeleton`, the pictured trip geometry.
- `segmented-pill.tsx` (shared, additive): optional `accessibilityHint` on an option, so a segment
  that has no capability yet can say "Not available yet".
- New ids (additive): `trip-stops-head`, `trip-stops-view`, `trip-stops-view-box`,
  `trip-stops-view-list`, `coming-soon-trip-map`, `trip-empty-plane`, `trip-empty-detail`,
  `trip-stops-skeleton`, `stop-place-<id>`, `stop-meta-<id>`, `stop-transit-distance-<id>`.
- Tests: `test/components/stop-picture.test.tsx` (new, 16), `screen-skeletons.test.tsx` (trip block).

## Existing assertions changed on purpose

- `screen-skeletons.test`: status bones `h-9 w-40` / `h-9 w-20` became `h-7 w-[150px]` / `h-9 w-12`;
  stop lines `h-5 w-1/2` / `h-4 w-3/4` became `h-5 w-[55%]` / `h-3.5 w-[70%]` (`trip-loading.png`,
  `build.py` skeleton). Everything else in that file is unchanged.

## Deviations (and why)

- **Country line kept.** The pictures show no country under the place; the app shows flag and
  country (the row's accessible name says it too: "Stop N: place, country. dates"). Kept: removing
  data the traveller has is not a picture's call.
- **Dates keep the app's format** ("14 Oct 2026 → 15 Oct 2026"; the picture says "14-15 Oct").
  The accessible name, `stop-dates-<id>` and tests carry that text; the line is restyled only.
- **Zero state words.** App: detail "Add the first city you are going to, with its dates." and the
  button "Add stop" (picture: "Add where you are going. The globe draws your route and the cover
  follows." and "Add first stop"). The app's words win (Q-11); `trip-add-stop` is "Add stop".
- **Transit row**: route glyph and the distance only; the picture's car glyph and "40 min" are
  invented data (Q-11).
- **Chosen-day tile kept.** The picture draws no tile on the stop of the selected day; the app's
  highlight (the cream tile) is the day strip's visible effect and stays.
- **Controls under each stop kept** (move up / down, Dates, Remove, grip). The pictures draw none;
  they are the only way to edit, so they stay as a quiet row under the text.
- **Map segment** presses the selection haptic the pill gives any change of segment, then the one
  toast. The pill's haptic cannot be switched off per segment without changing the adapter.
- **Node figure face**: DM Sans 600 (`caption`); the picture uses Bricolage 700 at 13 dp, which no
  type role offers at that size.

## Device checks for the owner

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
