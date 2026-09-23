# TripTrackr

A private-by-default, offline-first travel journal: trips, stops, notes, expenses, photos and
travel documents, drawn on a 3D globe of everywhere you have been — shared only when, and only
as much as, you choose. Expo/React Native client, self-hosted NestJS + PostgreSQL/PostGIS API.

The rules that outrank everything else in this repository are in
[`.specify/memory/constitution.md`](./.specify/memory/constitution.md). Read it first.

## Repository layout

```
apps/
  mobile/        Expo SDK 57 dev-client app (iOS + Android; no web target)
  api/           NestJS 11 API + BullMQ worker + SQL migrations (Dockerfile builds from the repo root)
packages/
  contracts/     @triptrackr/contracts — zod schemas shared by both apps (sync protocol, REST DTOs)
infra/           Docker Compose (dev + prod overlay), backup image, backup/restore scripts
docs/            Long-form product documents, legal sources, store-release material
specs/           Spec Kit feature specifications, plans, tasks (specification precedes code)
```

npm workspaces, one lockfile at the root. Details and rationale: `specs/001-triptrackr-mvp/plan.md`
("Project Structure") and `research.md` D-13.

## Prerequisites

| Tool                    | Version            | Notes                                                          |
| ----------------------- | ------------------ | -------------------------------------------------------------- |
| Node.js                 | 22.13+ (`.nvmrc`)  | `nvm use` / `fnm use`                                          |
| npm                     | 10.9+              | Ships with Node 22                                             |
| Docker Engine + Compose | Compose v2.24+     | Runs the backend stack; Testcontainers uses it for API tests   |
| Xcode                   | 26 (iOS 26 SDK)    | iOS dev-client builds and App Store submission                 |
| Android Studio          | current, SDK 36    | Android dev-client builds; Play requires target API 36         |
| EAS CLI                 | `npm i -g eas-cli` | Dev-client and store builds                                    |
| Maestro                 | current            | Mobile end-to-end flows, including the offline acceptance test |

## Quick start

```bash
npm ci                       # installs every workspace from the single root lockfile
cp .env.example .env         # stock values work for development; see the comments inside
npm run infra:up             # Postgres+PostGIS, Redis, MinIO, migrate, API, worker, Traefik
```

Verify: `curl -s localhost:3000/health`.

To iterate on the API with hot reload, stop the containerised copy and run it on the host
against the dockerised data stores (the `localhost` URLs in `.env` are for exactly this):

```bash
docker compose -f infra/docker-compose.yml stop api worker
npm run api                  # nest start --watch on :3000
```

Mobile — Expo Go cannot run this app (Mapbox, SQLCipher and other native modules), so build a
development client once, then start the bundler:

```bash
cd apps/mobile
eas build --profile development --platform ios      # or android; installs on device/simulator
npm run mobile                                      # from the root: expo start (dev client)
```

On a physical device set `EXPO_PUBLIC_API_URL` to your machine's LAN address, not `localhost`.

## Scripts (repository root)

| Script                    | What it does                                                            |
| ------------------------- | ----------------------------------------------------------------------- |
| `npm run mobile`          | `expo start` in `apps/mobile`                                           |
| `npm run api`             | `nest start --watch` in `apps/api`                                      |
| `npm run build`           | Builds `packages/contracts` then `apps/api`                             |
| `npm run build:contracts` | Builds only the shared contracts package                                |
| `npm run lint`            | ESLint, every workspace, zero warnings                                  |
| `npm run typecheck`       | Builds contracts, then `tsc --noEmit` in every workspace                |
| `npm run test`            | Every workspace's default test script                                   |
| `npm run format`          | `prettier --write .` — `format:check` is what CI runs                   |
| `npm run infra:up`        | `docker compose -f infra/docker-compose.yml up -d` (`infra:down` stops) |

Per-workspace scripts: `npm run <script> -w apps/api` (`test:unit`, `test:contract`,
`test:integration`, `test:privacy`, `test:cov`, `db:migrate`, `geo:import`), `-w apps/mobile`
(`test`, `test:cov`, `e2e`, `doctor`), `-w packages/contracts` (`build`, `test`).

## Testing

- **Contracts** — `npm run test -w packages/contracts`.
- **Mobile** — `npm run test:cov -w apps/mobile` (Jest + RNTL, 80% floor in `jest.config.js`);
  `npm run e2e -w apps/mobile` runs the Maestro flows, including the offline acceptance test.
- **API** — `npm run test:unit -w apps/api` needs nothing. `test:contract`, `test:integration`
  and `test:privacy` boot a real PostGIS 17 through Testcontainers, so **Docker must be running**
  — a mocked database cannot evaluate an RLS policy. `test:cov` runs everything with the 80% gate.
- **Privacy suite** — `npm run test:privacy -w apps/api` is the adversarial suite from
  `specs/001-triptrackr-mvp/contracts/data-access-policy.md` §4. It is a **required** CI job and
  must pass before any release.
- **Backups** — `infra/scripts/restore-rehearsal.sh` proves a backup restores with RLS intact;
  CI runs it on every pull request (`infra/scripts/README.md`).

CI (`.github/workflows/ci.yml`) runs lint, typecheck, formatting, all test suites, the privacy
suite, a Docker build, compose validation and the migrate → backup → restore rehearsal. Branch
protection should require the single `CI passed` check.

## Workflow

Specification precedes code. Work flows `/speckit-specify` → `/speckit-plan` → `/speckit-tasks`
→ `/speckit-implement` inside `specs/<feature>/`. Tests are written first; coverage floor 80%;
commits follow `<type>: <description>`. Social and sharing features do not begin until the
offline-sync acceptance suite passes. Operational guidance for contributors and agents is in
[`AGENTS.md`](./AGENTS.md).

## Releasing to the stores

`docs/release/store-readiness.md` is the launch checklist (Apple, Google Play, EAS, backend).
Legal sources — privacy policy, terms, account deletion page — are in `docs/legal/` and must be
published at public URLs before submission.

## Infrastructure

`infra/README.md` covers the compose stack, the two database connection strings (owner vs
`triptrackr_api`), production deployment on a single VPS, secrets, and backups.

## License

Proprietary — see [`LICENSE`](./LICENSE). All rights reserved.
