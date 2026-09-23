---
description: 'Task list for Neumorphic Visual Identity'
---

# Tasks: Neumorphic Visual Identity

> **Status note (2026-09-23).** The repository was restructured into an npm-workspaces monorepo
> and the create-expo-app template was removed before the first product screen (feature 001,
> research D-13, D-14, D-17; tasks R001, R008, R009). Consequences for this feature:
>
> - **Retained**: the token layer (`apps/mobile/src/theme/`, `apps/mobile/src/constants/theme.ts`),
>   the primitives (`apps/mobile/src/components/ui/` — `surface`, `pressable-surface`, `text-field`,
>   `sync-badge`, `media-frame`, `state-view`), `themed-view`/`themed-text`, the hooks
>   (`use-appearance`, `use-surface`, `use-color-scheme`), the contrast gate and the theme test
>   suites under `apps/mobile/test/theme/`. Every path below has been rewritten to its
>   `apps/mobile/` location.
> - **Superseded**: the restyled template screens (`index.tsx` "Welcome to Expo", `explore.tsx`),
>   the template components they used (`collapsible.tsx`, `hint-row.tsx`, `app-tabs*.tsx`,
>   `external-link.tsx`, `web-badge.tsx`), the `use-theme` hook (no consumer remained), and the
>   tests that rendered them (`test/app/*` — action parity, large text, the screen tests) were
>   deleted with the template. T025, T026, T027, and T059 are marked `superseded` below rather than
>   unticked: the work was done, and the treatment now applies to the real screens as feature 001
>   lands (contract C13 binds every new screen).
> - **Tab bar**: `expo-router/unstable-native-tabs` (`app-tabs.tsx`) is replaced by the stable
>   `Tabs` navigator with a custom bar composed from `PressableSurface` — new task **T076**, which
>   another agent is implementing now (001 research D-17, task R009).
> - **Web target removed** (001 research D-14): `react-native-web`, `react-dom`, every `*.web.tsx`
>   and `global.css` are gone; T003 and research R-008.2 are recorded as moot, not deleted.

