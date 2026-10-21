# CI/CD, release and operations

How code gets from a branch to production and to both stores, automatically, safely and repeatably; and how the
system is run afterwards. Today only `.github/workflows/ci.yml` exists (9 jobs behind one required check,
`CI passed`). Everything else here is **planned**; the step that builds each piece is named.

> **Action versions.** Workflow snippets write actions by major version for readability. When implementing,
> open each action's releases page, use the current release, and pin **third-party** actions (everything that is
> not `actions/*`) to a full commit SHA with the version in a comment. The EAS facts below were checked against
> the Expo documentation on 2026-10-21 (`docs.expo.dev/build/building-on-ci`, `/build/automate-submissions`,
> `/submit/android`, `/eas/json`); re-check before relying on them.

## 1. Branches, commits, reviews

- **Trunk-based.** `main` is always releasable. Work happens on short-lived branches named `<type>/<scope>-<what>`
  (`feat/api-account-deletion`, `fix/sync-tombstone-order`, `ci/eas-release`, `docs/roadmap`). One concern per branch;
  one worktree per branch for parallel agents (`git worktree add ../TripTrackr-wt/<name> -b <branch> origin/main`,
  with `node_modules` shared by a junction or symlink; never `npm install` inside a worktree).
- **Conventional commits** `<type>(<scope>): <description>` (`feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`,
  `chore`, `perf`, `revert`). The PR title has the same form because PRs are **squash-merged** and the title becomes the commit
  that release-please reads. Breaking changes carry `!` and a `BREAKING CHANGE:` footer.
- **Pull request** from the template (`.github/pull_request_template.md`): what, why, privacy posture, checklist, how to
  verify. Link the task ids (`T0xx`) and the step (`S-nn`).
- **Review**: mandatory for every PR. For a solo maintainer the review is a documented review pass (a second agent session
  with the review prompt, or a human) whose findings are resolved or answered in the PR; CRITICAL blocks the merge, HIGH
  should be fixed first. Security-sensitive changes (auth, authorisation, input, SQL, files, external calls, crypto,
  payments) also get the security review prompt.
- **Never** force-push `main` or a shared branch, rewrite published history, bypass a failing gate, or merge on red.

### 1.1 Repository settings (step S-01)

| Setting                               | Value                                                                                                                                                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch protection (ruleset) on `main` | Require a PR; require status checks **`CI passed`** and **`Security`**; require branches up to date; require conversation resolution; require linear history; block force pushes and deletions; restrict who can bypass (nobody) |
| Merge methods                         | Squash only; delete head branches on merge                                                                                                                                                                                       |
| Required reviews                      | 1 when a second maintainer exists; otherwise 0 with the documented review pass above                                                                                                                                             |
| CODEOWNERS                            | `.github/CODEOWNERS`: `/apps/api/src/db/migrations/` and `/infra/` and `/.github/workflows/` and `/docs/legal/` need the owner                                                                                                   |
| Security features                     | Secret scanning and **push protection** on; Dependabot alerts and security updates on; code scanning (CodeQL) on                                                                                                                 |
| Actions permissions                   | Default token read-only; workflows request `permissions:` explicitly; allow actions from GitHub and the pinned third parties only                                                                                                |
| Environments                          | `staging`, `production-api`, `production-mobile`, each with **required reviewers** and its own secrets (section 3)                                                                                                               |
| Tags                                  | Protect `v*` tags (only release automation and the owner create them)                                                                                                                                                            |

## 2. Workflow inventory

