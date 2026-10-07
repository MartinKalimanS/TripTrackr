# Tasks: Globe-First Home

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

**Rule**: every task writes its failing test first (Constitution III). `[P]` = different files, no
dependency on an unfinished task.

## Phase 1: User Story 2 - One line through every place I have been (P1)

- [x] T301 [US2] Failing tests in `apps/mobile/src/features/globe/__tests__/journey.test.ts`:
      visited places (today boundary, unplaced excluded, planned excluded), ordering ties, legs
      across trips, no duplicate of a trip's own leg, none within a city, none bridging an unplaced
      stop, overlapping trips (FR-006 to FR-009)
- [x] T302 [US2] Implement `apps/mobile/src/features/globe/journey.ts`
- [x] T303 [P] [US2] Failing tests in `components/globe/__tests__/arc-features.test.ts` for
      `journeyCollection` (ids, no trip_id, date-line split, empty), then implement it
- [x] T304 [US2] Failing tests in `components/globe/__tests__/globe-view.test.tsx`: a `globe-journey`
      source under the trip arcs, no `onPress`, the `past` line style; then wire `arc-source.tsx` and
      `globe-view.tsx` (FR-010, FR-011)

## Phase 2: User Story 1 - The globe is always there (P1)

- [x] T305 [US1] Failing tests in `test/app/tab-screens.test.tsx`: globe mounted with no trips and
      with trips but no stop, invitation copy and actions (one trip opens it, several open the list),
      invitation gone when something is placed, error notice over the globe (FR-001 to FR-005)
- [x] T306 [US1] Rework `components/globe/empty-state.tsx` into the compact invitation and
      `app/(tabs)/index.tsx`
- [x] T307 [US1] Failing tests then implement `useFlyToFirstPlacement` in
      `components/globe/camera.ts` and use it in `globe-view.tsx` (FR-004)
- [x] T308 [P] [US1] Update `apps/mobile/e2e/03-globe.yaml`: the globe is visible behind the
      invitation (FR-001)

## Phase 3: User Story 3 - A bottom bar that gets out of the way (P2)

- [x] T309 [P] [US3] Failing tests for `bare` in `components/ui/pressable-surface` suite
- [x] T310 [US3] Rewrite `test/components/neumorphic-tab-bar.test.tsx` expectations (flat, divider,
      selected mark, height budget, touch target, no literal) then rework
      `components/navigation/neumorphic-tab-bar.tsx` (FR-013 to FR-016)

## Phase 4: User Story 4 - Fewer steps, calmer screens (P2)

- [x] T311 [P] [US4] Failing tests then rework `components/trip/currency-picker.tsx` (FR-017)
- [x] T312 [P] [US4] Failing tests in `test/app/trip-and-modal-screens.test.tsx` then compact the
      header and links row in `app/trip/[id]/index.tsx` (FR-018, FR-019)

## Phase 5: Verify

- [x] T313 `npm run lint`, `npm run typecheck`, `npm run test:cov -w apps/mobile`, `npx prettier
--check` on every touched file
- [ ] T314 Look at the home, trips and trip screens on a device in both themes (not done: the phone was not visible to adb when the code was finished)
