#!/usr/bin/env bash
#
# Long-running scheduler for backup.sh — the `backup` service in
# infra/docker-compose.prod.yml. A bash loop rather than cron because the
# container has no init system, and a sleeping loop is one process with no
# configuration to get wrong.
#
#   BACKUP_AT        UTC time of day, HH:MM (default 03:00)
#   BACKUP_ON_START  run one backup immediately at boot (default true) — this
#                    proves the wiring the moment the stack is deployed instead
#                    of at 03:00 the next morning
#
# A failed run is logged and the loop continues; the healthcheck
# (backup-healthcheck.sh) turns the container unhealthy when the newest
# success is too old, which is where monitoring should hook in.

set -euo pipefail

BACKUP_AT="${BACKUP_AT:-03:00}"
BACKUP_ON_START="${BACKUP_ON_START:-true}"

[[ "$BACKUP_AT" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]] \
  || { echo "backup-loop: BACKUP_AT must be HH:MM (UTC), got '$BACKUP_AT'" >&2; exit 1; }

log() { printf '%s backup-loop: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }

run_once() {
  if backup.sh; then
    log "run succeeded"
  else
    log "run FAILED (exit $?) — will retry at the next scheduled time"
  fi
}

# Let `docker stop` end the sleep promptly instead of waiting out SIGKILL.
trap 'trap - TERM INT; log "stopping"; exit 0' TERM INT

if [[ "$BACKUP_ON_START" == "true" ]]; then
  run_once
fi

while true; do
  now=$(date -u +%s)
  next=$(date -u -d "today ${BACKUP_AT}" +%s)
  if (( next <= now )); then
    next=$(date -u -d "tomorrow ${BACKUP_AT}" +%s)
  fi
  log "next backup at $(date -u -d "@${next}" +%Y-%m-%dT%H:%M:%SZ)"
  sleep $(( next - now )) &
  wait $!
  run_once
done
