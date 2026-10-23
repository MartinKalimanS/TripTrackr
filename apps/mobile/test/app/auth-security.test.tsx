/**
 * T447 - the light security review of the auth screens, as regression tests (AGENTS.md
 * "Gates that are not negotiable": security review for anything touching auth and user
 * input; plan.md "Security review"). The Atlas migration (T446) changes how Sign in and
 * Create account are DRAWN; this pins, on the real fields the screens render, that nothing
 * about how a credential is entered, kept, said or sent has moved:
 *
 * - the TextInput props that make the OS treat a password as one: `secureTextEntry`,
 *   `textContentType`, `autoComplete`, `autoCapitalize`, `autoCorrect`, and that nothing
 *   blocks paste or a password manager;
 * - error mapping through `describeAuthError`: a failure becomes a sentence, never an
 *   exception's own text;
 * - no field value in the rendered tree outside the field, in a log, in Sentry, or in a
 *   navigation target;
 * - the screens' source holds no logging, error-reporting or storage call at all.
 *
 * What the mutation cache keeps of a password after the screen is gone is
 * `test/features/use-session-retention.test.tsx`.
 *
 * Jest renders the adapters over the kit's stand-in, which forwards every TextInput prop to
 * the host input: so what is read here is what the platform's input would be given.
 * `test/ui-kit/auth-screens-real-render.test.tsx` repeats the key props over the REAL kit.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import LoginScreen from '@/app/(auth)/login';
import RegisterScreen from '@/app/(auth)/register';
import WelcomeScreen from '@/app/(auth)/welcome';
import { describeAuthError, GENERIC_AUTH_ERROR } from '@/features/auth/auth-errors';
import { ApiRequestError } from '@/lib/api-client';
import { Sentry } from '@/lib/sentry';

// `mock`-prefixed so Jest's hoisted factory may reference them.
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockNavigate = jest.fn();
const mockSetParams = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    navigate: mockNavigate,
    setParams: mockSetParams,
  }),
}));

jest.mock('@/lib/sentry', () => ({
  Sentry: {
    captureException: jest.fn(),
    captureMessage: jest.fn(),
    addBreadcrumb: jest.fn(),
  },
  initSentry: jest.fn(),
}));

type MutationStub = { mutate: jest.Mock; isPending: boolean; error: unknown };
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
  ...require('../mocks/expo-apple-authentication'),
  isAvailableAsync: jest.fn(async () => false),
}));

jest.mock('@expo/vector-icons/Ionicons', () => {
  const { Text } = jest.requireActual('react-native');
  return function MockIonicons({ name }: { name: string }) {
    return <Text testID={`icon-${name}`}>{name}</Text>;
  };
});

const mockPromptAsync = jest.fn();
let mockGoogleResponse: { type: string; params: Record<string, string> } | null = null;
jest.mock('expo-auth-session/providers/google', () => ({
  useIdTokenAuthRequest: () => [{ loaded: true }, mockGoogleResponse, mockPromptAsync],
}));

/** Distinctive enough that no copy, label or id can contain it by accident. */
const SECRET = 'Zq9-never-print-this-passphrase';
const EMAIL = 'ana.private@example.com';
const NAME = 'Ana Privatova';

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;
let consoleSpies: jest.SpyInstance[] = [];

beforeEach(() => {
  for (const mutation of Object.values(mockMutations)) {
    mutation.mutate.mockReset();
    mutation.isPending = false;
    mutation.error = null;
  }
  mockGoogleResponse = null;
  delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  delete process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  consoleSpies = CONSOLE_METHODS.map((method) =>
    jest.spyOn(console, method).mockImplementation(() => undefined),
  );
});

afterEach(() => {
  for (const spy of consoleSpies) spy.mockRestore();
});

interface Json {
  type: string;
  props: Record<string, unknown>;
  children: (Json | string)[] | null;
}

/** Every host node of the rendered tree. */
function hostNodes(node: Json | null = screen.toJSON() as Json | null): Json[] {
  if (node === null) return [];
  const below = (node.children ?? []).flatMap((child) =>
    typeof child === 'string' ? [] : hostNodes(child),
  );
  return [node, ...below];
}

/** Everything the console was told, as one string. */
function consoleOutput(): string {
  return consoleSpies
    .flatMap((spy) => spy.mock.calls as unknown[][])
    .map((args) => args.map((arg) => String(arg)).join(' '))
    .join('\n');
}

