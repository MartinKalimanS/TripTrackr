# Implementation Plan: App UI Redesign ("Atlas")

**Branch**: `feat/004-app-ui-redesign` | **Date**: 2026-10-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-app-ui-redesign/spec.md`

## Summary

Replace the neumorphic identity with **Atlas**: a calm, content-first travel journal with native
navigation chrome, grouped lists, photo-forward trip cards, one accent and a display face for titles and
figures. The globe is untouched; only the cards floating over it change.

The approach has four moves, each de-risked by an earlier one:

1. **Spike first.** A time-boxed on-device spike (T401 to T409) proves that HeroUI Native on Uniwind
   fits this repository (Sentry-wrapped Metro, React Compiler, Jest, test identifiers, touch targets,
   reduced motion, "Back" for the Maestro flows). It is a go/no-go gate; on no-go the same adapters are
   built on React Native primitives with the same tokens (research D4-02).
2. **One token source.** `palette.ts` feeds `Colors`, a generated theme stylesheet for the kit, and the
   extended contrast gate. `Colors` is re-pointed first so unconverted screens are already on-palette
   (D4-04, D4-12).
3. **An adapter layer.** Screens use only `src/components/ui/*`; only that folder imports the kit; the
   adapters keep this app's own API and accessibility guarantees (D4-03).
4. **Migrate by area, delete last.** Home, Trips and Trip first, reviewed on a phone; forms, everyday
   screens, sign-in and Profile after; the neumorphic code is removed in the final phase (D4-12).

Nothing touches the API, the wire contracts, the local schema, sync or any privacy surface.

## Technical Context

**Language/Version**: TypeScript ~6.0.3, React 19.2.3, React Native 0.86.3 (New Architecture), Expo SDK
~57.0, `expo-router` ~57.0 (typed routes), React Compiler enabled.

**Primary Dependencies (existing)**: `@rnmapbox/maps`, `expo-symbols`, `expo-image`, `expo-font`,
`@shopify/flash-list`, `react-native-reanimated` 4.5.1, `react-native-worklets` 0.10.1,
`react-native-gesture-handler`, `react-native-safe-area-context`, `react-native-screens`,
`react-native-keyboard-controller`, `react-hook-form`.

**New Dependencies (pinned, installed only in T401)**: `heroui-native` 1.0.10, `uniwind` 1.12.0,
`tailwindcss` 4.3.3, `tailwind-variants` 3.3.1, `tailwind-merge` 3.7.0, `react-native-svg` 15.15.4,
`expo-blur` ~57.0.3, `expo-haptics` ~57.0.3, one `@expo-google-fonts/*` display face (research D4-14).

**Storage**: none added. The trip cover (data-model §4) is derived from local rows.

**Testing**: Jest (`jest-expo`) with `@testing-library/react-native`; the 80% floor already in
`apps/mobile/jest.config.js`; Maestro flows under `apps/mobile/e2e/`; a manual on-device review per
phase.

**Target Platform**: iOS and Android dev-client builds. No web (001 D-14). Portrait phones.

**Project Type**: Mobile application, the `apps/mobile` workspace of the npm-workspaces monorepo.

**Performance Goals**: press feedback within 100 ms and in-place transitions within 200 ms (SC-005); no
scroll regression on a 200-trip list or a 1,000-row expense list against a baseline captured in T415
(SC-006); added bundle weight measured and reported, over 1 MB triggers review (SC-011).

**Constraints**: WCAG AA floor (4.5:1 text, 3:1 controls and focus), 7:1 text under increased contrast;
largest text size without clipping; no state by colour alone; pending-sync marker; every pre-existing
control keeps its accessible name and test identifier (FR-037); no raw colour literals (extended to
Tailwind arbitrary-value colours); offline-first, so fonts are bundled and nothing is fetched at runtime;
quality bar (functions under 50 lines, files under 800, nesting under 4, no debug output).

**Scale/Scope**: about 20 routes (3 auth, 3 tabs, 8 trip screens, 2 modals, not-found, root), about 60
components, 108 test files of which 23 touch the neumorphic primitives, about 229 `testID`s, about 491
Maestro `id:` references.

## Constitution Check

_GATE: passed before Phase 0; re-checked after Phase 1 design._

| Principle                     | Posture                                                                                                                                                                                                                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Privacy is structural      | No table, endpoint or screen reads traveller data in a new way. The trip cover reads the signed-in traveller's own local photo thumbnail for display and transmits nothing. **Visibility posture: private, local, never transmitted.** `expenses` and `documents` gain no visibility flag and no public-read policy.  |
| II. Offline is the default    | No network call is added. Fonts, icons and the kit are bundled. The pending-synchronisation marker is retained and restyled (FR-034). Reduced motion removes animation without removing state.                                                                                                                        |
| III. Test-first, 80%          | Every task writes its failing test first; the contrast gate is extended _before_ the tokens change; coverage is unchanged at 80% in every workspace; the privacy suite is untouched.                                                                                                                                  |
| IV. Verify before you render  | The palette was measured (research D4-01). The kit is gated by an on-device spike and its unknowns are listed as checks, not assumed (research, "Items to verify empirically").                                                                                                                                       |
| V. Nothing held hostage       | Not affected: no gating, retention or deletion behaviour changes.                                                                                                                                                                                                                                                     |
| Offline-sync gate (AGENTS.md) | Not a social or sharing feature, so it does not advance. It is re-run before release because this feature touches the screens the 15 offline Maestro phases drive (SC-010).                                                                                                                                           |
| Security review               | Not required for the feature as a whole (no auth logic, input handling, query, file handling, external call or cryptography changes). Sign-in and Create account change presentation only; T447 is a light review that `secureTextEntry`, `textContentType`, `autoComplete`, error mapping and logging are unchanged. |
| Expo version discipline       | Every Expo API above was read from the versioned v57 documentation or the named package's page; `NativeTabs`, `formSheet` and header options come from the Router docs.                                                                                                                                               |
| Dependency hygiene            | Exact pins, at least 7 days old, installed once at the root with the lockfile committed, install scripts reviewed (research D4-14).                                                                                                                                                                                   |
| Quality bar                   | Adapters are thin and split by concern so each file stays far below 800 lines; screens shrink as hand-written style objects move into adapters.                                                                                                                                                                       |

**Result: PASS, no violations; the Complexity Tracking table stays empty.**

### Post-Phase-1 re-evaluation

Re-checked after `data-model.md`, `contracts/` and `quickstart.md` were written. Still PASS, with two
observations recorded rather than waived:

1. A second styling paradigm (Tailwind classes beside `StyleSheet`) is accepted _only_ behind the
   adapter boundary and the lint rules in `contracts/components.md`; it is the main reason the spike and
   the fallback exist.
2. The 80% floor is easily reached by adapter unit tests while the real risk (how screens look and feel
   on a device in daylight) is untested by Jest. The on-phone review (T423), the Maestro runs and SC-009
   therefore stay first-class tasks and are not substituted by coverage.

## Project Structure

### Documentation (this feature)

```text
specs/004-app-ui-redesign/
├── spec.md                    # /speckit-specify output
├── plan.md                    # This file
├── research.md                # Phase 0: D4-01 to D4-15 and the spike checklist
├── data-model.md              # Phase 1: Palette, Theme, Type scale, TripCover (no schema change)
├── quickstart.md              # Phase 1: how to run the spike, gates and reviews
├── contracts/
│   ├── design-tokens.md       # C4-1 to C4-5
│   ├── components.md          # C4-6 to C4-9 (the adapter layer)
│   └── screens.md             # C4-10 to C4-11 (screen obligations and blueprint)
├── checklists/
│   └── requirements.md        # Spec quality checklist
└── tasks.md                   # /speckit-tasks output
```

### Source Code (`apps/mobile/`) — what changes

```text
apps/mobile/
├── metro.config.js                         # EDIT  Uniwind outermost over Sentry; extraThemes
├── jest.config.js  jest.setup.ts           # EDIT  transformIgnorePatterns, mocks, kit stand-in
├── tsconfig.json                           # EDIT  include src/uniwind-types.d.ts
├── eslint.config.js                        # EDIT  class-colour rule, import boundary
├── app.config.ts                           # EDIT  expo-font plugin for the display face
├── scripts/build-theme-css.mjs             # NEW   palette.ts -> src/theme/generated/theme.css
├── assets/fonts/                           # NEW   display face, two weights
├── src/
│   ├── global.css                          # NEW   tailwind, uniwind, kit styles, generated theme, @theme
│   ├── uniwind-types.d.ts                  # NEW   generated by the Metro run
│   ├── theme/
│   │   ├── palette.ts                      # NEW   authoritative colours, four themes
│   │   ├── generated/theme.css             # NEW   generated, committed, sync-tested
│   │   ├── contrast.ts                     # EDIT  + blend()
│   │   ├── typography.ts  motion.ts        # NEW   type scale and timings
│   │   ├── accessibility.ts  ink.ts        # KEPT  appearance signals; ink promotion
│   │   ├── surfaces.ts  elevation-profile.ts   # DELETE in phase 7 (forced flat before)
│   │   └── index.ts                        # EDIT
│   ├── constants/theme.ts                  # EDIT  Colors from palette; delete Depth, LightSource, shadow tokens last
│   ├── hooks/
│   │   ├── use-appearance.ts               # EDIT  four themes; no elevation profile (phase 7)
│   │   ├── use-haptics.ts                  # NEW
│   │   └── use-surface.ts                  # DELETE in phase 7
│   ├── components/
│   │   ├── ui/                             # the adapter layer (only place that imports heroui-native)
│   │   │   ├── screen.tsx  list-screen.tsx # EDIT
│   │   │   ├── text.tsx                    # NEW   roles; themed-text.tsx becomes a shim
│   │   │   ├── button.tsx  tappable.tsx    # NEW
│   │   │   ├── card.tsx  panel.tsx         # NEW   replaces surface.tsx
│   │   │   ├── list-group.tsx              # NEW   ListGroup, ListRow
│   │   │   ├── field.tsx                   # NEW   replaces text-field.tsx
│   │   │   ├── chip.tsx                    # NEW   Chip, StatusChip, ChipGroup (replaces pill-group.tsx)
│   │   │   ├── sync-badge.tsx              # EDIT
│   │   │   ├── state-view.tsx              # EDIT  Skeleton, Alert, Spinner
│   │   │   ├── form-actions.tsx            # EDIT
│   │   │   ├── icon.tsx  avatar.tsx        # NEW
│   │   │   ├── header-back-button.tsx      # NEW
│   │   │   ├── media-frame.tsx             # KEPT (hairline boundary around photos)
│   │   │   └── pressable-surface.tsx  surface.tsx  text-field.tsx  pill-group.tsx   # DELETE in phase 7
│   │   ├── navigation/tab-bar.tsx          # RENAMED from neumorphic-tab-bar.tsx
│   │   ├── globe/                          # stats-overlay.tsx, empty-state.tsx restyled; all other files untouched
│   │   └── trip/                           # trip-card, stop-row, expense-row, note-card, ... restyled onto adapters
│   ├── app/
│   │   ├── _layout.tsx                     # EDIT  provider, theme effect, global.css import
│   │   ├── (tabs)/trips/_layout.tsx  index.tsx      # MOVED from trips.tsx
│   │   ├── (tabs)/profile/_layout.tsx  index.tsx    # MOVED from profile.tsx
│   │   ├── trip/[id]/_layout.tsx           # EDIT  native headers
│   │   └── modal/_layout.tsx               # EDIT  formSheet
│   ├── db/repositories/photos.ts           # EDIT  earliest-photo-per-trip read (T419)
│   └── features/trips/use-trips.ts         # EDIT  cover and date range
└── test/                                   # adapter contracts, palette, theme CSS sync, testID parity
```

**Structure Decision**: extend the existing layout rather than add a parallel design system. The one new
concept is the **adapter boundary** `src/components/ui/`, which already exists and already holds the
primitives; it keeps its location and gains kit-backed implementations. Tests mirror the source tree
under `apps/mobile/test/` and co-located `*.test.tsx`, matching the `testMatch` already configured.

## Decisions

The decisions are in [research.md](./research.md): D4-01 direction; D4-02 kit and spike; D4-03 adapter
layer; D4-04 token source; D4-05 themes, motion, transparency; D4-06 navigation chrome; D4-07
typography; D4-08 icons; D4-09 trip cover; D4-10 haptics; D4-11 overlays; D4-12 migration; D4-13 Jest;
D4-14 dependencies; D4-15 amendments.

## Phasing

| Phase | Name                                          | Stories  | Exit gate                                                        |
| ----- | --------------------------------------------- | -------- | ---------------------------------------------------------------- |
| 0     | Prerequisite: land 003, branch                | none     | working tree clean on a new branch; pre-004 tag created          |
| 1     | Spike                                         | none     | go/no-go recorded in research.md; fallback chosen if no-go       |
| 2     | Foundation: tokens, adapters, lint, baselines | none     | gates green; `Colors` re-pointed; no screen moved                |
| 3     | First slice: Home, Trips, Trip                | US1, US2 | on-phone sign-off (SC-013)                                       |
| 4     | Forms and sheets                              | US3      | all forms pass the keyboard test; Maestro 01 and 02 pass         |
| 5     | Everyday screens                              | US4      | five areas have all four states; Maestro 02 and 05 pass          |
| 6     | First impression and profile                  | US6      | auth flows pass; sign-out guard intact                           |
| 7     | Retire neumorphism                            | all      | SC-001 search is empty; gates green                              |
| 8     | Polish and release gates                      | US5, US7 | accessibility sweep, baselines, two-device offline gate (SC-010) |

## Complexity Tracking

> No constitutional violations were identified, so no justifications are required.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| _(none)_  | —          | —                                    |
