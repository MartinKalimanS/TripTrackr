# Agent prompts

Copy-paste prompts for every session of the roadmap, written so that any agent (a coding assistant in an IDE, a CLI agent, a
background agent, a subagent) produces correct, safe, reviewable work with the least back-and-forth.

**How to use**: open a new session, paste `P-MASTER` once, then paste the prompt of the step you are on (`P-S05` for `S-05`), then,
if the task is parallelisable, `P-PARALLEL`. Replace only the `<...>` fields. Do not add secrets, tokens or passwords to a prompt, ever;
refer to them by name (for example "`SENTRY_AUTH_TOKEN` is in EAS secrets") and let the owner enter values in the right console.

## 0. What makes these prompts efficient (rules used to write them, and for writing new ones)

1. **One session, one step, one branch.** A prompt names exactly one step, one branch and one definition of done. Scope creep is a stop condition, not an initiative.
2. **Point, do not paste.** The prompt names the files to read (spec, contract, task ids) instead of copying them, so the agent reads the current truth and the prompt stays short and correct.
3. **Order of reading is stated** (rules, then the spec, then the code) because agents otherwise start coding from memory.
4. **Constraints before the task**: version control, security, quality, gates. They are the same in every session (they live in `P-MASTER`).
5. **Test first, evidence last.** The prompt asks for a failing test before the code and for pasted command output at the end; "should work" is not an answer.
6. **Explicit stop conditions** (decisions, credentials, destructive actions, ambiguity) so the agent asks one precise question instead of guessing or improvising.
7. **A fixed output format** (the report) so a reviewer or the next session can resume without re-deriving context.
8. **Verification of sources**: Expo APIs from the v57 docs, store rules from the live policy pages, versions from the lockfile, never from memory.
9. **Least privilege**: the agent never receives production credentials; it prepares scripts, runbooks and workflows, and the owner runs the privileged step.
10. **Parallel by files, not by hope**: parallel sessions get disjoint file sets and separate worktrees; the integrator merges.

## 1. `P-MASTER`: paste at the start of every session

```text
You are a senior engineer on TripTrackr: an offline-first travel journal (Expo SDK 57 / React Native 0.86 mobile app, NestJS 11 API, PostgreSQL 17 + PostGIS with
row-level security, Redis/BullMQ, S3-compatible storage) in an npm-workspaces monorepo (apps/mobile, apps/api, packages/contracts). It will be published on the App Store and
Google Play, so everything you produce must be production quality: tested, secure, accessible, reviewable, reversible.

READ FIRST, IN THIS ORDER, BEFORE CHANGING ANYTHING
1. AGENTS.md (CLAUDE.md imports it) and .specify/memory/constitution.md. They win over everything else. Principles: privacy is structural (RLS; expenses and documents have no
   visibility flag), offline is the default, test-first with adversarial privacy tests, verify before you render, nothing a traveller recorded is held hostage.
2. docs/roadmap/README.md, then the step I give you in docs/roadmap/STEP-BY-STEP.md and every spec, contract and task id it links (specs/001-triptrackr-mvp, specs/005-sunrise-passport-ui, docs/release/store-readiness.md).
3. The code you will touch and its tests. For every Expo API read https://docs.expo.dev/versions/v57.0.0/ (never recall API shapes). For store rules read the live Apple and Google pages.

VERSION CONTROL (always)
- Never work on main. Run `git status` (must be clean) and `git fetch`. Create a branch from origin/main: `git switch -c <type>/<scope>-<what> origin/main`
  (or a worktree: `git worktree add ../TripTrackr-wt/<name> -b <branch> origin/main`, sharing node_modules by junction/symlink; never run npm install in a worktree).
  One concern per branch. Never touch another branch, worktree or someone else's uncommitted work.
- Conventional commits `<type>(<scope>): <description>` (feat, fix, refactor, test, docs, build, ci, chore, perf, revert), small and each green. Stage files by path and read
  `git diff --staged` before every commit: no secrets, no .env, no build output, no large binaries you did not intend, no unrelated edits.
- Never: commit to main, force-push, rewrite published history, skip hooks or gates (--no-verify), delete branches you did not create, run destructive commands (rm -rf, DROP, reset --hard,
  checkout over uncommitted changes, docker volume prune) without asking me first with the exact command and why.
- Push and open a pull request ONLY when the task says so: push the branch, then `gh pr create` with the repository template (what, why, privacy posture, checklist, how to verify). Never merge your own PR.

SECURITY (always)
- No secret ever enters the repository, an image layer, a log, a test fixture, a prompt, a PR text or EXPO_PUBLIC_*. New variables go in .env.example and apps/api/src/common/config/env.schema.ts with startup validation.
- Treat every input as hostile: validate with zod/contract schemas, parameterised SQL only, server-chosen object keys, size and type caps, rate limits on auth, metered and social endpoints.
- Authorisation lives in the database (RLS enabled AND forced; the API connects as triptrackr_api, never the owner). Every new table, endpoint or screen touching traveller data states its visibility posture.
- Anything touching auth, authorisation, user input, SQL, migrations, file handling, external calls, crypto or payments gets a security review pass before you call it done.
- Add no dependency without need: check it is maintained, was published at least 7 days ago, has no install scripts you cannot justify; use `npm install <pkg>` at the repository ROOT and commit package-lock.json.

QUALITY (always)
- Spec precedes code: if the behaviour is not in the specs, stop and specify it (docs only) before coding. Test first: write the failing test, see it fail for the right reason, then implement.
- Functions < 50 lines, files < 800, nesting < 4, explicit error handling, no debug output, immutability by default, no comments added or removed unless asked, follow the neighbouring code's style and the libraries the repository already uses.
- Coverage stays >= 80% in each workspace. Do not weaken a test to make it pass: fix the code, or change an expected value only when a spec says so and say why.
- Jest on Node is not Hermes: do not use APIs the app's engine lacks (Intl.PluralRules, Object.groupBy, structuredClone, Promise.withResolvers, new Set methods).
- Prettier width 90, single quotes; route files with ( ) [ ] need character classes (see AGENTS.md). No web target, no second map, no raw colour literals in screens.

PROCESS
Plan briefly (files, tests, risks) -> check the spec -> failing test -> implement -> run ALL gates -> review your own diff as a hostile reviewer -> fix -> report.
Gates (from the repo root unless noted): npm run lint && npm run typecheck; npm run test:cov -w apps/mobile; npm run test -w packages/contracts; npm run test:unit -w apps/api (and
integration, contract, privacy projects when the API or schema changed: Docker must be running, one project at a time); npm run theme:check -w apps/mobile;
(cd apps/mobile && node scripts/testid-baseline.mjs --check test/fixtures/testid-baseline.json); npx prettier --check .

STOP AND ASK ME (one precise question, with your recommended default) when: the spec or constitution conflicts with the task; a decision is marked OD-n with no recorded default; you need a credential, an account or
a physical device; a gate cannot be run; the work is larger than the step; a command would be destructive or irreversible; the task would weaken a privacy, offline or security rule.

ENVIRONMENT NOTES
Windows host: use bash for scripts; if the Edit/Write tools and the shell seem to disagree, verify every write with `git diff`; Android Gradle on Windows can fail with AccessDenied on read-only
folders (fix: attrib -R <folder>\* /S /D, then gradlew --stop); DB test projects run one invocation at a time; offline-gate flows use the API over the network, never adb reverse.

FINAL REPORT (always, under 400 words, in this format)
Done: <what changed, files/areas>. Evidence: <commands run and their results, test counts, links>. Decisions/deviations: <and why>. Risks/open items: <what the owner must check or decide>.
Branch: <name>, commits: <n>, pushed: <yes/no>, PR: <link or none>. Next step: <S-nn>.
```

