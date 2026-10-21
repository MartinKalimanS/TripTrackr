# Testing and quality

What "tested" means for a production release of TripTrackr, which tool proves what, and when each proof runs.
The rules come from the constitution (III: test-first, 80%, adversarial privacy tests, offline acceptance as an
automated test) and `AGENTS.md`; this document turns them into a matrix an agent can execute.

## 1. The pyramid

| Level                     | Tool and command                                                                                         | Proves                                                                                                                                                                                                                       | Runs                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Static                    | `npm run lint && npm run typecheck`, `npm run format:check`                                              | Types, zero ESLint warnings, formatting                                                                                                                                                                                      | Every PR (CI)                                       |
| Contracts                 | `npm run test -w packages/contracts` (Jest 30, ts-jest)                                                  | Wire shapes (zod) and money helpers                                                                                                                                                                                          | Every PR                                            |
| Mobile unit and component | `npm run test:cov -w apps/mobile` (Jest 29, `jest-expo`, Testing Library); 80% floor in `jest.config.js` | Logic, components, router screens, theme contrast gate, testID parity, no-neumorphism                                                                                                                                        | Every PR                                            |
| API unit                  | `npm run test:unit -w apps/api` (no Docker)                                                              | Pure logic                                                                                                                                                                                                                   | Local and CI                                        |
| API contract              | `npx jest --selectProjects contract` (Docker)                                                            | HTTP contract of each endpoint, including the allowance branch and entitlement neutrality                                                                                                                                    | CI                                                  |
| API integration           | `npx jest --selectProjects integration --maxWorkers=4` (Testcontainers PostGIS and RustFS)               | Real database behaviour: RLS, sync, deletion residue, FX, planner quota and cache                                                                                                                                            | CI                                                  |
| **Privacy (adversarial)** | `npm run test:privacy -w apps/api`                                                                       | An attacker account cannot reach another account's rows by any route; `pg_catalog` asserts RLS enabled and forced, no public-read policy on expenses and documents, API role not superuser, API connects as `triptrackr_api` | **Every PR, required**                              |
| Infrastructure            | CI jobs `docker-build`, `compose-validate`, `backup-rehearsal`                                           | Image builds and runs as `node`; roles and ports wired right; migrate, back up, restore, assert                                                                                                                              | Every PR                                            |
| UI flows on devices       | Maestro `apps/mobile/e2e/*.yaml` (`npm run e2e -w apps/mobile`)                                          | Journeys 00 to 05, appearance, gallery screenshots                                                                                                                                                                           | Before each milestone and release                   |
| **Offline acceptance**    | Maestro `apps/mobile/e2e/offline/*` dispatched across two real devices (`gate-tools.mjs`, `README.md`)   | All fifteen offline scenarios: create, edit, delete across connectivity loss, restart, two-device conflict, interrupted push, large snapshot resume, sign-out with unsynced rows                                             | **Before social; again on every release candidate** |
| Load                      | k6 in `apps/api/test/load/` (`/planner/generate`, `/feed`)                                               | SC-003 targets, rate limits holding                                                                                                                                                                                          | Before 1.1 and 1.2                                  |
| Performance on device     | Manual traces: cold start, globe with 50+ arcs, sheet drag, 200-trip list                                | SC-001, SC-002, SC-006 budgets (`perf-notes.md`)                                                                                                                                                                             | Before each release                                 |
| Accessibility             | VoiceOver, TalkBack, Accessibility Inspector, Android Accessibility Scanner; largest text; four themes   | WCAG AA, 44 dp, labels, order, reduce motion                                                                                                                                                                                 | Before each release                                 |
| Security                  | CodeQL, gitleaks, `npm audit`, Trivy, the security review prompt, a pre-launch penetration checklist     | Section 5 below                                                                                                                                                                                                              | Every PR and weekly                                 |

Rules for writing tests: the test is written first and seen failing for the right reason; a test never weakens an
assertion to pass (change the code, or change the value only when a specification says so and say why in the commit); tests
of Hermes-specific behaviour avoid Node-only APIs the app's engine lacks (`Intl.PluralRules` crashed Home on a phone while Jest
on Node passed: a unit test can simulate the missing API by deleting it); Jest `jest.mock` factories reference only
`mock`-prefixed names; the API database projects run **one invocation at a time**; a fixed time zone test uses the repository's zone
environment; never test only "the owner can see their data" for privacy: test the wrong person.

## 2. Coverage and gates

