# infra

Self-hosted backend for TripTrackr: one Docker Compose project that runs on a laptop and,
with the production overlay, on a single 4 GB VPS. No hyperscaler-managed service is
required anywhere (constitution, Technology & Platform Constraints).

```
infra/
├── docker-compose.yml        # development stack
├── docker-compose.prod.yml   # production overrides (TLS, limits, secrets, backup)
├── backup/Dockerfile         # pg_dump 17 + rclone image for the backup service
├── scripts/                  # backup.sh, restore-rehearsal.sh, … (see scripts/README.md)
└── secrets/                  # production secret files — gitignored (see secrets/README.md)
```

## Services

| Service               | Image                                          | Role                                                                           |
| --------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `postgres`            | `postgis/postgis:17-3.5`                       | The database. RLS is the privacy authority.                                    |
| `redis`               | `redis:7.4.11-alpine`                          | Sessions, rate limits, planner cache, BullMQ. `noeviction` — see the comment.  |
| `rustfs`              | `rustfs/rustfs:1.0.0` (digest-pinned)          | S3-compatible storage, development only (research D-31). Private buckets.      |
| `rustfs-volume-owner` | `rclone/rclone:1.75.1` (digest-pinned)         | One-shot: gives RustFS's UID 10001 its data volume.                            |
| `rustfs-init`         | `rclone/rclone:1.75.1` (digest-pinned)         | Creates the two private buckets once.                                          |
| `migrate`             | `triptrackr-api:local` (built from `apps/api`) | One-shot: applies SQL migrations as the **owner**, sets the API role password. |
| `api`                 | `triptrackr-api:local`                         | NestJS API, connects as `triptrackr_api`.                                      |
| `worker`              | `triptrackr-api:local`                         | BullMQ consumer, connects as `triptrackr_api`.                                 |
| `traefik`             | `traefik:v3.7.13`                              | Edge: TLS, HTTP→HTTPS, security headers, coarse rate limit.                    |
| `backup`              | `triptrackr-backup:local` (prod only)          | Nightly `pg_dump`, checksums, optional off-box copy.                           |

Signed photo URLs are issued for `S3_PUBLIC_ENDPOINT` when it is set (research D-31): to test
uploads from a phone against the dev stack, set it to `http://<this machine's LAN IP>:9000` and
`S3_REGION=us-east-1` in `.env`.

The API image is built once (by `api`, from the **repository root** so `packages/contracts`
is in the context) and reused by `migrate` and `worker` through a YAML anchor.

## Two connection strings — the rule that matters most

| Variable                 | Role                                  | Handed to                            |
| ------------------------ | ------------------------------------- | ------------------------------------ |
| `MIGRATION_DATABASE_URL` | database owner                        | `migrate` only                       |
| `DATABASE_URL`           | `triptrackr_api` (non-superuser, RLS) | `api`, `worker`                      |
| `API_DB_PASSWORD`        | password the migration runner applies | `migrate`, and inside `DATABASE_URL` |

RLS does not apply to a superuser or a table owner. Handing the API the owner URL disables
every privacy policy while every behavioural test keeps passing
(`specs/001-triptrackr-mvp/contracts/data-access-policy.md` §1, research D-20). Compose
therefore sets these per service in `environment:`, which wins over `env_file`. Never "fix" a
connection problem by giving `api` the owner URL.

The API's startup schema declares **only** `DATABASE_URL`; the owner's URL and `API_DB_PASSWORD`
live in a separate schema that only the migration runner and the geography import load
(`apps/api/src/common/config/env.schema.ts`, `loadMigrationEnv`). `api` and `worker` therefore
have no slot for the owner's credentials at all — a `.env` that carries `MIGRATION_DATABASE_URL`
for host-side migrations is inert inside those containers because nothing reads it. CI asserts
this wiring on the merged production config (`compose-validate`).

## Development

```bash
cp .env.example .env          # stock values work out of the box
npm run infra:up              # docker compose --env-file .env -f infra/docker-compose.yml up -d
npm run infra:logs            # follow api + worker
curl -s localhost:3000/health
```

`.env` is loaded into the containers with `env_file`; the `localhost` URLs in it are for
running the API on the host, and Compose overrides them with service hostnames inside the
network. Compose's own `${VAR}` interpolation, however, reads a `.env` in **`infra/`**, not the
repository root — so if you change `POSTGRES_PASSWORD` or `API_DB_PASSWORD` in `.env`, run
Compose with `--env-file .env` from the root so both sides agree:

```bash
docker compose --env-file .env -f infra/docker-compose.yml up -d
```

Reset everything, including data: `docker compose -f infra/docker-compose.yml down -v`.

### Geo catalogue

The country/city picker needs the GeoNames extracts loaded once (and refreshed occasionally). The
data is CC BY 4.0; the in-app About sheet carries the attribution.

**1. Download and fingerprint the extracts** (GeoNames re-publishes them, so a pinned checksum would
go stale within days; record the one you imported instead):

```bash
mkdir -p data && cd data
curl -fLO https://download.geonames.org/export/dump/countryInfo.txt
curl -fLO https://download.geonames.org/export/dump/cities15000.zip && unzip -o cities15000.zip
sha256sum countryInfo.txt cities15000.txt        # keep these lines in the release notes
wc -l countryInfo.txt cities15000.txt            # about 250 countries, about 26,000 cities
cd ..
```

