# Contract: Component Adapter Layer (Sunrise Passport)

**Feature**: `specs/005-sunrise-passport-ui` | **Consumers**: every screen | **Supersedes**: the look, sizes and
variants in `specs/004-app-ui-redesign/contracts/components.md` C4-7 to C4-9 (its adapter boundary C4-6 and its
"As built" accessibility guarantees are **inherited**: they are style-independent and still hold unless this
document restates them).

The adapter layer is `apps/mobile/src/components/ui/` plus, for navigation chrome, `components/navigation/`.
Screens import UI primitives only from there. Only that folder imports `heroui-native`, `uniwind` components,
`phosphor-react-native`, `expo-glass-effect`, `react-native-zoom-toolkit` and `react-native-view-shot`.

Test identifiers: **every pre-existing `testID` and accessible name is preserved** (FR-081, SC-003). Where a
component is new, its identifiers are listed here and per screen in `screens.md`.

---

## C5-13. Adapter boundary (inherits C4-6; extended)

1. Screens and feature components import UI primitives **only** from `@/components/ui/*` and
   `@/components/navigation/*`.
2. Only those folders import the kit, Phosphor, the glass module, the zoom toolkit and view-shot; the
   `no-restricted-imports` rule and `adapter-guards.test.ts` list them.
3. Adapters take the app's own props, require an accessible name on every control and forward `testID` to the
   node a test or Maestro finds it by.
4. Fallbacks swap internals without touching a screen: glass to blur to solid (C5-21); Phosphor to the
   platform symbols (D5-07); the zoom toolkit to a custom viewer (D5-13); view-shot roundels to dots and
   `MarkerView` (D5-04).
5. Every component is exercised in `app/(dev)/gallery.tsx` (T524) in four themes at font scale 1 and 2.

---

## C5-14. `Icon` (registry over Phosphor)

```tsx
<Icon name="globe" size={24} weight="regular" tone="ink" label? decorative? testID? />
```

`name` is a registry key (`icon-registry.ts`, about 60 deep imports, never the barrel). `size` 16, 20 or 24;
`weight` `regular` (default), `fill` or `duotone`; `tone` a palette key (`ink`, `muted`, `accentText`, …,
resolved per theme, so the contrast themes need no promotion). Decorative icons are hidden from assistive
technology; a meaningful one (`label`) is announced as an image. Mirroring: a direction glyph (chevron, arrow)
mirrors when the layout direction is reversed. Brand glyphs (Google, Apple) stay in `brand-glyph.tsx`.

---

## C5-15. `Tappable` and `Button`

```tsx
<Button
  variant="primary" | "secondary" | "tonal" | "ghost" | "destructive"      // FR-006
  size="md" | "lg" | "sm"                                                  // 52 / 56 / 44 dp minimum
  accessibilityLabel                                                       // required
  busy? disabled? icon? iconOnly? onPress testID? >label</Button>
```

| Variant       | Look (light)                                                                              | Pressed                       | Disabled                    |
| ------------- | ----------------------------------------------------------------------------------------- | ----------------------------- | --------------------------- |
| `primary`     | `accent` fill, `accentInk` label, 1.5 dp `accentLine` edge ring (2 dp in contrast themes) | `accentPress` fill, scale .97 | `sand` fill, `subtle` label |
| `secondary`   | transparent, 1.5 dp `ink` outline, `ink` label                                            | `surfaceSecondary` fill       | outline `border`, `subtle`  |
| `tonal`       | `surfaceSecondary` fill, hairline, `ink` label                                            | `pressed` fill                | as secondary                |
| `ghost`       | no fill, `ink` label, 44 dp minimum                                                       | `pressed` fill                | `subtle` label              |
| `destructive` | `dangerTint` fill, `danger` label, always icon and verb                                   | `pressed` fill                | `subtle`                    |

**Guarantees (inherited from C4-7, restated)**: role `button`; `accessibilityState` carries `disabled` and
`busy`; minimum target 44 pt (iOS) or 48 dp (Android) scaled by the font scale so large text grows the control
(a minimum, never a fixed height); focus ring 2.5 dp with a 2 dp offset gap at 3:1 (P13); pressed within 100 ms
(scale .97 and fill; fill only under reduced motion); busy shows a spinner, keeps its label and ignores presses;
`busy` and `disabled` together throw in development. **Haptics**: `primary` plays the light impact,
`destructive` the warning notification; none under reduced motion. At most one `primary` per screen state
(review rule). The primary ring token is gated by P15. The label is `callout` (display 600, 17 / 22), `sm` is
`label` (14 / 20). Corner radius full (Android floating `lg`: 16).

