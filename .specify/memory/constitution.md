<!--
SYNC IMPACT REPORT
==================
Version change: (unratified template) → 1.0.0
Bump rationale: Initial ratification. The prior file was the unmodified scaffold with
                every placeholder unfilled, so there is no earlier version to amend from.

Modified principles: none (no prior principles existed)

Added sections:
  - Core Principles I–V (all new)
  - Technology & Platform Constraints
  - Development Workflow & Quality Gates
  - Governance

Removed sections: none

Placeholders resolved:
  [PROJECT_NAME]            → TripTrackr
  [PRINCIPLE_1..5_NAME]     → I–V (see below)
  [PRINCIPLE_1..5_DESC]     → derived from travelappblueprint.md, travelappfullspec.md,
                              and specs/001-triptrackr-mvp/spec.md
  [SECTION_2_NAME/CONTENT]  → Technology & Platform Constraints
  [SECTION_3_NAME/CONTENT]  → Development Workflow & Quality Gates
  [GOVERNANCE_RULES]        → amendment procedure, versioning policy, compliance review
  [CONSTITUTION_VERSION]    → 1.0.0
  [RATIFICATION_DATE]       → 2026-08-25
  [LAST_AMENDED_DATE]       → 2026-08-25

Deferred TODOs: none. No bracketed tokens remain.

Consistency notes:
  - Principle I is the governance form of spec.md FR-027, FR-052–FR-057 and SC-012–SC-013.
  - Principle II encodes the offline-sync-before-social gate from the blueprint §11.6 and
    spec.md User Story 6.
  - Principle V encodes the trip-allowance constraint resolved 2026-08-25 (spec.md FR-076,
    FR-080) and generalises it beyond monetisation.
  - No source file, dependency, or build configuration was altered by this command.
-->

# TripTrackr Constitution

TripTrackr is a private travel journal that a traveller may choose, deliberately and piece by
piece, to share. Every principle below exists to protect that ordering: private first, shared
only on request, and never the reverse by accident.

## Core Principles

### I. Privacy Is Structural, Not Conditional (NON-NEGOTIABLE)

Private data MUST be unreachable by design, not by remembering to filter it.

- Expense and travel-document records MUST NOT have a visibility flag at all. Their privacy is
  guaranteed by the absence of any mechanism that could expose them, never by a check that
  application code has to perform correctly.
- Every visibility rule MUST be enforced at the data-access layer. A defect in a screen, a
  route, or a query MUST NOT be capable of disclosing another person's private content.
- Client-side filtering is a presentation convenience and MUST NEVER be the only thing standing
  between one traveller's data and another traveller.
- Trips, notes, and photos MUST each carry independent visibility. A single global toggle is
  forbidden — travellers share that a trip happened without sharing what they wrote in it.
- New tables, endpoints, or screens that touch traveller-owned data MUST state their visibility
  posture before merge. "It is not exposed yet" is not a posture.

**Rationale**: This product holds location history, private journals, financial records, and
travel documents. A single disclosure is unrecoverable — an apology does not un-leak a boarding
pass. Structural impossibility is the only guarantee that survives a bug, a refactor, or a
contributor who has not read this document.

### II. Offline Is the Default Assumption

Travellers are on aeroplanes, in foreign countries without data, and on hotel Wi-Fi that barely
works. Connectivity is the exception, not the baseline.

- Notes, expenses, photo captures, and documents MUST be written locally first and synchronised
  opportunistically. A feature that only works online is incomplete, not shipped.
- Deletions MUST be synchronisable events. A record MUST NOT simply disappear beneath a device
  that has not yet synchronised.
- A record whose file has not finished uploading MUST NOT be presented as saved. Metadata
  arriving without its bytes is a half-truth shown to a traveller who will later find a gap.
- Competing edits MUST be resolved by one deterministic rule applied in exactly one place —
  server-side — and the superseded device MUST be told.
- The synchronisation engine MUST be proven end-to-end, against genuine multi-device and
  interrupted-connectivity testing, **before** any social or sharing feature is built on it.

**Rationale**: The synchronisation layer and the privacy layer fail in the same place — a note
created offline and marked public must neither leak nor vanish when it syncs. Proving
synchronisation against a simple, private-only model first means never debugging both at once.

### III. Test-First, and Privacy Tests Run as an Attacker

- Tests MUST be written before implementation: red, green, refactor. This is not negotiable for
  new features or bug fixes.
- Minimum 80% coverage across unit, integration, and end-to-end levels.
- Integration tests MUST run against a real database rather than a mocked one, so that
  data-layer access policies are actually exercised. A mocked policy proves nothing.
- Privacy MUST be tested adversarially: every release MUST include automated tests that attempt
  to reach another account's private notes, photos, expenses, and documents through every
  available route, and MUST assert refusal. Testing only that the owner can see their own data
  is testing the wrong direction.
- The offline acceptance test — create, edit, and delete across a full connectivity loss, an app
  restart, and a two-device conflict — MUST exist as an automated end-to-end test, not a manual
  check.

**Rationale**: A privacy bug here is the worst-case failure mode for this product, and it is
invisible to any test written from the owner's point of view. The tests must be written by
someone pretending to be the wrong person.

### IV. Verify Before You Render

Anything generated, inferred, or received from outside the product MUST be verified before a
traveller sees it presented as fact.

- Suggested places MUST resolve to real, confirmed locations before appearing on a map. A
  suggestion that cannot be verified MUST be dropped and logged, never placed at a guessed
  position.
