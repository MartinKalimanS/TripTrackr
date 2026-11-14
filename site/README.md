# TripTrackr public site

Static, dependency-free site for the store listings and the email links (roadmap step S-32).

| Page                                                        | Source                          |
| ----------------------------------------------------------- | ------------------------------- |
| `/privacy`, `/terms`, `/account-deletion`                   | `docs/legal/*.md` (rendered)    |
| `/`, `/support`, `404`                                      | `site/src/pages/`               |
| `/reset-password?token=…`, `/verify-email?token=…` (bridge) | `site/src/pages/` + `bridge.js` |

```bash
npm run site:build              # -> site/dist (git-ignored)
npm run site:build -- --strict  # fails while a [[PLACEHOLDER: ...]] or draft banner remains
node --test scripts/build-site.test.mjs
```

## Configuration (environment, all optional)

| Variable             | Default                  | Fills                                            |
| -------------------- | ------------------------ | ------------------------------------------------ |
| `SITE_URL`           | `https://triptrackr.app` | sitemap; must equal the API's `APP_PUBLIC_URL`   |
| `SITE_CONTACT_EMAIL` | `support@triptrackr.app` | site chrome and `[[PLACEHOLDER: contact email]]` |
| `SITE_COMPANY`       | `TripTrackr`             | site chrome (`__COMPANY__`)                      |
| `SITE_APP_SCHEME`    | `triptrackr`             | bridge deep link (`app.config.ts` `scheme`)      |
| `SITE_LEGAL_ENTITY`  | none (placeholder stays) | entity name and "entity and registered address"  |
| `SITE_ADDRESS`       | none                     | registered address                               |
| `SITE_JURISDICTION`  | none                     | jurisdiction                                     |
| `SITE_LAST_UPDATED`  | none                     | the "Last updated" date                          |

Placeholders the variables cannot answer (hosting provider, retention periods, ...) are edited in
`docs/legal/` after counsel review. Once they are all filled and the draft banners removed, set the
repository variable `SITE_STRICT=true` so a deploy can never ship an open placeholder.

## Bridge pages

The API emails `${APP_PUBLIC_URL}/reset-password?token=…` and `/verify-email?token=…`. The page
validates `token` against `^[A-Za-z0-9_-]{16,200}$`, opens `triptrackr://<page>?token=…` and shows an
"Open the app" button as the fallback. The token is never logged, stored or sent: no network
call in the script, CSP `connect-src 'none'`, `Referrer-Policy: no-referrer`, `no-store`, and the
query is stripped from the address bar. For the link to open the app from a mail client it must
resolve to this site, so point `APP_PUBLIC_URL` at it.

## Deployment (Cloudflare Pages, `.github/workflows/site.yml`)

Owner provides: the domain and DNS (apex to the Pages project; `api.` stays on the API), the support
mailbox, and in the repository settings:

- secrets `CLOUDFLARE_API_TOKEN` (Pages edit), `CLOUDFLARE_ACCOUNT_ID`;
- variables `CF_PAGES_PROJECT`, `SITE_DEPLOY=true`, the `SITE_*` values above, later `SITE_STRICT=true`;
- the environment `production-site` (optionally with a required reviewer).

GitHub Pages is not used. Deploys happen on pushes to `main` that touch `site/`, `docs/legal/` or the builder.
