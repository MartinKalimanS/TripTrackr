# Feature Specification: App UI Redesign ("Atlas")

> **Superseded in part by [005 Sunrise Passport UI](../005-sunrise-passport-ui/spec.md).** The Atlas look (its
> palette, type, depth and flat tab bar: research D4-01, D4-07, D4-08 and spec FR-001 to FR-004 and FR-010) was rejected by the
> owner on a phone and is replaced by Sunrise Passport. The structure of this feature (navigation, adapters, token
> pipeline, accessibility gates, testID parity) is inherited by 005. See 005 `spec.md`, "Amendments".

**Feature Branch**: `feat/004-app-ui-redesign`

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "I want to change the UI and its plan. The UI of the app is really bad. Search the internet for ideas, in UI libraries and popular UI libraries and documentation, for reference. Dismiss the neumorphic look and use what would suit the app best. Maintain the globe, I like it, but change the UI: make it look like a real app."

## Overview

TripTrackr's screens currently wear a soft "neumorphic" look (feature 002): every control is a
bordered, double-shadowed pill on one blue-grey canvas, every block is a card, titles are plain
text on the page, "Back" is a button inside the page, and there is no imagery, icon vocabulary or
type hierarchy. The result reads as a prototype rather than a product, and the soft depth works
against the places and the moments the product is used: outdoors, in transit, one-handed, at night.

This feature replaces that identity with a single, deliberate one, called **Atlas**: a calm,
content-first travel journal. The globe and the traveller's photographs are the subject; every other
surface is quiet, structured and recognisably native to the phone it runs on. Navigation chrome
follows each platform's own conventions (large titles, a visible back control, sheets with a handle),
lists are grouped and glanceable, trips are shown with a cover, and one accent colour marks the
primary action, the selected item and the active trip.

The change is presentation and navigation chrome only. It adds, removes or alters no
traveller-facing capability, stored record, permission, synchronisation rule or privacy rule.
The globe itself (its geometry, connections, camera, colours and statistics) is not changed; only
the cards floating over it are restyled. A traveller who knows how to use TripTrackr today must
still know how to use it afterwards, and every control they use today must still exist, under the
same accessible name.

Legibility remains a hard constraint, not a trade-off: the contrast, touch-target, text-size,
motion and transparency commitments of feature 002 are style-independent and carry over unchanged
(see "Amendments to earlier specifications").

## User Scenarios & Testing _(mandatory)_

### User Story 1 - It looks and behaves like a real app (Priority: P1)

A traveller opens TripTrackr and moves between the globe, the trip list, a trip, and back. Screens
have titles in the header, a clear way back, grouped lists, one obvious primary action, and
consistent spacing and type. Nothing looks borrowed from a different app or like a prototype, and
nothing is pressed into or raised out of the background.

**Why this priority**: This is the feature. Every other story applies the same language to more
screens or protects it, and none can be judged until the shared language exists on the screens a
traveller uses every day.

**Independent Test**: Walk Home, Trips, a trip, a stop's dates and back again, on both platforms, in
both themes. Every screen uses the defined headers, emphasis levels, lists and states, with no
raised/recessed shadows, no in-page "Back" text button, and no screen falling back to a default look.

**Acceptance Scenarios**:

1. **Given** the traveller is on the Trips screen, **When** they open a trip, **Then** the trip
   screen has a header with a visible back control named "Back", the trip's title is shown
   prominently, and returning lands on the Trips screen.
2. **Given** any screen with one main action, **When** the traveller looks at it, **Then** exactly
   one control is visually primary and the rest are visibly lesser (tonal, text or destructive).
3. **Given** a traveller on iOS views a top-level list screen, **When** it opens, **Then** its title
   is a large title in the header that settles into a small title on scroll; on Android the same
   screen shows a standard header with the same title.
4. **Given** the traveller compares a tappable row with static content, **When** they look at them,
   **Then** the tappable row carries a visible cue (a trailing chevron, an icon button or a labelled
   control) and static content does not.

---

### User Story 2 - My trips at a glance (Priority: P1)

A traveller opens the Trips list and can tell, without opening anything, which trip is happening
now, which are coming, which are over, where each one went, when, and whether anything is still
waiting to sync. Each trip has a cover. Opening a trip shows its title and status at once, its five
areas in one row, and its stops as a clear ordered timeline.

**Why this priority**: The trip is where a traveller spends their time. Glanceable trips are the most
repeated path in the product and the strongest "this is a real app" signal.

