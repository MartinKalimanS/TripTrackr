# Store compliance and release configuration

Why `app.config.ts` and `eas.json` say what they say, and what a human must still decide or
run before the first submission. Companion to `assets/README.md` (brand art) and
`docs/release/store-readiness.md` (the checklist itself; tasks.md R014).

Everything here was verified against the v57 documentation on 2026-09-23:

| Field                                                                                                                                               | Verified against                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`, `name`, `version`, `platforms`, `scheme`, `orientation`, `userInterfaceStyle`, `icon`                                                       | <https://docs.expo.dev/versions/v57.0.0/config/app.md>                                                                                                                                                  |
| `ios.bundleIdentifier`, `ios.supportsTablet`, `ios.deploymentTarget`, `ios.infoPlist`, `ios.privacyManifests`, `ios.config.usesNonExemptEncryption` | same page; `deploymentTarget` is a top-level `ios` field since SDK 56 (the `expo-build-properties` equivalent is marked deprecated at <https://docs.expo.dev/versions/v57.0.0/sdk/build-properties.md>) |
| `android.package`, `android.adaptiveIcon`, `android.allowBackup`, `android.blockedPermissions`, `android.predictiveBackGestureEnabled`              | <https://docs.expo.dev/versions/v57.0.0/config/app.md>                                                                                                                                                  |
| `expo-build-properties` `android.enableMinifyInReleaseBuilds`, `android.enableShrinkResourcesInReleaseBuilds`                                       | <https://docs.expo.dev/versions/v57.0.0/sdk/build-properties.md>                                                                                                                                        |
| `expo-camera` plugin `cameraPermission`, `microphonePermission`, `recordAudioAndroid`, `barcodeScannerEnabled`                                      | <https://docs.expo.dev/versions/v57.0.0/sdk/camera.md>                                                                                                                                                  |
| `expo-image-picker` plugin `photosPermission`, `cameraPermission`, `microphonePermission`                                                           | <https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker.md>                                                                                                                                             |
| `expo-dev-client` plugin `addGeneratedScheme`                                                                                                       | <https://docs.expo.dev/versions/v57.0.0/sdk/dev-client.md>, <https://docs.expo.dev/build-reference/variants.md>                                                                                         |
| `expo-splash-screen` plugin `backgroundColor`, `image`, `imageWidth`                                                                                | <https://docs.expo.dev/versions/v57.0.0/sdk/splash-screen.md>                                                                                                                                           |
| `ios.usesAppleSignIn` + the `expo-apple-authentication` plugin (writes the `com.apple.developer.applesignin` entitlement; US1 T064)                 | <https://docs.expo.dev/versions/v57.0.0/sdk/apple-authentication.md>, <https://docs.expo.dev/versions/v57.0.0/config/app.md>                                                                            |
| `android.scheme` = the application id (Google sign-in redirect `<applicationId>:/oauthredirect`; iOS gets the bundle id scheme from prebuild)       | <https://docs.expo.dev/versions/v57.0.0/config/app.md>, <https://docs.expo.dev/versions/v57.0.0/sdk/auth-session.md>                                                                                    |
| Privacy manifest categories and reason codes                                                                                                        | <https://docs.expo.dev/guides/apple-privacy.md> plus the `PrivacyInfo.xcprivacy` files in `node_modules/{react-native,expo-constants,expo-device,expo-file-system}`                                     |
| `experiments.typedRoutes`, `experiments.reactCompiler`                                                                                              | <https://docs.expo.dev/versions/v57.0.0/config/app.md>, <https://docs.expo.dev/guides/react-compiler.md>                                                                                                |
| `eas.json` `cli.appVersionSource`, `build.*.developmentClient/distribution/env/autoIncrement`, `submit.production`                                  | <https://docs.expo.dev/eas/json.md>, <https://docs.expo.dev/build-reference/app-versions.md>                                                                                                            |
| `app.config.ts` shape (`ConfigContext`, `ExpoConfig` from `expo/config`)                                                                            | <https://docs.expo.dev/workflow/configuration.md>                                                                                                                                                       |

Deliberately **not** set, because the v57 documentation says so:

- `newArchEnabled` — "SDK 55 and later run entirely on the New Architecture … Remove it from
  your configuration to avoid confusion" (<https://docs.expo.dev/guides/new-architecture.md>). The
  key is absent from the v57 config schema (`@expo/config-types` 57.0.2).
- `android.edgeToEdgeEnabled` — edge-to-edge is always on since SDK 54; the key is absent from
  the v57 schema. Screens handle it with safe-area insets
  (<https://docs.expo.dev/guides/edge-to-edge-display.md>).
- `expo-build-properties` `android.targetSdkVersion` — SDK 57 / React Native 0.86 already
  targets API 36 (`react-native/gradle/libs.versions.toml`: `targetSdk = "36"`).
- `runtimeVersion` / `updates` — see "OTA updates" below.
- `UIBackgroundModes` — the app does no background work.

---

## Export compliance — `ITSAppUsesNonExemptEncryption: false` (LEGAL DECISION TO CONFIRM)

`ios.config.usesNonExemptEncryption: false` writes `ITSAppUsesNonExemptEncryption = false` to
Info.plist, which tells App Store Connect the app is exempt from U.S. export documentation and
skips the encryption questionnaire on every upload.

**Why this is believed correct.** The app's encryption is (a) HTTPS to the API, (b) the
platform Keychain/Keystore via `expo-secure-store`, and (c) SQLCipher (AES-256) for the
on-device database via `expo-sqlite` `useSQLCipher: true`. Under 15 CFR §740.17(b), encryption
that is limited to protecting a user's own data on their own device, using standard published
algorithms, and not for a restricted purpose, falls under the mass-market note / "standard
encryption" exemption category that Apple's questionnaire maps to `false`.

**What is NOT settled, and must be, by a person with authority to sign it:**

1. SQLCipher is _the app's own bundled_ crypto, not solely OS-provided crypto. That is exactly
   the case where the exemption may require the developer (not Apple) to file an **annual
   self-classification report** with the U.S. Bureau of Industry and Security (BIS) and the ENC
   Encryption Request Coordinator by 1 February each year, for the preceding calendar year.
   Decide whether TripTrackr files, or whether counsel concludes it is not required.
2. If the business is not U.S.-based, the U.S. rules still apply to distribution through Apple's
   U.S. entity. Confirm with counsel; do not infer from this file.
3. Record the decision and its date in `docs/legal/` before the first TestFlight upload, since
   the flag is asserted on every upload from then on.

If the answer is "we are not sure", remove `ios.config.usesNonExemptEncryption` and answer
Apple's questionnaire manually on the first upload — slower, but never wrong by default.

---

## iOS permission strings

Set through the plugin props that own each key, so the string cannot drift from the native
module that triggers the prompt (App Store Review 5.1.1(i) requires purpose strings to explain
the actual use):

| Info.plist key                      | Source                                                                                                           | Copy                                                                                                                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NSCameraUsageDescription`          | `expo-camera` and `expo-image-picker` `cameraPermission` (identical copy in both, so plugin order is irrelevant) | "TripTrackr uses the camera to photograph your trip and to scan boarding passes into your documents."                                                                           |
| `NSPhotoLibraryUsageDescription`    | `expo-image-picker` `photosPermission`                                                                           | "TripTrackr uses your photo library so you can add photos to a trip and read where and when they were taken." (spec 006: "Add photos" asks for the library)                     |
| `NSPhotoLibraryAddUsageDescription` | `ios.infoPlist` (no plugin owns it)                                                                              | "TripTrackr saves photos you export from a trip to your library." — only needed once export-to-library ships (US4); harmless before that, but remove it if that feature is cut. |
| `NSMicrophoneUsageDescription`      | **absent** — `microphonePermission: false` on both plugins                                                       | No audio is recorded. On Android the same setting removes `RECORD_AUDIO`.                                                                                                       |

