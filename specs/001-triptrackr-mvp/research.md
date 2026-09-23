# Phase 0 — Research: TripTrackr MVP

**Branch**: `001-triptrackr-mvp` | **Date**: 2026-08-26 | **Plan**: [plan.md](./plan.md)

## Purpose

`travelappblueprint.md` and `travelappfullspec.md` already settle most of the stack. This document
does two things: it records those settled choices so the plan does not silently re-decide them, and
it resolves the questions that were genuinely open — including two where reading the versioned Expo
documentation changed the answer the full specification had assumed.

Decisions are numbered `D-nn` and referenced from [plan.md](./plan.md).

---

## D-01 — Local offline store: `expo-sqlite` + SQLCipher + Drizzle, not WatermelonDB

**Deviates from `travelappfullspec.md` §5.2.**

**Decision**: Use `expo-sqlite` with the `useSQLCipher: true` config-plugin option as the on-device
store, with Drizzle ORM for the local schema and migrations, and a hand-written sync engine.

**Rationale**:

- FR-033 requires that obtaining the underlying data store alone does not reveal a document's
  contents. On the device, the local mirror is a data store like any other, and WatermelonDB offers
  no encrypted-at-rest option. `expo-sqlite` exposes SQLCipher as a first-class, documented,
  supported configuration in SDK 57. This requirement alone decides it.
- WatermelonDB's value proposition is its bundled sync primitives. This project cannot use them as
  given anyway: the binary-upload path (FR-041 — a record is not saved until its bytes arrive) sits
  outside any record-level sync abstraction, and the conflict rule must be server-authoritative
  (FR-040). What would be inherited is a `dirty`-flag convention that is a few dozen lines to write
  directly.
- `expo-sqlite` is a first-party Expo module, versioned in lockstep with the SDK. That removes a
  standing New-Architecture compatibility risk on React Native 0.86 — a risk this repository has
  already paid for once, in the native build failures of August 2026.
- Drizzle gives one schema-definition idiom on both the device and the server, which matters because
  the local schema deliberately mirrors a subset of the PostgreSQL tables.

**Alternatives considered**:

- _WatermelonDB, as the full specification proposed_ — rejected on the encryption requirement above,
  with the New-Architecture risk as a secondary reason.
- _AsyncStorage / MMKV with a document-oriented layout_ — rejected: the offline data is relational
  (expenses filtered by trip, city, category, and date range), and a key-value store forces that
  filtering into memory.

**Source**: `https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/` — config plugin properties
`useSQLCipher`, `enableFTS`; the tagged-template and prepared-statement APIs; the DevTools inspector.

---

## D-02 — Conflict resolution: server-authoritative last-write-wins on `updated_at`

**Decision**: `POST /sync/push` compares each incoming record's `updated_at` against the stored row.
The later timestamp wins. The decision is made in exactly one function, on the server. A losing
device receives a `conflict` verdict carrying the winning version and overwrites its local row.

**Rationale**: The spec's own Assumptions section already settled last-write-wins for single-owner
journal data, and Constitution II requires one deterministic rule applied in one place. Keeping the
comparison server-side means device clock skew cannot be exploited to make a client always win, and
there is one implementation to test rather than one per platform.

**Alternatives considered**:

- _CRDTs_ — rejected as overkill for single-owner data where conflicts are rare and low-stakes. The
  spec records this and flags it for revisiting only if collaborative trips arrive (FR-085).
- _Client-side merge_ — rejected: it would put the rule in two places and make it untestable as a
  single unit.

**Consequence to carry into tasks**: the two-device conflict case is an explicit automated test, not
a manual check (Constitution III).

---

## D-03 — Privacy enforcement: PostgreSQL RLS with a per-request session variable

**Decision**: Every traveller-owned table has `ENABLE ROW LEVEL SECURITY` with `FORCE`. A NestJS
middleware sets `app.current_user_id` on the connection at the start of each request, inside the
same transaction the request's queries run in. The API connects as a non-superuser role that RLS
actually applies to.

**Rationale**: This is Constitution I made mechanical. A defect in a controller, a service, or a
query cannot disclose another traveller's content, because the database refuses to return the rows.
It also makes the adversarial test suite meaningful — the tests exercise the real policies rather
than a mocked filter.

**Alternatives considered**:

