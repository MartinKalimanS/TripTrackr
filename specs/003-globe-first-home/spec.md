# Feature Specification: Globe-First Home

**Feature Branch**: `003-globe-first-home`

**Created**: 2026-10-05

**Status**: Draft

**Input**: User description: "The globe has to be always on, the user doesn't have to add a trip to
see the globe. The option bar below is ugly, make it smaller and make it blend with the background.
The UI is really complex to travel through. I also want to see an arc that connects all the places
I have been to."

## Overview

The globe is TripTrackr's signature surface, but today a traveller meets it only after planning a
trip and giving it a stop. Until then the home screen is a text panel, and even afterwards the
globe is framed by a heavy bottom bar and reached through many small steps. This feature makes the
globe the home of the app in every state, draws the traveller's whole history on it as one line,
shrinks the bottom bar to a quiet strip, and trims the number and weight of the controls between a
traveller and their trips.

It changes presentation and navigation only. No record, no synchronisation rule and no privacy
rule changes: every figure on the globe is still derived on the device from the local store, and
nothing is drawn at a position the device does not know.

Three deliberate amendments to earlier specifications are recorded here and noted in place:

- Feature 001, User Story 3 scenario 6 and the "trips but no stop" edge case required an empty
  state **instead of** the globe. The globe now stays, with the invitation floating over it
  (User Story 1).
- Feature 002 FR-003 and FR-009 give every tab a raised or recessed bordered surface. For the tab
  bar only, that is replaced by a flat bar with a single divider (User Story 3).
- Feature 001 FR-045 and FR-047 are extended, not changed: connections between trips are added;
  every trip's own connections still open that trip.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - The globe is always there (Priority: P1)

A traveller installs TripTrackr, signs in and lands on a turning globe, before they have created
anything. A small card over it says what to do next. As soon as they have a trip with a place on
it, the card is gone and the globe is theirs.

**Why this priority**: The globe is the product's first impression and its most distinctive
screen. Showing a text panel until the traveller has done homework hides it from exactly the
people deciding whether to keep the app.

**Independent Test**: Sign in with a brand-new account. The home screen shows the globe, can be
panned and zoomed, and carries one invitation card whose action starts a trip. Add a trip with
one stop and return home: the card is gone and the globe is centred on that stop.

**Acceptance Scenarios**:

1. **Given** a traveller with no trips, **When** they open the home screen, **Then** the globe is
   shown whole, can be panned and zoomed, and one compact invitation offers "Plan a trip".
2. **Given** a traveller whose trips have no stop yet, **When** they open the home screen,
   **Then** the globe is shown with an invitation to add a first stop; its action opens that trip
   when there is exactly one such trip, and the trip list otherwise.
3. **Given** the invitation is showing, **When** the traveller adds their first stop and returns
   to the home screen, **Then** the invitation is gone and the globe has moved to show that stop.
4. **Given** the local store cannot be read, **When** the traveller opens the home screen,
   **Then** the globe is still shown with a plain-words notice, never the raw error.
5. **Given** this build has no map access, **When** the traveller opens the home screen,
   **Then** the existing "globe can't load in this build" state is shown, unchanged.

---

### User Story 2 - One line through every place I have been (Priority: P1)

A traveller with trips to several countries sees a single continuous line running through every
place they have been, in the order they were there, including the legs between one trip and the
next. A trip with a single stop is no longer an isolated dot.

**Why this priority**: The promise of the globe is "my whole history at a glance". Today each
trip floats alone; the line is what turns separate trips into one journey.

**Independent Test**: Record two past trips, the first ending in Rome, the second starting in
Tokyo. The globe shows Rome connected to Tokyo, and the line continues through each trip's other
stops in date order.

**Acceptance Scenarios**:

1. **Given** two past trips, **When** the globe is shown, **Then** the last place of the earlier
   trip is joined to the first place of the later one, so every visited place lies on one line.
2. **Given** a trip with a planned future stop, **When** the globe is shown, **Then** the
   continuous line stops at the last place already reached; the future stop keeps its dashed
   connection from the trip itself.
3. **Given** a trip with a single stop between two other trips, **When** the globe is shown,
   **Then** that stop is on the line, joined to the places before and after it.
