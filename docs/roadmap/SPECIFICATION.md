# Specification: TripTrackr as a production system

The system-level specification an agent needs to build, secure, ship and operate TripTrackr. It **indexes and
completes** the feature specs instead of copying them: where a rule already lives in a spec, this document names
it and adds only what a production release also needs (stores, operations, security, compliance). If this
document and a feature spec disagree, the feature spec and the constitution win and this document is fixed.

Order of authority: (1) `.specify/memory/constitution.md` (principles I to V); (2) `AGENTS.md` and `CLAUDE.md`;
(3) `specs/001-triptrackr-mvp/*` (product, plan, research D-01..D-34, contracts, tasks);
`specs/002..005` (UI, with 005 Sunrise Passport current); (4) this folder; (5) `docs/release/store-readiness.md`
and `docs/legal/*`.

## 1. Product

TripTrackr is a **private travel journal** that a traveller may choose, deliberately and piece by piece, to
share. Private first, shared only on request, never the reverse by accident. It is **offline-first** (aeroplanes,
foreign countries, bad hotel Wi-Fi), centred on a **3D globe** of the traveller's own history, and published on
the App Store and Google Play. Platforms: iOS 15.1 or later and Android (minSdk 24, target API 36), phones only
(`supportsTablet: false`, OD-10), portrait, English (OD-8).

### 1.1 Capabilities by release

| Release | Capability (user story, `specs/001-triptrackr-mvp/spec.md`)                                                                                                                                                                                                                                               |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | US1 account and multi-stop trip; US2 private notes and per-trip spending (frozen FX); US3 globe of history; US4 globe-to-street zoom and offline maps; US5 photos and travel documents; US6 offline and reconcile; US9 allowance and subscription; account deletion; data export; the Sunrise Passport UI |
| 1.1     | US8 day-by-day itinerary generated from place names (verified before shown)                                                                                                                                                                                                                               |
| 1.2     | US7 publish a curated trip, follow travellers, feed and discovery, report and block, photo screening                                                                                                                                                                                                      |

### 1.2 Principles that bind every line (constitution)

I Privacy is structural (no visibility flag on expenses or documents; RLS is the authority). II Offline is the
default (local first; tombstones; a record whose bytes have not uploaded is not "saved"; the sync engine is
proven before social). III Test-first, adversarial privacy tests, 80%. IV Verify before you render (a place is
real or it is dropped; model output is a proposal). V Nothing a traveller recorded is held hostage (limits gate
creation only; export on demand; complete deletion including object storage).

## 2. Functional requirements added by production

The feature specs define stories and FR-001 to FR-084. A store release also requires these (they are tasks in
`STEP-BY-STEP.md`; none changes a principle):

| ID    | Requirement                                                                                                                                                                             | Why                                               | Step |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---- |
| PR-01 | **In-app account deletion** reachable without instructions (Profile, Account, Delete account), completing the full sweep including object storage; a public web page describes it       | Apple 5.1.1(v), Play account-deletion requirement | S-05 |
| PR-02 | **Data export** on demand: an async job produces a portable archive delivered by a signed URL                                                                                           | Constitution V, FR-007                            | S-06 |
| PR-03 | **About screen**: version, Privacy Policy, Terms, Account deletion page, support contact, attributions (GeoNames CC BY 4.0, Mapbox, OpenStreetMap through Mapbox), open-source licences | Both stores; licence obligations                  | S-07 |
| PR-04 | **Restore Purchases**, subscription disclosure (title, period, price, auto-renewal and how to cancel, links to Privacy and Terms) on the paywall                                        | Apple 3.1.2; Play Billing                         | S-12 |
| PR-05 | **Sign in with Apple** wherever Google sign-in is offered, equal prominence; branded Google and Apple buttons                                                                           | Apple 4.8; provider branding rules                | S-09 |
| PR-06 | **Stated retention**: the 90-day tombstone window explained in plain words                                                                                                              | Constitution V (T193)                             | S-07 |
| PR-07 | **Permission strings** specific and present only for capabilities used (camera, photo library; none for location, tracking, Face ID unless used)                                        | Apple 5.1.1(i)                                    | S-34 |
| PR-08 | **No tracking**: no ATT prompt, no advertising id, no analytics SDK in 1.0                                                                                                              | Apple labels, Play Data safety                    | S-34 |
| PR-09 | **UGC controls** before any public content: report, block, a moderation process that acts, published contact (release 1.2)                                                              | Apple 1.2, Play UGC policy                        | S-20 |
| PR-10 | **Support channel**: monitored email and a support URL consistent across listings and the About screen                                                                                  | Both stores                                       | S-32 |
| PR-11 | **Review access**: a demo account with data (trips, one public if 1.2, one private) and notes for the reviewer                                                                          | Apple 2.1, Play App access                        | S-33 |
| PR-12 | **Crash and error visibility** with readable stack traces (source maps, R8 mapping, native symbols)                                                                                     | Operability                                       | S-24 |

