# F14 Text-scale sweep (T561): as built

Branch `feat/f14-scale` (from `feat/ui-stack`). Task T561 (FR-074, SC-007). Read: `UI-SPEC.md` ("Text scale >= 1.15" under Home,
Trips, Trip, Welcome), the `*-scale1.5`, `*-scale2` and `*-long` frames, and the prototype CSS that decides the reflow
(`styles.css` lines 330, 452, 531, 592, 664-673; `extra/screens.css` 309-320; `tokens.css` `.clamp-1`).

Method: a ratchet over the source (fixed sizes), and a render of every listed component and screen at a font scale of 1, 1.15,
1.5 and 2 that asserts the layout mode and that no rendered node holding scaling text pins a `height` or a `width`.
Jest renders no layout, so how it looks is a device check (below). Note for later suites: Jest's default window reports a font
scale of **2**, so a test that means "the default size" must set a scale of 1 (`phoneAtFontScale(1)`).

## The table

### A. Fixed heights (`height:` styles, `h-<n>` / `size-<n>` classes, `allowFontScaling={false}`)

Every one is in `test/scale/fixed-heights.allowlist.json` (78 files, 196 sites) with its reason; the ratchet
fails on a new one or on a stale count. By kind (the file list and the reason of each is in the JSON):

| Kind                                   | Where                                                                                                                                                                                                                                                                             | Text near it                                                                                       | At 1.5 / 2                                                                             | Action                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------- |
| Icon, disc, glyph box                  | `icon-button`, `button` (icon-only), `sync-badge` glyph disc, `photo-status`, `expense-row` disc, `place-field` disc, `document-ticket` disc, `area-pill` lock, `permission-state`, `nights-stepper` +/-                                                                          | label beside it grows                                                                              | cannot clip (no text inside)                                                           | none                            |
| Dots, halos, hairlines, bars, swatches | `now-chip`, `photo-status-pill`, `chip`, `stop-dots`, `progress-row`, `country-row`, `category-bar`, `storage-bar`, `toast` line, separators in `list-screen`, `expense-day-group`, `document-details`, `stop-dates-block`, `offline-city-card`, `pinned-strip`, `social-sign-in` | legend text wraps beside                                                                           | no text inside                                                                         | none                            |
| Thumbnails and art                     | `trip-thumb`, `trip-row` (56/64), `ticket-card` (88 stacked, 1.15+), `stop-thumb`, `offline-map-tile`, `photo-mosaic`, `generated-cover`, `flag-chip`, `stamp`, `raster-stamp`, `state-art`, `welcome-globe`, `passport-card` disc, `trip-states` ghost stamp                     | cover letters and flags opt out of scaling on purpose; stamps are hidden from assistive technology | no scaling text inside                                                                 | none                            |
| Notches, grabbers, handles, ramps      | `ticket-card` / `document-ticket` notches (gone when stacked), `sheet`, `form-sheet`, `form-modal`, `photo-viewer` grabbers, `scrim` ramps, `tab-pill` fade                                                                                                                       | none                                                                                               | no text                                                                                | none                            |
| Named minimums                         | `tab-metrics` (`PillMetrics.height`, `AndroidBarMetrics.height`), `android-nav-bar` indicator                                                                                                                                                                                     | tab labels (capped 1.3)                                                                            | the bar and the tabs are `minHeight` and grow (pinned by `tab-bar.test` and the sweep) | none                            |
| Measured sizes                         | `ui/photo-viewer`, `globe/callout-layout`, `use-callout-placement`                                                                                                                                                                                                                | n/a                                                                                                | not a style                                                                            | none                            |
| Map pins                               | `globe/active-callout`, `roundel-badge`, `pin-layer`, `arc-source`                                                                                                                                                                                                                | one line in the callout card (no height); the cluster count opts out of scaling                    | pins are drawn on the map layer                                                        | none                            |
| Skeleton bones                         | 7 skeleton files, `state-view`                                                                                                                                                                                                                                                    | none                                                                                               | placeholders                                                                           | none                            |
| Stop node                              | `stop-rail` 28 dp                                                                                                                                                                                                                                                                 | one figure, capped at 1.3: 23.4 dp line < 28                                                       | fits                                                                                   | none                            |
| **Per-day chart box**                  | `trip/day-bars.tsx`                                                                                                                                                                                                                                                               | two capped label lines under a 96 dp plot (up to 157 dp) in a **fixed 142 dp**                     | **clipped the tallest bar and the labels**                                             | **fixed: `minHeight`**          |
| Home sheet                             | `ui/sheet.tsx` (`height: full + SKIRT`)                                                                                                                                                                                                                                           | the figures, cards and rows                                                                        | half detent stays 439 dp                                                               | **open owner question** (below) |

