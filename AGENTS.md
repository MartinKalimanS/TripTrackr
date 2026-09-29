# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Working in this repository

Operational guidance for contributors and agents. It supplements
[`.specify/memory/constitution.md`](./.specify/memory/constitution.md) and must not contradict
it; where they disagree, the constitution wins.

## Layout

| Path                 | What                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `apps/mobile`        | Expo SDK 57 dev-client app (`expo-router`, typed routes). iOS + Android only.             |
| `apps/api`           | NestJS 11 API, BullMQ worker, hand-written SQL migrations in `src/db/migrations/`.        |
| `packages/contracts` | `@triptrackr/contracts` — zod schemas both apps import. Change the wire format here only. |
| `infra/`             | Compose stack, backup image, `scripts/backup.sh` + `scripts/restore-rehearsal.sh`.        |
| `specs/`             | Spec Kit features. `001-triptrackr-mvp` is the product; `002-neumorphic-ui` the visuals.  |
| `docs/`              | Product documents, legal sources (`legal/`), store checklist (`release/`).                |

## Commands

```bash
npm ci                                   # ALWAYS at the repository root (single lockfile)
npm run lint && npm run typecheck        # every workspace
npm run test -w packages/contracts
npm run test:cov -w apps/mobile          # 80% floor enforced by jest.config.js
npm run test:unit -w apps/api            # no Docker needed
npm run test:integration -w apps/api     # Testcontainers: Docker MUST be running
npm run test:privacy -w apps/api         # adversarial suite — required before any release
npm run db:migrate -w apps/api           # owner URL + API_DB_PASSWORD, from the root .env
npm run start:dev -w apps/api            # API on :3000, also configured by the root .env
npm run infra:up                         # dev stack; infra/README.md for production
```

The API's `start:dev`, `db:migrate` and `geo:import` load the root `.env` themselves (Node's
`--env-file`); a variable already set in the shell wins. Expo does not read it: the app's
`EXPO_PUBLIC_*` values belong in `apps/mobile/.env.local` (`apps/mobile/README.md`).

Do not run `npm run test -w apps/api` (or `test:cov`, `test:contract`, `test:integration`,
`test:privacy`) without Docker: those projects boot a real PostGIS and have no mock path.

Running the API suites locally:

- Run the database projects **one invocation at a time** (e.g.
  `npx jest --selectProjects integration --maxWorkers=4` from `apps/api`). Three concurrent
  invocations starve ts-jest's type-aware transform and time out `beforeAll` hooks: whole files
  fail with no real regression.
- On Windows, filter by a path **regex fragment** (`npx jest --selectProjects unit -- fx-refresh`);
  a slash path never matches the backslashed paths.
- CI's private-repo runners have 2 vCPUs, so Jest picks one worker. `workerIdleMemoryLimit` in
  `apps/api/jest.config.js` and the CI job's `NODE_OPTIONS=--max-old-space-size=4096` keep the
  suite inside V8's heap. Reproduce CI with `npx jest --coverage --maxWorkers=1`.

## Spec precedes code

Work flows `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`. If
the behaviour you are about to build is not described in `specs/<feature>/spec.md`, stop and
specify it first. Specs describe user-visible behaviour; technology decisions live in `plan.md`
and `research.md` (decisions are numbered `D-nn` — cite them).

## Gates that are not negotiable

- **Offline-sync gate.** No social or sharing feature (follows, feed, discovery, public
  profiles) starts until the sync acceptance suite in `specs/001-triptrackr-mvp/quickstart.md`
  §5 passes against real multi-device, interrupted-connectivity tests.
- **Test-first, 80%.** Write the failing test, then the code. Coverage below 80% fails CI in
  every workspace.
- **Privacy suite is a required CI job.** Never `continue-on-error`, never skipped.
- **Security review** for anything touching auth, authorisation, user input, database queries
  or migrations, file handling, external calls, cryptography, payments.

## Privacy invariants (Constitution I)

- `expenses` and `documents` have **no visibility flag** and **no public-read policy**. Adding
  either is a constitutional violation, not a feature.
- **RLS is the authority.** Every owned table has `ENABLE` + `FORCE ROW LEVEL SECURITY`;
  policies live in hand-written SQL migrations, never in Drizzle DSL. Application filtering is
  convenience on top.
- **The API connects as `triptrackr_api`** (`DATABASE_URL`). Only the migration runner uses the
  owner (`MIGRATION_DATABASE_URL`). The role's password is `API_DB_PASSWORD`, applied by the
  migration runner. Never "fix" a connection error by handing the API the owner URL.
- Every new table, endpoint or screen that touches traveller data states its visibility posture
  in the PR. "Not exposed yet" is not a posture.
- Sentry: no Session Replay, no Feedback widget, `sendDefaultPii: false` (research D-18).

## Mobile rules

- Consult `https://docs.expo.dev/versions/v57.0.0/` for every Expo API; do not recall shapes.
- Expo Go cannot run this app. Use a dev-client build (`eas build --profile development`).
- **No web target** (research D-14): do not re-add `react-native-web`, `react-dom`, `*.web.tsx`
  or a `web` output. iOS and Android only.
- **No raw colour literals in screens or components** — every visual value comes from the token
  layer (`specs/002-neumorphic-ui/contracts/design-tokens.md`, contract C1). Tabs use
  `expo-router` `Tabs` with a custom bar, not native tabs (D-17).