const input = (id: string) => screen.getByTestId(id);

describe('the credential fields - what the platform is told (T447)', () => {
  const EMAIL_FIELD = {
    autoCapitalize: 'none',
    autoCorrect: false,
    keyboardType: 'email-address',
    textContentType: 'emailAddress',
    autoComplete: 'email',
    returnKeyType: 'next',
  };

  const FIELDS = [
    ['login', 'login-email', EMAIL_FIELD],
    [
      'login',
      'login-password',
      {
        secureTextEntry: true,
        textContentType: 'password',
        autoComplete: 'current-password',
        autoCapitalize: 'none',
        autoCorrect: false,
        returnKeyType: 'go',
      },
    ],
    [
      'register',
      'register-display-name',
      {
        autoCapitalize: 'words',
        textContentType: 'name',
        autoComplete: 'name',
        returnKeyType: 'next',
      },
    ],
    ['register', 'register-email', EMAIL_FIELD],
    [
      'register',
      'register-password',
      {
        secureTextEntry: true,
        textContentType: 'newPassword',
        autoComplete: 'new-password',
        autoCapitalize: 'none',
        autoCorrect: false,
        returnKeyType: 'next',
      },
    ],
    [
      'register',
      'register-confirm-password',
      {
        secureTextEntry: true,
        textContentType: 'newPassword',
        autoComplete: 'new-password',
        autoCapitalize: 'none',
        autoCorrect: false,
        returnKeyType: 'go',
      },
    ],
  ] as const;

  test.each(FIELDS)(
    '%s: %s is given exactly these props',
    async (screenName, id, expected) => {
      await render(screenName === 'login' ? <LoginScreen /> : <RegisterScreen />);
      expect(input(id).props).toMatchObject(expected);
    },
  );

  const PASSWORDS = [
    ['login', 'login-password'],
    ['register', 'register-password'],
    ['register', 'register-confirm-password'],
  ] as const;

  test.each(PASSWORDS)(
    '%s: %s is secure with no way to turn it off, and no field but the password fields is',
    async (screenName, id) => {
      await render(screenName === 'login' ? <LoginScreen /> : <RegisterScreen />);
      expect(input(id).props.secureTextEntry).toBe(true);

      const secure = hostNodes()
        .filter((node) => node.props.secureTextEntry === true)
        .map((node) => node.props.testID);
      expect(secure.every((testID) => /password/.test(String(testID)))).toBe(true);
      // No show/hide control: the only buttons are the action and the providers.
      expect(screen.queryByLabelText(/show password|hide password/i)).toBeNull();
    },
  );

  test.each(FIELDS)(
    '%s: %s keeps paste, the password manager and long input intact',
    async (screenName, id) => {
      await render(screenName === 'login' ? <LoginScreen /> : <RegisterScreen />);
      const props = input(id).props;

      expect(props.contextMenuHidden).not.toBe(true);
      expect(props.editable).not.toBe(false);
      expect(props.readOnly).not.toBe(true);
      expect(props.importantForAutofill).toBeUndefined();
      expect(props.onPaste).toBeUndefined();
      // A passphrase is never cut short: the contract has a floor and no ceiling to enforce here.
      expect(props.maxLength).toBeUndefined();
      expect(props.autoComplete).toEqual(expect.any(String));
      expect(props.textContentType).toEqual(expect.any(String));
    },
  );

  test('a pasted or autofilled value reaches the form exactly as it arrived, whitespace and case included', async () => {
    const pasted = `  ${SECRET} Mixed CASE  `;
    await render(<LoginScreen />);
    await fireEvent.changeText(input('login-email'), 'Ana@Example.com');
    await fireEvent.changeText(input('login-password'), pasted);
    await fireEvent.press(screen.getByTestId('login-submit'));

    expect(mockMutations.login.mutate).toHaveBeenCalledWith({
      email: 'Ana@Example.com',
      password: pasted,
    });
  });
});

