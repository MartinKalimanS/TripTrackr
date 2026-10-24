# Feature Specification: Sunrise Passport UI

**Feature Branch**: `feat/005-sunrise-passport-ui`

**Created**: 2026-10-12

**Status**: Draft

**Input**: Owner review of feature 004 on a phone: "The Atlas look is ugly." Follow-up brief: redesign the
mobile UI with the **Sunrise Passport** art direction (prototype v2: a sunlit globe, a bottom sheet, a
floating tab pill, passport stamps), keep the globe, keep every capability, and replace the Atlas look.

## Overview

Feature 004 gave TripTrackr a calm, native-feeling structure (real headers, grouped lists, sheets,
accessible adapters) and an identity called Atlas: cobalt on paper-tinted neutrals, a platform text face,
a flat bottom strip. The structure works. The look was rejected: it reads as a competent settings app, not
as the place where a traveller keeps their world.

This feature replaces the look and re-lays out every screen around one idea: **the traveller's passport,
in morning light**. The globe is the hero of Home and sits in a warm sky. A bottom sheet that can be pulled
up holds the numbers that matter (countries, trips, kilometres), the trip happening now, and, pulled all
the way up, the list of countries visited. A floating pill carries the three tabs. Trips are shown as
photographs (an active trip as a hero, the next trip as a ticket, the rest as compact rows). A trip opens
as a journey: a hero picture, a day strip and a timeline of stops. Countries become passport stamps. White,
cream and deep navy carry the text; coral is kept for the one thing to do next and for "now"; aqua means
water and "only you"; amber means "planned".

Two things do not change. First, **what the product does**: no capability, stored record, permission,
synchronisation rule or privacy rule is added, removed or altered. Second, **what the traveller can
rely on**: the contrast, touch-target, text-size, motion and transparency commitments of features 002, 003
and 004 are style-independent and carry over, and the globe stays reachable without sight or gestures (a
list of countries is its accessible twin).

The design source is the prototype v2 (frames Home half, peek and full, Home empty, Trips, Trip, Welcome,
You, New trip, the loading, offline and error states, and the extra screens). The prototype is a
drawing: where it shows something the product cannot do today, this specification says so and sorts it
into a scope tier (below) instead of building a dead control.

## Scope tiers

Every requirement below carries a tier tag.

- **Tier 1: restyle and re-layout every existing screen and capability.** Nothing is removed. Every
  pre-existing accessible name and automated-test identifier is kept, except the deliberate label changes
  in "Copy and label policy" (each one updates the flows that use it). This is the feature.
