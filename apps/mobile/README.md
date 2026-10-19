# @triptrackr/mobile

The TripTrackr app: Expo SDK 57, Expo Router, iOS and Android only (research D-14). Part of the
npm-workspaces monorepo — run every command from the repository root unless noted.

Expo's APIs have changed. Before writing code against any Expo API, read the exact versioned page
under <https://docs.expo.dev/versions/v57.0.0/> (append `.md` for Markdown). This is a
constitutional requirement, not a suggestion (`.specify/memory/constitution.md`).

## One command on an Android phone (Windows)

```powershell
.\run-on-phone.cmd              # from the repository root; options pass through
```

`scripts/run-on-phone.ps1` does the steps below for you, and is safe to re-run: it starts Docker
and the dev stack, points `S3_PUBLIC_ENDPOINT` (root `.env`) and `EXPO_PUBLIC_API_URL`
(`apps/mobile/.env.local`) at the right address, offers to import the GeoNames city catalogue the
first time, builds and installs the development client when it is missing or `package.json` /
`app.config.ts` changed, starts Metro in its own window and opens the app.

| Connection (`-Connection`) | How the phone reaches the PC                              | Use it when                                                                                            |
| -------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `Usb`                      | `adb reverse` through the cable; the app uses `localhost` | The Windows network is **Public** (campus, cafe), or you want no firewall change. `Auto` picks it then |
| `Lan`                      | The PC's Wi-Fi address, plus a one-time firewall rule     | You want airplane mode to genuinely cut the API (offline-sync tests); needs a Private network          |

`adb reverse` keeps working in airplane mode, so with `Usb` go offline with
`adb reverse --remove-all` and come back by running the script again. Other switches: `-Check`
(report only), `-BackendOnly`, `-SkipBackend`, `-RebuildApp`, `-ImportGeo`, `-NoApiBuild`,
`-Device <serial>`, `-HostIp <address>`, `-Stop`. iOS is not supported from Windows.

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