`Tappable` is the bare form (no fill, `pressed` fill, the ring, the target) used by cards, rows, tabs and icon
buttons. Icon buttons (`iconOnly`) are 44 dp circles: `paper` with `lift1` (default), `tonal`, `ghost`, `glass`
(on photographs: `scrimButton` disc with `scrimButtonLine`, `onPhoto` icon) and `onSky` (92 percent paper, over
the globe).

---

## C5-16. Chips, pills, segmented control, status and sync

| Adapter         | API                                                                                      | Look and states                                                                                                                                                                                               | Accessibility and ids                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Chip`          | `label`, `accessibilityLabel`, `selected?`, `onPress?`, `leading?`, `disabled?`          | 40 dp visible, 44 dp hit; `surfaceSecondary` + hairline; selected = `ink` fill, `onInk` label and a check; dashed variant for "add"                                                                           | role `button` (or radio inside `ChipGroup`), `selected` and `checked`; selection haptic on change, not on re-press                 |
| `ChipGroup`     | as 004 (`options`, `selectedKey`, `onSelect`, `scroll?`)                                 | one sideways row, no scroll bar; a fade at the clipped edge                                                                                                                                                   | keeps `radiogroup` and `radio`, every existing id (`currency-<CODE>`, `currency-other-toggle`, …)                                  |
| `SegmentedPill` | `options[{ key, label, count?, testID, accessibilityLabel }]`, `selectedKey`, `onSelect` | track radius full, padding 4, thumb = track − 8 (concentric), min 36 dp (32 small); selected = `ink` fill; counts tabular                                                                                     | `tablist` and `tab`, or `radiogroup`; counts are part of the name ("Active, 1"); used for the trips filter and the passport period |
| `StatusChip`    | `status: 'planning' \| 'active' \| 'past'`, `dayOf?`                                     | 13 / 18 caption, icon and text; `active`: `surfaceSecondary` + hairline, coral live dot, "Active" (and "· Day 3 of 8" in the hero); `planning`: `amberTint` + `amberInk`; `past`: `surfaceSecondary`, `muted` | keeps `status-pill-<status>` and the label "Status: …"; the words stay Planning, Active, Past                                      |
| `SyncChip`      | `state: SyncChipState`, `onRetry?`                                                       | 36 dp, 92 percent paper + `lift1`; `waiting` cloud-up and count; `syncing` spinner; `offline` wifi-off (`amberInk`) and count; `failed` `dangerTint`, `danger` edge, verb "Retry"; `synced` hidden            | one per screen; announced "3 changes waiting to sync" or "Sync failed, retry"; id `sync-chip`; 4 dp hit slop                       |
| `SyncBadge`     | `state: 'pending' \| 'syncing' \| 'failed'` (per record)                                 | icon and text; glyph-only on photographs inside a 24 dp `scrimButton` disc, white and `danger` for failed                                                                                                     | keeps its ids and text equivalents ("Not yet synced", "Sync in progress", "Sync failed")                                           |
| `FlagChip`      | `iso2`, `size?: 'md' \| 'lg'`                                                            | 20 by 14 (28 by 20) rounded 3 (4) box with a hairline; flag glyph, else the two letters                                                                                                                       | decorative; hidden from assistive technology (the country name is beside it)                                                       |
| `PrivacyChip`   | `label?: 'Only you'`                                                                     | lock icon, `aquaTint`, `aquaInk`                                                                                                                                                                              | announced "Only you can see this"; id `privacy-chip`                                                                               |

---

## C5-17. Fields and pickers

`Field` keeps the 004 API (`label`, `value`, `onChangeText`, `error?`, `description?`, `isRequired?`, TextInput
props; `testID` on the input; `${testID}-error` on the message). Look: label above (`label` 600), 56 dp
minimum, `surfaceSecondary` fill, 1 dp `border` (3:1, P12), radius 12; focused: `surface` fill and a 2.5 dp
`focus` ring with a 2 dp gap; invalid: 1.5 dp `danger` boundary, plus the words and an alert icon beneath
(never colour alone); helper text with a leading info icon. `CurrencyPicker`, `CategoryPicker` and the
`DateField` keep their behaviour, ids and names; they take the chip, field and sheet styles.

---

## C5-18. Containers and rows

| Adapter                | API                                                                                          | Look                                                                                                                                       | Guarantees                                                                                                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Card`                 | `variant: 'lift' \| 'tile' \| 'flat'`, `overMap?`, `pending?`, `onPress?`, `cue?`, `radius?` | `lift`: `surface` + `lift1` + hairline; `tile`: `surfaceSecondary` + hairline, no shadow; `flat`: none                                     | A card never contains a card (development error); `overMap` is opaque with a hairline and `lift2`, never translucent; `pending` adds a dashed `amberLine` edge and the `SyncBadge` stays the marker; a pressable card is ONE `Tappable` with a cue at 3:1 |
| `ListGroup`, `ListRow` | as 004                                                                                       | 60 dp rows on `surface`, hairline inset separator, chevron `muted`                                                                         | row-level `accessibilityActions` forwarded; `tone="destructive"` is `danger` ink plus an icon                                                                                                                                                             |
| `StatTile`             | `value`, `of?`, `unit?`, `label`, `icon`, `onPress?`, `accessibilityLabel`                   | numeral 36 / 40 tabular, a lighter `/195` sibling on the same baseline, `label` below, 16 dp `duotone` icon                                | one control when `onPress` is set; announced "14 of 195 countries"; at font scale 1.15 and above a row (label left, figure right)                                                                                                                         |
| `AreaPill`             | `icon`, `label`, `count`, `private?`, `warn?`, `onPress`, `testID`                           | 72 dp minimum, radius 16, `surfaceSecondary` + hairline; lock chip top right for private areas; a 1.5 dp `danger` ring and dot when `warn` | keeps `trip-open-<segment>` ids; name "Photos, 128"; 4 columns, 2 at scale 1.15 and above                                                                                                                                                                 |
| `Panel`                | as 004                                                                                       | no fill                                                                                                                                    |                                                                                                                                                                                                                                                           |

