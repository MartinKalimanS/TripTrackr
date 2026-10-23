# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Working in this repository

Operational guidance for contributors and agents. It supplements
[`.specify/memory/constitution.md`](./.specify/memory/constitution.md) and must not contradict
it; where they disagree, the constitution wins.

## Layout

| Path                 | What                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `apps/mobile`        | Expo SDK 57 dev-client app (`expo-router`, typed routes). iOS + Android only.              |
| `apps/api`           | NestJS 11 API, BullMQ worker, hand-written SQL migrations in `src/db/migrations/`.         |
| `packages/contracts` | `@triptrackr/contracts` — zod schemas both apps import. Change the wire format here only.  |
| `infra/`             | Compose stack, backup image, `scripts/backup.sh` + `scripts/restore-rehearsal.sh`.         |
| `specs/`             | Spec Kit features. `001-triptrackr-mvp` is the product; `005-sunrise-passport-ui` visuals. |
| `docs/`              | Product documents, legal sources (`legal/`), store checklist (`release/`).                 |
| `docs/roadmap/`      | The plan to production: roadmap, spec, steps, session prompts, CI/CD, testing, progress.   |

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
  layer (`specs/004-app-ui-redesign/contracts/design-tokens.md`, contract C4-1). The look of
  `specs/002-neumorphic-ui` is retired: `test/no-neumorphism.test.ts` fails on any trace of it in
  `src/`. `useAppearance().tokens` is `Colors[themeName]`, which has all four themes (light, dark and
  the two contrast ones). Tabs use `expo-router` `Tabs` with a custom bar, not native tabs (D-17,
  rationale amended by research D4-06: the native module is still `unstable-` in SDK 57).
- **The look is Sunrise Passport** (feature 005, built F1 to F13; it replaces the rejected Atlas look of feature 004,
  whose structure, adapters and token pipeline stay). The pictures and the measured prototype are the
  specification: `specs/005-sunrise-passport-ui/reference/` (`README.md`, `UI-SPEC.md`, `IMPLEMENTATION-PLAN.md`,
  `screens/`, `prototype/`, and one `as-built/*.md` note per feature with its deviations and device checks).
  UI primitives come from `components/ui/*` only, and only that folder imports `heroui-native` (research D4-02,
  D4-03). **Owner rule Q-11:** a control the pictures draw for a capability the app does not have (search, share,
  more, settings, budget, formatting) is drawn as pictured through `components/ui/coming-soon-button.tsx`: one
  toast, no navigation, no write, never invented data. Do not add a dead control any other way, and do not
  reintroduce neumorphism (`test/no-neumorphism.test.ts`). Hermes has no `Intl.PluralRules`: use `countParts`.
- **Test kits that guard the look.** `test/scale/` (reflow at 1, 1.15, 1.5, 2 and the fixed-height ratchet with
  its allow-list), `test/a11y/` (reading order per screen, decorative art hidden, reach-all lists, final values),
  `test/appearance/` (every screen in four themes, reduced transparency and motion, live switching, the
  translucent-surface allow-list), `test/theme/` (contrast gate, token sync) and the testID/label parity check
  (`scripts/testid-baseline.mjs`). A new screen joins them.
