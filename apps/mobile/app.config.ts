/**
 * Expo app config — tasks.md R011.
 *
 * A dynamic config rather than app.json for one reason: `APP_VARIANT` switches
 * the application identifier so a development build and the store build can be
 * installed on the same device (https://docs.expo.dev/build-reference/variants.md).
 * Everything else would have been static JSON.
 *
 * Every field below was checked against the v57 reference
 * (https://docs.expo.dev/versions/v57.0.0/config/app.md) or the named plugin's
 * v57 page. Two fields the audit expected are deliberately ABSENT because the
 * v57 documentation says so:
 *   - `newArchEnabled` — "SDK 55 and later run entirely on the New
 *     Architecture … Remove it from your configuration to avoid confusion"
 *     (https://docs.expo.dev/guides/new-architecture.md). It is not in the
 *     v57 schema.
 *   - `runtimeVersion` / `updates` — meaningful only with `expo-updates`, which
 *     is not installed. See STORE_COMPLIANCE.md for enabling OTA later.
 *
 * The trade-off of a dynamic config (https://docs.expo.dev/workflow/configuration.md,
 * "Configuration resolution rules"): CLI tools cannot write to it. `eas init`
 * will print the `extra.eas.projectId` for the owner to paste in by hand.
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

const IS_DEV = process.env.APP_VARIANT === 'development';

/** iOS bundle identifier and Android application id — identical on purpose. */
const APP_ID = IS_DEV ? 'com.triptrackr.app.dev' : 'com.triptrackr.app';

/**
 * MUST equal `SplashBackground` in src/constants/theme.ts. The config is
 * evaluated by Node, where react-native cannot be imported, so the value is
 * repeated here and the theme file carries the same warning.
 */
const SPLASH_BACKGROUND = '#208AEF';