Localisation, when it comes: keep the plugin props at their defaults and add the strings to
each locale file under `ios` (v57 expo-camera page, "To localize…").

## iOS privacy manifest

`ios.privacyManifests` declares the required-reason APIs the dependency tree calls, with the
reason codes copied from each package's shipped `PrivacyInfo.xcprivacy`:

| Category                                     | Reasons                      | Declared by                    |
| -------------------------------------------- | ---------------------------- | ------------------------------ |
| `NSPrivacyAccessedAPICategoryUserDefaults`   | `CA92.1`                     | react-native, expo-constants   |
| `NSPrivacyAccessedAPICategoryFileTimestamp`  | `C617.1`, `0A2A.1`, `3B52.1` | react-native, expo-file-system |
| `NSPrivacyAccessedAPICategorySystemBootTime` | `35F9.1`                     | react-native, expo-device      |
| `NSPrivacyAccessedAPICategoryDiskSpace`      | `E174.1`, `85F4.1`           | expo-file-system               |

`NSPrivacyTracking: false` — the app has no advertising or cross-app tracking SDK.
`@sentry/react-native`, `@rnmapbox/maps`, and `react-native-purchases` ship their own manifests
inside their pods; if Apple's post-upload email names an API not listed above, add it here (the
guide describes exactly this loop). Alternatively `expo-build-properties`
`ios.privacyManifestAggregationEnabled: true` merges pod manifests automatically; it is left off
until the first upload confirms which is needed.