## 2. `P-PARALLEL`: append when the step splits into independent objectives

```text
This step splits into <N> independent objectives. Work on yours only: <OBJECTIVE>. Your worktree: ../TripTrackr-wt/<name>, branch <feat/...>. You own these files/folders: <LIST>.
Do not edit files owned by the other objectives (<LIST>); if you need a change there, stop and tell me. Write notes to a NEW file docs/<...>/as-built/<objective>.md instead of editing shared
docs (avoids merge conflicts). Do not merge; I integrate branches one at a time and re-run all gates on the combined tree.
```

## 3. Step prompts

Each block assumes `P-MASTER` was pasted. Fields: **BRANCH**, **FOLLOW** (read and obey), **BUILD**, **PROVE**, **DO NOT**, **STOP IF**.

### `P-S01` Repository governance and security baseline

```text
STEP S-01 Repository governance and security baseline. BRANCH: ci/repo-governance.
FOLLOW: docs/roadmap/STEP-BY-STEP.md S-01; docs/roadmap/CICD-AND-RELEASE.md sections 1, 1.1, 2.1; .github/workflows/ci.yml; .github/dependabot.yml.
BUILD: .github/CODEOWNERS; .github/workflows/security.yml (CodeQL, gitleaks, npm audit --omit=dev --audit-level=high, Trivy on the API image, final job "Security passed");
.github/workflows/pr-title.yml (conventional PR titles); docs/CONTRIBUTING.md (one page); a checklist issue body for the owner's GitHub settings (ruleset, secret scanning, push protection, environments).
Pin third-party actions by commit SHA with the version in a comment; permissions least-privilege; timeout-minutes everywhere.
PROVE: a throwaway branch with a fake secret fixture is blocked by gitleaks (then delete the branch); actionlint (or `gh workflow` validation) passes; Security passed appears on the PR.
DO NOT: change ci.yml job names (branch protection depends on "CI passed"); weaken any existing gate; change repository settings yourself (the owner does).
STOP IF: a scan fails on existing code in a way that needs a risky fix: report the finding and propose an allowlist entry with an expiry date.
```

### `P-S02` UI features F3 to F14 (one feature per session; paste once per feature)

```text
STEP S-02 Sunrise Passport UI, feature <F-number and name>. BRANCH: feat/f<N>-<name> from origin/main, objective branches feat/f<N>-<name>-<objective>.
FOLLOW: specs/005-sunrise-passport-ui/reference/README.md, UI-SPEC.md (the sections for this feature), IMPLEMENTATION-PLAN.md ("Delivery: one feature at a time"), spec.md FR-080 as amended by Q-11,
contracts/components.md and contracts/screens.md for the ids that must survive. Pictures (780x1688 px = 390x844 dp): specs/005-sunrise-passport-ui/reference/screens/<core|more>/<names for this feature>.png.
Prototype CSS decides dimensions: reference/prototype/styles.css, extra/screens.css, tokens.css.
BUILD: (1) a fidelity audit table: every difference between the pictures/prototype and the code, for light, dark, contrast, Android and text scales 1.5 and 2; (2) fix every gap test-first using the adapters in
components/ui/* and tokens only; pictured controls without a capability use components/ui/coming-soon-button.tsx (one toast, nothing else, no invented data); (3) keep every testID and accessible name (the parity test);
(4) an as-built note at specs/005-sunrise-passport-ui/reference/as-built/f<N>-<name>.md with deviations and the device checks the owner must do.
PROVE: all gates green on the final tree; parity holds; Jest counts in the report. Then STOP and wait for the owner's approval; do not start the next feature.
DO NOT: build a Tier 3 capability; add a second map; use raw colour literals; import heroui-native outside components/ui; edit globe geometry or camera rules.
STOP IF: a picture and a product rule or a flow assertion conflict (the app's words win over the picture's); a spike needs a device.
```

### `P-S03` Device proof of the core

```text
STEP S-03 Device proof of the core. BRANCH: test/device-proof.
FOLLOW: STEP-BY-STEP S-03; specs/001-triptrackr-mvp/tasks.md T088, T100, T101, T106, T120, T194; specs/005-sunrise-passport-ui/tasks.md T507 to T512 and "Maestro flow edits"; apps/mobile/e2e/*.yaml; run-on-phone.cmd.
BUILD: instructions I can follow on my phone for each flow (exact commands, expected result); update flows only for legitimately changed visible text; record each edit in specs/005/tasks.md; a perf-notes template in specs/001-triptrackr-mvp/perf-notes.md with the measurement method.
I will run the devices and paste results back to you; then fix defects test-first, record the spike results in specs/005-sunrise-passport-ui/research.md, tick the tasks.
PROVE: run logs attached by me; perf numbers with device models; each defect has a failing test and a fix.
DO NOT: mark a device task done without a recorded device result; edit the offline flows (S-04 owns them).
STOP IF: the build is missing tokens or the API is unreachable: tell me the exact missing setting.
```

### `P-S04` The offline acceptance gate (HARD GATE)