- _Application-layer scoping only (`WHERE user_id = ?` everywhere)_ — rejected outright by
  Constitution I: one forgotten predicate is a disclosure.
- _A separate schema or database per traveller_ — rejected as operationally absurd at consumer scale
  and hostile to the social features.

**Pitfall to avoid, recorded here so it reaches the tasks**: `FORCE ROW LEVEL SECURITY` matters.
Without it, the table owner bypasses its own policies, which is exactly the configuration in which a
privacy suite passes in CI and fails in production.

---

## D-04 — Document confidentiality at rest: per-row envelope encryption

**Decision**: Document bytes are encrypted client-side-of-the-object-store with a per-document data
key; the data key is itself encrypted with a master key held as a Docker secret (or Vault Transit)
and stored alongside the row. The database holds only the wrapped key and the object storage key.

**Rationale**: FR-033 says obtaining the underlying data store alone must not reveal a document's
contents. Database-level encryption at rest does not satisfy that — anyone with a database dump has
the plaintext. Envelope encryption means a dump yields wrapped keys that are inert without the
master key, which never lives in the database.

**Alternatives considered**:

- _Object-store server-side encryption alone_ — rejected: it protects the disks, not a credentialed
  read, and the credential is what leaks.
- _`pgcrypto` column encryption with a key in the database_ — rejected as circular.

---

## D-05 — Screenshot and screen-recording prevention: `expo-screen-capture`

**Decision**: Wrap every document-viewing screen in `usePreventScreenCapture()`, and enable
`enableAppSwitcherProtectionAsync()` on iOS for the authenticated shell.

**Rationale**: FR-034 is directly satisfied — on Android via `FLAG_SECURE`, on iOS for recordings
(iOS 11+) and screenshots (iOS 13+), both comfortably inside the iOS 15.1 floor.

**Finding not anticipated by the spec**: the documentation surfaces a leak the requirements do not
name. On iOS, the operating system snapshots the app for the app-switcher preview, and
`preventScreenCaptureAsync()` does _not_ cover that — a boarding pass stays visible in the switcher.
`enableAppSwitcherProtectionAsync()` blurs it. Android gets this behaviour automatically from
`FLAG_SECURE`. Under Constitution I this is a real exposure path, so it is treated as in scope
rather than as a nicety.

**Source**: `https://docs.expo.dev/versions/v57.0.0/sdk/screen-capture/`.

---

## D-06 — Globe and map: `@rnmapbox/maps` with `projection="globe"`

**Decision**: One full-screen `MapView` with the globe projection is both the home screen and the
zoomed-in map. Arcs are `LineString` features densified to roughly 64 points along the great circle
(Turf `greatCircle()`); style varies by trip status; a `SymbolLayer` beacon animates along the
active trip's arc. Offline packs come from `Mapbox.offlineManager.createPack()`.

**Rationale**: FR-048 requires a continuous transition from globe to local map "with no visible break
between two separate views". Mapbox's globe projection interpolates to Mercator automatically past
roughly zoom 5, which means the requirement is met by using one view rather than by writing a
transition between two. Terrain and 3D buildings (FR-049) are layer toggles on the same view, and
offline regions (FR-044) are a first-party API.

**Alternatives considered**:

- _`react-native-maps` plus a separate WebGL globe_ — rejected: it makes FR-048 a hand-written
  cross-fade between two rendering systems, which is precisely the "visible break" the requirement
  forbids.
- _MapLibre with a self-hosted tile server_ — attractive against the "no vendor lock-in" instinct and
  it removes the metered dependency, but it moves tile hosting, terrain data, and offline pack
  generation in-house. Rejected for the MVP as a large operational burden for a cost that only
  matters at a scale this product has not reached. Recorded as the exit route if Mapbox pricing ever
  becomes the binding constraint.

---

## D-07 — Subscriptions: store billing via RevenueCat, not a direct card processor

**Deviates from the blueprint's implied web-checkout framing.**

**Decision**: Implement the entitlement with `react-native-purchases` (RevenueCat) over StoreKit 2
and Google Play Billing. The server learns entitlement state from RevenueCat webhooks and treats its
own `subscriptions` table as a cache of that, never as the authority.

**Rationale**:

- A recurring subscription unlocking in-app functionality is digital content consumed in the app.
  Apple's Guideline 3.1.1 and Google Play's Payments policy both require store billing for it. A
  Stripe-only implementation would not ship.