**Data-collection disclosure** (`NSPrivacyCollectedDataTypes`, and the App Store "App Privacy"
and Play "Data safety" forms) is NOT filled in here. It depends on what the API stores and on
the Sentry configuration (research D-18: no replay, no PII, request bodies scrubbed), and must be
completed by the owner from `docs/legal/` once US1 lands.

## Android permissions

`android.blockedPermissions` removes, with `tools:node="remove"`, permissions that dependencies
declare and the product does not use — so the Play Console permission declarations can be
answered truthfully with "not used" (the photo-library permissions are the exception, below):

| Permission                                                          | Declared by                    | Why blocked                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `com.google.android.gms.permission.AD_ID`                           | transitive Play Services       | No ads, no advertising ID. Play's Data safety form asks.                                                                                                                                                                                                                                                                                                                                                |
| `android.permission.READ_MEDIA_VIDEO`                               | transitive                     | The app adds images only, never videos. Play restricts the media permissions to core photo/video apps and requires a declaration.                                                                                                                                                                                                                                                                       |
| `android.permission.ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` | `@rnmapbox/maps`               | The globe draws trips, never the device's position. No location feature exists in the spec. Play requires a location declaration and a prominent disclosure if these are present — blocking them is what makes that form a "no". **If a location feature is specified later, remove these two entries, add the purpose to the Play declaration, and add `NSLocationWhenInUseUsageDescription` on iOS.** |
| `android.permission.RECORD_AUDIO`                                   | expo-camera, expo-image-picker | Removed by the plugins' `microphonePermission: false` / `recordAudioAndroid: false`.                                                                                                                                                                                                                                                                                                                    |

