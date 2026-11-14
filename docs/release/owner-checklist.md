# Owner checklist: everything only you can provide

The repository is release-ready except for the items below. Each row names the exact variable or
secret and where it goes. Nothing here is a value that belongs in git: values live in the
password manager, GitHub environments, EAS, or the server's `.env`.

Where things go:

- **GH env `production-mobile`**: GitHub, Settings, Environments (required reviewers: you).
- **GH env `production-api`**: same, for the API deploy.
- **GH repo secret**: Settings, Secrets and variables, Actions.
- **EAS env**: `eas env:create --environment production` (visibility `sensitive` for secrets,
  `plaintext` or `sensitive` for public ids), or expo.dev, Project, Environment variables. Repeat for
  `preview` (and `development`) when those builds need them.
- **VPS `.env`**: the root `.env` on the server (`.env.example` is the template); `infra/secrets/*.txt`
  for the files Compose mounts. Never in GitHub.

Sources: `.env.example`, `apps/api/src/common/config/env.schema.ts`, `apps/mobile/app.config.ts`,
`apps/mobile/eas.json`, `docs/roadmap/CICD-AND-RELEASE.md`.

## 1. Domain and hosting

| Item                          | Name                                                                | Where                                                                    | Notes                                                                                    |
| ----------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Domain                        | `triptrackr.app` (or yours)                                         | Registrar, DNS                                                           | Hosts legal pages, email sender, API host. If different, update the defaults named below |
| API host name                 | `API_HOST` (for example `api.triptrackr.app`)                       | VPS `.env`                                                               | DNS A/AAAA to the VPS; Traefik issues TLS                                                |
| ACME contact                  | `ACME_EMAIL`                                                        | VPS `.env`                                                               | Let's Encrypt expiry notices                                                             |
| Public web origin             | `APP_PUBLIC_URL`                                                    | VPS `.env`                                                               | Origin of emailed links (`/verify-email`, `/reset-password`)                             |
| Legal and support site        | `EXPO_PUBLIC_LEGAL_BASE_URL`                                        | EAS env (production, preview)                                            | Defaults to `https://triptrackr.app`; serves `/privacy`, `/terms`, delete-account page   |
| Mobile to API URL             | `EXPO_PUBLIC_API_URL` (`https://<API_HOST>`)                        | EAS env; `apps/mobile/.env.local` for local runs                         | Public by design                                                                         |
| Legal contact and support box | Support address (code default `support@triptrackr.app`), legal text | `apps/mobile/src/config/legal-links.ts` (`SUPPORT_EMAIL`), `docs/legal/` | Mailbox must exist and be monitored; counsel finalises the legal texts (S-32)            |

## 2. API server deploy (S-25 to S-27)