| Workflow (file)                                 | Trigger                                    | What it does                                                                                                                                                             | Step       | Status  |
| ----------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------- |
| `ci.yml`                                        | PR, push to `main`                         | Lint, typecheck, format, contracts and mobile and API tests (80%), privacy suite, Docker build, Compose validate, backup rehearsal; `CI passed`                          | n/a        | Exists  |
| `security.yml`                                  | PR, push to `main`, weekly                 | CodeQL, gitleaks, `npm audit --omit=dev --audit-level=high`, Trivy on the API and backup images; job `Security passed`                                                   | S-01, S-22 | Planned |
| `pr-title.yml`                                  | PR opened or edited                        | Fails unless the PR title is a conventional commit (`amannn/action-semantic-pull-request`)                                                                               | S-01       | Planned |
| `mobile-checks.yml` (or extra jobs in `ci.yml`) | PR touching `apps/mobile` or `packages/**` | `npm run doctor -w apps/mobile`, `expo config --type introspect`, export for both platforms (bundle build), bundle-size report                                           | S-29       | Planned |
| `release-please.yml`                            | push to `main`                             | Opens or updates the release PR (CHANGELOG, version bumps); merging it creates the `vX.Y.Z` tag and the GitHub Release                                                   | S-30       | Planned |
| `api-deploy.yml`                                | tag `v*`, manual                           | Builds and scans the API image, pushes to GHCR, deploys to the VPS behind the `production-api` approval, health check, rollback                                          | S-27       | Planned |
| `mobile-release.yml`                            | tag `v*`, manual                           | Verifies `CI passed` on the commit, then EAS build (iOS and Android) with auto-submit to TestFlight and the Play internal track, behind the `production-mobile` approval | S-30       | Planned |
| `mobile-promote.yml`                            | manual only                                | Promotes the latest internal build to Play closed, open or production (staged rollout), using a named submit profile                                                     | S-39       | Planned |
| `nightly.yml`                                   | daily and manual                           | Restore rehearsal against a production-shaped backup copy (optional), dependency advisories, expired-secret reminders (issues)                                           | S-40       | Planned |

All workflows: `concurrency` groups, `timeout-minutes`, `permissions` least privilege, `defaults.run.shell: bash`,
`EXPO_NO_TELEMETRY: '1'`, `.nvmrc` for Node, `npm ci` at the root, no secret echoed, no `pull_request_target` with
untrusted code, secrets never exposed to forks (CI gates that need none run on forks; release workflows only run on tags in this repository).

### 2.1 `security.yml` (S-01, S-22)

```yaml
name: Security
on:
  pull_request:
  push: { branches: [main] }
  schedule: [{ cron: '17 5 * * 1' }]
permissions: { contents: read }
concurrency:
  group: security-${{ github.ref }}
  cancel-in-progress: true
jobs:
  codeql:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    permissions: { contents: read, security-events: write, actions: read }
    steps:
      - uses: actions/checkout@v7
      - uses: github/codeql-action/init@v4
        with: { languages: javascript-typescript, build-mode: none }
      - uses: github/codeql-action/analyze@v4
  gitleaks:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2 # pin by SHA; add .gitleaks.toml allowlist ONLY for documented fixtures
        env: { GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}' }
  audit:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci --ignore-scripts
      - run: npm audit --omit=dev --audit-level=high
  image-scan:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v7
      - run: docker build -f apps/api/Dockerfile -t triptrackr-api:scan .
      - uses: aquasecurity/trivy-action@v0 # pin by SHA
        with:
          {
            image-ref: 'triptrackr-api:scan',
            severity: 'CRITICAL,HIGH',
            exit-code: '1',
            ignore-unfixed: true,
          }
  security-passed:
    needs: [codeql, gitleaks, audit, image-scan]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - run: |
          if [ "${{ contains(needs.*.result, 'failure') }}" = "true" ] || [ "${{ contains(needs.*.result, 'cancelled') }}" = "true" ] || [ "${{ contains(needs.*.result, 'skipped') }}" = "true" ]; then exit 1; fi
```

(`npm ci --ignore-scripts` for the audit job only: it reads the lockfile and installs nothing that runs scripts. The normal jobs keep `npm ci`.)

### 2.2 `api-deploy.yml` (S-27)

Prerequisites (S-25, S-26): the VPS exists with a non-root `deploy` user in the `docker` group, the repository checked out read-only at
`/opt/triptrackr` (deploy key), `.env` and `infra/secrets/*` provisioned by hand, and `infra/docker-compose.prod.yml` changed so `api`, `worker` and `migrate`
use `image: ${API_IMAGE:?}` instead of building locally (a PR of its own, with the CI Compose assertions updated).

