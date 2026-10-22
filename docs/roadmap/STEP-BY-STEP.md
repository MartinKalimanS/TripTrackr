# Step by step

Forty steps, in dependency order, from today's repository to a launched, operated app. Each step is a unit of
work for **one agent session** (or a few parallel sessions, where it says so): it has a branch, a goal, the
things to do, the evidence that proves it is done, and the prompt that starts the session
([`AGENT-PROMPTS.md`](./AGENT-PROMPTS.md), the prompt id equals the step id: `P-S05` runs `S-05`).

How to use this file: take the first step whose dependencies are done and whose box in
[`PROGRESS.md`](./PROGRESS.md) is empty; open a session with the master prompt (`P-MASTER`) followed by that step's
prompt; finish by ticking the step with a link to the merged PR. Never start a step whose dependency is unticked.
Steps marked **HUMAN** contain actions only the owner can do (accounts, money, legal, physical devices); an agent
prepares everything else and writes the exact instructions.

References: `T0xx` ids are tasks of `specs/001-triptrackr-mvp/tasks.md`; `T5xx` ids are tasks of
`specs/005-sunrise-passport-ui/tasks.md`; `D-nn` are decisions in the 001 `research.md`; `OD-n` are the open decisions of `ROADMAP.md`.

| Group                          | Steps        | Milestone    |
| ------------------------------ | ------------ | ------------ |
| A Governance                   | S-01         | M0           |
| B The look                     | S-02         | M1           |
| C Proof on devices             | S-03, S-04   | M2           |
| D Data rights and completeness | S-05 to S-09 | M3           |
| E Monetisation                 | S-10 to S-13 | M4           |
| F Planner (release 1.1)        | S-14 to S-16 | M11          |
| G Social (release 1.2)         | S-17 to S-20 | M12          |
| H Hardening and observability  | S-21 to S-24 | M5           |
| I Production backend           | S-25 to S-27 | M6           |
| J Mobile CI/CD                 | S-28 to S-31 | M7           |
| K Store readiness              | S-32 to S-34 | M8           |
| L Beta, launch, operate        | S-35 to S-40 | M9, M10, M13 |

Execution order for release 1.0: S-01, then in parallel {S-02, S-03/S-04, S-05 to S-09, S-25 to S-27, S-28 to S-31}, then S-10 to S-13 (needs S-05..S-09),
S-21 to S-24, S-32 to S-34, S-35 to S-39. Release 1.1: S-14 to S-16. Release 1.2: S-17 to S-20 (never before S-04).

---

## Group A: Governance

### S-01 Repository governance and security baseline

- **Depends on**: nothing. **Branch**: `ci/repo-governance`. **Prompt**: `P-S01`.
- **Goal**: `main` cannot receive unreviewed or red code; secrets and vulnerabilities are caught automatically.
- **Do**: (1) add `.github/CODEOWNERS` (migrations, `infra/`, workflows, `docs/legal/`); (2) add `.github/workflows/security.yml` (CodeQL, gitleaks, `npm audit`, Trivy, job
  `Security passed`) and `pr-title.yml` (conventional PR titles) from `CICD-AND-RELEASE.md` 2.1; make Trivy and the audit non-flaky (`ignore-unfixed`, a documented
  allowlist file with expiry dates); (3) keep `docs/roadmap/PROGRESS.md` and `docs/roadmap/DECISIONS.md` (they exist) current from now on; (4) write
  `docs/CONTRIBUTING.md` (one page: branches, commits, gates, review, worktrees, secrets) linking `AGENTS.md`; (5) write the settings table of `CICD-AND-RELEASE.md` 1.1 as
  an issue checklist for the owner.
- **HUMAN**: apply the repository settings (ruleset on `main`, squash only, secret scanning and push protection, Dependabot security updates, code scanning, environments `staging`,
  `production-api`, `production-mobile` with required reviewers, protect `v*` tags). After this, **nobody pushes `main` directly** (it was pushed directly on 2026-10-20).
- **Evidence**: a PR with a failing gitleaks fixture is blocked; the ruleset screenshot or `gh api repos/.../rulesets` output pasted in the PR; `Security passed` appears on PRs.

## Group B: The look

### S-02 Sunrise Passport UI, features F3 to F14 (parallel with everything)

