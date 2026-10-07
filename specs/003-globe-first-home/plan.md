# Implementation Plan: Globe-First Home

**Branch**: `003-globe-first-home` | **Date**: 2026-10-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-globe-first-home/spec.md`

## Summary

Mobile-only change. The home screen mounts the one existing `MapView` (research D-30) in every
state and floats a compact invitation over it when nothing can be drawn. A second, non-interactive
`ShapeSource` draws the legs between consecutive visited places that no trip connection already
covers, in the style of past connections. The tab bar loses its per-tab surfaces and becomes a
flat strip. The new-trip form and the trip screen shed chrome. Nothing touches the API, the wire
contracts, the local schema, sync, or any privacy surface.

## Technical Context

**Language/Version**: TypeScript 5, React Native (Expo SDK 57), `expo-router` typed routes

**Primary Dependencies**: existing only (`@rnmapbox/maps`, `expo-symbols`, `date-fns` through the
stop-date helpers). No new dependency.

**Storage**: none added; everything is derived from the encrypted local store (Constitution II).

**Testing**: Jest + `@testing-library/react-native`; Mapbox stand-ins from `jest.setup.ts`;
Maestro flows under `apps/mobile/e2e/` updated where an assertion changes.

**Target Platform**: iOS + Android dev-client (no web, research D-14)

**Constraints**: 80% coverage floor per workspace; no raw colour literals (C1); every
pre-existing testID and accessible name preserved (FR-019).

## Constitution Check

| Principle                    | Posture                                                                                                                                                                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Privacy is structural     | No new table, endpoint or screen reads traveller data in a new way. The invitation and the journey legs are derived on the device and drawn only for the signed-in traveller's own local rows. Visibility posture: unchanged, private, never transmitted. |
| II. Offline is the default   | Everything is derived from the local store; no network call added.                                                                                                                                                                                        |
| III. Test-first              | Each task below writes the failing test first; coverage floor unchanged.                                                                                                                                                                                  |
| IV. Verify before you render | Legs touching an unplaced stop are left out and never bridged; nothing is drawn at a guessed position.                                                                                                                                                    |
| V. Nothing is held hostage   | Not affected.                                                                                                                                                                                                                                             |

## Decisions

- **D3-01 Journey legs are derived, not stored.** `features/globe/journey.ts` returns the visited
  places (placed, `arriveDate <= today`) ordered by `(arriveDate, departDate, tripId, index)` and
  the legs between consecutive ones, minus legs a trip already draws (same ordered stop pair,
  checked against `placedLegs`) and legs within one city. `arc-features.ts` turns them into a
  `FeatureCollection` through the same `greatCircle` used for trip arcs, so the date line and
  poles behave identically (001 edge cases).
- **D3-02 A separate source, no `onPress`.** A leg belongs to no trip, so `use-arc-press` must
  never see it. `ArcSource` gets a `globe-journey` source declared BEFORE the trip arcs (drawn
  under them) with the casing and the `past` line style. No new colour token, so no change to the
  globe contrast gate.
- **D3-03 The globe mounts as soon as the store answers.** `HomeScreen` renders `GlobeView` for
  every non-loading state. What replaces the old full-screen empty state is
  `GlobeInvitation` (the old `GlobeEmptyState` component, kept for its testIDs `home-plan-trip`,
  `home-open-trips`, `globe-empty-state`), an opaque bordered `Surface` over the map (C12).
  `GlobeView` is still not mounted while loading: the camera's `defaultSettings` are read once, so
  mounting before data would open away from the traveller's trip.
- **D3-04 The camera answers the first placed stop once.** `useFlyToFirstPlacement` in
  `components/globe/camera.ts` watches `hasPlaced`; on false to true it calls
  `setCamera({ centerCoordinate, zoomLevel })` with a duration of 0 under reduced motion. The
  traveller's own pans afterwards are never overridden.
- **D3-05 The tab bar is flat.** `PressableSurface` gains `bare` (no fill, border or shadow; focus
  ring, touch target and press feedback kept). The bar draws one divider with the existing
  `border` token (3.29:1 light, 3.17:1 dark) and the selected tab gets an accent mark above its
  icon. `NeumorphicTabBar` keeps its name and testIDs.
- **D3-06 Currency on one line.** `CurrencyPicker` renders its pills in a horizontal
  `ScrollView` with an "Other" pill that reveals the free-text field; selecting a pill or typing
  keeps every existing testID (`currency-<CODE>`, `currency-other`). It is shared with
  add-expense, which gets the same treatment.
- **D3-07 Trip screen.** Back + status in one row, title below, `TRIP_LINKS` in a horizontal
  `ScrollView` of flat `PressableSurface` chips keeping `trip-open-<segment>`.

## Project Structure

```text
apps/mobile/src/
  app/(tabs)/index.tsx                         # always the globe + invitation
  app/trip/[id]/index.tsx                      # compact header, one-row links
  app/modal/add-trip.tsx                       # unchanged except for the picker
  components/globe/
    empty-state.tsx                            # becomes the compact invitation card
    arc-source.tsx, arc-features.ts, globe-view.tsx, camera.ts
  components/navigation/neumorphic-tab-bar.tsx # flat strip
  components/trip/currency-picker.tsx          # one line + Other
  components/ui/pressable-surface.tsx          # `bare`
  features/globe/journey.ts                    # new, pure
apps/mobile/e2e/03-globe.yaml                  # the empty state no longer hides the globe
```

## Out of scope (recorded so it is a decision, not an omission)

- Opening a new trip straight into its stop sheet, and a one-box city search: both change the
  tap sequence that the offline-sync gate's Maestro flows assert, and need a two-device re-run.
- Redesigning the five trip areas themselves.
