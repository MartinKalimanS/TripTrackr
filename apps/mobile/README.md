# @triptrackr/mobile

The TripTrackr app: Expo SDK 57, Expo Router, iOS and Android only (research D-14). Part of the
npm-workspaces monorepo — run every command from the repository root unless noted.

Expo's APIs have changed. Before writing code against any Expo API, read the exact versioned page
under <https://docs.expo.dev/versions/v57.0.0/> (append `.md` for Markdown). This is a
constitutional requirement, not a suggestion (`.specify/memory/constitution.md`).

## Dev-client workflow

The app needs native modules (SQLCipher, Mapbox, Sentry), so it does not run in Expo Go. Build a
development client once, then iterate on JavaScript against it.

```sh
# 1. Native projects are generated, never committed (see root .gitignore).
cd apps/mobile
npx expo prebuild --clean            # add --platform ios|android to do one

# 2a. Build and install the dev client locally (Xcode / Android Studio toolchains required)
APP_VARIANT=development npx expo run:ios
APP_VARIANT=development npx expo run:android

# 2b. …or on EAS (no local toolchain; needs `eas init` once — see STORE_COMPLIANCE.md)
eas build --profile development --platform ios
eas build --profile development --platform android

# 3. Start the bundler; the dev client connects to it
npm run mobile                        # from the repo root, = `expo start` here
```

`APP_VARIANT=development` gives the dev build its own identifier (`com.triptrackr.app.dev`) so it
can sit next to a store build. On Windows use `npx cross-env APP_VARIANT=development …`.

Release-style builds: `eas build --profile preview` (internal distribution) and
`eas build --profile production` (auto-incremented build number, store distribution).

## Environment variables

Only `EXPO_PUBLIC_*` variables reach the JavaScript bundle; everything else stays on the build
machine. Local values go in the repository-root `.env` (git-ignored; `.env.example` lists them).

| Variable                                                                   | Purpose                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`                                                      | Base URL of the API (`apps/api`), without `/v1` — the client appends it (`src/lib/api-client.ts`). A physical device needs your machine's LAN address, not `localhost`. Required: the client fails loudly (`CONFIG`) when unset                                       |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Google OAuth client ids (iOS / Android client types) for "Continue with Google" (`src/components/auth/google-sign-in-button.tsx`). Public identifiers, not secrets. Optional — the button is hidden on a platform whose id is unset. The API must accept the same ids |
| `EXPO_PUBLIC_SENTRY_DSN`                                                   | Crash reporting. Optional — unset disables reporting (`src/lib/sentry.ts`)                                                                                                                                                                                            |
| `EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN`                                          | Public Mapbox token for the globe (US3)                                                                                                                                                                                                                               |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`     | RevenueCat public SDK keys (US9)                                                                                                                                                                                                                                      |
| `SENTRY_AUTH_TOKEN`                                                        | Build-time only: source-map upload                                                                                                                                                                                                                                    |
| `MAPBOX_DOWNLOADS_TOKEN` / `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`                  | Build-time only, and only if Mapbox's SDK fetch requires it (see STORE_COMPLIANCE.md)                                                                                                                                                                                 |
| `APP_VARIANT`                                                              | Build-time only: `development` switches the app identifier                                                                                                                                                                                                            |

## Checks

```sh
npm run typecheck -w apps/mobile
npm run lint -w apps/mobile
npm run test -w apps/mobile          # jest --ci; 80% coverage floor is enforced (jest.config.js)
cd apps/mobile && npx jest --ci --coverage
cd apps/mobile && npx expo config --type introspect   # validates app.config.ts and every plugin
cd apps/mobile && npm run e2e         # Maestro flows in e2e/ against an installed build
```

Route tests live in `test/app/`, not next to the routes — expo-router treats every file under
`src/app/` as a route (see `metro.config.js`).

The mobile suite runs its repository and migration tests against a **real SQLite database**
(`test/db/sqlite-harness.ts` adapts Node's built-in `node:sqlite` to the handful of statement
methods Drizzle's Expo driver calls). That needs Node ≥ 22.16 (`StatementSync.setReturnArrays`);
`.nvmrc` pins 22.

## Local database

Trips and stops are written to a SQLCipher-encrypted SQLite file first and read back through
Drizzle live queries; the network is a background reconciler (US6). One file per signed-in
account — `triptrackr-<user id>.db` — keyed by a 32-byte key kept in the keychain
(`src/lib/secure-store.ts`). Details and the v57 references are in `src/db/client.ts`.

Schema changes: edit `src/db/schema.ts`, then generate a migration and commit everything it
writes under `src/db/migrations/` (the `.sql`, `meta/`, and `migrations.js`):

```sh
cd apps/mobile && npx drizzle-kit generate
```

The `.sql` files are bundled as strings (`babel.config.js` `inline-import`, `metro.config.js`
`sourceExts`) and applied at launch, before any signed-in screen mounts.

## Layout

```text
src/app/            expo-router routes: _layout (root Stack + auth gate + local-store gate),
                    (auth), (tabs), trip/[id], modal, +not-found
src/components/     ui/ primitives (feature 002), navigation/ tab bar, trip/ (city picker,
                    stop editor, date field, status pill), auth/ (Apple, Google buttons),
                    require-local-store (gate), themed-*
src/db/             schema.ts (Drizzle, mirrors the contracts), client.ts (SQLCipher open +
                    migrations + React context), repositories/ (local-first writes, tombstones),
                    migrations/ (generated — never hand-edit)
src/features/       auth/ (session store, mutations, form copy), trips/ (live queries, actions,
                    status derivation, stop dates, form rules), geography/ (lookups + offline cache)
src/hooks/          use-appearance (the single appearance resolver), use-surface, use-debounced-value
src/theme/          tokens resolution, contrast gate helpers
src/constants/      design tokens — the only source of visual values (contract C1)
src/lib/            api-client (bearer + single-flight refresh), secure-store (keychain), sentry
test/               route, hook, and real-SQLite tests;  e2e/  Maestro flows;  assets/  placeholders
```

See `STORE_COMPLIANCE.md` for what the app config asserts to the stores and the decisions still
open, and `assets/README.md` for the brand art that must replace the placeholders.