- Local writes go to the SQLCipher-encrypted SQLite store first; the network is a background
  reconciler. A record is not "saved" until its bytes are uploaded.
- **The globe** (research D-30) is ONE `MapView` in `components/globe/globe-view.tsx`; User Story 4
  extends it rather than adding a second map. Its arcs, markers and statistics derive on the device
  from the local store (`features/globe/`), never from `GET /trips/:id/arcs`. Great-circle geometry
  comes from `features/globe/great-circle.ts`: do not re-add `@turf/great-circle` (defective at the
  date line and poles). Map colours are the `GlobeColors` tokens with their own contrast gate; no
  map mounts before `useMapboxReady()` says `ready` (token set, telemetry off).
- Mapbox under Jest: `jest.setup.ts` turns each Mapbox component into a View tagged
  `mapbox-<Kind>-<id>` carrying its props (a layer's `style` arrives as `layerStyle`), so suites
  read a source's `shape` or fire its `onPress`. To assert on a component's own timer, spy on
  `setInterval`: `jest.getTimerCount()` also counts React's internal timers.

## Libraries — use these, do not hand-roll (research D-21..D-29)

| Need                      | Use                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| A form                    | `react-hook-form` + `zodResolver(schema from @triptrackr/contracts)`; copy via `apps/mobile/src/lib/form-copy.ts`    |
| Drag to reorder           | `react-native-sortables` (`Sortable.Grid`/`Sortable.Flex`); keep buttons as the accessible path                      |
| An unbounded list         | `@shopify/flash-list` as the scroll container (`components/ui/list-screen.tsx`), never nested in `Screen`            |
| A form under the keyboard | `KeyboardAwareScrollView` from `react-native-keyboard-controller` (provider is in the root layout)                   |
| Date arithmetic           | `date-fns` on `YYYY-MM-DD` strings via `features/trips/stop-dates.ts` helpers — local calendar day, never UTC        |
| Money arithmetic          | `decimal.js` — never `Number` on an amount or a rate (SC-016). Wire and DB carry decimal strings / `NUMERIC`         |
| Locale, decimal separator | `expo-localization` `getLocales()`; format with `Intl`                                                               |
| A recurring server job    | BullMQ job scheduler (`upsertJobScheduler`) in `apps/api/src/common/queue/`, not `setInterval` or `@nestjs/schedule` |
| Expense categories        | System rows are `SYSTEM_EXPENSE_CATEGORIES` in contracts (fixed ids, seeded by migration 0009)                       |

Native modules (`flash-list`, `keyboard-controller`, `expo-localization`) follow the SDK 57 pin in
`node_modules/expo/bundledNativeModules.json`; check it before bumping.

## Repository hygiene

- **Never edit a `package.json` by hand without then running `npm install` at the ROOT** and
  committing `package-lock.json`. Never run `npm install` inside a workspace directory.
- **Secrets** live in the root `.env` (gitignored) and, in production, `infra/secrets/`. Never
  commit, log, or bake them into an image. New variables go into `.env.example` and are
  validated in `apps/api/src/common/config/env.schema.ts`. `EXPO_PUBLIC_*` is public.
- **Migrations** are new, numbered files under `apps/api/src/db/migrations/`. Never edit an
  applied migration; never hand-edit a production schema.
- **Commits**: conventional format `<type>: <description>`. Code review before any commit to a
  shared branch.
- **Quality bar**: functions < 50 lines, files < 800 lines, nesting < 4, errors handled
  explicitly, no debug output, prefer new values over mutation.
- **Formatting**: `npm run format` (Prettier, single quotes, width 90). CI runs `format:check`.
  Prettier reads `(`, `)`, `[`, `]` in a path as glob syntax, so route files need character
  classes: `npx prettier --write "src/app/[(]auth[)]/login.tsx" "src/app/trip/[[]id[]]/index.tsx"`.
- **Jest module factories**: `jest.mock(...)` factories may only reference names prefixed `mock`,
  and babel-plugin-jest-hoist also counts type-alias names and function-type parameter names
  inside the factory. Name those types `Mock…` and leave function-type parameters unnamed
  (`(...args: unknown[]) => void`), as the Mapbox stand-in in `apps/mobile/jest.setup.ts` does.
- **Do not touch** `docs/travelappblueprint.md` or `docs/travelappfullspec.md`; they are
  preserved verbatim.

## Infrastructure notes

- Backups are not backups until restored: `infra/scripts/restore-rehearsal.sh` monthly and before
  every release (`infra/scripts/README.md`). CI runs it on every PR.
- Redis runs with `maxmemory-policy noeviction` because BullMQ jobs must never be evicted.
- Store submission checklist: `docs/release/store-readiness.md`.
- **Object storage (research D-31):** RustFS replaced MinIO, whose public images were withdrawn in
  2026-09. It runs in `infra/docker-compose.yml` (buckets created by an `rclone` one-shot) and as a
  second Testcontainers service in the API's database projects (`apps/api/test/setup.ts`), which
  create both buckets. Against RustFS, `S3_REGION` is `us-east-1`; a phone needs signed URLs for a
  host it can reach, so set `S3_PUBLIC_ENDPOINT` to this machine's LAN address to test uploads.
