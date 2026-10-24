# Feature 007: First-run tour and an open empty Home

Status: approved by the owner in chat, 2026-10-24 (mock-up option A, "spotlight tour"). Amends feature 003
(FR-001 to FR-003: the invitation card) and feature 005 (FR-018, FR-020, `home-empty.png`).

## Why

A traveller who has just made an account sees the globe covered by a card, "Your globe is waiting for its
first trip", that cannot be closed, under a line that counts "0 of 195 countries". The owner wants the globe
to be seen and the app to be learned from a short, closable tour instead, informative but never bothering.

## Goals

- **G1** The Home with no trips shows the globe, the sheet (its totals at zero) and the "Plan a trip" button.
  Nothing covers the globe and nothing on it cannot be dismissed.
- **G2** The "0 of 195 countries" line is gone: the empty Home greets with the date and "Hello, <name>" like any
  other Home.
- **G3** A tour of **at most five steps** teaches the basics: the globe and its totals, adding a trip, where
  trips live and are managed, what a trip holds and its options, and You.
- **G4** The tour can be closed **at any moment** and is never shown again unasked.

## Non-goals and anti-goals

- No tour for a traveller who already has trips; no tour on every launch; no nagging, badges or reminders.
- No account, network or server state: the only thing stored is one local flag per traveller.
- The tour never navigates, creates data or leaves the Home (all its targets are on the Home).
- No new dependency; no animation that needs reduced-motion handling (steps change in place).
- Not a replacement for the `no-stops` card (a trip exists but none has a place): it stays as it is.

## Requirements

- **FR-001** With no trips (store readable) the Home is the globe + sheet + "Plan a trip" button
  (`home-plan-trip-fab`). The `no-trips` invitation card, its three empty frames and the id
  `home-plan-trip` are removed; `globeInvitation` answers `null` for no trips.
- **FR-002** `GreetingHeader` and `HomeHeader` lose the `welcome` mode: the eyebrow is always the date.
- **FR-003** The tour has 1 to **5** steps (`MAX_TOUR_STEPS = 5`, asserted). Each step dims the screen, lights
  ONE real control (or none), and shows a card with a title, one or two sentences, the step position, a primary
  "Next" (the last: "Done") and a text "Skip tour". The card has a close (X) with the label "Close tour".
- **FR-004** Steps, in order:
  1. _Your globe_: lights the totals row. "Every trip you take draws an arc on the globe. Your totals are here."
  2. _Add a trip_: lights "Plan a trip". "Tap here, name the trip and add its first stop."
  3. _Your trips_: lights the Trips tab. "All your trips live here. Tap one to open it."
  4. _Inside a trip_: lights nothing (centred card). "Each trip holds its stops, photos, spending, notes, documents
     and offline maps. Open a trip's menu to edit or delete it." (No real trip exists yet, hence no spotlight.)
  5. _You_: lights the You tab. "Your passport and stamps are here, and you can replay this tour any time."
- **FR-005** Closing (X, Skip, the Android back button, or Done) ends the tour and records it as seen. A touch on
  the dimmed area does nothing (it does not close the tour and does not reach the screen below).
- **FR-006** The tour starts by itself once per traveller per device: when the tab navigator is open (the first
  sync has arrived), the traveller has **no trips** and has not seen it. A traveller who has trips is marked as
  having seen it without a tour. The flag is kept in the keychain under the traveller's id.
- **FR-007** You > App has a row "Take the tour" that starts the tour at step 1 from the Home (it switches to the
  Home first). Replaying never changes the seen flag.
- **FR-008** Accessibility: the card is one modal group named by its title and read first; Next, Skip and Close
  have names; the dimmed layers are hidden from assistive technology; the spotlight ring is decorative; at large
  text sizes the card scrolls inside itself and never leaves the screen; the contrast themes get opaque ink on
  an opaque card. A step whose target cannot be measured shows its card centred instead of failing.
- **FR-009** Privacy: nothing is sent; no expense or document data is read. Visibility posture: private,
  local-only flag.

## Decisions that were mine (the owner may change them)

- The tour starts from "no trips and not seen", not from "just registered": sign-up by e-mail, Google or Apple
  all arrive at the same place, and an existing account on a new phone (with its trips synced) never sees it.
- The step texts above are proposals.
- Ids: `tour-overlay`, `tour-card`, `tour-next`, `tour-skip`, `tour-close`; `profile-take-tour`.
