# Implementation Plan: Paid trip allowance

**Branch**: `feat/paid-trip-allowance` | **Date**: 2026-10-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/014-paid-trip-allowance/spec.md`

## Summary

Replace the flat allowance of spec 013 with: 3 free held trips, single-trip credits, a Tier 1 yearly plan (10 new
trips per year) and an Unlimited yearly plan, with trips marked as **covered** by what paid for them. A server-owned
spend ledger (`trip_covers`) records the cover; `AllowanceService` decides the spending order under the per-traveller
advisory lock. Charging is off at launch: the product records who would have been stopped, and one owner script
switches charging on while protecting existing trips. The stores cannot lower a price per subscriber, so the yearly
ladder is one store product per step. The server work (this plan) is independent of the store setup (S-13) and the
screens (S-12).

## Technical Context

**Language/Version**: TypeScript 5, Node 24; NestJS 11; PostgreSQL 16 + PostGIS.

**Primary Dependencies**: `postgres.js`, Drizzle (types only), zod via `@triptrackr/contracts`, RevenueCat
webhooks (no SDK on the server).

**Storage**: PostgreSQL. Five new tables and five `billing_*` functions in migration `0016` (data-model.md).

**Testing**: Jest projects `unit`, `contract`, `integration`, `privacy` (Testcontainers; Docker required).

**Target Platform**: the API (`apps/api`) and the shared contracts (`packages/contracts`). The mobile app changes
only when S-12 starts; this plan leaves it untouched.

**Project Type**: mobile app plus API (monorepo).

**Performance Goals**: `POST /trips` stays within its current latency (about 13 ms to 18 ms through the API from the
013 measurements); the added queries are indexed point reads on the caller's own rows.

**Constraints**: nothing already recorded is ever hidden, locked, deleted or exported differently (Constitution V);
the API role cannot write commerce rows except `INSERT` into `trip_covers`; offline sync never rejects a trip.

**Scale/Scope**: about 1,000 monthly active users at the planned switch-on; up to hundreds of trips per traveller.

## Constitution Check

| Principle | Status | How |
| --------- | ------ | --- |
| I Privacy is structural | PASS | New tables are owner-only, no visibility flag, no public policy. Posture stated in data-model.md. |
| II Offline default | PASS | Sync push still never rejects; a flagged trip can be covered later (D14-11). Charging off blocks nothing. |
| III Test-first, privacy as attacker | PASS | Every task has the failing test first; the neutrality suite is widened and a "reads identical" suite is added. |
| IV Verify before you render | PASS | Prices and currency come from the store, not from our data; no invented numbers. |
| V Nothing recorded is held hostage | PASS | A lapse, refund or cancellation only changes `ordinary_held` or the next create. A spent credit is never returned but its trip is never touched. |

No violations; the Complexity Tracking table is empty.

**Post-design re-check**: still PASS. The one new risk is `trip_covers` having no FK to `trips` (D14-02); it is
deliberate and covered by a test that purges a tombstone and confirms the credit is still spent.

## Project Structure

### Documentation (this feature)

```text
specs/014-paid-trip-allowance/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/billing-api.md
├── checklists/requirements.md
└── tasks.md            # next step: /speckit-tasks
```

### Source Code (repository root)

```text
packages/contracts/src/api/billing.ts        # TripAllowanceDetails, EntitlementResponse, CoverResponse (changed)
apps/api/src/db/migrations/0016_paid_trip_allowance.sql
apps/api/src/db/schema/commerce.ts           # types for the new tables
apps/api/src/common/config/env.schema.ts     # FREE 3, TIER1_YEARLY_TRIPS, BILLING_PRODUCTS
apps/api/src/modules/billing/
├── allowance.service.ts                     # decision + spend (the only reader of the commerce tables)
├── cover.controller.ts                      # POST /trips/:id/cover
├── entitlement.controller.ts                # GET /me/entitlement (changed)
├── billing-webhook.controller.ts            # S-11: webhook + purchase-completed
├── billing-events.service.ts                # S-11: event → billing_* function
└── billing.module.ts
apps/api/src/modules/trips/trips.service.ts  # reserve before insert, record cover after
apps/api/src/modules/sync/push-allowance.policy.ts
apps/api/scripts/billing-{enforce,pause,shadow-report}.ts
apps/api/test/{contract,integration,privacy,unit}/...
docs/roadmap/PROGRESS.md, specs/001-triptrackr-mvp/tasks.md   # cross-references
```

**Structure Decision**: all behaviour stays in the existing `billing` module so the "only this module reads the
commerce tables" rule of the neutrality test stays a single directory. The mobile app is out of scope until S-12.

## Phases

1. **Foundation** — contracts, config, migration `0016`, schema types, widened neutrality test (red first).
2. **Spend** — `AllowanceService` decision and cover insert, `POST /trips`, shadow recording, concurrency test.
3. **Sync and cover** — push policy on covered trips and Unlimited, `POST /trips/:id/cover`.
4. **Entitlement** — `GET /me/entitlement`, `years_subscribed` and `next_product_id`.
5. **Switch** — the three owner scripts and the rehearsal test.
6. **Provider (S-11)** — webhook, purchase-completed, `billing_*` calls, recorded fixtures, replay and tamper tests,
   security review.
7. **Evidence** — "reads identical" suite, account-deletion residue test updated, PROGRESS.md.

## Complexity Tracking

_Empty: no Constitution violations to justify._