- **Depends on**: nothing. **Branches**: `feat/fN-<name>` with objective branches, exactly as `specs/005-sunrise-passport-ui/reference/IMPLEMENTATION-PLAN.md` ("Delivery: one feature at a time").
  **Prompt**: `P-S02` (parameterised by feature F3 to F14).
- **Goal**: every screen matches `specs/005-sunrise-passport-ui/reference/screens/` in four themes, at the largest text size, on both platforms; Atlas retired.
- **Do**: F3 Tab bar (built, awaiting approval), F4 Trips cards and list, F5 Trip screen, F6 Forms, F7 Photos, F8 Spending, F9 Notes, F10 Documents, F11 Offline maps, F12 Welcome and auth,
  F13 You, F14 sweeps (`specs/005` T559 to T565: states, accessibility, text scale, themes, baselines, retire Atlas, docs). Each feature: fidelity audit against the pictures and prototype CSS,
  test-first fixes, gates, an as-built note under `reference/as-built/`, then **stop and wait for the owner's approval** before the next feature. Pictured controls without a capability are
  "coming soon" controls (`components/ui/coming-soon-button.tsx`; `spec.md` FR-080 as amended by Q-11): never invent data.
- **Evidence**: each feature approved in `PROGRESS.md` with the date; `test/testid-parity.test.ts` green with only the "Profile" to "You" change; `ATLAS_RETIREMENT=1` test green at F14.

## Group C: Proof on devices

### S-03 Device proof of the core

- **Depends on**: nothing. **Branch**: `test/device-proof`. **Prompt**: `P-S03`.
- **Goal**: what was written but never run is run, measured and recorded.
- **Do**: build the dev client against the API over the network; run Maestro flows 00 to 05, appearance and gallery (T088, T101, T106, T120); take the perf measurements (T100: 60 fps with 50+ arcs; T194: cold
  start under 3 s) into `specs/001-triptrackr-mvp/perf-notes.md`; record the device spikes of `specs/005` (T507 to T512) in its `research.md`; fix every defect test-first; update the Maestro flows only for legitimately
  changed visible text and record each edit in `specs/005/tasks.md` "Maestro flow edits" (the known one: `01-account-and-trip` asserts "Planning" for a trip that is Active).
- **HUMAN**: connect the physical devices, run `run-on-phone.cmd`, report anything that does not match.
- **Evidence**: green run logs attached; perf notes with device models; spikes recorded; tasks ticked (T088, T100, T101, T106, T120, T194, T507 to T512).

### S-04 The offline acceptance gate (HARD GATE)

- **Depends on**: S-03. **Branch**: `test/offline-gate`. **Prompt**: `P-S04`.
- **Goal**: prove synchronisation on real devices before anything social (constitution II).
- **Do**: finish and run `apps/mobile/e2e/06-offline-acceptance.yaml` rows 1 to 12 (T140) and 13 to 15 (T203) through the phased dispatch in `apps/mobile/e2e/offline/README.md` and
  `gate-tools.mjs` on **two real devices**, API over the network (never `adb reverse`); every failure becomes a failing test in the sync engine first, then a fix; repeat until all fifteen pass in one clean run; record the
  evidence in `apps/mobile/e2e/offline/gate-evidence.md` and tick T141.
- **HUMAN**: operate the two devices, toggle airplane mode as the flows instruct, and confirm the final run.
- **Evidence**: `gate-evidence.md` with device models, build ids, date, the ordered run log, all fifteen rows passing; T140, T203, T141 ticked. Nothing in groups F and G may start without this.

## Group D: Data rights and platform completeness

### S-05 Account deletion with a complete sweep (T188, T189; PR-01)

- **Depends on**: S-01. **Branch**: `feat/account-deletion`. **Prompt**: `P-S05`.
- **Goal**: deleting an account removes every row and every object, and the traveller can find the path.
- **Do**: spec check (data-model "Account deletion", FR-006, SC-015); failing integration test `deletion-residue.spec.ts` (no row and no object key survives, including thumbnails and sealed documents, tombstones, upload
  queue rows, refresh tokens, subscriptions record handling per billing rules); implement `DELETE /me` (transaction that cascades rows and enqueues the object-storage sweep; completion is reported only after the sweep confirms);
  worker job with retries and a dead-letter alert; Resend deletion notice; mobile flow Profile, Account, Delete account with a confirmation that states what is lost and the sign-out guard for unsynced data;
  update `docs/legal/account-deletion.md`; Maestro flow; privacy posture stated in the PR; **security review** (auth re-check before deletion, idempotency, no partial state).
