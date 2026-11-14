/**
 * T562 - the appearance sweep of the `(auth)` group and the not-found route: Welcome, Sign in,
 * Create account, "This page does not exist", in the four themes and under reduced
 * transparency (FR-072, FR-073, FR-078, FR-079, SC-008). The audit, its exceptions and the
 * render helpers are in `test/appearance/`; the other groups are the sibling suites.
 */
import ForgotPasswordScreen from '@/app/(auth)/forgot-password';
import LoginScreen from '@/app/(auth)/login';
import RegisterScreen from '@/app/(auth)/register';
import WelcomeScreen from '@/app/(auth)/welcome';
import NotFoundScreen from '@/app/+not-found';
import ResetPasswordScreen from '@/app/reset-password';
import VerifyEmailScreen from '@/app/verify-email';

import { sweepScreen } from './sweep';

jest.mock('expo-router', () => {
  const { Pressable } = require('react-native') as typeof import('react-native');
  const React = require('react') as typeof import('react');
  return {
    useRouter: () => ({
      push: jest.fn(),
      back: jest.fn(),
      replace: jest.fn(),
      setParams: jest.fn(),
    }),
    useLocalSearchParams: () => ({ token: 'abcDEF0123456789_-abcDEF0123456789' }),
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

jest.mock('@/features/auth/account-recovery', () => ({
  ...jest.requireActual('@/features/auth/account-recovery'),
  useRequestPasswordReset: () => mockMutation(),
  useConfirmPasswordReset: () => mockMutation(),
  useVerifyEmail: () => mockMutation(),
}));

jest.mock('expo-auth-session/providers/google', () => ({
  useIdTokenAuthRequest: () => [{ loaded: true }, null, jest.fn()],
}));

sweepScreen('Welcome', () => <WelcomeScreen />);
sweepScreen('Sign in', () => <LoginScreen />);
sweepScreen('Create account', () => <RegisterScreen />);
sweepScreen('Forgot password', () => <ForgotPasswordScreen />);
sweepScreen('Reset password', () => <ResetPasswordScreen />);
sweepScreen('Verify email', () => <VerifyEmailScreen />);
sweepScreen('Not found', () => <NotFoundScreen />);
