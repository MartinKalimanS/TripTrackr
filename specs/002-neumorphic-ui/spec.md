# Feature Specification: Neumorphic Visual Identity

**Feature Branch**: `002-neumorphic-ui`

**Created**: 2026-08-29

**Status**: Draft

**Input**: User description: "I want the app to have neumorphism look"

> **Superseded in part by [004-app-ui-redesign](../004-app-ui-redesign/spec.md) (2026-10-07).**
> The neumorphic identity was dismissed. FR-001 to FR-006 and the surface recipes are replaced;
> FR-007 to FR-029 are inherited by 004 (restated without shadows in its FR-023 to FR-037), with FR-009
> clarified to the wording of the accessibility rule it cites. This document is kept as history and as
> the source of the contrast, touch-target, text-size, motion and transparency commitments.

## Overview

TripTrackr currently presents its screens with unremarkable default styling. This feature gives
the product a single, deliberate visual identity: a soft, tactile "neumorphic" look, in which
surfaces appear moulded out of the background itself — raised elements catch light from one side
and cast a soft shadow on the other, and recessed elements appear pressed into the surface.

The change is visual only. It alters how every screen looks and how touch feedback reads, and it
does not add, remove, or alter any traveller-facing capability, any stored record, or any privacy
rule. A traveller who knows how to use TripTrackr today must still know how to use it afterwards.

The defining risk of this style is legibility. Neumorphism creates the impression of depth using
very low contrast between an element and its background, which is precisely the property that
makes interfaces hard to read in sunlight, at arm's length, or for anyone with reduced vision.
This specification therefore treats legibility as a hard constraint the style must satisfy, not
as a trade-off to be balanced against the aesthetic. Where the two conflict, legibility wins.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - The app looks like one considered product (Priority: P1)

A traveller opens TripTrackr and moves between the trip list, a trip's detail, their notes, and
their expenses. Every surface shares one visual language: cards and buttons appear gently raised
out of the background, input fields and progress tracks appear pressed into it, corners are
uniformly soft, and spacing is consistent. Nothing looks borrowed from a different app or left
over from a default template.

**Why this priority**: This is the feature. Every other story refines or protects it, and none of
them can be evaluated until a coherent set of surface treatments exists and is applied. Delivered
alone, it already achieves what was asked for.

**Independent Test**: Navigate every screen reachable in the app and confirm that each visible
surface, control, and field uses one of the defined treatments, with no screen falling back to
unstyled defaults and no two screens rendering the same kind of element differently.

**Acceptance Scenarios**:

1. **Given** a traveller is on the trip list, **When** they open a trip and return, **Then** cards,
   buttons, headers, and backgrounds on both screens use the same surface treatments, corner
   softness, and spacing rhythm.
2. **Given** a traveller views any screen in the app, **When** they compare an actionable control
   with static content, **Then** the actionable control is visually raised or otherwise clearly
   distinguished from the static content around it.
3. **Given** a traveller views a text input, **When** they compare it with the surrounding surface,
   **Then** the input reads as recessed and is unambiguously identifiable as a place to type
   before they touch it.

---

### User Story 2 - Readable on a sunlit street, not just at a desk (Priority: P2)

A traveller is standing outdoors in bright sunlight, phone at arm's length, checking which trip
stop is next. Despite the soft low-contrast styling, they can read every label, tell which
elements are tappable, and see which item is currently selected — without shading the screen with
their hand or raising the brightness.

**Why this priority**: TripTrackr is used outdoors, in transit, and in unfamiliar places. A style
that only works indoors on a good display fails the product's actual usage context, and an
interface whose controls cannot be found is broken regardless of how it looks.

**Independent Test**: Measure the contrast of every text and control treatment against its own
background and confirm each meets the stated minimum; then have a person locate and operate the
primary action on each main screen outdoors in direct sunlight without assistance.

**Acceptance Scenarios**:

1. **Given** any screen, **When** the contrast between body text and the surface behind it is
   measured, **Then** it meets or exceeds the normal-text minimum defined in FR-008.
2. **Given** any interactive control, **When** its boundary against the adjacent surface is
   measured, **Then** the control remains distinguishable at the non-text minimum defined in
   FR-009, using shadow, outline, tint, or any combination.
3. **Given** a traveller in direct sunlight, **When** they are asked to start a new trip, **Then**
   they identify and press the correct control without needing to shade the screen.
4. **Given** a list where one item is selected, **When** the traveller looks at the list, **Then**
   the selected item is distinguishable from the others by more than shadow depth alone.

---

### User Story 3 - The same identity after dark (Priority: P3)

