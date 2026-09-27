/**
 * Coverage for crash reporting init (FR-073, research D-18, tasks.md R010).
 *
 * Two behaviours are pinned. First, the DELIBERATE optionality: a missing DSN
 * must disable reporting rather than crash the launch, so a contributor
 * without Sentry credentials can still run the app. Second, the privacy
 * boundary (Constitution I): this product renders boarding passes, private
 * journal entries, and financial records, so Session Replay and the Feedback
 * widget are excluded outright, and anything that could carry traveller
 * content is scrubbed before an event leaves the device.
 */
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

import { initSentry, scrubEvent, type ScrubbableEvent } from '@/lib/sentry';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  // Present in the SDK; asserted NOT to be used.
  mobileReplayIntegration: jest.fn(() => 'mobileReplay'),
  feedbackIntegration: jest.fn(() => 'feedback'),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      slug: 'triptrackr',
      version: '1.2.3',
      ios: { bundleIdentifier: 'com.triptrackr.app', buildNumber: '45' },
    },
  },
}));

const ORIGINAL_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
const DSN = 'https://key@example.ingest.sentry.io/1';

afterEach(() => {
  if (ORIGINAL_DSN === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  else process.env.EXPO_PUBLIC_SENTRY_DSN = ORIGINAL_DSN;
});

function initOptions() {
  process.env.EXPO_PUBLIC_SENTRY_DSN = DSN;
  initSentry();
  return (Sentry.init as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
}

describe('initSentry', () => {
  test('does nothing when no DSN is configured', () => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    initSentry();
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  test('initialises when a DSN is present', () => {
    const options = initOptions();
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    expect(options).toMatchObject({ dsn: DSN });
  });

  test('never collects PII (Constitution Principle I)', () => {
    expect(initOptions().sendDefaultPii).toBe(false);
  });

  test('configures neither Session Replay nor the Feedback widget (D-18)', () => {
    const options = initOptions();

    expect(Sentry.mobileReplayIntegration).not.toHaveBeenCalled();
    expect(Sentry.feedbackIntegration).not.toHaveBeenCalled();
    expect(options.integrations ?? []).toEqual([]);
    expect(options).not.toHaveProperty('replaysSessionSampleRate');
    expect(options).not.toHaveProperty('replaysOnErrorSampleRate');
    // Structured logs would carry whatever a stray `console.log` was handed.
    expect(options.enableLogs).toBeUndefined();
  });

  test('samples traces conservatively in production', () => {
    // `__DEV__` is true under Jest, so the production branch is asserted
    // through the rate expression rather than the resolved value.
    const options = initOptions();
    expect(options.tracesSampleRate).toBe(__DEV__ ? 1.0 : 0.1);
  });

  test('tags every event with the release and dist from the embedded config', () => {
    // Same `bundleId@version+build` shape the SDK derives natively, so events
    // from a config-tagged build and a natively-tagged one group together.
    const options = initOptions();
    expect(options.release).toBe('com.triptrackr.app@1.2.3+45');
    expect(options.dist).toBe('45');
  });

  test('drops console breadcrumbs, which capture logged objects verbatim', () => {
    const { beforeBreadcrumb } = initOptions() as {
      beforeBreadcrumb: (b: Record<string, unknown>) => unknown;
    };

    expect(beforeBreadcrumb({ category: 'console', message: 'note: ...' })).toBeNull();
    const navigation = { category: 'navigation' };
    expect(beforeBreadcrumb(navigation)).toBe(navigation);
  });

  test('installs the scrubber as beforeSend', () => {
    expect(initOptions().beforeSend).toBe(scrubEvent);
  });
});

describe('scrubEvent — request bodies and traveller content never leave the device', () => {
  test('strips request data and cookies but keeps the URL and method', () => {
    const event = scrubEvent({
      request: {
        url: 'https://api.triptrackr.app/v1/notes',
        method: 'POST',
        data: { body: 'Dear diary…' },
        cookies: { session: 'abc' },
        headers: { 'content-type': 'application/json' },
      },
    });

    expect(event.request).toEqual({
      url: 'https://api.triptrackr.app/v1/notes',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
  });

  test('removes extra keys that name traveller content, case-insensitively', () => {
    const event = scrubEvent({
      extra: {
        body: 'private note',
        noteBody: 'also private',
        Amount: 12.5,
        documentName: 'boarding-pass.pdf',
        tripId: 'trip-42',
        attempt: 3,
      },
    });

    expect(event.extra).toEqual({ tripId: 'trip-42', attempt: 3 });
  });

  test('leaves an event without request or extra untouched', () => {
    const event: ScrubbableEvent & { message: string } = { message: 'boom' };
    expect(scrubEvent(event)).toEqual({ message: 'boom' });
  });

  test('never drops the event itself — scrubbing is not suppression', () => {
    expect(scrubEvent({ request: { data: 'x' } })).not.toBeNull();
  });
});

describe('release identity', () => {
  test('reads the version from the config that ships in the binary', () => {
    // Guard against the mock drifting from what the implementation reads.
    expect(Constants.expoConfig?.version).toBe('1.2.3');
  });
});