- **Evidence**: residue test green; Maestro run; the public deletion page text matches the behaviour.

### S-06 Data export (T190; PR-02)

- **Depends on**: S-01. **Branch**: `feat/data-export`. **Prompt**: `P-S06`.
- **Goal**: a traveller can download everything they recorded, in a portable form.
- **Do**: failing tests (archive contains trips, stops, notes, expenses with currencies and rates, photo and document metadata and files, nothing from another account, expires); `POST /me/export` async job (BullMQ) that
  streams a zip (JSON plus CSV for expenses plus original files) to a private bucket and returns a **signed URL** (TTL stated) by email and in the app; rate limit one export per day; documents are unsealed only inside the job
  for the owner; mobile entry under You; privacy and security review (the export is the largest exfiltration path: authenticate recently, audit-log the request, never log contents).
- **Evidence**: integration and privacy tests; a manual export of the demo account opened and verified.

### S-07 About, legal links, attributions, retention statement (T193; PR-03, PR-06, PR-10)

- **Depends on**: S-02 (F13 You) for the final look; can start with logic earlier. **Branch**: `feat/about-and-legal`. **Prompt**: `P-S07`.
- **Goal**: every store-required in-app disclosure exists and is accurate.
- **Do**: About screen under You: app version and build (`expo-constants`), Privacy Policy, Terms, Account deletion page, Support (mail and URL), attributions (GeoNames CC BY 4.0, Mapbox and OpenStreetMap, open-source licences via a generated list),
  the 90-day tombstone retention statement in plain words (T193); links open in `expo-web-browser`; URLs come from one config module so S-32 changes them in one place; tests including a link-set snapshot.
- **Evidence**: tests green; screenshots in light and dark; URLs filled after S-32.

### S-08 Reference geography in production (PR for `store-readiness` row)

- **Depends on**: S-25. **Branch**: `chore/geo-import-runbook`. **Prompt**: `P-S08`.
- **Goal**: `/countries` and cities are populated in production reproducibly.
- **Do**: document and script the GeoNames import (`npm run geo:import -w apps/api`, with the extract file names and checksums), make it idempotent, add a CI test with a tiny fixture; add a production runbook section in `infra/README.md`; verify `/countries` non-empty after the run; attribution wired by S-07.
- **Evidence**: runbook; fixture test; production check output (after S-26).

### S-09 Authentication audit and hardening (PR-05)

- **Depends on**: S-01. **Branch**: `fix/auth-hardening`. **Prompt**: `P-S09`.
- **Goal**: close the gaps between the security specification and the code.
- **Do**: audit `apps/api/src/modules/auth` against `SPECIFICATION.md` section 7 item 2 and `contracts/rest-api.md` section 1: email verification, password reset, refresh rotation and reuse detection, lockout, uniform errors,
  Argon2 parameters, per-account and per-IP rate limits, Google and Apple token verification (`aud`, issuer, signature, nonce), Apple relay emails, deletion of oauth identities; write the missing tests first (forged tokens, replayed refresh, enumeration);
  fix; branded Google and Apple buttons (`provider-button.tsx` per provider guidelines; Apple artwork black or white); Sign in with Apple parity; security review.
- **Evidence**: a findings table in the PR (each row: exists, tested, fixed), all green, review prompt output attached.

## Group E: Monetisation (story 9, release 1.0)

### S-10 Allowance and entitlement backend (T172 to T180)

- **Depends on**: S-05 to S-09. **Branch**: `feat/billing-allowance`. **Prompt**: `P-S10`.
- **Goal**: the free allowance is enforced only at creation, only on the server, and never touches existing data (constitution V).
- **Do**: write the contract and integration tests first (T172 to T177: 409 body at the allowance with trips held, allowance, both routes forward and the echoed submission; no allowance field below it; every non-create endpoint identical under active and lapsed
  entitlement; purchase idempotency; privacy neutrality; delete-and-recreate accounting); implement `allowance.service.ts` as a live `count(*)` inside the `POST /trips` transaction (the only code that blocks creation), `FREE_TRIP_ALLOWANCE` in `env.schema.ts` (default 5),
  `GET /me/entitlement`, the `subscriptions` table migration (new numbered SQL with RLS policies, forced), offline grace path (D-08: a trip created offline over the allowance is kept and the traveller is asked to resolve on reconnect).
