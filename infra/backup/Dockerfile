# syntax=docker/dockerfile:1
#
# TripTrackr backup runner.
#
# Build context is infra/ (see docker-compose.prod.yml). The base image is the
# SAME PostGIS release the database runs, so pg_dump and pg_restore are exactly
# the server's major version — pg_dump refuses to dump a server newer than
# itself, which is how a "backup" job on a stale client quietly stops working.
# `rclone` (a static binary) is copied in for the optional off-box upload to
# any S3-compatible bucket (Backblaze B2, Cloudflare R2, ...).

FROM rclone/rclone:1.75.1@sha256:45401ad7410db1d67ffdb58e19059ad20b0d8e0285a60e38bbec55cc1019c7a5 AS rclone

FROM postgis/postgis:17-3.6

COPY --from=rclone /usr/local/bin/rclone /usr/local/bin/rclone
COPY scripts/backup.sh \
     scripts/backup-loop.sh \
     scripts/backup-healthcheck.sh \
     scripts/restore-rehearsal.sh \
     /usr/local/bin/

# Line endings and mode are fixed here so a Windows checkout cannot break the
# image (.gitattributes forces LF, but this is the belt to that brace).
RUN sed -i 's/\r$//' /usr/local/bin/*.sh \
 && chmod 0755 /usr/local/bin/*.sh /usr/local/bin/rclone \
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
    RCLONE_CONFIG=/tmp/rclone.conf

# The inherited postgres entrypoint execs any command that is not `postgres`,
# so `docker run <image> backup.sh` runs one backup and exits.
CMD ["backup-loop.sh"]
