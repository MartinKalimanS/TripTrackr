import * as Sentry from '@sentry/react-native';

/**
 * FR-073: failures affecting travellers must be visible to the team.
 *
 * The DSN is read from `EXPO_PUBLIC_SENTRY_DSN`, which Expo inlines at build
 * time. It is deliberately optional: a contributor without Sentry credentials
 * must still be able to run the app, so a missing DSN disables reporting rather
 * than crashing the launch. This is the opposite of the API's posture
 * (server/src/common/config/env.schema.ts), and for a good reason — a missing
 * secret on the server is a misconfigured deployment, whereas on a developer's
 * phone it is a Tuesday.
 */
export function initSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : 'production',
    tracesSampleRate: __DEV__ ? 1.0 : 0.1,

    // Constitution I: a traveller's content is theirs. Breadcrumbs and event
    // bodies must never carry note text, expense amounts, or document names, so
    // request bodies and PII collection stay off.
    sendDefaultPii: false,

    // Enable Logs
    enableLogs: true,

    // Configure Session Replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,
    integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

    // uncomment the line below to enable Spotlight (https://spotlightjs.com)
    // spotlight: __DEV__,

    beforeBreadcrumb(breadcrumb) {
      // Console breadcrumbs routinely capture logged objects verbatim.
      if (breadcrumb.category === 'console') return null;
      return breadcrumb;
    },
  });
}

export { Sentry };