No `height:` or fixed `h-<n>` exists in `src/app` (the screens), and no `<ScrollView>`/`Screen` has a fixed height.

### B. Fixed widths with text near them

| Where                                                                                                                                                                | What                                                                           | At 1.5 / 2                                                                        | Action                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------- |
| `trip/route-preview.tsx` stop column (stop editor)                                                                                                                   | `width: 40` around a 3-letter code on one line                                 | **the code was cut to an ellipsis**                                               | **fixed: `minWidth: 40`**           |
| `trip/day-bars.tsx` columns                                                                                                                                          | width computed by `columnWidth` from the longest label at the capped text size | widens, the chart scrolls                                                         | none (named exception in the sweep) |
| `ticket-card` / `document-ticket` stub                                                                                                                               | 88 dp wide, "94 days"                                                          | stacked (a row, no width) from 1.15; below it the text grows 14% at most and fits | none (named exception below 1.15)   |
| `profile/period-switch.tsx`                                                                                                                                          | 88 dp per segment, only past four periods, in a sideways scroller              | labels wrap, the pill scrolls                                                     | none; device check                  |
| `trip/stop-rail.tsx` rail 32                                                                                                                                         | the node figure, capped 1.3                                                    | fits                                                                              | none                                |
| `trip/stop-dates-block.tsx` joint 24, `nights-stepper` value `minWidth`, `areas-strip` cells `%`, `trip-states` `max-w-[280px]`, `transit-row w-8`, `recap-entry` 48 | a joint with no text; minimums; a share; a maximum; icon columns               | grow or hold                                                                      | none                                |

### C. `numberOfLines`