# 3. Start the bundler with the same variant; the dev client connects to it
APP_VARIANT=development npm run mobile   # from the repo root, = `expo start` here
```

`APP_VARIANT=development` gives the dev build its own identifier (`com.triptrackr.app.dev`) so it
can sit next to a store build. The bundler needs it too: without it, `expo start` looks for
`com.triptrackr.app` and reports that no development build is installed. On Windows use
`npx cross-env APP_VARIANT=development …`, or in PowerShell `$env:APP_VARIANT = "development"`
first.

Release-style builds: `eas build --profile preview` (internal distribution) and
`eas build --profile production` (auto-incremented build number, store distribution).

**Rebuild the dev client after the Atlas redesign (feature 004).** The redesign added native code that
an older dev client does not contain: the native modules `react-native-svg`, `expo-blur` and
`expo-haptics` (used by the kit and the feedback layer), and the `expo-font` config plugin, which
embeds the two weights of the display face into the binary at build time (`app.config.ts`). A
JavaScript reload cannot add either: a stale client typically fails at launch with a missing native
module, or draws headings in the platform face. Reinstall once with the root `npm ci`, then repeat
step 1 and step 2 above (`npx expo prebuild --clean`, then `expo run:*` or `eas build`), and start
Metro with `--clear` the first time (`npx expo start --clear` from `apps/mobile`) so the Uniwind
stylesheet is rebuilt.

## The Atlas look (feature 004)

The app is drawn in one visual language, Atlas, in four themes: `light`, `dark`, `light-contrast` and
`dark-contrast`. The device scheme plus the increased-contrast setting select the theme
(`useAppearance().themeName`, contract C4-4); the root layout hands it to Uniwind and nothing else sets it.
The soft-shadow look of feature 002 is retired: `test/no-neumorphism.test.ts` searches `src/` for its
primitives, props and name, and fails on any trace (SC-001; the same search is quickstart section 9 of the
feature).

- **Colours** are authored once, in `src/theme/palette.data.js`. Screens and components never write a
  colour: they use a semantic class (`bg-background`, `text-muted`) or, where code must hand over a
  value (a navigation option, a scene), `useAppearance().tokens`, which is the palette of the active
  theme. ESLint rejects a colour literal in `src/app` and `src/components` (contract C4-1,
  `specs/004-app-ui-redesign/contracts/design-tokens.md`).
- **The kit** is `heroui-native` on `uniwind`, and only `src/components/ui/*` imports either. Everything
  else composes those adapters (`Button`, `Field`, `Card`, `ListGroup`, `Chip`, `Screen`, `ListScreen`...),
  so a change of kit never touches a screen (research D4-02, D4-03).
- **The stylesheet** `src/theme/generated/theme.css` is generated from the palette. After changing a
  colour run `npm run theme:build -w apps/mobile` from the repository root and commit the result;
  `npm run theme:check -w apps/mobile` exits 1 when the committed file is stale, and a Jest test fails
  the same way. `src/global.css` is the stylesheet entry (Metro hands it to Uniwind through
  `cssEntryFile` in `metro.config.js`); restart Metro with `--clear` after editing it.
- **Fonts.** Headings use Bricolage Grotesque, two weights (600 SemiBold and 700 Bold) from
  `@expo-google-fonts/bricolage-grotesque`, embedded by the `expo-font` plugin in `app.config.ts` (the
  pick is provisional until the device check, research D4-07). Body text stays in the platform face, so
  Dynamic Type and Android font scaling work unchanged. The family names are declared in `src/global.css`
  and checked against the font files by `test/theme/global-css.test.ts`.

## The component gallery (feature 005, T524)

Every adapter of the Sunrise Passport look is on one page, in the four themes at text scale 1 and 2:
type specimen and numerals, buttons (rest, held, busy, disabled), icon buttons over a surface and over
a white photograph, chips and status, cards, rows, tiles, the trip cards, fields, every skeleton,
the empty states, banners, toasts, the permission state, scrims, stamps, generated covers, the sheet at
its three detents and the tab bars. The theme and scale switches at the top repaint the page live.

It exists **only in a development build**: the root layout admits the `(dev)` group behind
`Stack.Protected guard={__DEV__}`, and the route loads the page with a `require` inside
`if (__DEV__)`, so a release build neither reaches it nor contains it. Open it with a link, with the
dev client running and the bundle loaded:

```sh
# Android phone or emulator (the dev client registers its package name as a scheme)
adb shell am start -a android.intent.action.VIEW -d "com.triptrackr.app.dev:///gallery"
# iOS Simulator
xcrun simctl openurl booted "com.triptrackr.app.dev:///gallery"
```

The route is `/gallery`. On a physical iPhone, open the link from Notes or Safari. Back returns to the
app. The scale switch is a **layout** scale (minimum heights and reflow); glyphs follow the system text
size, so set the phone's font size to the largest as well when judging scale 2. Glass and blur on the
tab pill are iOS only. The screenshot harness is `e2e/gallery.yaml` (`e2e/__baselines__/README.md`:
baselines are recorded on a device and committed, never invented). The source is
`src/components/dev/` and `src/app/(dev)/`; nothing else imports it (`test/dev/gallery-source.test.ts`).

## Environment variables

Only `EXPO_PUBLIC_*` variables reach the JavaScript bundle; everything else stays on the build
machine. Expo CLI reads `.env` files from this directory only, not the repository root, so the
app's values go in `apps/mobile/.env.local` (git-ignored); the root `.env` keeps the API's and
the build's. `.env.example` lists them all. From the repository root, copy the public ones with
`grep '^EXPO_PUBLIC_' .env > apps/mobile/.env.local` (PowerShell:
`Select-String -Path .env -Pattern '^EXPO_PUBLIC_' | ForEach-Object Line | Set-Content apps/mobile/.env.local`).

| Variable                                                                   | Purpose                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`                                                      | Base URL of the API (`apps/api`), without `/v1` — the client appends it (`src/lib/api-client.ts`). A physical device needs your machine's LAN address, not `localhost` (over USB, `adb reverse tcp:3000 tcp:3000` makes `localhost` work). Required: the client fails loudly (`CONFIG`) when unset |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Google OAuth client ids (iOS / Android client types) for "Continue with Google" (`src/components/auth/google-sign-in-button.tsx`). Public identifiers, not secrets. Optional — on a platform whose id is unset the button shows disabled, as "Coming soon". The API must accept the same ids       |
| `EXPO_PUBLIC_SENTRY_DSN`                                                   | Crash reporting. Optional — unset disables reporting (`src/lib/sentry.ts`)                                                                                                                                                                                                                         |
| `EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN`                                          | Public Mapbox token for the globe (US3)                                                                                                                                                                                                                                                            |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`     | RevenueCat public SDK keys (US9)                                                                                                                                                                                                                                                                   |
| `SENTRY_AUTH_TOKEN`                                                        | Build-time only: source-map upload                                                                                                                                                                                                                                                                 |
| `MAPBOX_DOWNLOADS_TOKEN` / `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`                  | Build-time only, and only if Mapbox's SDK fetch requires it (see STORE_COMPLIANCE.md)                                                                                                                                                                                                              |
| `APP_VARIANT`                                                              | Build-time only: `development` switches the app identifier                                                                                                                                                                                                                                         |

## Checks

```sh
npm run typecheck -w apps/mobile
npm run lint -w apps/mobile
npm run test -w apps/mobile          # jest --ci; 80% coverage floor is enforced (jest.config.js)
npm run theme:check -w apps/mobile   # theme.css is up to date with the palette
cd apps/mobile && npx jest --ci --coverage
cd apps/mobile && npx expo config --type introspect   # validates app.config.ts and every plugin
cd apps/mobile && npm run e2e         # Maestro flows in e2e/ against an installed build
```

On Windows (see `AGENTS.md`), run Jest and ESLint from `apps/mobile`, one Jest process at a time (a second
one starves the first's transform and times its tests out), and filter Jest by a path **regex fragment**,
never a slash path (a slash never matches the backslashed paths):

```sh
cd apps/mobile
npx jest use-appearance              # every test file whose path matches the fragment
npx jest "root-layout\.test" "tabs-layout\.test"   # several fragments at once; quote a backslash
npx jest --coverage --maxWorkers=4   # the whole suite with the 80% floor
npx eslint .                         # the same as `npm run lint`; --max-warnings=0 in CI
npx prettier --check src test        # route files need character classes, because Prettier reads ( ) [ ] in a
                                     # path as glob syntax: npx prettier --write "src/app/[(]auth[)]/login.tsx"
```

Do not filter by a word that is in every path (a checkout directory's own name, for one), or the
filter selects the whole suite.

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
src/components/     ui/ the Atlas adapters over the kit (the only folder that imports it),
                    navigation/ tab bar, globe/ (the one map), trip/ (city picker, stop
                    editor, date field), auth/ (Apple, Google buttons), sync/,
                    require-local-store (gate)
src/db/             schema.ts (Drizzle, mirrors the contracts), client.ts (SQLCipher open +
                    migrations + React context), repositories/ (local-first writes, tombstones),
                    migrations/ (generated — never hand-edit)
src/features/       auth/ (session store, mutations, form copy), trips/ (live queries, actions,
                    status derivation, stop dates, form rules), geography/ (lookups + offline cache)
src/hooks/          use-appearance (the single appearance resolver, four themes) and its shared
                    store, use-haptics, use-debounced-value
src/theme/          palette.data.js (the one place a colour is authored), generated/theme.css,
                    type, shape and motion tables, contrast helpers
src/constants/      what code hands over instead of a class: colour tokens per theme, spacing,
                    touch target, the globe's constants (contract C4-1)
src/global.css      the Tailwind and Uniwind stylesheet entry (display font families)
src/lib/            api-client (bearer + single-flight refresh), secure-store (keychain), sentry
test/               route, hook, and real-SQLite tests;  e2e/  Maestro flows;  assets/  placeholders
```

See `STORE_COMPLIANCE.md` for what the app config asserts to the stores and the decisions still
open, and `assets/README.md` for the brand art that must replace the placeholders.