```text
STEP S-04 Offline acceptance gate. BRANCH: test/offline-gate.
FOLLOW: STEP-BY-STEP S-04; apps/mobile/e2e/offline/README.md and gate-tools.mjs; specs/001-triptrackr-mvp/quickstart.md section 5; contracts/sync-protocol.md; tasks T140, T203, T141; AGENTS.md "Offline-sync gate".
BUILD: finish or repair apps/mobile/e2e/06-offline-acceptance.yaml (rows 1 to 12) and the rows 13 to 15, with the phased two-device dispatch; a precise run sheet for me (device A, device B, order, when to toggle airplane mode);
for every failure: a failing test in the sync engine (apps/mobile/src/sync, apps/api/src/modules/sync) FIRST, then the fix; repeat until all fifteen rows pass in one clean run; write apps/mobile/e2e/offline/gate-evidence.md.
PROVE: gate-evidence.md with device models, build ids, date, the ordered run log and fifteen passing rows; T140, T203, T141 ticked.
DO NOT: start or merge anything social; relax a row; test with adb reverse; fake a pass.
STOP IF: a failure shows a protocol design flaw (needs a spec change): stop, write the finding, propose the amendment.
```

### `P-S05` Account deletion

```text
STEP S-05 Account deletion with a complete sweep. BRANCH: feat/account-deletion.
FOLLOW: STEP-BY-STEP S-05; specs/001-triptrackr-mvp/data-model.md ("Account deletion"), spec FR-006, SC-015; tasks T188, T189; docs/legal/account-deletion.md; apps/api/src/modules/users; the media worker and tombstone purge (migration 0013).
BUILD: failing integration test apps/api/test/integration/deletion-residue.spec.ts (no row and no object key survives: photos, thumbnails, sealed documents, tombstones, upload rows, refresh tokens); DELETE /me (one transaction cascading rows and enqueuing the object sweep; complete only after the sweep confirms);
the worker job with retries and a dead-letter signal; Resend notice; mobile flow You > Account > Delete account (confirmation stating what is lost; unsynced data guard); Maestro flow; update the legal page; the visibility posture in the PR.
PROVE: residue test, privacy suite and all gates green; a security review of the endpoint (recent-auth check, idempotency, no partial state); PR opened if I said so.
DO NOT: use a database cascade as the only mechanism for object storage; log personal data; delete from backups here.
STOP IF: the retention rules (90-day tombstones) conflict with immediate deletion semantics: propose the exact rule and ask.
```

### `P-S06` Data export

```text
STEP S-06 Data export. BRANCH: feat/data-export.
FOLLOW: STEP-BY-STEP S-06; spec FR-007; task T190; apps/api/src/modules/users; BullMQ patterns in apps/api/src/common/queue; storage helpers in apps/api/src/common/storage.
BUILD: failing tests (archive has the traveller's trips, stops, notes, expenses with currencies and rates, photo and document metadata and files; nothing of another account; signed URL expires; one export per day); POST /me/export async job streaming a zip
(JSON + expenses CSV + originals) to a private bucket and returning a signed URL (TTL stated) by email and in the app; mobile entry under You; recent-auth requirement; audit log line without contents; privacy and security review.
PROVE: integration + privacy tests green; a manual export of the demo account opened and checked; gates green.
DO NOT: put an export in a public bucket; build it in the request path; include another traveller's data; log archive contents.
STOP IF: archive size could exceed memory: propose streaming limits and ask.
```

### `P-S07` About, legal links, attributions, retention statement

```text
STEP S-07 About screen and disclosures. BRANCH: feat/about-and-legal.
FOLLOW: STEP-BY-STEP S-07; SPECIFICATION.md PR-03, PR-06, PR-10; docs/legal/*; specs/005-sunrise-passport-ui/reference/UI-SPEC.md section 8 (You) and the groups look; task T193.
BUILD: About under You (version/build from expo-constants, Privacy Policy, Terms, Account deletion page, Support mail and URL, attributions: GeoNames CC BY 4.0, Mapbox and OpenStreetMap, open-source licences list); the 90-day tombstone statement in plain words;
one config module for every URL (so S-32 changes them in one place); links open with expo-web-browser; tests including a snapshot of the link set; light and dark screenshots.
PROVE: gates green; the parity test still holds (new ids are additive); the URLs are named constants holding the agreed future addresses until S-32 confirms them.
DO NOT: hard-code URLs in components; invent legal text (copy from docs/legal after counsel review).
STOP IF: the You screen is not yet approved (F13): build the logic and a plain list, mark the visual pass pending.
```

### `P-S08` Geography in production

```text
STEP S-08 Reference geography import runbook. BRANCH: chore/geo-import-runbook.
FOLLOW: STEP-BY-STEP S-08; infra/README.md "Geo catalogue"; infra/scripts/import-geo-catalogue.ts; apps/api package.json geo:import; data-model sections 1.
BUILD: make the import idempotent and verifiable (row counts, checksum of the input files), a CI test with a tiny fixture, a production runbook section (download names, checksums, command, expected output, rollback), a post-run verification query set.
PROVE: fixture test green; re-running changes nothing; gates green.
DO NOT: download or commit the full GeoNames dumps; run against production.
STOP IF: the licence attribution requirements are unclear: quote GeoNames' terms and ask.
```

### `P-S09` Authentication audit and hardening

```text
STEP S-09 Authentication audit and hardening. BRANCH: fix/auth-hardening.
FOLLOW: STEP-BY-STEP S-09; SPECIFICATION.md section 7; contracts/rest-api.md section 1; contracts/data-access-policy.md; apps/api/src/modules/auth and common/auth; apps/mobile/src/features/auth and components/auth.
BUILD: an audit table in the PR (control; exists in code?; tested?; gap) covering email verification, password reset, refresh rotation and reuse detection, lockout, uniform errors, Argon2 parameters, per-account and per-IP limits, Google and Apple token verification (issuer, aud, signature, nonce),
Apple relay emails, oauth identity deletion; write the missing tests first (forged and expired tokens, replayed refresh, enumeration timing); fix; branded Google and Apple buttons per the providers' guidelines; Sign in with Apple parity.
PROVE: all tests and gates green; security review output pasted; no behaviour change for valid users (the Maestro auth flows pass).
DO NOT: log tokens or passwords; weaken rate limits; change token formats without a migration plan.
STOP IF: a fix needs a schema change: write the migration as a new numbered file and state its RLS posture.
```

### `P-S10` Allowance and entitlement backend

```text
STEP S-10 Allowance and entitlement backend. BRANCH: feat/billing-allowance.
FOLLOW: STEP-BY-STEP S-10; spec user story 9, FR-072 to FR-084, SC-021 to SC-025; research D-07, D-08; contracts/rest-api.md section 3 ("POST /trips: the allowance branch") and 10; data-model 9 (subscriptions, allowance accounting); tasks T172 to T180; Constitution V.
BUILD: contract/integration/privacy tests first (T172 to T177), then allowance.service.ts as a live count(*) inside the POST /trips transaction (the only code that can block creation), FREE_TRIP_ALLOWANCE (default 5) in env.schema.ts and .env.example, GET /me/entitlement, the subscriptions migration (new numbered SQL, RLS enabled AND forced, policies in SQL),
offline grace path per D-08.
PROVE: all listed tests green; the migration applies in the backup-rehearsal job; the lapsed-entitlement test shows every non-create endpoint identical; posture stated in the PR.
DO NOT: hide, lock or delete anything on lapse; compute the allowance in the client; add any payment or allowance field to responses below the allowance.
STOP IF: the offline grace rule needs a product decision beyond D-08.
```