---

## C5-19. Trip list components

| Component        | API                                             | Layout and states                                                                                                                                                                                                        | Accessibility and ids                                                           |
| ---------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `TripHeroCard`   | `trip: TripCardModel`, `onPress`                | radius 24, minimum 219 dp, cover with `scrim.bottom` and the caption scrim, eyebrow (flag chip, "Country · N stops"), title (2 lines), status chip "Active · Day 3 of 8", `StopStrip`, `SyncBadge` when pending; `lift1` | ONE control "title, status, N stops"; id `trip-card-<id>`; cover hidden from AT |
| `TicketCard`     | `trip`, `onPress`                               | radius 24, 96 dp minimum; 88 dp thumb, text, then a 88 dp stub with a 2 dp dashed `sand` edge and two canvas-coloured notches (circles 16 dp, hairline); stub = days to go; stacks vertically at scale 1.15 and above    | ONE control; id `trip-card-<id>`; the stub is part of the label ("in 94 days")  |
| `TripRow`        | `trip`, `onPress`                               | 72 dp minimum row, 64 dp thumb (56 at large text), title (1 line, 2 at large text), "Country · Mon YYYY · N days", chevron, `SyncBadge` when pending                                                                     | ONE control; id `trip-card-<id>`                                                |
| `StopStrip`      | `dots: Array<'done'\|'now'\|'next'\|'later'>`   | 12 dp dots joined by a 2 dp line: solid between done, dashed otherwise; done filled white, now a thick ring with halo, next a ring; abbreviations (LIS, SNT, OPO) in `eyebrow`                                           | decorative; summarised in the card's label                                      |
| `YearHeader`     | `year`, `tripCount`, `distanceKm`               | `headline` year, then "N trips · 9,380 km" in `muted`; sticky on `surface` with a hairline                                                                                                                               | role header                                                                     |
| `YearScrubber`   | `years: number[]`, `activeYear`, `onJump`       | 28 dp wide capsule on the right edge, `eyebrow` years, active on `ink`; only with 200 or more trips; jumps with a selection haptic                                                                                       | `adjustable` with increment and decrement over years; id `trips-year-scrubber`  |
| `GeneratedCover` | `palette`, `iso2`, `initial`, `thumb?`          | gradient, ghost code glyph at 16 percent white, dashed stamp outline, flag chip; `thumb` shows the code only (40 dp)                                                                                                     | hidden from AT                                                                  |
| `Scrim`          | `kind: 'top' \| 'bottom' \| 'caption' \| 'sky'` | the only consumer of gradient strings (C5-1)                                                                                                                                                                             | `pointerEvents="none"`                                                          |

---

## C5-20. Trip detail components

