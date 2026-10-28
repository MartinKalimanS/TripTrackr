/**
 * T559 - the You route, in every state it has (FR-064, FR-066, FR-080 as amended by Q-11):
 * the passport loading, unreadable, empty and full. In each: no control that does nothing, no
 * control that says it is not available yet without being a coming-soon control (and the
 * reverse), and no primary at all (FR-005: nothing on You is primary). Delete account is the
 * one pictured control with a capability that is not built yet (`DELETE /me`, T188): it is
 * explicitly disabled, never a quiet no-op.
 */
import { render, screen } from '@testing-library/react-native';

import ProfileScreen from '@/app/(tabs)/profile';
import { useSessionStore } from '@/features/auth/session-store';
import type { PassportData } from '@/features/passport/use-passport';

import { appearance } from '../helpers/appearance';
import {
  deadControls,
  misroutedComingSoon,
  pressableCount,
  primaryControls,
} from '../helpers/dead-controls';

jest.mock('@/hooks/use-appearance');
const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};

const mockPassport = {
  data: { trips: [], summaries: [], periods: ['all'] } as PassportData,
  loading: false,
  error: null as Error | null,
};
jest.mock('@/features/passport/use-passport', () => ({
  usePassport: () => mockPassport,
}));
jest.mock('@/features/trips/stop-dates', () => ({
  ...jest.requireActual('@/features/trips/stop-dates'),
  todayIso: () => '2026-10-14',
}));
jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return { Image: (props: Record<string, unknown>) => React.createElement(Host, props) };
});
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.2.3', ios: { buildNumber: '45' } } },
}));
jest.mock('@/features/auth/use-sign-out', () => ({
  ...jest.requireActual('@/features/auth/use-sign-out'),
  useSignOut: () => ({
    mutate: jest.fn(),
    reset: jest.fn(),
    isPending: false,
    error: null,
  }),
}));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const PROFILE = {
  id: '6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e4f',
  email: 'marta@example.com',
  display_name: 'Marta',
  avatar_url: null,
  bio: null,
  home_currency: 'EUR',
  is_profile_public: false,
  email_verified_at: null,
  created_at: '2021-06-15T10:00:00.000Z',
};

beforeEach(() => {
  useAppearance.mockReturnValue(appearance());
  mockPassport.data = { trips: [], summaries: [], periods: ['all'] };
  mockPassport.loading = false;
  mockPassport.error = null;
  useSessionStore.setState({ status: 'signed-in', user: PROFILE } as never);
});

function expectHealthy() {
  expect(pressableCount()).toBeGreaterThan(0);
  expect(deadControls()).toEqual([]);
  expect(misroutedComingSoon()).toEqual([]);
  expect(primaryControls()).toEqual([]);
}

describe('You states: no control is a dead end', () => {
  it('while the passport loads: shapes for it, and the rest of the screen', async () => {
    mockPassport.loading = true;
    await render(<ProfileScreen />);
    expect(screen.getByLabelText('Loading your passport')).toBeTruthy();
    expectHealthy();
  });

  it('when the passport cannot be read: words and an icon, and Sign out still works', async () => {
    mockPassport.error = new Error('database is locked');
    await render(<ProfileScreen />);
    expect(screen.getByText('Couldn’t read your passport')).toBeTruthy();
    expect(screen.getByTestId('profile-sign-out')).toBeTruthy();
    expectHealthy();
  });

  it('with no country: zeros, a ghost stamp and the pictured coming-soon controls', async () => {
    await render(<ProfileScreen />);
    expect(screen.getByTestId('stamps-empty')).toBeTruthy();
    expect(screen.getByTestId('coming-soon-share-passport')).toBeTruthy();
    expectHealthy();
  });

  it('Delete account is named and available: it opens the confirmation, it does not do nothing', async () => {
    await render(<ProfileScreen />);
    const remove = screen.getByTestId('profile-delete-account');
    expect(remove.props.accessibilityState).not.toMatchObject({ disabled: true });
    expect(remove.props.accessibilityLabel).toBe('Delete account');
  });
});