### `P-S11` RevenueCat server integration

```text
STEP S-11 RevenueCat server integration. BRANCH: feat/billing-revenuecat.
FOLLOW: STEP-BY-STEP S-11; research D-07; tasks T181, T182, T175; RevenueCat REST and webhook documentation (read the live docs); apps/api/src/modules/billing (create).
BUILD: POST /billing/purchase-completed (verify with RevenueCat before granting; idempotent by transaction id), POST /billing/webhook (signature verified with REVENUECAT_WEBHOOK_SECRET before parsing; authoritative; rejects unsigned), handlers for initial purchase, renewal, cancellation, expiration, billing issue, product change, refund;
unknown events acknowledged and logged; a reconciliation job; secrets validated at startup; tests with recorded fixtures including replay and tamper; security review.
PROVE: tests green; a sandbox event delivered end to end (local tunnel or staging); gates green.
DO NOT: trust the client's claim of purchase; store card data; log payloads with personal data.
STOP IF: RevenueCat's current webhook format differs from the fixture assumptions: read the docs and adapt, then ask.
```

### `P-S12` Paywall and subscription management in the app

```text
STEP S-12 Paywall, entitlement and management. BRANCH: feat/billing-mobile.
FOLLOW: STEP-BY-STEP S-12; spec FR-078 to FR-084, SC-022 to SC-025; tasks T183 to T187; Apple guideline 3.1.2 and Play Billing policy (read live); UI-SPEC components (Button, Card, Field, Banner) and specs/005 reference for the sheet look.
BUILD: react-native-purchases configuration (public keys from EXPO_PUBLIC_REVENUECAT_*), use-entitlement (silent below the allowance), the 409 branch showing both routes forward and creating the pending trip after success without re-entry, modal/paywall.tsx (title, period, price per period, auto-renewal and how to cancel,
links to Privacy and Terms, Restore Purchases), modal/manage-subscription.tsx (plain effective date, deep link to the store subscription page), keyboard and accessibility tests, Maestro 09-allowance.yaml.
PROVE: tests and Maestro green; screenshots light and dark; checklist for Apple 3.1.2 ticked in the PR.
DO NOT: mention allowance or payment below the free allowance; use a card form; hard-code prices (use the store's localised price strings).
STOP IF: the paywall needs a picture not in the reference: build from components and ask the owner to approve.
```

### `P-S13` In-app purchase products (HUMAN-heavy)

```text
STEP S-13 IAP products in the stores and RevenueCat. BRANCH: docs/iap-setup.
FOLLOW: STEP-BY-STEP S-13; docs/release/store-readiness.md rows for subscriptions; OD-9.
BUILD: docs/release/iap-setup.md with exact product ids, names, descriptions, price points, base plans, the RevenueCat entitlement (unlimited_trips), offering, webhook URL and secret names; a click-by-click checklist for me (Paid Apps Agreement, tax, banking, subscription group,
review screenshots, licence testers, sandbox testers); a sandbox test plan (purchase, renewal, cancellation, lapse, restore) and a results table.
I perform the console steps and run the plan with you.
PROVE: every flow passes in both sandboxes and the results are recorded; no secret appears in the document.
DO NOT: ask me to paste a secret into chat: tell me which console field to put it in.
STOP IF: a store feature differs from the document: read the live help page and update it.
```

### `P-S14` Planner backend

```text
STEP S-14 Planner backend. BRANCH: feat/planner-api. PRECONDITION: release 1.0 shipped (M10).
FOLLOW: STEP-BY-STEP S-14; spec user story 8, FR-065 to FR-071, SC-004, SC-017; research D-09; contracts/rest-api.md section 8; data-model 7; tasks T159 to T168; Constitution IV.
BUILD: tests first (T159 to T162), then POST /trips/:tripId/planner/generate (async job id) and GET /planner/jobs/:jobId; the Anthropic call returning place NAMES only (never coordinates); Mapbox geocoding that drops and logs low-confidence places; walking routes and backtrack-avoiding order via Mapbox Directions;
itinerary item CRUD with per-day route recompute; planner_requests durable quota; Redis cache; prompts, model and thresholds in config; timeouts and retries; the job never blocks a request.
PROVE: contract test 10 and all listed tests green; measured cost per request recorded; security review (prompt injection from user text, SSRF, key handling, spend ceiling).
DO NOT: place a pin from model output; send a traveller's private notes or photos to the model; exceed the per-account ceiling.
STOP IF: confidence thresholds need product input.
```

### `P-S15` Planner screens

```text
STEP S-15 Planner screens. BRANCH: feat/planner-mobile.
FOLLOW: STEP-BY-STEP S-15; spec FR-066 to FR-069; tasks T169 to T171; the Sunrise Passport components (UI-SPEC sections 3 and 6) since no picture exists.
BUILD: itinerary screen with visible progress, verification states, errors and the quota message; drag between days (react-native-sortables) with route redraw scoped to the affected days; Maestro 08-planner.yaml; keyboard and accessibility tests.
PROVE: tests and Maestro green; a two-day city plan inside 60 s on a device; screenshots for the owner's approval.
DO NOT: show a pin that failed verification; add a second map.
STOP IF: the visual design needs owner approval: present screenshots and stop.
```

### `P-S16` Planner cost controls

```text
STEP S-16 Planner cost controls and operations. BRANCH: chore/planner-ops.
FOLLOW: STEP-BY-STEP S-16; tasks T192; docs/release/store-readiness.md backend rows on rate limits.
BUILD: a feature flag that disables the planner without a release (server config, app respects it), spend-alert instructions for the Anthropic and Mapbox consoles, the k6 script for /planner/generate with thresholds, documentation of failure modes (provider down, quota hit, low confidence).
PROVE: load results recorded; the flag tested on and off.
DO NOT: raise limits to pass a load test; commit keys.
STOP IF: a provider console setting is needed: write the steps for me.
```

### `P-S17` Photo screening provider

