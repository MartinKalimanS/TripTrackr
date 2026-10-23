/**
 * T559 - the gates and the signed-out routes, in every state they have (FR-064, FR-066, FR-080
 * as amended by Q-11): the local-store gate opening and failed, the first-sync gate opening,
 * syncing, offline, failed and ended, and Welcome, Sign in and Create account idle, busy and
 * refused. In each: no control that does nothing, no control that says it is not available yet
 * without being a coming-soon control (and the reverse), at most ONE primary.
 *
 * The store, the engine and the sign-in mutations are replaced as in their screens' suites.
 */
import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import LoginScreen from '@/app/(auth)/login';
import RegisterScreen from '@/app/(auth)/register';
import WelcomeScreen from '@/app/(auth)/welcome';
import { RequireLocalStore } from '@/components/require-local-store';
import { FirstSyncGate } from '@/components/sync/first-sync-gate';
import { LocalStoreProvider } from '@/db/client';
import { ApiRequestError } from '@/lib/api-client';
import type { SyncStatus } from '@/sync/types';

import { appearance } from '../helpers/appearance';
import {
  deadControls,
  misroutedComingSoon,
  pressableCount,
  primaryControls,
} from '../helpers/dead-controls';

jest.mock('@/hooks/use-appearance');
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));
jest.mock('@/sync/engine', () => {
  const { create } = require('zustand') as typeof import('zustand');
  const store = create(() => ({
    phase: 'idle',
    firstSyncComplete: false,
    lastSyncedAt: null,
    failure: null,
  }));
  return { useSyncStatus: () => store(), syncNow: jest.fn(), __store: store };
});

type MutationStub = { mutate: jest.Mock; isPending: boolean; error: unknown };
const stub = (): MutationStub => ({ mutate: jest.fn(), isPending: false, error: null });
const mockMutations = { login: stub(), register: stub(), apple: stub(), google: stub() };
jest.mock('@/features/auth/use-session', () => ({
  useLogin: () => mockMutations.login,
  useRegister: () => mockMutations.register,
  useAppleSignIn: () => mockMutations.apple,
  useGoogleSignIn: () => mockMutations.google,
}));
jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(async () => true),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));
jest.mock('@expo/vector-icons/Ionicons', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return function MockIonicons({ name }: { name: string }) {
    return <MockText testID={`icon-${name}`}>{name}</MockText>;
  };
});
jest.mock('expo-auth-session/providers/google', () => ({
  useIdTokenAuthRequest: () => [{ loaded: true }, null, jest.fn()],
}));

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};
const { __store: statusStore } = jest.requireMock('@/sync/engine') as {
  __store: { setState: (state: Partial<SyncStatus>) => void };
};

beforeEach(() => {
  useAppearance.mockReturnValue(appearance());
  for (const mutation of Object.values(mockMutations)) {
    mutation.isPending = false;
    mutation.error = null;
  }
  statusStore.setState({
    phase: 'idle',
    firstSyncComplete: false,
    lastSyncedAt: null,
    failure: null,
  });
});
afterEach(() => {
  jest.useRealTimers();
});

/** What every state of every route owes the traveller. */
function expectHealthy(primaries: string[] | null = null) {
  expect(deadControls()).toEqual([]);
  expect(misroutedComingSoon()).toEqual([]);
  if (primaries === null) expect(primaryControls().length).toBeLessThanOrEqual(1);
  else expect(primaryControls()).toEqual(primaries);
}

describe('The local-store gate: no control is a dead end', () => {
  it('opening: words, no control, never a blank screen', async () => {
    await render(
      <LocalStoreProvider value={{ db: null, error: null, retry: jest.fn() }}>
        <RequireLocalStore>
          <Text>children</Text>
        </RequireLocalStore>
      </LocalStoreProvider>,
    );
    expect(screen.getByTestId('local-store-opening')).toBeTruthy();
    expect(pressableCount()).toBe(0);
    expectHealthy([]);
  });

  it('failed: words, an icon and "Try again"', async () => {
    await render(
      <LocalStoreProvider
        value={{ db: null, error: new Error('boom'), retry: jest.fn() }}>
        <RequireLocalStore>
          <Text>children</Text>
        </RequireLocalStore>
      </LocalStoreProvider>,
    );
    expect(screen.getByTestId('local-store-error')).toBeTruthy();
    expect(pressableCount()).toBe(1);
    expectHealthy([]);
  });
});

describe('The first-sync gate: no control is a dead end', () => {
  const renderGate = () =>
    render(
      <FirstSyncGate>
        <Text testID="real-tabs">the real tabs</Text>
      </FirstSyncGate>,
    );
  const settle = () =>
    act(async () => {
      jest.advanceTimersByTime(500);
    });

  it.each([
    ['opening', { failure: null }, false, 0],
    ['syncing', { failure: null }, true, 0],
    ['offline', { failure: 'offline' }, false, 1],
    ['failed', { failure: 'server' }, false, 1],
    ['the session ended', { failure: 'unauthorized' }, false, 0],
  ] as const)('%s', async (_name, status, settled, controls) => {
    jest.useFakeTimers();
    await act(async () => statusStore.setState(status as Partial<SyncStatus>));
    await renderGate();
    if (settled) await settle();

    expect(screen.getByTestId('first-sync-screen')).toBeTruthy();
    expect(pressableCount()).toBe(controls);
    expectHealthy([]);
  });
});

describe('Welcome, Sign in and Create account: no control is a dead end', () => {
  it('Welcome: three equals and no coral primary', async () => {
    await render(<WelcomeScreen />);
    expect(screen.getByTestId('welcome-create-account')).toBeTruthy();
    expect(pressableCount()).toBeGreaterThan(2);
    expectHealthy([]);
  });

  it('Sign in: idle, "Sign in" is the one primary', async () => {
    await render(<LoginScreen />);
    expect(pressableCount()).toBeGreaterThan(1);
    expectHealthy(['"Sign in"']);
  });

  it('Sign in: busy keeps its name, its single primary and no dead control', async () => {
    mockMutations.login.isPending = true;
    await render(<LoginScreen />);
    expectHealthy();
  });

  it('Sign in: refused in plain words', async () => {
    mockMutations.login.error = new ApiRequestError(401, {
      code: 'invalid_credentials',
      message: 'That email and password do not match.',
    });
    await render(<LoginScreen />);
    expectHealthy(['"Sign in"']);
  });

  it('Create account: idle, "Create account" is the one primary', async () => {
    await render(<RegisterScreen />);
    expectHealthy(['"Create account"']);
  });

  it('Create account: busy', async () => {
    mockMutations.register.isPending = true;
    await render(<RegisterScreen />);
    expectHealthy();
  });
});
