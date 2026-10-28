# Contributing to TripTrackr

One page. The rules that bind are in [`AGENTS.md`](../AGENTS.md) and the constitution
(`.specify/memory/constitution.md`); the pipeline is in
[`docs/roadmap/CICD-AND-RELEASE.md`](./roadmap/CICD-AND-RELEASE.md). This page is how to move a change from an
idea to `main`.

## 1. Branches

- `main` is protected: **nobody pushes to it**, not the owner, not an agent. Every change is a pull request.
- Branch from `main` and name the branch by its type and subject: `feat/account-deletion`, `fix/fx-backfill-race`,
  `docs/contributing`, `ci/repo-governance`. A step of the roadmap names its branch in `STEP-BY-STEP.md`.
- Several sessions at once: one **git worktree** per branch (`git worktree add ../tt-<topic> -b <branch> origin/main`),
  never two sessions in one checkout, and never two writers on the same files.
- Keep a branch short-lived. Merge `main` into it (do not rebase a branch someone else has pulled).

## 2. Commits and pull requests

- Commit messages and **PR titles** are conventional: `<type>(<scope>): <subject>` with `feat`, `fix`, `refactor`,
  `docs`, `test`, `build`, `ci`, `chore`, `perf`, `revert`. The subject starts in lower case. A breaking change
  carries `!` and a `BREAKING CHANGE:` footer. `pr-title.yml` checks the title: PRs are **squash-merged**, so the title
  is the commit on `main`.
- Fill in the PR template: what, why, **privacy posture** (every table, endpoint or screen that touches traveller
  data), checklist, how to verify. Link the task ids (`T0xx`) and the step (`S-nn`).
- Never force-push `main` or a shared branch, rewrite published history, bypass a gate, or merge on red.

## 3. Gates (all required, all automatic)

| Gate                        | What it proves                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **`CI passed`**             | Lint, types, format, contract, mobile and API tests at 80%, the privacy suite, images, Compose, backup restore |
| **`Security passed`**       | CodeQL, gitleaks, the dependency-audit gate, Trivy on the images                                               |
| **`Conventional PR title`** | The title is a conventional commit                                                                             |

Run what CI runs before you push (commands in `AGENTS.md`): `npm run lint && npm run typecheck`, the workspace tests,
`npm run format:check`, and `npm run test:scripts` for the scripts. A new dependency advisory is dealt with, or waived
in `security/audit-allowlist.json` with a reason and an expiry date (never longer than 90 days).

## 4. Review

Every PR is reviewed before it merges. With one maintainer that is a **documented review pass**: a second session with
the review prompt (`AGENT-PROMPTS.md`, `P-REVIEW`), or a person, whose findings are fixed or answered in the PR.
CRITICAL blocks the merge; HIGH should be fixed first. Anything touching authentication, authorisation, user input,
SQL, files, external calls, cryptography or payments also gets the security review prompt (`P-SECURITY`).
`.github/CODEOWNERS` names the paths that need the owner: migrations, `infra/`, `.github/`, `docs/legal/`.

## 5. Specs, tests, quality

- **Spec first**: behaviour is in `specs/<feature>/spec.md` before code (`/speckit-specify` to `/speckit-implement`).
- **Test first**: a failing test, then the code; coverage below 80% fails CI.
- Functions under 50 lines, files under 800, nesting under 4, errors handled, no debug output, new values over mutation.
- Format with `npm run format` (Prettier). Never edit a `package.json` without running `npm install` at the root.

## 6. Secrets

- Secrets live in the root `.env` (gitignored) and, in production, `infra/secrets/`. **Never** commit, log, paste
  into a PR or bake into an image. New variables go in `.env.example` and in the config schema.
- Secret scanning and push protection are on. If a secret reaches the repository: rotate it first, then remove it.
  A fixture that merely looks like a secret goes in `.gitleaks.toml` with a comment saying why.

## 7. Keeping the plan current

At the end of a session update `docs/roadmap/PROGRESS.md` (a tick needs a link to the merged PR or the evidence
file) and record an owner decision in `docs/roadmap/DECISIONS.md`.