- FR-081 (never handle raw card details) is satisfied absolutely: payment happens inside the
  operating system's own sheet, and this product never sees a card field.
- FR-083 (a failed payment is recoverable without a duplicate charge) is largely inherited. Store
  purchases are idempotent per transaction identifier, and RevenueCat's receipt validation
  deduplicates a retried purchase into one entitlement.
- FR-082 (cancel without contacting support, with the effective date stated plainly) maps onto the
  platform subscription-management screens, which the app deep-links to.
- RevenueCat over raw StoreKit 2 + Play Billing: two native billing stacks, two receipt-validation
  paths, and two sets of edge cases (deferred renewals, grace periods, billing retry, refunds) is a
  disproportionate amount of surface for a solo-scale product, and getting it subtly wrong shows up
  as travellers who paid and did not get their entitlement.

**Alternatives considered**:

- _Stripe checkout in a web view_ — rejected: non-compliant as the primary purchase route for in-app
  digital content, in the general case.
- _External purchase links_ — as of 2026 the US App Store storefront permits link-outs without an
  entitlement, and Google Play opened alternative billing and external content links in the US, UK,
  and Europe from 30 June 2026. This is a real fee-optimisation lever, but it is a per-storefront
  compliance surface layered on top of store billing rather than a replacement for it. Explicitly
  out of scope for the MVP; noted so the decision is not re-litigated from scratch later.