4. **Given** the traveller taps a connection that belongs to a trip, **When** the tap lands,
   **Then** that trip opens as before; tapping a connecting leg that belongs to no trip opens
   nothing.
5. **Given** fewer than two places have been visited, **When** the globe is shown, **Then** no
   connecting leg is drawn and each place is marked.

---

### User Story 3 - A bottom bar that gets out of the way (Priority: P2)

The bar at the bottom is a thin strip the same colour as the screen: three icons with small
labels, a hairline above them, and a short mark over the one you are on. It takes roughly half
the height it did and no longer competes with the globe.

**Why this priority**: The bar is on every screen at all times. Being heavy there taxes the whole
product, and on the home screen it eats the space of the globe.

**Independent Test**: Open any tab. The bar is no taller than one touch target plus the device's
bottom inset, shares the screen's background, and still shows which tab is selected without
relying on colour.

**Acceptance Scenarios**:

1. **Given** any screen with the bar, **When** it is measured, **Then** its content is at most
   56 dp tall at the default text size, above the device's bottom inset.
2. **Given** any theme, **When** the bar is compared with the screen above it, **Then** it has the
   same background and no per-tab raised or recessed surface; one divider line separates them.
3. **Given** a selected tab, **When** the traveller looks at the bar, **Then** the selection is
   shown by accent colour, a heavier label and a short mark, so it survives greyscale (002
   FR-010).
4. **Given** the largest text size, **When** the bar renders, **Then** labels are not clipped and
   every tab is still at least the platform's minimum touch target (002 FR-011, FR-016).
5. **Given** a screen reader or keyboard, **When** the bar is used, **Then** every tab keeps its
   name, its selected state, its role and a visible focus indicator (002 FR-012, FR-017).

---

### User Story 4 - Fewer steps, calmer screens (Priority: P2)

Planning a trip asks for a name and shows the currency as one slim row instead of a wall of
buttons. Opening a trip shows its title and status at once and its five areas in a single row
instead of three rows of large buttons.

**Why this priority**: The trip is where a traveller spends their time. Every extra row of
chrome between them and their stops is friction on the most repeated path.

**Independent Test**: Create a trip and open it. The new-trip form fits on one screen without
scrolling at the default text size; the trip screen shows the title, status, the row of areas and
the first stops without scrolling.

**Acceptance Scenarios**:

1. **Given** the new-trip form, **When** it opens, **Then** the home currency is one line of
   choices (sideways-scrolling), with any other code behind an "Other" control.
2. **Given** the trip screen, **When** it opens, **Then** "Back" and the status share one row, the
   title sits below, and the five areas (Notes, Spending, Photos, Documents, Offline maps) sit in
   one row that scrolls sideways rather than wrapping.
3. **Given** any control present before this feature, **When** it is looked for afterwards,
   **Then** it is still reachable with the same accessible name.

---

### Edge Cases

- Two trips overlap in time: visited places are ordered by arrival date across both; a leg
  between two stops that already share a connection inside one trip is not drawn twice.
- Two consecutive visited places are in the same city: no leg is drawn between them.
- A visited stop names a city this device has not stored: it is left out of the line, and the
  line is not bridged across it (A, unknown, C is not a journey from A to C).
- A leg crosses the date line or passes near a pole: drawn the short way round, unbroken.
- Reduced motion is on: the globe opens still, and the camera moves to the first stop without
  animation.
- The traveller has already panned or zoomed when their first stop appears: the globe still moves
  to it once, because that is the moment the invitation they were following is answered.
- The invitation and the statistics panel are both needed: the statistics panel is not shown while
  there is nothing to count; the invitation is not shown once there is.

## Requirements _(mandatory)_

### Functional Requirements

**Globe always on**

- **FR-001**: The home screen MUST show the globe for every signed-in traveller, whether or not
  they have any trip or stop.
- **FR-002**: When nothing can be drawn, the home screen MUST float one compact invitation over
  the globe naming the single next action (plan a trip when there are no trips; add a first stop
  when there are trips but none has a stop), and the globe MUST stay visible and operable around
  it.
- **FR-003**: The invitation MUST be an opaque, bordered control surface that is legible over
  light and dark map content, with no scrim, tint or shadow across the map (002 FR-024, FR-025),
  and MUST NOT be shown once anything is drawn.