A traveller with their device in dark mode — on a night flight, or in a hotel room — opens
TripTrackr and sees the same tactile identity rendered in dark tones. Surfaces still read as
raised or recessed, nothing glows harshly, and no screen is left in a half-converted state where
light-mode panels sit inside a dark background.

**Why this priority**: The product already honours the device's light and dark preference, and a
travel app is disproportionately used at night and in dim cabins. A style that only exists in one
theme leaves half the product unstyled.

**Independent Test**: Switch the device between light and dark appearance on every screen and
confirm both render completely, with no unconverted surfaces and no illegible text in either.

**Acceptance Scenarios**:

1. **Given** the device is set to dark appearance, **When** the traveller opens any screen,
   **Then** every surface uses the dark rendering of the style and the raised-versus-recessed
   distinction remains readable.
2. **Given** the traveller switches appearance while the app is open, **When** the change takes
   effect, **Then** the whole interface updates together, with no screen or component left in the
   previous theme.
3. **Given** either theme, **When** the contrast requirements of FR-008 and FR-009 are measured,
   **Then** they are met in both.

---

### User Story 4 - Controls that answer to the touch (Priority: P4)

A traveller presses a button. It visibly sinks into the surface for as long as their finger is
down and rises again when released, so the press is confirmed before anything else happens. On a
slow connection, the same physical vocabulary tells them the action is still in progress.

**Why this priority**: The raised-and-recessed metaphor only pays for itself when it moves. Static
depth is decoration; depth that responds to a press is the affordance that makes an otherwise
low-contrast interface feel operable and communicates that a tap registered.

**Independent Test**: Press and hold every kind of control in the app and confirm each shows a
distinct pressed appearance while held, returns on release, and shows a distinct appearance when
disabled or busy.

**Acceptance Scenarios**:

1. **Given** a traveller presses and holds any button, **When** their finger is down, **Then** the
   control appears pressed in, and **When** they lift it, **Then** the control returns to raised.
2. **Given** a traveller presses a control that triggers a slow operation, **When** the operation
   is running, **Then** the control shows a busy appearance and does not respond to further
   presses.
3. **Given** a control is unavailable, **When** the traveller looks at it, **Then** it is flattened
   and visually inert, and is announced as unavailable to assistive technology.
4. **Given** a traveller taps anywhere on the interface, **When** the visual response occurs,
   **Then** it appears immediately enough to feel like a direct consequence of the touch, per
   SC-005.

---

### User Story 5 - Steps back when the traveller has asked it to (Priority: P5)

A traveller who has turned on their device's accessibility settings — increased contrast, reduced
transparency, reduced motion, or enlarged text — opens TripTrackr and gets an interface that
honours those settings: flatter surfaces with real borders, no animated depth transitions, and
layouts that grow to fit larger text rather than clipping it.

**Why this priority**: These settings are an explicit statement that the default presentation does
not work for this person. A decorative style that ignores them makes the product unusable for the
travellers who most depend on those settings, and no amount of visual polish compensates.

**Independent Test**: Enable each accessibility setting in turn and confirm the interface adapts as
specified, with every screen still complete, operable, and free of clipped or overlapping content.

**Acceptance Scenarios**:

1. **Given** the device requests increased contrast, **When** the traveller opens any screen,
   **Then** soft shadows are replaced or supplemented by explicit borders and every element meets
   the raised contrast floor in FR-013.
2. **Given** the device requests reduced motion, **When** the traveller presses a control, **Then**
   the pressed state still appears but without animated transition.
3. **Given** the device is set to its largest supported text size, **When** the traveller opens any
   screen, **Then** all text is fully visible and no control is clipped, overlapped, or pushed off
   screen.
4. **Given** any accessibility setting is enabled, **When** the traveller performs any task,
   **Then** every action available in the default presentation remains available.

---

### User Story 6 - Photographs and the globe stay the subject (Priority: P6)

A traveller opens the 3D globe or a trip's photographs. The map and the images are shown plainly
and at full fidelity; the soft styling appears only in the controls and panels framing them, and
never as an overlay, tint, or shadow across the content itself.

**Why this priority**: The globe and the photo library are the emotional core of the product. A
decorative treatment applied over them degrades exactly the content travellers open the app to
see, and shadows cast onto map imagery can be mistaken for terrain.

**Independent Test**: Open the globe, the street-level view, and a photograph on every device size
and confirm the imagery is unobscured, undimmed, and untinted, while the surrounding controls
carry the style.

**Acceptance Scenarios**:

