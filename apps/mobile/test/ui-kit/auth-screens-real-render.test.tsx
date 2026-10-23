/**
 * 004 T446 / T447 - the welcome, sign-in and create-account screens over the REAL
 * `heroui-native` under Jest (research D4-13).
 *
 * `test/app/auth-screens.test.tsx` renders the screens over the shared stand-in. This file
 * puts the kit's own Button, TextField, Input and FieldError underneath them, once, so what
 * the screens rely on is checked against the real components: nothing throws, the ids and
 * names land on the host nodes a test or a Maestro flow finds them by, every credential
 * prop reaches the host `TextInput` through the kit (T447: `secureTextEntry`,
 * `textContentType`, `autoComplete`, `autoCapitalize`, `autoCorrect`), a field's error
 * shows only while it is invalid and is an alert, and the outline provider buttons render.
 * How a class LOOKS is Uniwind's, on a device.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type * as HeroUI from 'heroui-native';
import { StyleSheet } from 'react-native';

import LoginScreen from '@/app/(auth)/login';
import RegisterScreen from '@/app/(auth)/register';
import WelcomeScreen from '@/app/(auth)/welcome';

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => require('../mocks/reanimated-full'));
// The suite-wide stand-in is replaced by the real kit for THIS file only.
jest.mock('heroui-native', () => jest.requireActual('heroui-native'));

// `mock`-prefixed so Jest's hoisted factory may reference them.
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
const mockMutations = { login: stub(), register: stub(), apple: stub(), google: stub() };
jest.mock('@/features/auth/use-session', () => ({
  useLogin: () => mockMutations.login,
  useRegister: () => mockMutations.register,
  useAppleSignIn: () => mockMutations.apple,
  useGoogleSignIn: () => mockMutations.google,
}));

jest.mock('expo-auth-session/providers/google', () => ({
  useIdTokenAuthRequest: () => [{ loaded: true }, null, jest.fn()],
}));

const { HeroUINativeProvider } = jest.requireActual<typeof HeroUI>('heroui-native');
const CONFIG = { devInfo: { stylingPrinciples: false } };

// Under Jest the kit's `useThemeColor` asks Uniwind for `--color-*` variables the stylesheet
// transform never registered, so the kit's colour kit reports it for the ghost variant, and
// the busy button's spinner gradient is given a colour that is not one. That is the test
// environment, not the screens: only those two messages are dropped, every other one prints.
const COLOUR_KIT_NOISE = /\[colorKit\.RGB\]/;
// The Phosphor icons the Welcome and the forms draw take their tint from the same kit call, so
// the vector drawing reports the same placeholder ("invalid") as a colour it cannot read.
const SPINNER_COLOUR_NOISE =
  /is not a valid color or ".*" is not a valid offset|"invalid" is not a valid color or brush/;
const consoleError = console.error.bind(console);
const consoleWarn = console.warn.bind(console);
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (!COLOUR_KIT_NOISE.test(String(args[0]))) consoleError(...args);
  });
  jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    if (!SPINNER_COLOUR_NOISE.test(String(args[0]))) consoleWarn(...args);
  });
});
afterAll(() => jest.restoreAllMocks());

beforeEach(() => {
  for (const mutation of Object.values(mockMutations)) {
    mutation.mutate.mockReset();
    mutation.isPending = false;
    mutation.error = null;
  }
  delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  delete process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
});

const renderScreen = (ui: React.ReactElement) =>
  render(<HeroUINativeProvider config={CONFIG}>{ui}</HeroUINativeProvider>);

const classesOf = (node: { props: { className?: unknown } }) =>
  String(node.props.className ?? '')
    .split(/\s+/)
    .filter(Boolean);

describe('the welcome screen over the real kit', () => {
  test('renders its heading and its named buttons, and routes the email one and the link', async () => {
    await renderScreen(<WelcomeScreen />);

    expect(
      screen.getByText('Plan it. Live it. Share what you want.').props.accessibilityRole,
    ).toBe('header');
    const create = screen.getByTestId('welcome-create-account');
    const signIn = screen.getByTestId('welcome-sign-in');
    for (const [button, name] of [
      [create, 'Continue with email'],
      [signIn, 'Sign in'],
    ] as const) {
      expect(button.props.accessibilityRole).toBe('button');
      expect(button.props.accessibilityLabel).toBe(name);
    }

    await fireEvent.press(create);
    await fireEvent.press(signIn);
    expect(mockPush.mock.calls).toEqual([['/register'], ['/login']]);
  });
});

describe('the sign-in screen over the real kit', () => {
  test('every credential prop reaches the host input through the kit', async () => {
    await renderScreen(<LoginScreen />);

    const email = screen.getByTestId('login-email');
    expect(email.type).toBe('TextInput');
    expect(email.props).toMatchObject({
      accessibilityLabel: 'Email',
      autoCapitalize: 'none',
      autoCorrect: false,
      keyboardType: 'email-address',
      textContentType: 'emailAddress',
      autoComplete: 'email',
    });

    const password = screen.getByTestId('login-password');
    expect(password.type).toBe('TextInput');
    expect(password.props).toMatchObject({
      accessibilityLabel: 'Password',
      secureTextEntry: true,
      autoCapitalize: 'none',
      autoCorrect: false,
      textContentType: 'password',
      autoComplete: 'current-password',
      returnKeyType: 'go',
    });
    expect(password.props.contextMenuHidden).not.toBe(true);
    expect(password.props.editable).toBe(true);
  });

  test('a refused form is said in words by the kit’s FieldError, as an alert, and the inputs are invalid', async () => {
    await renderScreen(<LoginScreen />);
    expect(screen.queryByTestId('login-email-error')).toBeNull();

    await fireEvent.press(screen.getByTestId('login-submit'));

    const email = screen.getByTestId('login-email-error');
    expect(email.props.accessibilityRole).toBe('alert');
    expect(within(email).getByText('Enter a valid email address.')).toBeTruthy();
    expect(screen.getByTestId('login-password-error')).toHaveTextContent(
      'Enter your password.',
    );
    expect(screen.getByTestId('login-email').props['aria-invalid']).toBe(true);
    expect(mockMutations.login.mutate).not.toHaveBeenCalled();
  });

  test('a valid form submits through the kit’s Button, and a busy one is inert and announced busy', async () => {
    const { rerender } = await renderScreen(<LoginScreen />);
    await fireEvent.changeText(screen.getByTestId('login-email'), 'ana@example.com');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'correct horse');
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(mockMutations.login.mutate).toHaveBeenCalledTimes(1);

    mockMutations.login.isPending = true;
    await rerender(
      <HeroUINativeProvider config={CONFIG}>
        <LoginScreen />
      </HeroUINativeProvider>,
    );
    const submit = screen.getByTestId('login-submit');
    expect(submit.props.accessibilityState).toMatchObject({ busy: true });
    await fireEvent.press(submit);
    expect(mockMutations.login.mutate).toHaveBeenCalledTimes(1);
  });

  test('the provider buttons are Google\u2019s pill and Apple\u2019s own button, named and in one column under the action', async () => {
    await renderScreen(<LoginScreen />);

    const google = screen.getByTestId('google-sign-in-unavailable');
    const apple = await screen.findByTestId('apple-sign-in');
    expect(google.props.accessibilityLabel).toBe('Continue with Google, coming soon');
    expect(apple.props.accessibilityLabel).toBe('Sign in with Apple');
    for (const button of [google, apple]) {
      expect(button.props.accessibilityRole).toBe('button');
    }
    expect(classesOf(google)).toContain('self-stretch');
    expect(
      StyleSheet.flatten(apple.props.style as never) as { alignSelf?: string },
    ).toMatchObject({
      alignSelf: 'stretch',
    });
    expect(classesOf(google)).toContain('border');
    expect(apple.children).toHaveLength(0);
    expect(
      within(screen.getByTestId('login-actions')).getByTestId('social-sign-in'),
    ).toBeTruthy();
  });

  test('a refusal is an alert with the app’s own words', async () => {
    mockMutations.login.error = new Error('SQLSTATE secret');
    await renderScreen(<LoginScreen />);

    const error = screen.getByTestId('login-error');
    expect(error.props.accessibilityRole).toBe('alert');
    expect(error).toHaveTextContent('Something went wrong. Please try again.');
    expect(screen.queryByText(/SQLSTATE/)).toBeNull();
  });
});

describe('the create-account screen over the real kit', () => {
  test('both password fields are secure new-password inputs and the name field is not', async () => {
    await renderScreen(<RegisterScreen />);

    for (const id of ['register-password', 'register-confirm-password']) {
      expect(screen.getByTestId(id).props).toMatchObject({
        secureTextEntry: true,
        textContentType: 'newPassword',
        autoComplete: 'new-password',
        autoCapitalize: 'none',
        autoCorrect: false,
      });
    }
    expect(screen.getByTestId('register-display-name').props.secureTextEntry).toBeFalsy();
    expect(screen.getByTestId('register-display-name').props).toMatchObject({
      autoCapitalize: 'words',
      textContentType: 'name',
      autoComplete: 'name',
    });
  });

  test('a mismatch is said in words under the confirmation, as an alert', async () => {
    await renderScreen(<RegisterScreen />);
    await fireEvent.changeText(screen.getByTestId('register-password'), 'correct horse');
    await fireEvent.changeText(screen.getByTestId('register-confirm-password'), 'wrong');

    const mismatch = screen.getByTestId('register-confirm-password-error');
    expect(mismatch.props.accessibilityRole).toBe('alert');
    expect(mismatch).toHaveTextContent('Passwords do not match');
  });
});