```yaml
name: API deploy
on:
  push: { tags: ['v*.*.*'] }
  workflow_dispatch:
    inputs:
      {
        tag:
          { description: 'Image tag (a version or sha-...) to deploy', required: true },
      }
permissions: { contents: read, packages: write }
concurrency: { group: api-deploy, cancel-in-progress: false }
jobs:
  image:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    outputs: { ref: '${{ steps.out.outputs.ref }}' }
    steps:
      - uses: actions/checkout@v7
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          {
            registry: ghcr.io,
            username: '${{ github.actor }}',
            password: '${{ secrets.GITHUB_TOKEN }}',
          }
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository_owner }}/triptrackr-api
          tags: |
            type=sha
            type=semver,pattern={{version}}
      - uses: docker/build-push-action@v6
        with:
          {
            context: .,
            file: apps/api/Dockerfile,
            push: true,
            tags: '${{ steps.meta.outputs.tags }}',
            labels: '${{ steps.meta.outputs.labels }}',
            cache-from: 'type=gha',
            cache-to: 'type=gha,mode=max',
          }
      - id: out
        run: echo "ref=ghcr.io/${{ github.repository_owner }}/triptrackr-api:sha-${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"
      - uses: aquasecurity/trivy-action@v0 # scan the pushed image, fail on CRITICAL
        with:
          {
            image-ref: '${{ steps.out.outputs.ref }}',
            severity: CRITICAL,
            exit-code: '1',
            ignore-unfixed: true,
          }
  deploy:
    needs: image
    runs-on: ubuntu-latest
    timeout-minutes: 20
    environment: production-api # required reviewers: the owner
    steps:
      - name: Deploy over SSH (restricted key, pinned host key)
        env:
          SSH_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
          KNOWN_HOSTS: ${{ secrets.DEPLOY_KNOWN_HOSTS }}
          HOST: ${{ secrets.DEPLOY_HOST }}
          REF: ${{ needs.image.outputs.ref }}
        run: |
          install -m 700 -d ~/.ssh
          printf '%s\n' "$SSH_KEY" > ~/.ssh/id && chmod 600 ~/.ssh/id
          printf '%s\n' "$KNOWN_HOSTS" > ~/.ssh/known_hosts
          ssh -i ~/.ssh/id -o StrictHostKeyChecking=yes "deploy@${HOST}" "cd /opt/triptrackr && ./infra/scripts/deploy.sh '${REF}'"
```

`infra/scripts/deploy.sh <image-ref>` (to be written in S-27, tested against the CI Compose stack) must, in order: (1) refuse to run
unless `.env` and `infra/secrets/*` exist; (2) trigger an on-demand backup (`backup.sh`) and abort if it fails; (3) record the currently running
image as `PREVIOUS`; (4) `docker pull` the new image; (5) run `migrate` as a one-shot with the owner URL (migrations are
**expand then contract**: a release never needs a schema the previous API cannot run against, so rollback is safe); (6) `docker compose up -d api worker`
with `API_IMAGE=<ref>`; (7) poll `https://$API_HOST/health` for up to 2 minutes and check that the API container's `DATABASE_URL` user is
`triptrackr_api`; (8) on any failure restart `PREVIOUS`, exit non-zero (the workflow fails and the owner is paged); (9) prune old images keeping the last three.

### 2.3 `mobile-release.yml` (S-30)

```yaml
name: Mobile release
on:
  push: { tags: ['v*.*.*'] }
  workflow_dispatch:
    inputs:
      platform:
        {
          description: 'all, ios or android',
          type: choice,
          options: [all, ios, android],
          default: all,
        }
permissions: { contents: read, checks: read }
concurrency: { group: mobile-release, cancel-in-progress: false }
env: { CI: 'true', EXPO_NO_TELEMETRY: '1' }
jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Require a green "CI passed" on this exact commit
        env: { GH_TOKEN: '${{ github.token }}' }
        run: |
          c=$(gh api "repos/${{ github.repository }}/commits/${{ github.sha }}/check-runs" --jq '[.check_runs[] | select(.name=="CI passed")] | last | .conclusion')
          test "$c" = "success" || { echo "::error::CI passed is '$c' on ${{ github.sha }}"; exit 1; }
  build-and-submit:
    needs: verify
    runs-on: ubuntu-latest
    timeout-minutes: 30
    environment: production-mobile # required reviewers: the owner
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version-file: .nvmrc, cache: npm }
      - uses: expo/expo-github-action@v8
        with: { eas-version: latest, token: '${{ secrets.EXPO_TOKEN }}' }
      - run: npm ci
      - name: EAS build, then EAS Submit when each build finishes
        working-directory: apps/mobile
        run: eas build --platform "${{ inputs.platform || 'all' }}" --profile production --non-interactive --no-wait --auto-submit
```