## 3. Non-functional requirements

| Area              | Requirement (source)                                                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Startup and speed | Cold start to interactive globe under 3 s on a mid-range device (SC-001, T194); 60 fps with 50 or more arcs (SC-002, T100); 95% of everyday actions without a perceptible wait (SC-003); sheet drag 60 fps (feature 005) |
| Offline           | 100% of offline notes, expenses, captures and documents survive restart and reach the server (SC-009); sync within 30 s of reconnect (SC-010); no loss, duplicate or resurrection (SC-011)                               |
| Privacy           | Zero expense or document reachable by a non-owner (SC-012); zero private notes or photos in any public view (SC-013); every public photo screened (SC-014); deletion leaves no residue (SC-015)                          |
| Correctness       | Spending totals reconcile exactly in every currency combination (SC-016, `decimal.js`); zero fabricated or mislocated itinerary pins (SC-017)                                                                            |
| Reliability       | RTO 1 h, RPO 24 h demonstrated by an actual restore (SC-020); the stack runs on one modest VPS; health endpoint; restart policies                                                                                        |
| Commerce          | Zero trips lost, hidden or locked by the allowance or a lapsed subscription (SC-021); no duplicate charge across declined, lost and retried purchases (SC-025)                                                           |
| Security          | Section 7 below                                                                                                                                                                                                          |
| Accessibility     | WCAG AA contrast in four themes (a gate in CI: `test/theme/contrast-gate.test.ts`), 44 dp targets, dynamic type to the largest size, reduce motion and reduce transparency honoured, VoiceOver and TalkBack walks        |
| Compatibility     | iOS 15.1+ (React Native 0.86 baseline, tested once on the oldest supported OS); Android 7.0+ (minSdk 24), target API 36; 16 KB page-size compliant; New Architecture only                                                |
| Size and cost     | Release bundle and font assets compared to the `pre-005-baseline` (over 1 MB reviewed); Mapbox usage alerts; planner per-account daily ceiling                                                                           |
| Observability     | Sentry (mobile and server) with PII scrubbed; structured logs with redaction; uptime check; disk, restart and backup-age alerts                                                                                          |
| Maintainability   | Functions under 50 lines, files under 800, nesting under 4, immutability by default, no debug output, conventional commits, spec before code                                                                             |

## 4. System architecture

```
 iOS / Android app (Expo SDK 57 dev client, RN 0.86, React 19)
   |  encrypted SQLite (SQLCipher) mirror  <- local-first writes
   |  Mapbox globe (one MapView)           <- derived from the local store
   |  sync engine: push dirty rows, pull changes, upload queue for bytes
   v   HTTPS (TLS by Traefik / Let's Encrypt), JWT access + refresh
 Traefik  ->  NestJS API  ----------------->  PostgreSQL 17 + PostGIS 3.5  (RLS enabled AND forced)
                 |   \                          ^ connects as triptrackr_api (never the owner)
                 |    \-- BullMQ (Redis 7, noeviction) -> worker (media, FX, tombstone purge, deletion sweep, export, planner)
                 |-- S3 API --> object storage (RustFS in dev, Cloudflare R2 in production; private buckets, signed URLs, TTL 300 s)
                 |-- Resend (email)  |-- RevenueCat (billing webhook)  |-- Mapbox (geocode, directions)  |-- Anthropic (planner names)
 Sentry (mobile + server)    Off-box backups (pg_dump + rclone to another provider)
```