describe('error mapping - a failure is a sentence, never an exception (T447)', () => {
  const FAILURES: [string, unknown][] = [
    [
      'a refused login',
      new ApiRequestError(401, {
        code: 'INVALID_CREDENTIALS',
        message: 'raw server words',
      }),
    ],
    [
      'an email already taken',
      new ApiRequestError(409, { code: 'EMAIL_TAKEN', message: 'raw server words' }),
    ],
    [
      'a rate limit',
      new ApiRequestError(429, { code: 'RATE_LIMITED', message: 'raw server words' }),
    ],
    [
      'a bare 429 from the edge',
      new ApiRequestError(429, { code: 'UNKNOWN', message: 'raw edge words' }),
    ],
    [
      'a network failure',
      new ApiRequestError(0, { code: 'NETWORK', message: 'raw fetch words' }),
    ],
    ['an exception with a secret in its text', new Error(`boom ${SECRET} at line 3`)],
    ['a type error', new TypeError(`cannot read ${SECRET}`)],
    ['a thrown string', `string ${SECRET}`],
  ];

  test.each(FAILURES)(
    'login shows %s through describeAuthError and nothing else',
    async (_name, failure) => {
      mockMutations.login.error = failure;
      const expected = describeAuthError(failure);
      await render(<LoginScreen />);

      expect(screen.getByTestId('login-error')).toHaveTextContent(expected);
      expect(screen.queryByText(new RegExp(SECRET))).toBeNull();
    },
  );

  test.each(FAILURES)(
    'register shows %s through describeAuthError and nothing else',
    async (_name, failure) => {
      mockMutations.register.error = failure;
      const expected = describeAuthError(failure);
      await render(<RegisterScreen />);

      expect(screen.getByTestId('register-error')).toHaveTextContent(expected);
      expect(screen.queryByText(new RegExp(SECRET))).toBeNull();
    },
  );

  test('an exception that is not the API’s own becomes the generic sentence, not its message', async () => {
    mockMutations.login.error = new Error(`SQLSTATE 28P01 ${SECRET}`);
    await render(<LoginScreen />);
    expect(screen.getByTestId('login-error')).toHaveTextContent(GENERIC_AUTH_ERROR);
  });

  test('a code the app has copy for shows the app’s copy, not the server’s words', async () => {
    mockMutations.login.error = new ApiRequestError(401, {
      code: 'INVALID_CREDENTIALS',
      message: 'That email and password combination was not recognised.',
    });
    await render(<LoginScreen />);
    expect(screen.getByTestId('login-error')).toHaveTextContent(
      "That email and password don't match.",
    );
  });

  test('a provider failure is a sentence too, and its token is never shown', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = 'client-id';
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID = 'client-id';
    mockMutations.google.error = new Error(`token ${SECRET}`);
    await render(<LoginScreen />);
    expect(screen.getByTestId('social-sign-in-error')).toHaveTextContent(
      GENERIC_AUTH_ERROR,
    );
    expect(screen.queryByText(new RegExp(SECRET))).toBeNull();
  });
});