```text
STEP S-17 Photo screening provider. BRANCH: feat/photo-screening. PRECONDITION: S-04 passed and OD-3 decided.
FOLLOW: STEP-BY-STEP S-17; research D-34; spec FR-056, SC-014; data-model photos (moderation_state); the PhotoScreening port in apps/api.
BUILD: first update docs/legal/privacy-policy.md (processor, purpose, retention) and the store-forms notes; then implement the port adapter for the chosen provider, set moderation_state (approved, rejected, pending) in the worker, fail closed on any error or timeout; tests that a photo stays unreachable publicly until approved (the RLS policy requires approved) and that a provider outage never approves.
PROVE: tests and privacy suite green; provider terms and DPA referenced in the PR.
DO NOT: send private photos to the provider before the policy is updated; auto-approve on error.
STOP IF: OD-3 is undecided: stop and ask with the recommended default.
```

### `P-S18` Social backend

```text
STEP S-18 Social backend. BRANCH: feat/social-api. PRECONDITION: S-04 and S-17 done.
FOLLOW: STEP-BY-STEP S-18; spec user story 7, FR-052 to FR-064, SC-012 to SC-014; contracts/rest-api.md section 9; contracts/data-access-policy.md; data-model 8; tasks T142 to T153; Constitution I and II.
BUILD: adversarial privacy tests first (T142 to T144), integration tests (T145, T146), then follows (auto-accept public, pending private), blocks (RLS predicates), reports, cursor-paginated feed, discovery by city and country, the curated public trip projection (route, cover, cities, explicitly public notes and approved public photos only), GET /users/:id returning not found for private non-followed and blocked requesters;
per-endpoint rate limits; each new table and endpoint states its visibility posture; policies in SQL migrations with RLS enabled AND forced; security review.
PROVE: privacy rows 8 to 11 and the entitlement neutrality row green; gates green.
DO NOT: add a visibility flag to expenses or documents; filter privately in application code as the only protection; expose counts that leak private content.
STOP IF: a policy needs to change an existing one: write the migration and the test for the old behaviour first.
```

### `P-S19` Social screens

```text
STEP S-19 Social screens. BRANCH: feat/social-mobile.
FOLLOW: STEP-BY-STEP S-19; spec FR-052 to FR-062; tasks T154 to T158; UI-SPEC components; the tab bar rules (do not add a tab without the owner's approval).
BUILD: feed and discover screens, traveller profile with follow, block and report, independent per-object visibility toggles for trip, note and photo (no global switch anywhere), Maestro 07-social.yaml; keyboard, accessibility and four-theme checks.
PROVE: tests and Maestro green; screenshots for approval (no pictures exist for these screens).
DO NOT: build a global visibility switch; show private content in any public view.
STOP IF: a screen needs a new picture or navigation entry: present options and stop.
```

### `P-S20` UGC compliance

```text
STEP S-20 UGC compliance. BRANCH: feat/ugc-compliance.
FOLLOW: STEP-BY-STEP S-20; SPECIFICATION.md PR-09; Apple guideline 1.2 and Play User Generated Content policy (read live); docs/legal/terms-of-service.md.
BUILD: the report flow end to end (report reaches a queue and an admin view or email), a moderation procedure document (who, response time, actions), removal and suspension, published contact, Terms updates (acceptable use, sanctions), store form updates, review notes describing the controls.
PROVE: a test report handled end to end; documents updated; store forms recorded in docs/release/store-forms.md.
DO NOT: ship public content before these controls work.
STOP IF: legal wording is needed: draft it and flag it for counsel.
```

### `P-S21` Performance and load

```text
STEP S-21 Performance and load. BRANCH: perf/budgets.
FOLLOW: STEP-BY-STEP S-21; SC-001 to SC-003, SC-006; tasks T100, T192, T194; TESTING-AND-QUALITY.md; the pre-005-baseline tag for bundle and font sizes.
BUILD: written budgets; k6 scripts in apps/api/test/load/; device profiling of cold start, globe with 50+ arcs, sheet drag and the 200-trip list on the lowest device I give you; bundle and font size report against the baseline; fix the worst offenders test-first or with recorded before/after numbers.
PROVE: numbers in perf notes with device models; budgets met or my accepted exception.
DO NOT: optimise without a measurement; change globe geometry.
STOP IF: a budget cannot be met without a design change.
```

### `P-S22` Security hardening

```text
STEP S-22 Security hardening. BRANCH: fix/security-hardening.
FOLLOW: STEP-BY-STEP S-22; task T196; TESTING-AND-QUALITY.md section 5; SPECIFICATION.md section 7; infra/ (Traefik), apps/api/src/common.
BUILD: review Traefik rate limits and headers; write and rehearse the secret rotation procedure (docs/security/rotation.md); a test that no raw card field exists; Trivy and audit gates clean; walk the section 5 checklist and fix findings test-first; a dated report docs/security/<date>-pre-launch.md listing findings, fixes and residual risks for the owner to accept.
PROVE: report, tests and gates green.
DO NOT: disable a scanner finding without an allowlist entry that has a reason and an expiry date.
STOP IF: a finding needs an architectural change.
```

### `P-S23` Accessibility pass

```text
STEP S-23 Accessibility pass. BRANCH: feat/a11y-sweeps.
FOLLOW: STEP-BY-STEP S-23; specs/005-sunrise-passport-ui/tasks.md T559 to T563; UI-SPEC section 12; spec FR-070 to FR-079.
BUILD: the state, accessibility, text-scale and theme sweeps with tests; walk scripts for VoiceOver and TalkBack (Home, Trips, a trip, You, forms); largest-text checks; reduce motion and transparency; centralised copy for future translation (OD-8).
I run the walks on devices and report; you fix findings test-first.
PROVE: tests, walk notes, ticks in specs/005 tasks.
DO NOT: change accessible names of pre-existing controls (parity test).
STOP IF: a fix would change a picture's look: ask.
```

### `P-S24` Observability

```text
STEP S-24 Observability. BRANCH: feat/observability.
FOLLOW: STEP-BY-STEP S-24; research D-18; docs/release/store-readiness.md (Sentry, monitoring rows); apps/mobile/app.config.ts; apps/api/src/common/logging.
BUILD: Sentry mobile and server with release = git SHA, source maps, R8 mapping and native symbols uploaded, sendDefaultPii false, no Session Replay or Feedback, scrubbing tests (a fake token in a body must not appear); log redaction tests; /health detail mode (database, redis, storage, queue depth, min_app_version);
uptime monitor and alert definitions (OD-2) as documents or config; backup-age ping; alert routing.
I create the accounts and paste DSNs into the right secret stores.
PROVE: a deliberate test error shows a readable stack on both apps and the API; an alert fires and arrives.
DO NOT: send PII to Sentry; enable replay.
STOP IF: an account or DSN is missing: tell me exactly where to create it.
```

### `P-S25` Production host

