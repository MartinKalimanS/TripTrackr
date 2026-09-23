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

| Variable                                                               | Purpose                                                                                               |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`                                                  | Base URL of the API (`apps/api`). A physical device needs your machine's LAN address, not `localhost` |
| `EXPO_PUBLIC_SENTRY_DSN`                                               | Crash reporting. Optional — unset disables reporting (`src/lib/sentry.ts`)                            |
| `EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN`                                      | Public Mapbox token for the globe (US3)                                                               |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | RevenueCat public SDK keys (US9)                                                                      |
| `SENTRY_AUTH_TOKEN`                                                    | Build-time only: source-map upload                                                                    |
| `MAPBOX_DOWNLOADS_TOKEN` / `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`              | Build-time only, and only if Mapbox's SDK fetch requires it (see STORE_COMPLIANCE.md)                 |
| `APP_VARIANT`                                                          | Build-time only: `development` switches the app identifier                                            |

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

## Layout

```text
src/app/            expo-router routes: _layout (root Stack + auth gate), (auth), (tabs),
                    trip/[id], modal, +not-found
src/components/     ui/ primitives (feature 002), navigation/ tab bar, themed-*
src/features/       feature-scoped stores, queries, mutations (auth/session-store.ts)
src/hooks/          use-appearance (the single appearance resolver), use-surface
src/theme/          tokens resolution, contrast gate helpers
src/constants/      design tokens — the only source of visual values (contract C1)
src/lib/            sentry, (api client and secure-store wrapper arrive in T039/T040)
test/               route and integration tests;  e2e/  Maestro flows;  assets/  placeholders
```

See `STORE_COMPLIANCE.md` for what the app config asserts to the stores and the decisions still
open, and `assets/README.md` for the brand art that must replace the placeholders.