describe('no field value leaves its field (T447)', () => {
  const PASSWORD_INPUT = /^(login|register)(-confirm)?-password$/;

  /** Where `needle` appears in the tree: any node's props, but a password input's own value. */
  function appearances(needle: string): string[] {
    return hostNodes()
      .filter((node) => {
        const { value: _value, ...rest } = node.props;
        const shown = PASSWORD_INPUT.test(String(node.props.testID)) ? rest : node.props;
        return JSON.stringify(shown).includes(needle);
      })
      .map((node) => String(node.props.testID ?? node.type));
  }

  test('a typed password is in the password inputs’ value and nowhere else on the screen', async () => {
    await render(<RegisterScreen />);
    await fireEvent.changeText(input('register-display-name'), NAME);
    await fireEvent.changeText(input('register-email'), EMAIL);
    await fireEvent.changeText(input('register-password'), SECRET);
    await fireEvent.changeText(input('register-confirm-password'), `${SECRET}x`);
    await fireEvent.press(screen.getByTestId('register-submit'));

    // The mismatch is said without quoting either value.
    expect(screen.getByText('Passwords do not match')).toBeTruthy();
    expect(appearances(SECRET)).toEqual([]);
    expect(screen.queryByText(new RegExp(SECRET))).toBeNull();
    expect(input('register-password').props.value).toBe(SECRET);
  });

  test('a refused login does not echo the credentials it was given', async () => {
    mockMutations.login.error = new ApiRequestError(401, {
      code: 'INVALID_CREDENTIALS',
      message: `no match for ${EMAIL} with ${SECRET}`,
    });
    await render(<LoginScreen />);
    await fireEvent.changeText(input('login-email'), EMAIL);
    await fireEvent.changeText(input('login-password'), SECRET);

    expect(appearances(SECRET)).toEqual([]);
    expect(screen.queryByText(new RegExp(`${SECRET}|${EMAIL}`))).toBeNull();
  });

  test('nothing is written to the console while a credential is typed, refused and fixed', async () => {
    mockMutations.login.error = new ApiRequestError(401, {
      code: 'INVALID_CREDENTIALS',
      message: 'x',
    });
    const { rerender } = await render(<LoginScreen />);
    await fireEvent.changeText(input('login-email'), EMAIL);
    await fireEvent.changeText(input('login-password'), SECRET);
    await fireEvent.press(screen.getByTestId('login-submit'));
    await fireEvent.changeText(input('login-password'), `${SECRET}2`);
    await rerender(<LoginScreen />);

    expect(consoleOutput()).not.toContain(SECRET);
    expect(consoleOutput()).not.toContain(EMAIL);
    expect(consoleSpies.flatMap((spy) => spy.mock.calls)).toEqual([]);
  });

  test('nothing is written to the console, or reported, while an account is created', async () => {
    mockMutations.register.error = new ApiRequestError(409, {
      code: 'EMAIL_TAKEN',
      message: 'x',
    });
    await render(<RegisterScreen />);
    await fireEvent.changeText(input('register-display-name'), NAME);
    await fireEvent.changeText(input('register-email'), EMAIL);
    await fireEvent.changeText(input('register-password'), SECRET);
    await fireEvent.changeText(input('register-confirm-password'), SECRET);
    await fireEvent.press(screen.getByTestId('register-submit'));

    expect(mockMutations.register.mutate).toHaveBeenCalledTimes(1);
    expect(consoleSpies.flatMap((spy) => spy.mock.calls)).toEqual([]);
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  test('a provider token goes to its mutation and nowhere else', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = 'client-id';
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID = 'client-id';
    mockGoogleResponse = { type: 'success', params: { id_token: SECRET } };
    await render(<LoginScreen />);
    await fireEvent.press(await screen.findByTestId('google-sign-in'));

    expect(mockMutations.google.mutate).toHaveBeenCalledWith(SECRET);
    expect(appearances(SECRET)).toEqual([]);
    expect(consoleOutput()).not.toContain(SECRET);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});

describe('no field value or secret travels in a route (T447)', () => {
  test('submitting Sign in or Create account navigates nowhere: the session gate swaps the group', async () => {
    const login = await render(<LoginScreen />);
    await fireEvent.changeText(input('login-email'), EMAIL);
    await fireEvent.changeText(input('login-password'), SECRET);
    await fireEvent.press(screen.getByTestId('login-submit'));
    await login.unmount();

    await render(<RegisterScreen />);
    await fireEvent.changeText(input('register-display-name'), NAME);
    await fireEvent.changeText(input('register-email'), EMAIL);
    await fireEvent.changeText(input('register-password'), SECRET);
    await fireEvent.changeText(input('register-confirm-password'), SECRET);
    await fireEvent.press(screen.getByTestId('register-submit'));

    for (const navigation of [
      mockPush,
      mockBack,
      mockReplace,
      mockNavigate,
      mockSetParams,
    ]) {
      expect(navigation).not.toHaveBeenCalled();
    }
  });

  test('the welcome screen asks for two bare paths: no query, no params object', async () => {
    await render(<WelcomeScreen />);
    await fireEvent.press(screen.getByTestId('welcome-sign-in'));
    await fireEvent.press(screen.getByTestId('welcome-create-account'));

    expect(mockPush.mock.calls).toEqual([['/login'], ['/register']]);
    expect(mockSetParams).not.toHaveBeenCalled();
  });
});

describe('the auth sources hold no logging, reporting or storage call (T447)', () => {
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

  test.each(FILES)('%s', (file) => {
    const text = source(file);
    expect(text).not.toMatch(/console\s*\./);
    expect(text).not.toMatch(/Sentry/);
    expect(text).not.toMatch(
      /expo-secure-store|AsyncStorage|localStorage|MMKV|expo-sqlite|expo-file-system/,
    );
    expect(text).not.toMatch(/useLocalSearchParams|useGlobalSearchParams|setParams/);
    expect(text).not.toMatch(/Clipboard|expo-clipboard/);
  });
});