- **Evidence**: all contract, integration and privacy tests green; migration applied in the backup rehearsal; posture stated in the PR.

### S-11 RevenueCat server integration (T181, T182)

- **Depends on**: S-10. **Branch**: `feat/billing-revenuecat`. **Prompt**: `P-S11`.
- **Do**: `POST /billing/purchase-completed` verifies with RevenueCat before granting and is idempotent by transaction id; `POST /billing/webhook` signature-verified (`REVENUECAT_WEBHOOK_SECRET`), the authoritative entitlement update, rejects unsigned calls;
  event types handled: initial purchase, renewal, cancellation, expiration, billing issue, product change, refund; unknown events logged and acknowledged; replay-safe; reconciliation job that re-reads entitlements for accounts with pending states;
  secrets validated at startup; tests with recorded webhook fixtures; security review (signature check before parsing, constant-time compare, no PII in logs).
- **Evidence**: tests including replay and tamper cases; a sandbox event delivered to staging or a local tunnel.

### S-12 Paywall, entitlement and subscription management in the app (T183 to T187; PR-04)

- **Depends on**: S-10, S-11 and the F6/F13 UI. **Branch**: `feat/billing-mobile`. **Prompt**: `P-S12`.
- **Do**: `react-native-purchases` configuration with the per-platform public keys; `use-entitlement.ts` (silent below the allowance, FR-084); the 409 branch UI showing both routes forward (subscribe, or delete a trip to make room) and creating the pending trip on success without re-entry;
  paywall (`modal/paywall.tsx`) with title, period, price per period, auto-renew and how to cancel, links to Privacy and Terms, **Restore Purchases**; `manage-subscription.tsx` with the plain date the change takes effect and a deep link to the store's subscription page;
  keyboard and a11y tests; Maestro `09-allowance.yaml` (both branches separately and the lapsed read-and-edit check); no allowance or payment mention below the free allowance.
- **Evidence**: tests green; Maestro run; screenshots; the review checklist for Apple 3.1.2 ticked.

### S-13 In-app purchase products in the stores and RevenueCat (HUMAN-heavy)

- **Depends on**: S-12, S-31. **Branch**: `docs/iap-setup` (runbook and config). **Prompt**: `P-S13`.
- **HUMAN**: App Store Connect: Paid Apps Agreement, tax, banking, subscription group, products (monthly, yearly) with prices, localisations and review screenshots; Play Console: subscription products and base plans; RevenueCat: project, iOS and Android apps, entitlement (`unlimited_trips`),
  products, offering, webhook to `POST /billing/webhook`, API keys into the right secret stores; sandbox testers and licence testers.
- **Agent**: write `docs/release/iap-setup.md` with product ids, names and the exact fields; add a sandbox test script and the purchase, renewal, cancellation, lapse and restore test plan; run it and record results.
- **Evidence**: every flow passes in both sandboxes; `docs/release/iap-setup.md` committed (no secrets).

## Group F: Planner (release 1.1)

### S-14 Planner backend (T159 to T168)

- **Depends on**: S-10 (quota infrastructure) and release 1.0 shipped (M10). **Branch**: `feat/planner-api`. **Prompt**: `P-S14`.
- **Do**: tests first (T159 to T162: zero unresolved items in a completed job, quota, cache, route recompute); async job (`POST /trips/:tripId/planner/generate`, `GET /planner/jobs/:jobId`); the Anthropic call returning **place names only** (D-09); Mapbox geocoding that
  **drops and logs** low-confidence places (constitution IV); walking routes and backtrack-avoiding order via Mapbox Directions; itinerary items CRUD with per-day route recompute; durable per-day quota on `planner_requests` and the Redis cache; prompts and model name in config;
  retry and timeout policy; the job never blocks a request; **security review** (prompt injection from user text, SSRF, key handling, cost ceiling).
- **Evidence**: contract test 10 and the other tests green; cost per request measured and recorded.

### S-15 Planner screens (T169 to T171)

- **Depends on**: S-14. **Branch**: `feat/planner-mobile`. **Prompt**: `P-S15`.
- **Do**: itinerary screen with visible progress, drag between days with route redraw scoped to affected days, verification states, errors and the quota message; Maestro `08-planner.yaml`; look from the Sunrise Passport spec (no picture exists: follow the components).
- **Evidence**: tests, Maestro, the SC-004 timing (a two-day city plan under 60 s).