Facts this relies on (verified in the Expo docs): `EXPO_TOKEN` authenticates the CLI; `--non-interactive --no-wait` triggers the build and exits
(the step reports success when the build is **triggered**; remove `--no-wait` if a later step needs the artefact); `--auto-submit` hands each
finished build to EAS Submit with the submission profile of the same name; by default iOS goes to **TestFlight only** (promotion to App Store review is
manual) and Android goes to the **internal** track. A non-interactive Android submit needs a Google service-account key assigned to the app in EAS
credentials (or `serviceAccountKeyPath`), else it fails with "Google Service Account Keys cannot be set up in --non-interactive mode". The **first** Play
release can be created by `eas submit` only after the app exists in Play Console; some owners prefer the first upload by hand (S-31 decides and records).

### 2.4 `release-please.yml` and versioning (S-30)

- **One version for the product** (`vX.Y.Z`), kept in the root `package.json`, `apps/mobile/app.config.ts` (`version`) and `apps/api/package.json`
  by release-please `extra-files`. Store build numbers are **not** the version: EAS `appVersionSource: remote` with `autoIncrement` on the `production`
  profile manages `buildNumber` and `versionCode`.
- `release-please-config.json`: a single package at `.` with `release-type: simple`, `changelog-path: CHANGELOG.md`, `extra-files` for the three
  version locations (`generic` updater with an `x-release-please-version` annotation comment in `app.config.ts`; `json` updater with `$.version` for the
  `package.json` files), `bump-minor-pre-major: true` until 1.0.0. `.release-please-manifest.json` starts at `{ ".": "0.0.0" }` and is set to the
  chosen starting version by the S-30 PR. The workflow (`googleapis/release-please-action`, pinned by SHA) needs
  `permissions: { contents: write, pull-requests: write }` only.
- Merging the release PR creates the tag, which triggers `api-deploy.yml` and `mobile-release.yml`. Pre-release builds for testers use
  `workflow_dispatch` with the `preview` profile and no tag.

### 2.5 `eas.json` target (S-28)

```json
{
  "cli": { "version": ">= 16.0.0", "appVersionSource": "remote" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": { "APP_VARIANT": "development" }
    },
    "preview": {
      "distribution": "internal",
      "env": { "APP_VARIANT": "production" },
      "environment": "preview"
    },
    "production": {
      "autoIncrement": true,
      "environment": "production",
      "ios": { "image": "latest" }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "ascAppId": "<set in S-31>",
        "ascApiKeyPath": "$ASC_API_KEY_PATH",
        "ascApiKeyIssuerId": "$ASC_API_KEY_ISSUER_ID",
        "ascApiKeyId": "$ASC_API_KEY_ID"
      },
      "android": { "track": "internal", "releaseStatus": "completed" }
    },
    "production-rollout": {
      "android": { "track": "production", "releaseStatus": "inProgress", "rollout": 0.1 }
    }
  }
}
```

Notes: confirm the `cli.version` floor against the installed EAS CLI; confirm `ios.image` resolves to **Xcode 26** (App Store requirement since 2026-04-28)
and pin an explicit image name if `latest` does not; EAS environment variables per environment (`eas env:create`) hold the `EXPO_PUBLIC_*` values and
the secrets `SENTRY_AUTH_TOKEN` and `MAPBOX_DOWNLOADS_TOKEN`; the ASC key can instead live in EAS credentials, in which case the three `ascApiKey*` fields are
omitted. Keep `APP_VARIANT` unset in `production` so the bundle id is `com.triptrackr.app`.

## 3. Secrets and environments

