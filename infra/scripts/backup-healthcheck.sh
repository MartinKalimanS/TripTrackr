#!/usr/bin/env bash
#
# Docker HEALTHCHECK for the `backup` service: healthy while the newest
# successful backup is younger than BACKUP_MAX_AGE_HOURS (default 48 — one
# missed night is tolerated, two are not). backup.sh touches
# $BACKUP_DIR/.last-success only after the dump, checksum and (if configured)
# upload have all succeeded, so this is a check on the outcome, not on the
# process being alive.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-48}"
marker="${BACKUP_DIR}/.last-success"

if [[ ! -f "$marker" ]]; then
  echo "no successful backup recorded yet" >&2
  exit 1
fi

age=$(( $(date +%s) - $(stat -c %Y "$marker") ))
limit=$(( BACKUP_MAX_AGE_HOURS * 3600 ))

if (( age > limit )); then
  echo "last successful backup is $(( age / 3600 ))h old (limit ${BACKUP_MAX_AGE_HOURS}h)" >&2
  exit 1
fi

echo "last successful backup $(( age / 60 ))m ago"
