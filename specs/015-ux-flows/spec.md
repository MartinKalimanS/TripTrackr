# Feature Specification: Complete the everyday flows

**Feature Branch**: `feat/ux-flows`
**Created**: 2026-11-11
**Status**: Draft
**Input**: Owner request: "improve the whole UI/UX and the flows", after the audit of 2026-11-11.

The look (feature 005, Sunrise Passport) stays. What changes is what a traveller can DO: the audit
found actions that do not exist, controls that do nothing, and a paid credit that is not used
without an extra, unexplained step.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Manage a trip I already made (Priority: P1)

A traveller opens a trip and can rename it, change its home currency, or delete it. Today none of
these exists on any screen, yet the allowance tells the traveller to "delete a trip to make room".

**Why this priority**: Without delete, the free allowance has no way out except paying.

**Independent Test**: Open a trip, open its menu, rename it, then delete it; the trip leaves the
list and a new trip can be made in its place.

**Acceptance Scenarios**:

1. **Given** a trip, **When** the traveller opens its "More" menu, **Then** they see Rename, Home
   currency and Delete trip, and nothing that does not work.
2. **Given** the menu, **When** they rename the trip and save, **Then** the new name shows on the
   trip, the trips list and the Home, offline included.
3. **Given** the menu, **When** they choose Delete trip, **Then** they are asked to confirm in words
   that name the trip and say that its stops, photos, notes, expenses and documents go with it.
4. **Given** the confirmation, **When** they confirm, **Then** the trip leaves every list at once,
   they are taken back to the trips list, and the deletion is sent when a connection exists.
5. **Given** a traveller at the free limit with nothing to spend, **When** they delete a trip,
   **Then** "Plan a trip" opens the form again without the paywall.

---

### User Story 2 - Correct a stop (Priority: P1)

A traveller who chose the wrong city can change the city of a stop, not only its dates.

**Independent Test**: Edit a stop, change its city, save; the timeline shows the new city.

**Acceptance Scenarios**:

1. **Given** a stop, **When** the traveller edits it, **Then** the editor is titled "Edit stop" and
   shows the city with a "Change" control and the dates.
2. **Given** the editor, **When** they change the city and save, **Then** the stop keeps its place
   in the order and its dates, and shows the new city.

---

### User Story 3 - What I paid for is used for me (Priority: P1)

A traveller who holds a credit or a yearly use makes a trip beyond the free number. The trip is
covered with what they hold without a further step.

**Why this priority**: It is the paid path; today the trip stays flagged and the credit unspent.

**Independent Test**: With three free trips and one credit, make a fourth trip and sync: the credit
count drops to zero and the trip is not flagged. A fifth trip opens the paywall.

**Acceptance Scenarios**:

1. **Given** a credit and three ordinary trips, **When** a fourth trip arrives by sync, **Then** it
   is covered by the credit on arrival and never flagged.
2. **Given** a Tier 1 year with uses left and a credit, **When** such a trip arrives, **Then** the
   year use is spent before the credit (the existing order).
3. **Given** nothing to spend, **When** such a trip arrives, **Then** it is kept and flagged, as
   today (014 FR-018).
4. **Given** a trip that was flagged earlier, **When** the traveller later buys a credit, **Then**
   the earliest flagged trip is covered by it without a further step.
5. **Given** the same push delivered twice, **Then** one credit is spent, not two.
6. **Given** a flagged trip, **When** the traveller opens that trip, **Then** the notice that it
   needs a cover is shown there too, not only on the trips list.

---

### User Story 4 - No control that does nothing (Priority: P2)

Every control on a screen does something. A capability the app does not have is not drawn.

**Independent Test**: Tap every control on Home, Trips, a trip, its five areas and You: none answers
with "coming soon".

**Acceptance Scenarios**:

1. **Given** any screen, **When** the traveller taps any control, **Then** it acts; no control exists
   only to say that something is not available yet.
2. **Given** the trips list, **When** the traveller taps Search, **Then** they can filter their trips
   by name, on the device.
3. **Given** You, **When** they tap Settings, **Then** they reach the account, plan, data and app
   rows, which no longer sit under the passport.

---

### User Story 5 - Make a trip in one go (Priority: P2)

The "New trip" form asks only for what the app keeps: the name and, folded away with the traveller's
default, the home currency. Adding the first place is the offered next step, stated in words.

**Acceptance Scenarios**:

1. **Given** the form, **Then** it shows no row that cannot be filled in.
2. **Given** a name, **When** the traveller chooses "Save and add first stop", **Then** the trip is
   saved and the first stop's editor opens; "Save trip" alone saves and opens the trip.

### Edge Cases

- Deleting a trip that was never synced removes it locally and sends nothing.
- Deleting a covered trip does not give the credit or the year use back (014 FR-007).
- Renaming to an empty or over-long name is refused in words, as on create.
- Changing a stop's city to the city of an adjacent stop is allowed.
- A credit refunded after it covered a trip: the trip stays and counts as ordinary (014 FR-024).
- Offline: every action in stories 1, 2 and 5 works and is sent later.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: A trip MUST offer Rename, Home currency and Delete trip from its "More" control.
- **FR-002**: Deleting a trip MUST require a confirmation that names the trip and what goes with it.
- **FR-003**: A deleted trip MUST leave every list immediately and MUST free its free slot.
- **FR-004**: Editing a stop MUST allow changing its city as well as its dates.
- **FR-005**: A trip arriving beyond the free number MUST be covered on arrival when the traveller
  holds a Tier 1 use or a credit, in the existing spending order. This amends 014 FR-018 and FR-019:
  a trip is flagged only when nothing can cover it.
- **FR-006**: When a traveller gains a credit or a year use, their flagged trips MUST be covered,
  earliest first, while something remains to spend.
- **FR-007**: Covering MUST be idempotent: a retried delivery spends nothing more.
- **FR-008**: A flagged trip MUST show its notice on the trip itself as well as on the trips list.
- **FR-009**: No screen MAY draw a control whose only effect is to say a capability is missing. This
  retires owner rule Q-11 of feature 005.
- **FR-010**: The trips list MUST offer a search by trip name over the local store.
- **FR-011**: You MUST offer a Settings screen holding account, plan, data and app rows.
- **FR-012**: The New trip form MUST show only fields it stores, with the home currency defaulted.
- **FR-013**: Every action here MUST work offline and reach the server later, as all writes do.
- **FR-014**: Expenses and documents keep their privacy posture; nothing here exposes them.

### Key Entities

- **Trip**: gains no field; rename and currency edit the existing ones, delete is the existing tombstone.
- **Cover**: unchanged shape; written on arrival as well as on request.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A traveller can delete a trip in at most three taps from the trip screen.
- **SC-002**: With one credit, the fourth trip is covered and the fifth asks for payment, with no step
  between buying and using the credit.
- **SC-003**: Zero controls in the app answer with "coming soon".
- **SC-004**: A wrong city on a stop is corrected without deleting the stop.
- **SC-005**: A new trip with its first stop is made without meeting a row that does nothing.

## Assumptions

- Share, the yearly recap, photo multi-select and note formatting are not built here; their controls
  are removed until they are specified.
- Cover choice and trip-level dates are not stored today; the form stops drawing them. A cover still
  comes from the trip's photos and dates from its stops.
- The visual language, tokens and components of feature 005 are reused; no new look.
- Verified on a device by the owner; automated checks cover logic, reading order and reflow.