**Input**: Design documents from `/specs/002-neumorphic-ui/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: **MANDATORY, not optional.** Constitution Principle III requires test-first development
(red → green → refactor) and an 80% coverage floor, already enforced in `apps/mobile/jest.config.js`. Every test
task below must be written and observed failing before its implementation task begins.

**Organization**: Grouped by user story so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US6)
- Exact file paths included in every task

## Path Conventions

Mobile app — the `apps/mobile` workspace of the monorepo (001 research D-13). Source under
`apps/mobile/src/`, tests under `apps/mobile/test/` and co-located `*.test.tsx`, E2E under
`apps/mobile/e2e/`, per-app config (`jest.config.js`, `eslint.config.js`, `metro.config.js`,
`tsconfig.json`) in `apps/mobile/`. Paths follow the structure decided in [plan.md](./plan.md).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Resolve the three empirical unknowns and put guardrails in place _before_ any token
value is authored. Every task here is cheap; skipping them makes later work expensive.

- [x] T001 Verify `boxShadow` `offsetY` sign convention on a real iOS and a real Android device by rendering a temporary two-shadow surface in `apps/mobile/src/app/index.tsx`; record the confirmed convention in `specs/002-neumorphic-ui/research.md` under R-008.1 and revert the temporary render
- [ ] T002 [P] Capture the pre-change scroll frame-rate baseline on the oldest supported Android device and record it in `specs/002-neumorphic-ui/research.md` under R-008.3
- [x] T003 [P] Verify whether `react-native-web@~0.21.0` renders composed and inset `boxShadow` by running `npm run web`; record the outcome in `specs/002-neumorphic-ui/research.md` under R-008.2 — _moot since 2026-09-23: the web target was removed (001 research D-14); the finding stands as history_
- [x] T004 [P] Add a lint rule to `apps/mobile/eslint.config.js` rejecting raw colour literals in `apps/mobile/src/app/` and `apps/mobile/src/components/` (contract C1)
- [x] T005 Create the token layer directory `apps/mobile/src/theme/` with an empty `index.ts` barrel, and the test directory `apps/mobile/test/theme/`

**⚠️ T001 blocks Phase 2.** If the sign convention is inverted from the assumption in
`data-model.md` §1.4, every shadow offset in the token set must be authored with flipped signs.
Discovering this after the ramp is written means redoing all of it.

**Checkpoint**: Unknowns resolved, guardrails in place, palette signs confirmed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The token system and resolvers every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests (write first, observe failing)

- [x] T006 [P] Write failing unit tests for `relativeLuminance` and `contrastRatio` in `apps/mobile/test/theme/contrast.test.ts` — WCAG formula, sRGB threshold at 0.04045, symmetry, range [1,21] (contract C2)
- [x] T007 [P] Write failing unit tests for `resolveElevationProfile` in `apps/mobile/test/theme/elevation-profile.test.ts` covering iOS, Android API 29+/28/≤27, unknown platform, and `prefersMoreContrast` override (contract C5, data-model §3)
- [x] T008 [P] Write failing unit tests for the appearance resolver in `apps/mobile/test/theme/appearance.test.ts` asserting the per-platform mapping — iOS `isDarkerSystemColorsEnabled` vs Android `isHighTextContrastEnabled`, and `prefersLessTransparency` structurally `false` on Android (contract C4, research R-003)

### Implementation

- [x] T009 Implement `relativeLuminance` and `contrastRatio` as pure functions in `apps/mobile/src/theme/contrast.ts` (contract C2)
- [x] T010 Extend `Colors` in `apps/mobile/src/constants/theme.ts` with the light and dark surface ramps, ink, and border tokens from `data-model.md` §1.1–1.2, preserving the existing `ThemeColor` union
- [x] T011 [P] Add geometry tokens — `radius`, `depth`, `borderHairline`, fixed `lightSource` — to `apps/mobile/src/constants/theme.ts`, reusing the existing `Spacing` scale unchanged (data-model §1.3)
- [x] T012 Implement the raised/recessed/flat/pressed `boxShadow` recipes in `apps/mobile/src/theme/surfaces.ts` using the sign convention confirmed in T001 (data-model §1.4)
- [x] T013 Implement `resolveElevationProfile` in `apps/mobile/src/theme/elevation-profile.ts` — pure, total, monotonic in capability (contract C5)
- [x] T014 Implement `useAppearance` in `apps/mobile/src/hooks/use-appearance.ts`, subscribing to every platform change event so fields update live, and falling back to the _more_ accessible value when a query is unavailable (contract C4)
- [x] T015 Extend `apps/mobile/src/hooks/use-theme.ts` to return the full `AppearanceContext` while keeping its existing call signature working for current consumers — _`use-theme.ts` was removed on 2026-09-23 along with its last consumers (001 R008); `useAppearance()` is now the single entry point (contract C4)_
- [x] T016 Implement `surfaceStyle(treatment, state, ctx)` in `apps/mobile/src/hooks/use-surface.ts` — returns plain style objects, fixed light source, exactly three depth levels (contract C6)
- [x] T017 Export the public token-layer surface from `apps/mobile/src/theme/index.ts` (contract C7)

**Checkpoint**: Token layer complete and unit-tested. User stories can now begin.

---

## Phase 3: User Story 1 - The app looks like one considered product (Priority: P1) 🎯 MVP

**Goal**: One coherent visual language across every screen — raised cards and buttons, recessed
inputs, uniform corner softness and spacing, no unstyled platform defaults anywhere.

**Independent Test**: Walk every reachable screen and confirm each surface, control, and field uses
a defined treatment, with no two screens rendering the same kind of element differently.

### Tests (write first, observe failing)

- [x] T018 [P] [US1] Write failing component tests for `<Surface>` in `apps/mobile/src/components/ui/surface.test.tsx` — renders one view (no wrapper), no border in `full` profile, adds no accessibility role or label (contract C8)
- [x] T019 [P] [US1] Write failing component tests for `<TextField>` in `apps/mobile/src/components/ui/text-field.test.tsx` — recessed treatment, `surfaceSunk` fallback in `reduced`/`flat` profiles (contract C10)

### Implementation

- [x] T020 [US1] Implement `<Surface>` in `apps/mobile/src/components/ui/surface.tsx` with `treatment`, `depth`, and composable `pending` props (contract C8)
- [x] T021 [US1] Implement `<PressableSurface>` resting appearance in `apps/mobile/src/components/ui/pressable-surface.tsx` — raised look and required `accessibilityLabel` only; press/busy/disabled states are US4 (contract C9)
- [x] T022 [US1] Implement `<TextField>` in `apps/mobile/src/components/ui/text-field.tsx` with the recessed treatment and label (contract C10)
- [x] T023 [US1] Extend `apps/mobile/src/components/themed-view.tsx` to accept a `treatment` prop, delegating to `surfaceStyle`
- [x] T024 [US1] Apply the canvas background and per-theme status bar in `apps/mobile/src/app/_layout.tsx` — _the root layout is being rewritten as a `Stack` by 001 R009; the canvas and status-bar treatment carry over into it_
- [x] ~~T025 [US1] Restyle `apps/mobile/src/app/index.tsx` onto the primitives, removing all inline appearance styles~~ superseded: template screen deleted (2026-09-23, 001 R008); the treatment applies to the real screens as feature 001 lands
- [x] ~~T026 [P] [US1] Restyle `apps/mobile/src/app/explore.tsx` onto the primitives, removing all inline appearance styles~~ superseded: template screen deleted (2026-09-23, 001 R008); the treatment applies to the real screens as feature 001 lands
- [x] ~~T027 [US1] Restyle `apps/mobile/src/components/ui/collapsible.tsx` and `apps/mobile/src/components/hint-row.tsx` onto the primitives~~ superseded: both were template components and were deleted with the template (2026-09-23, 001 R008) — `hint-row` served only the "Welcome" screen and `collapsible` only Explore; the accessibility fix recorded under quickstart.md §4 (`accessibilityRole="button"` + `expanded` state on a disclosure header) carries forward as a requirement on whichever primitive next provides a collapsible section
- [ ] T076 [US1] Build the neumorphic tab bar in `apps/mobile/src/components/navigation/neumorphic-tab-bar.tsx` from `PressableSurface` (FR-003, FR-011, FR-012) — replaces the `expo-router/unstable-native-tabs` `app-tabs.tsx`; the `(tabs)/_layout.tsx` passes it as `tabBar` to the stable `Tabs` navigator, every tab carries the defined treatment with no platform-supplied styling, the active tab is conveyed by treatment plus label and not by hue alone (FR-010), and the bar reads `useAppearance()` like every other primitive (001 research D-17, R009)

**Checkpoint**: The app has one coherent identity. This alone satisfies the original request and is
demonstrable.

---

## Phase 4: User Story 2 - Readable on a sunlit street (Priority: P2)

**Goal**: The low-contrast style never costs legibility — every text and control combination meets
its floor, and controls remain findable outdoors.

**Independent Test**: Run the contrast gate across both themes and all profiles; then locate and
operate each screen's primary action outdoors in direct sunlight without shading the screen.

### Tests (write first, observe failing)

- [x] T028 [P] [US2] Write the exhaustive contrast gate in `apps/mobile/test/theme/contrast-gate.test.ts` — every token pair against its floor per contract C3, both themes, all three profiles
- [x] T029 [P] [US2] Add the named shadow-token exemption allowlist to `apps/mobile/test/theme/contrast-gate.test.ts` as explicit entries, never as skipped assertions (contract C3)
- [x] T030 [P] [US2] Write a failing test asserting the gate is exhaustive — an unclassified token pair must fail rather than pass unnoticed (contract C3)

### Implementation

- [x] T031 [US2] Apply the compliant hairline border to interactive treatments only in `apps/mobile/src/theme/surfaces.ts`; static treatments stay borderless (research R-002)
- [x] T032 [US2] Implement the visible focus indicator meeting 3:1, distinct from press depth, in `apps/mobile/src/components/ui/pressable-surface.tsx` (FR-012)
- [x] T033 [US2] Enforce the minimum touch target independent of visible decoration size in `apps/mobile/src/components/ui/pressable-surface.tsx` (FR-011)
- [x] T034 [US2] Add non-colour state conveyance — icon, shape, or text — to `apps/mobile/src/components/ui/text-field.tsx` error state (FR-010)
- [x] T035 [US2] Verify the gate actually fails by temporarily lightening a border token in `apps/mobile/src/constants/theme.ts`, per `quickstart.md` §1; revert after confirming
- [ ] T036 [US2] Conduct outdoor daylight testing with 10 participants and record results against SC-003 in `specs/002-neumorphic-ui/quickstart.md` §6

**Checkpoint**: Legibility is a standing build gate, not a one-off audit.

---

## Phase 5: User Story 3 - The same identity after dark (Priority: P3)

**Goal**: A complete dark rendering, switching live, with no screen left half-converted.

**Independent Test**: Switch appearance on every screen while the app is open and confirm both
themes render completely with no unconverted surfaces.

### Tests (write first, observe failing)

- [x] T037 [P] [US3] Write failing tests in `apps/mobile/test/theme/appearance.test.ts` asserting a theme change re-resolves every token and emits an update to subscribers (FR-023)
- [x] T038 [P] [US3] Extend `apps/mobile/test/theme/contrast-gate.test.ts` to assert the dark ramp meets every floor independently of the light ramp

### Implementation

- [x] T039 [US3] Verify the dark shadow tones in `apps/mobile/src/theme/surfaces.ts` preserve the raised-versus-recessed distinction without harsh glow (data-model §1.1)
- [x] T040 [US3] Ensure the whole tree re-renders together on appearance change in `apps/mobile/src/hooks/use-appearance.ts`, leaving no component in the previous theme (FR-023)
- [x] T041 [US3] Update the status bar and system UI per theme in `apps/mobile/src/app/_layout.tsx`
- [x] T042 [US3] Walk every screen in both themes per `quickstart.md` §2.3 and record the sweep result

**Checkpoint**: Both themes complete.

---

## Phase 6: User Story 4 - Controls that answer to the touch (Priority: P4)

**Goal**: Depth that responds — pressed while held, busy while working, flat when unavailable.

**Independent Test**: Press and hold every kind of control; confirm each shows a distinct pressed
appearance while held, returns on release, and reads correctly when disabled or busy.

### Tests (write first, observe failing)

- [x] T043 [P] [US4] Write failing tests in `apps/mobile/src/components/ui/pressable-surface.test.tsx` for the state machine — resting → pressed → resting, and resting → busy → resting (data-model §5)
- [x] T044 [P] [US4] Write a failing test asserting transitions are discrete token swaps with no interpolation (research R-004)
- [x] T045 [P] [US4] Write failing tests asserting `disabled` is announced unavailable and `busy` is announced in-progress, and that both reject input (FR-019, FR-020)
- [x] T046 [P] [US4] Write a failing test asserting `disabled` and `busy` set together is a development error (data-model §5)

### Implementation

- [x] T047 [US4] Implement the pressed state in `apps/mobile/src/components/ui/pressable-surface.tsx` — inset treatment held for the full touch duration (FR-018)
- [x] T048 [US4] Implement `busy` and `disabled` states with their announcements in `apps/mobile/src/components/ui/pressable-surface.tsx` (FR-019, FR-020)
- [x] T049 [US4] Add the `busy` and `disabled` recipes to `apps/mobile/src/theme/surfaces.ts` (data-model §4)
- [ ] T050 [US4] Verify press response lands within the 100 ms budget on device per `quickstart.md` §2.5 (SC-005) — **Android verified 2026-08-30** (press/hold sinks, holds, rises; disabled inert; busy rejects). iOS pending: no device available.

**Checkpoint**: The depth metaphor is operable, not decorative.

---

## Phase 7: User Story 5 - Steps back when asked (Priority: P5)

**Goal**: Every accessibility setting honoured, with no capability lost under any of them.

**Independent Test**: Enable each setting in turn and confirm the interface adapts, with every
screen complete, operable, and free of clipped or overlapping content.

### Tests (write first, observe failing)

- [x] T051 [P] [US5] Write failing tests in `apps/mobile/test/theme/elevation-profile.test.ts` asserting `prefersMoreContrast` selects the `reduced` profile (research R-005)
- [x] T052 [P] [US5] Write failing tests in `apps/mobile/test/theme/contrast-gate.test.ts` asserting the 7:1 floor applies to every text pair when `prefersMoreContrast` is set (FR-013)
- [x] T053 [P] [US5] Write a failing test asserting reduced motion requires no branch because transitions are discrete (FR-015, research R-004)

### Implementation

- [x] T054 [US5] Render explicit borders and raise contrast to 7:1 under increased contrast in `apps/mobile/src/theme/surfaces.ts` (FR-013)
- [x] T055 [US5] Assert opaque surfaces under reduced transparency in `apps/mobile/src/theme/surfaces.ts`, documenting that Android satisfies FR-014 structurally (research R-003)
- [x] T056 [US5] Make all primitive layouts grow with `fontScale` rather than clipping in `apps/mobile/src/components/ui/` (FR-016)
- [x] T057 [US5] Add `apps/mobile/e2e/01-appearance.yaml` sweeping theme switching and the largest text size across the main screens (SC-008, SC-010)
- [ ] T058 [US5] Verify all four adaptations on device per `quickstart.md` §2.4, including Android 9 specifically (§2.7) — **Android partially verified 2026-08-30**: contrast, reduced motion and transparency behaved; **largest text FAILED** — text scaled but the home screen did not, because `apps/mobile/src/app/index.tsx` had no scroll container so content below the fold became unreachable (FR-016/SC-008). Fixed, with regression tests in `apps/mobile/test/app/large-text.test.tsx`. Needs an Android re-check at `font_scale 1.8`, and Android 9 plus iOS are still outstanding. _2026-09-23: the template home screen and its `large-text.test.tsx` were deleted with the template (001 R008); the lesson — every screen needs a scroll container at `fontScale` 1.8 — is carried by contract C13 §3, and the regression test is to be re-established against the first real screen feature 001 ships. The on-device verification itself stays open._
- [x] ~~T059 [US5] Confirm every action available by default remains available under each setting (Acceptance Scenario 5.4) — automated in `apps/mobile/test/app/action-parity.test.tsx` against the explicit registry in `apps/mobile/test/app/action-registry.ts`; both screens are rendered under each of the four settings and all four at once, and a rot guard asserts every registered action is present by default~~ superseded: the parity test and its registry rendered the two template screens and were deleted with them (2026-09-23, 001 R008); Acceptance Scenario 5.4 is re-verified per real screen as feature 001 lands, with the registry approach recorded in `quickstart.md` "Deferral record (T075)" as the pattern to reuse

**Checkpoint**: The style yields to the traveller's stated needs.

---

## Phase 8: User Story 6 - Photographs and the globe stay the subject (Priority: P6)

**Goal**: The style frames media; it never covers it.

**Independent Test**: Open the globe, street-level view, and a photograph on every device size and
confirm the imagery is unobscured, undimmed, and untinted while surrounding controls carry the style.

### Tests (write first, observe failing)

- [x] T060 [P] [US6] Write failing tests in `apps/mobile/src/components/ui/surface.test.tsx` asserting no shadow, tint, or overlay is applied to children marked as media content (FR-024, contract C12)
- [x] T061 [P] [US6] Write failing tests asserting controls over media render opaque with a compliant border (FR-025)

### Implementation

- [x] T062 [US6] Add a media-frame variant to `apps/mobile/src/components/ui/surface.tsx` that frames content without casting a shadow inward (contract C12)
- [x] T063 [US6] Apply the opaque bordered treatment to controls placed over map and photo content in `apps/mobile/src/components/ui/pressable-surface.tsx` (FR-025)
- [x] T064 [US6] Add a hairline boundary to images against similar-toned surfaces in `apps/mobile/src/components/ui/surface.tsx` (FR-026)
- [ ] T065 [US6] Verify on device per `quickstart.md` §2.6, including a near-white photo on a light surface — **Android verified 2026-08-30** (no shadow/tint over media; controls legible; near-white photo keeps its boundary). iOS pending: no device available.

**Checkpoint**: All six stories independently functional.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Requirements that span stories, plus the verification that cannot be automated.

- [x] T066 [P] Write failing tests for `<SyncBadge>` in `apps/mobile/src/components/ui/sync-badge.test.tsx` — state conveyed by icon and text, not hue; announced with a text equivalent (contract C11, FR-007)
- [x] T067 Implement `<SyncBadge>` in `apps/mobile/src/components/ui/sync-badge.tsx`, reflecting caller-supplied state and querying nothing (contract C11, Principle II)
- [x] T068 [P] Add the `pending` treatment recipe to `apps/mobile/src/theme/surfaces.ts`, composing with `raised` and `flat` rather than replacing them (data-model §4)
- [x] T069 [P] Define empty, loading, and error presentations for every screen in `apps/mobile/src/app/` to the same standard as populated states (FR-027)
- [ ] T070 Diff screen-reader output before and after the change on every screen using VoiceOver and TalkBack; confirm no difference (FR-017, SC-009)
- [ ] T071 Re-measure scroll frame rate on the oldest supported device and compare against the T002 baseline; if regressed, drop that context to the `flat` profile in `apps/mobile/src/theme/elevation-profile.ts` rather than hand-optimising components (SC-006)
- [ ] T072 [P] Conduct the tappability study — 95% of first-time viewers identifying tappable elements from a still image — and record against SC-004
- [ ] T073 [P] Measure task-completion times for creating a trip, adding an expense, and writing a note against the pre-change build (SC-007)
- [x] T074 Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run test:cov`; confirm all pass with coverage ≥ 80%
- [x] T075 Complete the full `quickstart.md` definition-of-done checklist and record any deferred items explicitly

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies. **T001 blocks Phase 2** — the sign convention determines every shadow token.
- **Foundational (Phase 2)**: Depends on Setup. **Blocks all user stories.**
- **User Stories (Phases 3–8)**: All depend on Foundational.
- **Polish (Phase 9)**: Depends on all desired stories being complete.