1. **Given** a traveller views the globe, **When** the screen renders, **Then** no shadow, tint, or
   soft overlay is drawn across the map surface, and the controls floating above it are legible
   against both light and dark map areas.
2. **Given** a traveller views a photograph, **When** the screen renders, **Then** the image is
   shown at full fidelity with the styling confined to its frame and surrounding controls.
3. **Given** a photograph whose edges are near-white or near-black, **When** it is placed on a
   surface of similar tone, **Then** its boundary remains visible.

---

### Edge Cases

- **A record is saved locally but not yet synchronised.** The style must have a distinct treatment
  for not-yet-synchronised content, so that soft, finished-looking styling never implies a record
  is safely stored when it is still pending.
- **Text at the largest supported size.** Controls must grow with their labels rather than clipping
  them or letting soft edges overlap adjacent elements.
- **A very small or very narrow screen.** Soft edges and spacing must scale down without adjacent
  elements' shadows merging into one another and destroying the raised/recessed distinction.
- **A long list scrolled quickly on an older device.** The styling must not cause visible stutter;
  where it would, a simplified rendering is used rather than accepting dropped frames.
- **A screenshot shared, or an itinerary exported or printed.** Content must remain legible when the
  soft styling is flattened or reproduced without colour.
- **A traveller using a screen reader.** The change is visual only; the reading order, labels, roles,
  and states announced must be identical before and after.
- **A traveller with colour vision deficiency.** No state — selected, error, success, unavailable —
  may be communicated by hue alone.
- **An empty state, an error state, or content still loading.** These must be styled as deliberately
  as populated screens, not left as unstyled defaults.
- **A screen added after this feature ships.** New surfaces must be composed from the defined
  treatments rather than inventing new ones.

## Requirements _(mandatory)_

### Functional Requirements

**Visual system**

- **FR-001**: The product MUST define a single, named set of visual values — background tones,
  surface tones, light and shadow tones, corner softness, depth levels, spacing steps, and text
  tones — that every screen draws from.
- **FR-002**: The system MUST define at least three surface treatments: raised (appears lifted out
  of the background), recessed (appears pressed into it), and flat (neither), plus a pressed state
  for interactive elements.
- **FR-003** _(tab bar amended by 003-globe-first-home: flat, one divider, no per-tab surface)_: Every screen, panel, card, list row, button, input, toggle, tab, header, and dialog in
  the product MUST be presented using these treatments. No screen may retain default
  platform-supplied styling.
- **FR-004**: Backgrounds and surfaces MUST be tonally close enough for the raised and recessed
  illusion to read, while still satisfying FR-008 and FR-009.
- **FR-005**: Light MUST be treated as arriving from one consistent direction across the entire
  product, so that raised and recessed elements are never lit inconsistently on the same screen.
- **FR-006**: Depth MUST be limited to a small, defined number of levels, so that stacking order
  reads as a deliberate hierarchy rather than accumulating arbitrarily.
- **FR-007**: The system MUST provide a defined treatment for content that has been recorded on the
  device but not yet synchronised, visually distinct from fully saved content.

**Legibility and accessibility**

- **FR-008**: Text MUST meet a contrast ratio of at least 4.5:1 against the surface behind it, and
  at least 3:1 for large text, in every theme and every state.
- **FR-009** _(tab bar: boundary carried by one 3:1 divider, see 003 FR-014)_: Every interactive control and every meaningful boundary MUST be distinguishable from
  its surroundings at a contrast ratio of at least 3:1, achieved by outline, tint, or shadow.
- **FR-010**: No state MUST be communicated by colour alone; each MUST also be conveyed by shape,
  position, icon, text, or depth.
- **FR-011**: Every interactive element MUST expose a touch target no smaller than the platform's
  recommended minimum, irrespective of the size of its visible decoration.
- **FR-012**: Every interactive element MUST have a visible focus indicator that meets FR-009,
  independent of the raised or pressed appearance.
- **FR-013**: When the device requests increased contrast, the product MUST render explicit borders
  and raise all contrast to at least 7:1 for normal text.
- **FR-014**: When the device requests reduced transparency, the product MUST render surfaces
  opaquely.
- **FR-015**: When the device requests reduced motion, depth transitions MUST resolve instantly
  while still showing the destination state.
- **FR-016**: All layouts MUST accommodate the platform's largest supported text size without
  clipping, overlapping, or hiding content or controls.
- **FR-017**: The change MUST NOT alter the information announced to assistive technology — reading
  order, names, roles, states, and grouping MUST be unchanged.

**Behaviour and feedback**