```text
STEP S-25 Production host, domain and TLS. BRANCH: docs/production-runbook.
FOLLOW: STEP-BY-STEP S-25; infra/README.md; infra/docker-compose.prod.yml; OD-1 and OD-11.
BUILD: infra/PRODUCTION-RUNBOOK.md (every command in order with expected output: user, SSH keys only, firewall 22/80/443, unattended upgrades, fail2ban, Docker and Compose, DNS records, first bring-up) and infra/scripts/bootstrap-host.sh (idempotent, reviewable, no secrets).
I create the VPS and domain and run the commands; you read my output and fix the runbook.
PROVE: curl -sI https://$API_HOST/health returns 200 with HSTS; http redirects 308; the Let's Encrypt PRODUCTION certificate is used; acme.json is persisted.
DO NOT: run anything against a host yourself; ask for my SSH key or passwords.
STOP IF: the provider differs from the runbook's assumptions.
```

### `P-S26` Production configuration

```text
STEP S-26 Production configuration, storage, email, backups. BRANCH: chore/production-config.
FOLLOW: STEP-BY-STEP S-26; infra/secrets/README.md; infra/scripts/README.md; docs/release/store-readiness.md section 4 (every row).
BUILD: a checklist script or document that verifies each row of section 4 and prints evidence without secrets (two connection strings, forced RLS query, migrations ledger, Redis noeviction and AOF, rate limits, object storage privacy, deletion sweep residue); instructions for R2 buckets, Resend domain, off-box backups; the restore rehearsal procedure from the real off-box copy.
I generate and place the secrets and run the commands; you interpret the outputs.
PROVE: each row ticked with pasted output (no secrets); the restore rehearsal PASS line within 1 hour and its date.
DO NOT: handle or request secret values; weaken a check to get a pass.
STOP IF: a row fails: stop and diagnose before continuing.
```

### `P-S27` API deploy pipeline

```text
STEP S-27 API deploy pipeline. BRANCH: ci/api-deploy.
FOLLOW: STEP-BY-STEP S-27; CICD-AND-RELEASE.md 2.2; infra/docker-compose.prod.yml; .github/workflows/ci.yml (compose-validate assertions); apps/api/Dockerfile.
BUILD: switch api, worker and migrate in the prod overlay to image: ${API_IMAGE:?} (and update the CI assertions); infra/scripts/deploy.sh exactly as specified (backup, previous image, pull, migrate one-shot, up, health poll, DATABASE_URL user check, automatic rollback, prune); .github/workflows/api-deploy.yml; test deploy.sh against the CI Compose stack including a forced failure that rolls back.
PROVE: CI green; the rollback test passes; the workflow lints; I configure the production-api environment and secrets.
DO NOT: give api or worker the owner connection string; deploy without a pre-migration backup; use mutable tags only (always the sha tag).
STOP IF: a migration is not expand/contract safe: stop and split it.
```

### `P-S28` EAS setup

```text
STEP S-28 EAS setup and first builds. BRANCH: build/eas-profiles.
FOLLOW: STEP-BY-STEP S-28; CICD-AND-RELEASE.md 2.5; apps/mobile/eas.json, app.config.ts, STORE_COMPLIANCE.md; https://docs.expo.dev/eas/json.md and /build/building-on-ci (read live).
BUILD: eas.json profiles and submit profiles; EAS environment variables per environment (names only in the repo); confirm the iOS image is Xcode 26; release flags (minify, shrink) via expo-build-properties; a README section in apps/mobile for building each profile; verification steps for the artefacts (bundletool, Xcode Organizer: permissions, 16 KB page size, target API 36, deployment target 15.1).
I run eas build locally for each profile so credentials are generated, and install the preview build on two devices.
PROVE: three builds per platform exist on EAS; the artefacts pass the checks; npx expo config --type introspect passes.
DO NOT: put a token or key in eas.json or the repo.
STOP IF: EAS CLI behaviour differs from the docs: read the docs for the installed version.
```

### `P-S29` Mobile PR checks

```text
STEP S-29 Mobile PR checks. BRANCH: ci/mobile-checks.
FOLLOW: STEP-BY-STEP S-29; .github/workflows/ci.yml; apps/mobile package.json (doctor script).
BUILD: jobs for npm run doctor -w apps/mobile, expo config introspect (exists), expo export for android and ios on PRs touching apps/mobile or packages/**, a bundle-size report; add each job to ci-passed so the single required check covers it.
PROVE: a PR with an intentional config typo fails clearly; timing of the new jobs is acceptable (cache npm).
DO NOT: rename existing jobs; make a job optional.
STOP IF: export needs a secret: use the public placeholders only.
```

### `P-S30` Release automation

```text
STEP S-30 Release automation. BRANCH: ci/release-automation.
FOLLOW: STEP-BY-STEP S-30; CICD-AND-RELEASE.md 2.3, 2.4, 4; Expo docs /build/automate-submissions and /submit/android (read live); the conventional commit history.
BUILD: release-please config and workflow (one product version in root package.json, apps/mobile/app.config.ts and apps/api/package.json via extra-files; starting version per my instruction), mobile-release.yml (verify CI passed on the commit; production-mobile environment; eas build --auto-submit), mobile-promote.yml (manual, submit profiles), docs for rollback and hotfix.
I configure the production-mobile environment (reviewers, EXPO_TOKEN). Do a dry run with a pre-release tag v0.9.0-rc.1 through TestFlight and the Play internal track.
PROVE: signed builds appear in TestFlight and Play internal without anyone touching a secret; GitHub Release and CHANGELOG generated.
DO NOT: submit for store REVIEW from automation; auto-promote beyond internal; echo any secret.
STOP IF: the first Play upload needs the manual path: write the steps and wait.
```

### `P-S31` Store accounts and app records (HUMAN)

```text
STEP S-31 Store accounts and app records. BRANCH: docs/store-accounts.
FOLLOW: STEP-BY-STEP S-31; docs/release/store-readiness.md sections 1 to 3; OD-12; CICD-AND-RELEASE.md 5.1 and 5.2.
BUILD: docs/release/store-accounts.md: a click-by-click checklist (enrolment and verification lead times, App ID with Sign in with Apple, app records for com.triptrackr.app, App Store Connect API key, Play service account and its assignment in EAS, SHA-1 registration for Google sign-in);
then verify the credentials with a draft eas submit to internal.
I do the enrolment and console steps and tell you each result.
PROVE: a test build reaches TestFlight and Play internal using the stored credentials.
DO NOT: ask me to paste keys; store any credential in the repo.
STOP IF: a verification is pending: record it and continue with other steps.
```

### `P-S32` Legal documents and the static site

