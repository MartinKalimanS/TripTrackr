<!--
Title: conventional commit form — `<type>: <description>` (feat, fix, refactor, test, docs, build, ci, chore).
Link the spec task(s) this implements, e.g. "Implements T042, T043 (specs/001-triptrackr-mvp/tasks.md)".
-->

## What

<!-- One or two sentences. What changes for a traveller, or for the system. -->

## Why

<!-- Which spec requirement / task / bug. Specification precedes code (constitution). -->

## Privacy posture

<!--
Constitution I: every new table, endpoint, screen or query that touches traveller-owned data
MUST state its visibility posture before merge. "It is not exposed yet" is not a posture.
Delete this section only if the change touches no traveller data at all — and say so.
-->

- Data touched:
- Who can read it, and which RLS policy / access rule enforces that:
- Expenses/documents: confirm no visibility flag and no public-read policy were introduced.

## Checklist

- [ ] **Spec first** — behaviour is described in `specs/` before this code existed
- [ ] **Tests first** — red → green → refactor; new tests fail without the change
- [ ] **80% coverage** holds in every workspace touched
- [ ] **Privacy suite** passes locally (`npm run test:privacy -w apps/api`) if the API or schema changed
- [ ] **Security review** requested — required if this touches auth, authorisation, user input, database queries or migrations, file handling, external calls, cryptography, or payments
- [ ] **Offline-sync gate** — no social/sharing feature is started here unless the sync acceptance suite already passes
- [ ] **No secrets** committed, baked into an image, or hard-coded; new env vars are in `.env.example` and validated in `env.schema.ts`
- [ ] **Expo APIs** verified against `https://docs.expo.dev/versions/v57.0.0/` (not recalled)
- [ ] **Migrations** are new files under `apps/api/src/db/migrations/`; no existing migration edited
- [ ] **package.json** changes were made with `npm install` at the repository root and the lockfile is committed
- [ ] **Conventional commit** title; quality bar met (functions < 50 lines, files < 800 lines, nesting < 4, no debug output)

## How to verify

<!-- Commands or steps a reviewer can run. Screenshots for mobile UI (light + dark). -->
