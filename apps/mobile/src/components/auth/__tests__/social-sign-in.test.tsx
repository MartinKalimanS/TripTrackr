/**
 * Continue with Google / Apple — FR-002; spec Edge Cases (Accounts).
 *
 * Outlined buttons carrying each provider's logo and name (Atlas, feature 004 T446; what
 * one button is is pinned in `provider-button.test.tsx`) on the Sign in and Create account
 * screens below the email form. A provider that cannot work on this build or platform yet
 * is shown disabled and the section says it is coming soon; one that can is wired to its
 * flow.
 */
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

import { ApiRequestError } from '@/lib/api-client';

import { SocialSignIn } from '../social-sign-in';

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

type MutationStub = { mutate: jest.Mock; isPending: boolean; error: unknown };
const stub = (): MutationStub => ({ mutate: jest.fn(), isPending: false, error: null });
const mockMutations = { apple: stub(), google: stub() };

jest.mock('@/features/auth/use-session', () => ({
  useAppleSignIn: () => mockMutations.apple,
  useGoogleSignIn: () => mockMutations.google,
}));

// The glyph font is not the subject; which logo, in which colour, is.
jest.mock('@expo/vector-icons/Ionicons', () => {
  const { Text } = jest.requireActual('react-native');
  return function MockIonicons({ name, color }: { name: string; color: string }) {
    return (
      <Text testID={`icon-${name}`} style={{ color }}>
        {name}
      </Text>
    );
  };
});

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(async () => false),
  signInAsync: jest.fn(),
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

const isAvailable = AppleAuthentication.isAvailableAsync as jest.Mock;
const signInAsync = AppleAuthentication.signInAsync as jest.Mock;

function configureGoogle() {
  const key =
    Platform.OS === 'ios'
      ? 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'
      : 'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID';
  process.env[key] = 'client-id';
}

beforeEach(() => {
  for (const mutation of Object.values(mockMutations)) {
    mutation.mutate.mockReset();
    mutation.isPending = false;
    mutation.error = null;
  }
  mockGoogleResponse = null;
  delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  delete process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  isAvailable.mockResolvedValue(false);
});

const classesOf = (node: { props: { className?: unknown } }) =>
  String(node.props.className ?? '')
    .split(/\s+/)
    .filter(Boolean);

describe('<SocialSignIn> — the outline buttons', () => {
  test('are outlined and full width, each carrying its provider’s logo and name', async () => {
    await render(<SocialSignIn />);
    const google = screen.getByTestId('google-sign-in-unavailable');
    const apple = await screen.findByTestId('apple-sign-in-unavailable');

    for (const [button, logo, words] of [
      [google, 'icon-logo-google', 'Continue with Google'],
      [apple, 'icon-logo-apple', 'Continue with Apple'],
    ] as const) {
      expect(classesOf(button)).toEqual(
        expect.arrayContaining(['border', 'border-border', 'self-stretch']),
      );
      expect(
        within(button).getByTestId(logo, { includeHiddenElements: true }),
      ).toBeTruthy();
      expect(within(button).getByText(words)).toBeTruthy();
    }
  });

  test('are one pair of the same size and prominence, stacked in one column', async () => {
    await render(<SocialSignIn />);
    const google = screen.getByTestId('google-sign-in-unavailable');
    const apple = await screen.findByTestId('apple-sign-in-unavailable');

    expect(classesOf(google)).toEqual(classesOf(apple));
    const row = screen.getByTestId('social-sign-in-buttons');
    expect(classesOf(row)).toEqual(expect.arrayContaining(['gap-3']));
    expect(classesOf(row)).not.toContain('flex-row');
  });

  test('sit under an "or continue with" divider, Google first', async () => {
    await render(<SocialSignIn />);
    await screen.findByTestId('apple-sign-in-unavailable');

    expect(screen.getByText('or continue with')).toBeTruthy();
    const ids = screen
      .getAllByRole('button')
      .map((button) => button.props.testID as string);
    expect(ids).toEqual(['google-sign-in-unavailable', 'apple-sign-in-unavailable']);
  });

  test('none is a primary control: the screen’s own action is the only one (FR-005)', async () => {
    configureGoogle();
    isAvailable.mockResolvedValue(true);
    await render(<SocialSignIn />);
    await screen.findByTestId('apple-sign-in');

    for (const button of screen.getAllByRole('button')) {
      expect(button.props.variant).toBeUndefined();
    }
  });
});