### User Story Dependencies

- **US1 (P1)**: Depends only on Foundational. Delivers the MVP. T076 (added 2026-09-23) additionally depends on US4's `<PressableSurface>` state machine (T047, T048) and on feature 001 R009 — the `(tabs)` layout it is mounted in.
- **US2 (P2)**: Depends on Foundational. Modifies `surfaces.ts` and `pressable-surface.tsx`, so it conflicts with US1 on those files — sequence after US1 rather than alongside it.
- **US3 (P3)**: Depends on Foundational. Independent of US2.
- **US4 (P4)**: Depends on US1 (extends `<PressableSurface>` from resting appearance into the full state machine).
- **US5 (P5)**: Depends on US2 (the 7:1 contrast requirement builds on the gate US2 establishes).
- **US6 (P6)**: Depends on Foundational. Independent of US2–US5.

### Within Each User Story

- Tests MUST be written and observed failing before implementation (Constitution III).
- Tokens before recipes; recipes before components; components before screens.
- Story complete and checkpointed before moving to the next priority.

### Parallel Opportunities

- T002, T003, T004 run in parallel during Setup (T001 does not — it gates the phase).
- T006, T007, T008 — all Foundational tests — run in parallel.
- T018, T019 run in parallel; T028, T029, T030 run in parallel.
- US3 and US6 can proceed in parallel with each other once Foundational is done.
- US2 and US4 both touch `pressable-surface.tsx` — do not parallelise them.

