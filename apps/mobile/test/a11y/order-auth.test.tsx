/**
 * T560 - the reading order of Welcome, Sign in and Create account (feature 005; FR-070, FR-075,
 * FR-076, SC-015; UI-SPEC section 7): the wordmark, the eyebrow, ONE heading, the lede, the
 * buttons in the order of the picture, the legal line; on the forms the heading, each field after
 * its label, the password rule in words, the primary, then the other ways in. The globe and the
 * mark behind Welcome are decoration. The mocked world is `welcome-pictured.test.tsx`'s.
 *
 * Each field is read as its visible label and then as the field named the same: the label is
 * the kit's own text and the field's name is the parity baseline's, so neither is changed here
 * (listed in `as-built/f14-a11y.md` as a device check).
 */
import { render } from '@testing-library/react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

import LoginScreen from '@/app/(auth)/login';
import RegisterScreen from '@/app/(auth)/register';
import WelcomeScreen from '@/app/(auth)/welcome';

import { appearance } from '../helpers/appearance';
import {
  accessibleNodes,
  exposedArt,
  expectReadingOrder,
  unnamed,
} from '../helpers/a11y-nodes';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

type MutationStub = { mutate: jest.Mock; isPending: boolean; error: unknown };
const stub = (): MutationStub => ({ mutate: jest.fn(), isPending: false, error: null });
const mockMutations = { apple: stub(), google: stub(), login: stub(), register: stub() };
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
  const { Text } = jest.requireActual('react-native');
  return function MockIonicons({ name }: { name: string }) {
    return <Text testID={`icon-${name}`}>{name}</Text>;
  };
});

const mockPromptAsync = jest.fn();
let mockGoogleResponse: {
  type: string;
  params: Record<string, string>;
  error?: Error;
} | null = null;
jest.mock('expo-auth-session/providers/google', () => ({
  useIdTokenAuthRequest: () => [{ loaded: true }, mockGoogleResponse, mockPromptAsync],
}));

jest.mock('react-native-svg', () => {
  const React = require('react') as typeof import('react');
  const { View, Text } = require('react-native') as typeof import('react-native');
  const standIn = (kind: string, Host: React.ElementType = View) => {
    const StandIn = ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(Host, { testID: `svg-${kind}`, ...props }, children);
    StandIn.displayName = kind;
    return StandIn;
  };
  const Svg = standIn('Svg');
  return {
    __esModule: true,
    default: Svg,
    Svg,
    Defs: standIn('Defs'),
    ClipPath: standIn('ClipPath'),
    RadialGradient: standIn('RadialGradient'),
    Stop: standIn('Stop'),
    G: standIn('G'),
    Mask: standIn('Mask'),
    Path: standIn('Path'),
    Circle: standIn('Circle'),
    Rect: standIn('Rect'),
    Line: standIn('Line'),
    Polygon: standIn('Polygon'),
    Ellipse: standIn('Ellipse'),
    Text: standIn('Text', Text),
    TextPath: standIn('TextPath', Text),
  };
});

jest.mock('@/hooks/use-appearance');
const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};

const isAvailable = AppleAuthentication.isAvailableAsync as jest.Mock;

beforeEach(() => {
  mockPush.mockReset();
  mockPromptAsync.mockReset();
  mockGoogleResponse = null;
  for (const mutation of Object.values(mockMutations)) {
    mutation.mutate.mockReset();
    mutation.isPending = false;
    mutation.error = null;
  }
  isAvailable.mockResolvedValue(true);
  useAppearance.mockReturnValue(appearance());
});

describe('Welcome reading order', () => {
  test('wordmark, eyebrow, ONE heading, lede, the three ways in, sign in, the legal line', async () => {
    await render(<WelcomeScreen />);
    const nodes = accessibleNodes();
    expectReadingOrder(nodes, [
      'TripTrackr',
      'Your travel passport',
      'Plan it. Live it. Share what you want.',
      /^Trips, photos and notes on one globe/,
      'apple-sign-in',
      'google-sign-in-unavailable',
      'welcome-create-account',
      'welcome-sign-in',
      'legal-line',
    ]);
    expect(nodes.filter((node) => node.role === 'header')).toHaveLength(1);
    expect(unnamed(nodes)).toEqual([]);
  });

  test('a button that is not available says so in its state and its name, not by colour', async () => {
    await render(<WelcomeScreen />);
    const google = accessibleNodes().find(
      (node) => node.id === 'google-sign-in-unavailable',
    );
    expect(google).toMatchObject({
      name: 'Continue with Google, coming soon',
      role: 'button',
      state: ['disabled'],
    });
  });

  test('the globe, the mark and the sky behind it are not stops, and nothing is left exposed', async () => {
    await render(<WelcomeScreen />);
    const ids = accessibleNodes().map((node) => node.id ?? '');
    expect(ids.filter((id) => /globe|mark|sky|stamp|scrim/.test(id))).toEqual([]);
    expect(exposedArt()).toEqual([]);
  });
});

describe('Sign in reading order', () => {
  test('heading, email, password with "Forgot password?" in its row, the primary, then the other ways', async () => {
    await render(<LoginScreen />);
    const nodes = accessibleNodes();
    expectReadingOrder(nodes, [
      'Welcome back',
      'login-email',
      'coming-soon-forgot-password',
      'login-password',
      'login-submit',
      'or continue with',
      'apple-sign-in',
      'google-sign-in-unavailable',
    ]);
    expect(unnamed(nodes)).toEqual([]);
    expect(exposedArt()).toEqual([]);
  });

  test('each field is named after its visible label', async () => {
    await render(<LoginScreen />);
    const fields = accessibleNodes().filter((node) => node.kind === 'TextInput');
    expect(fields.map((node) => [node.id, node.name])).toEqual([
      ['login-email', 'Email'],
      ['login-password', 'Password'],
    ]);
  });
});

describe('Create account reading order', () => {
  test('heading, the four fields with the password rule in words, the promise, the primary, the other ways', async () => {
    await render(<RegisterScreen />);
    const nodes = accessibleNodes();
    expectReadingOrder(nodes, [
      'Create your passport',
      'register-display-name',
      'register-email',
      'register-password',
      'password-rule',
      'register-confirm-password',
      'legal-line',
      'Expenses and documents stay private to you.',
      'register-submit',
      'or continue with',
      'apple-sign-in',
      'google-sign-in-unavailable',
    ]);
    expect(unnamed(nodes)).toEqual([]);
    expect(exposedArt()).toEqual([]);
  });

  test('the password rule says whether it is met in words (never by colour alone)', async () => {
    await render(<RegisterScreen />);
    const rule = accessibleNodes().find((node) => node.id === 'password-rule');
    expect(rule?.name).toBe('At least 12 characters, not met yet');
  });
});