describe('<SocialSignIn> — providers that cannot work yet', () => {
  test('are disabled and labelled, and the section says they are coming soon', async () => {
    await render(<SocialSignIn />);
    const google = screen.getByTestId('google-sign-in-unavailable');
    const apple = await screen.findByTestId('apple-sign-in-unavailable');

    expect(google.props.accessibilityState).toMatchObject({ disabled: true });
    expect(google.props.accessibilityLabel).toBe('Continue with Google, coming soon');
    expect(apple.props.accessibilityState).toMatchObject({ disabled: true });
    expect(apple.props.accessibilityLabel).toBe('Continue with Apple, coming soon');
    expect(screen.getByText('Google and Apple sign-in are coming soon.')).toBeTruthy();

    await fireEvent.press(google);
    await fireEvent.press(apple);
    expect(mockPromptAsync).not.toHaveBeenCalled();
    expect(signInAsync).not.toHaveBeenCalled();
  });

  test('the caption names only the provider that is missing', async () => {
    configureGoogle();
    await render(<SocialSignIn />);
    expect(await screen.findByText('Apple sign-in is coming soon.')).toBeTruthy();
  });

  test('on Android, where Apple offers no native sign-in, Apple waits without asking', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      await render(<SocialSignIn />);
      expect(screen.getByTestId('apple-sign-in-unavailable')).toBeTruthy();
      expect(isAvailable).not.toHaveBeenCalled();
    } finally {
      os.restore();
    }
  });

  test('on iOS, nothing flashes while the platform is still being asked', async () => {
    isAvailable.mockReturnValue(new Promise(() => {}));
    await render(<SocialSignIn />);

    expect(screen.queryByTestId('apple-sign-in')).toBeNull();
    expect(screen.queryByTestId('apple-sign-in-unavailable')).toBeNull();
    expect(screen.getByText('Google sign-in is coming soon.')).toBeTruthy();
  });

  test('if asking the platform fails, Apple waits too and the failure is shown', async () => {
    isAvailable.mockRejectedValue(new Error('native module unavailable'));
    await render(<SocialSignIn />);

    expect(await screen.findByTestId('apple-sign-in-unavailable')).toBeTruthy();
    expect(screen.getByTestId('social-sign-in-error')).toHaveTextContent(
      /Something went wrong/,
    );
  });
});

describe('<SocialSignIn> — providers that work', () => {
  test('Google, once configured, runs its flow and forwards the id_token', async () => {
    configureGoogle();
    mockGoogleResponse = { type: 'success', params: { id_token: 'google-jwt' } };
    await render(<SocialSignIn />);

    const google = screen.getByTestId('google-sign-in');
    expect(google.props.accessibilityLabel).toBe('Continue with Google');
    await fireEvent.press(google);

    expect(mockPromptAsync).toHaveBeenCalled();
    await waitFor(() =>
      expect(mockMutations.google.mutate).toHaveBeenCalledWith('google-jwt'),
    );
  });

  test('a Google response without an id_token is a failure, not sent to the API', async () => {
    configureGoogle();
    mockGoogleResponse = { type: 'success', params: {} };
    await render(<SocialSignIn />);

    expect(await screen.findByTestId('social-sign-in-error')).toHaveTextContent(
      /Something went wrong/,
    );
    expect(mockMutations.google.mutate).not.toHaveBeenCalled();
  });

  test('Apple, where available, forwards the identity token and the name', async () => {
    isAvailable.mockResolvedValue(true);
    signInAsync.mockResolvedValue({
      identityToken: 'apple-jwt',
      fullName: { givenName: 'Ana', familyName: 'Rossi' },
    });
    await render(<SocialSignIn />);

    const apple = await screen.findByTestId('apple-sign-in');
    expect(apple.props.accessibilityLabel).toBe('Continue with Apple');
    expect(screen.queryByText(/Apple sign-in is coming soon/)).toBeNull();
    await fireEvent.press(apple);

    await waitFor(() =>
      expect(mockMutations.apple.mutate).toHaveBeenCalledWith({
        identityToken: 'apple-jwt',
        displayName: 'Ana Rossi',
      }),
    );
  });

  test('a cancelled Apple sheet is not an error', async () => {
    isAvailable.mockResolvedValue(true);
    signInAsync.mockRejectedValue(
      Object.assign(new Error('cancelled'), { code: 'ERR_REQUEST_CANCELED' }),
    );
    await render(<SocialSignIn />);

    await fireEvent.press(await screen.findByTestId('apple-sign-in'));

    await waitFor(() => expect(signInAsync).toHaveBeenCalled());
    expect(screen.queryByTestId('social-sign-in-error')).toBeNull();
    expect(mockMutations.apple.mutate).not.toHaveBeenCalled();
  });

  test('an Apple failure other than cancellation is shown in words', async () => {
    isAvailable.mockResolvedValue(true);
    signInAsync.mockRejectedValue(new Error('boom'));
    await render(<SocialSignIn />);

    await fireEvent.press(await screen.findByTestId('apple-sign-in'));

    expect(await screen.findByTestId('social-sign-in-error')).toHaveTextContent(
      /Something went wrong/,
    );
  });

  test('an API refusal of a provider sign-in is shown in plain language', async () => {
    mockMutations.google.error = new ApiRequestError(401, {
      code: 'OAUTH_TOKEN_INVALID',
      message: 'Bad token.',
    });
    await render(<SocialSignIn />);
    const error = screen.getByTestId('social-sign-in-error');
    expect(error).toHaveTextContent(/could not be verified/);
    // Words with an alert role and an icon, never colour alone (FR-025).
    expect(error.props.accessibilityRole).toBe('alert');
  });

  test('no error element while nothing has failed', async () => {
    await render(<SocialSignIn />);
    expect(screen.queryByTestId('social-sign-in-error')).toBeNull();
  });

  test('a provider sign-in in flight shows on its own button', async () => {
    configureGoogle();
    mockMutations.google.isPending = true;
    await render(<SocialSignIn />);
    expect(screen.getByTestId('google-sign-in').props.accessibilityState).toMatchObject({
      busy: true,
    });
  });

  test('while the screen’s own form is submitting, the working buttons wait', async () => {
    configureGoogle();
    await render(<SocialSignIn disabled />);
    expect(screen.getByTestId('google-sign-in').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });
});
