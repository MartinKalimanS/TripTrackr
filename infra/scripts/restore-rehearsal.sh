#!/usr/bin/env bash
#
# TripTrackr restore rehearsal.
#
# Constitution, Technology & Platform Constraints: "Backups MUST be verified by
# performing an actual restore. A backup that has never been restored from is
# not a backup." This script IS that verification. It restores a dump produced
# by backup.sh into a throwaway database, asserts that what came back is the
# TripTrackr schema with its privacy guarantees intact, tears everything down,
# and prints PASS or FAIL. Exit status follows the verdict.
#
# Usage
#   restore-rehearsal.sh [DUMP]      DUMP is a triptrackr-*.dump.gz; defaults to
#                                    the newest one in $BACKUP_DIR
#
# Two modes — chosen by whether RESTORE_TARGET_URL is set:
#
#   Docker mode (default, for a laptop or the VPS)
#     Starts a throwaway postgis/postgis:17-3.5 container on a random 127.0.0.1
#     port, restores into a fresh database created from template0, runs the
#     assertions through `docker exec`, removes the container. Needs only the
#     docker CLI; no PostgreSQL client tools on the host.
#
#   URL mode (RESTORE_TARGET_URL set — CI, or inside the backup image)
#     Connects to an existing scratch server with the local pg_restore/psql,
#     which MUST be major version 17, creates a fresh database there, restores,
#     asserts, drops it. The URL must name a maintenance database (e.g. /postgres)
#     and a superuser. Never point this at production.
#
# Environment
#   BACKUP_DIR           where dumps live (default: /backups if it exists, else ./backups)
#   RESTORE_TARGET_URL   enables URL mode (see above)
#   RESTORE_IMAGE        Docker-mode image (default postgis/postgis:17-3.5 — match the server)
#   RESTORE_OWNER_ROLE   the database owner's role name in the dump (default triptrackr)
#   RESTORE_KEEP         "true" keeps the container / database for inspection (default false)
#   RESTORE_RTO_SECONDS  fail if the restore alone takes longer (default 3600 — SC-020, RTO 1h)
#
# Assertions
#   1. the postgis extension is present
#   2. schema_migrations has at least one row (the ledger came back)
#   3. SELECT count(*) FROM trips succeeds
#   4. expenses and documents have row-level security ENABLED and FORCED
#   5. expenses and documents each still carry at least one policy
#   6. the restore finished inside the RTO budget
#
# Cadence: monthly, and before every release — infra/scripts/README.md.

set -euo pipefail

# Git Bash on Windows rewrites arguments that look like POSIX paths before
# docker.exe sees them; container paths must arrive intact.
export MSYS_NO_PATHCONV=1

RESTORE_IMAGE="${RESTORE_IMAGE:-postgis/postgis:17-3.5}"
RESTORE_OWNER_ROLE="${RESTORE_OWNER_ROLE:-triptrackr}"
RESTORE_KEEP="${RESTORE_KEEP:-false}"
RESTORE_RTO_SECONDS="${RESTORE_RTO_SECONDS:-3600}"
RESTORE_TARGET_URL="${RESTORE_TARGET_URL:-}"

if [[ -z "${BACKUP_DIR:-}" ]]; then
  if [[ -d /backups ]]; then BACKUP_DIR=/backups; else BACKUP_DIR=./backups; fi
fi

log()  { printf '%s rehearsal: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die()  { log "$*"; echo "FAIL"; exit 1; }

failures=0
ok()   { printf '  ok    %s\n' "$*"; }
fail() { failures=$((failures + 1)); printf '  FAIL  %s\n' "$*"; }

# ---------------------------------------------------------------------------
# 1. Locate and verify the dump
# ---------------------------------------------------------------------------
dump="${1:-}"
if [[ -z "$dump" ]]; then
  dump=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'triptrackr-*.dump.gz' 2>/dev/null \
    | sort | tail -n1 || true)
  [[ -n "$dump" ]] || die "no triptrackr-*.dump.gz found in $BACKUP_DIR (pass a path, or set BACKUP_DIR)."
fi
[[ -f "$dump" ]] || die "dump not found: $dump"