**2. Import** (from the repository root; `MIGRATION_DATABASE_URL` is read from the root `.env`;
the script runs with `apps/api` as its working directory, so pass absolute paths, `$PWD` expands in
bash and PowerShell alike):

```bash
npm run geo:import -w apps/api -- --countries "$PWD/data/countryInfo.txt" --cities "$PWD/data/cities15000.txt"
# Imported 250 countries and 25xxx cities in 9.4s (N rows skipped).
```

The import connects as the **owner** (it alters reference tables). In development 5432 is
published. In production it is not: run the import from the host over an SSH tunnel to the
container (`ssh -L 5432:127.0.0.1:5432` after publishing it on the loopback only in a local override
file), then remove the override. It is **idempotent**: every row is upserted on its natural key
(`iso_code`, `geoname_id`), so a monthly refresh updates in place and `cities.id` stays stable, which
a traveller's stops depend on. A non-zero exit means a partial catalogue: just run it again.
`test/integration/geo-import.spec.ts` pins that behaviour on a tiny fixture in CI.

**3. Verify** that the API serves it (non-empty is the store-readiness check):

```bash
curl -fsS https://$API_HOST/v1/countries | node -e "let b='';process.stdin.on('data',d=>b+=d).on('end',()=>console.log(JSON.parse(b).countries.length))"
```

Packaging the import into the API image as a one-shot command is a follow-up (S-26).

## Production (single VPS)

Prerequisites: Docker Engine with Compose **v2.24+** (`!reset` tag), a DNS `A` record for
`API_HOST`, ports 80/443 open, an S3-compatible bucket for objects (Cloudflare R2) and, ideally,
a second one in another provider for backups.

```bash
git clone <repo> triptrackr && cd triptrackr
cp .env.example .env && $EDITOR .env      # every production value; no defaults are honoured
# generate infra/secrets/*.txt — see infra/secrets/README.md
docker compose --env-file .env \
  -f infra/docker-compose.yml -f infra/docker-compose.prod.yml up -d --build
docker compose --env-file .env -f infra/docker-compose.yml -f infra/docker-compose.prod.yml ps
```

What the overlay changes: no default passwords (`${VAR:?}` fails loudly), no published ports
except Traefik's 80/443, Let's Encrypt via TLS-ALPN, permanent HTTP→HTTPS redirect, HSTS and
friends, `NODE_ENV=production`, memory/CPU ceilings (postgres 1.5 GB, api 512 MB, worker
512 MB, redis 256 MB, backup 256 MB, traefik 128 MB), Postgres tuned to its ceiling, RustFS not
started, and the `backup` service.

Deploying a new version:

```bash
git pull
docker compose --env-file .env -f infra/docker-compose.yml -f infra/docker-compose.prod.yml \
  up -d --build          # rebuilds the image, re-runs migrate, restarts api and worker
```

`migrate` runs before `api` and `worker` start (`service_completed_successfully`). A failed
migration stops the rollout; the previous containers keep serving.

## Backups

Nightly at `BACKUP_AT` (default 03:00 UTC) into the `postgres-backups` volume, shipped off-box
when `BACKUP_S3_*` is set. The container reports **unhealthy** if no backup has succeeded in
48 hours. The restore rehearsal — monthly and before every release — is described in
[`scripts/README.md`](./scripts/README.md). A backup that has never been restored from is not
a backup.

## Secrets

Development: values live in the root `.env` (gitignored). Production: the same, plus the files
in `infra/secrets/` mounted at `/run/secrets/*`.

**Follow-up (not done — do not claim otherwise):** the API reads plain environment variables
and has no `*_FILE` support, so the mounted secret files are not consumed yet. Closing the gap:

1. In `apps/api/src/common/config/env.schema.ts`, before parsing, for each of
   `DATABASE_URL`-password, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DOCUMENT_MASTER_KEY`:
   if `<NAME>_FILE` is set, read the file and populate `<NAME>` (fail loudly if unreadable).
2. In `docker-compose.prod.yml`, set `JWT_ACCESS_SECRET_FILE=/run/secrets/jwt_access_secret`
   etc. on `api`/`worker`, switch `postgres` to `POSTGRES_PASSWORD_FILE`, and build the two
   database URLs from `/run/secrets/*` in a tiny entrypoint wrapper (or add
   `DATABASE_PASSWORD_FILE` support to the API).
3. Remove the secret values from the production `.env`.

Until then the production `.env` is the source of truth and **must match** the files.

## Known limitations and accepted risks

- **Traefik mounts the Docker socket** (read-only). That is root-equivalent on the host if
  Traefik is compromised. Acceptable on a single-tenant VPS; the mitigation is a socket proxy
  (e.g. `tecnativa/docker-socket-proxy`) in front of it — follow-up.
- **Worker healthcheck is disabled.** The API image's `HEALTHCHECK` probes `:3000`, which the
  worker does not serve. Re-enable once the worker exposes a liveness signal.
- **`/health` must exist.** The Dockerfile, the compose healthcheck and Traefik's load-balancer
  check all probe `GET /health` on the API.
- **Access logs are off** at the edge. Turn on `--accesslog` with header dropping if you need
  them; remember they contain traveller IPs.
- **Single box.** Postgres, Redis and the API share one failure domain. The backup + rehearsal
  loop is the recovery story; there is no hot standby.