### 4.1 Mobile

- **Routes** (`src/app`): `(auth)` welcome, login, register; `(tabs)` Home (globe), Trips, You (profile); `trip/[id]` overview,
  notes, expenses, photos, documents, document-view, document-capture, offline-maps; `modal` add-trip, add-expense (one form sheet);
  `(dev)/gallery` (development only, `Stack.Protected` on `__DEV__`). Added by this roadmap: `modal/paywall`,
  `modal/manage-subscription`, `trip/[id]/itinerary` (1.1), feed, discover and `user/[id]` (1.2), About and deletion flows under You.
- **Layers**: `components/ui/*` adapters (the only code that imports `heroui-native`) over `src/theme` tokens (four themes, contrast gate);
  `features/*` (domain hooks and pure logic); `db/` (Drizzle schema, migrations, repositories); `sync/` (engine, status store); `lib/`.
- **State**: SQLite is the source of truth for the traveller's data; TanStack Query for server-only reads (entitlement, planner jobs, feed);
  Zustand for UI and appearance; `expo-secure-store` for tokens and the database key.
- **Look**: Sunrise Passport (feature 005). Pictures and the prototype: `specs/005-sunrise-passport-ui/reference/`.

### 4.2 Backend

- **Modules** (`apps/api/src/modules`): `auth`, `users`, `trips`, `notes`, `expenses`, `photos`, `documents`, `sync`, `lookups`, `health`;
  added: `billing`, `planner`, `social` (and `moderation`). Common: `auth`, `config`, `crypto`, `db`, `errors`, `filters`, `guards`,
  `logging`, `queue`, `redis`, `rls`, `storage`, `validation`.
- **Per-request identity** sets a session variable that RLS policies read (D-03); policies and auth functions are hand-written SQL in
  `apps/api/src/db/migrations/` (`0001` to `0013` today; new files only, never edit an applied one).
- **Worker** (BullMQ): media (thumbnails, EXIF), FX daily scheduler (`upsertJobScheduler`), tombstone purge (90-day floor in SQL), and added:
  deletion sweep, export builder, planner pipeline.
- **Sync** (`contracts/sync-protocol.md`, D-02, D-15, D-16): one client-generated UUID per row; server-authoritative last-write-wins on
  `updated_at` in exactly one place; tombstones for every mirrored table; the superseded device is told; binary uploads are a separate queue.
- **Documents** are sealed by the API with per-row envelope encryption (D-04, D-32); screen capture blocked on the device (D-05); no share affordance.
- **Photos**: resized on the device (EXIF dropped from the bytes, time and position sent as fields), thumbnails by the worker, screening via the
  `PhotoScreening` port (returns `pending` until a provider exists; fail closed) (D-34).
- **Billing** (D-07, D-08): allowance enforced by a live `count(*)` inside the `POST /trips` transaction, configurable (`FREE_TRIP_ALLOWANCE`,
  default 5); RevenueCat is the only billing integration; `POST /billing/purchase-completed` verifies and is idempotent by transaction id;
  `POST /billing/webhook` is signature-verified and authoritative; no card data touches our systems.
- **Planner** (D-09): the model returns place **names only**; Mapbox geocoding resolves coordinates; anything under the confidence threshold is
  dropped and logged; per-account daily quota (`planner_requests`) and a Redis cache.

### 4.3 Data (`specs/001-triptrackr-mvp/data-model.md`)