**Independent Test**: With a mix of past, active and planned trips, some with photos and some without,
open the Trips screen: each card shows cover, title, status (text and icon), date range, stop count
and currency, and a pending marker where relevant. Open a trip: title, status and areas are visible
without scrolling at the default text size, and the stops read top to bottom in order.

**Acceptance Scenarios**:

1. **Given** a trip has photographs on the device, **When** the Trips screen is shown, **Then** its
   card shows a cover taken from those photographs (the designated cover if there is one, else the
   earliest) as a thumbnail.
2. **Given** a trip has no photographs, **When** its card is shown, **Then** it shows a typographic
   cover tinted by the trip's status, never an empty box or a broken image.
3. **Given** a trip has local changes that have not synchronised, **When** its card or any of its
   stops is shown, **Then** a pending marker with text and an icon is visible, distinct from saved
   content.
4. **Given** trips are loading from the device, **When** the Trips screen first opens, **Then**
   placeholders shaped like trip cards are shown, not a blank screen and not an empty-state message.
5. **Given** the traveller has no trips, **When** the Trips screen opens, **Then** a designed empty
   state names the single next action, and "Plan a trip" is reachable from the screen.
6. **Given** a trip with several stops, **When** the trip screen is shown, **Then** each stop shows
   its place, country, arrival and departure dates in order, and moving, editing and removing a stop
   remain reachable both by visible controls and by assistive-technology actions.

---

### User Story 3 - Forms and sheets that feel native (Priority: P2)

A traveller plans a trip, adds a stop, logs an expense or writes a note. Each of these opens as a
sheet over the current screen with a visible handle, clear labels, plain-words errors beside the
field, and a primary action that stays above the keyboard. Choices that were a wall of buttons
(currency, category) are one line of choices that scroll sideways.

**Why this priority**: Forms are where travellers type with one hand in awkward places; native-feeling
sheets and keyboard handling remove friction and complete the "real app" impression.

**Independent Test**: Open each form on both platforms, focus the last field with the keyboard open,
and submit it with a valid and an invalid value. The primary action is never hidden by the keyboard,
errors appear in words beside the field, and the sheet can be dismissed by gesture and by Cancel.

**Acceptance Scenarios**:

1. **Given** the traveller opens "New trip", **When** the sheet appears, **Then** it shows a handle,
   the trip name field and the home currency as one sideways-scrolling line of choices with an
   "Other" control, and it fits on one screen at the default text size.
2. **Given** a field is invalid, **When** the traveller submits, **Then** the message is shown in
   words beside the field and is not conveyed by colour alone.
3. **Given** a form is open and the keyboard is up, **When** the traveller looks for Save, **Then**
   it is visible and reachable above the keyboard.
4. **Given** a form has unsaved input, **When** the traveller dismisses it by gesture, **Then**
   behaviour matches Cancel and no record is created or changed.

---

### User Story 4 - The everyday screens: notes, spending, photos, documents, offline maps (Priority: P2)

A traveller keeps notes, logs spending, browses photographs, opens a boarding pass and manages
offline maps. All of these follow the same grouped-list and grid language as the trip screens, with
the numbers that matter (totals, counts, sizes) set large and aligned, and with designed empty,
loading and error states.

**Why this priority**: These are the daily-use screens inside a trip. Leaving them in the old style
would leave the product half-converted, which is the failure mode the previous identity feature
already forbade.

**Independent Test**: Open each of the five areas of a trip with data, with no data, while loading
and with a forced error. Each uses the shared lists, grids, summary and states, and nothing falls
back to default styling.

**Acceptance Scenarios**:

1. **Given** a trip with expenses, **When** Spending is shown, **Then** the total in the home
   currency is the most prominent figure, categories are summarised, the exchange-rate date is
   stated in words, and each expense row shows its category with an icon and a right-aligned amount.
2. **Given** a trip with photographs, **When** Photos is shown, **Then** thumbnails are shown at full
   fidelity with no tint or shadow across them, a boundary where the photo's edge matches the
   background, and a caption in words for any photo not yet uploaded.
3. **Given** a trip with documents, **When** Documents is shown, **Then** each row shows an icon for
   its kind, its title and its state, and opening one behaves as before.
4. **Given** any of the five areas has nothing in it, **When** it is shown, **Then** a designed empty
   state explains what belongs there and offers the add action.

---

### User Story 5 - Readable anywhere: sunlight, night, large text, low vision (Priority: P2)