| Item                         | Name                                                                                                              | Where                        | Notes                                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| SSH private key for `deploy` | `DEPLOY_SSH_KEY`                                                                                                  | GH env `production-api`      | Restricted key; rotate quarterly                                                                                                                 |
| Pinned host key line         | `DEPLOY_KNOWN_HOSTS`                                                                                              | GH env `production-api`      | `ssh-keyscan` output, verified out of band                                                                                                       |
| VPS address                  | `DEPLOY_HOST`                                                                                                     | GH env `production-api`      |                                                                                                                                                  |
| Database passwords           | `POSTGRES_PASSWORD`, `API_DB_PASSWORD`                                                                            | VPS `.env`, `infra/secrets/` | Unique, URL-safe (`openssl rand -hex 32`)                                                                                                        |
| Connection strings           | `DATABASE_URL` (role `triptrackr_api`), `MIGRATION_DATABASE_URL`                                                  | VPS `.env`                   | Never give the API the owner URL                                                                                                                 |
| Token secrets                | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`                                                                         | VPS `.env`                   | `openssl rand -base64 48`                                                                                                                        |
| Document master key          | `DOCUMENT_MASTER_KEY`, `DOCUMENT_MASTER_KEY_ID`                                                                   | VPS `.env`                   | 32 random bytes base64; escrow offline; losing it loses documents                                                                                |
| Object storage (R2 or S3)    | `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_PHOTOS`, `S3_BUCKET_DOCUMENTS` | VPS `.env`                   | Private buckets; R2 region is `auto`                                                                                                             |
| Off-box backups              | `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`                | VPS `.env`                   | Different provider, write-only key                                                                                                               |
| GHCR image pull              | none (uses `GITHUB_TOKEN` at build)                                                                               | n/a                          | Make the package visible to the VPS (deploy key or pull token)                                                                                   |
| Release automation token     | `RELEASE_PLEASE_TOKEN`                                                                                            | GH repo secret               | Fine-grained PAT (contents and pull requests: write) so the release tag starts other workflows. Optional: without it, dispatch workflows by hand |
| Environments and tag rules   | `production-api`, `production-mobile`, protected `v*` tags                                                        | GitHub settings              | See `docs/roadmap/REPO-SETTINGS-CHECKLIST.md`                                                                                                    |

## 3. Billing: RevenueCat and store products (S-12, S-13)

| Item                   | Name                                                                                        | Where                           | Notes                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Server API key         | `REVENUECAT_API_KEY`                                                                        | VPS `.env`                      | Secret key (`sk_`)                                                                                        |
| Webhook secret         | `REVENUECAT_WEBHOOK_SECRET`                                                                 | VPS `.env` and RevenueCat       | Webhook URL `https://<API_HOST>/billing/webhook`                                                          |
| iOS public SDK key     | `EXPO_PUBLIC_REVENUECAT_IOS_KEY`                                                            | EAS env                         | Public (`appl_`); never a `test_` key in production                                                       |
| Android public SDK key | `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`                                                        | EAS env                         | Public (`goog_`)                                                                                          |
| Offering identifier    | `EXPO_PUBLIC_REVENUECAT_OFFERING`                                                           | EAS env                         |                                                                                                           |
| Product map            | `BILLING_PRODUCTS` (JSON, store product id to kind and step)                                | VPS `.env`                      | Must match the ids you create in both stores (default in `.env.example`)                                  |
| Store products         | `credit_single`, `tier1_y1`, `tier1_y2`, `tier1_y3_plus`, `unl_y1`, `unl_y2`, `unl_y3_plus` | App Store Connect, Play Console | Subscription group, prices, localisations; Paid Apps Agreement with tax and banking                       |
| Charging switch        | `BILLING_ENFORCED`                                                                          | VPS `.env`                      | Stays `false` until the owner decides (spec 014); `BILLING_ACCEPT_TEST_STORE` stays `false` in production |

## 4. Maps, errors, email, AI

| Item                  | Name                                                                   | Where      | Notes                                                                      |
| --------------------- | ---------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------- |
| Mapbox server token   | `MAPBOX_ACCESS_TOKEN`                                                  | VPS `.env` | Required by the API schema                                                 |
| Mapbox public token   | `EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN`                                      | EAS env    | Public; restrict by bundle id / package, minimal scopes                    |
| Mapbox download token | `MAPBOX_DOWNLOADS_TOKEN` (also read as `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`) | EAS secret | `DOWNLOADS:READ` scope; build time only                                    |
| Sentry DSN (server)   | `SENTRY_DSN`                                                           | VPS `.env` | Optional in the schema, expected for launch                                |
| Sentry DSN (app)      | `EXPO_PUBLIC_SENTRY_DSN`                                               | EAS env    | Public                                                                     |
| Sentry source maps    | `SENTRY_AUTH_TOKEN`                                                    | EAS secret | Org `triptrackr`, project `triptrackr-mobile` (`app.config.ts`)            |
| Email provider        | `RESEND_API_KEY` (`re_...`), `EMAIL_FROM`                              | VPS `.env` | Verify the sending domain (SPF, DKIM, DMARC); sender must match the policy |
| Planner AI            | `ANTHROPIC_API_KEY`                                                    | VPS `.env` | Required by the schema; set a spend cap                                    |

## 5. Sign-in providers (S-04)