- Language-model output MUST be treated as a proposal requiring independent confirmation, never
  as a source of coordinates, addresses, or facts.
- Data extracted from a scan or a file — a boarding-pass barcode, embedded photo metadata — MUST
  be offered for confirmation rather than silently trusted.
- Photos MUST pass automated content screening before becoming publicly visible, irrespective of
  the visibility their owner set.

**Rationale**: A confidently wrong pin sends a traveller to the wrong side of a city they do not
know, in a language they may not speak. Being unable to answer costs a traveller nothing;
answering wrongly costs them their afternoon.

### V. Nothing a Traveller Recorded Is Ever Held Hostage

A traveller's own records remain theirs, in full, regardless of commercial state.

- Commercial limits MUST gate the _creation_ of new content only. They MUST NEVER delete, hide,
  lock, archive, degrade, or restrict access to anything a traveller has already recorded.
- A lapsed or cancelled entitlement MUST leave every existing trip fully readable and editable.
- Account deletion MUST be complete — including files in object storage, which no database
  cascade will reach on its own.
- Travellers MUST be able to export everything they have recorded, on demand, in a portable
  form.
- Retention policies MUST be stated plainly and honoured. A short grace period before permanent
  removal exists to protect devices that have not yet synchronised, not to quietly retain data.

**Rationale**: This is a journal of someone's life. Holding it hostage to a payment state, or
losing it to an incomplete deletion, is a betrayal that no feature can offset — and, for a
product operating across a global user base, a compliance failure as well.

## Technology & Platform Constraints

These decisions are settled. Revisiting one requires an amendment under Governance, not a pull
request.

- **Mobile client**: React Native via Expo's dev-client workflow. The managed workflow is
  insufficient — native modules are required.
- **Expo version discipline**: Expo's APIs have changed substantially. Contributors MUST consult
  the exact versioned documentation at `https://docs.expo.dev/versions/v57.0.0/` before writing
  code against an Expo API. Recalled or assumed API shapes are a defect source, not a shortcut.
- **Database**: PostgreSQL with the PostGIS extension enabled from the first migration.
  Self-hosted in containers in both development and production.
- **Object storage**: S3-compatible, with the database storing only keys and metadata. Buckets
  MUST NOT be public; private objects are served through time-limited signed URLs.
- **No hyperscaler dependency**: the stack MUST remain runnable on a single modest VPS. Every
  external service choice MUST have a non-hyperscaler default.
- **Secrets**: MUST NOT be committed, baked into images, or hard-coded. Required secrets MUST be
  validated as present at startup rather than failing obscurely at first use.
- **Migrations**: version-controlled and checked into the repository. Production schema MUST
  NEVER be hand-edited.
- **Rate limiting**: MUST be applied to authentication endpoints, to any metered external
  service, and to social endpoints. Cost-incurring operations MUST have a per-account ceiling.
- **Backups**: MUST be verified by performing an actual restore. A backup that has never been
  restored from is not a backup.

## Development Workflow & Quality Gates

- **Specification precedes code.** Work flows `/speckit-specify` → `/speckit-plan` →
  `/speckit-tasks` → `/speckit-implement`. Specifications describe user-visible behaviour and
  MUST stay free of implementation detail; technology decisions belong in the plan.
- **Code review is mandatory** after writing or modifying code, and before any commit to a
  shared branch. CRITICAL findings block the merge; HIGH findings should be resolved before it.
- **Security review is mandatory** for changes touching authentication, authorisation, user
  input handling, database queries, file handling, external calls, cryptography, or payments.
- **Quality bar**: functions under 50 lines, files under 800 lines, nesting under 4 levels,
  errors handled explicitly and never silently swallowed, no debug statements or hard-coded
  values left behind.
- **Immutability**: prefer producing new values over mutating existing ones.
- **The offline-sync gate**: social and sharing features MUST NOT begin until the offline
  synchronisation acceptance tests pass. This gate is a matter of principle (II), not schedule,
  and MUST NOT be waived for convenience.
- **Commits** follow conventional-commit format: `<type>: <description>`.
- **CI** MUST run linting, tests, and migrations against an ephemeral database on every pull
  request. A red build MUST NOT be merged.

## Governance

This constitution supersedes other practices and conventions. Where a habit, a preference, or an
external template conflicts with it, this document wins.

**Amendment procedure.** Amendments MUST be proposed as a change to this file, stating the
principle affected, the reason, and the migration path for any code that no longer complies.
Amendments take effect once merged. Principles I through V describe properties travellers rely
on; weakening one requires a written justification that survives being read back six months
later.

**Versioning policy.** This constitution is versioned semantically:

- **MAJOR** — a principle is removed, or redefined in a way that permits what it previously
  forbade.
- **MINOR** — a principle or section is added, or existing guidance is materially expanded.
- **PATCH** — clarifications, wording, and corrections that do not change meaning.

**Compliance review.** Every code review MUST verify compliance with these principles, not only
with style. Complexity that appears to violate a principle MUST be justified explicitly in the
pull request or removed. Any deviation discovered after merge MUST be recorded and corrected
rather than normalised.

**Runtime guidance.** `AGENTS.md` (referenced by `CLAUDE.md`) carries operational guidance for
contributors and agents working in this repository. It supplements this constitution and MUST
NOT contradict it.

**Version**: 1.0.0 | **Ratified**: 2026-08-25 | **Last Amended**: 2026-08-25