A traveller outdoors in bright light, in a dark cabin, with enlarged text, with increased contrast
or with reduced motion can read every label, tell what is tappable and what is selected, and use
every control, with the same layout intent as the default presentation.

**Why this priority**: TripTrackr is used in unfamiliar places in every kind of light. These are
explicit statements by the traveller that the default does not work for them; they must be honoured.

**Independent Test**: Switch each appearance setting in turn (light, dark, increased contrast,
largest text, reduced motion, reduced transparency) and visit every screen. Each renders completely,
nothing is clipped or left in the previous theme, and contrast measurements pass.

**Acceptance Scenarios**:

1. **Given** any theme, **When** contrast of every text and control pairing is measured, **Then** it
   meets the floors in FR-023 and FR-024, including tinted chips and any colour the system derives
   for pressed or hover states.
2. **Given** the device requests increased contrast, **When** any screen opens, **Then** text meets
   7:1, boundaries become explicit, and every action remains available.
3. **Given** the largest supported text size, **When** any screen opens, **Then** all text is fully
   visible and no control is clipped, overlapped or pushed off screen.
4. **Given** the device requests reduced motion, **When** the traveller presses, navigates or opens a
   sheet, **Then** the destination appears without non-essential animation and no haptic is played.
5. **Given** the traveller switches between light and dark while the app is open, **When** the change
   takes effect, **Then** the whole interface updates together, including the header, tab bar,
   sheets and status bar.

---

### User Story 6 - A good first impression, and a clear profile (Priority: P3)

A new traveller sees a welcome screen with a clear promise and two obvious ways in; signing in or
creating an account is a short, well-labelled form with the main action in thumb reach. Later, the
Profile screen shows who is signed in and groups the account, app and sign-out actions.

**Why this priority**: The first impression matters, but these screens are visited rarely compared
with the trips screens, so they follow the shared language once it has been proven.

**Independent Test**: From a signed-out install, create an account and sign in with the keyboard up
and with invalid input; then open Profile and sign out. All steps use the shared components and keep
their behaviour.

**Acceptance Scenarios**:

1. **Given** a signed-out traveller, **When** the welcome screen opens, **Then** the product name,
   one line of promise, a primary "Create account" and a lesser "Sign in" are shown, with both
   actions in the lower part of the screen.
2. **Given** the sign-in form, **When** the traveller submits wrong credentials, **Then** the refusal
   is explained in plain words under the form and the fields keep their input.
3. **Given** a signed-in traveller opens Profile, **When** it is shown, **Then** it shows an avatar
   with initials, their name and email, a grouped list of account and app information, and
   "Sign out" and "Delete account" separated from the rest, distinguished by label and position as
   well as colour.

---

### User Story 7 - Controls that answer to the touch (Priority: P3)

A traveller presses a button and sees and feels it respond: a brief pressed state, a light haptic on
selection changes and on saves, a clear busy state while something is working and a flat, announced
unavailable state when an action cannot be taken.

**Why this priority**: Immediate feedback is what makes a flat interface feel operable rather than
printed, and it is the cheapest cue that a tap registered.

**Independent Test**: Press and hold every kind of control; confirm a distinct pressed state within
100 ms, a busy state that rejects further presses, a disabled state that is announced as unavailable,
and haptics on selection, save and destructive confirmation (and not under reduced motion).

**Acceptance Scenarios**:

1. **Given** a traveller presses and holds a button, **When** their finger is down, **Then** it
   shows a pressed state, and returns to rest on release.
2. **Given** a control starts a slow operation, **When** it is running, **Then** the control shows a
   busy state, ignores further presses and is announced as busy.
3. **Given** a control is unavailable, **When** the traveller looks at or focuses it, **Then** it is
   visibly inert and announced as unavailable.
4. **Given** the traveller selects a choice, saves a record or confirms a deletion, **When** the
   action completes, **Then** a brief haptic is played on devices that support it.

---

### Edge Cases

- **A record is saved locally but not yet synchronised.** It keeps a pending marker (icon and text)
  on trip cards, stop rows and any other pending record; finished-looking styling must never imply
  a record is safely stored when it is not.
- **A trip has no photographs, or its cover photo's file is missing or will not draw.** The card falls
  back to the typographic cover; no empty box, broken image or layout jump.
- **Very long trip, place or note titles.** They truncate or wrap in the card without pushing
  controls out of view; the full text is available on the trip screen.
- **A trip with no stops, or a very long list (hundreds of trips, thousands of expense rows).** The
  empty state is designed; scrolling stays smooth and shows placeholders while loading.
