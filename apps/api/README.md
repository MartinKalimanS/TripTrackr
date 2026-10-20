# TripTrackr API

NestJS 11 on Node.js 22, PostgreSQL 17 + PostGIS, Redis, S3-compatible object storage.
The authority on what this service must do is `specs/001-triptrackr-mvp/`; the
authority on who may read what is `specs/001-triptrackr-mvp/contracts/data-access-policy.md`,
enforced by PostgreSQL row-level security rather than by anything in this directory.

## Run

From the repository root:

```sh
npm run build -w packages/contracts      # the API compiles against its dist
npm run db:migrate -w apps/api           # owner role; also sets the API role's password
npm run start:dev -w apps/api            # http://localhost:3000
```

`start:dev`, `db:migrate` and `geo:import` load the repository-root `.env` themselves
(Node's `--env-file`), so nothing needs exporting first. A variable already set in the shell
wins over the file, which is how CI supplies its own. `start:dev` needs the file
(`cp .env.example .env`); the other two carry on without it.

`GET /health` answers `{ "status": "ok" }` once the database does. Every other
route lives under `/v1` (contracts/README.md).

## Environment

Validated at boot by `src/common/config/env.schema.ts`; a missing value stops the
process with every problem listed at once. The two database variables are the
ones most worth understanding (research D-20):

| Variable                 | Role                                                          | Used by                                 |
| ------------------------ | ------------------------------------------------------------- | --------------------------------------- |
| `DATABASE_URL`           | `triptrackr_api` — non-superuser, owns nothing, `NOBYPASSRLS` | the API process and the worker          |
| `MIGRATION_DATABASE_URL` | the database owner (superuser or `BYPASSRLS`)                 | `db:migrate` and the geography import   |
| `API_DB_PASSWORD`        | password the migration runner installs on `triptrackr_api`    | `db:migrate`; must match `DATABASE_URL` |

Pointing `DATABASE_URL` at the owner leaves every policy in place and silently
stops enforcing them. Adversarial test 17 (`test/privacy/catalogue.spec.ts`)
asserts `current_user` from inside the API's own pool for exactly that reason.

Everything else — `REDIS_URL`, the two JWT secrets, the S3 endpoint and buckets,
`DOCUMENT_MASTER_KEY`, the third-party keys — is listed with its purpose in
`env.schema.ts`. The API boots without Redis (the client connects lazily and the
rate limiter fails open, loudly); it does not boot without PostgreSQL.

## Migrations

Hand-written SQL in `src/db/migrations/`, applied in lexical order by
`src/db/migrate.ts`, one transaction per file, recorded in `schema_migrations`.
Drizzle Kit (`npm run db:generate`) is a diff tool only: its output is reviewed
and edited before it becomes a migration, and the schema in `src/db/schema/` is
kept in step with the SQL by hand so that a generate is a no-op.

The runner connects with `MIGRATION_DATABASE_URL`, refuses to proceed if that
turns out to be the API role, and finishes by setting `API_DB_PASSWORD` on
`triptrackr_api`. Migration 0007 additionally requires the connecting role to
bypass RLS — the `SECURITY DEFINER` auth functions it owns depend on it — and
says so if it does not.

Policies (0004, 0005, 0007) are never generated. They are the privacy layer and
are reviewed as SQL.

## Tests

Four Jest projects (`jest.config.js`), run separately because they cost and
prove different things:

| Script                     | What it needs | What it proves                                                                    |
| -------------------------- | ------------- | --------------------------------------------------------------------------------- |
| `npm run test:unit`        | nothing       | services in isolation; the whole module graph booted against stand-ins            |
| `npm run test:contract`    | Docker        | the HTTP surface as it ships — health, the error envelope — on a real database    |
| `npm run test:integration` | Docker        | the fixture, and the SQL-level guarantees (atomic token rotation)                 |
| `npm run test:privacy`     | Docker        | the adversarial suite: rows 13–20 of data-access-policy.md §4, run as an attacker |

The three database suites start one PostGIS container through Testcontainers
(`test/setup.ts`), which exports both connection strings exactly as a deployment
would. There is no mocked-database path: a policy is only real when the real
engine evaluates it (Constitution III). `test:privacy` is a required CI job.

Also: `npm run typecheck`, `npm run lint`, `npm run build`.

## Layout

```
src/
  main.ts                 bootstrap: env, Sentry, configureApp, listen
  app.setup.ts            the HTTP surface: logger, helmet, CORS, body limit, /v1 prefix
  app.module.ts           every infrastructure module, the global filter and rate limiter
  common/
    auth/                 JwtAuthGuard, @Public(), the pinned token algorithm
    config/               env schema
    db/                   the pool (API role), Drizzle, the soft-delete scope
    rls/                  the per-request transaction and SET LOCAL app.current_user_id
    guards/               per-account rate limiting
    filters/              the one error shape
    redis/  queue/  storage/  crypto/  logging/
  db/
    migrate.ts            the runner
    migrations/           the SQL, in order
    schema/               Drizzle mirror of the SQL
    geo-catalogue.ts      GeoNames import (owner role)
  modules/
    auth/                 token issue, rotation, revocation
    health/               GET /health
  workers/main.ts         BullMQ consumers, a separate process
test/
  unit/  contract/  integration/  privacy/  support/
```