| Behaviour                                                                                  | Where                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shrinks to fit one line (`adjustsFontSizeToFit`): numerals                                 | `stats-row`, `area-pill` count, `passport-card` figures, `spending-hero`, `amount-input`, `animated-number`; **new:** the `+N` count of a photograph tile (was clipped in its tile at large text)                                                                                                                                                                                         |
| One line, two from 1.15 (`metaLines`, the prototype's `.clamp-1`)                          | `country-row`, `next-row`, `now-card`, `trip-row`, `ticket-card` meta, `trip-hero` eyebrow, `document-ticket` line; **new:** `area-header` subtitle, `day-header` place, `expense-row` meta, `expense-extras` summary, `note-card` title (was 1.5), `trip-hero-card` eyebrow, `document-view` bar title                                                                                   |
| Two lines at every size (design: ellipsis after two; the full text is the accessible name) | `greeting-header`, `trip-hero` title, `trip-hero-card` title, `ticket-card` title, `document-ticket` title, `expense-row` title, `offline-city-card` name                                                                                                                                                                                                                                 |
| One line by design                                                                         | `collapsed-bar` title (a bar: the hero title is whole above it), `day-chips` and `stop-strip` captions (capped 1.3), `day-bars` labels (columns widen), `route-preview` codes (column now widens), `offline-city-card` country, `document-hero` kind, `note-card` place, `generated-cover` letter, passport MRZ strip (decorative, `ellipsizeMode="clip"`), the map callout and pin badge |
| Fields                                                                                     | `note-editor` six lines (`numberOfLines` is a minimum for `Field`)                                                                                                                                                                                                                                                                                                                        |

### D. Hard-coded row and block heights are minimums

Checked in the sweep at every scale: ticket 96, trip row 72, hero card 219, trip hero 236, documents ticket 104, area pill 72 and
the tab pill 64 / tab 52 (Android bar 64 / tab 48) all scaled or grown by content; `Tappable`, `Button`, `PillButton`,
`Field`, `StopDatesBlock`, `NightsStepper` (64), `ListRow`, `SegmentedPill` are `minHeight`. `collapsed-bar` is `minHeight`.

### E. Screens and components rendered at 1, 1.15, 1.5 and 2

Home figures, Home tools, greeting, Now card, Up next row, trip areas, ticket card, trip row, passport grid, hero title, Trips hero
card, documents ticket, stop dates, route preview, Nights stepper, form footer, area header, day header, expense extras, notes card,
spending hero, per-day chart, photograph tile, tab pill (`test/scale/reflow-components.test.tsx`); Welcome, Sign in, Create
account (`test/scale/reflow-screens.test.tsx`). Whole-screen walks run once, as a throwaway, over Trips (mixed list), You and the
trip screen at the four scales: no node holding text pins a height or width (the FlashList stand-in's 700 by 400 window aside).

## What changed

- `test/helpers/text-scale.ts`: `TEXT_SCALES`, `phoneAtFontScale`, `fixedHeightTextContainers` and `fixedWidthTextContainers`
  (a numeric size on a node that holds text that scales; `allowFontScaling={false}` text and named drawings are exempt).
- `test/scale/fixed-heights.test.ts` + `fixed-sizes-scan.ts` + `fixed-heights.allowlist.json`: the ratchet (also pins its scan on
  small inputs).
- `ui/reflow.ts`: `metaLines(fontScale)`.
- Gaps fixed, each test-first: per-day chart `minHeight` (`day-bars.tsx`); `+N` count shrinks to fit (`photo-tile.tsx`); route
  preview column `minWidth` (`route-preview.tsx`); one-line titles and meta lines take two from 1.15 (`area-header`, `day-header`,
  `expense-row`, `expense-extras`, `note-card`, `trip-hero-card`, `app/trip/[id]/document-view`).
- `e2e/01-appearance.yaml` (the flow run at the largest text size): `scrollUntilVisible` before it asserts or taps the Welcome
  actions.
- Existing tests that meant "the default size" now set a scale of 1 (`area-header.test`, `spending-pictured`); one new case each.
  `reflow.test.ts` and `document-screens.test.tsx` gain cases.

## Deviations

1. The note card title takes its second line from 1.15, not 1.5 as F9 built it (F9's comment called 1.5 "the prototype's
   `data-bigtext`"; the prototype's `.clamp-1` rule is 1.15). `notes-pictured` already asserted 1 line at 1 and 2 at 1.5.
2. `.dates-pill` (prototype, the new-trip form's dates) is not built (dates come from stops; the stop dates stack from 1.15).
3. The Add expense header chip is dropped from 1.5 (F6), the prototype hides it from 1.15: left as built, listed for the owner.
4. The ratchet reads `src/components` and `src/app` only (hooks, features and theme hold arithmetic). It counts sites per file: a branch
   that adds a fixed size merges red until its allow-list entry (with a reason) or a `minHeight` is added.

## Open owner question (not changed)

**Should the Home half detent grow with the text?** At scale 2 the sheet stays 439 dp (`as-built/f2-sheet-shell.md` item 2,
`home-scale2.png` draws about 660 dp). The peek grows (`peekRowHeight`), half does not, so the figures, Now card and Up next rows can be
below the visible part of half at the largest sizes; every one is reachable by dragging to the full detent, where the body scrolls. A
growing half detent touches the sheet geometry and the globe fit (camera rules), so it is the owner's call.

## DEVICE checks (listed, not claimed)

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

## Evidence (one line per small step)

| Step                                                                                         | Tests                                                                                                                           | Commit                         |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Sweep of the components at 1, 1.15, 1.5 and 2; per-day chart `minHeight`; `+N` count shrinks | `test/scale/reflow-components` 77 (failed first on the chart box 142 dp and the tile)                                           | `0cb0111`                      |
| Fixed-height ratchet and allow-list (78 files)                                               | `test/scale/fixed-heights` 10 (a planted `height` fails it, shown and reverted)                                                 | `c577ef9`                      |
| Welcome, Sign in, Create account sweep; `01-appearance` scrolls to the Welcome actions       | `test/scale/reflow-screens` 32; `testid-maestro`, `testid-parity` green                                                         | `7aac06a`                      |
| `metaLines` for one-line titles and meta lines; route preview `minWidth`; fixed-width walker | `reflow-components` 97, `reflow.test` +5, `area-header.test` +1, `spending-pictured`, `document-screens` +3 (each failed first) | `a69277e`                      |
| This note                                                                                    | prettier                                                                                                                        | the commit that adds this file |