| Component      | API                                                           | Layout and states                                                                                                                                                                                                                                                                                        | Accessibility and ids                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TripHero`     | `cover`, `title`, `country?`, `dateRange?`, `scrollY`         | 236 dp minimum, `scrim.top` (status bar zone) and the caption scrim; eyebrow (flag, "Portugal · 12–19 Oct 2026"); title bottom-anchored, `title` role, 2 lines, growing upward; parallax .5, scale on overscroll                                                                                         | title keeps `testID="trip-title"` and is a heading; the glass Back is `HeaderBackButton` (name "Back")                                                                                             |
| `CollapsedBar` | `title`, `onBack`                                             | 56 dp solid `surface` + hairline appears when the hero has scrolled away; title centred, `callout`; the day strip pins beneath                                                                                                                                                                           | one Back; the title is announced once                                                                                                                                                              |
| `ProgressRow`  | `status`, `dayOf?`, `syncState`                               | 36 dp minimum: `StatusChip`, "Day 3 of 8" with dots (6 dp, `accentLine` done, ring now, `sand` rest), `SyncChip` right                                                                                                                                                                                   | id `trip-header-row` (kept)                                                                                                                                                                        |
| `AreasStrip`   | `counts`, `spendingTotal`, `warnPhotos?`                      | four `AreaPill`s (Photos, Notes, Expenses, Documents), the `PrivacyChip` line "Expenses and Documents are only visible to you" (copy from the existing privacy lines), and an Offline maps row beneath                                                                                                   | ids `trip-links`, `trip-open-photos`, `-notes`, `-expenses`, `-documents`, `-offline-maps`                                                                                                         |
| `DayChips`     | `days: TripDay[]`, `selected`, `onSelect`                     | 56 dp chips (`callout` "D3", `caption` "14 Oct"), "All" first; selected `ink` fill; sideways, pinned beneath the collapsed bar                                                                                                                                                                           | `radiogroup`; each name "Day 3, 14 October"; hidden with zero stops; id `trip-days`                                                                                                                |
| `StopRow`      | `stop`, `state: 'done' \| 'here' \| 'next'`, `leg?`, handlers | rail 32 dp: node 28 dp (check on `ink`, coral with a 4 dp halo, ring), spine 3 dp `ink` solid to the next stop or `accentLine` when the next stop is current; body: place (`callout`), country, dates and nights, "Now" chip, 56 dp city thumb; per-stop controls kept as compact icon-and-label buttons | keeps `stop-row-<id>`, `stop-dates-<id>`, `stop-move-up-<id>`, `stop-move-down-<id>`, `stop-edit-<id>`, `stop-remove-<id>` and the row's `accessibilityActions` (move up, move down, edit, remove) |
| `TransitRow`   | `km`                                                          | 36 dp: a dotted 3 dp `border` spine and "313 km" with a small icon; omitted when `km` is null                                                                                                                                                                                                            | decorative; the distance is in the stop's label ("313 km from Lisbon")                                                                                                                             |
| `AddStopRow`   | `onPress`                                                     | 52 dp, 2 dp dashed `border` outline, plus icon and "Add stop" (`callout`); inline at the end of the timeline, no FAB                                                                                                                                                                                     | keeps `trip-add-stop` and its name                                                                                                                                                                 |

---

## C5-21. `TabBar` as a floating pill (iOS), navigation bar (Android)

```tsx
<TabBar {...BottomTabBarProps} /> // components/navigation/tab-bar.tsx, export name kept
```

- **Geometry (iOS)**: absolute, `left` and `right` 16, `height` 64, `padding` 6, `gap` 4, radius full,
  `bottom = max(insets.bottom − 10, 12)`; the container is `pointerEvents="box-none"` so the globe pans around
  it; it reports `height + bottomOffset` through `BottomTabBarHeightCallbackContext` (88 dp on a 390 by 844
  phone). A 48 dp `surface` fade sits under it so content does not collide.
- **Surface** (`tab-surface.tsx`, one pure `tabSurface()`): iOS 26 or later with `isLiquidGlassAvailable()`,
  transparency not reduced and a base theme gives `GlassView`; otherwise iOS `BlurView` (a `surface` tint at
  84 percent); otherwise (Android, reduced transparency, contrast themes) opaque `surface` with a hairline and
  `lift2`. Opacity is never animated on the glass (it would vanish); hide with `translateY`.
- **Tab**: icon (24, `regular`; `fill` when selected) and `eyebrow`-size label (12 / 14, capped at 1.3), equal
  widths so the capsule is `index × tabWidth`; selected: `accentTint` capsule (`translateX`, the sheet
  spring), `ink` icon and label, heavier weight; unselected `muted`. Selection is a filled icon, a heavier label
  AND the capsule (FR-022), so it survives greyscale.
- **Android** (`android-nav-bar.tsx`): full width, 64 dp plus `insets.bottom`, `surfaceSecondary`, a top hairline,
  icon with a 56 by 32 dp indicator (`accentTint` at 26 percent) and a 12 dp label beneath, no blur, no fade.
- **Preserved**: `testID="tab-bar"`, `tab-<routeName>`, `tab-mark-<routeName>` (now on the selected capsule),
  `accessibilityRole` `tablist` and `tab`, `selected` state, the route label as the name. Press behaviour is
  React Navigation's (`tabPress`, then navigate; `tabLongPress`). Targets are at least 44 pt and 48 dp; labels wrap
  at large text and the pill grows (a minimum height, not a height).
- **Labels**: Globe, Trips, You (deliberate label change; `tab-profile` unchanged).

---

## C5-22. `Sheet` and `HomeSheet`

```tsx
<Sheet
  detents={{ peek, half, full }} // heights in dp from detentHeight()
  index
  onIndexChange
  onSettle
  handleLabel="Countries and trips"
  renderBody