### S-16 Planner cost controls and operations

- **Depends on**: S-14. **Branch**: `chore/planner-ops`. **Prompt**: `P-S16`.
- **Do**: provider spend limits and alerts (Anthropic and Mapbox), a feature flag to disable the planner without a release, k6 for `/planner/generate` (T192), documentation of the failure modes.
- **Evidence**: load test results; the flag tested; limits configured (HUMAN: provider consoles).

## Group G: Social (release 1.2; never before S-04)

### S-17 Photo screening provider and the privacy policy update

- **Depends on**: S-04 and OD-3. **Branch**: `feat/photo-screening`. **Prompt**: `P-S17`.
- **Do**: decide the provider (OD-3) with a processor agreement; update `docs/legal/privacy-policy.md` and the store forms **first**; implement the `PhotoScreening` port adapter; the worker sets `moderation_state` (`approved`, `rejected`, `pending`); fail closed; tests that a photo is unreachable publicly until approved (the RLS policy requires `approved`).
- **Evidence**: tests, updated policy, provider terms on file.

### S-18 Social backend (T142 to T153)

- **Depends on**: S-04, S-17. **Branch**: `feat/social-api`. **Prompt**: `P-S18`.
- **Do**: adversarial privacy tests first (T142 to T144: another account cannot read private notes, public notes inside a private trip, a trip made public then private, tombstoned trips; blocked accounts reach nothing; no writes to another's rows), integration tests (T145, T146);
  follows with the public or private acceptance branch, blocks (interaction with RLS predicates), reports, cursor-paginated feed, discovery by city and country, the curated public trip projection (route, cover, cities, explicitly public notes and approved public photos only), `GET /users/:id` returning not found for private non-followed and blocked requesters;
  per-endpoint rate limits; state the visibility posture of every new table and endpoint; **security review**.
- **Evidence**: privacy rows 8 to 11 green (and the entitlement neutrality row).

### S-19 Social screens (T154 to T158)

- **Depends on**: S-18 and F-series UI. **Branch**: `feat/social-mobile`. **Prompt**: `P-S19`.
- **Do**: feed and discover tabs (the tab bar gains tabs only if the owner approves the new picture set; otherwise reachable from You and Home), traveller profile with follow, block and report; independent per-object visibility toggles for trip, note and photo (no global switch anywhere, FR-052, FR-053); Maestro `07-social.yaml`.
- **Evidence**: tests, Maestro, owner approval of the new screens (new pictures needed: the UI spec has none for social).

### S-20 UGC compliance (PR-09)

- **Depends on**: S-18, S-19. **Branch**: `feat/ugc-compliance`. **Prompt**: `P-S20`.
- **Do**: report flow end to end (the report reaches a queue and an admin view or email), moderation procedure document (who reviews, in what time, what actions), removal and suspension, published contact, updated Terms (acceptable use, sanctions), store forms (Apple 1.2, Play UGC policy), age rating re-answer, review notes explaining the controls.
- **Evidence**: a test report handled end to end; documents updated; store forms recorded.

## Group H: Hardening and observability

### S-21 Performance and load (T192, T100, T194)

- **Depends on**: S-03. **Branch**: `perf/budgets`. **Prompt**: `P-S21`.
- **Do**: write down budgets (`TESTING-AND-QUALITY.md` section 1 and `SPECIFICATION.md` section 3); k6 scripts in `apps/api/test/load/`; profile cold start, globe, sheet and the 200-trip list on the lowest device; measure bundle size and fonts against the `pre-005-baseline`; fix the worst offenders test-first (or with a recorded measurement); record before and after.
- **Evidence**: perf notes with numbers and devices; budgets met or an owner-accepted exception.

### S-22 Security hardening (T196)

- **Depends on**: S-01. **Branch**: `fix/security-hardening`. **Prompt**: `P-S22`.
- **Do**: Traefik rate-limit middleware and headers reviewed; secret rotation procedure written and rehearsed; grep-test that no raw card field exists; Trivy and audit gates green; walk the checklist in `TESTING-AND-QUALITY.md` section 5 and fix findings; pre-launch penetration pass (self-run or a paid test); confirm the privacy suite covers every route that exists; dependency freshness.
- **Evidence**: a dated security report in `docs/security/` (findings, fixes, residual risks accepted by the owner).

### S-23 Accessibility pass (UI Phase 9 T559 to T563; localisation decision OD-8)

- **Depends on**: S-02. **Branch**: `feat/a11y-sweeps`. **Prompt**: `P-S23`.
- **Do**: the sweeps of the UI plan (state, accessibility, text scale, themes, baselines); VoiceOver and TalkBack walks of Home, Trips, a trip, You and the forms; largest text on both platforms; reduce motion and transparency; centralise copy for a future translation.
- **HUMAN**: run the walks on devices and report.
- **Evidence**: recorded walk notes; tests; ticks in `specs/005/tasks.md`.

### S-24 Observability (PR-12)

- **Depends on**: S-25 for production endpoints (staging earlier). **Branch**: `feat/observability`. **Prompt**: `P-S24`.
- **Do**: Sentry projects (mobile, server) with release tags equal to the git SHA, source maps uploaded by the Expo plugin, the R8 mapping and native symbols, `sendDefaultPii: false`, no Session Replay or Feedback, request bodies scrubbed (test with a fake token in a body); structured logs with redaction tests; `/health` with a detail
  mode (database, redis, storage, queue depth, `min_app_version`); uptime monitor and alerts (OD-2); backup-age ping; alert routing to the on-call email.
- **HUMAN**: create the Sentry organisation and the monitor accounts; paste DSNs into the secret stores.
- **Evidence**: a deliberate test error visible with a readable stack on both apps and the API; an alert fired and received.

## Group I: Production backend

### S-25 Production host, domain and TLS (HUMAN-heavy)

- **Depends on**: S-01. **Branch**: `docs/production-runbook`. **Prompt**: `P-S25`.
- **HUMAN**: choose the provider (OD-1) and create the VPS (4 GB or more, Ubuntu LTS); register the domain and DNS (`api.` A record, apex for the static legal site); create the `deploy` user, SSH key auth only, firewall allowing 22 (restricted), 80 and 443; unattended security updates; fail2ban; Docker Engine and the Compose plugin.
- **Agent**: write `infra/PRODUCTION-RUNBOOK.md` (every command, in order, with expected output) and a bootstrap script `infra/scripts/bootstrap-host.sh` (idempotent, reviewable); verify the Compose files on a throwaway VM if the owner provides one.
- **Evidence**: `curl -sI https://$API_HOST/health` returns 200 with HSTS; `http://` redirects (308); Let's Encrypt production certificate (not staging); `acme.json` in the persisted volume.

### S-26 Production configuration, storage, email, backups (T191)

- **Depends on**: S-25. **Branch**: `chore/production-config`. **Prompt**: `P-S26`.
- **HUMAN + Agent**: generate unique secrets (`.env` and `infra/secrets/*.txt` per `infra/secrets/README.md`); escrow `DOCUMENT_MASTER_KEY` offline; Cloudflare R2 buckets (private, CORS for presigned operations only, signed URL TTL 300 s, lifecycle for aborted multipart uploads); Resend domain (SPF, DKIM, DMARC) and sender;
  off-box backup bucket at a different provider with write-only credentials and a lifecycle rule; run the geo import (S-08); start the stack; verify the checklist rows of `docs/release/store-readiness.md` section 4 one by one (two connection strings, forced RLS via the `pg_tables` query, migrations ledger, Redis `noeviction` and AOF, rate limits, deletion sweep residue); **restore rehearsal PASSED** within 1 hour (T191, SC-020).
- **Evidence**: each row of section 4 ticked with pasted output (no secrets); the PASS line and date.

### S-27 API deploy pipeline

- **Depends on**: S-26. **Branch**: `ci/api-deploy`. **Prompt**: `P-S27`.
- **Do**: change `infra/docker-compose.prod.yml` to run a registry image (`API_IMAGE`), update the CI Compose assertions, write `infra/scripts/deploy.sh` as specified in `CICD-AND-RELEASE.md` 2.2, add `api-deploy.yml`, test the script against the CI stack (including a forced failure that rolls back), configure the `production-api` environment secrets (HUMAN).
- **Evidence**: a tag deploys; a deliberately broken image rolls back automatically; the deploy log shows backup, migrate, health.

## Group J: Mobile CI/CD

### S-28 EAS setup and first manual builds

- **Depends on**: S-01. **Branch**: `build/eas-profiles`. **Prompt**: `P-S28`.
- **Do**: finalise `eas.json` (`CICD-AND-RELEASE.md` 2.5), EAS environment variables per environment, secrets (`SENTRY_AUTH_TOKEN`, `MAPBOX_DOWNLOADS_TOKEN`), confirm the iOS image is Xcode 26, `expo-build-properties` release flags (minify and shrink on Android), run `eas build -p ios` and `-p android` for `development`, `preview` and `production` locally from a terminal so credentials are generated (HUMAN: the Apple login and the keystore prompts); install the `preview` build on the two devices.
- **Evidence**: three builds per platform on EAS; the `production` `.aab` and `.ipa` inspected (`bundletool`, Xcode Organizer) for permissions, 16 KB page size, target API 36, deployment target 15.1.

### S-29 Mobile PR checks

- **Depends on**: S-28. **Branch**: `ci/mobile-checks`. **Prompt**: `P-S29`.
- **Do**: add `npm run doctor -w apps/mobile`, `expo config --type introspect` (exists), `npx expo export --platform android` and `--platform ios` to PRs touching mobile or contracts, a bundle-size report comment; keep every job in the required set via `ci-passed`.
- **Evidence**: a PR with an intentional config typo fails with a clear message.

### S-30 Release automation: versioning and build and submit

- **Depends on**: S-28, S-27. **Branch**: `ci/release-automation`. **Prompt**: `P-S30`.
- **Do**: `release-please` config and workflow (`CICD-AND-RELEASE.md` 2.4), `mobile-release.yml` (2.3) and `mobile-promote.yml`, the `production-mobile` environment (HUMAN: reviewers, `EXPO_TOKEN`); do a **dry run** with a pre-release tag `v0.9.0-rc.1` through to TestFlight and the Play internal track; document rollback and the hotfix path.
- **Evidence**: the tag produced signed builds that appear in TestFlight and Play internal without a human touching a secret; the GitHub Release and CHANGELOG generated.

### S-31 Store accounts and app records (HUMAN)

- **Depends on**: OD-12. **Branch**: `docs/store-accounts` (notes only). **Prompt**: `P-S31`.
- **HUMAN**: enrol in the Apple Developer Program and Play Console (identity and organisation verification take time: start early); create the app records (`com.triptrackr.app`), App ID capabilities (Sign in with Apple), the App Store Connect API key and the Play service account; register SHA-1 certificates for Google sign-in;
  grant the EAS account access; decide and record whether the first Play upload is manual.
- **Agent**: write the click-by-click checklist `docs/release/store-accounts.md` and verify the credentials by running a draft submit (`eas submit` to internal).
- **Evidence**: a test build submitted to TestFlight and Play internal using the stored credentials.

## Group K: Store readiness

### S-32 Legal documents, support and the static site (PR-10)

- **Depends on**: S-05, S-06 for accuracy. **Branch**: `docs/legal-final`. **Prompt**: `P-S32`.
- **Do**: bring `docs/legal/privacy-policy.md`, `terms-of-service.md` and `account-deletion.md` to match the real product (processors, retention, deletion, export, subscriptions disclosures, contact); build a minimal static site (GitHub Pages or Cloudflare Pages from `docs/site/`) hosting them at stable URLs plus a support page; set the support mailbox; replace every `[[PLACEHOLDER: ...]]`.
- **HUMAN**: counsel review and sign-off; DNS for the site.
- **Evidence**: URLs live; counsel approval recorded; the in-app About links (S-07) point to them.

### S-33 Listing, assets, review notes, demo account

- **Depends on**: S-02 (final UI), S-32. **Branch**: `docs/store-listing`. **Prompt**: `P-S33`.
- **Do**: `docs/release/listing/` as in `CICD-AND-RELEASE.md` 5.3; screenshots captured from the real build (Maestro on the 6.9-inch device class for iOS and phone sizes for Play; light and dark); 1024x1024 icon without alpha, 512x512 Play icon, 1024x500 feature graphic from the brand assets in `apps/mobile/assets`; copy for both stores; `apps/api/scripts/seed-demo.ts` (idempotent demo account with trips, stops, notes, expenses, photos, a document; no real data);
  review notes (where deletion and export are, that expenses and documents are never public, offline behaviour, contact).
- **Evidence**: assets validated against each store's size rules; the demo account works on a release build.

### S-34 Store-readiness compliance run

- **Depends on**: S-28, S-32, S-33 and the features in the release. **Branch**: `docs/store-readiness-evidence`. **Prompt**: `P-S34`.
- **Do**: walk **every** row of `docs/release/store-readiness.md` (Apple, Google, both, backend) and tick it with a link to evidence; write `docs/release/export-compliance.md` (the encryption decision for SQLCipher; owner decision); verify privacy manifest and usage strings in the built binary; capture traffic of a release build through a cold start and a minute on the globe
  with mitmproxy (only Mapbox style, tile, sprite, glyph and turnstile requests, the API, Sentry and RevenueCat appear); check 16 KB page size; Data safety and privacy label answers written in `docs/release/store-forms.md`; no ATT string, no ad id.
- **HUMAN**: sign the decisions that need an authority (export compliance, privacy label wording).
- **Evidence**: the checklist fully ticked; the forms document; traffic capture summary.

## Group L: Beta, launch, operate

### S-35 Internal testing

- **Depends on**: S-30, S-34. **Branch**: `fix/beta-1-*` (as needed). **Prompt**: `P-S35`.
- **Do**: ship `v0.9.x` builds to TestFlight internal and Play internal; walk the smoke flow, deletion, export, purchase sandbox, offline rows on the production builds; triage defects (test first); repeat until a build is clean.
- **Evidence**: a clean build id on each platform and the walk notes.

### S-36 Closed beta

- **Depends on**: S-35. **Branch**: `fix/beta-2-*`. **Prompt**: `P-S36`.
- **Do**: TestFlight external group (Beta App Review) and the Play **closed test with at least 12 testers opted in continuously for 14 days**; feedback form; fix defects; watch Sentry and Vitals; the beta crash-free target (99.5% of users).
- **HUMAN**: recruit and manage testers; apply for Play production access after the 14 days.
- **Evidence**: tester count and dates, crash-free numbers, the production access grant.

### S-37 Release candidate

- **Depends on**: S-36. **Branch**: `release/1.0.0`. **Prompt**: `P-S37`.
- **Do**: freeze; full regression: the full check of `quickstart.md` section 11, the offline gate on the release build, the privacy suite on the exact commit, a restore rehearsal, security scan results, accessibility walks, store-readiness re-verified against the policy pages **today**; release PR via release-please; sign-off table prepared.
- **HUMAN**: the sign-offs (engineering, privacy and security, legal, product).
- **Evidence**: the signed table in `docs/release/store-readiness.md` and a tag.

### S-38 Submission and review

- **Depends on**: S-37. **Prompt**: `P-S38`.
- **Do**: the procedure of `CICD-AND-RELEASE.md` section 4 steps 4 to 7: API deploy, store builds, **submit for review** with notes and the demo account, answer reviewer messages (rejection playbook in 5.1 and 5.2), keep a log in `docs/release/review-log.md`.
- **HUMAN**: press submit in App Store Connect and Play Console.
- **Evidence**: approved on both stores.

### S-39 Staged rollout, monitoring and hotfix drill

- **Depends on**: S-38. **Branch**: `feat/min-app-version` and hotfix branches as needed. **Prompt**: `P-S39`.
- **Do**: iOS phased release; Android staged rollout 10%, 25%, 50%, 100% with a hold at each step for the crash-free and ANR thresholds; a 48-hour watch; rehearse a hotfix and the rollback of the API; add the `min_app_version` check and its blocking screen if not present; publish the GitHub Release.
- **Evidence**: 100% rollout; a hotfix drill report; monitoring screenshots.

### S-40 Operate

- **Depends on**: S-38. **Branch**: `chore/operations-calendar`. **Prompt**: `P-S40`.
- **Do**: schedule the calendar of `CICD-AND-RELEASE.md` 6.2 as recurring issues or a `nightly.yml`; the first monthly restore drill from the real off-box backup; the first quarterly secret rotation rehearsal; the first Expo SDK upgrade branch plan; the analytics decision (OD-7); a post-launch review of SC-018 to SC-025 using store and server counters; the backlog of 1.1 and 1.2.
- **Evidence**: the calendar items exist and the first drills are recorded in `docs/operations/`.
