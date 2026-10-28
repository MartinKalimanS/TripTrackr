# Repository settings: the owner's checklist (step S-01)

The workflows in this PR cannot turn their own protections on: GitHub keeps these in the repository settings, which
only the owner can change. Do them **after** this PR is merged (the status checks named below must have run once to
be selectable). Source of truth: [`CICD-AND-RELEASE.md`](./CICD-AND-RELEASE.md) section 1.1. Paste this list into an
issue to tick it off (`gh issue create --title "S-01: apply the repository settings" --body-file
docs/roadmap/REPO-SETTINGS-CHECKLIST.md`).

## 1. Ruleset on `main` (Settings, Rules, Rulesets, New branch ruleset)

- [ ] Name `main`, enforcement **Active**, target `main` (the default branch).
- [ ] **Restrict deletions** and **Block force pushes**.
- [ ] **Require linear history**.
- [ ] **Require a pull request before merging**: required approvals **0** while you are the only maintainer (the
      documented review pass replaces it; set 1 when a second maintainer exists), **Require conversation
      resolution**, allowed merge methods **Squash** only.
- [ ] **Require review from Code Owners** (it makes `.github/CODEOWNERS` bind; leave off if it would block your own PRs
      while you are the only owner, and switch it on with the second maintainer).
- [ ] **Require status checks to pass**, **Require branches to be up to date**, with exactly these checks:
      `CI passed`, `Security passed`, `Conventional PR title`.
- [ ] **Bypass list: empty** (nobody). Main was pushed directly on 2026-10-20; after this, never.

## 2. Pull requests and merging (Settings, General)

- [ ] Allow squash merging only (untick merge commits and rebase merging); default message **Pull request title**.
- [ ] **Automatically delete head branches**.

## 3. Security features (Settings, Code security)

- [ ] **Dependabot alerts** and **Dependabot security updates** on.
- [ ] **Secret scanning** and **Push protection** on.
- [ ] **Code scanning**: CodeQL is run by `security.yml`; leave "default setup" off so there is one configuration.

## 4. Actions (Settings, Actions, General)

- [ ] **Workflow permissions**: Read repository contents (read-only default); do not allow Actions to approve pull
      requests.
- [ ] **Actions permissions**: allow actions created by GitHub, and the pinned third parties this repository uses
      (`gitleaks/gitleaks-action`, `aquasecurity/trivy-action`, `amannn/action-semantic-pull-request`).
- [ ] **Fork pull requests**: require approval for all outside collaborators.

## 5. Environments (Settings, Environments), each with **required reviewers** (you)

- [ ] `staging`
- [ ] `production-api`
- [ ] `production-mobile`

They hold the deploy and store secrets later (S-27, S-28, S-30); create them empty now so the approval rule exists.

## 6. Tags (Settings, Rules, Rulesets, New tag ruleset)

- [ ] Protect `v*` tags: restrict creation, updates and deletions; only the release automation and you create them.

## 7. Prove it works (the evidence of S-01)

- [ ] Open a PR with a fake secret in a file: `gitleaks` fails and `Security passed` is red. (Use a throwaway
      branch and close the PR; the push-protection warning may stop the push first, which also counts.)
- [ ] Open a PR titled `Add stuff`: `Conventional PR title` fails. Rename it `chore: add stuff`: it passes.
- [ ] Try `git push origin main` from a clone: it is refused.
- [ ] Save the ruleset as evidence: `gh api repos/MartinKalimanS/TripTrackr/rulesets > docs/roadmap/evidence/rulesets.json`
      (or a screenshot) and link it from `PROGRESS.md`.

## 8. What the gates do today, and what is waived

`Security passed` runs the dependency-audit gate. On 2026-10-28 its first run found **7 high or critical advisories**
in production dependencies (one critical, `shell-quote`). They are waived in `security/audit-allowlist.json` until
**2026-11-27** so that the gate can be switched on, and the fix is tracked as a follow-up (five are fixed by `npm audit
fix`; the other two wait for NestJS 12 and a zod bump). **The waivers expire on purpose**: on that date the gate goes red
again unless the advisories are fixed or the waivers are re-reviewed.

The **backup image scan is report-only** for the same reason: its base is Debian 11, with 45 operating-system findings (2 critical) and Go
standard-library findings in `gosu` and `rclone` (first scan, 2026-10-28). The API image scan blocks. The follow-up (S-22) moves the backup base image and
repeats the restore rehearsal, then sets `exit: '1'` for it in `security.yml`.
