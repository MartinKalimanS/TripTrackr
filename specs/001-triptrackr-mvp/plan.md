# Implementation Plan: TripTrackr MVP

**Branch**: `001-triptrackr-mvp` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-triptrackr-mvp/spec.md`

**Constitution**: [.specify/memory/constitution.md](../../.specify/memory/constitution.md) v1.0.0

---

## Summary

TripTrackr is a private-by-default, offline-first mobile travel journal with an opt-in social layer,
delivered as an Expo/React Native client against a self-hosted NestJS + PostgreSQL/PostGIS backend.

The technical approach is shaped by three constraints that outrank convenience:

1. **Privacy is enforced at the data layer.** PostgreSQL Row-Level Security policies, driven by a
   per-request session variable set in middleware, are the authority on who may read what. Expenses
   and documents have no visibility column at all — they are unreachable by construction, not by a
   filter the application must remember to apply (Constitution I; FR-027, FR-032, FR-054).
2. **Local-first writes, then reconciliation.** Notes, expenses, photo metadata, and document
   metadata are written to an on-device encrypted SQLite database and pushed to the server on a
   timer and on reconnect. Deletions are tombstones. Conflicts resolve server-side, last-write-wins,
   in one place. Binary uploads are a separate queue, and a record is not "saved" until its bytes
   land (Constitution II; FR-036–FR-044).
3. **Sync is a gate, not a phase.** The social layer (User Story 7) does not begin until the offline
   acceptance suite passes against real multi-device, connectivity-interrupted testing
   (Constitution II and "Development Workflow"; spec "Sequencing constraint").

The signature surface — a 3D globe of the traveller's own history — is a single `@rnmapbox/maps`
`MapView` with `projection="globe"`, which also supplies the continuous globe-to-street zoom
(FR-048) without a second view or a hand-written transition.

---

## Technical Context

**Language/Version**: TypeScript 6.0 (`typescript@~6.0.3`, one version across the whole
workspace); Node.js 22 LTS (server and tooling).

**Primary Dependencies**:

_Mobile_ — Expo SDK 57 via the dev-client workflow (the managed workflow is insufficient; native
modules are required), React Native 0.86.3, React 19.2.3, `expo-router` 57 with typed routes
(already configured), `@rnmapbox/maps` (globe, map, offline packs), `expo-sqlite` with SQLCipher
(encrypted local store), Drizzle ORM (local schema and migrations), TanStack Query v5 (server
state), Zustand (ephemeral UI state), `expo-secure-store` (tokens and the local database key),
`expo-screen-capture` (FR-034), `expo-camera` / `expo-image-picker` / `expo-image-manipulator`
(capture), `expo-file-system` (upload staging), `react-native-purchases` — RevenueCat (FR-078 to
FR-083), `@turf/great-circle` (arc densification), Sentry (FR-073, with Session Replay and
Feedback **disabled** — research D-18). **No web target** (research D-14): `react-native-web`,
`react-dom`, and every `*.web.tsx` variant are removed; the app ships to iOS and Android only.

_Shared_ — `@triptrackr/contracts` (research D-13): the zod schemas for the sync protocol and the
REST DTOs, consumed by both deployables so that the client and the server cannot disagree about a
record's shape.

_Server_ — NestJS 11, Drizzle ORM for typed queries with hand-written, transactional SQL migrations
(schema, RLS policies, and auth functions — research D-19), `postgres` (postgres.js) as the driver,
Redis 7 (sessions, rate limits, planner cache), BullMQ (media worker), `@aws-sdk/client-s3` against
S3-compatible storage (MinIO in development, Cloudflare R2 in production), the Anthropic SDK
(planner), Mapbox Geocoding and Directions (place verification and walking routes), Resend
(transactional email), Traefik (TLS and coarse rate limiting).

**Storage**: PostgreSQL 17 with PostGIS 3.5, self-hosted in Docker, RLS enabled on every
traveller-owned table. Redis 7 for ephemeral state. S3-compatible object storage for photo and
document bytes — private buckets only, served exclusively through time-limited signed URLs. On
device: a SQLCipher-encrypted SQLite database for the offline mirror, with its key held in the iOS
Keychain / Android Keystore through `expo-secure-store`.

**Testing**: Jest (unit, both sides); Supertest against a real PostgreSQL via Testcontainers
(integration — a mocked database cannot exercise an RLS policy, Constitution III); React Native
Testing Library (mobile components); Maestro (mobile E2E, including network-toggled offline flows);
k6 (load, aimed at `/planner/generate` and `/feed`). Coverage floor 80%.

**Target Platform**: iOS 15.1+ and Android 8.0 (API 26)+ — the React Native 0.86 baseline. Server:
Linux x86-64 running Docker Compose on a single Hetzner CX-class VPS.

**Project Type**: Mobile application plus a self-hosted REST API — two deployables, one repository.

**Performance Goals**: Cold start to interactive globe under 3s (SC-001); 60fps globe with 50+ arcs
on a mid-tier device (SC-002); API p95 under 300ms for CRUD, planner excluded as it is async by
design (SC-003); itinerary delivered within 60s with visible progress throughout (SC-004); sync
complete within 30s of reconnect for a typical day's capture (SC-010).

**Constraints**: Offline-capable for all capture, and for reading anything previously synced.
No hyperscaler dependency — the whole stack runs on one modest VPS. Zero cross-account reachability
of expenses and documents, proven adversarially (SC-012). No raw card details ever touch this system
(FR-081). Backups verified by an actual restore, RTO 1h / RPO 24h (SC-020).

**Scale/Scope**: 9 user stories, 85 functional requirements, 25 success criteria. Roughly 20
persisted entities, 60 REST endpoints, and 30 mobile screens. Target 10k travellers on a single box,
with vertical headroom before any architectural change is warranted.

**Unknowns**: None outstanding. Every `NEEDS CLARIFICATION` raised while drafting this section was
resolved in Phase 0 — see [research.md](./research.md), decisions D-01 through D-12. The
2026-09-23 architecture audit added D-13 through D-20 and amended this plan's Project Structure;
the amendments are recorded in research.md rather than silently applied here.

---

## Constitution Check

_GATE: evaluated before Phase 0 research, and re-evaluated after Phase 1 design._

### Principle I — Privacy Is Structural, Not Conditional (NON-NEGOTIABLE)

| Gate                                            | Status   | How the design satisfies it                                                                                                                                                                |
| ----------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Expenses and documents carry no visibility flag | **PASS** | The `expenses` and `documents` tables have no `visibility` column in [data-model.md](./data-model.md). There is nothing to set wrongly.                                                    |
| Visibility enforced at the data-access layer    | **PASS** | RLS policies on every owned table, driven by an `app.current_user_id` session variable set per request. Specified in [contracts/data-access-policy.md](./contracts/data-access-policy.md). |
| Client-side filtering never the only barrier    | **PASS** | The globe component renders whatever arcs the API returned and knows nothing about privacy. The API returns nothing private.                                                               |
| Independent per-object visibility               | **PASS** | `trips.is_public`, `notes.is_public`, and `photos.is_public` are separate columns on separate tables. No global switch exists in the schema or the API.                                    |
| New surfaces state their visibility posture     | **PASS** | Every table in the data model carries an explicit posture line; every endpoint in [contracts/rest-api.md](./contracts/rest-api.md) states its access rule.                                 |

### Principle II — Offline Is the Default Assumption

| Gate                                                         | Status   | How the design satisfies it                                                                                                              |
| ------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Local-first writes for notes, expenses, photos, documents    | **PASS** | The encrypted local database is the write target; the network is a background reconciler.                                                |
| Deletions are synchronisable events                          | **PASS** | `deleted_at` tombstones on both sides; the pull feed emits deletions as first-class changes.                                             |
| Nothing presented as saved before its bytes arrive           | **PASS** | An `upload_state` column on photo and document records; the record is not clean until the object store confirms.                         |
| One deterministic conflict rule, server-side, loser informed | **PASS** | Last-write-wins on `updated_at`, decided only inside `POST /sync/push`, which returns a `conflict` verdict carrying the winning version. |
| Sync proven before any social feature                        | **PASS** | Encoded as an explicit build gate; the social section of the API contract is marked blocked on the sync acceptance suite.                |

### Principle III — Test-First, and Privacy Tests Run as an Attacker

| Gate                                           | Status   | How the design satisfies it                                                                                                      |
| ---------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Tests before implementation                    | **PASS** | Task generation will order tests ahead of implementation within each story.                                                      |
| 80% coverage across unit, integration, and E2E | **PASS** | Enforced in CI; below the threshold fails the build.                                                                             |
| Integration tests against a real database      | **PASS** | Testcontainers PostgreSQL + PostGIS, not a mock — an RLS policy is only real when the real engine evaluates it.                  |
| Adversarial privacy suite every release        | **PASS** | A dedicated non-owner suite, specified in [quickstart.md](./quickstart.md) §4, as a required CI job rather than an optional one. |
| Offline acceptance test automated              | **PASS** | A Maestro flow with network toggling, app kill and restart, and a two-device conflict — [quickstart.md](./quickstart.md) §5.     |

### Principle IV — Verify Before You Render

| Gate                                                | Status   | How the design satisfies it                                                                                                     |
| --------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Suggested places resolve before appearing           | **PASS** | The planner geocodes every named place; unresolved or low-confidence results are dropped and logged, never positioned by guess. |
| LLM output treated as a proposal                    | **PASS** | The model returns names only. Coordinates come exclusively from the geocoder.                                                   |
| Scanned and extracted data offered for confirmation | **PASS** | Boarding-pass and EXIF extraction populate a confirmation form; nothing is committed unconfirmed.                               |
| Photos screened before public visibility            | **PASS** | `moderation_state` sits inside the RLS predicate itself, independent of the owner's `visibility` setting.                       |

### Principle V — Nothing a Traveller Recorded Is Ever Held Hostage

| Gate                                                         | Status   | How the design satisfies it                                                                                             |
| ------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| Commercial limits gate creation only                         | **PASS** | The allowance is checked in exactly one place: `POST /trips`. No read, update, or list path consults entitlement state. |
| A lapsed entitlement leaves everything readable and editable | **PASS** | Entitlement is absent from every RLS policy and from every non-create endpoint, by design.                              |
| Account deletion reaches object storage                      | **PASS** | Deletion enqueues an object-store sweep; a database cascade alone is explicitly insufficient.                           |
| Export on demand                                             | **PASS** | `POST /users/me/export` produces a portable archive.                                                                    |
| Retention stated and honoured                                | **PASS** | Tombstones are purged after a stated grace window, sized to protect devices that have not yet synced.                   |

### Technology & Platform Constraints

| Gate                                            | Status   | Note                                                                                                                    |
| ----------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| Expo dev-client workflow                        | **PASS** | Already this project's configuration.                                                                                   |
| Versioned Expo docs consulted                   | **PASS** | The v57 `expo-sqlite` and `expo-screen-capture` pages were read during Phase 0, and changed two decisions (D-01, D-05). |
| PostgreSQL + PostGIS from the first migration   | **PASS** | Migration `0001` enables PostGIS before any table is created.                                                           |
| Object storage private, signed URLs only        | **PASS** | No public bucket policy anywhere; signed URLs are short-lived.                                                          |
| No hyperscaler dependency                       | **PASS** | Hetzner, Cloudflare R2, and self-hosted everything else. Mapbox and Anthropic are metered APIs, not platform lock-in.   |
| Secrets validated at startup                    | **PASS** | A startup schema validates every required environment variable and refuses to boot on a gap.                            |
| Migrations version-controlled                   | **PASS** | Drizzle Kit migrations committed; the production schema is never hand-edited.                                           |
| Rate limiting on auth, metered services, social | **PASS** | A coarse Traefik layer plus a Redis-backed per-account limiter on `/auth/*`, `/planner/*`, and `/social/*`.             |
| Backups verified by restore                     | **PASS** | A restore rehearsal is a launch-blocking checklist item, not a runbook footnote.                                        |

### Result

**All gates pass. There are no violations to justify — the Complexity Tracking table below is
intentionally empty.**

Two deviations from `docs/travelappfullspec.md` are recorded. Neither touches a constitutional principle;
both carry rationale in [research.md](./research.md) (D-01 and D-07).

**Post-Phase-1 re-evaluation**: re-run after the design artifacts were written. All gates still pass.
The Phase 1 data model strengthened two of them rather than weakening any: `moderation_state` moved
_into_ the RLS predicate rather than being checked in application code (Principle IV), and
`documents` gained per-row envelope encryption so that database access alone is insufficient to read
a boarding pass (Principle I, FR-033).

---

## Project Structure

### Documentation (this feature)

```text
specs/001-triptrackr-mvp/
├── plan.md                        # This file
├── research.md                    # Phase 0 output — decisions D-01..D-12; audit D-13..D-20
├── data-model.md                  # Phase 1 output — entities, columns, RLS posture
├── quickstart.md                  # Phase 1 output — how to run and validate
├── contracts/
│   ├── README.md                  # Contract index and conventions
│   ├── rest-api.md                # HTTP surface, per-endpoint access rules
│   ├── sync-protocol.md           # Offline push/pull contract (the gated milestone)
│   └── data-access-policy.md      # RLS policy contract — the privacy authority
├── checklists/                    # Pre-existing
├── spec.md
└── tasks.md                       # Phase 2 — created by /speckit-tasks, not by this command
```

### Source Code (repository root)

_Amended 2026-09-23 (research D-13). The original decision kept the Expo app at the repository root
with `server/` as a sibling; the audit that preceded the first product screen replaced that with an
npm-workspaces monorepo. The rationale is in the Structure Decision below._

```text
apps/
├── mobile/                        # Expo / React Native app (moved from the repository root)
│   ├── app.json  eas.json  package.json  tsconfig.json  metro.config.js  jest.config.js
│   ├── assets/                    # brand assets only — no template artwork
│   ├── e2e/                       # Maestro flows, including offline / network-toggle
│   ├── src/
│   │   ├── app/                   # expo-router routes (typed routes enabled)
│   │   │   ├── _layout.tsx        # root Stack: providers, Sentry, splash, auth gate
│   │   │   ├── (auth)/            # welcome, login, register
│   │   │   ├── (tabs)/            # globe (home), trips, profile — custom neumorphic tab bar
│   │   │   ├── trip/[id]/         # notes, expenses, photos, documents, itinerary
│   │   │   ├── modal/             # add-trip, add-expense, paywall
│   │   │   └── +not-found.tsx
│   │   ├── components/
│   │   │   ├── globe/             # MapView wrapper, arc source, beacon layer
│   │   │   ├── trip/
│   │   │   ├── navigation/        # tab bar built from the ui primitives (feature 002)
│   │   │   └── ui/                # surface, pressable-surface, text-field, … (feature 002)
│   │   ├── features/              # feature-scoped hooks, queries, mutations
│   │   │   ├── auth/  trips/  notes/  expenses/  photos/
│   │   │   └── documents/  planner/  social/  billing/
│   │   ├── db/                    # expo-sqlite + Drizzle local schema and migrations
│   │   ├── sync/                  # offline engine: push, pull, upload queue, cursor
│   │   ├── lib/                   # api client, secure storage, sentry, formatting
│   │   ├── theme/                 # token and resolution layer (feature 002)
│   │   ├── constants/             # theme values
│   │   └── hooks/                 # shared hooks
│   └── test/                      # route-screen tests (cannot live under src/app — see metro.config.js)
│
└── api/                           # NestJS API (moved from server/)
    ├── Dockerfile                 # build context is the repository root (needs packages/)
    ├── src/
    │   ├── modules/               # auth, users, trips, notes, expenses, photos,
    │   │                          # documents, sync, planner, social, billing, lookups
    │   ├── db/
    │   │   ├── schema/            # Drizzle table definitions
    │   │   └── migrations/        # hand-written, transactional SQL (schema, RLS, functions)
    │   ├── common/                # RLS session middleware, guards, filters, envelope crypto
    │   └── workers/               # media worker: thumbnails, EXIF, moderation
    └── test/
        ├── unit/  contract/
        ├── integration/           # Supertest + Testcontainers Postgres
        └── privacy/               # adversarial non-owner suite (required CI job)

packages/
└── contracts/                     # @triptrackr/contracts — zod schemas + types shared by both apps
    └── src/
        ├── sync/                  # pull/push envelopes, per-table record schemas
        └── api/                   # REST DTOs, error shape

infra/
├── docker-compose.yml             # postgres+postgis, redis, minio, api, worker, migrate, traefik
├── docker-compose.prod.yml
└── scripts/                       # backup, restore-rehearsal, geo-catalogue import

docs/                              # long-form product documents and store/legal material
├── travelappblueprint.md  travelappfullspec.md
├── legal/                         # privacy policy, terms, account-deletion page (sources)
└── release/                       # store-readiness checklist, submission metadata

specs/                             # Spec Kit feature specifications (unchanged)
```

**Structure Decision**: Two deployables and one shared package in an npm-workspaces monorepo. The
original plan kept the mobile app at the root under YAGNI, reasoning that a shared package had not
yet earned its place. The 2026-09-23 audit reversed that on a specific finding: the offline sync
protocol is a hand-written wire format that the client and the server must agree on byte for byte,
including seven per-table record shapes, a conflict envelope, and an opaque cursor. Two copies of
those shapes — one in `src/sync/`, one in `server/src/modules/sync/` — is the single largest class
of sync-engine defects, and the sync engine is the constitutional gate for everything social.
`@triptrackr/contracts` holds the zod schemas once; the server validates requests against them and
the client types its local rows from them. Expo SDK 52+ configures Metro for workspaces
automatically and SDK 55+ deduplicates native modules in monorepos by default (verified against the
v57 monorepo guide), so the friction the original decision feared no longer exists. The move also
removes the `exclude: ["server"]` / `testPathIgnorePatterns` / `ignores: ['server/']` seams that
every root config file needed to keep the two projects apart.

---

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified.

No violations. This table is intentionally empty.
