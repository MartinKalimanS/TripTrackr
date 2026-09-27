/**
 * T064 — the `(auth)` group: welcome, login, register.
 *
 * The mockMutations (`use-session.ts`) are mocked: their own suite proves what
 * they persist. What is pinned here is the screens' behaviour — validation
 * mirrors the contracts and is said in words (FR-010), a busy control while a
 * request is in flight, API refusals shown as plain language, and the OAuth
 * buttons appearing only where they can work.
 *
 * `expo-router` is replaced with a recording router: the screens' job is to
 * ask for a navigation, and the root layout suite covers what the real router
 * does with it.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

import LoginScreen from '@/app/(auth)/login';
import RegisterScreen from '@/app/(auth)/register';
import WelcomeScreen from '@/app/(auth)/welcome';
import { ApiRequestError } from '@/lib/api-client';

// `mock`-prefixed so Jest's hoisted factory may reference them.
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
}));

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

type MutationStub = {
  mutate: jest.Mock;
  isPending: boolean;
  error: unknown;
};

const stub = (): MutationStub => ({ mutate: jest.fn(), isPending: false, error: null });
const mockMutations = {
  login: stub(),
  register: stub(),
  apple: stub(),
  google: stub(),
};

jest.mock('@/features/auth/use-session', () => ({
  useLogin: () => mockMutations.login,
  useRegister: () => mockMutations.register,
  useAppleSignIn: () => mockMutations.apple,
  useGoogleSignIn: () => mockMutations.google,
}));

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(async () => false),
  signInAsync: jest.fn(),
  AppleAuthenticationButton: (props: Record<string, unknown>) => {
    const { Pressable, Text } = jest.requireActual('react-native');
    return (
      <Pressable testID={props.testID as string} onPress={props.onPress as () => void}>
        <Text>Sign in with Apple</Text>
      </Pressable>
    );
  },
  AppleAuthenticationButtonType: { SIGN_IN: 0 },
  AppleAuthenticationButtonStyle: { BLACK: 0, WHITE: 1 },
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

const mockPromptAsync = jest.fn();
let mockGoogleResponse: {
  type: string;
  params: Record<string, string>;
  error?: Error;
} | null = null;
jest.mock('expo-auth-session/providers/google', () => ({
  useIdTokenAuthRequest: () => [{ loaded: true }, mockGoogleResponse, mockPromptAsync],
}));

beforeEach(() => {
  for (const mutation of Object.values(mockMutations)) {
    mutation.mutate.mockReset();
    mutation.isPending = false;
    mutation.error = null;
  }
  mockGoogleResponse = null;
  delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  delete process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  (AppleAuthentication.isAvailableAsync as jest.Mock).mockResolvedValue(false);
});

describe('<WelcomeScreen>', () => {
  test('greets with product copy, not template copy', async () => {
    await render(<WelcomeScreen />);
    expect(screen.getByText('TripTrackr')).toBeTruthy();
    expect(screen.getByText('Plan it. Live it. Share what you want.')).toBeTruthy();
    expect(screen.queryByText(/Welcome to Expo/)).toBeNull();
  });

  test('offers sign in and create account as labelled actions with stable ids (C9, Maestro)', async () => {
    await render(<WelcomeScreen />);
    expect(screen.getByTestId('welcome-screen')).toBeTruthy();
    expect(screen.getByLabelText('Sign in')).toBeTruthy();
    expect(screen.getByLabelText('Create account')).toBeTruthy();
    expect(screen.getByTestId('welcome-sign-in')).toBeTruthy();
    expect(screen.getByTestId('welcome-create-account')).toBeTruthy();
  });

  test('routes to the login and register screens', async () => {
    await render(<WelcomeScreen />);
    await fireEvent.press(screen.getByLabelText('Sign in'));
    expect(mockPush).toHaveBeenCalledWith('/login');

    await fireEvent.press(screen.getByLabelText('Create account'));
    expect(mockPush).toHaveBeenCalledWith('/register');
  });

  test('hides Sign in with Apple when the platform says it is unavailable', async () => {
    await render(<WelcomeScreen />);
    await waitFor(() => expect(AppleAuthentication.isAvailableAsync).toHaveBeenCalled());
    expect(screen.queryByTestId('welcome-apple-sign-in')).toBeNull();
  });

  test('shows Sign in with Apple on iOS when available and forwards the identity token and name', async () => {
    (AppleAuthentication.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
      identityToken: 'apple-jwt',
      fullName: { givenName: 'Ana', familyName: 'Rossi' },
    });
    await render(<WelcomeScreen />);

    const button = await screen.findByTestId('welcome-apple-sign-in');
    await fireEvent.press(button);

    await waitFor(() =>
      expect(mockMutations.apple.mutate).toHaveBeenCalledWith({
        identityToken: 'apple-jwt',
        displayName: 'Ana Rossi',
      }),
    );
  });

  test('a cancelled Apple sheet is not an error', async () => {
    (AppleAuthentication.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (AppleAuthentication.signInAsync as jest.Mock).mockRejectedValue(
      Object.assign(new Error('cancelled'), { code: 'ERR_REQUEST_CANCELED' }),
    );
    await render(<WelcomeScreen />);

    await fireEvent.press(await screen.findByTestId('welcome-apple-sign-in'));

    await waitFor(() => expect(AppleAuthentication.signInAsync).toHaveBeenCalled());
    expect(screen.queryByTestId('welcome-error')).toBeNull();
    expect(mockMutations.apple.mutate).not.toHaveBeenCalled();
  });

  test('an Apple failure other than cancellation is shown in words', async () => {
    (AppleAuthentication.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (AppleAuthentication.signInAsync as jest.Mock).mockRejectedValue(new Error('boom'));
    await render(<WelcomeScreen />);

    await fireEvent.press(await screen.findByTestId('welcome-apple-sign-in'));

    expect(await screen.findByTestId('welcome-error')).toHaveTextContent(
      /Something went wrong/,
    );
  });

  test('hides Continue with Google until a client id for this platform is configured', async () => {
    await render(<WelcomeScreen />);
    expect(screen.queryByTestId('welcome-google-sign-in')).toBeNull();
  });

  test('shows Continue with Google when configured and forwards the id_token from the response', async () => {
    process.env[
      Platform.OS === 'ios'
        ? 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'
        : 'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID'
    ] = 'client-id';
    mockGoogleResponse = { type: 'success', params: { id_token: 'google-jwt' } };

    await render(<WelcomeScreen />);

    await fireEvent.press(screen.getByTestId('welcome-google-sign-in'));
    expect(mockPromptAsync).toHaveBeenCalled();
    await waitFor(() =>
      expect(mockMutations.google.mutate).toHaveBeenCalledWith('google-jwt'),
    );
  });

  test('a Google response without an id_token is shown as a failure, not sent to the API', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = 'client-id';
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID = 'client-id';
    mockGoogleResponse = { type: 'success', params: {} };

    await render(<WelcomeScreen />);

    expect(await screen.findByTestId('welcome-error')).toHaveTextContent(
      /Something went wrong/,
    );
    expect(mockMutations.google.mutate).not.toHaveBeenCalled();
  });

  test('shows an API refusal of an OAuth sign-in in plain language', async () => {
    mockMutations.google.error = new ApiRequestError(401, {
      code: 'OAUTH_TOKEN_INVALID',
      message: 'Bad token.',
    });
    await render(<WelcomeScreen />);
    expect(screen.getByTestId('welcome-error')).toHaveTextContent(
      /could not be verified/,
    );
  });
});

describe('<LoginScreen>', () => {
  test('renders an email and a password field with the right keyboard behaviour', async () => {
    await render(<LoginScreen />);
    expect(screen.getByLabelText('Email').props.keyboardType).toBe('email-address');
    expect(screen.getByLabelText('Email').props.autoCapitalize).toBe('none');
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
  });

  test('refuses an empty form in words and makes no request (FR-010)', async () => {
    await render(<LoginScreen />);
    await fireEvent.press(screen.getByTestId('login-submit'));

    expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
    expect(screen.getByText('Enter your password.')).toBeTruthy();
    expect(mockMutations.login.mutate).not.toHaveBeenCalled();
  });

  test('clears a field message as soon as the field is fixed', async () => {
    await render(<LoginScreen />);
    await fireEvent.press(screen.getByTestId('login-submit'));
    await fireEvent.changeText(screen.getByLabelText('Email'), 'ana@example.com');
    expect(screen.queryByText('Enter a valid email address.')).toBeNull();
  });

  test('submits the email and password as typed — normalisation is the mutation’s job', async () => {
    await render(<LoginScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'Ana@Example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'correct horse');
    await fireEvent.press(screen.getByTestId('login-submit'));

    expect(mockMutations.login.mutate).toHaveBeenCalledWith({
      email: 'Ana@Example.com',
      password: 'correct horse',
    });
  });

  test('marks the action busy while the request is in flight', async () => {
    mockMutations.login.isPending = true;
    await render(<LoginScreen />);
    const submit = screen.getByTestId('login-submit');
    expect(submit.props.accessibilityState).toMatchObject({ busy: true });
    expect(screen.getByText('Signing in…')).toBeTruthy();
  });

  test('shows a refused sign-in as "That email and password don’t match."', async () => {
    mockMutations.login.error = new ApiRequestError(401, {
      code: 'INVALID_CREDENTIALS',
      message: 'Nope.',
    });
    await render(<LoginScreen />);
    expect(screen.getByTestId('login-error')).toHaveTextContent(
      "That email and password don't match.",
    );
  });

  test('offers a way back — the header is hidden, so the screen supplies its own', async () => {
    await render(<LoginScreen />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('<RegisterScreen>', () => {
  const fill = async (overrides: Partial<Record<string, string>> = {}) => {
    const values = {
      Name: 'Ana',
      Email: 'ana@example.com',
      Password: 'correct horse battery',
      'Confirm password': 'correct horse battery',
      ...overrides,
    };
    for (const [label, value] of Object.entries(values)) {
      await fireEvent.changeText(screen.getByLabelText(label), value);
    }
  };

  test('renders name, email, password, and confirmation fields', async () => {
    await render(<RegisterScreen />);
    for (const label of ['Name', 'Email', 'Password', 'Confirm password']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  test('tells the traveller when the two passwords disagree, by text (FR-010)', async () => {
    await render(<RegisterScreen />);
    await fireEvent.changeText(screen.getByLabelText('Password'), 'correct horse');
    await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'wrong horse');
    expect(screen.getByText('Passwords do not match')).toBeTruthy();
  });

  test('does not shout about a mismatch before the confirmation has been typed', async () => {
    await render(<RegisterScreen />);
    await fireEvent.changeText(screen.getByLabelText('Password'), 'correct horse');
    expect(screen.queryByText('Passwords do not match')).toBeNull();
  });

  test('enforces the contract’s twelve-character password floor in words', async () => {
    await render(<RegisterScreen />);
    await fill({ Password: 'short', 'Confirm password': 'short' });
    await fireEvent.press(screen.getByTestId('register-submit'));

    expect(screen.getByText('Use at least 12 characters.')).toBeTruthy();
    expect(mockMutations.register.mutate).not.toHaveBeenCalled();
  });

  test('requires a name and a valid email', async () => {
    await render(<RegisterScreen />);
    await fill({ Name: '  ', Email: 'not-an-email' });
    await fireEvent.press(screen.getByTestId('register-submit'));

    expect(screen.getByText(/Tell us what to call you/)).toBeTruthy();
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
    expect(mockMutations.register.mutate).not.toHaveBeenCalled();
  });

  test('refuses to submit while the confirmation disagrees, even if every rule passes', async () => {
    await render(<RegisterScreen />);
    await fill({ 'Confirm password': 'correct horse batter' });
    await fireEvent.press(screen.getByTestId('register-submit'));

    expect(mockMutations.register.mutate).not.toHaveBeenCalled();
  });

  test('submits a valid form (FR-001)', async () => {
    await render(<RegisterScreen />);
    await fill();
    await fireEvent.press(screen.getByTestId('register-submit'));

    expect(mockMutations.register.mutate).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'correct horse battery',
      display_name: 'Ana',
    });
  });

  test('shows an email that already has an account in plain language', async () => {
    mockMutations.register.error = new ApiRequestError(409, {
      code: 'EMAIL_TAKEN',
      message: 'x',
    });
    await render(<RegisterScreen />);
    expect(screen.getByTestId('register-error')).toHaveTextContent(/already exists/);
  });

  test('marks the action busy while the account is being created', async () => {
    mockMutations.register.isPending = true;
    await render(<RegisterScreen />);
    expect(screen.getByTestId('register-submit').props.accessibilityState).toMatchObject({
      busy: true,
    });
  });

  test('offers a way back', async () => {
    await render(<RegisterScreen />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalled();
  });
});
