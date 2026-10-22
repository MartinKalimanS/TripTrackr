# Roadmap: from today's repository to TripTrackr in both stores

The ordered plan to take TripTrackr from its current state to a production app on the App Store and Google
Play, with the backend running in production and everything automated. It does **not** replace the feature
specs (`specs/001-triptrackr-mvp` is the product, `specs/005-sunrise-passport-ui` is the look); it says
**what is left, in what order, with what exit criteria**. The detailed procedure for each step is in
[`STEP-BY-STEP.md`](./STEP-BY-STEP.md); the prompt for each session is in
[`AGENT-PROMPTS.md`](./AGENT-PROMPTS.md).

No durations are given on purpose: the order, the dependencies and the exit criteria are what matter.

## 1. Where the product stands (2026-10-21)

| Area                               | State                                                                                                                                                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo, contracts, CI            | Done. `apps/mobile`, `apps/api`, `packages/contracts`, ONE lockfile. `ci.yml` has 9 jobs behind one required check, `CI passed` (lint and typecheck, format, contracts tests, mobile tests 80%, API tests 80%, privacy suite, Docker build, Compose validate, backup rehearsal). No release workflow exists.  |
| Backend (feature 001)              | Auth (email, Google, Apple), profile, trips and stops, notes, expenses and FX, photos (media worker), documents (sealed), lookups, sync (push and pull with tombstones), health. Migrations `0001` to `0013`. RLS enabled and forced. Missing: account deletion sweep, data export, planner, social, billing. |
| Mobile (feature 001)               | Encrypted local store, sync engine, auth, trips and stops, notes, expenses, photos, documents (scan, sealed), offline maps, globe with 3D zoom, offline Maestro suite (written, **never run on two devices**).                                                                                                |
| `specs/001` tasks                  | **163 done, 65 open** of 228. Open: T088, T100, T101, T106, T120 (device runs); T140, T203, **T141 (hard gate)**; T142 to T158 (social); T159 to T171 (planner); T172 to T187 (billing); T188 to T198 (deletion, export, load, hardening, docs, final check).                                                 |
| UI (feature 005, Sunrise Passport) | F1 Map and F2 Home sheet approved and in `main`; F3 Tab bar built, awaiting approval (`feat/f3-tabbar`); F4 to F14 not started. The visual reference is `specs/005-sunrise-passport-ui/reference/`.                                                                                                           |
| Release automation                 | **None.** `eas.json` has minimal `development`, `preview`, `production` profiles; the EAS project is linked (`owner: martinkaliman`); no EAS secrets in GitHub; no submit workflow; no API deploy workflow.                                                                                                   |
| Store readiness                    | `docs/release/store-readiness.md` exists with every row open and `[[PLACEHOLDER: owner]]` owners. Legal texts in `docs/legal/` are drafts. No Apple Developer or Play Console setup is recorded.                                                                                                              |
| Production infrastructure          | `infra/docker-compose.prod.yml` and backup scripts exist and are exercised in CI; **no production host, domain, TLS, secrets, R2 buckets or off-box backups are provisioned.**                                                                                                                                |
| Repository governance              | Not enforced: branch protection on `main` is not recorded (the owner pushed `main` directly on 2026-10-20). CodeQL, secret scanning and push protection are not recorded as enabled.                                                                                                                          |

## 2. Release trains

One product, three releases. The order protects the two hard rules: nothing social before the offline gate
(constitution II), and no feature that raises review or cost risk before the core is in the stores.

| Release | Contents                                                                                                                                                                                                              | Why this boundary                                                                                                        |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **1.0** | Feature 001 stories 1 to 6 (private journal, globe, photos and documents, offline) + story 9 (allowance and subscription) + account deletion and export + the whole Sunrise Passport UI + production backend + stores | A complete, private, offline-first journal that can monetise; no UGC (so no Apple 1.2 moderation duty), no model costs   |
| **1.1** | Story 8: the day-by-day planner (Anthropic place names, Mapbox verification and routes)                                                                                                                               | Adds an external paid service with a per-account ceiling; ships after the core is stable                                 |
| **1.2** | Story 7: follows, feed, discovery, publishing, report and block, photo screening                                                                                                                                      | **Requires the offline gate to have passed (T141) and a screening provider (OD-3)**; adds UGC obligations in both stores |

The release train can be reordered after T141, but story 7 never starts before it, and no release ships with
a Tier 3 control that does nothing silently (the "coming soon" controls of the UI spec are allowed).

## 3. Milestones

Each milestone has an exit criterion that a reviewer can check. Steps (`S-nn`) are defined in
`STEP-BY-STEP.md`.