/** Product copy for the iOS permission prompts (App Store Review 5.1.1(i)). */
const PERMISSION_COPY = {
  camera:
    'TripTrackr uses the camera to photograph your trip and to scan boarding passes into your documents.',
  photos:
    'TripTrackr reads the photos you choose so you can add them to a trip. It never browses your library on its own.',
  photosAdd: 'TripTrackr saves photos you export from a trip to your library.',
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_DEV ? 'TripTrackr (Dev)' : 'TripTrackr',
  slug: 'triptrackr',
  // EAS project identity, as linked by `eas init` on 2026-09-23. The project id
  // is not a secret — it names the project on expo.dev, it grants nothing — and
  // it must be identical for every variant so dev and store builds share one
  // EAS project, its credentials, and its build history.
  owner: 'martinkaliman',
  extra: {
    ...config.extra,
    eas: { projectId: '4c7cfcc9-2e03-4863-b096-4f173627961f' },
  },
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'triptrackr',
  userInterfaceStyle: 'automatic',
  // iOS and Android only (research D-14). Stated so that a stray `react-dom`
  // in the tree can never re-enable a web target by default.
  platforms: ['ios', 'android'],

  ios: {
    bundleIdentifier: APP_ID,
    supportsTablet: false,
    // Top-level field since SDK 56; the expo-build-properties equivalent is
    // marked deprecated on its v57 page.
    deploymentTarget: '15.1',
    // Sign in with Apple (FR-002; US1 T064). Enables the capability — the
    // `com.apple.developer.applesignin` entitlement — together with the
    // `expo-apple-authentication` plugin below
    // (https://docs.expo.dev/versions/v57.0.0/sdk/apple-authentication.md,
    // "Setup iOS project"; https://docs.expo.dev/versions/v57.0.0/config/app.md
    // `ios.usesAppleSignIn`). Apple requires it on any app offering another
    // third-party sign-in, which the Google button is.
    usesAppleSignIn: true,
    config: {
      // Writes `ITSAppUsesNonExemptEncryption: false` to Info.plist
      // (@expo/config-plugins withUsesNonExemptEncryption). Rationale and the
      // open legal question are in STORE_COMPLIANCE.md.
      usesNonExemptEncryption: false,
    },
    infoPlist: {
      // Camera and photo-library read prompts are set through the expo-camera
      // and expo-image-picker plugin props below; this is the one string
      // neither plugin owns.
      NSPhotoLibraryAddUsageDescription: PERMISSION_COPY.photosAdd,
    },
    // Required-reason API declarations for the dependencies that call them
    // (https://docs.expo.dev/guides/apple-privacy.md). Reasons are the union of
    // the PrivacyInfo.xcprivacy files shipped in node_modules by react-native,
    // expo-constants, expo-device, and expo-file-system.
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1', '0A2A.1', '3B52.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1', '85F4.1'],
        },
      ],
    },
  },

  android: {
    package: APP_ID,
    // Google sign-in (FR-002; US1 T064) returns to the app through
    // `<applicationId>:/oauthredirect` (expo-auth-session Google provider).
    // iOS registers the bundle id as a URL scheme automatically; Android only
    // registers what is listed, so the package name is added here
    // (https://docs.expo.dev/versions/v57.0.0/config/app.md `android.scheme`).
    scheme: APP_ID,
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    // The local database holds journals, expenses, and boarding passes under
    // SQLCipher. A Google Drive backup would copy the encrypted file AND the
    // Keystore-protected key's absence would make it useless — so nothing is
    // gained and a copy of private data leaves the device. Off.
    allowBackup: false,
    // Removed from the merged manifest with `tools:node="remove"`. Each entry
    // is a permission a dependency declares and this product does not use:
    //   AD_ID                 — no advertising SDK; Play's Data safety form
    //                            must be able to say so truthfully.
    //   READ_MEDIA_*,
    //   READ_EXTERNAL_STORAGE — photos arrive through the system photo picker,
    //                            which needs no storage permission; Play
    //                            restricts these to core photo/video apps.
    //   ACCESS_*_LOCATION     — @rnmapbox/maps declares them; the globe draws
    //                            trips, never the device's position. Re-enable
    //                            only with a spec'd feature (see STORE_COMPLIANCE.md).
    blockedPermissions: [
      'com.google.android.gms.permission.AD_ID',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
    ],
    predictiveBackGestureEnabled: false,
  },

  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: SPLASH_BACKGROUND,
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    ['expo-sqlite', { useSQLCipher: true }],
    'expo-secure-store',
    // Sign in with Apple capability; pairs with `ios.usesAppleSignIn` above
    // (https://docs.expo.dev/versions/v57.0.0/sdk/apple-authentication.md,
    // "Example app.json with config plugin"). No config plugin exists for
    // @react-native-community/datetimepicker on its v57 page; its optional
    // Android theming plugin is not needed (the system dialog is used as-is).
    'expo-apple-authentication',
    [
      'expo-camera',
      {
        cameraPermission: PERMISSION_COPY.camera,
        // No audio is ever recorded: drop the microphone prompt on iOS and
        // RECORD_AUDIO on Android (v57 expo-camera plugin props).
        microphonePermission: false,
        recordAudioAndroid: false,
        // Boarding-pass scanning (US5) reads barcodes through the camera.
        barcodeScannerEnabled: true,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: PERMISSION_COPY.photos,
        // Same copy as expo-camera so whichever plugin writes the key last,
        // the traveller reads the product's words.
        cameraPermission: PERMISSION_COPY.camera,
        microphonePermission: false,
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          // R8 + resource shrinking in release (v57 build-properties page).
          // `targetSdkVersion` is NOT set: SDK 57 / RN 0.86 defaults to 36.
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
        },
        ios: {},
      },
    ],
    [
      // Development builds register a URL scheme so Expo CLI can open them;
      // the store build must not, or QR codes would launch the wrong app
      // (https://docs.expo.dev/build-reference/variants.md).
      'expo-dev-client',
      { addGeneratedScheme: IS_DEV },
    ],
    [
      // The ONE Sentry entry. The bare "@sentry/react-native" the wizard also
      // added was a duplicate of this plugin. Source-map upload credentials
      // come from SENTRY_AUTH_TOKEN at build time, never from here.
      '@sentry/react-native/expo',
      {
        url: 'https://sentry.io/',
        organization: 'triptrackr',
        project: 'triptrackr-mobile',
      },
    ],
    // Bare: the SDK download token, if Mapbox ever requires one again, is read
    // from RNMAPBOX_MAPS_DOWNLOAD_TOKEN at build time (see STORE_COMPLIANCE.md).
    '@rnmapbox/maps',
    [
      // The display face (feature 004, research D4-07): two weights, embedded at build
      // time so they are there on the first frame, with no run-time load
      // (https://docs.expo.dev/versions/v57.0.0/sdk/font.md, "Configuration in app
      // config"). PROVISIONAL: the final pick is made on a device in T408. Paths are
      // relative to this project and the package is hoisted to the repository root's
      // node_modules; test/config/app-config.test.ts fails if a file is not there. The
      // family names the two platforms register are in src/global.css.
      'expo-font',
      {
        fonts: [
          '../../node_modules/@expo-google-fonts/bricolage-grotesque/600SemiBold/BricolageGrotesque_600SemiBold.ttf',
          '../../node_modules/@expo-google-fonts/bricolage-grotesque/700Bold/BricolageGrotesque_700Bold.ttf',
        ],
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
    // Babel is configured automatically in SDK 54+; lint rules ship with
    // eslint-config-expo in SDK 55+ (https://docs.expo.dev/guides/react-compiler.md).
    reactCompiler: true,
  },
});