| Item                      | Name                                                                  | Where      | Notes                                      |
| ------------------------- | --------------------------------------------------------------------- | ---------- | ------------------------------------------ |
| Google iOS client id      | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`                                    | EAS env    | Public id                                  |
| Google Android client id  | `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`                                | EAS env    | Register debug and Play App Signing SHA-1s |
| Google audiences (server) | `GOOGLE_OAUTH_CLIENT_IDS` (comma-separated, same ids)                 | VPS `.env` | Empty means the endpoint answers 503       |
| Apple audiences (server)  | `APPLE_OAUTH_CLIENT_IDS` (`com.triptrackr.app`, plus any Services ID) | VPS `.env` | Enable Sign in with Apple on the App ID    |

## 6. Expo / EAS (S-28, S-30)

| Item                      | Name                                                 | Where                                            | Notes                                                                                               |
| ------------------------- | ---------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Expo robot token          | `EXPO_TOKEN`                                         | GH env `production-mobile`                       | expo.dev, Access tokens. Without it `mobile-release.yml` prints a notice and builds nothing         |
| EAS project link          | `owner` and `extra.eas.projectId` in `app.config.ts` | already set                                      | Re-run `eas init` only if the project changes                                                       |
| Per-environment variables | Every `EXPO_PUBLIC_*` and secret above               | EAS env (`development`, `preview`, `production`) | `eas.json` names the environments; it holds no values                                               |
| First credentials         | iOS distribution cert and profile, Android keystore  | EAS credentials                                  | One interactive `eas build -p ios` and `-p android` from a terminal (Apple login, keystore prompts) |

## 7. Apple (S-31)

| Item                                   | Name                                                                         | Where                  | Notes                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| Developer Program membership           | Apple team                                                                   | developer.apple.com    | Organisation needs a D-U-N-S number; start early                                         |
| App ID and app record                  | `com.triptrackr.app`                                                         | App Store Connect      | Capability: Sign in with Apple                                                           |
| App Store Connect app id               | `submit.production.ios.ascAppId`                                             | `apps/mobile/eas.json` | Replace `REPLACE_WITH_APP_STORE_CONNECT_APP_ID`; an id, not a secret                     |
| ASC API key (`.p8`, key id, issuer id) | uploaded to EAS credentials                                                  | EAS credentials        | Admin or App Manager role. Prefer EAS credentials over `ascApiKey*` fields               |
| Listing and review                     | privacy labels, age rating, 6.9-inch screenshots, review notes, demo account | App Store Connect      | `docs/release/store-readiness.md` section 1; demo password stays in the password manager |

## 8. Google Play (S-31)

| Item                                      | Name                                                                               | Where                               | Notes                                                                                                                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Play Console account                      | Developer account, app `com.triptrackr.app`                                        | Play Console                        | Play App Signing on; new personal accounts need a 12-tester, 14-day closed test                                                                                      |
| Service-account key (JSON)                | `submit.*.android.serviceAccountKeyPath` (`apps/mobile/play-service-account.json`) | EAS credentials, or that local path | Never commit it (the JSON is not gitignored by pattern: keep it out of `git add`). If the key is stored in EAS credentials, delete the `serviceAccountKeyPath` lines |
| First upload                              | Decision: manual first `.aab` or `eas submit`                                      | Play Console                        | The app must exist before `eas submit` can create a release                                                                                                          |
| SHA-1 certificates                        | upload and app-signing SHA-1                                                       | Google Cloud OAuth                  | For Google sign-in on Android                                                                                                                                        |
| Data safety, content rating, deletion URL | listing forms                                                                      | Play Console                        | `docs/release/store-readiness.md` section 2                                                                                                                          |

## 9. What the repository does for you once these exist

- `git tag vX.Y.Z` (or merging the release PR) runs `mobile-release.yml`: typecheck, lint, tests, then
  `eas build --profile production --auto-submit` behind your approval on `production-mobile`.
- `workflow_dispatch` with profile `preview` builds an internal-distribution test build and never submits.
- Dry run first: tag `v0.9.0-rc.1`, confirm the builds reach TestFlight and Play internal (S-30 evidence).
- Not automated by design: submitting the version for review, promoting beyond the internal track,
  signing the sign-off table in `docs/release/store-readiness.md`.
