# infra/secrets

Production secret files, mounted by `infra/docker-compose.prod.yml` into the containers at
`/run/secrets/<name>`. **This directory is gitignored** (`infra/secrets/` in the root
`.gitignore`); only this README and `.gitkeep` are meant to be tracked, and they must be
added with `git add -f`.

Constitution: _"Secrets MUST NOT be committed, baked into images, or hard-coded."_

## Generate

One value per file, no trailing newline (`tr -d '\n'`), readable only by the deploying user:

```bash
cd infra/secrets
umask 077
openssl rand -hex 32                      | tr -d '\n' > postgres_password.txt
openssl rand -hex 32                      | tr -d '\n' > api_db_password.txt
openssl rand -base64 48                   | tr -d '\n' > jwt_access_secret.txt
openssl rand -base64 48                   | tr -d '\n' > jwt_refresh_secret.txt
openssl rand -base64 32                   | tr -d '\n' > document_master_key.txt
```

| File                      | Consumed by (target)                            | Format                                                                                                        |
| ------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `postgres_password.txt`   | `postgres`, `migrate` (owner connection string) | Hex. It is embedded in a URL, so it must be URL-safe; hex is.                                                 |
| `api_db_password.txt`     | `migrate` (applies it), `api`, `worker`         | Hex, same reason.                                                                                             |
| `jwt_access_secret.txt`   | `api`, `worker`                                 | ≥ 32 characters (env schema `min(32)`); base64 of 48 bytes.                                                   |
| `jwt_refresh_secret.txt`  | `api`, `worker`                                 | ≥ 32 characters; base64 of 48 bytes. Must differ from the access secret.                                      |
| `document_master_key.txt` | `api`, `worker`                                 | **Exactly** base64 of 32 bytes (44 chars). Envelope-encrypts travel documents (FR-033); losing it loses them. |

## Honest status

The API reads plain environment variables (`apps/api/src/common/config/env.schema.ts`) and
does not yet support a `*_FILE` convention. Until it does, the same values must also be present
in the host's `.env`, which is what the containers actually use. The mounts are provisioned so
that adding `*_FILE` support to the API is the only step left — see `infra/README.md`,
"Secrets", for the follow-up task.

Back up `document_master_key.txt` somewhere that is not this server (password manager, sealed
envelope). A database backup without the key that decrypts its documents is incomplete.