Reference: `countries`, `cities`. Accounts: `users`, `oauth_identities`, `refresh_tokens`. Content: `trips`, `trip_stops`, `notes`, `photos`, `documents`,
`expense_categories`, `expenses`, `fx_rates`. Planner: `itinerary_days`, `itinerary_items`, `planner_requests`. Social: `follows`, `blocks`, `reports`.
Commerce: `subscriptions`. On device: the encrypted mirror of the synchronised tables plus the upload queue (section 10 of the data model).
Every owned table: `ENABLE` and `FORCE ROW LEVEL SECURITY`; the adversarial privacy suite asserts this in `pg_catalog`.

### 4.4 API surface (`specs/001-triptrackr-mvp/contracts/rest-api.md`)

Auth (see `contracts/rest-api.md` section 1 for what exists; verify-email and password-reset are confirmed or added in S-09); Profile; Trips and stops (`POST /trips` allowance branch returns 409
with both routes forward); Notes; Photos (upload URL, register, list, delete); Documents; Expenses; Planner (generate job, job status, itinerary
items); Social (follows, blocks, reports, feed, discover, public trip view, `GET /users/:id`); Commerce (`GET /me/entitlement`,
`POST /billing/purchase-completed`, `POST /billing/webhook`); Lookups (countries, cities); Sync (push, pull); Account (`DELETE /me`, `POST /me/export`);
Health (`GET /health`). Every endpoint states its visibility posture in its PR.

## 5. Configuration

Variables are validated at startup by `apps/api/src/common/config/env.schema.ts` (the API declares only `DATABASE_URL`; the owner URL and
`API_DB_PASSWORD` live in a separate schema loaded only by the migration runner and the geo import). New variables go into `.env.example` and the
schema in the same PR. `EXPO_PUBLIC_*` is public: nothing secret in it, ever.

