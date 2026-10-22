/**
 * T064 — the `(auth)` group: welcome, login, register.
 *
 * The mockMutations (`use-session.ts`) are mocked: their own suite proves what
 * they persist. What is pinned here is the screens' behaviour — validation
 * mirrors the contracts and is said in words (FR-010), a busy control while a
 * request is in flight, API refusals shown as plain language, and where the
 * Google and Apple section sits: under the form on Sign in and Create account (and, F12,
 * above "Continue with email" on Welcome). What that section does is pinned by its own suite
 * (src/components/auth/__tests__/social-sign-in.test.tsx).
 *
 * `expo-router` is replaced with a recording router: the screens' job is to
 * ask for a navigation, and the root layout suite covers what the real router
 * does with it.
 *
 * Atlas (feature 004, T446; FR-005, FR-017, FR-030): the title and "Back" of Sign in and
 * Create account are the NATIVE header's (`(auth)/_layout`, `auth-layout.test.tsx`), so
 * the screens draw neither; the one primary action of each screen sits in the lower part
 * of it (thumb zone) with the secondary ones below, and the keyboard never covers it.
 * What a Field's props are, what is logged and what is kept lives in
 * `auth-security.test.tsx` (T447).
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { readFileSync } from 'node:fs';
import path from 'node:path';

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

interface Json {
  type: string;
  props: Record<string, unknown>;
  children: (Json | string)[] | null;
}

/** Every host node of the rendered tree, in document order. */
function hostNodes(node: Json | null = screen.toJSON() as Json | null): Json[] {
  if (node === null) return [];
  const below = (node.children ?? []).flatMap((child) =>
    typeof child === 'string' ? [] : hostNodes(child),
  );
  return [node, ...below];
}

/** The testIDs of the tree, in document order: where each thing sits on the screen. */
const idsInOrder = () =>
  hostNodes()
    .map((node) => node.props.testID)
    .filter((id): id is string => typeof id === 'string');

const classesOf = (node: { props: { className?: unknown } }) =>
  String(node.props.className ?? '')
    .split(/\s+/)
    .filter(Boolean);

/** The buttons of the screen the kit's Button gave an emphasis (`variant`) to. */
const primaries = () =>
  screen.getAllByRole('button').filter((button) => button.props.variant === 'primary');

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
  // The three buttons, the composition, the ids and the legal line are pinned by
  // `test/app/welcome-pictured.test.tsx` (F12, owner decision Q-11).
  test('greets with product copy, not template copy', async () => {
    await render(<WelcomeScreen />);
    expect(screen.getByText('TripTrackr')).toBeTruthy();
    expect(screen.getByText('Plan it. Live it. Share what you want.')).toBeTruthy();
    expect(screen.queryByText(/Welcome to Expo/)).toBeNull();
  });

  test('passes nothing in the route when it navigates (FR-030)', async () => {
    await render(<WelcomeScreen />);
    await fireEvent.press(screen.getByTestId('welcome-sign-in'));
    await fireEvent.press(screen.getByTestId('welcome-create-account'));
    expect(mockPush.mock.calls).toEqual([['/login'], ['/register']]);
  });
});

