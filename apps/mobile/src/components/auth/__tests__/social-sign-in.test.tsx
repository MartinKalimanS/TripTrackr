/**
 * Continue with Google / Apple — FR-002; spec Edge Cases (Accounts).
 *
 * Apple's own button (F12; `apple-official-button.test.tsx` pins what it is) and Google's
 * pill, Apple first as pictured, on the Sign in and Create account screens below the email
 * form. Google, when it cannot work on this build yet, is shown disabled; Apple, when the
 * device says it is unavailable, is not drawn at all (Apple's logo is only ever drawn by
 * Apple's button, and that button cannot be offered disabled); the section says what is
 * coming soon either way. A provider that can work is wired to its flow.
 */
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { createHash } from 'node:crypto';
import { Platform, StyleSheet } from 'react-native';

import { fetchOAuthNonce } from '@/features/auth/oauth-nonce';
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

jest.mock('expo-apple-authentication', () => ({
  ...require('../../../../test/mocks/expo-apple-authentication'),
  isAvailableAsync: jest.fn(async () => false),
}));

const mockPromptAsync = jest.fn();
let mockGoogleResponse: {
  type: string;
  params: Record<string, string>;
  error?: Error;
} | null = null;
const mockGoogleConfigs: { extraParams?: { nonce?: string } }[] = [];
jest.mock('expo-auth-session/providers/google', () => ({
  useIdTokenAuthRequest: (config: { extraParams?: { nonce?: string } }) => {
    mockGoogleConfigs.push(config);
    return [{ loaded: true }, mockGoogleResponse, mockPromptAsync];
  },
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
  mockGoogleConfigs.length = 0;
  (fetchOAuthNonce as jest.Mock).mockClear();
  delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  delete process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  isAvailable.mockResolvedValue(false);
});

const flat = (style: unknown) =>
  (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;

const classesOf = (node: { props: { className?: unknown } }) =>
  String(node.props.className ?? '')
    .split(/\s+/)
    .filter(Boolean);

describe("<SocialSignIn> — Apple's button and Google's pill", () => {
  test('are full width: Google a pill with its logo and name, Apple the system button', async () => {
    isAvailable.mockResolvedValue(true);
    await render(<SocialSignIn />);
    const google = screen.getByTestId('google-sign-in-unavailable');
    const apple = await screen.findByTestId('apple-sign-in');

    expect(classesOf(google)).toContain('self-stretch');
    expect(classesOf(google)).toContain('border');
    expect(
      within(google).getByTestId('brand-glyph', { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(within(google).getByText('Continue with Google')).toBeTruthy();
    expect(flat(apple.props.style).alignSelf).toBe('stretch');
    expect(apple.props.accessibilityLabel).toBe('Continue with Apple');
  });

  test('are one pair of the same size and prominence, stacked in one column', async () => {
    isAvailable.mockResolvedValue(true);
    await render(<SocialSignIn />);
    const google = screen.getByTestId('google-sign-in-unavailable');
    const apple = await screen.findByTestId('apple-sign-in');

    expect(classesOf(google)).toEqual(
      expect.arrayContaining([
        'flex-row',
        'items-center',
        'justify-center',
        'self-stretch',
      ]),
    );
    expect(flat(apple.props.style).height).toBe(flat(google.props.style).minHeight);
    const row = screen.getByTestId('social-sign-in-buttons');
    expect(classesOf(row)).toEqual(expect.arrayContaining(['gap-3']));
    expect(classesOf(row)).not.toContain('flex-row');
  });

  test('sit under an "or continue with" divider, Apple first as pictured', async () => {
    isAvailable.mockResolvedValue(true);
    await render(<SocialSignIn />);
    await screen.findByTestId('apple-sign-in');

    expect(screen.getByText('or continue with')).toBeTruthy();
    const ids = screen
      .getAllByRole('button')
      .map((button) => button.props.testID as string);
    expect(ids).toEqual(['apple-sign-in', 'google-sign-in-unavailable']);
  });

  test.each([
    ['sign-in', 'Sign in with Apple', 0],
    ['sign-up', 'Sign up with Apple', 2],
    ['continue', 'Continue with Apple', 1],
  ] as const)(
    'the screen picks Apple\u2019s title: %s reads "%s" (button type %i)',
    async (appleIntent, title, buttonType) => {
      isAvailable.mockResolvedValue(true);
      await render(<SocialSignIn appleIntent={appleIntent} />);
      const apple = await screen.findByTestId('apple-sign-in');
      expect(apple.props.buttonType).toBe(buttonType);
      expect(apple.props.accessibilityLabel).toBe(title);
    },
  );

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
  test('Google is disabled and labelled; an unavailable Apple is not drawn; the section says both are coming soon', async () => {
    await render(<SocialSignIn />);
    const google = screen.getByTestId('google-sign-in-unavailable');
    expect(
      await screen.findByText('Google and Apple sign-in are coming soon.'),
    ).toBeTruthy();

    expect(google.props.accessibilityState).toMatchObject({ disabled: true });
    expect(google.props.accessibilityLabel).toBe('Continue with Google, coming soon');
    expect(screen.queryByTestId('apple-sign-in')).toBeNull();
    expect(screen.queryByTestId('apple-sign-in-frame')).toBeNull();
    expect(screen.queryByTestId('apple-sign-in-unavailable')).toBeNull();
    expect(screen.queryByLabelText(/Apple/)).toBeNull();

    await fireEvent.press(google);
    expect(mockPromptAsync).not.toHaveBeenCalled();
    expect(signInAsync).not.toHaveBeenCalled();
  });

  test('the caption names only the provider that is missing', async () => {
    configureGoogle();
    await render(<SocialSignIn />);
    expect(await screen.findByText('Apple sign-in is coming soon.')).toBeTruthy();
  });

  test('on Android, where Apple offers no native sign-in, Apple is not drawn and is not asked', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      await render(<SocialSignIn />);
      expect(screen.queryByTestId('apple-sign-in-unavailable')).toBeNull();
      expect(screen.queryByTestId('apple-sign-in')).toBeNull();
      expect(screen.queryByLabelText(/Apple/)).toBeNull();
      expect(screen.getByTestId('google-sign-in-unavailable')).toBeTruthy();
      // Only what is missing here is named: Apple is not "coming soon" on Android.
      expect(screen.getByText('Google sign-in is coming soon.')).toBeTruthy();
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
    // The place is held, so Apple appearing does not push anything down.
    expect(
      screen.getByTestId('provider-button-spacer', { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  test('if asking the platform fails, Apple is not drawn and the failure is shown', async () => {
    isAvailable.mockRejectedValue(new Error('native module unavailable'));
    await render(<SocialSignIn />);

    expect(await screen.findByTestId('social-sign-in-error')).toHaveTextContent(
      /Something went wrong/,
    );
    expect(screen.queryByTestId('apple-sign-in')).toBeNull();
    expect(screen.queryByTestId('apple-sign-in-unavailable')).toBeNull();
  });
});

describe('<SocialSignIn> — providers that work', () => {
  test('Google, once configured, runs its flow and forwards the id_token', async () => {
    configureGoogle();
    const { rerender } = await render(<SocialSignIn />);
    // The sheet opens only once the server nonce is in the request (spec 012).
    await waitFor(() =>
      expect(mockGoogleConfigs.at(-1)?.extraParams?.nonce).toBeTruthy(),
    );

    const google = screen.getByTestId('google-sign-in');
    expect(google.props.accessibilityLabel).toBe('Continue with Google');
    await fireEvent.press(google);
    expect(mockPromptAsync).toHaveBeenCalled();

    mockGoogleResponse = { type: 'success', params: { id_token: 'google-jwt' } };
    await rerender(<SocialSignIn />);
    await waitFor(() =>
      expect(mockMutations.google.mutate).toHaveBeenCalledWith({
        idToken: 'google-jwt',
        nonce: 'server-issued-nonce-0123456789',
      }),
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
        nonce: 'server-issued-nonce-0123456789',
        displayName: 'Ana Rossi',
      }),
    );
  });

  test('Apple is handed the SHA-256 of a fresh server nonce, never the nonce itself (spec 012)', async () => {
    isAvailable.mockResolvedValue(true);
    signInAsync.mockResolvedValue({ identityToken: 'apple-jwt', fullName: null });
    await render(<SocialSignIn />);

    await fireEvent.press(await screen.findByTestId('apple-sign-in'));

    await waitFor(() => expect(signInAsync).toHaveBeenCalled());
    const [options] = signInAsync.mock.calls[0] as [{ nonce: string }];
    expect(options.nonce).toBe(
      createHash('sha256').update('server-issued-nonce-0123456789').digest('hex'),
    );
    expect(fetchOAuthNonce).toHaveBeenCalledTimes(1);
  });

  test('Apple that cannot get a nonce is a failure in words, and the sheet never opens', async () => {
    isAvailable.mockResolvedValue(true);
    (fetchOAuthNonce as jest.Mock).mockRejectedValueOnce(
      new ApiRequestError(0, { code: 'NETWORK', message: 'x' }),
    );
    await render(<SocialSignIn />);

    await fireEvent.press(await screen.findByTestId('apple-sign-in'));

    expect(await screen.findByTestId('social-sign-in-error')).toBeTruthy();
    expect(signInAsync).not.toHaveBeenCalled();
    expect(mockMutations.apple.mutate).not.toHaveBeenCalled();
  });

  test('Google builds its request with the server nonce, and asks for another after an attempt (spec 012)', async () => {
    configureGoogle();
    mockGoogleResponse = { type: 'success', params: { id_token: 'google-jwt' } };
    await render(<SocialSignIn />);

    await waitFor(() =>
      expect(mockGoogleConfigs.at(-1)?.extraParams).toEqual({
        nonce: 'server-issued-nonce-0123456789',
      }),
    );
    await waitFor(() => expect(fetchOAuthNonce).toHaveBeenCalledTimes(2));
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
    isAvailable.mockResolvedValue(true);
    await render(<SocialSignIn disabled />);
    expect(screen.getByTestId('google-sign-in').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await screen.findByTestId('apple-sign-in');
    expect(screen.getByTestId('apple-sign-in-frame').props).toMatchObject({
      accessibilityState: { disabled: true },
      pointerEvents: 'none',
    });
    expect(screen.queryByText(/Signing in with Apple/)).toBeNull();
  });

  test('an Apple sign-in in flight shows on its own button, in words, and holds Google', async () => {
    configureGoogle();
    isAvailable.mockResolvedValue(true);
    mockMutations.apple.isPending = true;
    await render(<SocialSignIn />);
    await screen.findByTestId('apple-sign-in');
    expect(screen.getByTestId('apple-sign-in-frame').props).toMatchObject({
      accessibilityLabel: 'Continue with Apple',
      accessibilityState: { busy: true, disabled: true },
    });
    expect(screen.getByText('Signing in with Apple\u2026')).toBeTruthy();
    expect(screen.getByTestId('google-sign-in').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });
});