- **Largest text size on a small phone.** Headers, chips and the sideways choice rows keep every
  control reachable; nothing is clipped or overlaps.
- **Back on a screen opened by a deep link or from the globe.** Back lands on the screen the traveller
  came from, as it does today.
- **A traveller using a screen reader.** Names, roles, states and reading order are unchanged for
  every pre-existing control; the header's own title and back control are additive.
- **A traveller with colour vision deficiency.** Selected, error, success, pending and status states
  are carried by text, icon or position as well as colour.
- **A screenshot is shared.** Content remains legible with no dependence on soft shadows.
- **The device has no vibration motor, or haptics are off.** Everything still works; haptics are
  only reinforcement.
- **A screen added later.** It is composed from the defined components and values rather than
  inventing new ones.

## Requirements _(mandatory)_

### Functional Requirements

**Visual identity**

- **FR-001**: The product MUST define one named set of visual values (tones, text styles, spacing
  steps, corner radii, depth levels and motion timings) from which every screen draws. It supersedes
  feature 002 FR-001.
- **FR-002**: The product MUST use exactly two depth levels: the base canvas, and a raised card or
  row above it, with sheets and menus floating above both. Recessed, double-shadow and per-button
  raised treatments MUST NOT appear anywhere. It supersedes feature 002 FR-002, FR-004, FR-005 and
  FR-006.
- **FR-003**: Colour MUST be a warm, quiet neutral base with ink text and one accent. The accent MUST
  be reserved for the primary action, the selected item, links and the active trip. Trip status
  colours (planned, active, past) MUST be the same hues the globe uses for the matching connections.
- **FR-004**: Text MUST use the platform's own face for interface text and one display face for large
  titles and prominent figures, in no more than five sizes. Money, distance, counts and dates MUST
  use aligned (tabular) numerals.
- **FR-005**: Every control MUST belong to one of four emphasis levels (primary, secondary, text,
  destructive), and a screen state MUST NOT show more than one primary control.
- **FR-006**: Boundaries MUST appear only where one is needed to identify a control or a field. Cards
  MUST be separated by tone and spacing, and a card MUST NOT contain another card.

**Navigation and structure**

- **FR-007**: Every screen except the globe home MUST present its title in the navigation header
  (large on iOS for top-level list screens) rather than as an ad-hoc line of text in the page. The
  trip screen's prominent title is its hero and is exempt.
- **FR-008**: Every pushed screen MUST offer a visible back control with the accessible name "Back",
  in addition to the platform's back gesture.
- **FR-009**: Forms and pickers that overlay a screen MUST present as sheets with a visible handle,
  dismissible by gesture and by an explicit Cancel, with the primary action reachable above the
  keyboard.
- **FR-010**: The bottom tab bar MUST keep feature 003 FR-013 to FR-016 (flat strip, at most 56 dp of
  content, one divider, selection shown by accent, heavier label and a short mark, never colour
  alone) and MUST show a filled icon for the selected tab.

**Screens**

- **FR-011**: The trip list MUST show, for each trip: a cover, the title, the status (text and icon),
  the date range, the stop count, the home currency and a pending marker when relevant. The whole
  card MUST be one control.
- **FR-012**: A trip's cover MUST be, in order: its designated cover photograph if that file is on
  the device, otherwise its earliest photograph on the device, otherwise a typographic cover tinted
  by status. Only thumbnails MUST be drawn, and a cover MUST be derived on the device and never
  transmitted.
- **FR-013**: A trip's stops MUST be presented as an ordered timeline showing place, country, arrival
  and departure dates and a pending marker. Move up, move down, edit dates and remove MUST remain
  available both as visible controls and as assistive-technology actions.
- **FR-014**: Spending MUST show the total in the home currency as the most prominent figure with
  aligned numerals, a per-category summary, the exchange-rate date in words, and expenses as grouped
  rows with a category icon and a right-aligned amount.
- **FR-015**: Notes, photos, documents and offline maps MUST use the same list and grid language, and
  each MUST define designed loading, empty and error presentations.
- **FR-016**: Profile MUST show an avatar with initials, the traveller's name and email, and grouped
  account and app information. Sign out and Delete account MUST be set apart from the group and
  distinguished by label and position as well as colour.
- **FR-017**: The welcome and sign-in screens MUST place the primary action in the lower part of the
  screen and MUST explain refusals and field errors in words.