---

## Parallel Example: Phase 2 Foundational

```bash
# Launch the three foundational test suites together:
Task: "Write failing unit tests for contrast functions in apps/mobile/test/theme/contrast.test.ts"
Task: "Write failing unit tests for resolveElevationProfile in apps/mobile/test/theme/elevation-profile.test.ts"
Task: "Write failing unit tests for the appearance resolver in apps/mobile/test/theme/appearance.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1 — **especially T001**, which is two minutes and prevents authoring every shadow backwards.
2. Complete Phase 2 Foundational.
3. Complete Phase 3 (US1).
4. **STOP and VALIDATE**: the app has one coherent identity. This is what was originally asked for.
5. Demo.

### Incremental Delivery

1. Setup + Foundational → token layer ready.
2. US1 → coherent identity → **MVP demo**.
3. US2 → legibility becomes a standing gate → demo.
4. US3 → dark mode complete → demo.
5. US4 → tactile feedback → demo.
6. US5 → accessibility adaptations → demo.
7. US6 → media surfaces protected → demo.

### Sequencing note

This feature does **not** advance the constitutional offline-sync gate. Shipping a visual identity
must not be read as clearing the prerequisite for social and sharing features.

---

## Notes

- **The unresolved palette decision**: every ratio in `data-model.md` derives from canvas `#E3E8EF` (light) and `#23272F` (dark). Changing the base tone before T010 is free; changing it after T028 means re-measuring the whole table and rewriting the gate fixtures.
- Coverage percentage is not a proxy for this feature's real risk. The token layer is pure and trivially coverable; SC-003, SC-004, and SC-007 (T036, T072, T073) are the criteria that actually test whether the style works in a traveller's hand, and no unit test substitutes for them.
- `expo-glass-effect` remains installed and unused by design (research R-007); its removal is deliberately not part of this feature.
- Commit after each task or logical group. Stop at any checkpoint to validate a story independently.