| #       | Milestone                                | Steps        | Exit criterion                                                                                                                                                 | Depends on                    |
| ------- | ---------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **M0**  | Repository governance and baseline       | S-01         | `main` is protected (PR required, `CI passed` required, no force push); CodeQL, secret scanning and push protection on; CODEOWNERS present                     | none                          |
| **M1**  | The look: all screens match the pictures | S-02         | F3 to F14 approved by the owner, one at a time; `specs/005` Phases 9 to 11 done; Atlas retired                                                                 | none (parallel with M2 to M4) |
| **M2**  | The core is proven on devices            | S-03, S-04   | Maestro 02 to 05 run green; perf notes recorded (T100, T194); **offline gate T141 passed on two real devices and recorded in `gate-evidence.md`**              | none                          |
| **M3**  | Data rights and platform completeness    | S-05 to S-09 | Deletion sweep with residue test green; export job; About screen with policy links and attributions; geo catalogue import runbook; auth hardening reviewed     | M0                            |
| **M4**  | Monetisation (story 9)                   | S-10 to S-13 | Allowance enforced in the create transaction; RevenueCat purchase, webhook and restore proven in both sandboxes; lapsed entitlement leaves everything readable | M3                            |
| **M5**  | Hardening and observability              | S-21 to S-24 | Load and perf budgets met; security pass done; accessibility sweeps done; Sentry, uptime and alerts live in staging                                            | M3                            |
| **M6**  | Production backend                       | S-25 to S-27 | API, worker and migrations deployed to the production host from a tag by a workflow; TLS valid; backups shipped off-box; restore rehearsal PASSED              | M0                            |
| **M7**  | Mobile CI/CD                             | S-28 to S-31 | A tag builds signed iOS and Android binaries on EAS and submits to TestFlight and the Play internal track without a human touching a secret                    | M0                            |
| **M8**  | Store readiness                          | S-32 to S-34 | Legal pages hosted; listings, assets and forms complete; every blocking row of `docs/release/store-readiness.md` ticked with evidence                          | M4, M6, M7                    |
| **M9**  | Beta                                     | S-35, S-36   | TestFlight internal then external round; Play closed test with at least 12 opted-in testers continuously for 14 days; crash-free target met                    | M8                            |
| **M10** | Release candidate and **1.0 launch**     | S-37 to S-39 | RC regression, offline gate on the production build, privacy suite on the release commit, restore rehearsal; submitted, approved, staged rollout to 100%       | M9                            |
| **M11** | 1.1 planner                              | S-14 to S-16 | Contract tests 10 and the quota and cache tests green; itinerary screen; cost ceilings enforced; released                                                      | M10                           |
| **M12** | 1.2 social                               | S-17 to S-20 | Adversarial privacy rows 8 to 11 green; screening provider live; report and block act; UGC rules satisfied; released                                           | M10 and **T141**              |
| **M13** | Operate                                  | S-40         | Backups, restore drills, secret rotation, dependency and SDK upgrades, legal reviews and support run on a calendar                                             | M10                           |

### Dependency picture

```
M0 ─┬─ M3 ─┬─ M4 ─────────────┐
    │      └─ M5 ─────────────┤
    ├─ M6 ────────────────────┼─ M8 ── M9 ── M10 ── M11 (planner)
    └─ M7 ────────────────────┘                  └── M12 (social; needs T141 from M2)
M1 (UI) and M2 (device proof) run in parallel with all of the above; M10 needs both.
```

Parallelism rule for agents: steps in different milestones with no arrow between them can be worked at the
same time in separate worktrees; inside a milestone, follow the listed order.

## 4. Hard gates (never waived)

1. **Offline-sync gate** (T141): create, edit and delete across connectivity loss, app restart and a
   two-device conflict, all fifteen scenarios, on real devices; before any social or sharing code.
2. **Privacy suite** green on the exact release commit (`CI passed` on the tag). Expenses and documents have
   no visibility flag and no public-read policy.
3. **Test-first and 80%** in every workspace.
4. **Code review and a security review** for auth, authorisation, user input, SQL, files, external calls,
   crypto and payments.
5. **Restore rehearsal passed** before every release (a backup that was never restored is not a backup).
6. **Store policies re-verified** on the day of each submission (Apple "Upcoming requirements", Play Console
   policy centre): they move.

## 5. Risks and their handling

| Risk                                                                           | Handling                                                                                                                                                                 |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Offline sync fails the two-device gate                                         | It blocks M12 only; fix in the sync engine with a failing Maestro row first; 1.0 can still ship if the single-device rows pass and the owner accepts the risk in writing |
| Apple review rejection (4.8, 5.1.1(v), 3.1.2, 5.1.2 privacy, 2.1 demo account) | Checklist rows, App Review notes with a demo account, deletion path documented, paywall disclosure text; rejection playbook in `CICD-AND-RELEASE.md`                     |
| Play closed-testing requirement (12 testers, 14 days) delays launch            | Start recruiting at M7; start the closed test as soon as a signed `.aab` exists                                                                                          |
| Mapbox cost or telemetry                                                       | Restrict tokens, usage alerts, traffic capture on the release build; offline-pack size tests                                                                             |
| Photo roundels or glass misbehave on devices                                   | Documented one-line fallbacks (`roundelsEnabled: false`, solid pill); spikes T507 to T512                                                                                |
| Single VPS is a single point of failure                                        | Accepted for 1.0 (constitution: one modest VPS); backups off-box, RTO 1 h, RPO 24 h, uptime alerts, documented rebuild runbook                                           |
| Secrets leak                                                                   | Secret scanning plus push protection plus gitleaks; secrets only in GitHub environments, EAS, `infra/secrets`; rotation calendar                                         |
| Expo SDK or React Native churn                                                 | Pin to the SDK 57 set; upgrade as a dedicated milestone step with `npx expo install --fix` and a full device regression                                                  |
| Agent sessions drift from the rules                                            | The master prompt and the per-step prompts carry the rules; every PR template checks them; reviews are mandatory                                                         |
| Legal exposure (privacy, export compliance, UGC, subscriptions)                | Counsel review of `docs/legal/*`, the encryption export decision recorded in `docs/release/export-compliance.md`, age and data forms completed truthfully                |

