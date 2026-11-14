#!/usr/bin/env bash
#
# TripTrackr API deploy (roadmap S-27). Run on the production host, from the
# repository root, by .github/workflows/api-deploy.yml over SSH (or by hand):
#
#   ./infra/scripts/deploy.sh ghcr.io/<owner>/triptrackr-api:sha-abc1234
#
# In order:
#   1. refuse to run unless .env and infra/secrets/*.txt exist;
#   2. take an on-demand backup (abort on failure; SKIP_BACKUP=1 to skip);
#   3. record the image the API runs now as PREVIOUS;
#   4. pull the new image;
#   5. run `migrate` once, as the owner (migrations are expand-then-contract,
#      so the previous API still runs against the migrated schema);
#   6. restart api and worker on the new image;
#   7. wait for the API to report healthy and check it connects as triptrackr_api;
#   8. on any failure after step 3, restart PREVIOUS and exit non-zero;
#   9. prune old API images, keeping the newest KEEP_IMAGES (default 3).
#
# Environment (all optional)
#   HEALTH_TIMEOUT_SECONDS  How long step 7 waits (default 120).
#   KEEP_IMAGES             API images kept by step 9 (default 3).
#   SKIP_BACKUP             Set to 1 to skip step 2 (first deploy only).

set -Eeuo pipefail

readonly HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-120}"
readonly KEEP_IMAGES="${KEEP_IMAGES:-3}"
readonly SECRET_FILES=(postgres_password api_db_password jwt_access_secret jwt_refresh_secret document_master_key)

log() { printf '[deploy] %s\n' "$*"; }
die() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

NEW_IMAGE="${1:-}"
[[ -n "$NEW_IMAGE" ]] || die "usage: deploy.sh <image-ref>   (e.g. ghcr.io/owner/triptrackr-api:sha-abc1234)"
[[ "$NEW_IMAGE" =~ ^[A-Za-z0-9._/:@-]+$ ]] || die "image reference contains unexpected characters"

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

compose() {
  docker compose --env-file .env \
    -f infra/docker-compose.yml -f infra/docker-compose.prod.yml "$@"
}

# 1. Preconditions ------------------------------------------------------------
[[ -f .env ]] || die ".env is missing in $(pwd)"
for name in "${SECRET_FILES[@]}"; do
  [[ -s "infra/secrets/${name}.txt" ]] || die "infra/secrets/${name}.txt is missing or empty"
done

# 2. Backup -------------------------------------------------------------------
if [[ "${SKIP_BACKUP:-0}" == "1" ]]; then
  log "SKIP_BACKUP=1: no pre-deploy backup"
elif [[ -n "$(API_IMAGE="$NEW_IMAGE" compose ps -q backup 2>/dev/null)" ]]; then
  log "taking a pre-deploy backup"
  API_IMAGE="$NEW_IMAGE" compose exec -T backup backup.sh || die "pre-deploy backup failed; nothing was changed"
else
  die "the backup service is not running; start the stack once or set SKIP_BACKUP=1 for a first deploy"
fi

# 3. Previous image -----------------------------------------------------------
PREVIOUS=""
prev_id="$(API_IMAGE="$NEW_IMAGE" compose ps -q api 2>/dev/null | head -n 1 || true)"
if [[ -n "$prev_id" ]]; then
  PREVIOUS="$(docker inspect --format '{{.Config.Image}}' "$prev_id")"
fi
log "previous image: ${PREVIOUS:-none (first deploy)}"
log "new image:      $NEW_IMAGE"

start_stack() { # $1 = image reference
  API_IMAGE="$1" compose up -d --no-deps api worker
}

wait_healthy() { # $1 = image reference; returns non-zero on timeout
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
  while ((SECONDS < deadline)); do
    if API_IMAGE="$1" compose exec -T api wget -qO- http://127.0.0.1:3000/health >/dev/null 2>&1; then
      return 0
    fi
    sleep 3
  done
  return 1
}

uses_api_role() { # $1 = image reference; the URL is matched, never printed
  API_IMAGE="$1" compose exec -T api sh -c 'case "$DATABASE_URL" in postgresql://triptrackr_api:*) exit 0;; *) exit 1;; esac'
}

rollback() {
  local code="${1:-$?}"
  trap - ERR
  log "FAILED (exit ${code}); rolling back"
  if [[ -n "$PREVIOUS" ]]; then
    start_stack "$PREVIOUS" || log "rollback could not restart $PREVIOUS; intervene on the host"
    if wait_healthy "$PREVIOUS"; then
      log "rolled back to $PREVIOUS"
    else
      log "$PREVIOUS did not become healthy after rollback"
    fi
  else
    log "no previous image to restore (first deploy)"
  fi
  exit "$code"
}
trap rollback ERR

# `exit` does not fire the ERR trap, so post-deploy checks call this instead.
fail_and_roll_back() { log "$*"; rollback 1; }

# 4. Pull ---------------------------------------------------------------------
log "pulling $NEW_IMAGE"
docker pull "$NEW_IMAGE"

# 5. Migrate ------------------------------------------------------------------
log "starting postgres, redis and traefik"
API_IMAGE="$NEW_IMAGE" compose up -d postgres redis traefik
log "running migrations"
API_IMAGE="$NEW_IMAGE" compose run --rm --no-deps migrate

# 6. Restart ------------------------------------------------------------------
log "restarting api and worker"
start_stack "$NEW_IMAGE"

# 7. Health -------------------------------------------------------------------
log "waiting up to ${HEALTH_TIMEOUT_SECONDS}s for /health"
wait_healthy "$NEW_IMAGE" || fail_and_roll_back "the API did not become healthy in ${HEALTH_TIMEOUT_SECONDS}s"
uses_api_role "$NEW_IMAGE" || fail_and_roll_back "the API does not connect as triptrackr_api"
log "healthy, connected as triptrackr_api"

trap - ERR

# 9. Prune --------------------------------------------------------------------
repo="${NEW_IMAGE%%@*}"
repo="${repo%:*}"
log "pruning old images of ${repo} (keeping ${KEEP_IMAGES})"
docker image ls "$repo" --format '{{.ID}}' | awk '!seen[$0]++' | tail -n +"$((KEEP_IMAGES + 1))" \
  | xargs -r docker image rm >/dev/null 2>&1 || true

log "deployed $NEW_IMAGE"
