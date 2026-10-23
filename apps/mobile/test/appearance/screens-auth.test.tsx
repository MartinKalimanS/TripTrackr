/**
 * T562 - the appearance sweep of the `(auth)` group and the not-found route: Welcome, Sign in,
 * Create account, "This page does not exist", in the four themes and under reduced
 * transparency (FR-072, FR-073, FR-078, FR-079, SC-008). The audit, its exceptions and the
 * render helpers are in `test/appearance/`; the other groups are the sibling suites.
 */
import LoginScreen from '@/app/(auth)/login';
import RegisterScreen from '@/app/(auth)/register';
import WelcomeScreen from '@/app/(auth)/welcome';
import NotFoundScreen from '@/app/+not-found';

import { sweepScreen } from './sweep';

jest.mock('expo-router', () => {
  const { Pressable } = require('react-native') as typeof import('react-native');
  const React = require('react') as typeof import('react');
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
    Link: ({ children, ...rest }: { children: React.ReactElement }) =>
      React.createElement(Pressable, rest, children),
  };
});

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const mockMutation = () => ({ mutate: jest.fn(), isPending: false, error: null });
jest.mock('@/features/auth/use-session', () => ({
  useLogin: () => mockMutation(),
  useRegister: () => mockMutation(),
  useAppleSignIn: () => mockMutation(),
  useGoogleSignIn: () => mockMutation(),
}));

jest.mock('@expo/vector-icons/Ionicons', () => {
  const { Text } = jest.requireActual('react-native');
  return function MockIonicons({ name }: { name: string }) {
    return <Text testID={`icon-${name}`}>{name}</Text>;
  };
});

jest.mock('expo-auth-session/providers/google', () => ({
  useIdTokenAuthRequest: () => [{ loaded: true }, null, jest.fn()],
}));

sweepScreen('Welcome', () => <WelcomeScreen />);
sweepScreen('Sign in', () => <LoginScreen />);
sweepScreen('Create account', () => <RegisterScreen />);
sweepScreen('Not found', () => <NotFoundScreen />);
