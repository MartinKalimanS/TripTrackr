#!/usr/bin/env bash
#
# TripTrackr database backup.
#
#   pg_dump -Fc  ->  gzip  ->  sha256  ->  prune old  ->  (optional) upload
#
# Produces, in $BACKUP_DIR:
#   triptrackr-<UTC stamp>.dump.gz         custom-format dump, gzip-compressed
#   triptrackr-<UTC stamp>.dump.gz.sha256  checksum, verified by the restore rehearsal
#   triptrackr-<UTC stamp>.globals.sql     roles and grants (pg_dumpall --globals-only,
#                                          no passwords) — pg_dump does not include them
#   .last-success                          touched on success; read by the healthcheck
#
# Environment
#   BACKUP_DATABASE_URL     Connection string of the database OWNER. Falls back to
#                           MIGRATION_DATABASE_URL. The API role cannot be used:
#                           RLS hides most rows from it and pg_dump refuses to run
#                           when a policy would filter the output.
#   BACKUP_DIR              Destination directory (default /backups).
#   BACKUP_RETENTION_DAYS   Local files older than this are deleted (default 14).
#   BACKUP_S3_ENDPOINT      Optional. When set, the dump, its checksum and the
#   BACKUP_S3_BUCKET        globals file are copied with `mc` to
#   BACKUP_S3_ACCESS_KEY_ID <endpoint>/<bucket>/<prefix>/ — Backblaze B2, Cloudflare
#   BACKUP_S3_SECRET_ACCESS_KEY  R2, MinIO, anything S3-compatible.
#   BACKUP_S3_PREFIX        Optional key prefix (default "triptrackr").
#
# Exits non-zero on ANY failure — a backup job that fails quietly is worse than
# none, because someone is relying on it. Runs inside the image built from
# infra/backup/Dockerfile (pg_dump 17 + mc), or on any host whose pg_dump major
# version matches the server.
#
# Cadence and the restore rehearsal that makes this a backup at all:
# infra/scripts/README.md.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_S3_PREFIX="${BACKUP_S3_PREFIX:-triptrackr}"
DATABASE_URL_FOR_BACKUP="${BACKUP_DATABASE_URL:-${MIGRATION_DATABASE_URL:-}}"

log() { printf '%s backup: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "FAILED — $*"; exit 1; }

[[ -n "$DATABASE_URL_FOR_BACKUP" ]] \
  || die "BACKUP_DATABASE_URL (or MIGRATION_DATABASE_URL) is not set. Refusing to guess a database."
[[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]] \
  || die "BACKUP_RETENTION_DAYS must be an integer, got '$BACKUP_RETENTION_DAYS'."

for tool in pg_dump pg_dumpall gzip sha256sum find; do
  command -v "$tool" >/dev/null 2>&1 || die "'$tool' is not installed."
done

mkdir -p "$BACKUP_DIR"
[[ -w "$BACKUP_DIR" ]] || die "$BACKUP_DIR is not writable."

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
base="triptrackr-${stamp}"
dump_path="${BACKUP_DIR}/${base}.dump.gz"
globals_path="${BACKUP_DIR}/${base}.globals.sql"
tmp_dump="${dump_path}.part"
tmp_globals="${globals_path}.part"

cleanup_partial() { rm -f "$tmp_dump" "$tmp_globals"; }
trap cleanup_partial ERR INT TERM

started=$(date +%s)
log "starting -> ${dump_path}"

# 1. Dump. -Fc is pg_restore's native format (selective restore, parallel
#    restore); -Z 0 leaves compression to gzip so one tool owns it. --no-password
#    makes a missing credential fail instead of hanging on a prompt.
pg_dump --format=custom --compress=0 --no-password \
  --dbname="$DATABASE_URL_FOR_BACKUP" \
  | gzip -6 > "$tmp_dump"

# A zero-byte or truncated archive must never be renamed into place.
[[ -s "$tmp_dump" ]] || die "dump is empty."
gzip -t "$tmp_dump" || die "dump failed gzip integrity check."
mv "$tmp_dump" "$dump_path"

# 2. Globals: roles (triptrackr_api!) and their grants live outside any single
#    database. Passwords are excluded — they belong in the secret store, not in
#    a backup that leaves the box.
pg_dumpall --globals-only --no-role-passwords --no-password \
  --dbname="$DATABASE_URL_FOR_BACKUP" > "$tmp_globals"
mv "$tmp_globals" "$globals_path"

# 3. Checksum, written with the bare filename so it verifies from any directory.
(cd "$BACKUP_DIR" && sha256sum "${base}.dump.gz" > "${base}.dump.gz.sha256")

size_human=$(du -h "$dump_path" | cut -f1)
log "wrote ${base}.dump.gz (${size_human}), .sha256 and .globals.sql"

# 4. Prune. Only this script's own artefacts, only past the retention window.
pruned=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'triptrackr-*' \
  -mtime "+${BACKUP_RETENTION_DAYS}" -print -delete | wc -l)
log "pruned ${pruned} file(s) older than ${BACKUP_RETENTION_DAYS} days"

# 5. Optional off-box copy. A backup on the same disk as the database protects
#    against a bad migration, not against losing the box.
if [[ -n "${BACKUP_S3_ENDPOINT:-}" ]]; then
  [[ -n "${BACKUP_S3_BUCKET:-}" ]] || die "BACKUP_S3_ENDPOINT is set but BACKUP_S3_BUCKET is not."
  [[ -n "${BACKUP_S3_ACCESS_KEY_ID:-}" && -n "${BACKUP_S3_SECRET_ACCESS_KEY:-}" ]] \
    || die "BACKUP_S3_ACCESS_KEY_ID / BACKUP_S3_SECRET_ACCESS_KEY are required for upload."
  command -v mc >/dev/null 2>&1 || die "'mc' is not installed but BACKUP_S3_ENDPOINT is set."

  # MC_HOST_<alias> configures an alias from the environment without writing
  # credentials to a config file. Plain http is allowed only so a local MinIO
  # can stand in during a rehearsal; a real off-site target is https.
  scheme="https"
  host="${BACKUP_S3_ENDPOINT#https://}"
  if [[ "$BACKUP_S3_ENDPOINT" == http://* ]]; then
    scheme="http"
    host="${BACKUP_S3_ENDPOINT#http://}"
  fi
  export "MC_HOST_offsite=$(printf '%s://%s:%s@%s' \
    "$scheme" "$BACKUP_S3_ACCESS_KEY_ID" "$BACKUP_S3_SECRET_ACCESS_KEY" "$host")"
  dest="offsite/${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}/"
  mc cp --quiet "$dump_path" "${dump_path}.sha256" "$globals_path" "$dest" \
    || die "upload to ${BACKUP_S3_ENDPOINT}/${BACKUP_S3_BUCKET} failed."
  log "uploaded to ${dest}"
else
  log "BACKUP_S3_ENDPOINT not set — local copy only (fine for development, not for production)"
fi

touch "${BACKUP_DIR}/.last-success"
log "OK in $(( $(date +%s) - started ))s"