| Secret                                                | Where it lives                                           | Used by                            | Rotation                                                                                     |
| ----------------------------------------------------- | -------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `EXPO_TOKEN`                                          | GitHub environment `production-mobile`                   | `mobile-release`, `mobile-promote` | Yearly or on a departure                                                                     |
| `SENTRY_AUTH_TOKEN`, `MAPBOX_DOWNLOADS_TOKEN`         | EAS secrets (production)                                 | EAS builds                         | Yearly                                                                                       |
| ASC API key (`.p8`, key id, issuer id), Apple team id | EAS credentials (preferred)                              | EAS Submit, credential repair      | Yearly; revoke if exposed                                                                    |
| Google Play service-account JSON                      | EAS credentials (assigned to the app)                    | EAS Submit                         | Yearly                                                                                       |
| `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`, `DEPLOY_HOST` | GitHub environment `production-api`                      | `api-deploy`                       | Quarterly (key); host key on change                                                          |
| `GITHUB_TOKEN`                                        | Automatic, per job                                       | GHCR push, release-please          | Per run                                                                                      |
| Runtime secrets (JWT, DB, keys, `.env`)               | The VPS (`.env`, `infra/secrets/*.txt`), never in GitHub | The containers                     | Quarterly (JWT); on exposure (all); `DOCUMENT_MASTER_KEY` only with a re-wrap migration plan |

Rules: a secret has exactly one home; GitHub environment secrets are only readable by jobs that reference that environment (and its reviewers approve);
rotate by creating the new value first, deploying it, then revoking the old; any suspected exposure means rotate everything the secret could reach and
write the incident note. Never print a secret, never put one in a URL, an image layer, a log, `EXPO_PUBLIC_*` or a PR description.

## 4. Releasing 1.0 (and every release): the procedure

1. **Freeze**: no merges except fixes for the release. All milestone exit criteria met (`ROADMAP.md`).
2. **Verify**: `CI passed` and `Security passed` on `main`; run the full local check (`specs/001-triptrackr-mvp/quickstart.md` section 11); privacy suite on the
   exact commit; restore rehearsal PASSED this month; `docs/release/store-readiness.md` blocking rows ticked with links.
3. **Merge the release PR** (release-please): CHANGELOG, version, tag `vX.Y.Z`.
4. **API**: `api-deploy.yml` builds, scans, waits for the `production-api` approval, deploys, health-checks (or rolls back). Smoke-test with the demo account.
5. **Mobile**: `mobile-release.yml` waits for the `production-mobile` approval, builds on EAS, submits iOS to TestFlight and Android to the internal track.
6. **Test the binaries** that came out of the store pipeline (not a dev build): install from TestFlight and Play internal, run the smoke flow, the offline
   gate rows on the release build, the account deletion path, a sandbox purchase and a restore.
7. **Promote**: iOS: in App Store Connect attach the build, complete the version page, **submit for review** with the review notes and demo account, choose
   **phased release**. Android: run `mobile-promote.yml` with `production-rollout` (10%), or promote in Play Console; watch Android Vitals; raise to 100%.
8. **Watch** crash-free sessions and ANR in Sentry, Xcode Organizer and Android Vitals, server errors and queue depth, support mail, for at least 48 hours.
9. **Close**: GitHub Release published (release-please), `docs/release/store-readiness.md` sign-off table signed and dated, the post-release notes added to `docs/roadmap/DECISIONS.md`.

### 4.1 Hotfix and rollback

| Situation                             | Action                                                                                                                                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bad API release                       | `workflow_dispatch` on `api-deploy.yml` with the previous tag (or `deploy.sh` rolls back automatically on a failed health check). Migrations are expand/contract so the old image still runs    |
| Bad mobile release on Play            | Halt the rollout in Play Console (or `releaseStatus: halted`), fix forward on a hotfix branch, ship a patch version; Play lets you re-release the previous bundle with a higher version code    |
| Bad mobile release on the App Store   | Remove the version from sale or stop the phased release, submit the patch and request **expedited review** with the reason; there is no binary rollback                                         |
| Server-side protection of old clients | `GET /health` may report `min_app_version`; the app shows a blocking "update required" screen below it (add in S-39 if a defect needs it); never break the sync protocol without a version bump |
| Data incident                         | Section 6.3                                                                                                                                                                                     |

Hotfix flow: branch from the release tag (`fix/<what>` from `vX.Y.Z`), failing test first, the normal gates, squash-merge to `main` (cherry-pick if `main`
has moved on), a patch version through release-please, then the release procedure from step 3 with the shortest path.

