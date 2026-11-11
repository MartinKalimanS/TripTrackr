# Tasks: Complete the everyday flows (spec 015)

**Input**: `specs/015-ux-flows/spec.md`. Test-first in every task (constitution; AGENTS.md).

## Phase 1: User Story 1 - Manage a trip I already made (P1)

- [x] T1501 [US1] `tripsRepository.update` (rename, home currency), dirty for the next push, in
      `apps/mobile/src/db/repositories/trips.ts`; `updateTrip` in `features/trips/use-trips.ts`
- [x] T1502 [US1] Trip options sheet (name, currency, Delete trip behind a confirmation) in
      `apps/mobile/src/components/trip/trip-options.tsx`; the header's More opens it and Share is no
      longer drawn (`trip-header-controls.tsx`, `trip-detail.tsx`)

## Phase 2: User Story 2 - Correct a stop (P1)

- [x] T1503 [US2] The stop editor is "Edit stop" with "Change city" back to the picker; the row
      action is "Edit stop <place>" (`stop-editor.tsx`, `stop-row.tsx`). The server already accepts
      a changed `city_id` on push (`push-trips.ts`)

## Phase 3: User Story 3 - What I paid for is used for me (P1)

- [x] T1504 [US3] Cover a trip past the free number on arrival with a Tier 1 use or a credit
      (`apps/api/src/modules/billing/allowance.service.ts`); contract tests in
      `apps/api/test/contract/sync-push-allowance.spec.ts` (5 tests, passing)
- [x] T1505 [US3] Show the over-allowance notice on the trip screen too (FR-008)

## Phase 4: User Story 4 - No control that does nothing (P2)

- [x] T1506 [US4] Search trips by name on the trips list (FR-010)
- [ ] T1507 [US4] Settings screen from You (FR-011)
- [ ] T1508 [US4] Remove every remaining `ComingSoonButton` call site and the component (FR-009)

## Phase 5: User Story 5 - Make a trip in one go (P2)

- [ ] T1509 [US5] New trip shows only stored fields; "Save and add first stop" (FR-012)

## Final

- [ ] T1510 Security review (billing change), full suites, device check by the owner