**Sources**: [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/);
[Apple's May 2025 guideline update for US external links](https://9to5mac.com/2025/05/01/apple-app-store-guidelines-external-links/);
[Google Play alternative billing APIs](https://developer.android.com/google/play/billing/alternative);
[Google Play's US alternative billing programme](https://support.google.com/googleplay/android-developer/answer/16497028?hl=en).

**Consequence to carry into tasks**: the allowance check must be robust to a device that believes
itself unsubscribed while the store believes otherwise (a spec edge case). The server, refreshed by
webhook, is the authority for `POST /trips`; the client's cached entitlement only decides whether to
show the paywall.

---

## D-08 — Trip allowance: enforced server-side at creation only, with an offline grace path

**Decision**: The count is `SELECT count(*) FROM trips WHERE user_id = $1 AND deleted_at IS NULL`,
evaluated inside the `POST /trips` transaction. No other endpoint, and no RLS policy, references
entitlement state. A trip created offline is accepted locally and validated at push time; if the
account is over the allowance when it syncs, the trip is kept and flagged rather than rejected.

**Rationale**: Constitution V forbids a commercial limit affecting anything already recorded. Putting
the check in exactly one creation path makes that structurally true rather than a promise. The
offline case is the sharp edge — the spec raises it as an edge case, and the only answer compatible
with Principle V is to keep what the traveller wrote and resolve the commercial question afterwards.
Rejecting a synced trip would destroy recorded content to enforce a business rule, which the
constitution prohibits outright.

**Alternatives considered**:

- _Rejecting over-allowance trips at push_ — rejected as a direct Principle V violation.
- _A denormalised `trip_count` on the user row_ — rejected: it introduces a drift bug whose failure
  mode is a traveller wrongly told they are at their limit. The count is cheap and indexed.

---

## D-09 — Planner pipeline: names from the model, coordinates from the geocoder

**Decision**: The LLM returns a day-by-day plan of _place names only_. Every name is then resolved
through Mapbox Geocoding, scoped to the city's bounding box. A place that fails to resolve, or
resolves below a confidence floor, is dropped from the itinerary and logged. Walking order comes
from Mapbox Directions (`walking` profile, optimised), not from the model. Results are cached in
Redis keyed by a normalised `(city, duration, interests)` tuple, and requests are rate-limited per
account per day.

**Rationale**: Constitution IV forbids rendering unverified generated output as fact, and SC-017
demands that 100% of shown places be real and correctly located. Never asking the model for
coordinates means a hallucinated coordinate cannot exist to be shown. Caching serves FR-070, and the
per-account daily limit serves FR-069 and the cost-ceiling constraint in the constitution.

**Alternatives considered**:

- _Trusting model-supplied coordinates and spot-checking_ — rejected: SC-017 is an absolute, and a
  sampled check cannot establish an absolute.
- _Nearest-neighbour ordering computed locally_ — rejected for the walking route because it ignores
  actual walkability; kept as a fallback if Directions is unavailable, with the route drawn as
  straight segments and labelled as approximate.

---

## D-10 — Currency conversion: captured and frozen at entry

**Decision**: On expense entry, fetch the rate, then persist the original amount, the original
currency, the converted home-currency amount, and the rate used. Rates are refreshed daily into a
`fx_rates` table and served from there, so the common path does not depend on a live third-party
call. If no rate is available at entry time, the expense is stored with a null conversion and
flagged for backfill rather than being blocked.

**Rationale**: FR-021 and FR-022 require that historical values never silently change. Storing the
rate alongside the amount makes that a property of the row rather than a policy someone must
remember. Serving from a local table keeps the offline path viable — a device carries a recent rate
snapshot and can convert without connectivity, which the spec's "no rate retrievable" edge case
otherwise leaves unanswered.

**Alternatives considered**:

- _Converting on read_ — rejected: it makes every historical total change with the market, which
  FR-022 forbids.
- _Blocking entry when no rate is available_ — rejected: it fails the offline principle for a
  cosmetic reason. A recorded expense with a pending conversion is strictly better than a lost one.

---

## D-11 — Reference geography: pre-imported catalogue, PostGIS-indexed

**Decision**: Import a countries-and-cities catalogue (GeoNames-derived, filtered by population)
during initial migration, with `geography(Point)` columns, a `population`-based prominence ranking,
and an unaccented trigram index for search. Travellers never create geography.

**Rationale**: FR-014 requires search that is country-filtered, typed, accent-tolerant, and ranked by
prominence. `unaccent` plus `pg_trgm` gives all four in one index. The spec's Dependencies section
already names the catalogue as a launch prerequisite, and PostGIS is constitutionally mandated from
the first migration anyway — the great-circle distance behind SC "total distance travelled" is then
a `ST_Distance` call rather than hand-rolled haversine arithmetic.

**Alternatives considered**:

- _A live geocoding call for city selection_ — rejected: it breaks offline trip creation and meters a
  high-frequency interaction.

---

## D-12 — Media pipeline: a queue worker, not request-path processing

**Decision**: Photo upload returns as soon as the object lands. Thumbnail generation, EXIF
extraction, and content moderation run in a BullMQ worker. `moderation_state` starts as `pending`,
and the RLS policy for public photo reads requires `moderation_state = 'approved'`.

**Rationale**: FR-056 requires that a photo be withheld from public visibility until it has passed
screening _irrespective of the visibility its owner set_. Putting `moderation_state` inside the RLS
predicate means an unscreened photo is unreachable publicly even if the API has a bug — Constitution
I applied to a requirement the spec frames in visibility terms. Doing this work off the request path
also protects SC-003, since thumbnailing a large photo would otherwise dominate the response.

**Alternatives considered**:

- _Synchronous processing on upload_ — rejected on latency, and it makes the offline upload queue's
  retry semantics considerably worse.
- _Moderating only at the moment of publication_ — rejected: it puts the check in application code,
  where Principle I says it must not be the only barrier.

---

## Settled by the source documents (recorded, not re-decided)

These carry into the plan unchanged. They are listed so it is clear they were considered and are
governed by the blueprint, the full specification, or the constitution rather than by this document.

| Area                       | Choice                                                        | Governed by                                   |
| -------------------------- | ------------------------------------------------------------- | --------------------------------------------- |
| Mobile framework           | Expo SDK 57, dev-client workflow                              | Constitution, Technology Constraints          |
| Backend framework          | NestJS, with the planner as a separable module                | `travelappfullspec.md` §2                     |
| Database                   | PostgreSQL + PostGIS, self-hosted in Docker                   | Constitution; `travelappfullspec.md` §3       |
| Cache, queues, rate limits | Redis                                                         | `travelappfullspec.md` §2                     |
| Object storage             | MinIO in development, Cloudflare R2 in production             | `travelappfullspec.md` §9.5                   |
| Hosting                    | A single Hetzner VPS running Docker Compose                   | Constitution, "no hyperscaler"                |
| Server state on the client | TanStack Query; Zustand for ephemeral UI state                | `travelappfullspec.md` §5.2                   |
| Token storage              | `expo-secure-store` (Keychain / Keystore), never AsyncStorage | `travelappfullspec.md` §5.2                   |
| Transactional email        | Resend                                                        | `travelappfullspec.md` §9.5                   |
| Error reporting            | Sentry, both sides                                            | `travelappfullspec.md` §9.4; FR-073           |
| Build order gate           | Offline sync before social                                    | Constitution II; spec "Sequencing constraint" |
| Trip ownership             | Single owner, with the member seam left open                  | spec Resolved Decision 2; FR-085              |

---

## Architecture audit — 2026-09-23

Before the first product screen was written, the repository was audited end to end (mobile, server,
infrastructure, CI, and spec-to-code consistency) with the explicit brief of correcting design and
architecture *before* implementation rather than after. The decisions below record what changed and
why. Where a decision supersedes an earlier one, the earlier one is named.

## D-13 — Repository layout: npm-workspaces monorepo with a shared contracts package

**Supersedes plan.md's original "Structure Decision" (mobile at the repository root, `server/` as a
sibling, no workspace tooling).**

**Decision**: `apps/mobile` (Expo), `apps/api` (NestJS), `packages/contracts` (`@triptrackr/contracts`
— zod schemas and inferred types for the sync protocol and REST DTOs), managed by npm workspaces
with one lockfile at the root.

**Rationale**:

- The sync protocol is a hand-written wire format. Seven per-table record shapes, a conflict
  envelope, and a cursor must be identical on both sides; the constitutional gate (Principle II) is
  a test that they are. Maintaining two copies is the largest avoidable defect class in this product.
- The original decision's stated risk — relocating a working Expo project — has been neutralised by
  the platform: the v57 monorepo guide states that Expo configures Metro for workspaces automatically
  (SDK 52+) and applies autolinking module resolution automatically in monorepos (SDK 55+).
- Every root configuration file in the old layout carried a seam to keep the two projects apart
  (`tsconfig.exclude: ["server"]`, `jest.testPathIgnorePatterns`, `eslint.ignores`). Those seams are
  where cross-project mistakes hide.

**Alternatives considered**: _Keep the sibling layout and share types by relative import_ — rejected;
Metro and Nest resolve paths differently enough that `../../server/src/...` imports from the mobile
app are fragile and bypass the package boundary. _pnpm or Bun workspaces_ — deferred; npm is already
in use and its hoisted install is the strategy the Expo guide recommends when in doubt.

**Source**: `https://docs.expo.dev/guides/monorepos/` (read 2026-09-23).

## D-14 — No web target

**Decision**: iOS and Android only. `react-native-web`, `react-dom`, `web.output` in `app.json`,
every `*.web.tsx` variant, and `global.css` are removed.

**Rationale**: The product's home screen is a `@rnmapbox/maps` globe, and `@rnmapbox/maps` has no
web implementation — the core surface can never run in a browser. Web scaffolding was costing a
parallel tab-bar implementation, a parallel colour-scheme hook, CSS module tooling in Jest, and
three dependencies, for a target that could only ever show a broken home screen. The release goal is
the App Store and Google Play.

**Alternatives considered**: _Keep web as "best effort"_ — rejected; a target that cannot render the
primary screen is not best effort, it is a permanently broken build that still has to be kept
compiling.

## D-15 — Synchronised rows carry one client-generated UUID

**Supersedes the `local_id` / `server_id` pair in the original sync-protocol.md §2 and
data-model.md §10.**

**Decision**: A row created on the device is given a UUID by the device, and the server adopts that
UUID as the primary key. There is no server-assigned identifier and no remapping step.

**Rationale**: With D-16 widening the protocol to include `trips`, `trip_stops`, and
`expense_categories`, an expense created offline may reference a trip created offline. Under the
old design the expense's `trip_id` pointed at a `local_id` with no server value until the trip had
been pushed and acknowledged, and every child table needed a remap pass at push time. Client-owned
identity removes the pass entirely and makes the idempotency guarantee ("a retried push creates no
duplicate") a property of the primary key rather than a lookup table. Collisions with another
traveller's row are impossible to exploit because RLS hides the existing row and the insert is
refused (sync-protocol.md §2, "Identity cannot be hijacked").

**Alternatives considered**: _Keep the pair and remap foreign keys at push_ — rejected as the very
complexity the change removes. _Server-assigned ids with a client "provisional id" table_ — rejected
for the same reason.

## D-16 — Sync scope is every mirrored table, and mirrored tables carry tombstones

**Corrects a defect in the original design.**

**Decision**: The protocol synchronises all seven tables the device mirrors (`trips`, `trip_stops`,
`expense_categories`, `notes`, `expenses`, `photos`, `documents`), pushed parents-before-children.
`trip_stops` and `expense_categories` gain `created_at`, `updated_at`, and `deleted_at` (migration
`0007`).

**Rationale**: The original contract scoped sync to four tables while the data model mirrored seven
and D-08 required trips to be created offline. A stop deleted on one device therefore had no path to
disappear on another, which is precisely the failure FR-039 forbids, and the acceptance suite could
not have passed. Three scenarios (13–15) were added to the gate to cover the widened scope.

## D-17 — Tab bar: `expo-router` `Tabs` with a custom bar built from the feature-002 primitives

**Decision**: The `(tabs)` layout uses the stable `Tabs` navigator with a `tabBar` component
composed from `PressableSurface` and the token layer. `expo-router/unstable-native-tabs` is not
used.

**Rationale**: Feature 002 FR-003 requires every tab to be presented with the defined surface
treatments and forbids default platform-supplied styling. A native tab bar is platform-supplied
styling by definition, so the scaffold was in conflict with its own visual specification. The
module is also still exported under an `unstable-` path in the v57 reference, which is the wrong
foundation for the root of a production navigation tree. The root layout becomes a `Stack` so that
the `(auth)` group, the `trip/[id]` stack, and the modal routes the plan requires can mount at all —
the scaffold rendered the tab component directly at the root and had no Stack anywhere.

**Source**: `https://docs.expo.dev/versions/v57.0.0/sdk/router-native-tabs/` (read 2026-09-23;
module path `expo-router/unstable-native-tabs`).

## D-18 — Sentry: no Session Replay, no Feedback widget, PII scrubbed at the boundary

**Decision**: `Sentry.init` on the device excludes `mobileReplayIntegration` and
`feedbackIntegration`, keeps `sendDefaultPii: false`, drops console breadcrumbs, and scrubs request
bodies. The server does the same.

**Rationale**: Session Replay records screen content. This product renders boarding passes, private
journal entries, and financial records; Constitution I makes their disclosure to a third-party
crash-reporting vendor a structural violation regardless of the vendor's masking defaults. The
scaffold had both integrations enabled because the Sentry setup wizard emits them; they were never
a decision.

## D-19 — Database driver and migration runner

**Records a deviation from plan.md's Technical Context, which named `node-postgres` and Drizzle Kit
migrations.**

**Decision**: `postgres` (postgres.js) is the driver; migrations are hand-written SQL files applied
by `src/db/migrate.ts` inside one transaction each, with a `schema_migrations` ledger. Drizzle Kit
is retained for `generate` as a diff tool only; its output is reviewed and hand-edited before it
becomes a migration, and its `meta/` journal is not the source of truth.

**Rationale**: RLS policies, `SECURITY DEFINER` functions, role grants, and `FORCE ROW LEVEL
SECURITY` are not expressible in Drizzle's schema DSL, so a Kit-driven migration flow would split
the schema across two mechanisms with two orderings. One SQL file per change, applied in order, is
the constitution's "version-controlled migrations" in its simplest form. postgres.js is already the
driver Drizzle's `postgres-js` adapter wraps; `prepare: false` keeps it safe behind transaction-mode
pooling.

## D-20 — Two database connection strings, provisioned by the stack itself

**Corrects a deployment defect that disabled Principle I outside the test harness.**

**Decision**: `DATABASE_URL` names `triptrackr_api`; `MIGRATION_DATABASE_URL` names the owner. The
migration runner sets the API role's password from `API_DB_PASSWORD` (`ALTER ROLE … PASSWORD`) so
the role is usable before the API's first connection. Compose wires each service to the correct URL
and adversarial test 17 asserts `current_user` from inside the API's own pool.

**Rationale**: The scaffold created the API role correctly and then never used it — every service
received the owner's URL from one shared `.env`. Because the owner is a superuser in the shipped
compose file, every policy in the data-access contract was bypassed in any environment built from
the repository, while the privacy suite (which provisions its own role) stayed green. This is the
exact silent failure D-03 warns about, one layer up: not a missing `FORCE`, but a missing
connection string.