/>
```

- **Placement**: a sibling overlay of `GlobeView` in `HomeGlobe`; `position: 'absolute'`; container
  `pointerEvents="box-none"`, sheet `pointerEvents="auto"`; bottom edge at the screen bottom, content padded by
  the tab zone (`useBottomTabBarHeight()`), radius 28 top, `surface`, hairline and `lift2`.
- **Gestures**: a `Gesture.Pan()` on the handle zone (a 96 by 48 dp area) and the header always, and on the body
  only when its scroll offset is at most 0 or the sheet is below full; release picks the nearest detent by
  velocity projection and settles with the sheet spring (C5-9); rubber-band above `full`. `activeOffsetY` and
  `failOffsetX` let horizontal swipes win. The body scroller (FlashList or ScrollView) has `bounces={false}` and
  its `scrollEnabled` changes only when a detent settles (once per settle, never per frame).
- **Detents**: `detentHeight()` of data-model §7: peek = 28 + live row + tab zone + 16 (212 dp at the default
  text size), half = max(52 percent of the window, peek + 120), full = window − (top inset + 10).
- **Accessibility**: the handle is `accessibilityRole="adjustable"` with `accessibilityValue` "Peek", "Half" or
  "Full" and `accessibilityActions` `increment` and `decrement` stepping the detents; Android `BackHandler`
  (inside `useFocusEffect`) lowers full to half to peek before the route pops.
- **Haptics**: selection on each settle. **Camera**: `onSettle(index)` calls `globeFit()` and
  `cameraRef.setCamera({ padding, zoomLevel, animationMode: 'easeTo', animationDuration: 280 })` once, then
  moves the map logo and attribution to `bottom: sheetVisiblePx + 8` (`logoPosition`, `attributionPosition`).
- **`globeFit(detent, windowWidth, headerBottom, sheetTop)`** (pure, in `features/globe/globe-fit.ts`): the rule
  of data-model §7: peek radius `clamp((band − 24) / 2, 110, 175)` centred in the band at `headerBottom +