- **FR-018**: Cards floating over the globe MUST be opaque with a visible boundary, and MUST remain
  legible over both light and dark map areas.

**Behaviour and feedback**

- **FR-019**: Every control MUST show a pressed state within 100 ms, MUST be flat and announced as
  unavailable when unavailable, and MUST show a busy state and ignore further presses while a slow
  operation runs.
- **FR-020**: Selection changes, successful saves and destructive confirmations MUST give brief
  haptic feedback on devices that support it, and MUST NOT when the traveller has asked for reduced
  motion.
- **FR-021**: Lists and cards MUST show placeholders shaped like their content while loading.
- **FR-022**: Transitions MUST use only movement and fade, MUST complete within 200 ms for in-place
  changes and MUST NOT bounce or overshoot.

**Legibility and accessibility (inherited from feature 002, restated style-independently)**

- **FR-023**: Text MUST meet 4.5:1 against the surface behind it, and 3:1 for large text, in every
  theme and state, including text on tinted chips and on any colour the system derives for pressed
  or hovered states.
- **FR-024**: Every field, outlined control and filled control MUST be distinguishable from its
  surroundings at 3:1 by boundary or fill; a tappable card or row MUST carry a cue (trailing
  chevron, icon or labelled control) at 3:1; every focus indicator MUST meet 3:1.
- **FR-025**: No state (selected, error, success, pending, status, unavailable) MAY be conveyed by
  colour alone.
- **FR-026**: Every interactive element MUST expose a touch target no smaller than the platform
  minimum, regardless of its visible size, and MUST show a visible focus indicator.
- **FR-027**: When the device requests increased contrast, text MUST meet 7:1 and boundaries MUST be
  explicit.
- **FR-028**: When the device requests reduced transparency, every surface MUST be opaque; when it
  requests reduced motion, non-essential animation MUST be removed while the destination state is
  still shown.
- **FR-029**: All layouts MUST accommodate the platform's largest text size without clipping,
  overlapping or hiding content or controls.
- **FR-030**: The change MUST NOT alter what assistive technology announces for any pre-existing
  control (name, role, state, order); headers and back controls are additive.

**Theming**

- **FR-031**: The product MUST provide complete light and dark renderings, follow the device's
  appearance and update the whole interface together when it changes.
- **FR-032**: The product MUST provide increased-contrast renderings of both, selected automatically
  when the device requests them.

**Content surfaces**

- **FR-033**: Map, globe, street-level and photographic content MUST be shown without overlay, tint or
  shadow across it, and photographs MUST keep a visible boundary against similarly toned surfaces.

**Offline integrity**

- **FR-034**: Content recorded on the device but not yet synchronised MUST carry a marker with text
  and an icon, visually distinct from saved content, on every screen that shows it.

**Scope and consistency**

- **FR-035**: Empty, loading and error states MUST be styled to the same standard as populated
  screens, on every screen.
- **FR-036**: Screens MUST NOT introduce one-off visual values outside the defined set; a new need
  MUST be added to the set.
- **FR-037**: The feature MUST NOT add, remove or change any traveller-facing capability, stored
  record, permission or privacy behaviour, and every control present before it MUST remain reachable
  under the same accessible name and the same automated-test identifier.
- **FR-038**: The neumorphic identity MUST be removed from the product entirely: no screen, shared
  component or style definition in the application MAY still express a raised or recessed soft-shadow
  treatment when this feature is complete.

### Key Entities _(include if feature involves data)_

- **Visual value set**: The named collection of tones, text styles, spacing, radii, depth levels and
  motion timings the whole product draws from. It has four renderings: light, dark, and an
  increased-contrast variant of each.
- **Emphasis level**: A control's rank on a screen: primary, secondary, text or destructive.
- **Trip cover**: A derived, never stored, picture for a trip card: a designated or earliest
  on-device photograph thumbnail, or a typographic fallback tinted by the trip's status.
- **Appearance context**: The traveller's device theme plus active accessibility settings, which
  decides which rendering is in effect.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: When the feature is complete, zero screens, shared components or style definitions
  express a raised or recessed soft-shadow treatment, verified by an automated search of the
  application source.
- **SC-002**: 100% of text, control, chip and status pairings, across all four renderings and every
  state, meet the floors in FR-023 and FR-024, verified by automated measurement on every release.
- **SC-003**: 100% of controls that existed before this feature remain reachable under the same
  accessible name and automated-test identifier, verified by an automated comparison against the
  pre-feature baseline and by every end-to-end flow passing; any flow edit is limited to a change in
  visible text and is recorded.