describe('<LoginScreen>', () => {
  test('offers Google and Apple below the email form (FR-002)', async () => {
    await render(<LoginScreen />);
    const section = screen.getByTestId('social-sign-in');
    expect(within(section).getByLabelText(/Continue with Google/)).toBeTruthy();
    expect(await within(section).findByLabelText(/Continue with Apple/)).toBeTruthy();
  });

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

  test('leaves its title and its Back to the native header; its one heading is the pictured "Welcome back" (FR-007, FR-008)', async () => {
    await render(<LoginScreen />);
    expect(screen.queryByLabelText('Back')).toBeNull();
    expect(screen.getAllByRole('header')).toHaveLength(1);
    expect(screen.getByRole('header')).toHaveTextContent('Welcome back');
    // The only "Sign in" on the page is the action; the title is the header's.
    expect(screen.getAllByText('Sign in')).toHaveLength(1);
  });

  test('says a field error in words under the field, as an alert, and marks the field invalid (FR-017, FR-025)', async () => {
    await render(<LoginScreen />);
    await fireEvent.press(screen.getByTestId('login-submit'));

    const email = screen.getByTestId('login-email-error');
    expect(email.props.accessibilityRole).toBe('alert');
    expect(email).toHaveTextContent('Enter a valid email address.');
    expect(screen.getByTestId('login-password-error')).toHaveTextContent(
      'Enter your password.',
    );
    expect(screen.getByTestId('login-email').props['aria-invalid']).toBe(true);
    expect(screen.getByTestId('login-password').props['aria-invalid']).toBe(true);
  });

  test('has no error text and no invalid field before the traveller has tried', async () => {
    await render(<LoginScreen />);
    expect(screen.queryByTestId('login-email-error')).toBeNull();
    expect(screen.getByTestId('login-email').props['aria-invalid']).toBe(false);
  });

  test('says a refusal as an alert in words, with its id, between the form and the action (FR-017)', async () => {
    mockMutations.login.error = new ApiRequestError(401, {
      code: 'INVALID_CREDENTIALS',
      message: 'Nope.',
    });
    await render(<LoginScreen />);

    expect(screen.getByTestId('login-error').props.accessibilityRole).toBe('alert');
    const order = idsInOrder();
    expect(order.indexOf('login-password')).toBeLessThan(order.indexOf('login-error'));
    expect(order.indexOf('login-error')).toBeLessThan(order.indexOf('login-submit'));
  });

  test('shows no error element at all while there is no refusal', async () => {
    await render(<LoginScreen />);
    expect(screen.queryByTestId('login-error')).toBeNull();
  });

  test('has ONE primary action, Sign in; the provider buttons are not primary (FR-005)', async () => {
    await render(<LoginScreen />);
    await screen.findByLabelText(/Continue with Apple/);
    expect(primaries().map((button) => button.props.testID)).toEqual(['login-submit']);
    expect(screen.getByTestId('login-submit').props.size).toBe('lg');
  });

  test('puts the action and the provider buttons in the lower part, after the fields (FR-017)', async () => {
    await render(<LoginScreen />);
    const actions = screen.getByTestId('login-actions');

    // `mt-auto` takes the spare room above the actions, so they sit at the bottom of a
    // tall screen and follow the fields closely on a short one.
    expect(classesOf(actions)).toContain('mt-auto');
    expect(within(actions).getByTestId('login-submit')).toBeTruthy();
    expect(within(actions).getByTestId('social-sign-in')).toBeTruthy();
    expect(within(actions).queryByTestId('login-email')).toBeNull();

    const order = idsInOrder();
    expect(order.indexOf('login-email')).toBeLessThan(order.indexOf('login-password'));
    expect(order.indexOf('login-password')).toBeLessThan(order.indexOf('login-actions'));
    expect(order.indexOf('login-submit')).toBeLessThan(order.indexOf('social-sign-in'));
  });

  test('the form scrolls above the keyboard and keeps taps on the buttons while it is open (C4-10 rule 8)', async () => {
    await render(<LoginScreen />);
    const scroller = hostNodes().find((node) => node.type === 'RCTScrollView');
    expect(scroller?.props.keyboardShouldPersistTaps).toBe('handled');
    // Only the keyboard-aware scroller carries this offset.
    expect(scroller?.props.bottomOffset).toEqual(expect.any(Number));
    // Under the native header: inset below it, and the scroller is the first thing drawn.
    expect(scroller?.props.contentInsetAdjustmentBehavior).toBe('automatic');
    expect(((screen.toJSON() as Json).children ?? [])[0]).toMatchObject({
      type: 'RCTScrollView',
    });
  });

  test('the last field’s return key submits, so the action is reachable with the keyboard up', async () => {
    await render(<LoginScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'ana@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'correct horse');
    await fireEvent(screen.getByLabelText('Password'), 'submitEditing');
    expect(mockMutations.login.mutate).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'correct horse',
    });
  });

  test('keeps the reading order: email, password, error, Sign in, then the providers (FR-030)', async () => {
    mockMutations.login.error = new ApiRequestError(401, { code: 'X', message: 'Nope.' });
    await render(<LoginScreen />);
    const order = idsInOrder().filter((id) =>
      /^login-(email|password|error|submit)$|^social-sign-in$/.test(id),
    );
    expect(order).toEqual([
      'login-email',
      'login-password',
      'login-error',
      'login-submit',
      'social-sign-in',
    ]);
  });

  test('while a request is in flight the action cannot be pressed twice', async () => {
    mockMutations.login.isPending = true;
    await render(<LoginScreen />);
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(mockMutations.login.mutate).not.toHaveBeenCalled();
  });
});