---

## Implementation Status (2026-08-29)

**61 of 75 tasks complete.** 151 tests passing across 19 suites; `npm run lint` clean;
`npx tsc --noEmit` reports zero errors in `apps/mobile/src/` and `apps/mobile/test/`.

### T001 resolved from source rather than on a device

The documentation page claims positive `offsetY` means _up_. It is wrong. Both native
implementations offset in a y-down space — iOS `RCTBoxShadow.mm:82`
(`CGRectOffset(shadowRect, shadow.offsetX, shadow.offsetY)`) and Android
`OutsetBoxShadowDrawable.kt:100` (`offset(offsetX.dpToPx(), offsetY.dpToPx())`). **Positive
`offsetY` is DOWN, matching CSS**, so the assumption in `data-model.md` §1.4 held and no sign
flip was needed. Recorded in `research.md` R-008.1.

### Two defects the contrast gate caught during implementation

1. **`border` vs `surfaceSunk` measured 2.95:1** — below the 3:1 floor. Planning had measured the
   border against the canvas only, not against the sunken fill. Light `border` retuned
   `#79838F` → `#767F8C` (3.29 canvas / 3.11 sunk) and `borderStrong` `#6F7885` → `#6A737F`.
2. **`linkPrimary: '#3c87f7'`**, hardcoded in `themed-text.tsx`, measured **2.84:1** on the new
   canvas. Now resolved from the `accent` token.

