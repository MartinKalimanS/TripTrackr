/**
 * F12 (T555) - Sign in and Create account as pictured (`more/auth.png`, `register.png`;
 * UI-SPEC 7): the heading with its one serif accent word, the error summary that names every
 * problem and links to its field, "Forgot password?" in the label row (a coming-soon control),
 * the visible password rule, the legal line with real links and the privacy promise. The
 * credential fields' own props, the error mapping and the logging are unchanged and still
 * pinned by `auth-security.test.tsx`; the spot checks here show the new parts did not touch them.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Linking, TextInput } from 'react-native';

import LoginScreen from '@/app/(auth)/login';
import RegisterScreen from '@/app/(auth)/register';
import { LEGAL_URLS } from '@/constants/legal-urls';

import { glyphNamesIn } from '../helpers/icons';

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
jest.mock('expo-auth-session/providers/google', () => ({
  useIdTokenAuthRequest: () => [{ loaded: true }, null, jest.fn()],
}));

const mockShow = jest.fn();
jest.mock('@/components/ui/toast', () => ({
  useToast: () => ({ show: mockShow, hide: jest.fn() }),
}));

const idsInOrder = () => {
  const ids: string[] = [];
  const walk = (node: unknown) => {
    if (node === null || typeof node !== 'object') return;
    const host = node as {
      props?: { testID?: unknown };
      children?: unknown[] | null;
    };
    if (typeof host.props?.testID === 'string') ids.push(host.props.testID);
    (host.children ?? []).forEach(walk);
  };
  const tree = screen.toJSON();
  (Array.isArray(tree) ? tree : [tree]).forEach(walk);
  return ids;
};

beforeEach(() => {
  mockPush.mockReset();
  mockShow.mockReset();
  for (const mutation of Object.values(mockMutations)) {
    mutation.mutate.mockReset();
    mutation.isPending = false;
    mutation.error = null;
  }
});

describe('Sign in as pictured', () => {
  test('the heading is "Welcome back" with exactly one nested serif accent word', async () => {
    await render(<LoginScreen />);
    const heading = screen.getByRole('header');
    expect(heading).toHaveTextContent('Welcome back');
    const accents = within(heading).getAllByText('back');
    expect(accents).toHaveLength(1);
    expect(String(accents[0].props.className)).toMatch(/serif|instrument|accent/i);
  });

  test('shows no summary until the traveller has tried', async () => {
    await render(<LoginScreen />);
    expect(screen.queryByTestId('auth-error-summary')).toBeNull();
  });

  test('after a try, the summary names each problem in words with an alert icon, above the fields', async () => {
    await render(<LoginScreen />);
    await fireEvent.press(screen.getByTestId('login-submit'));

    const summary = screen.getByTestId('auth-error-summary');
    expect(summary.props.accessibilityRole).toBe('alert');
    expect(within(summary).getByText('Fix 2 things to sign in')).toBeTruthy();
    expect(within(summary).getByText('Email: Enter a valid email address.')).toBeTruthy();
    expect(within(summary).getByText('Password: Enter your password.')).toBeTruthy();
    expect(glyphNamesIn(summary)).toContain('alert');
    // The per-field messages are still under their fields, in the same words.
    expect(screen.getByTestId('login-email-error')).toHaveTextContent(
      'Enter a valid email address.',
    );
    const order = idsInOrder();
    expect(order.indexOf('auth-error-summary')).toBeLessThan(
      order.indexOf('login-email'),
    );
    expect(mockMutations.login.mutate).not.toHaveBeenCalled();
  });

  test('each summary line moves focus to its field', async () => {
    const focus = jest.spyOn(TextInput.prototype as { focus: () => void }, 'focus');
    await render(<LoginScreen />);
    await fireEvent.press(screen.getByTestId('login-submit'));
    await fireEvent.press(screen.getByLabelText('Password: Enter your password.'));
    expect(focus).toHaveBeenCalledTimes(1);
    focus.mockRestore();
  });

  test('the summary stays live: fixing a field shrinks it, fixing both removes it', async () => {
    await render(<LoginScreen />);
    await fireEvent.press(screen.getByTestId('login-submit'));
    await fireEvent.changeText(screen.getByLabelText('Email'), 'ana@example.com');
    expect(screen.getByText('Fix 1 thing to sign in')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Password'), 'correct horse');
    expect(screen.queryByTestId('auth-error-summary')).toBeNull();
  });

  test('"Forgot password?" is a coming-soon control in the password label row: one toast and nothing else', async () => {
    await render(<LoginScreen />);
    const forgot = screen.getByTestId('coming-soon-forgot-password');
    expect(forgot.props.accessibilityRole).toBe('button');
    expect(forgot.props.accessibilityLabel).toBe('Forgot password?');
    expect(forgot.props.accessibilityHint).toBe('Not available yet');
    const order = idsInOrder();
    expect(order.indexOf('coming-soon-forgot-password')).toBeLessThan(
      order.indexOf('login-password'),
    );

    await fireEvent.press(forgot);
    expect(mockShow).toHaveBeenCalledTimes(1);
    expect(mockShow).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Password reset is coming soon' }),
    );
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockMutations.login.mutate).not.toHaveBeenCalled();
  });

  test('the credential props are unchanged and there is still no reveal toggle', async () => {
    await render(<LoginScreen />);
    expect(screen.getByTestId('login-password').props).toMatchObject({
      secureTextEntry: true,
      textContentType: 'password',
      autoComplete: 'current-password',
      autoCapitalize: 'none',
      autoCorrect: false,
    });
    expect(screen.queryByLabelText(/show password|hide password/i)).toBeNull();
    expect(screen.queryByTestId('icon-eye')).toBeNull();
  });

  test('the social buttons stay under the form and the primary is still the lower action', async () => {
    await render(<LoginScreen />);
    const order = idsInOrder();
    expect(order.indexOf('login-password')).toBeLessThan(order.indexOf('login-submit'));
    expect(order.indexOf('login-submit')).toBeLessThan(order.indexOf('social-sign-in'));
  });
});

describe('Create account as pictured', () => {
  const fill = async (values: Record<string, string>) => {
    for (const [label, value] of Object.entries(values)) {
      await fireEvent.changeText(screen.getByLabelText(label), value);
    }
  };

  test('the heading is "Create your passport" with exactly one nested serif accent word', async () => {
    await render(<RegisterScreen />);
    const heading = screen.getByRole('header');
    expect(heading).toHaveTextContent('Create your passport');
    expect(within(heading).getAllByText('passport')).toHaveLength(1);
  });

  test('the password rule is a word and an icon, and says met once the floor is reached', async () => {
    await render(<RegisterScreen />);
    const rule = () => screen.getByTestId('password-rule');
    expect(rule().props.accessibilityLabel).toBe('At least 12 characters, not met yet');
    expect(glyphNamesIn(rule())).toEqual(['info']);

    await fill({ Password: 'eleven char' });
    expect(rule().props.accessibilityLabel).toBe('At least 12 characters, not met yet');
    await fill({ Password: 'twelve chars' });
    expect(rule().props.accessibilityLabel).toBe('At least 12 characters, met');
    expect(glyphNamesIn(rule())).toEqual(['check-circle']);
  });

  test('lists only the contract’s rule: no composition rule is invented', async () => {
    await render(<RegisterScreen />);
    expect(screen.getAllByTestId('password-rule')).toHaveLength(1);
    expect(screen.queryByText(/one number|common password/i)).toBeNull();
  });

  test('after a try, the summary counts and names all four problems, the mismatch included', async () => {
    await render(<RegisterScreen />);
    await fill({ Name: ' ', Email: 'nope', Password: 'short', 'Confirm password': 'x' });
    await fireEvent.press(screen.getByTestId('register-submit'));

    const summary = screen.getByTestId('auth-error-summary');
    expect(within(summary).getByText('Fix 4 things to create your account')).toBeTruthy();
    for (const line of [
      'Name: Tell us what to call you (up to 60 characters).',
      'Email: Enter a valid email address.',
      'Password: Use at least 12 characters.',
      'Confirm password: Passwords do not match',
    ]) {
      expect(within(summary).getByText(line)).toBeTruthy();
    }
    expect(mockMutations.register.mutate).not.toHaveBeenCalled();
  });

  test('the legal line has real links, and the privacy promise follows it, before the action', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(<RegisterScreen />);
    expect(screen.getByTestId('legal-line')).toHaveTextContent(
      'By creating an account you agree to the Terms and Privacy Policy.',
    );
    await fireEvent.press(screen.getByTestId('legal-terms-link'));
    expect(openURL).toHaveBeenLastCalledWith(LEGAL_URLS.terms);
    await fireEvent.press(screen.getByTestId('legal-privacy-link'));
    expect(openURL).toHaveBeenLastCalledWith(LEGAL_URLS.privacy);

    const promise = screen.getByTestId('privacy-promise');
    expect(promise).toHaveTextContent('Expenses and documents stay private to you.');
    expect(glyphNamesIn(promise)).toEqual(['lock']);
    const order = idsInOrder();
    expect(order.indexOf('register-confirm-password')).toBeLessThan(
      order.indexOf('legal-line'),
    );
    expect(order.indexOf('legal-line')).toBeLessThan(order.indexOf('privacy-promise'));
    expect(order.indexOf('privacy-promise')).toBeLessThan(
      order.indexOf('register-actions'),
    );
    openURL.mockRestore();
  });

  test('the credential props are unchanged and there is no reveal toggle', async () => {
    await render(<RegisterScreen />);
    for (const id of ['register-password', 'register-confirm-password']) {
      expect(screen.getByTestId(id).props).toMatchObject({
        secureTextEntry: true,
        textContentType: 'newPassword',
        autoComplete: 'new-password',
        autoCapitalize: 'none',
        autoCorrect: false,
      });
    }
    expect(screen.queryByLabelText(/show password|hide password/i)).toBeNull();
  });

  test('a valid form still submits the same request', async () => {
    await render(<RegisterScreen />);
    await fill({
      Name: 'Ana',
      Email: 'ana@example.com',
      Password: 'correct horse battery',
      'Confirm password': 'correct horse battery',
    });
    await fireEvent.press(screen.getByTestId('register-submit'));
    expect(mockMutations.register.mutate).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'correct horse battery',
      display_name: 'Ana',
    });
    expect(screen.queryByTestId('auth-error-summary')).toBeNull();
  });
});