describe('<RegisterScreen>', () => {
  test('offers Google and Apple below the email form (FR-002)', async () => {
    await render(<RegisterScreen />);
    const section = screen.getByTestId('social-sign-in');
    expect(within(section).getByLabelText(/Continue with Google/)).toBeTruthy();
    expect(await within(section).findByLabelText(/Continue with Apple/)).toBeTruthy();
  });

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

    expect(screen.getByTestId('register-display-name-error')).toHaveTextContent(
      /Tell us what to call you/,
    );
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

  test('leaves its title and its Back to the native header; its one heading is the pictured "Create your passport" (FR-007, FR-008)', async () => {
    await render(<RegisterScreen />);
    expect(screen.queryByLabelText('Back')).toBeNull();
    expect(screen.getAllByRole('header')).toHaveLength(1);
    expect(screen.getByRole('header')).toHaveTextContent('Create your passport');
    // The only "Create account" on the page is the action; the title is the header's.
    expect(screen.getAllByText('Create account')).toHaveLength(1);
  });

  test('says each field error in words under its field, as an alert, and marks the field invalid (FR-017, FR-025)', async () => {
    await render(<RegisterScreen />);
    await fill({ Name: ' ', Email: 'nope', Password: 'short', 'Confirm password': 'x' });
    await fireEvent.press(screen.getByTestId('register-submit'));

    expect(screen.getByTestId('register-display-name-error')).toHaveTextContent(
      /Tell us what to call you/,
    );
    expect(screen.getByTestId('register-email-error')).toHaveTextContent(
      'Enter a valid email address.',
    );
    expect(screen.getByTestId('register-password-error')).toHaveTextContent(
      'Use at least 12 characters.',
    );
    const mismatch = screen.getByTestId('register-confirm-password-error');
    expect(mismatch).toHaveTextContent('Passwords do not match');
    expect(mismatch.props.accessibilityRole).toBe('alert');
    for (const id of [
      'register-display-name',
      'register-email',
      'register-password',
      'register-confirm-password',
    ]) {
      expect(screen.getByTestId(id).props['aria-invalid']).toBe(true);
    }
  });

  test('says a refusal as an alert, between the form and the action, with its id (FR-017)', async () => {
    mockMutations.register.error = new ApiRequestError(409, {
      code: 'EMAIL_TAKEN',
      message: 'x',
    });
    await render(<RegisterScreen />);

    expect(screen.getByTestId('register-error').props.accessibilityRole).toBe('alert');
    const order = idsInOrder();
    expect(order.indexOf('register-confirm-password')).toBeLessThan(
      order.indexOf('register-error'),
    );
    expect(order.indexOf('register-error')).toBeLessThan(
      order.indexOf('register-submit'),
    );
  });

  test('has ONE primary action, Create account; the provider buttons are not primary (FR-005)', async () => {
    await render(<RegisterScreen />);
    await screen.findByLabelText(/Continue with Apple/);
    expect(primaries().map((button) => button.props.testID)).toEqual(['register-submit']);
    expect(screen.getByTestId('register-submit').props.size).toBe('lg');
  });

  test('puts the action and the provider buttons in the lower part, after the four fields (FR-017)', async () => {
    await render(<RegisterScreen />);
    const actions = screen.getByTestId('register-actions');

    expect(classesOf(actions)).toContain('mt-auto');
    expect(within(actions).getByTestId('register-submit')).toBeTruthy();
    expect(within(actions).getByTestId('social-sign-in')).toBeTruthy();

    const order = idsInOrder();
    const fields = [
      'register-display-name',
      'register-email',
      'register-password',
      'register-confirm-password',
    ].map((id) => order.indexOf(id));
    expect(fields).toEqual([...fields].sort((a, b) => a - b));
    expect(Math.min(...fields)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...fields)).toBeLessThan(order.indexOf('register-actions'));
    expect(order.indexOf('register-submit')).toBeLessThan(
      order.indexOf('social-sign-in'),
    );
  });

  test('the form scrolls above the keyboard and keeps taps on the buttons while it is open (C4-10 rule 8)', async () => {
    await render(<RegisterScreen />);
    const scroller = hostNodes().find((node) => node.type === 'RCTScrollView');
    expect(scroller?.props.keyboardShouldPersistTaps).toBe('handled');
    expect(scroller?.props.bottomOffset).toEqual(expect.any(Number));
    expect(scroller?.props.contentInsetAdjustmentBehavior).toBe('automatic');
    expect(((screen.toJSON() as Json).children ?? [])[0]).toMatchObject({
      type: 'RCTScrollView',
    });
  });

  test('the last field’s return key submits, so the action is reachable with the keyboard up', async () => {
    await render(<RegisterScreen />);
    await fill();
    await fireEvent(screen.getByLabelText('Confirm password'), 'submitEditing');
    expect(mockMutations.register.mutate).toHaveBeenCalled();
  });

  test('keeps the reading order: name, email, password, confirmation, error, action, providers (FR-030)', async () => {
    mockMutations.register.error = new ApiRequestError(409, { code: 'X', message: 'x' });
    await render(<RegisterScreen />);
    const order = idsInOrder().filter((id) =>
      /^register-(display-name|email|password|confirm-password|error|submit)$|^social-sign-in$/.test(
        id,
      ),
    );
    expect(order).toEqual([
      'register-display-name',
      'register-email',
      'register-password',
      'register-confirm-password',
      'register-error',
      'register-submit',
      'social-sign-in',
    ]);
  });
});