band / 2 + 4`, other detents radius `clamp(0.95 × band, 150, 286)` centred at `headerBottom + 28 + radius`,
  `band = sheetTop − headerBottom`; at least 20 dp of margin to each side at peek (SC-018). At `full` the
  camera does not move (the map is hidden) and rotation pauses.
- **Ids**: `home-sheet`, `home-sheet-handle`, `home-sheet-body`.

---

## C5-23. Home content

| Component        | Detent     | Content and rules                                                                                                                                                                                                                                                       | Ids (kept in bold)                                                                                                      |
| ---------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `GreetingHeader` | peek, half | over the globe: `eyebrow` date ("WED 14 OCT"), `display` "Hello, _Marta_" (the name in the serif accent), 2 lines maximum; right: `SyncChip` and a recentre control only after the camera moved; hidden at full                                                         | `home-greeting`, `home-recentre`                                                                                        |
| `StatsRow`       | half       | three `StatTile`s separated by hairlines (countries `/195`, trips, kilometres); `AnimatedNumber` counts up once; the countries tile opens the full detent, trips opens the Trips tab, distance does nothing but is announced; stacked rows at font scale 1.15 and above | **`globe-stats`**, **`globe-stat-countries`** (text is the plain number), **`globe-stat-distance`**, `globe-stat-trips` |
| `NowCard`        | peek, half | a 64 dp thumb (56 at peek), title, "Day 3 of 8 · Sintra", progress dots, chevron; opens the trip; the one live trip, else the next planned, else nothing                                                                                                                | `home-now-card`                                                                                                         |
| `NextRow`        | half       | the next planned trip as a 48 dp thumb row: title, "Jan 2027 · in 94 days"                                                                                                                                                                                              | `home-next-row`                                                                                                         |
| `CountriesList`  | full       | header "Countries" with a collapse control, `Field` search ("Search countries"), a ring card ("14 of 195", "4 of 7 continents · 19 trips") with up to two stamps, then groups by continent (sticky `eyebrow` headers with counts); a FlashList; no results message      | `countries-list`, `countries-search`, `countries-collapse`                                                              |
| `CountryRow`     | full       | 60 dp: `FlagChip`, name (`callout`), "First visited 2021", "Now" chip, trailing "3 trips" and a chevron; press lowers the sheet to half and flies the globe to `focus`                                                                                                  | `country-row-<iso2>`; name "Portugal, 3 trips, first visited 2021"                                                      |
| `PlanTripFab`    | peek, half | the extended button above the pill: iOS capsule (52 dp), Android rounded square (56 dp); label "Plan a trip"; hidden at full and when no trips exist; 16 dp above the pill                                                                                              | **`home-plan-trip`** (the existing id; with no trips it is the invitation card's primary)                               |
| `InvitationCard` | (no trips) | the existing `globe-empty-state` card: three tilted empty photo frames (84 by 108 dp, `skeleton` fill, a pin glyph, 3 dp `surface` border, `lift2`) above the headline "Your globe is waiting for its first trip" with one accent word, one line, the primary           | **`globe-empty-state`**, **`home-plan-trip`**, **`home-add-stop`**, **`home-open-trips`**, **`globe-notice`**           |
| `HomeSkeleton`   | loading    | a disc where the globe will mount (radius from `globeFit('half')`), skeleton sheet (greeting, 3 stat blocks, one row); the greeting text comes from the previous session's cached name                                                                                  | `home-skeleton`; ONE `progressbar` named "Loading your globe"                                                           |

The existing `LoadingState` "Loading your globe" is kept for the wait for the local store. Home uses no header.

---

## C5-24. Globe layers (inside `components/globe/`)

All inside the ONE `MapView`; geometry code untouched (FR-082). Each has a Jest stand-in tag.

| Component / hook        | Role                                                                                                                                    | Gate and tests                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `basemap-config.ts`     | the `StyleImport` config object from `GlobeStyle` tokens and the theme; allow-listed keys only                                          | key allow-list test (T505); `colorAdminBoundaries`, `colorGreenspace`              |
| `AtmosphereLayer`       | `<Atmosphere style>` from tokens; opaque colours                                                                                        | V2 device check                                                                    |
| `VisitedCountriesLayer` | `VectorSource` country boundaries, `FillLayer` + keyline `LineLayer` (and the amber dashed planned keyline), worldview filter, ISO list | filter built by a pure function; asserts the worldview clause                      |
| `GraticuleLayer`        | static GeoJSON every 30 degrees; opacity fades out above zoom 4                                                                         | pure geometry test                                                                 |
| `GradientArcLayer`      | `lineMetrics` source, one Feature per leg, `lineGradient` over `line-progress` from the `GlobeColors` stops                             | stops gated (C5-11); the shared hit source is unchanged                            |
| `RoundelLayer`          | `SymbolLayer` + `Images` for pins; `symbolSortKey` by status rank (active last); dots beyond about 60                                   | falls back to dots without view-shot (V2)                                          |
| `ActiveCallout`         | ONE `MarkerView`: tag (white, radius 16, 220 dp maximum, title one line, "Day 3 of 8 · Sintra") and Reanimated pulse rings              | flips side near an edge (12 dp margin); still under reduced motion; announced once |
| `useIdleSpin`           | `linearTo` chain, 5 s per 20 degrees, every stop condition of FR-019                                                                    | timer spied through `setInterval`, as AGENTS.md says                               |
| `useGlobeActions`       | `accessibilityActions` of the map view: next trip, previous trip, recentre, open countries                                              | FR-017                                                                             |

---

## C5-25. Passport components

| Component      | API                                     | Look and rules                                                                                                                                                                                               | Accessibility and ids                                                           |
| -------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `Stamp`        | `spec: StampSpec`, `size`, `landing?`   | `react-native-svg`, viewBox 120 by 120, `TextPath` circular text, code 25 to 30 pt in display 700, wear `<Mask>`, rotation, `multiply` in light and normal in dark; `landing` plays the stamp animation once | `accessible={false}`; the parent is labelled "Stamp: Portugal, 12 October 2026" |
| `GhostStamp`   | `size`                                  | dashed `border` outline, no text; the empty-passport and zero-stop art                                                                                                                                       | hidden from AT                                                                  |
| `PassportCard` | `totals: PassportTotals`, `periodLabel` | radius 24, the passport gradient (C5-10), 20 dp padding, two-column grid of `numeral`s (one column at font scale 1.15 and above), "1.5× around the Earth" line, a watermark glyph, an MRZ line (decorative)  | id `passport-card`; announced as one summary in words                           |
| `StampsPage`   | `stamps: StampSpec[]`, `visitedCount`   | `surfaceSecondary` page with a notch, hairline, two columns with the second shifted 20 dp, ghosts for the first unvisited slots, "14 of 195"; rasterised stamps past about 100                               | id `stamps-page`                                                                |
| `PeriodSwitch` | `periods: PassportPeriod[]`, `selected` | a `SegmentedPill` ("All time", "2026", "2025")                                                                                                                                                               | id `passport-period`                                                            |

---

## C5-26. Photos

| Component       | API                                       | Look and rules                                                                                                                                                                                                                                                               | Accessibility and ids                                                                                                                                                    |
| --------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DayHeader`     | `day`, `place`, `count`                   | `numeral`-size date (36), `callout` place, `label` "Wed · Oct · 14 photos"                                                                                                                                                                                                   | a heading                                                                                                                                                                |
| `PhotoMosaic`   | `photos`, `onOpen`                        | grid of three 114 dp columns (gap 4) with a 2 by 2 lead tile and, past nine, a last tile "+N"; radius 16 on the image only; `recyclingKey`; thumbnails only; **no tint and no shadow**                                                                                       | each tile named with its place and time (existing `photo-tile` naming)                                                                                                   |
| `UploadState`   | `state`, `onRetry`                        | on the thumbnail: queued (dashed ring and cloud-up), uploading (ring spinner), uploaded (a check for 2 s then nothing), failed (`danger` pill "Retry" with an alert icon) in a 24 dp `scrimButton` disc                                                                      | keeps `photo-status-icon` and its text equivalents; a failed tile is a button                                                                                            |
| `UploadSummary` | `uploading`, `total`, `failed`, `onRetry` | a 56 dp tonal capsule "Uploading 2 of 5 · 1 failed" with a ring spinner and "Retry"                                                                                                                                                                                          | ONE live region; id `photos-upload-summary`                                                                                                                              |
| `PhotoViewer`   | existing props                            | full screen `Modal`; the photo on its own colour (an `expo-image` `blurRadius` backdrop, no backdrop filter), zoom, double-tap, swipe between, pull down to close; the existing detail block (place and time, refile `ChipGroup`, retry, delete with `Alert`, Close) beneath | keeps `photo-viewer`, `photo-viewer-modal`, `photo-viewer-image`, `photo-viewer-place`, `photo-viewer-mismatch`, `photo-viewer-error`, "Close photo", `photo-file-<key>` |