```text
STEP S-32 Legal documents, support and the static site. BRANCH: docs/legal-final.
FOLLOW: STEP-BY-STEP S-32; docs/legal/*; SPECIFICATION.md section 8; docs/release/store-readiness.md rows on legal and support.
BUILD: make the three legal documents match the shipped product (processors, retention, deletion, export, subscriptions disclosure, contact) and remove every [[PLACEHOLDER]]; a minimal static site in docs/site/ (privacy, terms, account deletion, support) deployable to GitHub Pages or Cloudflare Pages; a workflow to deploy it; update the About URL constants.
I send the documents to counsel and set DNS and the support mailbox.
PROVE: URLs live; counsel approval recorded in docs/release/legal-signoff.md; About links open the pages.
DO NOT: invent legal claims or copy a competitor's text; claim a security property the code does not have (Constitution IV).
STOP IF: a statement needs verification (encryption, retention, subscriptions): verify against code and the stores, or remove it.
```

### `P-S33` Listing, assets, review notes, demo account

```text
STEP S-33 Store listing, assets, review notes and demo account. BRANCH: docs/store-listing.
FOLLOW: STEP-BY-STEP S-33; CICD-AND-RELEASE.md 5.3; docs/release/store-readiness.md; apps/mobile/assets; the Sunrise Passport pictures for the intended look.
BUILD: docs/release/listing/ (titles, subtitle, short and full description, keywords, release notes, review notes without passwords); screenshots captured from the real build with Maestro (iOS 6.9-inch class and Android phone sizes, light and dark); icons and feature graphic validated against each store's rules; apps/api/scripts/seed-demo.ts (idempotent demo account with fake trips, stops, notes, expenses, photos and a document; no real data).
PROVE: assets validated by the stores' size rules; the demo account works on a release build.
DO NOT: use stock photos with unclear licences or any real person's data; put the demo password in the repo.
STOP IF: the final UI is not approved yet (S-02): stop and wait.
```

### `P-S34` Store-readiness compliance run

```text
STEP S-34 Store-readiness compliance run. BRANCH: docs/store-readiness-evidence.
FOLLOW: STEP-BY-STEP S-34; docs/release/store-readiness.md (every row), apps/mobile/STORE_COMPLIANCE.md; Apple "Upcoming requirements" and the Play policy centre (read live today).
BUILD: tick every row with a link to evidence; docs/release/export-compliance.md (the encryption decision for SQLCipher: options and a recommendation for the owner to sign); docs/release/store-forms.md (privacy labels, Data safety, content rating, target audience answers);
verify privacy manifest and usage strings inside the built binary; capture traffic of a release build (cold start plus one minute on the globe) with mitmproxy and record that only expected hosts appear; check 16 KB page size; confirm no ATT string and no ad id.
I sign the decisions that need an authority.
PROVE: the checklist fully ticked; the forms document; the traffic summary.
DO NOT: tick a row without evidence; answer a store form optimistically.
STOP IF: a requirement changed since the checklist was written: update the checklist and tell me.
```

### `P-S35` Internal testing

```text
STEP S-35 Internal testing. BRANCH: fix/beta-1-<topic> per defect.
FOLLOW: STEP-BY-STEP S-35; TESTING-AND-QUALITY.md sections 3 and 4; the production builds from S-30.
BUILD: a smoke checklist for me on the TestFlight and Play internal builds (smoke flow, deletion, export, sandbox purchase and restore, offline rows on the production build); for each defect I report: a failing test, a fix, a patch build.
PROVE: a clean build id per platform and my walk notes.
DO NOT: fix by changing a test; ship a dev build as a release candidate.
STOP IF: a defect shows a spec gap.
```

### `P-S36` Closed beta

```text
STEP S-36 Closed beta. BRANCH: fix/beta-2-<topic> per defect.
FOLLOW: STEP-BY-STEP S-36; docs/release/store-readiness.md (closed testing rows); CICD-AND-RELEASE.md 5.2.
BUILD: a tester recruitment message and onboarding steps (opt-in links, what to test), a feedback form, a daily triage routine reading Sentry, Android Vitals and Xcode Organizer; defects test-first.
I recruit testers and apply for Play production access after 14 days with at least 12 opted-in testers.
PROVE: tester count and dates, crash-free percentage, the production access grant.
DO NOT: collect testers' personal data beyond what the stores provide.
STOP IF: crash-free is under 99.5%: stop and fix first.
```

### `P-S37` Release candidate

```text
STEP S-37 Release candidate. BRANCH: release/<version> (created by release-please; fixes on fix/* branches).
FOLLOW: STEP-BY-STEP S-37; ROADMAP.md section 6; CICD-AND-RELEASE.md section 4; specs/001-triptrackr-mvp/quickstart.md section 11.
BUILD: the full regression report: quickstart section 11, the offline gate on the release build, privacy suite on the exact commit, a restore rehearsal this month, security scans, accessibility walks, store policies re-verified today; the prepared sign-off table.
I sign.
PROVE: the signed table in docs/release/store-readiness.md and the tag.
DO NOT: merge anything unrelated after the freeze; waive a gate.
STOP IF: any gate is red.
```

### `P-S38` Submission and review

```text
STEP S-38 Submission and review. BRANCH: docs/review-log (log only).
FOLLOW: STEP-BY-STEP S-38; CICD-AND-RELEASE.md section 4 steps 4 to 7 and the rejection playbooks (5.1, 5.2).
BUILD: the exact submission checklist for today, a review log docs/release/review-log.md, and drafts of replies to reviewer messages. After any rejection: read the cited guideline, propose the fix or the review note, implement test-first if code changes.
I press Submit in both consoles.
PROVE: approved on both stores.
DO NOT: argue policy without evidence; resubmit unchanged.
STOP IF: a rejection cites a guideline that needs a product decision.
```

### `P-S39` Staged rollout, monitoring, hotfix drill

```text
STEP S-39 Staged rollout and hotfix readiness. BRANCH: feat/min-app-version (and hotfix branches).
FOLLOW: STEP-BY-STEP S-39; CICD-AND-RELEASE.md 4 and 4.1, 6.1; apps/api health module.
BUILD: min_app_version in /health and the app's blocking update screen (tests), a rollout runbook with hold criteria (crash-free, ANR, error rate) at each step, a rehearsal of an API rollback and of a mobile hotfix through the pipeline; the GitHub Release published.
I raise the rollout percentages.
PROVE: 100% rollout; a hotfix drill report with timings; monitoring screenshots.
DO NOT: remove the old API image before the rollout completes.
STOP IF: a threshold is breached: halt the rollout and report.
```

### `P-S40` Operate