describe('the auth screens - sources (FR-036, C4-10 rule 1)', () => {
  const FILES = [
    'app/(auth)/welcome.tsx',
    'app/(auth)/login.tsx',
    'app/(auth)/register.tsx',
    'app/(auth)/_layout.tsx',
    'components/auth/social-sign-in.tsx',
    'components/auth/provider-button.tsx',
    'components/auth/google-sign-in-button.tsx',
    'components/auth/apple-sign-in-button.tsx',
  ];
  const source = (file: string) =>
    readFileSync(path.resolve(__dirname, '..', '..', 'src', file), 'utf8');
  const importsOf = (text: string) =>
    [...text.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);

  test.each(FILES)('%s imports none of the retired primitives', (file) => {
    const specifiers = importsOf(source(file));
    for (const retired of [
      '@/components/ui/surface',
      '@/components/ui/pressable-surface',
      '@/components/ui/text-field',
      '@/components/ui/pill-group',
      '@/components/themed-text',
      '@/components/themed-view',
    ]) {
      expect(specifiers).not.toContain(retired);
    }
  });

  test.each(FILES)('%s has no colour literal and imports no kit', (file) => {
    const text = source(file);
    expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|\[#/);
    expect(importsOf(text).some((from) => /^(heroui-native|uniwind)/.test(from))).toBe(
      false,
    );
  });
});