## 5. Store runbooks (steps S-31 to S-39)

### 5.1 Apple App Store

1. **Accounts**: Apple Developer Program (organisation needs a D-U-N-S number), App Store Connect access for the owner; create the **App ID**
   `com.triptrackr.app` with the **Sign in with Apple** capability; create the app record (name, primary language, SKU, bundle id).
2. **Credentials**: let EAS manage certificates and provisioning profiles (`eas credentials`); create an **App Store Connect API key** (Admin or App Manager role)
   and store it in EAS credentials; note `ascAppId`.
3. **Compliance in the project**: Xcode 26 / iOS 26 SDK image; deployment target 15.1; privacy manifest; usage strings; export compliance decision in
   `docs/release/export-compliance.md` and `usesNonExemptEncryption` set to match; `supportsTablet: false` (OD-10).
4. **App Store Connect**: Privacy Policy URL, Terms (EULA) URL, support URL, App Privacy labels, age rating (the expanded questionnaire), categories,
   description, keywords, **6.9-inch screenshots** (1290x2796 or 1320x2868), 1024x1024 icon without alpha, **App Review notes** and a demo account,
   subscription group with products, prices and localisations, Paid Apps Agreement with tax and banking, sandbox testers.
5. **TestFlight**: internal group first (the build arrives through EAS Submit); then an **external group** (Beta App Review); builds expire after 90 days.
6. **Submit** the version for review; choose **phased release for automatic updates**; answer reviewer messages inside the review window.
7. **Rejection playbook**: read the guideline cited; fix the product or add the missing review note; do not argue policy without evidence. Typical hits and the
   prepared answer: 4.8 (Sign in with Apple is offered), 5.1.1(v) (deletion path in Profile, documented), 3.1.2 (paywall disclosures and Restore Purchases),
   2.1 (demo account with data; app works offline), 5.1.1(i) (permission strings), 1.2 (UGC controls, release 1.2 only), privacy label mismatches (align the label with the manifest and the policy).

### 5.2 Google Play

1. **Accounts**: Play Console developer account (identity verification); create the app `com.triptrackr.app`; **Play App Signing** enabled (Google holds the app signing key;
   EAS holds the upload key); register the **SHA-1** of the upload and app signing certificates for Google sign-in.
2. **Service account**: Google Cloud service account with Play Console API access; JSON key uploaded to EAS credentials and assigned to the app (needed by `eas submit --non-interactive`).
3. **Compliance in the project**: target API 36; `.aab`; 16 KB page-size compliant native libraries (verify with `bundletool` and an Android 15+ emulator); no unused permissions (`blockedPermissions`);
   R8 mapping and native symbols uploaded; Play Billing Library 8+ through `react-native-purchases`.
4. **Play Console**: store listing (512x512 icon, 1024x500 feature graphic, 2 or more phone screenshots), **Data safety** form, content rating, target audience, **App access** instructions with the
   demo account, privacy policy URL, **account deletion web page URL**, ads declaration (no ads), permissions declarations, news and health declarations as applicable.
5. **Testing tracks**: internal (up to 100 testers) for every build; **closed testing with at least 12 testers opted in continuously for 14 days** (required for new personal accounts) before applying for production access;
   then production with a **staged rollout** (10%, 25%, 50%, 100%) watching Android Vitals.
6. **Rejection playbook**: Policy status page cites the policy; fix and resubmit; common causes are Data safety mismatch, missing deletion page, permissions not justified, broken demo access.

### 5.3 Listing assets and copy

Owned in the repository so they are reviewable: `docs/release/listing/` (create in S-33) with `en/title.txt` (30 chars), `subtitle.txt` (30), `short-description.txt` (80, Play),
`description.md`, `keywords.txt` (100, Apple), `release-notes.md`, `screenshots/` generated from the Sunrise Passport reference screens on the real build (light and dark), and
`review-notes.md` (reviewer instructions and the demo account, with the password kept out of the file: stored in the password manager and entered in the consoles).

## 6. Operations (S-24 to S-27, S-40)

### 6.1 Monitoring and alerts