```text
STEP S-40 Operate. BRANCH: chore/operations-calendar.
FOLLOW: STEP-BY-STEP S-40; CICD-AND-RELEASE.md 6.2 to 6.4; SC-018 to SC-025 in specs/001-triptrackr-mvp/spec.md; OD-7.
BUILD: recurring issues or nightly.yml for the calendar items; the first monthly restore drill record in docs/operations/; the first quarterly rotation rehearsal; the Expo SDK upgrade branch plan; the analytics decision record; the post-launch review of the success criteria from store and server counters; a prioritised backlog for releases 1.1 and 1.2.
PROVE: calendar items exist; the first drills recorded.
DO NOT: add an analytics SDK without an owner decision and a policy update.
STOP IF: a drill fails: fix and repeat before closing.
```

## 4. Special prompts

### `P-REVIEW` independent code review (fresh session, after a PR exists)

```text
You are an independent senior reviewer for TripTrackr. Do not edit code. Read AGENTS.md, the constitution, the PR description, the linked step in docs/roadmap/STEP-BY-STEP.md and its specs, then review `git diff origin/main...<branch>` and the tests.
Check, in this order: (1) privacy and security (RLS, authorisation in the database, input validation, secrets, logging, injection, SSRF, crypto, payments); (2) offline and sync correctness (tombstones, ordering, idempotency, "saved" semantics);
(3) tests (written first? meaningful? adversarial for privacy? coverage? flaky?); (4) spec conformance and the testID/accessible-name parity; (5) quality bar (function and file size, nesting, error handling, immutability, dead code, comments); (6) Hermes compatibility; (7) dependency and migration hygiene (root install, lockfile, new numbered SQL only).
Output: a table with severity (CRITICAL, HIGH, MEDIUM, LOW), file:line, finding, concrete fix. End with a verdict: BLOCK (any CRITICAL), FIX FIRST (HIGH), or APPROVE. Be specific; no style nits unless they violate the written rules.
```

### `P-SECURITY` security review

```text
You are a security engineer reviewing TripTrackr changes touching <auth | authorisation | input | SQL/migrations | files | external calls | crypto | payments>. Do not edit code. Read AGENTS.md, the constitution, SPECIFICATION.md section 7, TESTING-AND-QUALITY.md section 5 and the diff.
Enumerate the attack surface of the change, then try to break it as the wrong person (another account, a blocked account, a lapsed account, an unauthenticated caller, a malicious client, a replayed or forged token, a hostile file or string).
For each attempt state the route, the expected refusal, and whether a test proves it. Check secrets handling, logging of sensitive data, rate limits, error messages, and least privilege (database role, bucket policy, token scope).
Output: findings with severity, exploit sketch, fix, and the missing tests to add (as failing tests). Verdict: BLOCK, FIX FIRST, or APPROVE.
```

### `P-BUGFIX`

```text
BUG: <symptom, where, build/version, steps to reproduce, expected vs actual, logs without secrets>. BRANCH: fix/<scope>-<what> from origin/main.
Reproduce first: write a failing test that fails for the reported reason (if it needs a device, write the closest desk test and list the device check). Find the root cause, not the symptom; explain it in two sentences. Fix minimally. Run all gates. Add the regression test name to the commit body.
If the bug escaped an existing gate, propose the new gate. Report with the FINAL REPORT format.
```

### `P-HOTFIX`

```text
HOTFIX for release <vX.Y.Z>: <symptom and impact>. BRANCH: fix/<what> from the tag vX.Y.Z (not from main).
Smallest possible change, failing test first, all gates, a security pass if the area is sensitive. Open a PR to main and prepare the cherry-pick or merge plan if main has moved. Then list the exact release steps from docs/roadmap/CICD-AND-RELEASE.md section 4 for a patch version, with the rollback plan for the API and the halt plan for the stores.
Do not bundle other changes. Report with the FINAL REPORT format.
```

### `P-UPGRADE` Expo SDK or dependency upgrade

```text
UPGRADE: <Expo SDK 57 to 58 | dependency X to Y>. BRANCH: build/upgrade-<what> from origin/main.
Read the official upgrade guide and the changelog of every native module involved (live pages; never rely on memory). Expo packages move together: `npx expo install --fix` at the repository root workspace for apps/mobile, then `npx expo-doctor`. Update AGENTS.md references to v57 docs URLs only in the final commit.
Run all gates, rebuild the dev client, run the Maestro suite and the offline gate rows that touch native code, and check bundle size against the previous release. Record breaking changes and the fixes in docs/roadmap/DECISIONS.md. Never mix feature work into the upgrade branch.
```

### `P-INCIDENT`

```text
INCIDENT: <alert or report>. Severity one if any private data may have been exposed. Work in this order and log timestamps in docs/incidents/<date>-<slug>.md:
1 contain (disable the route or feature flag, revoke tokens, stop the queue) with my approval for each production action, 2 assess (data, accounts, window; RLS bounds the blast radius), 3 fix on a branch with a failing test first,
4 rotate every secret the incident could reach (I perform it, you provide the list and order), 5 draft notifications for travellers and regulators for my review, 6 post-mortem with action items that become tests.
Never run a production command yourself; give me the exact command and why, then read my output.
```

### `P-SPECIFY` a new feature (Spec Kit)

```text
FEATURE: <one paragraph from the owner>. Follow the repository workflow: /speckit-specify, then /speckit-clarify (at most five questions, with recommended defaults), /speckit-plan, /speckit-tasks, /speckit-analyze. Create the branch with the Spec Kit script and a new specs/<NNN>-<name>/ folder.
The spec describes user-visible behaviour only; technology choices go in plan.md and research.md as numbered decisions citing sources; every new table or endpoint states its visibility posture; include test tasks before implementation tasks; add the feature to docs/roadmap/PROGRESS.md.
Stop after /speckit-analyze and wait for my approval before /speckit-implement.
```

### `P-RESUME` continue an interrupted session

```text
RESUME. Another session worked on <step/branch> and stopped. Do not trust its summary: run `git status`, `git log --oneline origin/main..HEAD`, `git diff` and the gates to establish the real state; list what is done, what is half-done (uncommitted or failing) and what is missing against the step's definition of done in docs/roadmap/STEP-BY-STEP.md.
Finish or revert half-done work so the tree is coherent (never delete work you did not understand without asking), then continue test-first. Report with the FINAL REPORT format, including what you found different from the previous summary.
```

### `P-HANDOFF` end-of-session note (append to any session)

```text
Before you stop, update docs/roadmap/PROGRESS.md (tick what is done with the PR link; leave in-progress items with one line on the state), add any owner decision to docs/roadmap/DECISIONS.md with today's date, and make sure the working tree is clean (everything committed on the branch, nothing stray).
```