Neither would have been found by inspection. Both were found because the gate is exhaustive over
the token set rather than sampling it.

### Coverage: 75.26% against the constitutional 80% floor — NOT met

| Area                                                     | Statements |
| -------------------------------------------------------- | ---------- |
| `apps/mobile/src/theme/` (this feature)                  | **97.97%** |
| `apps/mobile/src/components/ui/` (this feature)          | **94.11%** |
| `apps/mobile/src/constants/`                             | **100%**   |
| `apps/mobile/src/hooks/`                                 | 79.48%     |
| `apps/mobile/src/components/` (incl. untouched scaffold) | 35.84%     |
| `apps/mobile/src/app/`                                   | 27.27%     |
| `apps/mobile/src/lib/sentry.ts` (untouched)              | 0%         |

The floor was **already failing before this feature**: no test files existed at HEAD
(`git ls-tree -r HEAD` returns none), so the baseline was effectively 0%. This work took it to
75.26%. The residual gap is concentrated in pre-existing untested scaffold — `lib/sentry.ts`,
`app-tabs.tsx`, `app-tabs.web.tsx`, `external-link.tsx`, `web-badge.tsx`,
`use-color-scheme.web.ts` — none of which this feature authored or modified.

**The threshold was deliberately NOT lowered.** Editing the gate to make it pass would defeat its
purpose. Closing the remaining ~5% requires testing scaffold outside this feature's scope, and is
a separate piece of work.

### Known blocker: `apps/mobile/src/app/explore.tsx` cannot be unit-tested

`expo-router` fails to transform under Jest ("Cannot use import statement outside a module" from
`expo-router/src/standard-navigation/index.tsx`), so any suite importing `external-link.tsx`
fails at require time. Adding `expo-router` to `transformIgnorePatterns` did not fix it; the
speculative change was reverted rather than left in place. This is a pre-existing harness gap,
unrelated to this feature, and it also caps `apps/mobile/src/app/` coverage.

### Harness fixes made along the way

- `apps/mobile/jest.config.js` was missing the `@/assets/*` → `<rootDir>/assets/*` mapping that
  `apps/mobile/tsconfig.json` defines, so any component importing an image failed to resolve. Added, ordered
  before the general `@/*` rule.
- `apps/mobile/jest.setup.ts` gained minimal stubs for `react-native-reanimated` and `react-native-worklets`.
  The library's own `mock.js` re-imports the real entry point and so still hits the missing native
  runtime. The stubs cover only what this codebase uses.
- **React Native Testing Library 14 with React 19 made `render`, `fireEvent`, `renderHook`, and
  `unmount` asynchronous, and removed every `UNSAFE_*` query.** All suites `await` them.

### Remaining 14 tasks — all require a physical device or human participants

| Task                   | Needs                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------- |
| T002, T071             | Scroll frame-rate baseline and comparison on the oldest supported Android device   |
| T003                   | `npm run web` to confirm whether `react-native-web` renders composed/inset shadows |
| T036                   | Outdoor daylight study, 10 participants (SC-003)                                   |
| T042, T058, T059, T065 | On-device sweeps: theme switch while running, four adaptations, Android 9, media   |
| T050                   | 100 ms press-response measurement on device (SC-005)                               |
| T070                   | VoiceOver/TalkBack output diffed before and after (SC-009)                         |
| T072                   | Tappability study (SC-004)                                                         |
| T073                   | Task-completion timings (SC-007)                                                   |
| T074                   | Blocked on the coverage floor above                                                |
| T075                   | Blocked on the above                                                               |