- **FR-004**: With nothing placed the globe MUST open on the whole sphere. When the first placed
  stop appears, the camera MUST move to it exactly once.
- **FR-005**: While the local store has not answered, the home screen MUST show its existing
  loading state; if it fails, the globe MUST still be shown with a plain-words notice.

**One line through visited places**

- **FR-006**: The globe MUST draw a continuous line through every place the traveller has been,
  across all trips, in order of arrival date (ties by departure date, then trip, then position
  within the trip).
- **FR-007**: A place has been visited when its stop is placed and its arrival date is today or
  earlier, on the device's local calendar day.
- **FR-008**: The line MUST consist of each trip's own connections plus connecting legs between
  consecutive visited places that those connections do not already join.
- **FR-009**: Connecting legs MUST follow the rules of trip connections: short way round the date
  line and poles, none within one city, never touching an unplaced stop.
- **FR-010**: A connecting leg belongs to no trip; tapping it MUST do nothing. Trip connections
  and stop markers MUST still open their trip (001 FR-047).
- **FR-011**: Connecting legs MUST be drawn in the style of past connections, so the visited
  history reads as one line; planned and active styling is unchanged (001 FR-046).
- **FR-012**: The statistics (countries visited, distance travelled) MUST NOT change: distance is
  the sum of legs within trips and does not include connecting legs.

**Bottom bar**

- **FR-013**: The bar's content MUST be no taller than 56 dp at the default text size, above the
  device's bottom inset, and MUST grow with the traveller's text size.
- **FR-014**: The bar MUST have the same background as the screens and no per-tab raised,
  recessed or bordered surface, and MUST be separated from the screen by one divider line that
  meets the 3:1 boundary contrast of 002 FR-009.
- **FR-015**: Each tab MUST show an icon and a label; the selected tab MUST be shown by accent
  colour, a heavier label and a short mark, never by colour alone (002 FR-010).
- **FR-016**: Each tab MUST keep the platform's minimum touch target, a visible focus indicator,
  and its accessible name, role and selected state (002 FR-011, FR-012, FR-017). Label and icon
  colours MUST meet 002 FR-008 on the bar's background in both themes.

**Fewer steps**

- **FR-017**: The home-currency choice MUST occupy one line, with any other code behind an
  "Other" control, wherever it is shown.
- **FR-018**: The trip screen MUST show "Back" and the status on one row, the title beneath, and
  its five areas as one row that scrolls sideways instead of wrapping.
- **FR-019**: No control, capability or accessible name present before this feature MAY be
  removed, and every automated-test identifier on a pre-existing control MUST be unchanged.

### Key Entities _(include if feature involves data)_

- **Visited place**: A placed stop whose arrival date is today or earlier. Derived on the device,
  never stored.
- **Journey leg**: A connection between two consecutive visited places that is not already a trip
  connection. Derived on the device, never stored (001 FR-016), belongs to no trip.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A traveller with a new account sees an interactive globe on first open, with zero
  trips created.
- **SC-002**: Every visited place of a traveller with N trips lies on one line: the number of
  separate lines through visited places is one.
- **SC-003**: The bottom bar's height is at most 56 dp plus the device inset at the default text
  size, down from about 80 dp, with no loss of reachability or labels.
- **SC-004**: The new-trip form fits on one screen without scrolling at the default text size on
  a 360 x 640 dp display.
- **SC-005**: Every screen reachable before this feature is reachable after it, by the same path
  and the same accessible names.

## Assumptions

- "Places I have been to" means stops whose arrival date has been reached, including a stop of a
  trip that is still in progress; planned-only stops are not part of the line.
- The distance statistic stays within-trip because a traveller may have gone home between two
  trips; a connecting leg is a picture of order, not a measurement of travel.
- Only the new-trip form and the trip screen are simplified here. The city picker's two steps
  (country, then city) and the stop sheet are unchanged, and trip areas remain separate screens.
- Opening a new trip straight into its stop sheet is out of scope: every Maestro flow that gates
  offline sync (`apps/mobile/e2e/`) asserts the trip screen between the two steps and would have
  to be re-run on two devices.
- The Expo development client's floating tools button seen on development builds is not part of
  the product and is not addressed here.
