---
description: 'Task list for the paid trip allowance (spec 014)'
---

# Tasks: Paid trip allowance

**Input**: `specs/014-paid-trip-allowance/` (spec, plan, research D14-01..12, data-model, contracts, quickstart)

**Prerequisites**: spec 013 code (PR #52) on this branch's base.

**Tests**: REQUIRED here (AGENTS.md: test-first, 80% floor, privacy suite). Each story writes its failing test first.

**Scope**: server only (`apps/api`, `packages/contracts`). The app screens (S-12) and store setup (S-13) are out.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- Run the API database projects one invocation at a time, with `--maxWorkers=2`.
- After editing `packages/contracts`: `npm run build -w packages/contracts`.

## Phase 1: Setup

- [x] T001 Branch `feat/paid-trip-allowance` exists and `specs/014-paid-trip-allowance/` is committed (done with the plan)
- [x] T002 Change `FREE_TRIP_ALLOWANCE` default to 3 and add `TIER1_YEARLY_TRIPS` (default 10) and `BILLING_PRODUCTS` (JSON, validated into a map of product id to `{ kind, step? }`, empty map allowed) in `apps/api/src/common/config/env.schema.ts` and `.env.example`; unit test in `apps/api/test/unit/config/` for the defaults and a malformed `BILLING_PRODUCTS`

## Phase 2: Foundation (blocks every story)

- [x] T003 [P] Write the failing contract schema tests for the new `TripAllowanceDetails`, `EntitlementResponse` and `CoverResponse` in `packages/contracts/test/billing.test.ts` (routes include `buy_trip`; `charging_enabled` false means the other fields are null or 0)
- [x] T004 Implement those schemas in `packages/contracts/src/api/billing.ts` and rebuild the package
- [x] T005 Write the failing migration test `apps/api/test/integration/paid-allowance-schema.spec.ts`: the four tables exist with `ENABLE` and `FORCE` RLS; the API role has exactly `SELECT` (credits, periods), `SELECT, INSERT` (trip_covers), `SELECT, INSERT, UPDATE` (allowance_shadow); `trip_covers.trip_id` and `credit_id` unique; the year trigger refuses an 11th cover and a cover after `ends_at`; a tombstone purge of a trip leaves its cover row
- [x] T006 Write `apps/api/src/db/migrations/0016_paid_trip_allowance.sql` per data-model.md (tables, checks, policies, grants, `trip_covers_year_guard`, the four `billing_*` SECURITY DEFINER functions with `GREATEST`-style bounds and no row-aiming arguments) and mirror the table types in `apps/api/src/db/schema/commerce.ts`
- [x] T007 Widen `apps/api/test/privacy/entitlement-neutrality.spec.ts` (failing first): no policy or view mentions the four tables; only functions named `billing_*` read them; in `src/` only `modules/billing/*` and the schema files mention them; the API role's grants are exactly those of T005
- [x] T008 Add test helpers `apps/api/test/support/billing.ts`: `grantCredit`, `openPeriod(tier, {uses?, endsAt?})`, `bootCharging(options)` (boots the app with `BILLING_ENFORCED=true`) and `readCovers(user)`

**Checkpoint**: migration applies, T005 and T007 green.

## Phase 3: User Story 1 - Charging off, shadow measurement (P1)

**Goal**: with `BILLING_ENFORCED` off nobody is blocked; the owner can read how many would have been.

**Independent test**: create 6 trips with charging off, all 201, no cover rows, one shadow row with `attempts = 3`; the report prints the counts only.

- [x] T009 [P] [US1] Failing contract tests in `apps/api/test/contract/paid-allowance-shadow.spec.ts`: every create is 201 with body `{ trip }` only; shadow row written from the 4th trip; two travellers give `travellers_blocked: 2`; the report output contains no title or id
- [x] T010 [US1] Rewrite `apps/api/src/modules/billing/allowance.service.ts`: replace the 013 logic with `decide(submitted)` returning `{ outcome, cover? }` (D14-04 order) and `apply(tripId, cover)` inserting the `trip_covers` row; read `BILLING_ENFORCED` from the loaded env; record shadow rows while charging is off
- [x] T011 [US1] Wire it in `apps/api/src/modules/trips/trips.service.ts` (`create`: replay first, then `decide`, insert, `apply`) and update its header comment
- [x] T012 [P] [US1] `apps/api/scripts/billing-shadow-report.ts` and the `billing:shadow-report` script in `apps/api/package.json` (owner URL, counts only); unit test for the output shape

## Phase 4: User Story 2 - The free limit and its refusal (P1)

**Goal**: with charging on, 3 ordinary trips are free; the 4th is refused with every way forward; deleting frees a slot.

- [x] T013 [P] [US2] Failing contract tests in `apps/api/test/contract/paid-allowance-free.spec.ts`: 3 are 201 with no allowance wording; the 4th is 409 `TRIP_ALLOWANCE_REACHED` with `trips_held`, `allowance`, `year_uses_left`, `credits`, `routes` and the echoed submission; the refusal writes nothing; deleting one lets the same create succeed; two simultaneous creates at the last slot give 201 and 409; a replay of an owned id is 201
- [x] T014 [US2] Make T013 pass in `allowance.service.ts` (ordinary count = live trips with no `trip_covers` row; 409 via `apiError` with the new details); update `apps/api/test/contract/trip-allowance.spec.ts` (013) to the new numbers and details
- [x] T015 [US2] `apps/api/scripts/billing-grandfather.ts` with the script `billing:grandfather` (owner role): covers every live trip lacking a cover as `grandfathered`, clears the shadow table, idempotent (FR-029, D14-06)
- [x] T016 [P] [US2] Integration test `apps/api/test/integration/billing-grandfather.spec.ts`: a traveller with 12 trips before the switch keeps all 12 as `grandfathered`, can still read, edit and export them, has 3 free slots empty, and is refused at their 4th new trip after 3; running the script twice changes nothing the second time; unsetting `BILLING_ENFORCED` keeps covers

## Phase 5: User Story 3 - Single-trip credit (P1)

**Goal**: a credit is spent by one trip and never returned.

- [x] T017 [P] [US3] Failing contract tests in `apps/api/test/contract/paid-allowance-credit.spec.ts`: with 3 ordinary trips and one credit the 4th is 201 with a `credit` cover; delete that trip then a new create is 409 again; the covered trip does not count against the 3; deleting a covered trip frees nothing, deleting an ordinary one frees a slot; two simultaneous creates with one credit give one 201; a credit never expires (a purchase 5 years old still spends); account deletion removes unspent credits
- [x] T018 [US3] Implement the credit branch in `allowance.service.ts`: pick the oldest unspent, unrefunded credit with `FOR UPDATE SKIP LOCKED` under the advisory lock; `UNIQUE(credit_id)` is the backstop
- [x] T019 [P] [US3] Integration test `apps/api/test/integration/billing-purge.spec.ts`: run the tombstone purge on a deleted covered trip older than 90 days; the credit stays spent (D14-02)
- [x] T020 [P] [US3] Extend the account-deletion residue test (`apps/api/test/integration/account-deletion*.spec.ts`) to list the four tables

## Phase 6: User Story 4 - Tier 1 yearly plan (P2)

**Goal**: 10 new trips per subscription year; unused expire; created trips stay covered.

- [x] T021 [P] [US4] Failing contract tests in `apps/api/test/contract/paid-allowance-tier1.spec.ts`: 10 creates give `year` covers and the 11th is 409 with `year_uses_left: 0`; deleting a covered trip returns nothing; at `ends_at` the uses vanish and a renewed period starts with 10; after a lapse the 10 trips remain readable, editable and exported; spending order is free, then year, then credit
- [x] T022 [US4] Implement the year branch in `allowance.service.ts` (active period, uses counted from `trip_covers`, never a counter) and confirm the DB trigger agrees under 50 concurrent creates (SC-004 test at service level)
- [x] T023 [P] [US4] `GET /v1/me/entitlement` in `apps/api/src/modules/billing/entitlement.controller.ts` returning the new shape; contract test `apps/api/test/contract/paid-allowance-entitlement.spec.ts` for charging off (nulls), tier1, unlimited and none

## Phase 7: User Story 5 - Unlimited (P2)

- [x] T024 [P] [US5] Failing contract tests in `apps/api/test/contract/paid-allowance-unlimited.spec.ts`: 30 creates all 201 with `unlimited` covers and no credit spent; a lapse hides nothing and the 30 covered trips do not count against the 3 free; Tier 1 to Unlimited mid-year keeps earlier covers
- [x] T025 [US5] Implement the unlimited branch in `allowance.service.ts`

## Phase 8: User Story 7 - Offline trips and covering (P2)

- [x] T026 [P] [US7] Failing tests: update `apps/api/test/contract/sync-push-rules.spec.ts` and add `apps/api/test/contract/paid-allowance-cover.spec.ts`: 5 trips pushed with 3 allowed give 2 flagged `over_allowance`; a retried push answers the same; `POST /trips/:id/cover` spends a year use then a credit and clears the flag; a second call is idempotent; a stranger's trip is 404; under an active Unlimited the pushed trips arrive covered; charging off flags nothing
- [x] T027 [US7] Rewrite `apps/api/src/modules/sync/push-allowance.policy.ts` for the new meaning (covered is never over; ordinary rank rule; Unlimited covers on arrival) and add `apps/api/src/modules/billing/cover.controller.ts` for `POST /trips/:id/cover`; register in `billing.module.ts`

## Phase 9: User Story 8 - Refunds and lapses never touch data (P2)

- [x] T028 [P] [US8] Failing integration tests `apps/api/test/integration/billing-refund.spec.ts`: refund of an unspent credit removes it; refund of a spent credit deletes that cover and the trip stays and now counts as ordinary; a year refund keeps covers; the same refund twice is a no-op
- [x] T029 [US8] Implement `billing_refund`, `billing_end_period` fully in `0016` (if not already complete) and make T028 pass
- [x] T030 [US8] The "reads identical" privacy suite `apps/api/test/privacy/billing-reads-identical.spec.ts` (T176 of feature 001): trips list, one trip, arcs, expenses, notes, photos and the data export are byte-identical before and after a lapse, a refund and a cancellation

## Phase 10: User Story 6 - The yearly price ladder (P3)

- [x] T031 [P] [US6] Failing unit tests `apps/api/test/unit/billing/ladder.spec.ts`: consecutive periods give `years_subscribed` 1, 2, 3; any gap restarts at 1; `next_product_id` follows `BILLING_PRODUCTS` steps and stops at the floor step; Tier 1 to Unlimited keeps the count
- [x] T032 [US6] `apps/api/src/modules/billing/ladder.ts` (pure function) and its use in `billing_open_period` (`ladder_step`) and in the entitlement response

## Phase 11: Provider integration (S-11, covers T175 and T176)

- [x] T033 [P] Record RevenueCat webhook fixtures under `apps/api/test/fixtures/revenuecat/` (initial purchase, renewal, product change, cancellation, expiration, billing issue, non-renewing purchase, a refund as `CANCELLATION` with a cancel reason and as a `REFUND` type); no real ids or PII
- [x] T034 Failing tests `apps/api/test/contract/billing-webhook.spec.ts`: unsigned or tampered call is 401 before the body is parsed; constant-time compare; every fixture applies; the same fixture 10 times grants once; an unknown event is 200 and logged; an event for a deleted account is discarded; no PII in the logs
- [~] T035 (webhook done; `purchase-completed` deferred to S-13 until the real payload is seen) Implement `billing-webhook.controller.ts` and `billing-events.service.ts` (signature check first, product map from `BILLING_PRODUCTS`, calls the `billing_*` functions) and `POST /billing/purchase-completed` (re-reads RevenueCat for the caller; grants nothing the provider does not confirm)
- [x] T036 Security review of T006 and T035 (`security-reviewer`): keyhole bounds, signature handling, replay, logging; fix CRITICAL and HIGH before the PR

## Phase 12: Polish and evidence

- [x] T037 Update `docs/roadmap/PROGRESS.md` (S-10 superseded by 014, S-11 built), tick T172 to T180 notes in `specs/001-triptrackr-mvp/tasks.md`, mark spec 013 `Superseded by 014` in `specs/013-trip-allowance/spec.md`
- [ ] T038 Run lint, typecheck, `test:unit`, then each database project once (contract, integration, privacy), coverage floor 80%; record counts in PROGRESS.md
- [ ] T039 Code review (`code-reviewer`) and open the PR with the visibility posture of all four tables

## Dependencies and order

```text
Phase 1 → Phase 2 → US1 → US2 → US3 → { US4, US5 } → US7 → US8 → US6 → Phase 11 → Phase 12
```

US4 and US5 share only the decision function; US6 is pure and can be written any time after Phase 2. T033 can start
at once. The MVP (what can be switched on) is Phases 1 to 5: shadow mode, the free limit, the switch and single-trip
credits; the webhook (Phase 11) is needed before any credit can actually be bought.

## Parallel examples

- After T006: T007, T008 and T003/T004 are independent.
- Inside a story, the contract test task `[P]` and the helper work can be written together; the implementation task
  waits for the red test.

## Implementation strategy

Test first, one story at a time, committing after each green phase. Stop and report if the stores' real behaviour
(D14-08, D14-09) contradicts a decision; those are the two UNVERIFIED items.