log "dump: $dump"

if [[ -f "${dump}.sha256" ]]; then
  (cd "$(dirname "$dump")" && sha256sum --check --quiet "$(basename "$dump").sha256") \
    || die "checksum mismatch for $dump — the file is corrupt or was tampered with."
  log "checksum verified"
else
  log "WARNING: no .sha256 next to the dump; integrity not verified"
fi
gzip -t "$dump" || die "gzip integrity check failed for $dump"

globals="${dump%.dump.gz}.globals.sql"
[[ -f "$globals" ]] || { log "no companion globals file; roles will be created minimally"; globals=""; }

dbname="triptrackr_restore_$(date -u +%Y%m%d%H%M%S)"
mode="docker"
[[ -n "$RESTORE_TARGET_URL" ]] && mode="url"
log "mode: $mode  target database: $dbname"

# ---------------------------------------------------------------------------
# 2. Target-specific plumbing: sql <db> <query>, restore_into <db>, cleanup
# ---------------------------------------------------------------------------
container=""
maintenance_db="postgres"

if [[ "$mode" == "docker" ]]; then
  command -v docker >/dev/null 2>&1 || die "docker CLI not found (set RESTORE_TARGET_URL for URL mode)."
  container="triptrackr-restore-$$"

  cleanup() {
    if [[ "$RESTORE_KEEP" == "true" ]]; then
      log "RESTORE_KEEP=true — container '$container' left running on 127.0.0.1:${port:-?}"
    elif [[ -n "$container" ]]; then
      docker rm -f "$container" >/dev/null 2>&1 || true
    fi
  }
  trap cleanup EXIT

  log "starting throwaway $RESTORE_IMAGE"
  docker run -d --name "$container" \
    -e POSTGRES_USER="$RESTORE_OWNER_ROLE" \
    -e POSTGRES_PASSWORD=rehearsal \
    -e POSTGRES_DB="$maintenance_db" \
    -p 127.0.0.1::5432 \
    "$RESTORE_IMAGE" >/dev/null
  port=$(docker port "$container" 5432/tcp | head -n1 | sed 's/.*://')
  log "container $container listening on 127.0.0.1:$port"

  # The image's init runs a temporary server on the unix socket only; TCP
  # readiness means the real one is up.
  for _ in $(seq 1 90); do
    if docker exec "$container" pg_isready -h 127.0.0.1 -U "$RESTORE_OWNER_ROLE" -q 2>/dev/null; then
      break
    fi
    sleep 1
  done
  docker exec "$container" pg_isready -h 127.0.0.1 -U "$RESTORE_OWNER_ROLE" -q \
    || die "throwaway PostgreSQL did not become ready in 90s."

  # Inside the container the unix socket is trust-authenticated.
  sql() { docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U "$RESTORE_OWNER_ROLE" -d "$1" -tA -c "$2"; }
  sql_file() { docker exec -i "$container" psql -X -q -U "$RESTORE_OWNER_ROLE" -d "$1" -f - ; }
  restore_into() {
    gunzip -c "$dump" | docker exec -i "$container" \
      pg_restore -U "$RESTORE_OWNER_ROLE" -d "$1" --exit-on-error --single-transaction
  }
else
  for tool in psql pg_restore gunzip; do
    command -v "$tool" >/dev/null 2>&1 || die "'$tool' is required in URL mode."
  done
  # Derive the URL of the fresh database from the maintenance URL.
  base_url="${RESTORE_TARGET_URL%%\?*}"
  query_string="${RESTORE_TARGET_URL#"$base_url"}"
  [[ "$base_url" == *"://"*"/"* ]] || die "RESTORE_TARGET_URL must include a database path, e.g. .../postgres"
  target_db_url="${base_url%/*}/${dbname}${query_string}"

  cleanup() {
    if [[ "$RESTORE_KEEP" == "true" ]]; then
      log "RESTORE_KEEP=true — database '$dbname' left in place"
    else
      psql -X -q -d "$RESTORE_TARGET_URL" -c "DROP DATABASE IF EXISTS \"$dbname\" WITH (FORCE)" >/dev/null 2>&1 || true
    fi
  }
  trap cleanup EXIT

  sql() {
    local url="$RESTORE_TARGET_URL"
    [[ "$1" == "$dbname" ]] && url="$target_db_url"
    psql -X -q -v ON_ERROR_STOP=1 -d "$url" -tA -c "$2"
  }
  sql_file() {
    local url="$RESTORE_TARGET_URL"
    [[ "$1" == "$dbname" ]] && url="$target_db_url"
    psql -X -q -d "$url" -f -
  }
  restore_into() {
    gunzip -c "$dump" | pg_restore -d "$target_db_url" --exit-on-error --single-transaction
  }