These are exactly the criteria `quickstart.md` §6 flags as unautomatable. A green test run is
necessary but not sufficient: nothing here proves how the style reads in daylight, which is the
risk this feature carries most.

---

## Implementation Status — update 2026-08-29 (second pass)

**62 of 75 complete.** 171 tests across 24 suites; lint clean; zero type errors in `apps/mobile/src/`/`apps/mobile/test/`.

### T003 resolved from source, like T001 — no browser needed

`react-native-web@0.21` supports both composed and inset shadows
(`preprocess.js:167-172` and `:67`). Web now resolves to the **`full`** profile instead of
degrading to `flat`; only genuinely unrecognised platforms fall back. `elevation-profile.ts` and
its suite updated. Recorded in `research.md` R-008.2.

### A real half-converted surface, found and fixed

`apps/mobile/src/components/app-tabs.tsx` was still painting the **legacy `background` token (white)** while
every screen had moved to the neumorphic canvas — visible as a white tab bar against grey content.
This is precisely the artefact FR-023 and User Story 3 exist to prevent, and it was invisible to
the token tests because the tab bar reads `Colors` directly rather than going through a treatment.
Both `app-tabs.tsx` (native) and `app-tabs.web.tsx` (web) now use `canvas`/`surfaceSunk`/
`textPrimary`, with the web tab buttons expressed as `raised`/`recessed` treatments.

### Bundle fix: test files must not live in `apps/mobile/src/app/`

expo-router globs **every** file under `apps/mobile/src/app/` as a route, so a colocated `index.test.tsx` was
bundled into the app and dragged `@testing-library/react-native` — and through it Node's
`console` — into the native runtime, failing the Android build. The test moved to `apps/mobile/test/app/`, and
`apps/mobile/metro.config.js` now carries a `blockList` for `*.test.*` / `*.spec.*` merged onto the existing
Expo/Sentry exclusions, so the mistake cannot recur anywhere in the tree.

### Coverage: statements and lines now clear 80%; branches and functions do not

| Metric     | Value      | Floor  |
| ---------- | ---------- | ------ |
| Statements | **81.4%**  | 80% ✅ |
| Lines      | **80.38%** | 80% ✅ |
| Branches   | 78.47%     | 80% ❌ |
| Functions  | 73.17%     | 80% ❌ |

Raised from 0% at HEAD → 54% → 75% → **81.4%** by covering `lib/sentry.ts` (100%),
`web-badge.tsx`, both `use-color-scheme` entry points, and the remaining branch paths in this
feature's own modules. `apps/mobile/src/theme/` sits at 98%, `apps/mobile/src/components/ui/` at 94%.

**The remaining shortfall is concentrated in five files that cannot be imported under Jest at
all**: `apps/mobile/src/app/explore.tsx`, `apps/mobile/src/app/_layout.tsx`, `apps/mobile/src/components/app-tabs.tsx`,
`apps/mobile/src/components/app-tabs.web.tsx`, and `apps/mobile/src/components/external-link.tsx`. Every one of them
imports `expo-router`, which fails to transform ("Cannot use import statement outside a module"
from `expo-router/src/standard-navigation/index.tsx`). Adding `expo-router` to
`transformIgnorePatterns` did not fix it and the speculative change was reverted.

**Contributing root cause found: the project has no `babel.config.js`.** Expo projects normally
require one (`babel-preset-expo`). Adding it is a project-wide change with bundle implications and
is deliberately NOT being made as a side effect of a styling feature — it warrants its own change
and its own verification. Until then T074 stays open, and **the threshold has not been lowered**:
editing the gate to make it pass would defeat it.

### Remaining 13 tasks

All require a physical device or human participants — T002, T036, T042, T050, T058, T059, T065,
T070, T071, T072, T073 — plus T074 (blocked on the coverage floor above) and T075 (blocked on
T074). These are exactly the criteria `quickstart.md` §6 lists as unautomatable.

---

## Implementation Status — update 2026-08-29 (third pass)

**64 of 75 complete.** 179 tests / 28 suites; lint exit 0; zero type errors; **all four coverage
thresholds pass**.

### Correction to the previous status note

The earlier entry claimed the missing `babel.config.js` was the root cause of the expo-router
transform failure. **That was wrong.** `jest-expo`'s preset supplies `babel-preset-expo` directly
through its `transform` entry, so no project babel config is required and adding one would not have
helped.

The actual cause was a different package entirely: **`node_modules/standard-navigation`**, an
ESM-only transitive dependency of expo-router, was absent from `transformIgnorePatterns`. The error
message pointed at `expo-router/src/standard-navigation/index.tsx`, which made it look like
expo-router's own source was the problem — the real culprit only appeared in the "Details" section
of the full (non-`--silent`) Jest output. Adding `standard-navigation` and `expo-router` to the
allowlist fixed it, and `apps/mobile/jest.config.js` now carries a comment saying so.

This unblocked five previously untestable files: `app/explore.tsx`, `app/_layout.tsx`,
`components/app-tabs.tsx`, `components/app-tabs.web.tsx`, `components/external-link.tsx`.