| Signal                                 | Tool                                             | Alert when                                    | Goes to           |
| -------------------------------------- | ------------------------------------------------ | --------------------------------------------- | ----------------- |
| `/health` from outside                 | Uptime monitor (OD-2)                            | Two consecutive failures                      | On-call email/SMS |
| Container restarts, OOM                | Compose healthchecks plus the monitor agent      | Any restart loop                              | On-call           |
| Disk space on the VPS and the volumes  | Monitor agent or a cron `df` ping                | Above 80%                                     | On-call           |
| Backup age                             | `.last-success` ping (Healthchecks.io)           | Older than 26 hours                           | On-call           |
| TLS certificate                        | Uptime monitor                                   | Under 14 days to expiry                       | On-call           |
| Server errors and slow requests        | Sentry (`@sentry/nestjs`)                        | New issue or error rate over a threshold      | Email             |
| App crashes and ANRs                   | Sentry (mobile), Xcode Organizer, Android Vitals | Crash-free users under 99.5% for a release    | Email             |
| Queue depth and failed jobs            | Logs plus a small `/health` detail               | Media or deletion queue older than 15 minutes | Email             |
| RevenueCat webhook failures            | RevenueCat dashboard                             | Any failed delivery                           | Email             |
| Provider spend (Mapbox, Anthropic, R2) | Provider dashboards with limits                  | 80% of the monthly cap                        | Email             |

### 6.2 Routine calendar

| Cadence               | Task                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every PR              | `CI passed`, `Security passed`, review pass                                                                                                                                                 |
| Weekly                | Triage Dependabot (Expo-pinned packages move only with an SDK upgrade); read Sentry digest; check backup age and disk                                                                       |
| Monthly               | **Restore rehearsal** from the real off-box backup; apply OS security updates and reboot window; review provider spend; review store policy pages                                           |
| Quarterly             | Rotate JWT secrets and the deploy SSH key; review access (GitHub, EAS, stores, VPS); dry-run the incident process                                                                           |
| Yearly                | Rotate store and CI tokens; legal review of `docs/legal/*`; BIS self-classification report (by 1 February) if required by the export decision; renew Apple Developer membership and domains |
| Each Expo SDK release | Dedicated upgrade branch: `npx expo install --fix`, `npx expo-doctor`, full device regression, new native build, then a normal release                                                      |
| Each release          | The procedure in section 4; TestFlight builds expire after 90 days, keep a build fresh                                                                                                      |

### 6.3 Incident process

Detect (alert or report) -> **contain** (disable the affected route or feature flag, revoke tokens, stop the worker queue, take the endpoint behind a maintenance
response) -> **assess** (what data, which accounts, since when; RLS means the blast radius is bounded by the policy involved) -> **fix** (failing test first) ->
**rotate** (every secret the incident could reach) -> **notify** (affected travellers and regulators within the legal window, store contacts if required) ->
**post-mortem** (blameless, a dated file under `docs/incidents/`, an action item that becomes a test). A privacy incident is always severity one.

### 6.4 Backups and restore (constitution: a backup is not a backup until restored)

Nightly `pg_dump` by the `backup` service to the `postgres-backups` volume, checksummed, shipped by rclone to a bucket at a **different provider** with write-only credentials and a
lifecycle rule; `.last-success` pinged to the monitor; `infra/scripts/restore-rehearsal.sh` restores into a scratch server and asserts schema, the migrations ledger and forced RLS (CI does this on
every PR; production does it monthly from the real off-box copy). Object storage durability is the provider's (R2); bucket versioning and a lifecycle rule for aborted multipart uploads are on.
`DOCUMENT_MASTER_KEY` is escrowed offline: losing it makes sealed documents unreadable.

## 7. What "automated" means here, and what stays human

Automated: every PR gate, the security scans, release versioning and CHANGELOG, API image build, scan and deploy with rollback, iOS and Android builds, TestFlight and
Play internal submission, staged-rollout promotion, backup and its monitoring, dependency PRs.
Human by design (so a leaked token cannot ship an app): the **approval** on the `production-api` and `production-mobile` environments, **submitting a version for review** in App Store Connect,
**promoting beyond internal** unless the owner dispatches `mobile-promote.yml`, signing legal documents, recording the sign-off table, and the owner decisions in `ROADMAP.md` section 7.