- **Tier 2: new read-only views derived from data already on the device.** Marked **[Tier 2]**. They read
  the signed-in traveller's own local rows, store nothing, transmit nothing and add no schema. They are:
  the Countries list (Home full detent and the globe's screen-reader alternative), the three Home numerals
  and the trips count, per-trip "Day N of M", countdown and stop strip, day chips, leg distances, trip
  filters and year grouping with totals, photo grouping by day, expense per-day and per-category summaries,
  the passport card and its year switch, and the stamps page.
- **Tier 3: design-only extras that need new product capability.** They are listed under "Tier 3: out of
  scope" with what each needs. They are not built, and no inert control stands in for them.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - My world, the moment I open the app (Priority: P1)

A traveller opens TripTrackr and sees the globe in warm light with their trips on it, and a sheet at the
bottom that says how much of the world they have seen and what is happening now. They pull the sheet up to
see the whole list of countries, or push it down to see the whole planet. The globe turns slowly until
they touch it.

**Why this priority**: Home is the first thing seen on every launch and is the product's signature. It
must be judged first, on a phone, because the rejected look failed exactly here.

**Independent Test**: With trips in the past, present and future, open Home in light and dark. Drag the
sheet through all three positions, then do the same with a screen reader and with a keyboard, and open the
country list without dragging.

**Acceptance Scenarios**:

1. **Given** trips exist, **When** Home opens, **Then** the globe fills the screen under a warm sky, visited
   countries are tinted, trips appear as pins with their cover pictures, the live trip's pin carries a
   ring and a short callout, and a sheet shows three figures (countries, trips, kilometres) and the live
   trip.
2. **Given** the sheet is at its middle position, **When** the traveller drags it down, **Then** it settles
   on a position showing one row, the whole planet is visible above it with clear margins, and the
   globe has moved with it rather than being covered.
3. **Given** the sheet is at its middle position, **When** the traveller drags it up, **Then** it fills most
   of the screen as an alphabetical-by-continent list of countries with flags, trip counts and the year
   first visited; choosing a country returns to the globe flown to that country.
4. **Given** a screen reader is running, **When** the traveller focuses the sheet's handle, **Then** it
   offers "more" and "less" actions that move it between positions, and the country list is reachable
   without dragging.
5. **Given** the traveller has no trips, **When** Home opens, **Then** the globe is still shown, with one
   invitation card and its one action, and no stock photographs.
6. **Given** the device asks for reduced motion, **When** Home is idle, **Then** the globe does not turn,
   nothing pulses and the figures show their final values at once.

---

### User Story 2 - My trips at a glance (Priority: P1)

A traveller opens Trips and sees, without opening anything, which trip is happening now (a large picture
card with how far through it they are), what is next (a ticket with a countdown), and what is behind them
(compact rows grouped by year). They can filter by status and, with hundreds of trips, jump by year.

**Why this priority**: The trip list is the most repeated path, and the strongest test of whether the new
look is useful rather than decorative.

**Independent Test**: With an active, a planned and several past trips (some without photographs), open
Trips; then with 200+ trips; then at the largest text size.

**Acceptance Scenarios**:

1. **Given** an active trip, **When** Trips opens, **Then** it is the first item, as a hero card with its
   cover picture, country, title, "Active · Day 3 of 8" and one dot per stop, filled for stops done.
2. **Given** a planned trip, **When** Trips opens, **Then** it appears as a ticket whose stub counts the
   days to departure.
3. **Given** a trip has no photograph, **When** its card is drawn, **Then** it shows a generated cover (a
   gradient, the country's code and a stamp outline), never an empty box.
4. **Given** the traveller taps "Planned", **When** the filter changes, **Then** only planned trips remain,
   their count is shown on the filter, and an empty result says so in words.
5. **Given** 200 or more trips, **When** the list scrolls, **Then** it stays smooth, the title carries the
   count, year headers stay in view and a year strip jumps to a year.
6. **Given** a trip has changes not yet synchronised, **When** its card is shown, **Then** a marker with
   text and an icon says so.

---

### User Story 3 - A trip as a journey (Priority: P1)

A traveller opens a trip and sees its picture, its title and dates, how far along it is, the five areas
(photos, notes, expenses, documents, offline map), a strip of days and its stops as a timeline with the
distance between them. Their private areas are marked as private.

**Why this priority**: This is where travellers spend their time during a trip and it carries the
"journey" idea of the identity.

**Independent Test**: Open an active trip, a planned trip, a trip with no stops and a trip with a very long
title; scroll the page; use Back; repeat at the largest text size.

**Acceptance Scenarios**:

1. **Given** an active trip, **When** it opens, **Then** the title sits on the picture, a status row shows
   "Active", "Day 3 of 8" and progress dots, and the current stop is marked "Now".
2. **Given** the traveller scrolls, **When** the picture leaves the screen, **Then** a solid header with the
   title and Back takes its place and the day strip stays in view.
3. **Given** a trip with stops, **When** the timeline is shown, **Then** each stop shows its place, country
   and dates, solid line segments join stops that follow each other, and the distance between stops is
   shown on the line.
4. **Given** the traveller looks at Expenses and Documents, **When** they are shown, **Then** each carries a
   lock mark and one line says they are visible only to the traveller.
5. **Given** a trip with no stops, **When** it opens, **Then** an empty state offers "Add stop" and the day
   strip is hidden.
6. **Given** a stop row, **When** the traveller uses a screen reader, **Then** move up, move down, edit
   dates and remove are offered as actions, as before.

---

### User Story 4 - The everyday screens: photos, spending, notes, documents, offline maps (Priority: P2)

A traveller browses photographs grouped by day, sees what they have spent and where, reads notes, opens a
boarding pass and manages offline maps. These screens share one header, one add action and designed empty,
loading and error states, and set the numbers that matter large.

**Why this priority**: These are the daily-use screens inside a trip; leaving them in the old look would
leave the product half-converted.

**Independent Test**: Open each of the five areas with data, without data, while loading and with a forced
error, and add one item in each that has an add action.

**Acceptance Scenarios**:

1. **Given** a trip with photographs, **When** Photos opens, **Then** photographs are grouped by day with a
   large date and place, shown at full fidelity with no tint, and any photograph not yet uploaded says so
   on its thumbnail.
2. **Given** some photographs failed to upload, **When** Photos opens, **Then** a summary line says how many
   are uploading and how many failed, with a Retry.
3. **Given** a trip with expenses, **When** Spending opens, **Then** the total in the home currency is the
   largest figure, a per-day bar and a category bar summarise it, the exchange-rate date is stated in
   words, and rows show a category icon and right-aligned amounts.
4. **Given** Documents, **When** it opens, **Then** documents appear as tickets with a type icon and date,
   under a lock mark and a privacy line.
5. **Given** any of the five areas is empty, loading or failed, **When** it opens, **Then** it shows its
   designed state with the one action that fits.

---

### User Story 5 - Forms and sheets that feel finished (Priority: P2)

A traveller plans a trip, adds a stop, logs an expense or writes a note. Each opens as a sheet with a
handle, clear labels, plain-words errors, and a primary action that stays above the keyboard.

**Why this priority**: Forms are where travellers type one-handed in awkward places.

**Independent Test**: Open each form, focus the last field with the keyboard up, submit valid and invalid
input, dismiss by gesture.

**Acceptance Scenarios**:

1. **Given** "New trip", **When** it opens, **Then** it asks only for the trip's name and home currency, as
   one line of choices with "Other".
2. **Given** the stop editor, **When** the traveller picks a place and dates, **Then** the sheet shows the
   route so far and the distance from the previous stop, and the number of nights as a stepper.
3. **Given** the keyboard is up, **When** the traveller looks for Save, **Then** it is visible above the
   keyboard.
4. **Given** a field is invalid, **When** the traveller submits, **Then** the message is in words with an
   icon beside the field.

---

### User Story 6 - Readable anywhere, and usable without the globe (Priority: P2)

A traveller in strong sun, in a dark cabin, with the largest text, with increased contrast, with reduced
motion or transparency, or using a screen reader, can read every label, tell what is tappable, and reach
every country and trip.

**Why this priority**: These are explicit statements by the traveller that the default does not work for
them; the new look has more text on pictures and more movement than the old one, so the risk is higher.

**Independent Test**: Switch each appearance setting in turn and visit every screen; walk Home, Trips, a
trip and You with a screen reader.

**Acceptance Scenarios**:

1. **Given** any theme, **When** every text, control, chip, status and map pairing is measured, **Then** it
   meets the floors in FR-068 and FR-069, including white text on a pure white photograph.
2. **Given** the largest text size, **When** any screen opens, **Then** nothing is clipped or overlapped:
   the three figures stack, the areas become two columns and tickets stack.
3. **Given** increased contrast, **When** any screen opens, **Then** text meets 7:1, boundaries are explicit,
   and nothing is translucent.
4. **Given** a screen reader, **When** Home is explored, **Then** every visited country and every trip on the
   globe is reachable from lists, and the numerals are announced once, with their final values.

---

### User Story 7 - A first impression, and a passport (Priority: P3)

A new traveller sees the globe turning behind a welcome sheet. Later, the You screen shows who they are, a
passport card with their totals (all time or one year) and a page of stamps, one per country.

**Why this priority**: Rarely visited compared with Trips, but it carries the identity's best idea.

**Independent Test**: From a signed-out install create an account and sign in; open You, switch the year,
scroll the stamps, sign out.

**Acceptance Scenarios**:

1. **Given** a signed-out traveller, **When** Welcome opens, **Then** a globe turns behind a sheet with the
   product name, one line of promise, a primary "Create account" and a secondary "Sign in".
2. **Given** a traveller with visited countries, **When** You opens, **Then** a passport card shows
   countries (of 195), trips, kilometres and continents (of 7), and a line comparing the distance with the
   Earth's circumference.
3. **Given** the traveller selects a year, **When** the switch changes, **Then** the card shows that year's
   figures only.
4. **Given** the stamps page, **When** it is shown, **Then** each visited country has one stamp whose shape,
   ink and tilt are always the same for that country and date, and a screen reader hears "Stamp: Portugal,
   12 October 2026".

---

### User Story 8 - Small moments of delight, never in the way (Priority: P3)

Figures count up once, a new stamp lands with a small thud, the live trip's pin pulses, and a light haptic
confirms selections and saves. All of it is off when the traveller asks for reduced motion.

**Why this priority**: These moments are what make the identity memorable, and the cheapest to remove.

**Independent Test**: Trigger each moment with and without reduced motion.

**Acceptance Scenarios**:

1. **Given** Home opens, **When** the sheet first appears, **Then** the three figures count up once in under a
   second and a screen reader hears only the final values.
2. **Given** a stamp earned in the last seven days, **When** the stamps page is first shown in a session,
   **Then** it lands once with a short haptic.
3. **Given** the traveller selects a detent, a tab or a choice, **When** it settles, **Then** a light haptic
   plays on devices that support it, and none plays under reduced motion.

---

### Edge Cases

- **Very long trip, place and country names.** Hero titles clamp to two lines and grow upward from the
  bottom of the picture, never behind the sheet; tickets two lines, rows one; the globe callout one line
  with the full text on the trip; large figures shrink or switch to compact notation (for example 1.26M)
  instead of overflowing.
- **A trip with no photograph, a missing file or one that will not draw.** The generated cover is used
  without a layout jump.
- **A white or very bright photograph under white text.** Every text-on-picture slot is tested against a
  pure white photograph.
- **A trip with zero stops, a stop in a city this device has not cached, or overlapping dates.** The empty
  state, the pin-less trip and the status rules of features 001 and 003 apply unchanged.
- **200+ trips, 1,000+ expenses, 1,000+ photographs.** Lists are virtualised; scrolling stays smooth; a
  placeholder is shown while loading.
- **Largest text size on a small phone.** The three figures stack, tabs wrap to the pill's height, tickets
  stack, the areas become two columns, forms scroll; nothing is clipped.
- **Offline, or changes waiting.** The globe, trips, notes and photographs on the device stay usable; one
  slim banner and one chip say what is waiting; a record not yet uploaded is never shown as saved.
- **The home currency, distance units and dates follow the device.** Plurals ("1 trip", "2 trips"), units
  and formats are never hard-coded.
- **Sheet at the full position on Android.** The back gesture lowers it before leaving the screen.
- **The device has no vibration motor or haptics are off.** Everything still works.
- **Right-to-left languages** are not in scope; layouts still avoid hard-coded left and right where a
  start and end are free to choose.
- **A shared screenshot.** Content stays legible without relying on soft shadows.

## Requirements _(mandatory)_

### Functional Requirements

**Visual identity**

- **FR-001** [Tier 1]: The product MUST define one named set of visual values (colours, nine text sizes,
  spacing steps, five corner radii, two lifts, three icon sizes and motion timings) from which every screen
  draws. It supersedes feature 004 FR-001.
- **FR-002** [Tier 1]: Colour MUST be white and cream surfaces, deep navy text, and one coral used only for
  the primary action and for "now" (the active trip, the current stop, the live pin). Aqua MUST mean water
  and "only you". Amber MUST mean planned. Trip status MUST also be carried by text and an icon. It
  supersedes feature 004 FR-003.
- **FR-003** [Tier 1]: Depth MUST be exactly two lifts (a soft lift for cards and tiles; a floating lift for
  the action button, tab pill, callout tag, sheets and toasts) plus a hairline. Buttons MUST be flat.
  Recessed, double-shadow and per-control raised treatments MUST NOT appear. It supersedes feature 004
  FR-002.
- **FR-004** [Tier 1]: Text MUST use a display face for titles and figures, a readable text face for the
  rest, and, at most once per screen, one word in an italic serif accent. There MUST be nine sizes and three
  weights (regular, semibold, bold). Money, distance, counts and dates that change or align MUST use
  aligned (tabular) numerals. It supersedes feature 004 FR-004.
- **FR-005** [Tier 1]: Corners MUST come from the five radii (8, 12, 16, 24, 28 and full), with an inner
  radius of an outer radius minus its padding (never below 8). Icons MUST come from one family in three sizes
  (16, 20, 24) at one stroke weight, with a filled form for a selected icon.
- **FR-006** [Tier 1]: Every control MUST belong to one of five emphasis levels (primary, secondary, tonal,
  ghost, destructive) and a screen state MUST NOT show more than one primary control. Coral MUST NOT be used
  for decoration, links or errors.
- **FR-007** [Tier 1]: Text laid over a photograph or a generated cover MUST sit on a fixed darkening band
  whose strength under any line of text is such that white text meets 4.5:1 even over a white photograph.
  Photographs in grids and viewers, and the map, MUST carry no overlay. Controls floating over a photograph
  MUST sit on dark translucent discs. It amends feature 004 FR-033.
- **FR-008** [Tier 1]: A trip without a usable photograph MUST show a generated cover: a gradient in one of
  three palettes, the country's code, a flag chip and a dashed stamp outline, with white text above 4.5:1.
  It extends feature 004 FR-012.
- **FR-009** [Tier 1]: Screens MUST NOT introduce one-off visual values; a new need MUST be added to the set.
  It restates feature 004 FR-036.

**Home globe and sheet**

- **FR-010** [Tier 1]: Home MUST always be the globe (feature 003 FR-001), full-bleed over a warm sky in the
  light theme and a night sky in the dark theme, mounted with no trips, with trips but no stop and when the
  store cannot be read. The globe MUST show cream land, aqua sea, visited countries tinted with a coral edge,
  planned countries with a dashed amber edge, past and active connections as a warm gradient and planned
  connections dashed. Its geometry, connections and statistics MUST NOT change.
- **FR-011** [Tier 1]: Each trip with a placed stop MUST appear as a pin showing its cover picture (or a plain
  dot when there are too many to draw or the globe is far out). The live trip's pin MUST have a coral ring, a
  slow pulse and a callout naming the trip and "Day N of M · place"; a planned trip's pin MUST have a dashed
  amber ring; crowded pins MUST gather into a "+N" pin.
- **FR-012** [Tier 1]: Home MUST carry a persistent sheet with three positions (peek, half, full), a handle,
  movement by dragging or tapping, a spring settle and a light haptic on each settle. The sheet MUST never
  cover the tab pill, and on Android the back gesture MUST lower it one position before leaving.
- **FR-013** [Tier 1]: At every position the globe MUST be re-fitted to the free space between the header and
  the sheet, so the whole planet stays visible at peek with at least 20 dp of margin, and the map's required
  attribution MUST stay visible above the sheet.
- **FR-014** [Tier 2]: The half position MUST show, over the globe, the date and a greeting naming the
  traveller (with one accent word), and, in the sheet, three figures (countries visited of 195, trips,
  kilometres travelled), the live trip and the next planned trip. The countries figure opens the Countries list
  and the trips figure opens the Trips screen; the kilometres figure is plain text, announced but not a control.
- **FR-015** [Tier 1]: The peek position MUST show only the live trip (or the next planned trip, or the
  invitation when there is none). A recentre control MUST appear only after the traveller has moved the globe.
- **FR-016** [Tier 2]: The full position MUST be the Countries list: a ring and "N of 195", continents
  visited, a search field that filters the list, countries grouped by continent under headers that stay in
  view, each row showing a flag chip, the name, the number of trips, the year first visited and a "Now"
  marker where the live trip is. Choosing a country MUST lower the sheet to half and fly the globe to it.
- **FR-017** [Tier 1]: The globe MUST be usable without dragging or sight. The sheet's handle MUST be a
  control offering "more" and "less"; the countries figure and a "Countries" control MUST open the list; the
  globe MUST offer the actions next trip, previous trip, recentre and open countries; and every trip on the
  globe MUST remain reachable from the Trips screen (feature 003).
- **FR-018** [Tier 1]: When trips exist Home MUST show one extended "Plan a trip" button above the tab pill,
  hidden at the full position; when none exist the invitation card MUST carry the action and the button MUST
  NOT also be shown.
- **FR-019** [Tier 1]: While Home is idle at world scale the globe MUST turn slowly. It MUST stop at the first
  touch, when the sheet is above half, when Home is not visible, when the app is in the background, after 45
  seconds, and always under reduced motion, which also stills every pulse.
- **FR-020** [Tier 1]: With no trips Home MUST show one invitation card with its action (the existing "Plan a
  trip", "Add a stop" and "Open trips" behaviours), illustrated by three tilted empty photo frames. Stock
  photographs MUST NOT ship.
- **FR-021** [Tier 1]: While loading, Home MUST show a skeleton in the globe's place and a skeleton sheet,
  with the greeting from the last session; offline, a slim non-blocking banner and the chip MUST say what is
  waiting; after a sync failure the chip MUST offer Retry with a calm line; an unreadable store MUST show a
  plain notice over the globe.

**Navigation chrome**

- **FR-022** [Tier 1]: The tab bar MUST be a floating pill of three tabs (Globe, Trips, You), 64 dp tall and
  16 dp from the sides, with its bottom edge clear of the home indicator. The selected tab MUST be a tinted
  capsule with a filled icon and a heavier label, never colour alone. Content MUST scroll beneath it with a
  soft fade. The pill MUST be translucent glass on iOS 26 and later, blurred on earlier iOS, and solid
  whenever transparency is reduced or contrast is increased; on Android it MUST be a full-width navigation
  bar 64 dp tall plus the system inset with a 56 by 32 dp indicator. It amends feature 003 FR-013 to FR-015.
  _Amended 2026-10-24 (owner decision):_ the floating pill is the tab bar on Android as well; the flat Material 3 bar of the Android reference is retired.
- **FR-023** [Tier 1]: Each tab MUST keep its accessible name, role, selected state, platform touch target,
  visible focus and automated-test identifiers; labels MUST wrap rather than clip. The third tab's name
  becomes "You" (a deliberate label change).
- **FR-024** [Tier 1]: Nothing MUST be hidden behind the pill: lists end with at least the pill's height plus
  16 dp, buttons float 16 dp above it, and toasts sit above it. Screens pushed above the tabs MUST NOT show
  the pill.
- **FR-025** [Tier 1]: Trips and You MUST show a large title on iOS and a standard header on Android. A trip
  MUST open on a hero picture with a floating Back control that becomes, once the picture has scrolled away,
  a solid 56 dp header with the title. Every pushed screen MUST offer a visible Back control named "Back"
  (feature 004 FR-008).
- **FR-026** [Tier 2]: Home, Trips and a trip MUST each show one global sync chip (N waiting, syncing,
  offline, failed; nothing is shown when everything is synchronised) beside one per-record marker with text and an icon on any record not yet
  synchronised (feature 004 FR-034). The waiting count is derived from records marked as not yet
  synchronised.
- **FR-027** [Tier 1]: Transitions MUST be movement and fade only. The sheet and the pill's selection MUST
  settle within 300 ms with at most a gentle spring; in-place changes within 200 ms; under reduced motion
  each destination MUST appear at once. It amends feature 004 FR-022.
- **FR-028** [Tier 1]: Android MUST use its own shapes where the platform has them: the navigation bar of
  FR-022, a rounded-square extended action button, a 32 by 4 dp sheet handle, and predictive back.

**Trips**

- **FR-029** [Tier 2]: Trips MUST show its title with the number of trips, a status filter (All, Active,
  Planned, Past, each with a count) and one extended "Plan a trip" button above the pill on both platforms
  (the iOS header action of feature 004 is replaced).
- **FR-030** [Tier 2]: The list MUST show the active trip as a hero card, the next planned trip as a ticket
  with a countdown stub, and the other planned and past trips as compact rows under year headers that stay
  in view and give the year's trips and kilometres. Each card and row MUST be one control announced as
  "title, status, N stops".
- **FR-031** [Tier 2]: The hero card MUST show the cover, the country with a flag chip, the title, "Active ·
  Day N of M", one dot per stop (filled for done, ringed for now and next, joined by a line), and a pending
  marker when relevant.
- **FR-032** [Tier 2]: The ticket MUST show a thumbnail, title, country and month, the status "Planning" and
  a stub counting days to departure; at larger text it MUST stack the stub beneath.
- **FR-033** [Tier 1]: A row MUST show a 64 dp thumbnail, the title on one line, the country, month and
  length, a trailing cue and a pending marker when relevant.
- **FR-034** [Tier 1]: A trip's cover MUST be, in order, its designated photograph if on the device, its
  earliest photograph on the device, then the generated cover of FR-008, derived on the device and never
  transmitted (feature 004 FR-012).
- **FR-035** [Tier 2]: With 200 or more trips the list MUST be virtualised, keep its year headers in view,
  show a year strip on its edge to jump by year, and say how many trips there are and since when.
- **FR-036** [Tier 1]: Trips MUST show skeletons shaped like the hero, ticket and rows while loading; an empty
  state with "No trips yet" and the one action when empty; a filtered-empty message when a filter has no
  match; and the offline and sync notices of FR-065.

**Trip detail**

- **FR-037** [Tier 1]: A trip MUST open on a full-bleed hero (cover or generated) with its title anchored to
  the bottom and growing upward to two lines, the country with flag, the dates, and a sheet with a 28 dp
  corner overlapping the hero by 28 dp. At the largest text size the title MUST still be visible.
- **FR-038** [Tier 2]: One row beneath the hero MUST show the status chip, "Day N of M" with progress dots
  for an active trip, and the sync chip.
- **FR-039** [Tier 2]: The five areas MUST appear as four tiles (Photos, Notes, Expenses, Documents) with
  counts (and the spending total), lock marks on Expenses and Documents with one line saying they are only
  visible to the traveller, and an Offline maps row beneath; at larger text the four tiles MUST become two
  columns. They replace the sideways row of feature 003 FR-018.
- **FR-040** [Tier 2]: A strip of day chips (D1, D2 and so on, with dates) MUST highlight and scroll to that
  day's stops when chosen, stay in view when the hero collapses, and be hidden with no stops.
- **FR-041** [Tier 2]: Stops MUST form a timeline: a node per stop (check for done, coral for the current,
  ring for next), a solid line between stops that follow each other and a dotted line with the distance
  between them where the traveller moves on; each stop shows place, country, dates, nights, a "Now" chip
  where it applies, a picture of that city if the traveller has one, and a pending marker. Move up, move
  down, edit dates and remove MUST remain, visibly and as assistive-technology actions, and "Add stop"
  MUST be a dashed row in the timeline (feature 004 FR-013).
- **FR-042** [Tier 1]: A trip with no stops MUST show a ghost stamp, "No stops yet" and "Add stop", zeros in
  the tiles and no day strip.
- **FR-043** [Tier 1]: A trip MUST show a loading skeleton mirroring its layout, the offline and sync
  notices, a ring and Retry on the area whose upload failed, and the generated cover when needed.

**Everyday areas**

- **FR-044** [Tier 1]: Photos, Notes, Expenses, Documents and Offline maps MUST share a header (Back, the
  title, a line naming the trip and a count, and a lock chip on Expenses and Documents), one floating add
  action 16 dp above the screen's bottom, and designed loading, empty and error states (feature 004 FR-015).
- **FR-045** [Tier 2]: Photos MUST group by day with a large date, place and count; show a three-column
  mosaic whose first photograph is large and whose last tile can say "+N"; draw each upload state on the
  thumbnail (queued, uploading, uploaded, failed with Retry); and summarise unfinished uploads in one line.
  Photographs MUST be shown at full fidelity with no tint (feature 004 FR-033).
- **FR-046** [Tier 1]: The photo viewer MUST be full screen with zoom, swipe between photographs and pull
  down to close, and MUST keep today's place and time, refile, retry, delete with confirmation and Close.
- **FR-047** [Tier 2]: Spending MUST show the total in the home currency as the largest figure, the daily
  average with "Day N of M", the exchange-rate date in words, a bar per day, a category bar with its legend,
  and rows grouped by day with a category icon and right-aligned amounts. All sums MUST be exact.
- **FR-048** [Tier 1]: Notes MUST show cards with title or preview, date, place and a sync marker; the editor
  MUST be a sheet with today's Cancel and Save.
- **FR-049** [Tier 1]: Documents MUST show ticket-style cards (type icon, kind, title, one detail, date);
  opening one MUST show the scan, the barcode on a plain white plate, its details and Delete; the lock chip
  and a privacy line MUST be shown; screen-capture protection MUST be unchanged.
- **FR-050** [Tier 1]: Offline maps MUST list the trip's cities with a download or downloaded control and
  size, and a storage bar, behaving as today.

**Forms and sheets**

- **FR-051** [Tier 1]: Forms MUST be sheets with a handle, Cancel in ink, a title, a 28 dp top corner and a
  primary action that stays above the keyboard; dismissing by gesture MUST behave as Cancel (feature 004
  FR-009).
- **FR-052** [Tier 1]: "New trip" MUST ask only for the trip's name and the home currency (one line of
  choices and "Other"). Destination, cover and dates MUST NOT be asked: places are added as stops, dates
  follow the stops and the cover is derived.
- **FR-053** [Tier 2]: The stop editor MUST keep its place search and two dates and add the route so far,
  the distance from the previous stop and a nights stepper over the same two dates. It MUST NOT ask for a
  way of travelling or a note.
- **FR-054** [Tier 1]: "Add expense" MUST lead with the amount in large numerals under the decimal keypad,
  then category and currency choices, with Save above the keypad; money MUST be handled exactly.
- **FR-055** [Tier 1]: Fields MUST be 56 dp tall with a cream fill and a boundary at 3:1, the label above,
  errors as words with an icon, and a visible focus ring; chosen chips MUST be filled with a check; a
  segmented control MUST show its chosen segment filled (feature 004 FR-024, FR-025).

**Sign-in and You**

- **FR-056** [Tier 1]: Welcome MUST show a globe turning behind a 28 dp sheet holding the product name, one
  line of promise with at most one accent word, a primary "Create account", a secondary "Sign in" and one
  legal line, in the lower part of the screen. The globe is still under reduced motion.
- **FR-057** [Tier 1]: Sign in and Create account MUST keep their behaviour and fields, with the primary
  action in the thumb zone, errors in words with an icon, and Apple and Google buttons that follow each
  provider's rules, at equal weight, where they are today.
- **FR-058** [Tier 2]: You MUST show an avatar of initials, the name, "Traveller since" the year of
  account creation, a switch (All time and each year with trips) driving a passport card (countries of 195,
  trips, kilometres, continents of 7, and the distance as a multiple of the Earth's circumference), the
  stamps page, the account and app groups and, set apart, Sign out and Delete account (feature 004 FR-016).
- **FR-059** [Tier 2]: Each visited country MUST have one stamp whose shape (of six), ink (of four) and tilt
  are fixed by the country and the date of the first visit, showing the date; unvisited slots MUST be dashed
  ghosts; a stamp MUST be announced as "Stamp: country, date".

**Delight and feedback**

- **FR-060** [Tier 1]: Figures MUST count up once per appearance in under a second, and assistive
  technology MUST hear only the final value; the live pin MUST pulse; each is still under reduced motion.
- **FR-061** [Tier 2]: A stamp earned in the last seven days MUST land once per session with a small thud and
  a firm haptic; under reduced motion it MUST simply appear.
- **FR-062** [Tier 1]: Selection changes, sheet settles, tab changes, saves, failures and destructive
  confirmations MUST give brief haptic feedback where supported, and MUST NOT under reduced motion (feature
  004 FR-020).
- **FR-063** [Tier 1]: Every control MUST show a pressed state within 100 ms, be flat and announced when
  unavailable, and show a busy state ignoring further presses (feature 004 FR-019).

**States**

- **FR-064** [Tier 1]: Every list and screen MUST define a loading skeleton shaped like its content, an empty
  state that names one action, and an error in words with an icon and Retry where a retry exists (feature 004
  FR-035).
- **FR-065** [Tier 1]: Offline MUST show one slim non-blocking banner ("Offline. N changes will sync when
  you're back online.") and the chip; a sync error MUST show a crimson chip with the verb Retry and a calm
  line that the data is safe on the phone; records MUST carry a waiting or failed marker with text.
- **FR-066** [Tier 1]: Permission-denied (camera, photographs) and no-result states MUST be designed to the
  same standard, with the way forward named.
- **FR-067** [Tier 1]: A toast MUST be available for confirmations: dark, above the pill, with one action
  and a countdown bar, announced to assistive technology. Using it for an undo of deletion is Tier 3.

**Legibility and accessibility (inherited from features 002, 003 and 004, restated style-independently)**

- **FR-068** [Tier 1]: Text MUST meet 4.5:1 against what is behind it (3:1 for large text) in every theme
  and state, including text on tinted chips, on pressed fills, on gradients, on the darkening band over a
  white photograph, and map labels (feature 004 FR-023).
- **FR-069** [Tier 1]: Every field, outlined and filled control MUST be distinguishable at 3:1 by boundary or
  fill, a tappable card or row MUST carry a cue at 3:1, and every focus indicator MUST meet 3:1. Where a
  filled control's own fill is below 3:1 against its surroundings (the coral button measures 2.82:1 in the
  light theme and 2.40:1 in its increased-contrast variant) it MUST carry an edge that is (feature 004 FR-024).
- **FR-070** [Tier 1]: No state (selected, error, success, pending, status, unavailable, live, private)
  MAY be conveyed by colour alone (feature 004 FR-025).
- **FR-071** [Tier 1]: Every interactive element MUST expose a touch target of at least the platform minimum
  (44 pt, 48 dp) by hit area regardless of its visible size, MUST sit at least 8 dp from the next target,
  and MUST show a visible focus indicator (feature 004 FR-026).
- **FR-072** [Tier 1]: When the device requests increased contrast, text MUST meet 7:1, boundaries MUST be
  explicit, scrims MUST be darker and surfaces MUST be opaque (feature 004 FR-027).
- **FR-073** [Tier 1]: When the device requests reduced transparency every surface MUST be opaque; when it
  requests reduced motion the globe's rotation, pulses, count-ups, stamp landings, shimmer and haptics MUST
  be removed while every destination state is still shown (feature 004 FR-028).
- **FR-074** [Tier 1]: All layouts MUST accommodate the platform's largest text size without clipping,
  overlapping or hiding content. Fixed heights MUST be minimums; rows MUST grow; the three figures MUST
  stack, the areas MUST become two columns, tickets and the passport grid MUST reflow at a text scale of
  1.15 and above; tab labels, chip captions and hero numerals MAY be capped at 1.3 times and no other text
  may be capped.
- **FR-075** [Tier 1]: The change MUST NOT alter what assistive technology announces for any pre-existing
  control (name, role, state, order); new elements are additive (feature 004 FR-030).
- **FR-076** [Tier 1]: Animated figures MUST announce their final value only; decorative art (stamps, covers,
  frames, glints) MUST be hidden from assistive technology, with a label on the parent where it carries
  meaning.
- **FR-077** [Tier 1]: Figures, dates, plurals and units MUST follow the device's language and measurement
  system and MUST NOT be hard-coded.
  _Amended 2026-10-24 (owner decision):_ distances are ALWAYS kilometres, whatever the device's measurement
  system. Figures, dates and plurals still follow the device's language. `deviceLocale()` no longer carries a
  measurement system and `distanceFigure` takes no locale.

**Theming**

- **FR-078** [Tier 1]: The product MUST provide complete light (Sunrise) and dark (Nightfall) renderings,
  follow the device and update the whole interface together, including the sky, the globe, the map's
  lighting, the sheet, the pill and the status bar (feature 004 FR-031).
- **FR-079** [Tier 1]: The product MUST provide increased-contrast renderings of both, selected
  automatically (feature 004 FR-032).

**Scope**

- **FR-080** [Tier 1] (amended by owner answer Q-11, 2026-10-19): Tier 3 capabilities MUST NOT be built, but the
  controls the reference pictures show for them ARE drawn exactly as pictured. Each is a real, focusable button
  (role button, accessible name from the picture, hint "Not available yet", a 44 dp target) whose only effect is one
  toast, "<Thing> is coming soon"; it navigates nowhere, writes nothing, calls no network and opens no screen. Its
  `testID` is `coming-soon-<name>`. The product MUST NOT display data it does not have: no placeholder amounts,
  distances, durations or counts stand in for a missing capability (a budget line, drive times and similar are drawn
  only as the "coming soon" control or omitted, never with invented figures), and no selection is shown as saved when
  nothing is stored.
- **FR-081** [Tier 1]: The feature MUST NOT add, remove or change any traveller-facing capability, stored
  record, permission, synchronisation rule or privacy behaviour. Every control present before it MUST remain
  reachable under the same accessible name and automated-test identifier, except the label changes listed in
  "Copy and label policy" (feature 004 FR-037).
- **FR-082** [Tier 1]: The globe's geometry, connections, journey legs, statistics and camera zoom and pitch
  rules MUST NOT change; only its colours and layers, the camera padding and the layout around it do.
- **FR-083** [Tier 1]: When the feature is complete no Atlas-only value or treatment (the cobalt accent, the
  paper-tinted neutrals, the flat tab strip) MAY remain, and no neumorphic treatment MAY return (feature 004
  FR-038).
- **FR-084** [Tier 2]: Every derived view (countries, passport, spending summaries, stamps) MUST read only
  the signed-in traveller's own local records, transmit nothing, store nothing new, and show no other
  person's content. Expenses and documents MUST NOT appear in any view that could be shared.

### Key Entities _(include if feature involves data)_

- **Visual value set**: the named colours, text styles, spacing, radii, lifts, icon sizes and motion timings
  the product draws from, in four renderings: Sunrise, Nightfall and an increased-contrast variant of each.
- **Home sheet position**: peek, half or full, and the globe's free space that follows from it.
- **Country summary** (derived): a visited country, its continent, the number of trips, the year first
  visited, and whether the live trip is there.
- **Stamp** (derived): a country and the date of the first visit, which fix the stamp's shape, ink and tilt.
- **Trip card model** (derived): the trip, its status, its cover, its date range, its stop count and its
  place in the list (hero, ticket or row; year).
- **Sync chip state** (derived): synced, waiting with a count, syncing, offline or failed.
- **Passport totals** (derived): countries, trips, kilometres and continents for all time or one year.
- **Generated cover** (derived): the gradient, code and stamp outline of a trip with no photograph.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: When the feature is complete, an automated search of the application source finds none of
  the Atlas palette values and none of the neumorphic or Atlas-only treatments (FR-083).
- **SC-002**: 100% of text, control, chip, status, scrim and map pairings, in all four renderings and every
  state, meet the floors in FR-068 and FR-069, including white text on a white photograph and every
  generated-cover stop, verified by an automated gate on every run.
- **SC-003**: 100% of controls that existed before this feature remain reachable under the same accessible
  name and automated-test identifier, except the labels listed in "Copy and label policy", verified by an
  automated comparison against the pre-feature baseline and by every end-to-end flow passing; each flow edit
  is recorded.
- **SC-004**: Automated test coverage stays at or above 80% in every workspace, and the privacy and API
  suites are unaffected.
- **SC-005**: A visual response to a press appears within 100 ms; the sheet and pill settle within 300 ms;
  in-place transitions finish within 200 ms.
- **SC-006**: Dragging the Home sheet over the live globe keeps the frame rate at the baseline of the
  oldest supported device (no sustained drop below 45 frames per second), and scrolling 200 trips, 1,000
  expense rows and 1,000 photographs shows no regression against a baseline captured before the screens
  change.
- **SC-007**: Every screen renders completely and operably at the platform's largest text size in all four
  renderings, with zero clipped or overlapping content, verified on a phone.
- **SC-008**: Under reduced motion no rotation, pulse, count-up, stamp landing, shimmer movement or haptic
  occurs, and under reduced transparency nothing translucent is drawn.
- **SC-009**: At least 95% of first-time viewers shown a still image of Home, Trips and a trip correctly
  identify which elements are tappable, and at least 9 of 10 find each screen's primary action in direct
  sunlight on the first attempt.
- **SC-010**: The offline-synchronisation acceptance flows (feature 001, quickstart section 5) still pass on
  a real two-device run, recorded before release.
- **SC-011**: The added application size (code, fonts, icons) is measured against the feature 004 tip and
  reported before release; an increase above 1 MB triggers a review.
- **SC-012**: A clean install of dependencies and the full automated checks pass on a Windows development
  machine and on the continuous-integration runners.
- **SC-013**: The traveller reviews the first slice (Home in all three sheet positions, Trips, a trip) on a
  phone in both themes, at the largest text size and with increased contrast, and approves it before the
  remaining screens are converted. This repeats the lesson of Atlas: no screen beyond the first slice is
  converted before that approval.
- **SC-014**: The globe's geometry, journey and statistics tests of features 001 and 003 pass unchanged, and
  every map style key the feature sets is checked against the map provider's documented keys.
- **SC-015**: With a screen reader, 100% of the countries visited and 100% of the trips shown on the globe
  are reachable from lists, and a walk of Home, Trips, a trip and You finds no unnamed control.
- **SC-016**: The same country and date produce the same stamp (shape, ink, tilt) on every launch and device,
  verified by an automated test over at least 200 generated country and date pairs.
- **SC-017**: New native modules arrive in one batch needing one rebuild of each dev client; none is added
  after the first-slice review.
- **SC-018**: At the default text size and at each sheet position, for phone heights from 640 to 932 dp, the globe's free space is at
  least 220 dp at peek and the planet's margin to both screen edges is at least 20 dp at peek, verified by
  an automated test of the fit and by device screenshots.

## Assumptions

- The instruction applies to the whole product. Delivery is staged: tokens and adapters first, then chrome,
  Home, Trips and Trip detail (reviewed on a phone, SC-013), then everyday screens and forms, then sign-in
  and You, then the sweeps.
- This is a presentation and navigation change plus read-only derived views. Privacy is enforced structurally,
  not visually (feature 001, Constitution I).
- Legibility outranks aesthetics: where a drawn value cannot meet a floor, the value is retuned and the floor
  is not. WCAG AA is the baseline and 7:1 the target under increased contrast.
- Feature 004's navigation structure (nested stacks, native headers, form sheets), adapters, token pipeline,
  contrast gate and testID parity are reused; only their values, layouts and a few components change.
- Interface text uses bundled faces, so nothing is fetched at runtime and the app works offline.
- iOS and Android only; portrait phones only; no web target; right-to-left layouts are not in scope.
- The prototype's photographs are stock images used only to draw the design; none ships. Trips use the
  traveller's own photographs or the generated cover.
- The device checks still open from feature 004 (native header Back, form sheet keyboard behaviour, the
  display face on both platforms) stay open and are repeated on the new look.
- Prototype copy is illustrative. Strings that automated flows assert are kept (see "Copy and label policy").

## Tier 3: out of scope (the owner decides later)

Each item is in the prototype and is **not** built here. Under owner answer Q-11 its control is drawn as pictured
and answers with a "coming soon" toast (FR-080); nothing else about it exists.

| Prototype element                                              | Why it is out of scope                                                          | What it needs                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Global search (trips, places, notes, countries) and recents    | No search capability or recent-search store exists                              | A local index over trips, places and notes; a recents store; a spec for ranking and scope             |
| "Your year" recap stories and the shareable poster             | Sharing is gated by the offline-sync gate; file export and sharing need review  | A sharing spec, an image export path, a security review; the gate in AGENTS.md first                  |
| Settings screen (appearance override, units, language, alerts) | The app follows the device; no preference store; Delete account stays "not yet" | A preferences store, copy for each setting, notifications and the deletion flow (T188 of feature 001) |
| Permission primers (photos, location, notifications)           | Location and notifications are not capabilities of the product today            | The capabilities themselves; copy and store review for the primer pattern                             |
| Trip edit, "more" menu, delete with confirmation, undo toast   | The UI has no trip edit or delete; deletion must stay a synchronised tombstone  | Edit and delete flows, undo within the 90-day tombstone rule, tests across devices                    |
| "Find trips in my photos"                                      | A library scan that proposes trips is a new capability                          | Photo-library read, clustering, a confirmation flow (Constitution IV)                                 |
| Choosing a cover ("Pick from photos")                          | 004 deferred choosing a cover                                                   | A set-cover action that writes the trip's cover reference                                             |
| Trip "Map" toggle beside the stops                             | There is no per-trip map view                                                   | A zoomed map of the trip's stops reusing the globe                                                    |
| Note autosave with no Cancel                                   | Changes the editor's save rules                                                 | A draft model and its sync behaviour                                                                  |
| Photo captions, multi-select, share                            | No caption field, no selection mode, no sharing                                 | A caption column and wire field, a selection mode, the sharing gate                                   |
| Getting-there mode, drive times, per-stop note                 | No such stop fields; times need routing                                         | New stop fields and wire fields, or a routing source                                                  |
| Per-day budget                                                 | No budget field                                                                 | A budget field and its sync                                                                           |
| Profile photograph                                             | The app never sets one                                                          | A picker, upload and storage rules                                                                    |
| Brightness boost while a barcode shows                         | Needs a native capability                                                       | A native module and its permission review                                                             |
| Three-button Welcome (Apple, Google, email on one screen)      | Moves sign-in steps that the end-to-end flows rely on                           | An owner decision and updated flows                                                                   |

## Prototype elements that conflict with the data model or product rules

These are drawn in the prototype and are handled as stated; none of them changes a record.

| Prototype element                                            | Conflict                                                                                                                                                      | Handling in this feature                                                                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| New trip: destination, cover and date fields                 | Dates derive from stops; places belong to stops; cover is derived                                                                                             | FR-052: name and currency only; the date and place controls live in the stop editor (FR-053)                                             |
| Document kinds Flight, Stay, Car rental, Insurance, Passport | The data has three types: boarding pass, booking, other                                                                                                       | Three kinds with their icons: plane, bed, document; extra kinds are Tier 3                                                               |
| "Planned" and "Now" status words                             | The app's statuses are Planning, Active and Past, asserted by flows                                                                                           | Keep the three words; "Day N of M" and the dot are additions beside them                                                                 |
| Stock photographs in covers, thumbs, the empty-state fan     | Licence; the traveller's own photos are the product                                                                                                           | Generated covers; empty frames; the prototype's photographs are never shipped                                                            |
| "Encrypted ... in your account. Never shared with anyone."   | A security claim not verified in feature 001 copy                                                                                                             | Use the existing privacy lines; any new claim needs verification first (Constitution IV)                                                 |
| "N of 195" countries and "N of 7" continents                 | The existing statistic counts every country in the app's geography list, territories included; 195 is the sovereign-state count; a continent may be "Unknown" | The numerator stays the existing statistic (FR-082); 195 and 7 are fixed reference numbers; "Unknown" is not a continent; owner question |
| Tab named "You"                                              | Today's accessible name is "Profile"                                                                                                                          | Deliberate label change (see below)                                                                                                      |
| Hero numerals and chips capped at 1.2 times text size        | Feature 004 left text uncapped                                                                                                                                | FR-074: caps of 1.3 on the listed roles only; owner question                                                                             |
| Paper grain by a noise filter; notched ticket mask           | Not available in the app's drawing layer                                                                                                                      | Omit the grain; draw notches as two canvas-coloured circles                                                                              |
| Share, More, Search, Settings icons in headers               | Capabilities do not exist (Tier 3)                                                                                                                            | Not drawn (FR-080)                                                                                                                       |
| Primary coral fill on white (2.82:1; 2.40:1 in contrast)     | Below the 3:1 rule for a filled control's edge                                                                                                                | FR-069: an edge ring in the coral line colour; measured in `contracts/design-tokens.md`                                                  |
| Amber end of gradient arcs on white (1.76:1)                 | Below the 3:1 graphic floor                                                                                                                                   | Gate each gradient stop; the light theme ends at the amber line colour (3.99:1)                                                          |
| Four prototype contrast failures (audit report)              | Filter count "1" at 4.46:1; a km figure and a title under overlays; the clock                                                                                 | Fixed by the gate (FR-068); the system clock sits under the top band (FR-007)                                                            |

## Copy and label policy

Any string that an end-to-end flow or a test asserts is kept. The prototype's sample copy is illustrative.
An accent word is a nested span inside the existing sentence, so its text is unchanged.

| Change                                                                       | Reason                                    | Flows and tests to update                                                      |
| ---------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------ |
| Third tab label "Profile" becomes "You" (id `tab-profile` unchanged)         | Identity; the pill shows short labels     | No flow taps the label; tab-bar and tab-layout tests; accessible-name baseline |
| Trips header action "Plan a trip" on iOS moves from the header to the button | One extended button on both platforms     | Id `trips-plan-trip` and name unchanged; header tests                          |
| Stat labels keep "countries" and the figure keeps its id and plain number    | Flow 03 asserts both; "/195" is a sibling | None (kept); the stat tests                                                    |

No other visible string changes. Strings asserted by flows that stay: "No trips yet", "Planning", "Active",
"Past", "No stops yet", "Plan it. Live it. Share what you want.", "Sign in", "Create account", "No notes
yet", "Nothing logged yet", "No photos yet", "No documents yet", "Your globe is waiting for its first
trip", "Your trip needs a first stop", "countries".

## Amendments to earlier specifications

- **Feature 004 (Atlas)**: decisions D4-01 (direction) and D4-07 (typography) are **superseded**, as are FR-001
  (value set), FR-002 (two depth levels), FR-003 (palette), FR-004 (type) and FR-010 (flat tab bar), and the
  five-size type scale and the palette invariant "no key pure white" of its data model. FR-018 (opaque cards
  over the globe) is **kept** for cards and amended for the sheet and callout, which are opaque with a
  hairline and a floating lift. FR-033 is **amended** by FR-007 (a darkening band behind text on hero
  pictures). FR-012 is **extended** by FR-008. D4-05's "text is never capped" is **amended** by FR-074. D4-08
  (icons over the platform symbol font) is **superseded**. D4-11 (glass is not adopted) is **amended**: the
  tab pill may be glass on iOS 26. Feature 004's navigation structure, adapters, token pipeline, accessibility
  gates and testID parity are **inherited**, as are the requirements of 004 not named above (FR-005 to FR-009,
  FR-011 to FR-017, FR-019 to FR-032, FR-034 to FR-038), restated in this specification where the layout changes
  (FR-025 to FR-084; the accessibility and state commitments are FR-063 to FR-079).
- **Feature 003 (globe-first home)**: FR-013 and FR-014 (flat strip, same background, divider) and the
  "short mark" of FR-015 are **amended** by FR-022; FR-018 (back and status on one row, five areas as a
  sideways row) is **amended** by FR-025, FR-038 and FR-039; FR-001 to FR-012, FR-016, FR-017 and FR-019 are
  **kept**.
- **Feature 002 (neumorphic identity)**: FR-024 (no overlay across photographic content) is **amended** by
  FR-007; FR-016 (largest text size) is **inherited** with the caps of FR-074.
- **Feature 001 research D-17 (tab bar)**: the stable tabs navigator with a custom bar stands.
- **AGENTS.md**: the Layout row, the "look is Atlas" bullet, the tab-bar sentence and the Libraries row are
  updated by this change (a tab may have a surface; keep its identifiers).
