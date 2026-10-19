# Contract: Screen Obligations and Blueprint (Sunrise Passport)

**Feature**: `specs/005-sunrise-passport-ui` | **Consumers**: every route in `apps/mobile/src/app/` | **Carries
over**: `specs/004-app-ui-redesign/contracts/screens.md` C4-10 (screen-level obligations), restated below, and
C4-11 (the blueprint), replaced by C5-32 here.

Measurements are in dp on the prototype's reference phone, **390 by 844** (iPhone 15: top inset 54, bottom inset
34), from `reference/prototype/styles.css` and `reference/prototype/extra/screens.css` (the pictures are in `reference/screens/`; start at `reference/README.md`); they are starting values, tested at
640 to 932 dp heights and every text scale. **Prototype frames** are the board numbers of `index.html` (01 to
10, H1 to H3, T1 to T6, D1 to D6, S1) and the files in `shots/` and `extra/shots/`. **Tier** is the scope tier of
the spec.

---

## C5-31. Screen-level obligations (inherits C4-10)

Every screen, including ones added later:

1. **Composes only from the adapter layer** (`contracts/components.md`); no literal colour, gradient or kit
   import (FR-009).
2. **Defines loading, empty and error presentations** to the same standard as its populated state (FR-064): a
   skeleton shaped like the content, an empty state that names the next action, an error with retry where a retry
   exists. A screen never shows its empty state while its first load is resolving.
3. **One primary control per screen state** (FR-006).
4. **Title and way back** (FR-025): top-level lists use the large title on iOS; pushed screens have Back named
   "Back"; Home has no header; a trip's title is its hero and keeps `testID="trip-title"`.
5. **Renders completely at the platform's largest text size** with the reflow rules of the table at the end
   (FR-074, SC-007).
6. **Leaves assistive-technology output unchanged** for pre-existing controls (FR-075, FR-081); new elements are
   additive; decorative art is hidden (FR-076).
7. **Preserves every pre-existing `testID`** except the listed label changes (FR-081). The baseline is captured
   at the tag `pre-005-baseline` in T500 and compared mechanically (the existing parity test).
8. **Keyboard**: a form's primary action is never under the keyboard (`keyboardShouldPersistTaps="handled"`;
   the `test/helpers/keyboard.ts` test).
9. **Content surfaces**: no overlay across the map or a grid photograph; controls over photographs sit on discs;
   text over a hero photograph sits on the caption scrim (FR-007).
10. **Visibility posture stated** for any screen that touches traveller data: this feature adds none; every
    derived view is private, local, never transmitted (FR-084).
11. **No dead controls**: nothing is drawn for a Tier 3 capability (FR-080).

---

## C5-32. Blueprint, preserved identifiers, frames and tier

### Home — `(tabs)/index` — Tier 1 with Tier 2 content

