# 007 First-run tour: as built

Branch `feat/ui-stack`, 2026-10-24. Spec `spec.md`; mock-up option A (spotlight) chosen by the owner.

## What changed

- **Empty Home (T701).** `globeInvitation([])` is `null`: with no trips the Home shows the globe, the sheet at
  zero and `home-plan-trip-fab`. Removed: `InvitationCard` (and its three empty frames and the pictured "Find
  trips in my photos" button), the `no-trips` copy and `home-plan-trip` of `GlobeEmptyState`, the `welcome`
  mode of `GreetingHeader` and `HomeHeader` ("Welcome" and the "0 of 195 countries" counter). The
  `no-stops` card and the unreadable-store notice are unchanged. `home-plan-trip` is allow-listed in the parity
  test (reason: T701) and the Maestro flows 03, 04 and 05 tap `home-plan-trip-fab`.
- **Logic (T702).** `features/tour/`: `tour-steps.ts` (five steps, `MAX_TOUR_STEPS = 5`), `tour-store.ts`
  (zustand: `start`, `next`, `close`), `auto-start.ts` (the rule), `use-first-run-tour.ts` (the hook), and
  `hasSeenTour` / `markTourSeen` in `lib/secure-store.ts` (key `triptrackr.tour_seen.<userId>`).
- **Overlay (T703).** `components/tour/`: `tour-geometry.ts` (pure: padded ring, four dim panels, card
  placement), `tour-targets.ts` (`useTourTarget` callback ref, `measureTourTarget`), `tour-overlay.tsx`,
  `first-run-tour.tsx` (counts trips, starts the tour, records "seen" on close). No animation.
- **Wiring (T704).** `(tabs)/_layout.tsx` mounts `FirstRunTour` over the navigator. Anchors: the totals row
  (`StatsRow`), `PlanTripFab` on Home, and the Trips and You tabs in `TabPill`. `Button` and `Tappable` now
  take a `ref` prop (React 19) for this.
- **You (T705).** App group, first row "Take the tour" (`profile-take-tour`): goes to the Globe and starts it.
- **Flows (T706).** `e2e/_helpers/dismiss-tour.yaml` (run after sign-up by flows 01 to 05 and the offline
  setup), and the new flow `e2e/07-first-run-tour.yaml`.

## Calls I made (the owner may change them)

- The tour starts from "no trips and not seen", not from "just registered", so e-mail, Google and Apple sign-up
  behave alike, and an existing account on a new phone (trips synced) never sees it.
- The tour never navigates; step 4 has no real trip to light, so it is a centred card.
- A failed trip read never starts it. A keychain fault costs a tour, never a crash (Sentry).
- The dim is the existing `backdrop` token (34 percent navy); the ring is the accent token.

## Device checks the owner must do

1. Create an account on a phone: the globe is open (no card, no "0 of 195 countries"), the tour starts, each
   step lights the right control on iOS and Android (totals, Plan a trip, Trips tab, You tab), Next and Done work.
2. The X, Skip and the Android back button close it at every step; it does not return after a restart.
3. You > Take the tour replays it from step 1. A sign-in with an account that has trips shows no tour.
4. Largest text size: the card scrolls and every button stays reachable; TalkBack and VoiceOver read the card
   (TalkBack may still reach controls behind the dim: look at it).
5. The ring and the totals row line up after the sheet settles (the overlay measures again after 350 ms).