---

## C5-27. Expenses, notes, documents, offline maps

| Component         | Look and rules                                                                                                                                                                                                                                                                              | Ids kept                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `SpendingHero`    | "Spent so far" `label`, the currency sign (display 28) and the total (`numeral` at 56 / 56 in display 700, tabular, may shrink with `adjustsFontSizeToFit`), a tonal capsule "€281 / day · Day 3 of 8", the rate line with an info icon ("Converted at today's rate · as of 14 Oct, 09:00") | `summary-total`, `summary-rates`, `summary-pending`, `spending-summary`, `expenses-toggle-summary` |
| `DayBars`         | one bar per day: radius 12 top, `sand` with a `border` outline for past days, `ink` for today, dotted baseline for empty days; labels date over amount (tabular); **no budget line**                                                                                                        | `expenses-day-bars`                                                                                |
| `CategoryBar`     | 12 dp bar, radius full, 2 dp gaps; legend of swatch, name, amount; four category inks from the stamp and accent tokens; each category also has its icon in the rows (never colour alone)                                                                                                    | `expenses-category-bar`                                                                            |
| `ExpenseRow`      | 48 dp category roundel (icon on a tint), title (the note or the category), "Category · City", amount right-aligned tabular; group header "Wed 14 Oct · Today" with the day total                                                                                                            | `expenses-screen`, `expenses-add`, `expenses-write-error`                                          |
| `NoteCard`        | radius 16, `surfaceSecondary` + hairline, title or preview (3 lines), "16:12 · Sintra", a `SyncBadge` glyph                                                                                                                                                                                 | `notes-screen`, `notes-add`, `notes-write-error`                                                   |
| `DocumentTicket`  | like `TicketCard`: a 44 dp `surface` circle with the type icon (plane, bed, document), kind (`caption`), title (`callout`, 2 lines), one detail, a stub with the day numeral and month; two notches                                                                                         | `documents-screen`, `documents-add`, `documents-privacy`, `document-view-screen`                   |
| `OfflineCityCard` | restyled: 64 dp thumb, city, size, a "Download" or "Downloaded" pill (44 dp), progress ring; `StorageBar` (12 dp, used and free in MB)                                                                                                                                                      | `offline-maps-screen`, `offline-storage`, `offline-status-<id>`, `offline-unplaced`                |
| `AreaHeader`      | Back (`HeaderBackButton`, round), title (`title`), subtitle line `label` "Trip · N things", `PrivacyChip` on Expenses and Documents; used under the native header of each pushed screen                                                                                                     | `<area>-screen` ids as today; the title ids (`documents-title`, `photos-title`, …)                 |
| `AreaFab`         | the screen's one primary add action, extended, 16 dp above the safe area, `lift2`; hides while the keyboard is up                                                                                                                                                                           | `photos-add`, `photos-take`, `notes-add`, `expenses-add`, `documents-add`                          |