| Group                | Variables (names)                                                                                                                                                                                                                      | Secret?                                          | Where it lives in production                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------- |
| Runtime              | `NODE_ENV`, `PORT`, `APP_PUBLIC_URL`, `API_HOST`, `ACME_EMAIL`                                                                                                                                                                         | no                                               | host `.env`                                               |
| Database             | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `MIGRATION_DATABASE_URL`, `API_DB_PASSWORD`, `DATABASE_URL`                                                                                                                       | yes                                              | host `.env` and `infra/secrets/*.txt`                     |
| Redis                | `REDIS_URL`                                                                                                                                                                                                                            | no                                               | host `.env`                                               |
| Auth                 | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `GOOGLE_OAUTH_CLIENT_IDS`, `APPLE_OAUTH_CLIENT_IDS`                                                                                                    | secrets: the two JWT secrets                     | host `.env`                                               |
| Object storage       | `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_PHOTOS`, `S3_BUCKET_DOCUMENTS`, `S3_SIGNED_URL_TTL_SECONDS`                                                                   | keys                                             | host `.env`                                               |
| Document sealing     | `DOCUMENT_MASTER_KEY`, `DOCUMENT_MASTER_KEY_ID`                                                                                                                                                                                        | yes (escrow OFF the server)                      | host `.env`, escrowed offline                             |
| Product config       | `FREE_TRIP_ALLOWANCE`, `TOMBSTONE_RETENTION_DAYS`, `PLANNER_DAILY_REQUEST_LIMIT`, `PLANNER_CACHE_TTL_SECONDS`, `FX_RATES_URL`, `FX_RATES_SOURCE`                                                                                       | no                                               | host `.env`                                               |
| External services    | `MAPBOX_ACCESS_TOKEN`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `REVENUECAT_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`, `SENTRY_DSN`                                                                                            | yes (not `EMAIL_FROM`, `SENTRY_DSN`)             | host `.env`                                               |
| Backups              | `BACKUP_AT`, `BACKUP_RETENTION_DAYS`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`                                                                                               | keys                                             | host `.env` (write-only credentials)                      |
| Mobile public config | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN`, `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | no (public by design; restrict tokens by app id) | EAS environment variables per profile                     |
| Mobile build secrets | `SENTRY_AUTH_TOKEN`, `MAPBOX_DOWNLOADS_TOKEN` (scope `DOWNLOADS:READ`), `EXPO_TOKEN`                                                                                                                                                   | yes                                              | EAS secrets and GitHub environment secrets                |
| Store credentials    | App Store Connect API key (`.p8`, key id, issuer id), Apple team id, Google Play service account JSON                                                                                                                                  | yes                                              | EAS credentials (preferred) or GitHub environment secrets |

## 6. Environments

| Environment           | Mobile                                                                  | Backend                                                                                                                                        | Data                    |
| --------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Local development     | Dev client (`APP_VARIANT=development`, `com.triptrackr.app.dev`), Metro | `npm run infra:up` (Compose) or `start:dev`; RustFS; LAN `S3_PUBLIC_ENDPOINT` for uploads                                                      | Disposable              |
| CI                    | Jest only; `expo config --type introspect`                              | Testcontainers PostGIS and RustFS; Compose validation; backup rehearsal                                                                        | Ephemeral               |
| Staging (recommended) | EAS `preview` profile (internal distribution) pointing at staging       | A second Compose project (separate host or separate project name and ports) with its own secrets and its own R2 buckets and RevenueCat sandbox | Synthetic, resettable   |
| Production            | EAS `production` profile (store builds, `autoIncrement`)                | The single VPS with `docker-compose.prod.yml`                                                                                                  | Real; backed up off-box |

Staging is recommended, not mandatory for 1.0 if the owner accepts testing against production-shaped local stacks plus TestFlight and Play internal
builds on the production API with a demo account (record the choice in `DECISIONS.md`).

## 7. Security specification

1. **Authorisation is in the database.** RLS enabled and forced on every owned table; the API connects as `triptrackr_api` (non-superuser, not the table
   owner); only the migration runner holds the owner URL; the privacy suite asserts the catalogue state and runs as an attacker on every route.
2. **Authentication**: Argon2 password hashing (`@node-rs/argon2`); short-lived JWT access tokens plus rotating refresh tokens stored hashed; Google and
   Apple identity tokens verified server side (`aud` checked); email verification and reset through Resend; rate limits on every authentication endpoint
   (Redis limiter and Traefik); account lockout and uniform error messages (no account enumeration). Step S-09 audits which of these already exist in code and closes the gaps; do not assume.
3. **Input**: every body, query and header parsed by a zod schema from `@triptrackr/contracts` or a validated DTO; parameterised SQL only (Drizzle and
   hand-written functions); upload size and type caps (`MAX_PHOTO_BYTES` 15 MiB); object keys chosen by the server; nothing the client sends is trusted
   for ownership.
4. **Transport and edge**: TLS only (HSTS), Traefik security headers and coarse rate limit, `helmet` on the API; only Traefik publishes ports (CI asserts it).
5. **Storage**: buckets private, signed URLs with a 300 s TTL, CORS limited to the presigned operations; documents sealed with envelope encryption; the
   document master key escrowed off the server.
6. **Secrets**: never committed, baked into an image, logged or placed in `EXPO_PUBLIC_*`; validated at startup; rotated on a calendar (section 3 of `CICD-AND-RELEASE.md`);
   gitleaks and GitHub push protection on.
7. **Mobile hardening**: SQLCipher database with the key in Keychain or Keystore; `allowBackup: false`; screen capture blocked on documents; no
   cleartext traffic; no unused permissions (`blockedPermissions`); release builds minified and shrunk (`expo-build-properties`); Sentry without PII.
8. **Logging**: pino with redaction of tokens, passwords, authorisation headers and bodies of sensitive routes; Sentry `sendDefaultPii: false`, no Session
   Replay, no Feedback widget.
9. **Supply chain**: lockfile committed; Dependabot weekly; `npm audit --omit=dev` and Trivy in CI; digest-pinned third-party images; new dependencies
   checked for age (7 days) and install scripts; Actions pinned by major (and by SHA for third-party actions in release workflows).
10. **Payments**: no raw card field anywhere (grep-checked, T196); entitlement lifted only server side after RevenueCat verification.
11. **Review**: a security review (the `security-reviewer` role or a human) is mandatory for changes to auth, authorisation, input, SQL, files, external
    calls, crypto and payments; CRITICAL findings block the merge.
12. **Incident response**: `OPERATIONS` section of `CICD-AND-RELEASE.md` (detect, contain, rotate, notify within the legal window, post-mortem).

## 8. Privacy and compliance specification

- **Data inventory** (what the app collects and why): account email and display name; trips, stops, notes (private by default); expenses and
  documents (never public, no flag); photos (private; public only when approved and chosen); device-only SQLite; sync metadata; subscription
  status (RevenueCat); crash data (Sentry, not linked, no PII); coarse city names from the geography catalogue. No advertising id, no tracking.
- **Processors** (named in the privacy policy before use): Cloudflare (R2), Resend, Sentry, RevenueCat, Mapbox, Anthropic (1.1), the VPS provider, the
  backup provider, Apple and Google (sign-in and stores). A processor is added only with its terms and a policy update.
- **Retention**: tombstones kept 90 days then purged by the worker (bytes before rows); backups retained per `BACKUP_RETENTION_DAYS` (document this in
  the policy; deletion propagates to backups on expiry); logs rotated.
- **Deletion and export**: PR-01 and PR-02; deletion confirmed only when rows and objects are gone (SC-015 residue test).
- **Store disclosures**: Apple privacy manifest (`privacyManifests`, `NSPrivacyTracking: false`), App Privacy labels, export-compliance decision recorded in
  `docs/release/export-compliance.md` (SQLCipher is bundled crypto: decide on the BIS self-classification report); Play Data safety, content rating,
  target audience, permissions declaration, App access, UGC policy (1.2). The values live in `docs/release/store-readiness.md` and
  `apps/mobile/STORE_COMPLIANCE.md`.
- **Legal documents** (`docs/legal/*`): reviewed by counsel, hosted at stable public URLs, linked in both stores, in the app (About) and on the paywall.
- **Age and region**: ratings questionnaires answered truthfully (user-generated content only in 1.2); no collection from children.

## 9. Quality specification

The gates, the test pyramid, device matrix and acceptance procedures are in [`TESTING-AND-QUALITY.md`](./TESTING-AND-QUALITY.md). The pipeline, the
release process and operations are in [`CICD-AND-RELEASE.md`](./CICD-AND-RELEASE.md).

## 10. Traceability

| Need                   | Where                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| Product requirements   | `specs/001-triptrackr-mvp/spec.md` (FR, SC), `data-model.md`, `contracts/*`                                  |
| Technology decisions   | `specs/001-triptrackr-mvp/research.md` (D-01..D-34); UI: `specs/005-sunrise-passport-ui/research.md` (D5-nn) |
| Open engineering tasks | `specs/001-triptrackr-mvp/tasks.md` (65 open), `specs/005-sunrise-passport-ui/tasks.md` (30 open)            |
| UI look and plan       | `specs/005-sunrise-passport-ui/reference/` (UI-SPEC, IMPLEMENTATION-PLAN, pictures, prototype)               |
| Store launch checklist | `docs/release/store-readiness.md`; `apps/mobile/STORE_COMPLIANCE.md`                                         |
| Backend operations     | `infra/README.md`, `infra/scripts/README.md`, `infra/secrets/README.md`                                      |
| Offline gate procedure | `apps/mobile/e2e/offline/README.md`, `specs/001-triptrackr-mvp/quickstart.md` section 5                      |
| This programme of work | `docs/roadmap/*`                                                                                             |