- **FR-018**: Interactive elements MUST show a pressed appearance for as long as the touch is held
  and return to their resting appearance on release.
- **FR-019**: Unavailable controls MUST be rendered flat and inert, and announced as unavailable.
- **FR-020**: Controls performing a slow operation MUST show a busy appearance and ignore further
  presses until the operation resolves.
- **FR-021**: Depth transitions MUST be brief enough to read as direct physical response rather than
  as animation, per SC-005.

**Theming**

- **FR-022**: The system MUST provide a complete light rendering and a complete dark rendering, both
  satisfying every requirement in this specification.
- **FR-023**: The product MUST follow the device's appearance preference and update the entire
  interface together when it changes, leaving no component in the previous theme.

**Content surfaces**

- **FR-024**: Map, globe, street-level, and photographic content MUST be presented without overlay,
  tint, or shadow applied across the content itself.
- **FR-025**: Controls placed over map or photographic content MUST remain legible against both
  light and dark content beneath them.
- **FR-026**: Photographs and thumbnails MUST retain a visible boundary against surfaces of similar
  tone.

**Scope and consistency**

- **FR-027**: Empty, loading, and error states MUST be styled to the same standard as populated
  screens.
- **FR-028**: Screens MUST NOT introduce one-off visual values outside the defined set; any
  genuinely new need MUST be added to the set rather than applied locally.
- **FR-029**: The feature MUST NOT add, remove, or change any traveller-facing capability, stored
  record, permission, or privacy behaviour.

### Key Entities

- **Visual value set**: The named collection of tones, depths, corner softness, spacing steps, and
  text styles that the whole product draws from. Has exactly one light and one dark rendering, plus
  the adaptations required by FR-013 through FR-015.
- **Surface treatment**: A named presentation — raised, recessed, flat, pressed, busy, unavailable,
  pending-synchronisation — that any element can be assigned, defined once and reused everywhere.
- **Appearance context**: The combination of the traveller's device theme and active accessibility
  settings that determines which rendering of the visual value set is in effect.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of screens reachable in the app present every surface, control, and field using a
  defined treatment, with zero elements retaining default platform styling.
- **SC-002**: 100% of text and control combinations, measured across both themes and every state,
  meet the contrast minimums in FR-008 and FR-009, verified by automated measurement on every
  release.
- **SC-003**: In outdoor daylight testing, at least 9 of 10 participants locate and operate each
  screen's primary action on the first attempt without shading the screen.
- **SC-004**: At least 95% of first-time viewers, shown a still image of any screen, correctly
  identify which elements are tappable.
- **SC-005**: Visual response to a press appears within 100 milliseconds of the touch, and depth
  transitions complete within 200 milliseconds.
- **SC-006**: Scrolling any list in the app remains smooth on the oldest supported device, with no
  visible stutter and no measurable frame-rate regression against the pre-existing styling.
- **SC-007**: Task completion times for creating a trip, adding an expense, and writing a note show
  no regression against the pre-existing styling.
- **SC-008**: Every screen renders completely and operably at the platform's largest text size, with
  zero instances of clipped or overlapping content.
- **SC-009**: Assistive-technology output — reading order, names, roles, and states — is identical
  before and after the change on every screen.
- **SC-010**: Both themes and all four accessibility adaptations (increased contrast, reduced
  transparency, reduced motion, enlarged text) render every screen completely, with zero screens
  left partially converted.

## Assumptions

- The instruction applies to the whole product rather than to selected screens; every existing and
  future surface adopts the style.
- This is a presentation change only. No traveller-facing capability, stored record, or privacy rule
  described in the TripTrackr MVP specification is altered, and the constitutional guarantee that
  privacy is enforced structurally rather than visually is unaffected.
- Legibility outranks the aesthetic. Where the soft low-contrast look cannot meet the stated contrast
  floors, the look yields — through added outlines, stronger tonal separation, or accent colour —
  rather than the floor being lowered. WCAG AA is taken as the baseline, and WCAG AAA as the target
  under the device's increased-contrast setting.
- The style is applied to interface chrome only. Map, globe, and photographic content are treated as
  the subject and are framed by the style rather than covered by it.
- Both light and dark renderings are in scope from the start, since the product already honours the
  device appearance preference.
- Accent colour is used sparingly, for state and emphasis, and is not the primary means of conveying
  depth.
- Adopting the style does not itself add or remove screens; where an existing screen currently has no
  defined empty, loading, or error presentation, giving it one is in scope for this feature.
- The pending-synchronisation treatment in FR-007 serves the existing offline-first behaviour and does
  not change when or how synchronisation occurs.