## 6. Definition of done for 1.0

All of the following, each with evidence linked in the release PR:

- Stories 1 to 6 and 9 acceptance scenarios pass (`specs/001-triptrackr-mvp/quickstart.md` sections 4 to 6, 10,
  and the section 11 full check), and the offline gate is recorded.
- The UI matches the pictures in four themes, at the largest text size, on iOS and Android (UI plan).
- Production backend live, monitored, backed up off-box, restore rehearsal PASSED within 1 h.
- Release workflow produced the store binaries from a tag; TestFlight and Play tracks tested.
- Every blocking row in `docs/release/store-readiness.md` is ticked with a link to the evidence.
- Legal pages live and linked in both stores and in the app.
- Sign-off table of `docs/release/store-readiness.md` signed by engineering, privacy and security, legal, product.

## 7. Open owner decisions

Each has a recommended default so work is never blocked; an agent uses the default unless the owner overrides
it, and records the choice in `docs/roadmap/DECISIONS.md` (create it on first use, one dated line per decision).

| ID    | Decision                           | Options                                                                                       | Recommended default                                                                                                                  | Needed by    |
| ----- | ---------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| OD-1  | Production host                    | Hetzner, OVH, Scaleway, other non-hyperscaler VPS (4 GB or more, backups at another provider) | Hetzner Cloud CX-class in the owner's region                                                                                         | S-25         |
| OD-2  | Uptime and alerting                | Uptime Kuma self-hosted (on a second small host), Better Stack, Healthchecks.io               | Better Stack free tier for `/health` plus Healthchecks.io for the backup ping                                                        | S-24         |
| OD-3  | Photo screening provider (story 7) | Self-hosted classifier, a screening API with a processor agreement                            | Decide at M12; none before. Privacy policy updated first                                                                             | S-17         |
| OD-4  | Release runner and OTA             | GitHub Actions calling EAS CLI, or EAS Workflows; whether to add `expo-updates` (EAS Update)  | **GitHub Actions + EAS CLI**; **no OTA in 1.0** (every change goes through store review)                                             | S-28 to S-30 |
| OD-5  | Pre-commit hooks                   | Husky + lint-staged, or none                                                                  | None; CI is the gate (agents run the gates explicitly)                                                                               | S-01         |
| OD-6  | iOS listing text as code           | EAS Metadata (`store.config.json`) or App Store Connect by hand                               | By hand for 1.0                                                                                                                      | S-33         |
| OD-7  | Product analytics                  | None; store-console metrics plus server-side counters; a self-hosted privacy-preserving tool  | **None in 1.0** (no ATT, Data safety says no tracking); counters server-side only                                                    | S-40         |
| OD-8  | Languages                          | English only, or localisation later                                                           | English only in 1.0; all copy centralised (`form-copy.ts`, adapters) for later                                                       | S-23         |
| OD-9  | Pricing and products               | Monthly and yearly subscription; price points; free allowance (default 5 trips, FR-074)       | Monthly and yearly, price set in the stores, allowance stays a config value                                                          | S-13         |
| OD-10 | iPad support                       | `ios.supportsTablet` false (needs no iPad screenshots) or a designed iPad layout              | `false` for 1.0                                                                                                                      | S-33         |
| OD-11 | Domain and brand                   | Domain for API (`API_HOST`), marketing site, support email, privacy URL                       | One domain: `api.` for the API, apex static site for legal pages, `support@`                                                         | S-25, S-32   |
| OD-12 | Entity for the store accounts      | Individual or organisation (D-U-N-S) developer accounts                                       | Organisation if available (Apple requires D-U-N-S; Google 2023+ rules for new personal accounts include the closed-test requirement) | S-31         |

## 8. Non-goals for 1.0

Web app, iPad layout (OD-10), tablets on Android, push notifications (a capability the product does not have;
the primer pictures are coming-soon only), search, recap and sharing posters, settings screen, profile
photographs, per-day budgets, transport modes on stops, localisation (OD-8), analytics SDKs (OD-7), OTA
updates (OD-4). Each appears in the pictures or the blueprint and is a separate specified feature if wanted.