| Aspect                | Contract                                                                                                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frames                | 01 half (`home.png`), 02 peek (`home-peek.png`), 03 full (`home-full.png`, `countries.png`), 04 empty (`home-empty.png`), H1 loading, H2 offline, H3 error, `home-dark`, `home-android`, `home-contrast`, `home-long`, `home-scale2`                                                             |
| Layers (bottom up)    | sky `Scrim` (`sky`) → the globe (full-bleed, bleeding off both sides) → pins and the callout → greeting header → sheet → `PlanTripFab` → tab pill                                                                                                                                                |
| Header                | top inset 54; padding 20; `eyebrow` date over `display` "Hello, _Marta_" (2 lines at most; the name is the serif accent); right: sync chip (36 dp) and, only after the globe moved, a 44 dp recentre control at the left margin below the header; hidden at full                                 |
| Globe fit             | `globeFit()`: half: radius `clamp(0.95 × band, 150, 286)`, centre x 205, y `headerBottom + 28 + radius`; peek: radius `clamp((band − 24) / 2, 110, 175)` (175 on the reference phone), 20 dp margins; the camera follows the sheet once per settle (280 ms)                                      |
| Sheet                 | detents peek 212 dp, half 52 percent (439 dp), full to top inset + 10 (about 92 percent); handle 36 by 5 (Android 32 by 4) in a 28 dp zone with a 96 by 48 hit area; radius 28; content padded 20, gap 16, bottom padding = tab zone + 16 (104 dp)                                               |
| Half content          | `StatsRow` (three tiles, hairline separators, figures count up once), `NowCard` (64 dp thumb), `NextRow` (48 dp thumb)                                                                                                                                                                           |
| Peek content          | `NowCard` only (56 dp thumb, right padding for the FAB), or `NextRow`, or the invitation                                                                                                                                                                                                         |
| Full content          | `CountriesList` (C5-23); the FAB hides; the camera does not move; rotation pauses                                                                                                                                                                                                                |
| FAB                   | `PlanTripFab`, 16 dp above the pill (above the toast when one shows), absolute right 16; hidden with no trips and at full                                                                                                                                                                        |
| Empty                 | globe stays; `InvitationCard` 20 dp from the sides, bottom = tab zone + 16, radius 24, `lift2`, the frame fan overhangs the card top by 64 dp; one primary                                                                                                                                       |
| Loading               | `HomeSkeleton`; the disc is centred by `globeFit('half')`                                                                                                                                                                                                                                        |
| Offline / error       | slim `Banner` under the greeting (offline amber "Offline. 3 changes will sync when you're back online."; error "Couldn't sync 2 changes. Your trips are safe on this phone." with Retry); the chip changes with it; the globe keeps working                                                      |
| Store unreadable      | the existing notice card over the globe                                                                                                                                                                                                                                                          |
| Ids that MUST survive | `home-screen`, `globe-map`, `globe-stats`, `globe-stat-countries` (text = the plain number, as flow 03 asserts "5"), `globe-stat-distance`, `globe-empty-state`, `globe-notice`, `home-plan-trip`, `home-add-stop`, `home-open-trips`, `home-overlay`; the text "countries" stays the stat label |
| New ids               | `home-sheet`, `home-sheet-handle`, `home-sheet-body`, `home-greeting`, `home-recentre`, `home-now-card`, `home-next-row`, `globe-stat-trips`, `countries-list`, `countries-search`, `countries-collapse`, `country-row-<iso2>`, `home-skeleton`, `sync-chip`                                     |
| Flows to re-check     | `03-globe` (Home states, stats, tapping a trip), `04-zoom` (pinch and zoom on `globe-map`: the sheet must leave the map's area free), `offline/14-*` (stop deletion from Home)                                                                                                                   |

### Tab pill — `(tabs)/_layout` — Tier 1

Frames: every board frame with a pill (`01`, `05`, `08`); Android: `home-android`, `trips-android`. The scenes
extend under the pill; the `Tabs` `sceneStyle` stays the canvas token. Labels Globe, Trips, You. Ids:
`tab-bar`, `tab-index`, `tab-trips`, `tab-profile`, `tab-mark-<name>`. Flows: all that tap `tab-*` (id-based,
unaffected by the label change).

### Trips — `(tabs)/trips/index` — Tier 1 with Tier 2 composition

| Aspect                | Contract                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frames                | 05 (`trips.png`), T1 loading, T2 offline, T3 sync error, T4 no cover (`trips-nocover`), T5 200+ (`trips-200`), T6 toast (`trips-toast`, the toast pattern only), `trips-dark`, `trips-android`, `trips-contrast`, `trips-long`, `trips-scale1.5`, `trips-scale2`                                                                                                                                                          |
| Header                | iOS: native large title "Trips" (`display`, 40 / 44) with the count ("22 trips") as a trailing `caption`, collapsing as the list scrolls; Android: standard header; the sync chip trailing; a `SegmentedPill` filter (All, Active 1, Planned, Past) below                                                                                                                                                                 |
| List                  | FlashList, items per `composeTripList` (data-model §6); list padding 0 20 (16 on Android), bottom padding = tab zone + 16 + FAB + 16 (172 dp; 176 on Android), gap 16 between cards and 12 between rows                                                                                                                                                                                                                   |
| Hero card             | min height 219, radius 24, `lift1`; padding 12 at the top (chips), caption block padding 0 16 16; the active trip only                                                                                                                                                                                                                                                                                                    |
| Ticket card           | min height 96, radius 24; 88 thumb, text block padding 12, 88 stub with 2 dp dashed `sand` edge                                                                                                                                                                                                                                                                                                                           |
| Rows                  | min height 72, thumb 64 radius 16, gap 16; year header 22 / 28 with "N trips · km" and a sticky `surface` ground                                                                                                                                                                                                                                                                                                          |
| Year strip            | with 200 or more trips only: `YearScrubber` at right 4, top 250                                                                                                                                                                                                                                                                                                                                                           |
| FAB                   | `PlanTripFab`-style "Plan a trip" above the pill on both platforms (the iOS header action is removed)                                                                                                                                                                                                                                                                                                                     |
| States                | `TripListSkeleton` (hero, ticket, rows); empty "No trips yet" with "Plan a trip"; filtered-empty "No planned trips"; offline and error `Banner`s; the per-record `SyncBadge`/glyph on pending trips; an error state (a live query has no retry; the recorded gap of 004 stays)                                                                                                                                            |
| Ids that MUST survive | `trips-screen`, `trips-plan-trip` ("Plan a trip", now the FAB, unique), `trips-list` (on the list, populated state only), `trips-empty-plan-trip`, `trips-fab-clearance` (the list footer that clears the button), `trip-card-<id>` (label "title, status, N stops"), `status-pill-<status>`, the 004 card sub-ids (`-cover`, `-photo`, `-initial`, `-cue`, `-status-row`, `-meta-row`) wherever the element still exists |
| New ids               | `trips-filter`, `trips-year-scrubber`, `trips-skeleton`                                                                                                                                                                                                                                                                                                                                                                   |
| Flows to re-check     | `01-account-and-trip`, `02-notes-and-expenses`, `05-photos-and-documents`, every `offline/*` that taps `tab-trips`                                                                                                                                                                                                                                                                                                        |

### Trip — `trip/[id]/index` — Tier 1 with Tier 2 elements

| Aspect                | Contract                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frames                | 06 (`trip.png`), D1 loading, D2 collapsed (`trip-collapsed`), D3 offline, D4 sync error (`trip-err`), D5 no cover (`trip-nocover`), D6 zero stops (`trip-zero`), `trip-long`, `trip-scale1.5`, `trip-scale2`, dark variants                                                                                                                     |
| Header                | transparent native header; `headerLeft` is `HeaderBackButton` styled `glass` (44 dp disc on `scrimButton`), name "Back"; no right-hand controls (share and more are Tier 3); `scrim.top` 120 dp under the status bar                                                                                                                            |
| Hero                  | min height 236, padding-top 100, full-bleed `expo-image` (cover or generated); eyebrow (flag chip + "Portugal · 12–19 Oct 2026", `eyebrow`, white); title bottom-anchored (`title`, 2 lines, grows upward) inside the caption scrim whose bottom padding is 36 (28 + 8); parallax .5                                                            |
| Sheet                 | `surface`, radius 28 top, overlaps the hero by 28; padding 16 20 0; gap 12                                                                                                                                                                                                                                                                      |
| Progress row          | `ProgressRow` (36 dp minimum): status chip, "Day 3 of 8" and dots, `SyncChip` at the right                                                                                                                                                                                                                                                      |
| Areas                 | `AreasStrip`: four `AreaPill`s in a 4-column grid with gap 8 (2 columns at font scale 1.15 and above), the privacy line (aqua, 13 / 18, lock icon), the Offline maps row (a `ListRow`, 56 dp)                                                                                                                                                   |
| Day chips             | `DayChips` 56 by 56 minimum, gap 8, bleeding to both edges (margin −20, padding 20)                                                                                                                                                                                                                                                             |
| Stops                 | "Stops 3" `headline` (count in `muted`); `StopRow`s with `TransitRow`s between; `AddStopRow` at the end; spine 3 dp, node 28 dp, rail 32 dp, gap 12                                                                                                                                                                                             |
| Collapse              | once the hero has scrolled away, `CollapsedBar` (56 dp, `surface`, hairline, title centred, Back) and the day chips pin beneath it; the areas strip scrolls away                                                                                                                                                                                |
| States                | zero stops: `GhostStamp`, "No stops yet", "Add stop" (existing text), zeros in tiles, no day chips; loading `TripDetailSkeleton`; offline `Banner` + chip; sync error: `Banner` and the Photos `AreaPill` `warn`; no cover: `GeneratedCover` with the same scrim                                                                                |
| Ids that MUST survive | `trip-screen`, `trip-header-row`, `trip-title`, `trip-links`, `trip-open-notes`, `-expenses`, `-photos`, `-documents`, `-offline-maps`, `trip-add-stop`, `trip-stops`, `trip-write-error`, `Back`, `stop-row-<id>`, `stop-dates-<id>`, `stop-move-up-<id>`, `stop-move-down-<id>`, `stop-edit-<id>`, `stop-remove-<id>`, `status-pill-<status>` |
| New ids               | `trip-days`, `trip-skeleton`, `trip-hero`, `trip-collapsed-bar`                                                                                                                                                                                                                                                                                 |
| Flows to re-check     | `01-account-and-trip` (title, "Planning", "No stops yet"), `03-globe` ("Past", "Active" after a stop is saved), `04-zoom`, `offline/13-*`, `14-*`                                                                                                                                                                                               |

### Stop editor and New trip (sheets) — `modal/add-trip`, the stop `FormModal` — Tier 1 (stop editor with Tier 2 aids)

| Screen      | Contract                                                                                                                                                                                                                                                                                      | Ids that MUST survive                                                                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New trip    | frames 09 and 10 reduced to name and currency; `FormSheet`, `fitToContents`, handle; Trip name `Field`; "Home currency" `ChipGroup` (one sideways row, "Other"); a note "Expenses are only visible to you." as helper text; sticky `FormActions`; **no destination, cover or dates** (FR-052) | `add-trip-screen`, `add-trip-title`, `currency-<CODE>`, `currency-other-toggle`, `currency-other`, `currency-pills`, `add-trip-error`, `add-trip-cancel`, `add-trip-save` |
| Stop editor | `FormModal`; the place `Field` with the city picker (flag chips, region), `RoutePreview`, the Arrive and Depart date fields, `NightsStepper`, Save sticky; extra frames `add-stop`, `add-stop-kb`; **no transport and no note**                                                               | `stop-editor`, `stop-editor-place`, `stop-editor-change-city`, `stop-editor-arrive`, `stop-editor-depart`, `stop-editor-save`, `city-picker-*`                            |
| Add expense | `FormSheet`; amount first (display 56, tabular, decimal keypad), then category and currency chip rows, note and date collapsed, Save above the keypad; extra frame `add-expense`                                                                                                              | `add-expense-screen`, `add-expense-amount`, `add-expense-date`, `add-expense-note`, `add-expense-error`, `add-expense-close`, `category-*`, `currency-*`                  |

Flows to re-check: `01-account-and-trip` (date picker taps "Previous month", "Next month", "12 ._", "10 ._"),
`02-notes-and-expenses` (amounts `5.50`, `.*5\.50.*`), `03-globe`, `offline/13-*`.

### Everyday areas — `trip/[id]/photos|notes|expenses|documents|offline-maps` — Tier 1 with Tier 2 summaries

| Screen       | Frames (extra)                                | Contract                                                                                                                                                                                                                                                | Ids that MUST survive                                                                                                                                                                                               |
| ------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Photos       | 04 `photos`, `photos-long`, `photos-scale1.5` | `AreaHeader`; `UploadSummary`; per day `DayHeader` and `PhotoMosaic` (114 dp tiles, gap 4); `AreaFab` "Add photos" (the existing name) and the take-photo control; states: "No photos yet" empty, skeleton, failed upload with Retry, permission denied | `photos-screen`, `photos-list`, `photos-title`, `photos-add`, `photos-take`, `photos-capture-error`, `photos-capture-message`, `photos-settings-error`, `photos-write-error`, `photo-status-icon`                   |
| Photo viewer | 05 `photo-viewer`                             | `PhotoViewer` (components C5-26)                                                                                                                                                                                                                        | `photo-viewer`, `photo-viewer-modal`, `photo-viewer-image`, `photo-viewer-place`, `photo-viewer-mismatch`, `photo-viewer-error`                                                                                     |
| Spending     | 06 `expenses`, `expenses-long`, `-scale1.5`   | `AreaHeader` with `PrivacyChip`; `SpendingHero`, `DayBars`, `CategoryBar`, grouped `ExpenseRow`s, `AreaFab` "Add expense"; states: "Nothing logged yet", skeleton, error; pending conversions counted                                                   | `expenses-screen`, `expenses-add`, `expenses-toggle-summary`, `expenses-write-error`, `spending-summary`, `summary-total`, `summary-rates`, `summary-pending`                                                       |
| Notes        | 08 `notes`, `notes-long`, `-scale1.5`         | `AreaHeader`; `NoteCard`s; `AreaFab` "Add note"; editor `FormModal` with Cancel and Save (no autosave)                                                                                                                                                  | `notes-screen`, `notes-add`, `notes-write-error`, `note-editor`, `note-editor-anchor`, `note-editor-body`, `note-editor-title`, `note-editor-error`                                                                 |
| Documents    | 10 `documents`, 11 `document-view`            | `AreaHeader` with `PrivacyChip` and the existing privacy line; `DocumentTicket`s; `AreaFab` "Scan document" (the existing capture entry); the view: scan hero, barcode on a white plate, details, Delete; capture and confirm screens restyled          | `documents-screen`, `documents-title`, `documents-add`, `documents-privacy`, `document-view-screen`, `document-view-title`, `document-delete`, `document-capture-*`, `document-confirm-*`, `document-upload-status` |
| Offline maps | 12 `offline-maps`                             | `AreaHeader`; `StorageBar`; `OfflineCityCard`s with the download pill; unplaced stops note                                                                                                                                                              | `offline-maps-screen`, `offline-maps-title`, `offline-storage`, `offline-unplaced`, `offline-status-<id>`                                                                                                           |

Flows to re-check: `02-notes-and-expenses`, `05-photos-and-documents` (assertions "No photos yet", "No documents
yet", "Boarding pass", "Uploaded to your account.", "Private — only you can see your photos.", "Close photo",
"Add photos from your library"), `offline/06-*`, `offline/08-*`.

### Welcome, Sign in, Create account — `(auth)/*` — Tier 1

| Screen         | Frames                       | Contract                                                                                                                                                                                                                                                                                                                                                                                                      | Ids that MUST survive                                                                                                                                                   |
| -------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Welcome        | 07 `welcome`, `welcome-dark` | sky and a globe turning behind (static under reduced motion, `useIdleSpin` at world scale); a 28 dp sheet (padding 24 20 34): wordmark row (32 dp mark + "TripTrackr", `callout`), `eyebrow` kicker, headline = the existing tagline "Plan it. Live it. Share what you want." with ONE nested accent word, a lede, `Button` primary "Create account" (52), secondary "Sign in" (52), one legal line (12 / 16) | `welcome-screen`, `welcome-hero`, `welcome-actions`, `welcome-create-account`, `welcome-sign-in`                                                                        |
| Sign in        | extra 13 `auth`, `auth-long` | `Screen`; `Field`s (email, password), the primary action in the thumb zone, `InlineError` with an icon, `SocialSignIn` (Apple on iOS only, Google; brand rules, equal weight) under the form; header Back named "Back"                                                                                                                                                                                        | `login-screen`, `login-email`, `login-password`, `login-submit`, `login-error`, `login-actions`, `social-sign-in*`, `provider-button-spacer`                            |
| Create account | extra 14 `register`          | the same order; three fields; the visible rules as helper text                                                                                                                                                                                                                                                                                                                                                | `register-screen`, `register-display-name`, `register-email`, `register-password`, `register-confirm-password`, `register-submit`, `register-error`, `register-actions` |

Flows to re-check: `01-appearance` (the tagline, "Sign in", "Password", "Email", "Create account", "Confirm
password"), `00-smoke`, `offline/00-a-setup-account`, `offline/07-b-first-sync-new-device`. **Not adopted**: three
equal buttons on Welcome (Tier 3 table).

### You — `(tabs)/profile/index` — Tier 1 with Tier 2 passport

| Aspect                | Contract                                                                                                                                                                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frames                | 08 `profile` (and `profile-dark`); the share and settings buttons of the frame are **not drawn** (Tier 3); the recap entry is **not drawn**                                                                                                                                             |
| Header                | iOS large title "You" is replaced by the identity block; Android standard header "You"                                                                                                                                                                                                  |
| Identity              | `Avatar` of initials (64 dp, decorative), name (`title`), "Traveller since 2021" (`label`, `muted`; from the account's creation date)                                                                                                                                                   |
| Period switch         | `PeriodSwitch` (All time and each year with at least one trip, newest first), 36 dp                                                                                                                                                                                                     |
| Passport card         | `PassportCard`: "PASSPORT · ALL TIME" `eyebrow`, countries `/195`, trips, kilometres, continents `/7`, "1.5× around the Earth"; 20 dp padding, gap 16, radius 24                                                                                                                        |
| Stamps                | `StampsPage`: "Stamps" and "14 of 195"; two columns (124 dp stamps, the second column 20 dp lower); the stamp landing for stamps earned in the last 7 days                                                                                                                              |
| Groups                | the existing Account ("Home currency") and App ("Version") `ListGroup`s                                                                                                                                                                                                                 |
| Set apart             | Sign out and Delete account, each danger ink with an icon, in their own block; the sign-out guard (`SignOutWarning`) is unchanged                                                                                                                                                       |
| Ids that MUST survive | `profile-screen`, `profile-identity`, `profile-display-name`, `profile-email`, `profile-account-group`, `profile-app-group`, `profile-version`, `profile-actions`, `profile-sign-out`, `profile-sign-out-error`, `profile-sign-out-icon`, `profile-delete-account`, `sign-out-warning*` |
| New ids               | `passport-card`, `passport-period`, `stamps-page`                                                                                                                                                                                                                                       |
| Flows to re-check     | `offline/11-a-sign-out-unsynced`, `offline/11-b-signout-arrived`                                                                                                                                                                                                                        |

### Conflict notice, first-sync gate, local-store gates, not-found — Tier 1

Restyled with the state components (C5-28): the conflict notices as `Banner`s or toasts, the first-sync gate as a
centred state over the sky with plain-words copy, the local-store gates and the not-found screen as
`EmptyState`. All ids as today (`conflict-notices`, `first-sync-screen`, `local-store-opening`,
`local-store-error`, `not-found-screen`).

### Tier 3 frames (not built; listed so none is silently dropped)

`search`, `search-recent` (global search); `recap`, `recap-2`, `recap-3`, `recap-share`, `recap-poster`
(recap and poster); `settings`, `settings-long` (settings); `permission-primer`, `-location`, `-notifications`
(primers); `trip-menu`, `delete-confirm`, `trips-toast` for deletion (the trip menu and undo); `states` is
reference for C5-28 only. Each needs what the spec's Tier 3 table names.

---

## Navigation structure (inherits 004 D4-06)

`(tabs)/trips` and `(tabs)/profile` stay nested stacks (same URLs); `trip/[id]` keeps `titled()` and the
`HeaderBackButton` adapter, with `headerTransparent` on the overview and the sub-screens' native headers kept
(`AreaHeader` is their first content row); `modal` stays ONE form sheet with a `Slot` layout; `Stack.Protected`
guards in the root layout are untouched. The pill belongs to the tab navigator only: pushed routes cover it.

## Text-scale reflow rules (the prototype's `data-bigtext`, at font scale 1.15 and above)

| Element                      | Default                      | At scale 1.15 and above                                                               |
| ---------------------------- | ---------------------------- | ------------------------------------------------------------------------------------- |
| Home figures                 | three columns with hairlines | one column, label left and figure right, hairline between rows                        |
| Trip areas                   | four columns                 | two columns                                                                           |
| Ticket card                  | thumb, text, stub in one row | column: thumb 88 dp high, text, stub as a row under a dashed top edge, notches hidden |
| Passport card grid           | two columns                  | one column                                                                            |
| Date and nights pill         | one row with dotted rule     | wraps, radius 16, rule hidden                                                         |
| Meta lines                   | one line, ellipsis           | two lines                                                                             |
| Trip row and Now card thumbs | 64 and 64 dp                 | 56 and 48 dp                                                                          |
| Home header tools            | row                          | column, right-aligned                                                                 |
| Tab labels                   | one line                     | wrap; the pill grows (minimum height)                                                 |
| Capped roles (1.3)           | scale to 1.3                 | stay at 1.3; the accessible names carry the rest                                      |

## Prototype defects not to reproduce (from `audit-report.md`)

Filter-chip count "1" at 4.46:1 (use `muted` on `surfaceSecondary`, 6.29:1 or better); "4,210 km" and a row title
sitting under an overlay (lists pad past the pill and the FAB, FR-024); the system clock over a hero (the top
scrim, FR-007); day chips cut at the edge are intentional scrolling, not a defect.
