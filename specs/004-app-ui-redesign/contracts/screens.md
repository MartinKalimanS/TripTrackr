# Contract: Screen Obligations and Blueprint (Atlas)

**Feature**: `specs/004-app-ui-redesign` | **Consumers**: every route in `apps/mobile/src/app/` | **Carries
over**: `specs/002-neumorphic-ui/contracts/surface-components.md` C12 (content surfaces) and C13
(screen-level obligations), restated here without shadows.

---

## C4-10. Screen-level obligations

Every screen, including ones added later:

1. **Composes only from the adapter layer** (`contracts/components.md`); no raw `View` carrying an
   inline appearance style, no literal colour, no kit import (FR-036).
2. **Defines loading, empty and error presentations** to the same standard as its populated state
   (FR-035, FR-021): skeletons shaped like the content while loading; an empty state that names the next
   action; an error that offers retry. A screen never shows its empty state while its first load is still
   resolving.
3. **One primary control per screen state** (FR-005); everything else is secondary, text or destructive.
4. **Title and way back in the header** (FR-007, FR-008): the navigation header carries the title (large on
   iOS top-level lists) and a back control named "Back". The globe home has no header; the trip screen's
   hero title is its content and keeps `testID="trip-title"`.
5. **Renders completely at the platform's largest text size**, verified at that setting rather than
   assumed (FR-029, SC-007): content scrolls, headers and chips do not clip, sideways rows stay reachable.
6. **Leaves assistive-technology output unchanged** for every pre-existing control (FR-030, FR-037): same
   accessible name, role, state, hint and order; the header title and back control are additive.
7. **Preserves every pre-existing `testID`** (FR-037). The pre-004 set is captured from a git tag in T400
   and compared mechanically (T414); removing or renaming one needs a note in `tasks.md` and the matching
   Maestro edit in the same change.
8. **Keyboard**: a form's primary action is never under the keyboard; `keyboardShouldPersistTaps="handled"`.
9. **Content surfaces** (002 C12 kept): no shadow, tint, scrim or overlay across map, globe or photographs;
   controls over them are opaque with a hairline boundary (FR-018, FR-033); photographs keep a hairline
   boundary against similar tones.
10. **Visibility posture stated** in the PR for any screen, endpoint or table that touches traveller data
    (AGENTS.md). Nothing in this feature adds one; the trip cover is local-only (data-model §4).

---

## C4-11. Blueprint, preserved identifiers and phase

