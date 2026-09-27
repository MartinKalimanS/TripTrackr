import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * `extra` keys that, by name, are likely to carry a traveller's content: a
 * note body, an expense amount, a document name. Matched case-insensitively
 * as substrings, so `noteBody` and `documentName` are caught as well as the
 * bare words. Deliberately broad — a false positive costs a debugging hint, a
 * false negative costs a traveller their privacy (Constitution I).
 */
const CONTENT_KEY_PATTERN = /body|note|amount|document/i;

/**
 * Sentry event shape this scrubber touches. Structural rather than the SDK's
 * `ErrorEvent` so it can be exercised with plain objects in tests and stays
 * valid if the SDK renames its type.
 */
export interface ScrubbableEvent {
  request?: {
    data?: unknown;
    cookies?: Record<string, string>;
  };
  extra?: Record<string, unknown>;
}

/**
 * Strip request bodies, cookies, and content-like extras before an event leaves
 * the device (research D-18). Never returns `null`: scrubbing is not
 * suppression, and an error that happened must still be counted.
 */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  const scrubbed: T = { ...event };

  if (scrubbed.request) {
    const { data: _data, cookies: _cookies, ...safeRequest } = scrubbed.request;
    scrubbed.request = safeRequest;
  }

  if (scrubbed.extra) {
    scrubbed.extra = Object.fromEntries(
      Object.entries(scrubbed.extra).filter(([key]) => !CONTENT_KEY_PATTERN.test(key)),
    );
  }

  return scrubbed;
}

/**
 * `release` and `dist` from the config embedded in the binary
 * (`Constants.expoConfig`, v57 expo-constants reference), in the same
 * `bundleId@version+build` shape the SDK derives natively so the two group
 * together. With `cli.appVersionSource: "remote"` the build number is stamped
 * into the native project rather than the config, in which case `dist` is left
 * for the SDK to read natively.
 */
function releaseIdentity(): { release?: string; dist?: string } {
  const config = Constants.expoConfig;
  const version = config?.version;
  if (!version) return {};

  const appId =
    (Platform.OS === 'android'
      ? config.android?.package
      : config.ios?.bundleIdentifier) ??
    config.slug ??
    'triptrackr';
  const build =
    Platform.OS === 'android' ? config.android?.versionCode : config.ios?.buildNumber;
  const dist = build === undefined || build === null ? undefined : String(build);

  return {
    release: dist ? `${appId}@${version}+${dist}` : `${appId}@${version}`,
    dist,
  };
}

/**
 * FR-073: failures affecting travellers must be visible to the team.
 *
 * The DSN is read from `EXPO_PUBLIC_SENTRY_DSN`, which Expo inlines at build
 * time. It is deliberately optional: a contributor without Sentry credentials
 * must still be able to run the app, so a missing DSN disables reporting rather
 * than crashing the launch. This is the opposite of the API's posture
 * (apps/api/src/common/config/env.schema.ts), and for a good reason — a missing
 * secret on the server is a misconfigured deployment, whereas on a developer's
 * phone it is a Tuesday.
 *
 * What is NOT here is as deliberate as what is (research D-18): no
 * `mobileReplayIntegration` — Session Replay records screen content, and this
 * product renders boarding passes and private journals; no
 * `feedbackIntegration`; no `enableLogs`. The setup wizard emits all three;
 * none of them was ever a decision.
 */
export function initSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : 'production',
    ...releaseIdentity(),

    // Every trace in development, one in ten in production: enough to see
    // slow screens, not enough to pay for every launch.
    tracesSampleRate: __DEV__ ? 1.0 : 0.1,

    // Constitution I: a traveller's content is theirs. Breadcrumbs and event
    // bodies must never carry note text, expense amounts, or document names, so
    // request bodies and PII collection stay off.
    sendDefaultPii: false,

    // Explicitly empty: the SDK's defaults are kept, nothing content-bearing
    // is added. See the module comment for what is excluded and why.
    integrations: [],

    beforeSend: scrubEvent,

    beforeBreadcrumb(breadcrumb) {
      // Console breadcrumbs routinely capture logged objects verbatim.
      if (breadcrumb.category === 'console') return null;
      return breadcrumb;
    },
  });
}

export { Sentry };
