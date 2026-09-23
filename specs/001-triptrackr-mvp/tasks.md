---
description: 'Task list for TripTrackr MVP implementation'
---

# Tasks: TripTrackr MVP

**Input**: Design documents from `/specs/001-triptrackr-mvp/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Constitution**: [.specify/memory/constitution.md](../../.specify/memory/constitution.md) v1.0.0

**Tests**: Test tasks ARE included and are mandatory. Constitution III ("Test-First, and Privacy Tests Run as an Attacker") makes them non-optional for this project, and the spec's success criteria (SC-012 through SC-014, SC-021) can only be demonstrated adversarially.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested, and demoed independently — with one deliberate exception recorded below.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US9)
- Exact file paths are included in every task

## Path Conventions

An npm-workspaces monorepo — two deployables and one shared package (plan.md, "Structure Decision", amended 2026-09-23; research D-13):

- **Mobile**: `apps/mobile/src/` (Expo app; `expo-router` routes under `apps/mobile/src/app/`), tests in `apps/mobile/test/` and co-located `*.test.tsx`
- **Mobile E2E**: `apps/mobile/e2e/` (Maestro flows)
- **Server**: `apps/api/src/`, tests in `apps/api/test/`
- **Shared contracts**: `packages/contracts/src/` — `@triptrackr/contracts`, the zod schemas for the sync protocol and the REST error shape that **both** apps import; neither app keeps a local copy
- **Infra**: `infra/`
- **Long-form product documents**: `docs/` — `docs/travelappblueprint.md`, `docs/travelappfullspec.md`, plus `docs/legal/` and `docs/release/`

## ⚠️ Sequencing Constraint (non-negotiable)

**User Story 7 (social) MUST NOT begin until the User Story 6 offline acceptance suite passes in full.** This is a constitutional gate (Constitution II; spec "Sequencing constraint"; [contracts/sync-protocol.md](./contracts/sync-protocol.md) §6), not a scheduling preference. Task **T141** is the explicit gate checkpoint. All other stories may proceed in parallel once Phases 2 and 2b complete.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Both deployables scaffolded, toolchain configured, CI able to fail a build.

- [x] T001 Scaffold the NestJS 11 API in `apps/api/` with its own `package.json` and `tsconfig.json`, and the entry point `apps/api/src/main.ts`, on Node.js 22 LTS
- [x] T002 [P] Create `infra/docker-compose.yml` with postgres+postgis 17/3.5, redis 7, minio, api, worker, migrate, and traefik services
- [x] T003 [P] Create `infra/docker-compose.prod.yml` overriding for Cloudflare R2 and Traefik TLS termination
- [x] T004 [P] Implement startup environment-variable schema validation in `apps/api/src/common/config/env.schema.ts` that refuses to boot on any missing secret (Constitution "Technology & Platform Constraints")
- [x] T005 [P] Configure Drizzle Kit in `apps/api/drizzle.config.ts` with the migrations output directory `apps/api/src/db/migrations/`
- [x] T006 Install mobile dependencies per plan.md Technical Context into `apps/mobile/package.json` — `@rnmapbox/maps`, `expo-sqlite`, `drizzle-orm`, `@tanstack/react-query`, `zustand`, `expo-secure-store`, `expo-screen-capture`, `expo-camera`, `expo-image-picker`, `expo-image-manipulator`, `expo-file-system`, `react-native-purchases`, `@turf/great-circle`, `@sentry/react-native` — each version verified against the Expo SDK 57 versioned docs
- [ ] T007 [P] Create the mobile source directory skeleton `apps/mobile/src/features/`, `apps/mobile/src/db/`, `apps/mobile/src/sync/`, `apps/mobile/src/lib/`, `apps/mobile/src/components/globe/`, `apps/mobile/src/components/trip/` per plan.md — _re-opened 2026-09-23: only `lib/` exists; the others were never created_
- [x] T008 [P] Configure ESLint (flat config) and Prettier for both deployables in `apps/mobile/eslint.config.js` and `apps/api/eslint.config.js`, with one `.prettierrc` at the repository root
- [x] T009 [P] Configure Jest and the Testcontainers PostgreSQL harness in `apps/api/jest.config.js` and `apps/api/test/setup.ts`
- [x] T010 [P] Configure Jest and React Native Testing Library in `apps/mobile/jest.config.js` and `apps/mobile/jest.setup.ts`
- [x] T011 [P] Create the Maestro flow directory `apps/mobile/e2e/` with `apps/mobile/e2e/config.yaml` and a smoke flow `apps/mobile/e2e/00-smoke.yaml`
- [x] T012 [P] Create the CI workflow `.github/workflows/ci.yml` running lint, unit, integration, and the privacy suite as a **required** job, failing below 80% coverage
- [x] T013 [P] Initialise Sentry in `apps/api/src/main.ts` and `apps/mobile/src/app/_layout.tsx` (FR-073)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The database, its privacy enforcement, and the client/server plumbing every story sits on.

**⚠️ CRITICAL**: No user story work begins until this phase is complete. In particular, no table may be queried by a story before its RLS policy exists — Principle I is enforced by construction, and a story built against an unpoliced table is a story built on the wrong foundation.

### Database schema

- [x] T014 Write migration `apps/api/src/db/migrations/0001_extensions.sql` enabling `postgis` and `citext` before any table is created
- [x] T015 [P] Define the reference geography tables in `apps/api/src/db/schema/geography.ts` — `countries`, `cities` with `GEOGRAPHY(POINT,4326)`, `ascii_name`, `timezone`, `population` (data-model.md §1)
- [x] T016 [P] Define the account tables in `apps/api/src/db/schema/accounts.ts` — `users`, `oauth_identities`, `refresh_tokens` (data-model.md §2)
- [x] T017 [P] Define the trip tables in `apps/api/src/db/schema/trips.ts` — `trips`, `trip_stops` with the `CHECK (depart_date >= arrive_date)` constraint (data-model.md §3, FR-011)
- [x] T018 [P] Define the content tables in `apps/api/src/db/schema/content.ts` — `notes`, `photos`, `documents` including `wrapped_dek`, `dek_key_id`, and `upload_state` (data-model.md §4–5)
- [x] T019 [P] Define the money tables in `apps/api/src/db/schema/money.ts` — `expense_categories`, `expenses`, `fx_rates`, with no visibility column on `expenses` (data-model.md §6, FR-027)
- [x] T020 [P] Define the planner tables in `apps/api/src/db/schema/planner.ts` — `itinerary_days`, `itinerary_items` with `location` NOT NULL, `planner_requests` (data-model.md §7)
- [x] T021 [P] Define the social and commerce tables in `apps/api/src/db/schema/social.ts` and `apps/api/src/db/schema/commerce.ts` — `follows`, `blocks`, `reports`, `subscriptions` (data-model.md §8–9)
- [x] T022 Generate and commit the initial Drizzle Kit migration in `apps/api/src/db/migrations/` from T015–T021, with spatial indexes on `cities.location` and `itinerary_items.location`
- [x] T023 Create the non-superuser API database role in `apps/api/src/db/migrations/0003_api_role.sql`, without policy-alter rights (data-access-policy.md §1)

### Privacy enforcement — the authority

- [x] T024 Write the hand-authored RLS enablement migration `apps/api/src/db/migrations/0004_rls_enable.sql` enabling **and forcing** RLS on every traveller-owned table (data-access-policy.md §1)
- [x] T025 Write the RLS policy migration `apps/api/src/db/migrations/0005_rls_policies.sql` implementing every policy in [contracts/data-access-policy.md](./contracts/data-access-policy.md) §2 — including `moderation_state` inside the `photos` predicate, and no public-read policy whatsoever on `expenses` or `documents`
- [x] T026 Write the catalogue assertion tests in `apps/api/test/privacy/catalogue.spec.ts` covering adversarial suite rows 14, 15, and 16 — no public-read policy on `expenses`/`documents`, RLS enabled and forced on every owned table, API role not a superuser — **written and failing before T024 and T025 are applied**
- [x] T027 Implement the RLS session middleware in `apps/api/src/common/rls/rls-session.middleware.ts` setting `app.current_user_id` per request inside the transaction, and failing closed when unset (data-access-policy.md §1)
- [x] T028 Write the fail-closed test in `apps/api/test/privacy/anonymous.spec.ts` covering adversarial suite row 13 — any query with no session variable returns no rows

### Server plumbing

- [x] T029 [P] Implement the shared repository scope in `apps/api/src/common/db/soft-delete.scope.ts` applying `deleted_at IS NULL` to every read path except `/sync/pull` (sync-protocol.md §1)
- [x] T030 [P] Implement the global exception filter in `apps/api/src/common/filters/http-exception.filter.ts` returning human-readable messages with no internal detail (FR-072)
- [x] T031 [P] Implement structured request logging in `apps/api/src/common/logging/logger.module.ts`
- [x] T032 [P] Implement the Redis module and per-account rate limiter in `apps/api/src/common/redis/redis.module.ts` and `apps/api/src/common/guards/rate-limit.guard.ts` (FR-071)
- [x] T033 [P] Implement the JWT access-token guard and token service in `apps/api/src/common/auth/jwt.guard.ts` and `apps/api/src/modules/auth/token.service.ts` — endpoints arrive in US1
- [x] T034 [P] Implement the S3-compatible storage client and short-lived signed-URL service in `apps/api/src/common/storage/storage.service.ts` — private buckets only
- [x] T035 [P] Implement the BullMQ queue module and worker bootstrap in `apps/api/src/common/queue/queue.module.ts` and `apps/api/src/workers/main.ts`
- [x] T036 [P] Implement the envelope encryption service in `apps/api/src/common/crypto/envelope.service.ts` — wrap and unwrap per-row DEKs with a master key and key id (FR-033, research D-04)
- [x] T037 Build the Testcontainers integration harness in `apps/api/test/integration/harness.ts` booting real PostgreSQL + PostGIS, applying migrations, and seeding two accounts (Constitution III)
- [x] T038 Write the geography catalogue import script `infra/scripts/import-geo-catalogue.ts` loading countries and cities with coordinates, timezones, and population (research D-11)

### Mobile plumbing

- [ ] T039 [P] Implement the API client with automatic token refresh in `apps/mobile/src/lib/api-client.ts`
- [ ] T040 [P] Implement the secure storage wrapper in `apps/mobile/src/lib/secure-store.ts` for tokens and the local database key (FR-003)
- [ ] T041 Implement the SQLCipher-encrypted local database in `apps/mobile/src/db/client.ts` with the Drizzle local schema in `apps/mobile/src/db/schema.ts` — the seven mirrored tables in `SYNC_TABLES`, each keyed by a client-generated UUID `id` (no `server_id`, research D-15), with the local-only columns `is_dirty`, `synced_at`, and `local_file_uri` (photos, documents), and row types inferred from the `*PullRecord` schemas in `@triptrackr/contracts` (data-model.md §10, research D-01, D-13)
- [ ] T042 Generate the initial local migration in `apps/mobile/src/db/migrations/`
- [ ] T043 [P] Wire the TanStack Query provider and Zustand root store in `apps/mobile/src/app/_layout.tsx` and `apps/mobile/src/lib/store.ts`
- [ ] T044 [P] Create the route group shells `apps/mobile/src/app/(auth)/_layout.tsx`, `apps/mobile/src/app/(tabs)/_layout.tsx`, and `apps/mobile/src/app/trip/[id]/_layout.tsx` (see R009 — the root `Stack`, the `modal/` group, `+not-found`, and the neumorphic tab bar are delivered there and supersede these shells; `(tabs)/_layout.tsx` passes the R009 bar as `tabBar`)

**Checkpoint**: Database policed, session plumbing failing closed, both clients bootable. User story work may begin — once Phase 2b below is also complete.

---

## Phase 2b: Remediation — architecture audit 2026-09-23

**Purpose**: Bring the scaffold that Phases 1 and 2 produced into agreement with its own specification _before_ the first product screen is built on it.

Before any user story began, the repository was audited end to end — mobile, server, infrastructure, CI, and spec-to-code consistency ([research.md](./research.md) "Architecture audit — 2026-09-23", decisions D-13 through D-20). The audit found defects that would have been far more expensive to unwind once screens existed: the sync contract covered four tables while the device mirrored seven, so a stop deleted offline had no path to disappear on a second device (D-16); every service was wired to the database owner's connection string, so every RLS policy in [contracts/data-access-policy.md](./contracts/data-access-policy.md) was bypassed in any environment built from the repository while the privacy suite stayed green (D-20); the root layout had no `Stack` and used an `unstable-` native tab bar that feature 002 forbids (D-17); Session Replay was recording screens that show boarding passes (D-18); and two hand-maintained copies of the wire format were about to diverge (D-13). The constitution places specification ahead of code ("Specification precedes code", Development Workflow & Quality Gates), so the contracts, data model, plan, and research were amended first (R003) and the code is brought into line here rather than patched story by story. Items marked `[x]` were completed by the restructure commit; the rest are being implemented in parallel with this document and MUST be complete before the Phase 3 checkpoint is claimed. `R` identifiers are used so that no existing `T` reference shifts.

- [x] R001 Restructure into an npm-workspaces monorepo — `apps/mobile`, `apps/api`, `packages/contracts` — with a single root `package-lock.json`, React deduplicated via root `overrides` (research D-13)
- [x] R002 Create `@triptrackr/contracts` in `packages/contracts/src/` — the sync envelope (`PullQuery`, `PullResponse`, `PushRequest`, `PushResponse`, `PushResult`, `PushWarning`, `PushRejection`, `MAX_PUSH_BATCH`), `SYNC_TABLES` in dependency order, the seven `*PushRecord`/`*PullRecord` pairs (`Trip`, `TripStop`, `ExpenseCategory`, `Note`, `Expense`, `Photo`, `Document`), and the REST `ApiError` shape — with tests in `packages/contracts/test/` (research D-13, D-15, D-16)
- [x] R003 Amend [contracts/sync-protocol.md](./contracts/sync-protocol.md), [data-model.md](./data-model.md), [contracts/data-access-policy.md](./contracts/data-access-policy.md), [contracts/rest-api.md](./contracts/rest-api.md), [plan.md](./plan.md), and [research.md](./research.md) for D-13..D-20 (seven-table scope, client-generated `id`, tombstones on `trip_stops`/`expense_categories`, write pinning, two connection strings, owner-only itineraries, no web target)
- [ ] R004 Write migration `apps/api/src/db/migrations/0007_sync_tombstones_and_write_pinning.sql` — `created_at`/`updated_at`/`deleted_at` on `trip_stops` and `expense_categories` with `(updated_at)` indexes, the `oauth_identities.provider` CHECK, the `current_user_id()` `STABLE` function, write-pinning policies for `follows` and `expense_categories`, SELECT-only policies and revoked write grants on `refresh_tokens` and `subscriptions`, and atomic refresh-token rotation behind a `SECURITY DEFINER` function (research D-16, D-20; data-access-policy.md §2)
- [ ] R005 Two connection strings — add `MIGRATION_DATABASE_URL` and `API_DB_PASSWORD` to `apps/api/src/common/config/env.schema.ts`; `apps/api/src/db/migrate.ts` sets the API role's password (`ALTER ROLE triptrackr_api PASSWORD …`); `infra/docker-compose.yml` wires `api`/`worker` to `DATABASE_URL` and `migrate`/geo import to `MIGRATION_DATABASE_URL`; adversarial test 17 in `apps/api/test/privacy/catalogue.spec.ts` asserts `current_user = 'triptrackr_api'` from inside the API's own pool (research D-20; data-access-policy.md §1, §4)
- [ ] R006 Wire `AppModule` in `apps/api/src/app.module.ts` — logger, redis, queue, storage, crypto, the global exception filter, and the rate-limit guard; `apps/api/src/main.ts` with helmet, CORS, a body-size limit, shutdown hooks, and the global prefix `v1`; `GET /health`; and the contract test `apps/api/test/contract/health.spec.ts` so that `npm run test:contract -w apps/api` no longer fails CI on an empty project
- [ ] R007 Write adversarial tests 18–20 in `apps/api/test/privacy/write-pinning.spec.ts` — B cannot insert a `follows` row as A or accept a request addressed to A; B cannot insert, update, or delete an `expense_categories` row with `user_id IS NULL`; B cannot write `refresh_tokens` or `subscriptions` directly (data-access-policy.md §4)
- [ ] R008 Delete the create-expo-app template from `apps/mobile` — the `index.tsx`/`explore.tsx` screens, `app-tabs*.tsx`, `external-link.tsx`, `web-badge.tsx`, `hint-row.tsx`, `collapsible.tsx`, `animated-icon*`, the then-orphaned `hooks/use-theme.ts`, the template assets, and their tests under `apps/mobile/test/` — and the web target: every `*.web.tsx`/`*.web.ts` variant, `global.css`, `react-native-web`, `react-dom`, and the `web` output in `apps/mobile/app.json` (research D-14)
- [ ] R009 Root `Stack` layout in `apps/mobile/src/app/_layout.tsx` with the `(auth)/`, `(tabs)/`, `trip/[id]/`, and `modal/` groups and `+not-found.tsx`, and the neumorphic tab bar `apps/mobile/src/components/navigation/neumorphic-tab-bar.tsx` built from `PressableSurface` and passed as `tabBar` to the stable `Tabs` navigator (research D-17; feature 002 T076) — this supersedes the T044 shells
- [ ] R010 Sentry hardening on both sides — no Session Replay, no Feedback widget, `sendDefaultPii: false`, console breadcrumbs dropped, request bodies scrubbed — in `apps/mobile/src/lib/sentry.ts` and `apps/api/src/main.ts` (research D-18)
- [ ] R011 Production app config — `apps/mobile/app.json` (or `app.config.ts`) with permission strings, the iOS privacy manifest, the export-compliance flag, `allowBackup: false`, blocked Android permissions, `expo-build-properties` minify/shrink, and a single Sentry plugin; `apps/mobile/eas.json` with `development`, `preview`, and `production` profiles
- [ ] R012 Infra — `infra/docker-compose.yml` env wiring (service hostnames; the API-role URL reaches only `api` and `worker`), image digest pins, resource limits, an `api` healthcheck, `worker` waiting on `migrate`; `infra/scripts/backup.sh` and `infra/scripts/restore-rehearsal.sh` (constitution "Backups" — a backup that has never been restored from is not a backup)
- [ ] R013 Rewrite `.github/workflows/ci.yml` for the monorepo — contracts, mobile, api, privacy, docker-build, compose-validate, and format jobs; explicit `permissions`; per-job timeouts; `.github/dependabot.yml`
- [ ] R014 Repository docs — root `README.md`, operational guidance in `AGENTS.md`, a proprietary `LICENSE`, `docs/legal/*` drafts (privacy policy, terms, account deletion), and `docs/release/store-readiness.md`

**Checkpoint**: The scaffold agrees with its specification. `npm run lint && npm run typecheck && npm test` pass from the repository root; the structural rows of the adversarial suite (13–20, including test 17 from the API's own pool) pass, with the behavioural rows 1–12 still arriving with their stories; the app boots to the `(auth)` group with no template screen left in the tree. User story work may begin.

---

## Phase 3: User Story 1 — Create an account and record a multi-stop trip (Priority: P1) 🎯 MVP

**Goal**: A traveller registers, creates a trip with ordered city stops, and finds it intact on relaunch.

**Independent Test**: Register a new account, create a trip with two ordered stops in different cities, close and reopen the app, and confirm the trip and both stops persist with the correct dates and order.

### Tests for User Story 1 ⚠️ Write first, confirm failing

- [ ] T045 [P] [US1] Contract test — every endpoint rejects missing, malformed, and expired tokens — in `apps/api/test/contract/auth-boundary.spec.ts` (contract test 1)
- [ ] T046 [P] [US1] Contract test — a replayed rotated refresh token revokes the whole family — in `apps/api/test/contract/refresh-rotation.spec.ts` (contract test 2, FR-005)
- [ ] T047 [P] [US1] Contract test — login rate limiting engages and its response does not distinguish unknown account from wrong password — in `apps/api/test/contract/login-rate-limit.spec.ts` (contract test 3, FR-071)
- [ ] T048 [P] [US1] Integration test — a non-owner requesting an existing private trip receives exactly the not-found response — in `apps/api/test/integration/trips-access.spec.ts` (contract test 4)
- [ ] T049 [P] [US1] Integration test — trip creation, stop insertion, reordering, and rejection of a departure preceding arrival — in `apps/api/test/integration/trips.spec.ts` (FR-010, FR-011, FR-012)
- [ ] T050 [P] [US1] Integration test — city autocomplete is accent-tolerant and ranks well-known cities first — in `apps/api/test/integration/lookups.spec.ts` (FR-014)
- [ ] T051 [P] [US1] Unit test — trip lifecycle status derives from dates and a client-supplied `status` is rejected — in `apps/api/test/unit/trip-status.spec.ts` (FR-013)
- [ ] T052 [P] [US1] Component test — trip creation form validation and stop ordering — in `apps/mobile/src/features/trips/__tests__/trip-form.test.tsx`

### Implementation for User Story 1

- [ ] T053 [US1] Implement registration and login in `apps/api/src/modules/auth/auth.controller.ts` and `apps/api/src/modules/auth/auth.service.ts` (FR-001)
- [ ] T054 [US1] Implement Google and Apple OAuth with server-side token verification and transparent first-use account creation in `apps/api/src/modules/auth/oauth.service.ts` (FR-002)
- [ ] T055 [US1] Implement refresh rotation, reuse detection, logout, and logout-all in `apps/api/src/modules/auth/refresh.service.ts` (FR-003, FR-004, FR-005)
- [ ] T056 [US1] Implement email verification and password reset with Resend in `apps/api/src/modules/auth/verification.service.ts`
- [ ] T057 [US1] Apply the rate-limit guard to every `/auth/*` route in `apps/api/src/modules/auth/auth.module.ts` (FR-071)
- [ ] T058 [P] [US1] Implement `GET /me` and `PATCH /me` in `apps/api/src/modules/users/users.controller.ts` (FR-008)
- [ ] T059 [US1] Implement trips CRUD in `apps/api/src/modules/trips/trips.controller.ts` and `apps/api/src/modules/trips/trips.service.ts` — creation deliberately without any allowance check, which arrives in US9 (FR-009)
- [ ] T060 [US1] Implement stop create, patch, delete, and reordering in `apps/api/src/modules/trips/stops.controller.ts` (FR-010, FR-012)
- [ ] T061 [US1] Implement derived lifecycle status in `apps/api/src/modules/trips/trip-status.service.ts`, rejecting a supplied `status` (FR-013)
- [ ] T062 [US1] Implement `GET /trips/:id/arcs` deriving great-circle pairs from consecutive stops in `apps/api/src/modules/trips/arcs.service.ts` (FR-016)
- [ ] T063 [P] [US1] Implement the lookups module `GET /countries` and `GET /countries/:id/cities` with accent-tolerant ranked search in `apps/api/src/modules/lookups/lookups.controller.ts` (FR-014)
- [ ] T064 [P] [US1] Build the auth screens in `apps/mobile/src/app/(auth)/welcome.tsx`, `apps/mobile/src/app/(auth)/login.tsx`, and `apps/mobile/src/app/(auth)/register.tsx`
- [ ] T065 [US1] Implement auth mutations and session persistence in `apps/mobile/src/features/auth/use-session.ts` (FR-003)
- [ ] T066 [US1] Build the trip list screen and add-trip modal in `apps/mobile/src/app/(tabs)/index.tsx` and `apps/mobile/src/app/modal/add-trip.tsx`
- [ ] T067 [US1] Build the country-filtered searchable city picker in `apps/mobile/src/components/trip/city-picker.tsx` (FR-014)
- [ ] T068 [US1] Build the trip detail screen and stops editor in `apps/mobile/src/app/trip/[id]/index.tsx`
- [ ] T069 [US1] Implement next-stop arrival date suggestion and client-side date validation in `apps/mobile/src/features/trips/stop-dates.ts` (FR-015, FR-011)
- [ ] T070 [US1] Write the Maestro flow `apps/mobile/e2e/01-account-and-trip.yaml` covering register, create a two-stop trip, relaunch, and verify persistence

**Checkpoint**: A traveller can register and record a multi-stop trip. This is the MVP.

---

## Phase 4: User Story 2 — Keep private notes and track spending per trip (Priority: P2)

**Goal**: The daily-use loop — notes at three anchor levels, expenses in multiple currencies with frozen rates, and a correct home-currency summary.

**Independent Test**: On an existing trip, write one country-level note and one city-level note, log three expenses in two different currencies, confirm the summary totals are correct in the home currency, then move the country-level note into a specific city and confirm it reappears under that city.

### Tests for User Story 2 ⚠️ Write first, confirm failing

- [ ] T071 [P] [US2] Integration test — note CRUD and movement between trip, country, and city levels preserving body and creation date — in `apps/api/test/integration/notes.spec.ts` (FR-017, FR-018)
- [ ] T072 [P] [US2] Integration test — a note without at least a country anchor is rejected — in `apps/api/test/integration/notes-anchor.spec.ts` (FR-019)
- [ ] T073 [P] [US2] Contract test — no expense or document route accepts a visibility parameter — in `apps/api/test/contract/no-visibility-param.spec.ts` (contract test 9, FR-027, FR-032)
- [ ] T074 [P] [US2] Integration test — an edited expense never recomputes its stored conversion rate — in `apps/api/test/integration/expenses-fx-freeze.spec.ts` (FR-022)
- [ ] T075 [P] [US2] Contract test — an expense with no available rate is stored with `fx_pending`, not rejected — in `apps/api/test/contract/fx-pending.spec.ts` (contract test 12)
- [ ] T076 [P] [US2] Integration test — the spending summary totals by category and by day in the home currency and discloses applied rates — in `apps/api/test/integration/expenses-summary.spec.ts` (FR-025, FR-026)
- [ ] T077 [P] [US2] Privacy test — account B cannot read A's expenses by trip id, by direct expense id, or via the summary — in `apps/api/test/privacy/expenses.spec.ts` (adversarial rows 1–3, SC-012)
- [ ] T078 [P] [US2] Unit test — currency conversion and home-amount precomputation — in `apps/api/test/unit/fx.spec.ts` (FR-021)

### Implementation for User Story 2

- [ ] T079 [P] [US2] Implement the notes module in `apps/api/src/modules/notes/notes.controller.ts` and `apps/api/src/modules/notes/notes.service.ts` (FR-017, FR-018, FR-019)
- [ ] T080 [P] [US2] Implement expense categories with seeded system defaults and user-scoped custom categories in `apps/api/src/modules/expenses/categories.controller.ts` (FR-023, FR-024)
- [ ] T081 [US2] Implement the FX rate service and the `fx_rates` refresh job in `apps/api/src/modules/expenses/fx.service.ts` (FR-021, research D-10)
- [ ] T082 [US2] Implement expenses CRUD, resolving and freezing the rate at entry, in `apps/api/src/modules/expenses/expenses.controller.ts` (FR-020, FR-021, FR-022)
- [ ] T083 [US2] Implement `GET /trips/:tripId/expenses/summary` returning `by_category`, `by_day`, `total_home`, `rates_applied`, and `pending_conversion` in `apps/api/src/modules/expenses/summary.service.ts` (FR-025, FR-026)
- [ ] T084 [P] [US2] Build the notes list and editor screens in `apps/mobile/src/app/trip/[id]/notes.tsx` and `apps/mobile/src/components/trip/note-editor.tsx`
- [ ] T085 [US2] Build the note anchor-level move control in `apps/mobile/src/features/notes/use-move-note.ts` (FR-018)
- [ ] T086 [P] [US2] Build the expense list screen and add-expense modal in `apps/mobile/src/app/trip/[id]/expenses.tsx` and `apps/mobile/src/app/modal/add-expense.tsx`
- [ ] T087 [US2] Build the spending summary with per-category and per-day breakdown and multi-currency rate disclosure in `apps/mobile/src/components/trip/spending-summary.tsx` (FR-025, FR-026)
- [ ] T088 [US2] Write the Maestro flow `apps/mobile/e2e/02-notes-and-expenses.yaml` covering both note levels, three expenses in two currencies, and the note move

**Checkpoint**: US1 and US2 both work independently. The data model is validated before visual work begins.

---

## Phase 5: User Story 3 — See your travel history as a 3D globe (Priority: P3)

**Goal**: The signature surface — the traveller's own history as arcs on a 3D globe, active trip animated.

**Independent Test**: With an account holding three trips in different statuses, open the home screen and confirm three visually distinct arcs render between the correct cities, that the active trip is animated, and that tapping an arc opens the correct trip.

### Tests for User Story 3 ⚠️ Write first, confirm failing

- [ ] T089 [P] [US3] Integration test — arcs derive correctly from consecutive stops, and inserting a stop mid-trip changes them with no separate maintenance — in `apps/api/test/integration/arcs.spec.ts` (FR-016)
- [ ] T090 [P] [US3] Integration test — profile statistics return countries visited and total distance travelled — in `apps/api/test/integration/stats.spec.ts` (FR-050)
- [ ] T091 [P] [US3] Component test — the globe renders a purposeful empty state for an account with no trips — in `apps/mobile/src/components/globe/__tests__/empty-state.test.tsx` (FR-051)

### Implementation for User Story 3

- [ ] T092 [P] [US3] Implement travel statistics on `GET /me` using PostGIS distance aggregation in `apps/api/src/modules/users/stats.service.ts` (FR-050)
- [ ] T093 [P] [US3] Build the `@rnmapbox/maps` MapView wrapper with `projection="globe"` in `apps/mobile/src/components/globe/globe-view.tsx` (research D-06, FR-045)
- [ ] T094 [US3] Build the arc source with `@turf/great-circle` densification in `apps/mobile/src/components/globe/arc-source.tsx` (FR-045)
- [ ] T095 [US3] Implement per-status arc styling and the active-trip animation in `apps/mobile/src/components/globe/arc-styles.ts` (FR-046)
- [ ] T096 [US3] Implement arc tap handling opening the correct trip in `apps/mobile/src/components/globe/use-arc-press.ts` (FR-047)
- [ ] T097 [P] [US3] Build the statistics overlay in `apps/mobile/src/components/globe/stats-overlay.tsx` (FR-050)
- [ ] T098 [P] [US3] Build the no-trips empty state in `apps/mobile/src/components/globe/empty-state.tsx` (FR-051)
- [ ] T099 [US3] Make the globe the home screen in `apps/mobile/src/app/(tabs)/index.tsx`, relocating the trip list
- [ ] T100 [US3] Verify 60fps with 50+ arcs on a mid-tier device and record the measurement in `specs/001-triptrackr-mvp/perf-notes.md` (SC-002)
- [ ] T101 [US3] Write the Maestro flow `apps/mobile/e2e/03-globe.yaml` covering three trips in three statuses and arc tap navigation

**Checkpoint**: The product's identity surface is live.

---

## Phase 6: User Story 4 — Zoom from the globe into street-level detail (Priority: P4)

**Goal**: One continuous camera from globe to street, with terrain and buildings at close range.

**Independent Test**: From the globe, zoom continuously into a city with a recorded stop and confirm the transition is unbroken and that detailed terrain and buildings appear at close range.

### Tests for User Story 4 ⚠️ Write first, confirm failing

- [ ] T102 [P] [US4] Component test — a single MapView instance persists across the full zoom range, proving there is no second view to break between — in `apps/mobile/src/components/globe/__tests__/continuous-zoom.test.tsx` (FR-048)

### Implementation for User Story 4

- [ ] T103 [US4] Add the terrain source and 3D building extrusion layers in `apps/mobile/src/components/globe/terrain-layers.tsx` (FR-049)
- [ ] T104 [US4] Tune the camera zoom curve and pitch transition in `apps/mobile/src/components/globe/camera.ts` (FR-048)
- [ ] T105 [P] [US4] Implement offline map pack download for a city in `apps/mobile/src/features/trips/use-offline-pack.ts` with a management screen in `apps/mobile/src/app/trip/[id]/offline-maps.tsx` (FR-044)
- [ ] T106 [US4] Write the Maestro flow `apps/mobile/e2e/04-zoom.yaml` covering the continuous globe-to-street zoom

**Checkpoint**: The globe's full promise is delivered.

---

## Phase 7: User Story 5 — Store photos and travel documents against a trip (Priority: P5)

**Goal**: Photos in a trip gallery with thumbnails and EXIF; documents permanently private, encrypted at rest, screenshot-blocked, with boarding-pass extraction offered for confirmation.

**Independent Test**: Upload three photos and one boarding pass to a trip, confirm the photos appear in the trip gallery, confirm the boarding pass's flight details were extracted, and confirm no interface anywhere offers to share the document.

### Tests for User Story 5 ⚠️ Write first, confirm failing

- [ ] T107 [P] [US5] Contract test — setting a photo public while moderation is pending succeeds, and the photo remains publicly unreachable — in `apps/api/test/contract/moderation-gate.spec.ts` (contract test 8, FR-056)
- [ ] T108 [P] [US5] Privacy test — account B cannot read A's documents by any available route, nor A's pending-moderation photo — in `apps/api/test/privacy/documents-and-photos.spec.ts` (adversarial rows 4 and 6, SC-012, SC-014)
- [ ] T109 [P] [US5] Integration test — the upload-URL, byte-upload, register-metadata sequence transitions `upload_state` correctly and a record is not clean until the object store confirms — in `apps/api/test/integration/uploads.spec.ts` (FR-041)
- [ ] T110 [P] [US5] Integration test — a document row read directly from the database yields ciphertext, not readable content — in `apps/api/test/integration/document-encryption.spec.ts` (FR-033)
- [ ] T111 [P] [US5] Unit test — boarding-pass barcode parsing populates `parsed_json` and leaves `parsed_confirmed_at` null until confirmed — in `apps/api/test/unit/boarding-pass.spec.ts` (FR-035, Constitution IV)

### Implementation for User Story 5

- [ ] T112 [US5] Implement the photos module — upload URL, metadata registration, listing with short-lived signed thumbnail URLs, visibility patch, tombstone delete — in `apps/api/src/modules/photos/photos.controller.ts` (FR-028, FR-030)
- [ ] T113 [US5] Implement the media worker performing thumbnail generation, EXIF extraction, and content moderation in `apps/api/src/workers/media.processor.ts` (FR-029, FR-030, FR-056, research D-12)
- [ ] T114 [US5] Implement the documents module with per-row envelope encryption on write and unwrap on read in `apps/api/src/modules/documents/documents.controller.ts` — no visibility parameter accepted anywhere (FR-031, FR-032, FR-033)
- [ ] T115 [US5] Implement boarding-pass barcode extraction into `parsed_json` and the confirmation patch setting `parsed_confirmed_at` in `apps/api/src/modules/documents/boarding-pass.service.ts` (FR-035)
- [ ] T116 [P] [US5] Build photo capture and selection with client-side resizing in `apps/mobile/src/features/photos/use-capture.ts`
- [ ] T117 [US5] Build the trip photo gallery with an explicit pending treatment for un-uploaded bytes in `apps/mobile/src/app/trip/[id]/photos.tsx` (FR-041)
- [ ] T118 [US5] Build the document list, scan flow, and extracted-field confirmation form in `apps/mobile/src/app/trip/[id]/documents.tsx` and `apps/mobile/src/components/trip/document-confirm-form.tsx` (FR-035)
- [ ] T119 [US5] Apply `expo-screen-capture` prevention while any document is displayed in `apps/mobile/src/features/documents/use-screen-capture-guard.ts` (FR-034, research D-05)
- [ ] T120 [US5] Write the Maestro flow `apps/mobile/e2e/05-photos-and-documents.yaml` covering three photos, one boarding pass, extraction confirmation, and the absence of any document share affordance

**Checkpoint**: The file-handling path exists, which the offline layer must now account for.

---

## Phase 8: User Story 6 — Work fully offline and reconcile on reconnect (Priority: P6) 🚧 HARD GATE

**Goal**: Every capture path works with no connectivity, survives termination, and reconciles deterministically on reconnect.

**Independent Test**: In aeroplane mode, create, edit, and delete notes, expenses, photo captures, and documents. Force-quit and relaunch — all of it is still there. Restore connectivity and confirm every change reaches the server, deletions included. Separately, edit the same record on two devices before either syncs and confirm exactly one version wins deterministically and the losing device is told.

### Tests for User Story 6 ⚠️ Write first, confirm failing

- [ ] T121 [P] [US6] Contract test — the pull cursor is opaque over `(updated_at, id)` and no row is skipped or repeated at a page boundary — in `apps/api/test/contract/sync-cursor.spec.ts` (sync-protocol.md §1, SC-011)
- [ ] T122 [P] [US6] Contract test — soft-deleted rows are returned by `/sync/pull` and by no other read path — in `apps/api/test/contract/sync-tombstones.spec.ts` (FR-039)
- [ ] T123 [P] [US6] Contract test — the push conflict rule applies last-write-wins and returns `conflict` carrying `server_version` — in `apps/api/test/contract/sync-conflict.spec.ts` (FR-040, research D-02)
- [ ] T124 [P] [US6] Contract test — a push retried with the same client-generated `id` is an idempotent upsert of the same key, returns the same result, and creates no duplicate — in `apps/api/test/contract/sync-idempotency.spec.ts` (sync-protocol.md §2, research D-15)
- [ ] T125 [P] [US6] Contract test — an `updated_at` beyond tolerance ahead of server time is clamped to receipt time and the clamping is logged — in `apps/api/test/contract/sync-clock-clamp.spec.ts` (sync-protocol.md §2)
- [ ] T126 [P] [US6] Integration test — a pull with no cursor returns a full snapshot and paginates via `has_more` — in `apps/api/test/integration/sync-snapshot.spec.ts` (FR-042)
- [ ] T199 [P] [US6] Contract test — tables pushed in `SYNC_TABLES` order apply a trip, its stop, and an expense against it in one cycle; a child whose parent has not been applied is returned `rejected` with `reason: "parent_missing"` and stays dirty; an `id` owned by another traveller is returned `rejected` with `reason: "id_unavailable"` and discloses nothing — in `apps/api/test/contract/sync-parent-order.spec.ts` (sync-protocol.md §2, research D-15, D-16)
- [ ] T200 [P] [US6] Contract test — every `/sync/push` body is validated with `PushRequest` and every `/sync/pull` response conforms to `PullResponse` from `@triptrackr/contracts`; a record carrying an unknown key (an `is_public` smuggled onto an expense or a document, a client-set `status` on a trip) is `rejected` with `reason: "invalid"` by the strict schema — in `apps/api/test/contract/sync-contracts.spec.ts` (FR-013, FR-027, FR-032, research D-13)

### Implementation for User Story 6

- [ ] T127 [US6] Implement `GET /sync/pull` with the opaque cursor and tombstone inclusion across all seven `SYNC_TABLES`, custom `expense_categories` rows only, in `apps/api/src/modules/sync/pull.service.ts` (sync-protocol.md §1, research D-16)
- [ ] T128 [US6] Implement `POST /sync/push` with the conflict rule as **the single implementation in the system**, batched per table in `SYNC_TABLES` dependency order and idempotent by client-generated `id`, returning a `PushResult` per record — `applied` (optionally with `warnings: ['over_allowance']` for a trip pushed by an account at its allowance, which is kept, never rejected), `conflict` carrying `server_version`, or `rejected` with `reason` `parent_missing` | `id_unavailable` | `invalid` — in `apps/api/src/modules/sync/push.service.ts` (FR-040, research D-02, D-08, D-15, D-16, Constitution V)
- [ ] T129 [P] [US6] Implement the 90-day tombstone retention purge job in `apps/api/src/workers/tombstone-purge.processor.ts` (sync-protocol.md §5)
- [ ] T201 [US6] Both `apps/api/src/modules/sync/*` and `apps/mobile/src/sync/*` MUST import their schemas and types from `@triptrackr/contracts` — `SYNC_TABLES`, `SyncTable`, `PushRequest`, `PushResponse`, `PushResult`, `PullQuery`, `PullResponse`, and the `*PushRecord`/`*PullRecord` schemas — with no local copies of any record shape; add a CI guard (lint rule or grep step in `.github/workflows/ci.yml`) that fails on a `z.object`/`z.strictObject` defining a sync record outside `packages/contracts/src/` (research D-13)
- [ ] T130 [US6] Implement local-first writes for notes, expenses, photo metadata, and document metadata in `apps/mobile/src/features/notes/local-write.ts`, `apps/mobile/src/features/expenses/local-write.ts`, `apps/mobile/src/features/photos/local-write.ts`, and `apps/mobile/src/features/documents/local-write.ts`, generating the row's UUID `id` on the device and setting `is_dirty` on every write (FR-036, research D-15)
- [ ] T202 [US6] Implement local-first writes for trips, stops, and custom expense categories in `apps/mobile/src/features/trips/local-write.ts` and `apps/mobile/src/features/expenses/local-write.ts` (categories), so that a trip — and an expense against it — can be created in aeroplane mode and is accepted locally regardless of the cached entitlement (research D-08, D-16)
- [ ] T131 [US6] Implement the sync engine cursor store and cycle scheduler in `apps/mobile/src/sync/engine.ts` and `apps/mobile/src/sync/cursor.ts`
- [ ] T132 [US6] Implement dirty-row push in `apps/mobile/src/sync/push.ts` — one `PushRequest` per table, tables in `SYNC_TABLES` order (parents before children); on `applied` mark `synced_at` and clear `is_dirty` (there is no `server_id` write-back — identity is client-generated, research D-15); on `rejected` leave the row dirty for the next cycle (`parent_missing`), regenerate the `id` locally (`id_unavailable`), or surface a repair (`invalid`); surface `warnings: ['over_allowance']` to the entitlement flow without touching the trip (Constitution V)
- [ ] T133 [US6] Implement pull application, tombstone handling, and the conflict notification surfaced to the traveller when the overwritten content actually differed, in `apps/mobile/src/sync/pull.ts` and `apps/mobile/src/components/ui/conflict-notice.tsx` (FR-040)
- [ ] T134 [US6] Implement the binary upload queue with Wi-Fi preference, exponential backoff, and cancellation on record delete in `apps/mobile/src/sync/upload-queue.ts` (FR-041, sync-protocol.md §4)
- [ ] T135 [US6] Implement the four sync triggers — 30s foreground timer, connectivity restored, app foregrounded, first launch after sign-in — in `apps/mobile/src/sync/triggers.ts` (FR-038, sync-protocol.md §3)
- [ ] T136 [US6] Build the explicit first-sync state screen in `apps/mobile/src/app/(tabs)/syncing.tsx`, never an empty screen (FR-042)
- [ ] T137 [US6] Implement the sign-out guard that pushes first and warns explicitly if it cannot complete, in `apps/mobile/src/features/auth/use-sign-out.ts` (Constitution V)
- [ ] T138 [US6] Route all trip content reads through the local database so previously synced trips are readable offline, in `apps/mobile/src/features/trips/queries.ts` (trips and stops), `apps/mobile/src/features/notes/queries.ts`, `apps/mobile/src/features/expenses/queries.ts` (expenses and categories), `apps/mobile/src/features/photos/queries.ts`, and `apps/mobile/src/features/documents/queries.ts` (FR-043)
- [ ] T139 [US6] Fail a capture cleanly with a clear message when device storage is exhausted, leaving no half-written record, in `apps/mobile/src/features/photos/use-capture.ts` (sync-protocol.md §4)
- [ ] T140 [US6] Write the full Maestro offline acceptance suite covering scenarios 1–12 in `apps/mobile/e2e/06-offline-acceptance.yaml` with network toggling, app kill, and a two-device conflict (sync-protocol.md §6)
- [ ] T203 [US6] Extend the Maestro offline acceptance suite in `apps/mobile/e2e/06-offline-acceptance.yaml` with acceptance rows 13–15 — a trip, a stop, and an expense against it created in aeroplane mode all arrive in one reconnect with the expense referencing the right trip; a stop deleted offline is gone on the second device and the arcs redraw; a trip created offline at the free allowance is kept and flagged with nothing lost (sync-protocol.md §6 rows 13–15, research D-08, D-16, Constitution V)
- [ ] T141 [US6] **GATE CHECKPOINT** — run the T140 + T203 suite (all fifteen scenarios) against real multi-device, connectivity-interrupted testing and record the passing result in `specs/001-triptrackr-mvp/gate-evidence.md`. SC-009, SC-010, and SC-011 must all hold. **User Story 7 is blocked until this task is complete.**

**Checkpoint**: 🚧 The gate. Social work may now begin, and not before.

---

## Phase 9: User Story 7 — Publish a curated trip and follow other travellers (Priority: P7)

**Goal**: An opt-in social layer where publishing is a per-object act and nothing private is reachable by any route.

**⚠️ Blocked on T141.**

**Independent Test**: From account A, publish a trip with one note public and one note private. From account B, which does not follow A, open A's public trip and confirm only the public note appears, no expenses or documents are reachable by any route, and the private note is absent.

### Tests for User Story 7 ⚠️ Write first, confirm failing

- [ ] T142 [P] [US7] Privacy test — account B cannot read A's private note, A's public note inside a private trip, a trip made public then private again, or a tombstoned trip — in `apps/api/test/privacy/visibility.spec.ts` (adversarial rows 5, 7, 9, 10; FR-053, FR-057, SC-013)
- [ ] T143 [P] [US7] Privacy test — blocked account C reaches none of A's profile, public trip, feed entry, or discovery entry — in `apps/api/test/privacy/blocks.spec.ts` (adversarial row 8, FR-061)
- [ ] T144 [P] [US7] Privacy test — account B cannot write to any of A's rows — in `apps/api/test/privacy/ownership.spec.ts` (adversarial row 11)
- [ ] T145 [P] [US7] Integration test — a follow of a public profile is auto-accepted and of a private profile is pending — in `apps/api/test/integration/follows.spec.ts` (FR-058)
- [ ] T146 [P] [US7] Integration test — the feed and discovery exclude blocked relationships in both directions and paginate by cursor — in `apps/api/test/integration/feed.spec.ts` (FR-059, FR-060, FR-061)

### Implementation for User Story 7

- [ ] T147 [P] [US7] Implement follows with the public/private acceptance branch and follow-request acceptance in `apps/api/src/modules/social/follows.controller.ts` (FR-058)
- [ ] T148 [P] [US7] Implement block and unblock, and their interaction with the RLS predicates, in `apps/api/src/modules/social/blocks.controller.ts` (FR-061)
- [ ] T149 [P] [US7] Implement reporting of a trip, note, photo, or traveller in `apps/api/src/modules/social/reports.controller.ts` (FR-062)
- [ ] T150 [US7] Implement the cursor-paginated feed in `apps/api/src/modules/social/feed.service.ts` (FR-059)
- [ ] T151 [US7] Implement discovery by city and country in `apps/api/src/modules/social/discover.service.ts` (FR-060)
- [ ] T152 [US7] Implement the curated public trip projection — route, cover image, cities, explicitly public notes and approved public photos only — in `apps/api/src/modules/trips/public-view.service.ts` (FR-055)
- [ ] T153 [US7] Implement `GET /users/:id` returning not-found for a private non-followed profile and for a blocked requester, in `apps/api/src/modules/users/public-profile.service.ts` (FR-061)
- [ ] T154 [P] [US7] Build the feed tab in `apps/mobile/src/app/(tabs)/feed.tsx` (FR-059)
- [ ] T155 [P] [US7] Build the discover tab with city and country filters in `apps/mobile/src/app/(tabs)/discover.tsx` (FR-060)
- [ ] T156 [US7] Build the traveller profile screen with follow, block, and report actions in `apps/mobile/src/app/(tabs)/profile.tsx` and `apps/mobile/src/app/user/[id].tsx`
- [ ] T157 [US7] Build the independent per-object visibility toggles for trip, note, and photo in `apps/mobile/src/components/ui/visibility-toggle.tsx` — no global switch anywhere (FR-052, FR-053)
- [ ] T158 [US7] Write the Maestro flow `apps/mobile/e2e/07-social.yaml` covering publish-with-mixed-visibility and the non-follower's restricted view

**Checkpoint**: The growth loop is live on a proven sync layer.

---

## Phase 10: User Story 8 — Generate an editable day-by-day itinerary (Priority: P8)

**Goal**: A planner that proposes names, verifies every location before rendering it, and stays editable without full regeneration.

**Independent Test**: Request a two-day plan for a city, confirm every suggested place resolves to a real, correctly located pin, drag one activity to another day, and confirm the walking route redraws without regenerating the whole plan.

### Tests for User Story 8 ⚠️ Write first, confirm failing

- [ ] T159 [P] [US8] Contract test — a completed planner job contains zero items lacking a resolved location — in `apps/api/test/contract/planner-resolution.spec.ts` (contract test 10, FR-065, SC-017)
- [ ] T160 [P] [US8] Integration test — the per-day request quota engages and communicates the limit clearly — in `apps/api/test/integration/planner-quota.spec.ts` (FR-069)
- [ ] T161 [P] [US8] Integration test — a materially identical recent request is served from cache without a model call — in `apps/api/test/integration/planner-cache.spec.ts` (FR-070)
- [ ] T162 [P] [US8] Unit test — moving an item between days recomputes only the affected days' routes — in `apps/api/test/unit/route-recompute.spec.ts` (FR-067)

### Implementation for User Story 8

- [ ] T163 [US8] Implement the async planner job — `POST /trips/:tripId/planner/generate` returning a job id, and `GET /planner/jobs/:jobId` for progress — in `apps/api/src/modules/planner/planner.controller.ts` (FR-063, FR-068)
- [ ] T164 [US8] Implement the Anthropic call returning place **names only**, never coordinates, in `apps/api/src/modules/planner/llm.service.ts` (Constitution IV, research D-09)
- [ ] T165 [US8] Implement Mapbox geocoding that drops and logs any place below the confidence threshold rather than positioning it by guess, in `apps/api/src/modules/planner/geocode.service.ts` (FR-065)
- [ ] T166 [US8] Implement walking-route generation and backtrack-avoiding ordering via Mapbox Directions in `apps/api/src/modules/planner/routing.service.ts` (FR-066)
- [ ] T167 [US8] Implement itinerary item create, reorder, move-between-days, and delete with per-day route recomputation in `apps/api/src/modules/planner/itinerary.controller.ts` (FR-067)
- [ ] T168 [US8] Implement the durable per-day quota on `planner_requests` and the Redis request cache in `apps/api/src/modules/planner/quota.service.ts` (FR-069, FR-070)
- [ ] T169 [P] [US8] Build the itinerary screen with visible generation progress in `apps/mobile/src/app/trip/[id]/itinerary.tsx` (FR-068)
- [ ] T170 [US8] Build drag-between-days reordering with route redraw scoped to the affected days in `apps/mobile/src/features/planner/use-reorder.ts` (FR-067)
- [ ] T171 [US8] Write the Maestro flow `apps/mobile/e2e/08-planner.yaml` covering a two-day plan, pin verification, and a drag with scoped redraw

**Checkpoint**: Planning is live and every rendered pin is a verified place.

---

## Phase 11: User Story 9 — Reach the trip limit and choose to subscribe or make room (Priority: P9)

**Goal**: The allowance gates trip **creation** only, and never touches anything already recorded.

**Independent Test**: On an account at the free allowance, attempt to create another trip and confirm the choice is presented clearly. Take each branch separately: subscribe and confirm the trip is created; alternatively delete a trip and confirm the slot frees immediately. Then simulate a lapsed subscription on an over-allowance account and confirm every existing trip remains fully readable and editable while new creation is blocked.

### Tests for User Story 9 ⚠️ Write first, confirm failing

- [ ] T172 [P] [US9] Contract test — `POST /trips` at the allowance returns 409 carrying trips held, the allowance, both routes forward, and the echoed submission — in `apps/api/test/contract/allowance-blocked.spec.ts` (contract test 5, FR-077, FR-079)
- [ ] T173 [P] [US9] Contract test — `POST /trips` below the allowance returns no allowance or payment field at all — in `apps/api/test/contract/allowance-silent.spec.ts` (contract test 6, FR-084)
- [ ] T174 [P] [US9] Contract test — every non-create endpoint behaves identically under an active and a lapsed entitlement — in `apps/api/test/contract/lapsed-entitlement.spec.ts` (contract test 7, FR-080, SC-021)
- [ ] T175 [P] [US9] Contract test — `POST /billing/purchase-completed` replayed with the same transaction id grants exactly once — in `apps/api/test/contract/purchase-idempotency.spec.ts` (contract test 11, FR-083, SC-025)
- [ ] T176 [P] [US9] Privacy test — account B's read results are identical whether A's entitlement is active or lapsed — in `apps/api/test/privacy/entitlement-neutrality.spec.ts` (adversarial row 12)
- [ ] T177 [P] [US9] Integration test — deleting a trip frees a slot immediately, and repeated delete-and-recreate never drifts — in `apps/api/test/integration/allowance-accounting.spec.ts` (FR-075)

### Implementation for User Story 9

- [ ] T178 [US9] Implement the allowance check inside the `POST /trips` transaction as a live `count(*)` against a configured limit, in `apps/api/src/modules/trips/allowance.service.ts` — **the only code path in the API that reads entitlement state** (FR-074, FR-076, research D-08)
- [ ] T179 [US9] Make the launch allowance of 5 a configuration value in `apps/api/src/common/config/env.schema.ts`, not a constant in code (FR-074)
- [ ] T180 [P] [US9] Implement `GET /me/entitlement` returning `is_active`, `current_period_end`, `trips_held`, and `allowance` in `apps/api/src/modules/billing/entitlement.controller.ts` (FR-077, FR-082)
- [ ] T181 [US9] Implement `POST /billing/purchase-completed` verifying with RevenueCat before granting, idempotent by transaction id, in `apps/api/src/modules/billing/purchase.service.ts` (FR-078, FR-083)
- [ ] T182 [US9] Implement the signature-verified `POST /billing/webhook` as the authoritative entitlement update, rejecting unsigned calls, in `apps/api/src/modules/billing/webhook.controller.ts` (research D-07)
- [ ] T183 [P] [US9] Integrate `react-native-purchases` and build the paywall in `apps/mobile/src/features/billing/use-purchases.ts` and `apps/mobile/src/app/modal/paywall.tsx` (FR-078, FR-081)
- [ ] T184 [US9] Build the 409 branch presenting both routes forward and creating the pending trip immediately on successful subscription without re-entry, in `apps/mobile/src/features/trips/use-create-trip.ts` (FR-077, FR-079)
- [ ] T185 [US9] Suppress every reference to allowance and payment for an account below the free allowance, in `apps/mobile/src/features/billing/use-entitlement.ts` (FR-084)
- [ ] T186 [US9] Build self-service cancellation stating plainly the date the change takes effect, in `apps/mobile/src/app/modal/manage-subscription.tsx` (FR-082)
- [ ] T187 [US9] Write the Maestro flow `apps/mobile/e2e/09-allowance.yaml` covering both branches separately and the lapsed-entitlement read and edit check

**Checkpoint**: All nine user stories are independently functional.

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Obligations that span every story, and the launch-blocking verifications.

- [ ] T188 [P] Implement account deletion — `DELETE /me` cascading rows **and** enqueuing an object-storage sweep that must confirm before deletion is complete — in `apps/api/src/modules/users/deletion.service.ts` and `apps/api/src/workers/storage-sweep.processor.ts` (FR-006, Constitution V)
- [ ] T189 [P] Write the residue test asserting no object-storage key survives an account deletion, in `apps/api/test/integration/deletion-residue.spec.ts` (SC-015)
- [ ] T190 [P] Implement the async `POST /me/export` job producing a portable archive delivered by signed URL, in `apps/api/src/modules/users/export.service.ts` (FR-007)
- [ ] T191 [P] Write the backup and restore-rehearsal scripts in `infra/scripts/backup.sh` and `infra/scripts/restore-rehearsal.sh`, and perform an actual restore (SC-020, RTO 1h / RPO 24h)
- [ ] T192 [P] Write k6 load tests for `/planner/generate` and `/feed` in `apps/api/test/load/` (SC-003)
- [ ] T193 [P] State the 90-day tombstone retention window plainly to travellers in the privacy section of `apps/mobile/src/app/(tabs)/profile.tsx` (Constitution V)
- [ ] T194 Verify cold start to interactive globe is under 3 seconds on a mid-tier device (SC-001)
- [ ] T195 Verify coverage is at or above 80% across unit, integration, and E2E, and that CI fails below it (Constitution III)
- [ ] T196 Security hardening pass — Traefik rate limits, secret rotation procedure, and confirmation that no raw card field exists anywhere in the codebase (FR-081)
- [ ] T197 [P] Update `AGENTS.md` and write `README.md` for both deployables from [quickstart.md](./quickstart.md)
- [ ] T198 Run the full [quickstart.md](./quickstart.md) §11 check before calling the release done

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — starts immediately
- **Foundational (Phase 2)**: Depends on Setup — **blocks every user story**
- **Remediation (Phase 2b)**: Depends on Setup and Foundational — **also blocks every user story**. R004 and R005 change the schema and the connection every server story queries through; R008 and R009 replace the tree every mobile screen mounts in; T201 fixes where the sync shapes live before T127/T128/T132 are written
- **US1–US6, US8, US9**: Depend on Foundational and Remediation
- **US7 (Phase 9)**: Depends on Foundational **and on T141, the sync gate** — the one cross-story dependency in the plan, and it is constitutional
- **Polish (Phase 12)**: Depends on all desired stories being complete

### Story Dependencies in Detail

| Story    | Depends on    | Nature                                                                                                                      |
| -------- | ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| US1 (P1) | Phase 2, 2b   | None beyond foundation                                                                                                      |
| US2 (P2) | Phase 2, 2b   | Uses US1's trips in practice; independently testable against a seeded trip                                                  |
| US3 (P3) | Phase 2, 2b   | Renders trip data; testable against seeded trips                                                                            |
| US4 (P4) | US3           | Extends the same MapView instance                                                                                           |
| US5 (P5) | Phase 2, 2b   | Introduces the file path the offline layer must handle                                                                      |
| US6 (P6) | US1, US2, US5 | Syncs trips, stops, categories, notes, expenses, photo and document metadata — those write paths must exist (research D-16) |
| US7 (P7) | **T141 gate** | Hard block. Non-negotiable                                                                                                  |
| US8 (P8) | Phase 2, 2b   | Independent of the social layer                                                                                             |
| US9 (P9) | US1           | Constrains `POST /trips`, which must work unconditionally first                                                             |

### Within Each User Story

- Tests are written and confirmed **failing** before implementation (Constitution III)
- Schema before services, services before endpoints, endpoints before screens
- Privacy tests are written from the attacker's side, never the owner's

### Parallel Opportunities

- Phase 1: T002–T005 and T007–T013 run in parallel
- Phase 2: the seven schema definitions T015–T021 run in parallel; server plumbing T029–T036 runs in parallel; mobile plumbing T039, T040, T043, T044 runs in parallel
- Phase 2b: R004–R007 (server), R008–R011 (mobile), and R012–R014 (infra, CI, docs) are three independent streams; within the server stream R004 precedes R005 and R007
- Every story's test block runs fully in parallel — different files, no shared state
- With multiple developers after Phases 2 and 2b: US1+US2 (data), US3+US4 (globe), US5 (media), and US8 (planner) proceed concurrently. US6 converges them. US7 waits.

---

## Parallel Example: User Story 6 Tests

```bash
# Launch the entire sync contract suite together — eight independent files:
Task: "Contract test opaque cursor page boundary in apps/api/test/contract/sync-cursor.spec.ts"
Task: "Contract test tombstones returned only by pull in apps/api/test/contract/sync-tombstones.spec.ts"
Task: "Contract test last-write-wins conflict in apps/api/test/contract/sync-conflict.spec.ts"
Task: "Contract test push idempotency by client-generated id in apps/api/test/contract/sync-idempotency.spec.ts"
Task: "Contract test clock clamping in apps/api/test/contract/sync-clock-clamp.spec.ts"
Task: "Integration test full snapshot pull in apps/api/test/integration/sync-snapshot.spec.ts"
Task: "Contract test parents-before-children and parent_missing in apps/api/test/contract/sync-parent-order.spec.ts"
Task: "Contract test payloads validated by @triptrackr/contracts in apps/api/test/contract/sync-contracts.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational — **critical, blocks everything**
3. Complete Phase 2b: Remediation — the audit fixes; the first product screen is not built on the uncorrected scaffold
4. Complete Phase 3: User Story 1
5. **STOP and VALIDATE**: register, create a two-stop trip, relaunch, confirm persistence
6. Shippable slice: a working itinerary skeleton

### Incremental Delivery

1. Setup + Foundational + Remediation → policed database on the right connection string, both clients boot on a template-free tree
2. US1 → **MVP**: accounts and multi-stop trips
3. US2 → the daily-use loop; the data model is now validated
4. US3 + US4 → the product's identity surface
5. US5 → media and documents
6. US6 → **the gate**: offline correctness proven before privacy correctness gets harder
7. US7 → the growth loop, on proven foundations
8. US8 → planning
9. US9 → revenue, applied last to a flow already proven to work unconditionally

### Why the Order Is Not Negotiable at Two Points

- **US6 before US7**: proving the sync engine against a private-only data model avoids debugging synchronisation correctness and privacy correctness simultaneously — the failure mode Constitution II was written to prevent.
- **US1 before US9**: building the limit before the thing being limited risks designing the product around the paywall rather than the other way round (spec, User Story 9 rationale).

---

## Notes

- `[P]` marks tasks touching different files with no incomplete dependencies
- `[Story]` labels give traceability from any task back to a user story and its requirements
- Identifiers are stable once assigned: the 2026-09-23 remediation uses `R001`–`R014`, and the tasks added to User Story 6 for the widened sync scope are numbered `T199`–`T203` after the last original task, so no earlier reference (T141 above all) shifts
- Every test task must be seen to **fail** before its implementation task begins
- Commit after each task or logical group
- Every checkpoint is a genuine stopping point where the product is demonstrable
- The privacy suite in `apps/api/test/privacy/` is a required CI job, never an optional one — a behavioural suite cannot detect its own disablement, which is why T026 asserts on `pg_catalog` instead
