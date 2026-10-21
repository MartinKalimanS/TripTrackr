# TripTrackr: roadmap to production

Everything an engineer or an AI agent needs to take TripTrackr from the repository as it is today to a launched, operated app on the
App Store and Google Play: the plan, the specification, the full list of tools, the step-by-step procedure with a prompt for every
session, the CI/CD and release automation, the testing standard, and the operations calendar.

> **Resumen (español).** Esta carpeta es el plan completo para construir y publicar TripTrackr en producción: hoja de ruta por hitos,
> especificación del sistema, inventario de todas las herramientas y librerías, 40 pasos detallados con un prompt de IA para cada sesión
> (con control de versiones, seguridad y calidad), automatización con GitHub Actions y EAS para subir la app a Google Play y App Store,
> estrategia de pruebas y operación. Empieza por `ROADMAP.md`, sigue `STEP-BY-STEP.md` y usa `AGENT-PROMPTS.md` en cada sesión. Está
> escrito en inglés como el resto de `specs/`.

## Read in this order

| #   | File                                                             | Read it to                                                                                                                                  |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [`ROADMAP.md`](./ROADMAP.md)                                     | See where the product stands, the release trains (1.0, 1.1, 1.2), the milestones M0 to M13, gates, risks, owner decisions                   |
| 2   | [`SPECIFICATION.md`](./SPECIFICATION.md)                         | Know what is being built: product, requirements added by the stores, non-functional targets, architecture, configuration, security, privacy |
| 3   | [`STACK.md`](./STACK.md)                                         | Know every tool, library, service and version, and which are in use, planned or undecided                                                   |
| 4   | [`STEP-BY-STEP.md`](./STEP-BY-STEP.md)                           | Do the work: 40 steps with branch, goal, actions, human actions and the evidence that closes each                                           |
| 5   | [`AGENT-PROMPTS.md`](./AGENT-PROMPTS.md)                         | Start a session: the master prompt, a prompt per step, parallel, review, security, bug, hotfix, upgrade, incident, resume                   |
| 6   | [`CICD-AND-RELEASE.md`](./CICD-AND-RELEASE.md)                   | Automate and ship: branching, workflows with YAML, secrets, EAS, store runbooks, hotfix and rollback, monitoring, incident process          |
| 7   | [`TESTING-AND-QUALITY.md`](./TESTING-AND-QUALITY.md)             | Prove it: the pyramid, gates, device matrix, acceptance procedure, security checklist                                                       |
| 8   | [`PROGRESS.md`](./PROGRESS.md), [`DECISIONS.md`](./DECISIONS.md) | Keep the live state: ticks with evidence, and dated owner decisions                                                                         |

## What this folder relies on (do not duplicate; link)

- `.specify/memory/constitution.md` (principles I to V) and `AGENTS.md` (operational rules): they win over this folder.
- `specs/001-triptrackr-mvp/` (the product: spec, plan, research D-01..D-34, contracts, data model, tasks, quickstart).
- `specs/005-sunrise-passport-ui/` (the look) and its `reference/` (pictures, prototype, UI specification, UI plan).
- `docs/release/store-readiness.md` (the launch checklist) and `apps/mobile/STORE_COMPLIANCE.md`; `docs/legal/*`; `infra/README.md`.

## Start a session in four moves

1. Open `PROGRESS.md`; take the first unticked step whose dependencies are ticked.
2. New session: paste `P-MASTER`, then that step's prompt (`P-S05` for `S-05`), then `P-PARALLEL` if you split the work.
3. Review the result with `P-REVIEW` in a **fresh** session (and `P-SECURITY` if the step touches a sensitive area); merge only with `CI passed` and `Security passed`.
4. End with `P-HANDOFF`: tick the step with the PR link, record any owner decision, leave the tree clean.

## Vocabulary

| Term             | Meaning                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `M0`..`M13`      | Milestones with checkable exit criteria (`ROADMAP.md` section 3)                                  |
| `S-nn`           | A step of `STEP-BY-STEP.md`: one branch, one session (or a few parallel ones)                     |
| `P-xxx`          | A prompt in `AGENT-PROMPTS.md`                                                                    |
| `OD-n`           | An open owner decision with a recommended default (`ROADMAP.md` section 7)                        |
| `F1`..`F14`      | The UI features, approved one at a time by the owner (`specs/005-sunrise-passport-ui/reference/`) |
| `T0xx` / `T5xx`  | Task ids of `specs/001-triptrackr-mvp/tasks.md` / `specs/005-sunrise-passport-ui/tasks.md`        |
| `D-nn` / `D5-nn` | Technology decisions in the 001 / 005 `research.md`                                               |
| **HUMAN**        | An action only the owner can perform (accounts, money, legal, devices, console approvals)         |

## Upkeep

This folder is part of the product: a change to a step, a tool or a decision is made in the same PR as the change it describes. Versions and store
rules move; every runbook says what to re-verify. When an agent finds this folder wrong, it fixes the folder in its own `docs/roadmap-*` PR and says so
in the report.
