# syntax=docker/dockerfile:1
#
# TripTrackr backup runner.
#
# Build context is infra/ (see docker-compose.prod.yml). The base image is the
# SAME PostGIS release the database runs, so pg_dump and pg_restore are exactly
# the server's major version — pg_dump refuses to dump a server newer than
# itself, which is how a "backup" job on a stale client quietly stops working.
# `mc` (MinIO client, a static binary) is copied in for the optional off-box
# upload to any S3-compatible bucket (Backblaze B2, Cloudflare R2, ...).

FROM quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z AS mc

FROM postgis/postgis:17-3.5

COPY --from=mc /usr/bin/mc /usr/local/bin/mc
COPY scripts/backup.sh \
     scripts/backup-loop.sh \
     scripts/backup-healthcheck.sh \
     scripts/restore-rehearsal.sh \
     /usr/local/bin/

# Line endings and mode are fixed here so a Windows checkout cannot break the
# image (.gitattributes forces LF, but this is the belt to that brace).
RUN sed -i 's/\r$//' /usr/local/bin/*.sh \
 && chmod 0755 /usr/local/bin/*.sh /usr/local/bin/mc \
 && mkdir -p /backups \
 && chown postgres:postgres /backups

# Never runs as root. A fresh named volume mounted at /backups inherits this
# directory's ownership on first use.
USER postgres
WORKDIR /backups
VOLUME ["/backups"]

ENV BACKUP_DIR=/backups \
    BACKUP_AT=03:00 \
    BACKUP_RETENTION_DAYS=14 \
    BACKUP_ON_START=true \
    MC_CONFIG_DIR=/tmp/.mc

# The inherited postgres entrypoint execs any command that is not `postgres`,
# so `docker run <image> backup.sh` runs one backup and exits.
CMD ["backup-loop.sh"]