| Screen (route)                                            | Pattern                                                                                                                                                                                       | Identifiers that MUST survive                                                                                                                                                                     | Phase |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Home (`(tabs)/index`)                                     | Globe full-bleed, no header. Opaque hairline cards: stats chip (two figures, display face, tabular), invitation card (one primary), notice card (alert). Loading state keeps `Screen`.        | `home-screen`, `globe-map`, `globe-stats`, `globe-stat-countries`, `globe-stat-distance`, `globe-empty-state`, `globe-notice`, `home-plan-trip`, `home-add-stop`, `home-open-trips`               | 3     |
| Tab bar                                                   | Flat strip, filled selected icon, mark (C4-9)                                                                                                                                                 | `tab-bar`, `tab-index`, `tab-trips`, `tab-profile`, `tab-mark-<name>`                                                                                                                             | 3     |
| Trips (`(tabs)/trips/index`)                              | iOS large title; Android standard header. Plan a trip: iOS header action, Android FAB. List of trip cards; skeleton cards; empty state. Whole card is the control with a chevron cue.         | `trips-screen`, `trips-plan-trip` ("Plan a trip"), `trips-list`, `trip-card-<id>` (label "title, status, N stops")                                                                                | 3     |
| Trip card                                                 | Cover (photo thumbnail or typographic), title, `StatusChip`, date range, "N stops · CUR", `SyncBadge` when `is_dirty`                                                                         | `trip-card-<id>`, `status-pill-<status>`                                                                                                                                                          | 3     |
| Trip (`trip/[id]/index`)                                  | Native header with Back; hero title; status chip, currency, sync badge; areas as one sideways row of icon chips (003 FR-018); "Stops" header with a secondary "Add stop"; stops as a timeline | `trip-screen`, `trip-header-row`, `trip-title`, `trip-links`, `trip-open-<segment>` (notes, expenses, photos, documents, offline-maps), `trip-add-stop`, `trip-stops`, `trip-write-error`, `Back` | 3     |
| Stop row                                                  | Number and timeline, place, country, dates, pending marker; per-stop controls kept as compact icon-and-label buttons; row `accessibilityActions` kept                                         | `stop-row-<id>`, `stop-dates-<id>`, `stop-move-up-<id>`, `stop-move-down-<id>`, `stop-edit-<id>`, `stop-remove-<id>`                                                                              | 3     |
| Add trip (`modal/add-trip`)                               | `formSheet`, `fitToContents`, handle; label-on-top fields; currency as one sideways chip row with "Other"; sticky Save/Cancel                                                                 | `add-trip-screen`, `add-trip-title`, `currency-<CODE>`, `currency-other`, `add-trip-error`, `add-trip-cancel`, `add-trip-save`                                                                    | 4     |
| Add expense (`modal/add-expense`)                         | `formSheet`, same field and action pattern; category chips one row                                                                                                                            | ids as today                                                                                                                                                                                      | 4     |
| Stop editor                                               | React Native `Modal`, `pageSheet` on iOS, restyled; city picker (search + list), date fields                                                                                                  | `stop-editor`, `stop-editor-place`, `stop-editor-change-city`, `stop-editor-arrive`, `stop-editor-depart`                                                                                         | 4     |
| Notes, Spending, Photos, Documents, Offline maps          | Header title; grouped rows or grid; summary card on Spending; designed states                                                                                                                 | ids as today (Maestro 02 and 05)                                                                                                                                                                  | 5     |
| Welcome, Login, Register                                  | Thumb-zone primary and secondary; fields with words-only errors; outline social buttons; native header with Back on Login and Register                                                        | `welcome-screen`, `welcome-create-account`, `welcome-sign-in`, `login-screen`, `login-email`, `login-password`, `login-submit`, `login-error`, register ids as today                              | 6     |
| Profile (`(tabs)/profile/index`)                          | Large title; avatar, name, email; grouped account and app rows; Sign out and Delete account set apart, labelled                                                                               | `profile-screen`, `profile-display-name`, `profile-email`, `profile-version`, `profile-sign-out`, `profile-delete-account`                                                                        | 6     |
| Conflict notice, first-sync, local-store gates, not-found | Toast or alert banners; centred spinner states with plain-words copy                                                                                                                          | ids as today                                                                                                                                                                                      | 6     |

**Navigation structure** (research D4-06): `(tabs)/trips` and `(tabs)/profile` become nested stacks (same
URLs); `trip/[id]` and `modal` turn headers on; `modal/add-trip` and `modal/add-expense` are `formSheet`;
`Stack.Protected` guards in the root layout are untouched.

**Notes from building Trips and the Trip card (T427 trips and profile, T430)**

- The large title option is `headerLargeTitleEnabled`; the iOS trips header has no background of its own (iOS 26 hides a
  large title over one).
- `trips-list` is on the list itself (the `FlashList` scroller) and only in the populated state, as before;
  `trips-screen` is the screen root in every state. The empty state's own action is `trips-empty-plan-trip`
  ("Plan a trip", secondary), so `trips-plan-trip` stays unique: the header action on iOS, the floating button on
  Android, present in every state.
- The trips error state keeps its title and detail and offers no retry: `useTrips` is a live query with nothing to
  re-run. This is a recorded gap against C4-10 rule 2.
- The trip card draws its own chevron (`cue={false}`) so a cover that runs to the card's edge does not leave it
  hanging off the picture. The date range reads "12 Mar – 20 Mar 2026" (the year said once when both ends share it).
- The tab screen pads no bottom safe area (the tab bar below it clears the home indicator): the Android button sits
  16 dp above the screen's edge and the list ends with a footer as tall as the button plus its margins.

**Back**: in the Maestro flows `tapOn: 'Back'` must keep working on the trip, sub-screens and sign-in
forms on both platforms (research, "Items to verify", item 7).
