# Quickstart: Validating the Atlas Redesign

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This is a validation guide, not an implementation guide. It says how to prove, phase by phase, that the
feature works. Every command here already exists in the repository (see `AGENTS.md`); nothing below is
run by the documentation-only change that created this feature.

## 0. Prerequisites

- Node and npm as for the rest of the repository; Android SDK and/or Xcode for dev-client builds. The
  app cannot run in Expo Go.
- Always `npm ci` at the **repository root** (single lockfile). Never `npm install` inside a workspace.
- A real phone for sections 3, 6 and 7, and a second device for section 8 (the offline gate).
- Windows note: filter Jest by a path **regex fragment**, not a slash path
  (`npx jest -- fx-refresh`, per `AGENTS.md`).

## 1. Spike (phase 1): is the kit viable here?

Work on a throwaway branch (`spike/heroui-uniwind`) so product screens are not touched.

1. Install the pinned packages (research D4-14) with one root `npm install`, then rebuild both dev clients
   (`npm run android -w apps/mobile` and `npm run ios -w apps/mobile`, or `run-on-phone.cmd` on Windows).
2. Start Metro with a clean cache: `npx expo start --clear` from `apps/mobile`. Expect: bundles on both
   platforms; Sentry's Debug ID still present in the bundle.
3. Render one throwaway screen with a Button, a Field, a Card, a ListGroup and a Chip in all four themes.
4. Run `npm run test -w apps/mobile` (or `test:cov`). Expect: the whole existing suite is still green and
   one real render of `Button` and `Field` passes.
5. Walk the ten checks in research.md "Items to verify empirically". Record each result and the go/no-go
   in research.md (T409). Expected pass criteria: every check is green, or a documented, accepted
   workaround exists.

## 2. Gates that run on every phase

From the repository root:

```bash
npm run lint && npm run typecheck
npm run test:cov -w apps/mobile       # 80% floor enforced by jest.config.js
npm run test -w packages/contracts
npm run format:check
```

Expect all green. Additionally from phase 2 on:

```bash
npm run theme:build -w apps/mobile    # regenerates src/theme/generated/theme.css
git diff --exit-code apps/mobile/src/theme/generated/theme.css   # empty after a clean build
```

The contrast gate (`test/theme/contrast-gate.test.ts`) and the testID parity test run inside
`test:cov`. A failing pair or a missing identifier names the offending token or file.

## 3. First slice on a phone (phase 3 exit, SC-013)

Build a dev client against the API over the network (LAN address, or `10.0.2.2` on an emulator), never
through `adb reverse` (see `apps/mobile/e2e/offline/README.md`). Then, on **one iOS and one Android**
device, in **light and dark**:

| Scenario                                                                | Expected                                                                                                                                |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Open Home with no trips                                                 | Globe visible and interactive; one opaque invitation card; no header; flat tab bar at most 56 dp of content                             |
| Open Trips with a mix of past, active, planned, with and without photos | Cards show cover (photo or typographic), status chip, date range, stops and currency; pending marker where unsynced; large title on iOS |
| Open Trips while loading (fresh install, first sync)                    | Card-shaped placeholders, not blank, not "No trips yet"                                                                                 |
| Open a trip; tap Back                                                   | Header with "Back"; hero title; areas in one sideways row; stops as a timeline; Back returns to Trips                                   |
| Press and hold any button                                               | Pressed state within 100 ms; haptic on primary press; none with reduced motion on                                                       |
| Settings: largest text, then increased contrast, then reduced motion    | Every first-slice screen complete, nothing clipped, boundaries explicit, no animation                                                   |
| Toggle system dark mode with the app open                               | Header, tab bar, cards, status bar and sheets switch together                                                                           |

The traveller approves, or lists changes, before phase 4 starts.

## 4. End-to-end flows (Maestro)

```bash
npm run e2e -w apps/mobile            # runs apps/mobile/e2e/ (needs a booted device with the dev client)
```

Run after phases 3, 6 and 8. Expect: every flow passes. A flow may be edited only where the visible text
legitimately changed; each edit is listed in `tasks.md` with the reason (FR-037).

## 5. Appearance matrix (phase 8)

For each of: light, dark, increased contrast (light and dark), largest text size, reduced motion, reduced
transparency (iOS), visit every route and confirm: complete, operable, nothing clipped, nothing left in the
previous theme, nothing translucent, no non-essential animation. Record any exception as a bug, never as an
accepted gap.

## 6. Accessibility spot-checks

- VoiceOver (iOS) and TalkBack (Android): trip card reads "title, status, N stops"; stop rows offer move
  up, move down, edit and remove as actions; busy and disabled states are announced; header title and Back
  are announced once.
- Screen reader order on Trips, Trip and the add-trip sheet matches visual order.
- Switch access or a keyboard: every control reachable, visible focus ring at 3:1.

## 7. Performance and size baselines (T415, T461)

Before screens move, record: scroll frame rate for a 200-trip list and a 1,000-row expense list on the
oldest supported test device; release JS bundle size; font asset size. After phase 8, repeat and compare:
no measurable frame-rate regression (SC-006); bundle delta reported, over 1 MB reviewed (SC-011).

## 8. Offline-synchronisation gate (release, SC-010)

Re-run the 15 phases in `apps/mobile/e2e/offline/README.md` on two real devices and record the result in
`apps/mobile/e2e/offline/gate-evidence.md`. Nothing counts as passing until that record exists.

## 9. Retirement check (phase 7, SC-001)

```bash
grep -rniE "neumorph|surfaceStyle|PressableSurface|elevationProfile|treatment=" apps/mobile/src
# expected: no output
```

`surfaces.ts`, `elevation-profile.ts`, `use-surface.ts`, `surface.tsx`, `pressable-surface.tsx`,
`text-field.tsx` and `pill-group.tsx` are gone, and the word "neumorphic" remains only under
`specs/002-neumorphic-ui/` and in git history.