fi

# ---------------------------------------------------------------------------
# 3. Roles, fresh database, restore
# ---------------------------------------------------------------------------
if [[ -n "$globals" ]]; then
  # Roles already present (the maintenance superuser, for one) make individual
  # statements error; that is expected and not a verdict.
  log "applying roles from $(basename "$globals") (existing roles reported and skipped)"
  sql_file "$maintenance_db" < "$globals" 2>&1 | grep -v 'already exists' >&2 || true
fi
sql "$maintenance_db" "DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'triptrackr_api') THEN CREATE ROLE triptrackr_api NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$RESTORE_OWNER_ROLE') THEN CREATE ROLE \"$RESTORE_OWNER_ROLE\" NOLOGIN; END IF;
END \$\$;" >/dev/null

# template0, not the image's default database: that one already has PostGIS
# installed, which would mask a dump missing its CREATE EXTENSION.
sql "$maintenance_db" "CREATE DATABASE \"$dbname\" TEMPLATE template0 OWNER \"$RESTORE_OWNER_ROLE\"" >/dev/null

log "restoring…"
restore_started=$(date +%s)
restore_into "$dbname" || die "pg_restore reported errors (see above)."
restore_seconds=$(( $(date +%s) - restore_started ))
log "restore finished in ${restore_seconds}s"

# ---------------------------------------------------------------------------
# 4. Assertions
# ---------------------------------------------------------------------------
assert_sql() {
  local label="$1" query="$2" predicate="$3" out
  if ! out=$(sql "$dbname" "$query" 2>&1); then
    fail "$label — query failed: $(echo "$out" | tr '\n' ' ')"
    return 0
  fi
  out="$(echo "$out" | tr -d '[:space:]')"
  # shellcheck disable=SC2034  # $out is read by the predicate below
  if eval "$predicate"; then ok "$label -> $out"; else fail "$label -> got '$out'"; fi
}

echo "Assertions against $dbname:"
assert_sql "postgis extension present" \
  "SELECT count(*) FROM pg_extension WHERE extname = 'postgis'" \
  '[[ "$out" == "1" ]]'
assert_sql "schema_migrations has rows" \
  "SELECT count(*) FROM schema_migrations" \
  '[[ "$out" =~ ^[0-9]+$ && "$out" -gt 0 ]]'
assert_sql "SELECT count(*) FROM trips succeeds" \
  "SELECT count(*) FROM trips" \
  '[[ "$out" =~ ^[0-9]+$ ]]'
for tbl in expenses documents; do
  assert_sql "RLS enabled AND forced on $tbl" \
    "SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.${tbl}'::regclass" \
    '[[ "$out" == "t" ]]'
  assert_sql "policies survived on $tbl" \
    "SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = '${tbl}'" \
    '[[ "$out" =~ ^[0-9]+$ && "$out" -gt 0 ]]'
done
if (( restore_seconds <= RESTORE_RTO_SECONDS )); then
  ok "restore within RTO budget (${restore_seconds}s <= ${RESTORE_RTO_SECONDS}s)"
else
  fail "restore exceeded RTO budget (${restore_seconds}s > ${RESTORE_RTO_SECONDS}s)"
fi

# ---------------------------------------------------------------------------
# 5. Verdict
# ---------------------------------------------------------------------------
if (( failures == 0 )); then
  echo "PASS — $(basename "$dump") restores cleanly with RLS intact"
  exit 0
fi
echo "FAIL — $failures assertion(s) failed for $(basename "$dump")"
exit 1
