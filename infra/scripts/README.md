# infra/scripts

Operational scripts for the TripTrackr backend. Everything here is plain bash and runs
either on a host with Docker or inside the image built from `infra/backup/Dockerfile`.

| Script                    | Purpose                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `backup.sh`               | `pg_dump -Fc` → gzip → sha256 → prune → optional off-box upload. Exits non-zero on any failure.            |
| `backup-loop.sh`          | Scheduler around `backup.sh` for the compose `backup` service (daily at `BACKUP_AT` UTC).                  |
| `backup-healthcheck.sh`   | Container HEALTHCHECK: unhealthy when the newest successful backup is older than `BACKUP_MAX_AGE_HOURS`.   |
| `restore-rehearsal.sh`    | Restores a dump into a throwaway database and asserts schema, migrations ledger and RLS. Prints PASS/FAIL. |
| `import-geo-catalogue.ts` | Loads the GeoNames country/city catalogue (run via `npm run geo:import -w apps/api`).                      |

## Why two scripts

The constitution is explicit: _"Backups MUST be verified by performing an actual restore. A
backup that has never been restored from is not a backup."_ `backup.sh` produces files;
`restore-rehearsal.sh` is what turns those files into a backup. Neither is optional.

## Targets (spec SC-020)

| Objective             | Target | How it is met                                                                                     |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| RPO (data at risk)    | 24 h   | Nightly dump at `BACKUP_AT` (default 03:00 UTC). Tighten by lowering the interval if churn grows. |
| RTO (time to restore) | 1 h    | The rehearsal times the restore and fails above `RESTORE_RTO_SECONDS` (default 3600).             |

## Cadence

| When                           | What                                                              | Evidence                                 |
| ------------------------------ | ----------------------------------------------------------------- | ---------------------------------------- |
| Nightly (automatic)            | `backup` service runs `backup.sh`; ships off-box if `BACKUP_S3_*` | `docker compose ps backup` shows healthy |
| Monthly (manual, calendar it)  | `restore-rehearsal.sh` against the newest **off-box** copy        | PASS line pasted into the ops log        |
| Before every store release     | `restore-rehearsal.sh` — a launch-blocking checklist item         | `docs/release/store-readiness.md`        |
| Every pull request (automatic) | CI job `backup-rehearsal`: migrate → backup → restore → assert    | required check `CI passed`               |

## Running a backup by hand

Inside the stack (production overlay), which has pg_dump 17 and `rclone`:

```bash
docker compose --env-file .env -f infra/docker-compose.yml -f infra/docker-compose.prod.yml \
  run --rm backup backup.sh
```

On any host whose `pg_dump` major version matches the server (17):

```bash
BACKUP_DATABASE_URL=postgresql://triptrackr:...@localhost:5432/triptrackr \
BACKUP_DIR=./backups infra/scripts/backup.sh
```

`pg_dump` must connect as the **owner** (`MIGRATION_DATABASE_URL`'s role). The API role is
subject to row-level security, and `pg_dump` refuses to produce a dump a policy would filter.

## Running the restore rehearsal

From a laptop or the VPS with Docker (no local PostgreSQL tools needed):

```bash
infra/scripts/restore-rehearsal.sh                      # newest dump in ./backups or /backups
infra/scripts/restore-rehearsal.sh path/to/triptrackr-20260901T030000Z.dump.gz
```

Against an existing scratch server (CI does this; never point it at production):

```bash
RESTORE_TARGET_URL=postgresql://postgres:pw@localhost:5433/postgres \
  infra/scripts/restore-rehearsal.sh path/to/dump.gz
```

Rehearse from the **off-box** copy at least once a quarter — pull it back with
`rclone copy offsite:<bucket>/triptrackr/<file> ./backups/`, using the same
`RCLONE_CONFIG_OFFSITE_*` variables as `backup.sh` with a key that can read — so the thing
being verified is the copy that would survive losing the server.

## Off-box copies

Set in `.env` (see `.env.example`, section "Backups"):

```
BACKUP_S3_ENDPOINT=https://s3.eu-central-003.backblazeb2.com   # or your R2 endpoint
BACKUP_S3_BUCKET=triptrackr-backups
BACKUP_S3_ACCESS_KEY_ID=...
BACKUP_S3_SECRET_ACCESS_KEY=...
```

Use a key that can **write but not delete** (B2 "writeFiles" without "deleteFiles"; R2 an
object-write-only token) so a compromised box cannot destroy its own history. Bucket lifecycle
rules do the pruning off-box; `BACKUP_RETENTION_DAYS` only governs the local copy. The key pair
reaches `rclone` through `RCLONE_CONFIG_OFFSITE_*` environment variables, never a config file,
and uploads skip the bucket check, the destination check and the post-upload HEAD, so a
write-only key is enough.

## Executable bits on Windows

`.gitattributes` forces LF line endings, and the backup image runs `sed`/`chmod` at build time,
so a Windows checkout cannot break the container. To make the scripts executable in Git itself
(so `infra/scripts/backup.sh` runs directly on Linux/macOS after clone), record the mode once:

```bash
git update-index --chmod=+x infra/scripts/*.sh
```

Every script starts with `#!/usr/bin/env bash`, so `bash infra/scripts/backup.sh` always works
regardless of the recorded mode.