- **SC-004**: Automated test coverage stays at or above 80% in every workspace, and the privacy and
  API suites are unaffected.
- **SC-005**: A visual response to a press appears within 100 milliseconds, and in-place transitions
  complete within 200 milliseconds.
- **SC-006**: Scrolling a list of 200 trips and a list of 1,000 expense rows on the oldest supported
  device shows no measurable frame-rate regression against a baseline captured before the screens
  change.
- **SC-007**: Every screen renders completely and operably at the platform's largest text size in
  both themes, with zero instances of clipped or overlapping content.
- **SC-008**: Under reduced motion, no non-essential animation or haptic occurs; under reduced
  transparency, nothing translucent is drawn.
- **SC-009**: At least 95% of first-time viewers shown a still image of any screen correctly identify
  which elements are tappable, and at least 9 of 10 find each screen's primary action in direct
  sunlight on the first attempt.
- **SC-010**: The offline-synchronisation acceptance flows (feature 001, quickstart section 5) still
  pass on a real two-device run, recorded before release.
- **SC-011**: The added application size (code and fonts) is measured and reported before release;
  a release-bundle increase above 1 MB triggers a review.
- **SC-012**: A clean install of dependencies and the full automated checks pass on both a Windows
  development machine and the continuous-integration runners.
- **SC-013**: The traveller reviews the first slice (Home, Trips, Trip) on a phone in both themes,
  at the largest text size and with increased contrast, and approves it before the remaining screens
  are converted.

## Assumptions

- The instruction applies to the whole product, not selected screens. Delivery is staged: Home,
  Trips and Trip detail first, then forms and sheets, everyday screens, then sign-in and Profile; the
  old treatment is removed only when the last screen has moved.
- Atlas is a presentation change only. Privacy is enforced structurally, not visually, and nothing
  here alters a data-access path (feature 001 Constitution I).
- Legibility outranks aesthetics: where a soft look cannot meet a contrast floor, the look yields.
  WCAG AA is the baseline and 7:1 text contrast is the target under increased contrast.
- Interface text uses the device's own face for native feel and automatic text scaling; one bundled
  display face is used for titles and prominent figures. The display face is chosen from a short list
  on a real device before it is fixed.
- Both light and dark renderings, and increased-contrast variants of each, are in scope from the
  start, since the product already honours the device appearance.
- iOS and Android only; portrait phones only; no web target (feature 001 research D-14).
- On Android there is no large-title header; Android screens use a standard header with the same
  title. "Plan a trip" is a header action on iOS and a floating action button on Android, with the
  same accessible name.
- Trips already carry an optional cover-photo reference locally; this feature only displays it (or
  falls back); choosing a cover is not part of this feature.
- A trips sheet over the globe, welcome-screen artwork, translucent "glass" controls, native tab bars
  and tablet or landscape layouts are out of scope and may be specified later.
- The old interface is retired by area, so while the work is in progress an unconverted screen may
  look plainer than a converted one but is still coherent (same colours, same themes).

## Amendments to earlier specifications

- **Feature 002 (neumorphic identity)**: FR-001 to FR-006 and the surface recipes are **superseded**
  by FR-001 to FR-006 here. FR-007 to FR-029 are **inherited**, restated in FR-023 to FR-037 without
  reference to shadows. FR-009 is **clarified** to the actual wording of the accessibility rule it
  cites: a tappable card or row is identified by a 3:1 cue (chevron, icon or label), fields and
  buttons by a 3:1 boundary or fill, instead of every interactive element needing a hairline border.
  Feature 002's research record R-007 (glass is not adopted) still holds.
- **Feature 001 research D-17 (tab bar)**: the rationale that native styling conflicted with feature
  002 FR-003 no longer applies; the decision to keep the stable tabs navigator with a custom bar stands
  for the remaining reason (the native tab module is still marked unstable in this SDK).
- **Feature 003 (globe-first home)**: FR-013 to FR-018 (flat tab bar, sideways areas row, one-line
  currency) are **kept**; FR-019 (no control, name or test identifier removed) is **extended** to this
  feature as FR-037.
  **Final state (feature 005, 2026-10-22):** the Atlas look of this feature is retired; its structure,
  adapters, token pipeline and the identifier parity rule remain, and the flat tab bar became the floating
  pill. The retired Atlas values and the aliases that were kept (with their readers) are listed in
  `005 .../reference/as-built/f14-atlas.md`.