**Declared on purpose (spec 006, owner decision 2026-10-22: "Add photos" asks for the photo
library).** `android.permissions` adds `READ_MEDIA_IMAGES` (Android 13+) and
`READ_MEDIA_VISUAL_USER_SELECTED` (Android 14+, "Select photos"), and `READ_EXTERNAL_STORAGE` is
no longer blocked (Android 12 and below, `maxSdkVersion 32`; the picker's request asks it). They
are asked at run time (`features/photos/library-permission.ts`), only when the traveller taps "Add
photos". Not declared: `ACCESS_MEDIA_LOCATION` (plan D6-06). Play's "Photo and video permissions"
policy restricts `READ_MEDIA_IMAGES`: the declaration to prepare is in
`docs/release/store-readiness.md`. **A permission change is native: a new build is required.**

`allowBackup: false`: the SQLCipher database is keyed from the Keystore, so a Google Drive backup
would carry an undecryptable file off the device for no benefit; the sync engine (US6) is the
restore path.

## Account deletion (App Store 5.1.1(v), Play "account deletion" policy)

Both stores require that an app which lets users create an account also lets them delete it
in-app, and Play additionally requires a web URL for deletion requests. The Profile tab already
shows a disabled "Delete account" row so the entry point cannot be forgotten; it is enabled by
tasks.md T188 (`DELETE /me` with the object-storage sweep, Constitution V). The web URL is
`docs/legal/` (R014).

## Versioning

`eas.json` sets `cli.appVersionSource: "remote"` and `build.production.autoIncrement: true`
(<https://docs.expo.dev/build-reference/app-versions.md>): EAS stores and bumps
`ios.buildNumber` / `android.versionCode`; the user-facing `version` in `app.config.ts` is bumped
by hand for each release. Consequences:

- Do not add `buildNumber`/`versionCode` to `app.config.ts`; they would be ignored.
- The Profile tab shows the bare `version` in store builds (the build number is stamped into
  the binary, not the config). Adopt `expo-application` (`Application.nativeBuildVersion`) when
  the build number should be visible in-app.
- Sentry `dist` follows the same rule (`src/lib/sentry.ts`): set from config when present,
  otherwise the SDK reads the native build number.

## EAS project identity — DONE (2026-09-23)

The app is linked to `@martinkaliman/triptrackr` (project id
`4c7cfcc9-2e03-4863-b096-4f173627961f`); `owner` and `extra.eas.projectId` live in
`app.config.ts`. The id is not a secret — it names the project, it grants nothing.

Two things to know if this ever has to be redone:

- Run `eas init` from **`apps/mobile`**, not the repository root. With a dynamic config the CLI
  cannot write into `app.config.ts` (<https://docs.expo.dev/workflow/configuration.md>,
  "Configuration resolution rules"); from the root it writes a stray `app.json` that Expo never
  reads. Copy the printed values into `app.config.ts` by hand and delete whatever the CLI wrote.
- The same id must be used by every `APP_VARIANT`, so dev-client and store builds share one
  project, its credentials, and its build history.

`submit.production` is `{}` on purpose. Fill `ios.ascAppId` (App Store Connect app id) and
`android.serviceAccountKeyPath`/`track` when the store records exist; until then `eas submit`
prompts interactively (<https://docs.expo.dev/eas/json.md>, "EAS Submit").

## Build-time secrets (never in the repo)

| Variable                                                                                                                                         | Used by                                               | Where to set                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SENTRY_AUTH_TOKEN`                                                                                                                              | `@sentry/react-native/expo` plugin, source-map upload | EAS secret (`eas env:create`), local shell for `expo run:*` release builds                                                                                                                                                                                        |
| `EXPO_PUBLIC_SENTRY_DSN`                                                                                                                         | `src/lib/sentry.ts` (inlined at bundle time)          | EAS env per profile; `.env` locally. Optional: a missing DSN disables reporting rather than failing the build.                                                                                                                                                    |
| `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` (the generated Gradle also reads a `MAPBOX_DOWNLOADS_TOKEN` project property, which is what `.env.example` lists) | `@rnmapbox/maps` Gradle/Podfile (`System.getenv`)     | EAS secret. The installed plugin marks the token deprecated — "no longer required by Mapbox" — so it is only needed if a build fails fetching the SDK. Do NOT use the plugin's `RNMapboxMapsDownloadToken` prop; it writes the token into generated native files. |
| `EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN`                                                                                                                | runtime public token for tiles (US3)                  | EAS env; rotate if leaked — it is embedded in the bundle by design.                                                                                                                                                                                               |

## OTA updates (not enabled)

`expo-updates` is not installed, so `runtimeVersion` and `updates` are omitted; a build only
ever runs the JavaScript it shipped with, and the store review sees exactly what travellers get.
To enable EAS Update later:

1. `npx expo install expo-updates` (the only step that touches `package.json`).
2. Add `runtimeVersion: { policy: 'fingerprint' }` to `app.config.ts`
   (<https://docs.expo.dev/versions/v57.0.0/config/app.md>, `runtimeVersion`), and
   `updates.url` from `eas update:configure`.
3. Add `channel` to the `preview` and `production` profiles in `eas.json`.
4. Re-read <https://docs.expo.dev/eas-update/introduction.md> for the SDK in use at that time.

## App variants

`APP_VARIANT=development` switches the identifier to `com.triptrackr.app.dev` and the name to
"TripTrackr (Dev)" so a development build and the store build coexist on one device
(<https://docs.expo.dev/build-reference/variants.md>). The `development` profile in `eas.json`
sets it; locally run `APP_VARIANT=development npx expo run:ios|android` (or `cross-env` on
Windows) and re-run `npx expo prebuild --clean` when switching variants. The URL scheme stays
`triptrackr` for both — a deep link on a device with both installed may open the dev build; if
that becomes a nuisance, give the dev variant `triptrackr-dev` (the field accepts one scheme
per variant).