| Gate                              | Threshold                                                                        | Where enforced                                                           |
| --------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Statements, branches, lines       | 80% per workspace                                                                | `jest.config.js` of `apps/mobile` and `apps/api`, CI jobs                |
| Theme contrast                    | Every pair class P1 to P23, four themes, never lowered                           | `test/theme/contrast-gate.test.ts`                                       |
| TestID and accessible-name parity | 205 IDs and 64 labels preserved (the only deliberate change: "Profile" to "You") | `test/testid-parity.test.ts`, `node scripts/testid-baseline.mjs --check` |
| Single wire-format definition     | No sync record shape outside `packages/contracts`                                | `ci.yml` grep job                                                        |
| Privacy                           | Suite green on the release commit                                                | `privacy` job (required)                                                 |
| Migrations                        | Apply to an ephemeral PostGIS; restore rehearsal                                 | `backup-rehearsal` job                                                   |
| One required check                | `CI passed` (and `Security passed`)                                              | Branch protection                                                        |

## 3. Device matrix (minimum for a release)

| Platform | Devices                                                                                                                                            | Notes                                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| iOS      | One current iPhone on iOS 26 (glass pill); one older iPhone on the oldest supported OS (15.1 to 17) with a smaller screen                          | Light, dark, Increase Contrast, Reduce Transparency, Reduce Motion, largest Dynamic Type, VoiceOver          |
| Android  | One mid-range phone (gesture navigation) on Android 14 or newer; one older phone with three-button navigation (Android 8 to 10) and a small screen | Light, dark, high-contrast text, font scale 200%, TalkBack, 16 KB page-size check on an Android 15+ emulator |

The offline gate always uses **two** real devices (one per platform is ideal; two of one platform is acceptable) built against the API **over the network**,
never through `adb reverse`.

## 4. Acceptance procedure per feature

1. Specification names the behaviour (`specs/<feature>/spec.md`) and a task exists.
2. Failing tests written; code written; tests green; refactor.
3. Gate commands (below) all green on the final tree.
4. Self-review of the diff; then the review prompt in a fresh session; fix CRITICAL and HIGH.
5. Security review prompt if the change touches a sensitive area.
6. Device check where the task says `[DEVICE]`; the result is recorded in the task or the as-built note.
7. Docs: as-built note, `.env.example` and `env.schema.ts` for new variables, `docs/release/store-readiness.md` rows if a store item changes.
8. PR with the template filled (including the privacy posture); squash-merge when `CI passed` and `Security passed`.

The gate commands:

```bash
npm run lint && npm run typecheck
npm run test:cov -w apps/mobile
npm run test -w packages/contracts
npm run test:unit -w apps/api                    # plus integration, contract, privacy when API or schema changed (Docker)
npm run theme:check -w apps/mobile
(cd apps/mobile && node scripts/testid-baseline.mjs --check test/fixtures/testid-baseline.json)
npx prettier --check .                           # route files need character classes, see AGENTS.md
```

## 5. Security testing checklist (before 1.0, again before 1.2)

- Authentication: brute force returns 429 from the account limiter and from Traefik; refresh rotation and reuse detection; token expiry; Google and Apple `aud`
  and signature verification with forged tokens; no account enumeration through messages or timing.
- Authorisation: the adversarial privacy suite for every route, including blocked accounts, tombstoned trips, lapsed entitlements, and (1.2) public versus private trips,
  notes and photos; write attempts to another account's rows; ID guessing; mass assignment.
- Input: oversized and malformed bodies, upload type and size, path and key manipulation, SQL injection attempts on every parameter, unicode edge cases in names.
- Storage: buckets private; signed URL TTL 300 s; a URL for another account's key is refused; sealed documents unreadable without the master key.
- Transport and edge: TLS grade, HSTS, only 80 and 443 published, security headers present, CORS minimal.
- Secrets: gitleaks clean on full history; no secret in an image layer; no secret in logs or Sentry events (test with a fake token in a request body).
- Mobile: database file unreadable without the key; screenshots of documents blocked; release build has no debug flags; traffic capture shows only expected hosts
  (Mapbox style, tile, sprite, glyph requests and its session turnstile; the API; Sentry; RevenueCat) and no tracker.
- Payments: no card field in the codebase; entitlement cannot be forged from the client; replayed purchase grants once; unsigned webhook rejected.
- Supply chain: Dependabot clean or triaged; `npm audit` no high; Trivy no critical; digest-pinned base images.

## 6. Defect handling

A bug found by anyone becomes a failing test first, then the fix, then the PR (`fix(scope): ...`) naming the test. A regression found after release also gets an entry in
the next release notes and, when it escaped a gate, a new gate. Flaky tests are fixed or quarantined with an issue the same day; a gate is never skipped to merge.