- **Navigation chrome (features 004 and 005).** `(tabs)/trips` and `(tabs)/profile` are nested stacks;
  `trip/[id]` is a stack whose screens ALL draw their own bar (the hero's transparent header, then
  `AreaHeader` for photos, spending, notes, documents and offline maps, the viewer's close bar), so no native
  sub-screen header remains; Back is `HeaderBackButton` so `tapOn: 'Back'` resolves. The `modal` group is ONE
  `formSheet` presented by the root stack (`formSheetOptions`) with no header, no nested navigator (Android
  limits) and a `Slot` layout.
- **Forms are sheets.** A router form is a route under `modal/` built on `FormSheet` (title, scrolling
  keyboard-aware body, sticky `FormActions` footer above the keyboard); a state-driven form is a
  `FormSheet host="modal"` inside a `FormModal`. Every form has a keyboard-visibility test written
  with `test/helpers/keyboard.ts` (contract C4-10 rule 8; `contracts/components.md`, "As built (T434,
  T438 pattern)").
- Local writes go to the SQLCipher-encrypted SQLite store first; the network is a background
  reconciler. A record is not "saved" until its bytes are uploaded.
- **The globe** (research D-30) is ONE `MapView` in `components/globe/globe-view.tsx`; User Story 4
  extends it rather than adding a second map. Its arcs, markers and statistics derive on the device
  from the local store (`features/globe/`), never from `GET /trips/:id/arcs`. Great-circle geometry
  comes from `features/globe/great-circle.ts`: do not re-add `@turf/great-circle` (defective at the
  date line and poles). Map colours are the `GlobeColors` tokens with their own contrast gate; no
  map mounts before `useMapboxReady()` says `ready` (token set, telemetry off).
- **The home is always the globe** (feature 003): it is mounted with no trips, with trips but no stop
  and when the store cannot be read; a flat bordered card (`empty-state.tsx`, contract C12) floats over
  it instead of replacing it. The legs between trips are a second, non-tappable source derived by
  `features/globe/journey.ts` and drawn under the trip arcs in the past style. The tab bar is a floating
  pill (`TabBar`, one `Tappable` per tab; a tab may have a surface, feature 005 amends 003 FR-013 to
  FR-015): keep its testIDs.
- Mapbox under Jest: `jest.setup.ts` turns each Mapbox component into a View tagged
  `mapbox-<Kind>-<id>` carrying its props (a layer's `style` arrives as `layerStyle`), so suites
  read a source's `shape` or fire its `onPress`. To assert on a component's own timer, spy on
  `setInterval`: `jest.getTimerCount()` also counts React's internal timers.

## Libraries — use these, do not hand-roll (research D-21..D-29)

| Need                        | Use                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| A form                      | `react-hook-form` + `zodResolver(schema from @triptrackr/contracts)`; copy via `apps/mobile/src/lib/form-copy.ts`        |
| Drag to reorder             | `react-native-sortables` (`Sortable.Grid`/`Sortable.Flex`); keep buttons as the accessible path                          |
| An unbounded list           | `@shopify/flash-list` as the scroll container (`components/ui/list-screen.tsx`), never nested in `Screen`                |
| A form under the keyboard   | `FormSheet` (`components/ui/form-sheet.tsx`): `KeyboardAwareScrollView` body, sticky footer; provider in the root layout |
| Date arithmetic             | `date-fns` on `YYYY-MM-DD` strings via `features/trips/stop-dates.ts` helpers — local calendar day, never UTC            |
| Money arithmetic            | `decimal.js` — never `Number` on an amount or a rate (SC-016). Wire and DB carry decimal strings / `NUMERIC`             |
| Locale, decimal separator   | `expo-localization` `getLocales()`; format with `Intl`                                                                   |
| A recurring server job      | BullMQ job scheduler (`upsertJobScheduler`) in `apps/api/src/common/queue/`, not `setInterval` or `@nestjs/schedule`     |
| Expense categories          | System rows are `SYSTEM_EXPENSE_CATEGORIES` in contracts (fixed ids, seeded by migration 0009)                           |
| UI components (feature 005) | `heroui-native` on `uniwind` via `components/ui/` only (T409); icons: Phosphor; Home sheet: custom `ui/sheet.tsx`        |
| Photo zoom, swipe           | `react-native-zoom-toolkit` `Gallery`, only inside `components/ui/photo-viewer.tsx`                                      |
| Glass, blur, haptics        | `expo-glass-effect`, `expo-blur`, `expo-haptics`, each behind an adapter that honours reduced motion and transparency    |
| Rasterise a stamp page      | `react-native-view-shot` (`captureRef`), from 100 stamps up (`components/profile/`)                                      |

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
- **Trying the app on a phone (Windows):** `run-on-phone.cmd` / `scripts/run-on-phone.ps1` (see
  `apps/mobile/README.md`). `-Check` is read-only. It picks the USB tunnel on a Public Windows
  network and the Wi-Fi address otherwise. The script is ASCII-only on purpose: Windows PowerShell
  5.1 misreads UTF-8 without a BOM. `*.cmd` files are CRLF via `.gitattributes`.
- **Metro over the USB tunnel must listen on IPv4.** `adb reverse` reaches the PC at `127.0.0.1`, but
  Node 24 resolves `localhost` to `::1` first, so `expo start --localhost` binds IPv6 only and the
  phone's request is accepted then dropped ("unexpected end of stream"). The script starts Metro with
  `NODE_OPTIONS=--dns-result-order=ipv4first`; start it by hand the same way. Metro's `/status` has
  no content type, so Windows PowerShell 5.1 returns the body as bytes: `Test-Http` decodes it.
- **Offline-sync gate (T140/T141):** the Maestro suite is dispatched in phases across two devices;
  the ordered run and the row-to-file table are in `apps/mobile/e2e/offline/README.md`. Build the
  dev client against the API over the network (LAN address, or `10.0.2.2` on an emulator), never
  through `adb reverse`, which survives airplane mode and silently turns "offline" steps online.
  Nothing there counts as passing until a real two-device run is recorded in `gate-evidence.md`.
- **Tombstone purge (T129):** a daily BullMQ scheduler in the worker calls the two keyholes of
  migration 0013 (SECURITY DEFINER functions) inside one transaction, removing a row's bytes before
  the row. The 90-day floor lives in the SQL (`GREATEST`) and in `TOMBSTONE_RETENTION_DAYS`.
- **Object storage (research D-31):** RustFS replaced MinIO, whose public images were withdrawn in
  2026-09. It runs in `infra/docker-compose.yml` (buckets created by an `rclone` one-shot) and as a
  second Testcontainers service in the API's database projects (`apps/api/test/setup.ts`), which
  create both buckets. Against RustFS, `S3_REGION` is `us-east-1`; a phone needs signed URLs for a
  host it can reach, so set `S3_PUBLIC_ENDPOINT` to this machine's LAN address to test uploads.