### A contract violation found while covering them

Rendering `CustomTabList` showed `ThemedView treatment="raised"` emitting
`borderWidth: 0.5, borderColor: #767F8C` — a visible outline on a **static** surface, which
contract C8 and research R-002 explicitly forbid. Cause: `surfaceStyle` inferred `interactive` from
the treatment name when the caller did not pass it, and `raised` was in that set. `<Surface>`
defaults `interactive` to `false` so it was unaffected, but `<ThemedView>` passed nothing and got a
border on every raised panel.

`interactive` now **defaults to `false`** and the name-based inference is gone. It cannot be
inferred: `raised` describes a card as often as a button, and guessing wrong outlines every static
panel — the opposite of the effect the style exists to produce. Controls opt in explicitly, which
`<PressableSurface>` and `<TextField>` already did.

### T074 — PASSES

| Gate               | Result                                                 |
| ------------------ | ------------------------------------------------------ |
| `npm run lint`     | exit 0                                                 |
| `npx tsc --noEmit` | 0 errors in `apps/mobile/src/` and `apps/mobile/test/` |
| `npm test`         | 179 passed, 28 suites                                  |
| Statements         | **86.92%** ≥ 80%                                       |
| Branches           | **82.88%** ≥ 80%                                       |
| Functions          | **80.48%** ≥ 80%                                       |
| Lines              | **86.43%** ≥ 80%                                       |

From ~0% at HEAD → 54% → 75% → 81% → **86.92%**. The threshold was never lowered.

### T075 — deferral recorded in `quickstart.md`

Definition-of-done updated: three items verified and ticked, nine deferred with the reason stated.

**One deferral has degraded and is flagged rather than glossed:** T002 required a scroll frame-rate
baseline captured _before_ the styling landed. It was not captured, and the styling has landed.
SC-006 is a _regression_ criterion, so on this build it can no longer be measured as written. Either
measure against a `git stash` of the pre-change tree, or restate SC-006 as an absolute frame-rate
floor. That is the criterion owner's call, not something to redefine silently.

### Remaining 11 tasks

T002, T036, T042, T050, T058, T059, T065, T070, T071, T072, T073 — every one needs a physical
device, an assistive technology, or human participants. There is no automatable work left in this
feature.

---

## Device verification — 2026-08-29, Galaxy S23 (SM-S911B), Android 16 / API 36

Device reached over adb; app running under **Expo Go**, so the elevation profile is `full`
(API 36 ≥ 29). Screenshots captured and inspected.

### T042 — COMPLETE, PASS

Light and dark both render completely, and the theme switched **while the app was running** with no
relaunch — Acceptance Scenario 3.2 satisfied. Canvas, card, code chips, button, and tab bar all
converted together; nothing was left in the previous theme. The tab-bar fix made earlier in the day
is visible and correct.

**This also settles R-008.1 empirically.** The raised card shows its light shadow up-left and its
dark shadow down-right, and reads unmistakably as raised. The CSS sign convention was right and the
`BoxShadowValue` documentation is wrong.

### T058 — a real defect found and fixed; on-device confirmation still OPEN

Enabling Android's high-contrast text visibly changed the OS text rendering but did **not** flip the
app to the `reduced` profile. Investigating produced a genuine bug:

`useAppearance` subscribed only to `reduceMotionChanged` and `reduceTransparencyChanged`. The
contrast signal has its own event, named **differently per platform** —
`highTextContrastChanged` on Android, `darkerSystemColorsChanged` on iOS — and neither was
subscribed. So `prefersMoreContrast` was read once at mount and then never updated, breaking
contract C4's "every field updates live" for exactly the setting a traveller toggles _because_ they
are struggling to read the screen.

Fixed via a new `appearanceChangeEvents(os)` in `apps/mobile/src/theme/accessibility.ts`, with five tests
written first (`apps/mobile/test/theme/appearance.test.ts`). Also corrected: RN reads
`Settings.Global.TRANSITION_ANIMATION_SCALE` for reduce motion, **not** `animator_duration_scale` —
verified in `AccessibilityInfoModule.kt:101-107` and recorded in `quickstart.md`.

**T058 stays open.** After the fix and a JS Reload the profile still did not change, and the device
disconnected before this could be resolved. The remaining suspect is Expo Go's native module caching
the value at process start; it needs re-testing with a full process restart, ideally in a standalone
dev-client build rather than Expo Go.

### T050, T059, T065, T070 — not reached

The device disconnected partway through the sweep.

### ⚠️ Device settings may need restoring

`high_text_contrast_enabled` was set to `1` and the reset command may not have landed before the
disconnect. Original values were: night mode `no`, `font_scale` `1.0`,
`high_text_contrast_enabled` unset, animation scales `1.0`.

```bash
adb shell settings put secure high_text_contrast_enabled 0
adb shell settings put system font_scale 1.0
adb shell "cmd uimode night no"
```

### Verification after the fix

lint exit 0 · 0 type errors · **184 tests / 28 suites** · coverage 87.1% statements, 83.18%
branches, 80.72% functions, 86.31% lines — all four floors still clear.