---

## C5-28. States

| Component                                                                | Look and rules                                                                                                                                                                               |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Skeleton`, `SkeletonGroup` (kit)                                        | `skeleton` fill, shimmer `skeletonHighlight` at 1.4 s; ONE `progressbar` region per skeleton, shapes hidden; static under reduced motion; a photograph skeleton carries a pin glyph          |
| `TripListSkeleton`, `TripDetailSkeleton`, `AreaSkeleton`, `HomeSkeleton` | shaped from the real geometry (hero 16:10, ticket, rows; hero, status row, four tiles, day chips, three stops)                                                                               |
| `EmptyState`                                                             | `variant: 'ghost-stamp' \| 'frames' \| 'plain' \| 'filtered'`, `title`, `detail?`, `action?`; never a primary when a screen already has one; the existing strings are kept                   |
| `ErrorState`                                                             | words, alert icon, `danger` ink, a secondary "Try again" where a retry exists                                                                                                                |
| `Banner`                                                                 | `tone: 'offline' \| 'error'`, a slim non-blocking row: `amberTint` and `amberInk` for offline, `dangerTint` and `danger` for error, icon, text, an underlined action; role `alert` for error |
| `Toast`                                                                  | over the HeroUI Toast: `toastSurface`, `toastInk`, one 44 dp action in `accentPress`, a 3 dp countdown bar, radius 16, `lift2`, above the pill; announced politely; auto-dismiss 5 s         |
| `PermissionState`                                                        | the camera and photographs denial screens restyled: icon, words, "Open Settings" secondary                                                                                                   |

---

## C5-29. Forms

`FormSheet`, `FormModal`, `FormActions`, `InlineError` keep the 004 contracts and ids (`<id>-body`, `<id>-footer`,
`<prefix>-cancel`, `<prefix>-save`); they take the Sunrise look: 28 dp top radius, a 36 by 5 dp `grab` handle
(32 by 4 on Android), `Cancel` in `ink` (text variant), the title centred (`callout` in the bar, `headline` as
the heading), the footer opaque with a hairline, `Save` the single primary. The keyboard-visibility test
(`test/helpers/keyboard.ts`) is still written for every form (004 rule 8). The stop editor adds `RoutePreview`
(a `StopStrip` of the trip's stops plus the new one, and "Stop 3 · 322 km from Sintra") and `NightsStepper`
(two 44 dp circular buttons and the figure; changing it moves the departure date; ids
`stop-editor-nights-minus`, `stop-editor-nights-plus`) beside the unchanged `stop-editor-arrive` and
`stop-editor-depart`.

---

## C5-30. `AnimatedNumber`, haptics

```tsx
<AnimatedNumber value={14} format={Intl options} role="numeral" />
```

Renders the final text at once under reduced motion; otherwise counts up once per appearance (C5-9) and always
sets `accessibilityLabel` to the FINAL formatted value. `useHaptics()` exposes `selection`, `impact(light |
heavy)`, `success`, `warning`, `error`, each a no-op under reduced motion or where unsupported (map: D5-14).

---

## Review rules for new adapters

1. Function under 50 lines, file under 800, nesting under 4, no debug output.
2. A failing test first: accessible name required, `testID` forwarded, busy and disabled semantics,
   largest-text rendering (scale 2), reduced-motion behaviour, four themes.
3. No literal colour or gradient; no import of the kit, Phosphor, glass, zoom or view-shot outside the folders.
4. A tappable surface names its cue (chevron, icon or label) at 3:1.
5. No 20 percent soft fill under text (the gate measures the fixed tints).
6. A focus ring is drawn with the 2 dp offset gap of surrounding neutral.
7. Only `ink` text on a `pressed` fill. A soft chip sits on `surface` or `surfaceSecondary` only.
8. Text on a photograph sits on the caption scrim and is `onPhoto`; a control on a photograph sits on a
   `scrimButton` disc; a grid thumbnail or the viewer carries no overlay.
9. A component with a fixed height is a bug: use a minimum and let it grow.
10. A component never fades the glass pill by opacity.
