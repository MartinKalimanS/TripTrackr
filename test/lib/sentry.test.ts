/**
 * Coverage for crash reporting init (FR-073).
 *
 * The behaviour worth pinning down is the DELIBERATE optionality: a missing DSN
 * must disable reporting rather than crash the launch, so a contributor without
 * Sentry credentials can still run the app. Getting that backwards would break
 * every developer's first run.
 */
import * as Sentry from '@sentry/react-native';

import { initSentry } from '@/lib/sentry';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  mobileReplayIntegration: jest.fn(() => 'mobileReplay'),
  feedbackIntegration: jest.fn(() => 'feedback'),
}));

const ORIGINAL_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

afterEach(() => {
  if (ORIGINAL_DSN === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  else process.env.EXPO_PUBLIC_SENTRY_DSN = ORIGINAL_DSN;
});

describe('initSentry', () => {
  test('does nothing when no DSN is configured', () => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    initSentry();
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  test('initialises when a DSN is present', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://key@example.ingest.sentry.io/1';
    initSentry();
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    expect((Sentry.init as jest.Mock).mock.calls[0][0]).toMatchObject({
      dsn: 'https://key@example.ingest.sentry.io/1',
    });
  });

  test('never collects PII (Constitution Principle I)', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://key@example.ingest.sentry.io/1';
    initSentry();
    expect((Sentry.init as jest.Mock).mock.calls[0][0].sendDefaultPii).toBe(false);
  });

  test('drops console breadcrumbs, which capture logged objects verbatim', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://key@example.ingest.sentry.io/1';
    initSentry();
    const { beforeBreadcrumb } = (Sentry.init as jest.Mock).mock.calls[0][0];

    expect(beforeBreadcrumb({ category: 'console', message: 'note: ...' })).toBeNull();
    const navigation = { category: 'navigation' };
    expect(beforeBreadcrumb(navigation)).toBe(navigation);
  });
});
