/**
 * R009 — the `(auth)` group placeholders.
 *
 * These screens carry product copy and the primitives' guarantees only; the
 * sign-in and registration mutations arrive with US1 (T064/T065). What is
 * pinned here is what must survive that work: every action is labelled
 * (contract C9), the copy is TripTrackr's rather than the template's, and the
 * forms are composed from `<TextField>` so they read as fields before they are
 * touched (Acceptance Scenario 1.3).
 *
 * `expo-router` is replaced with a recording router: the screens' job is to
 * ask for a navigation, and the root layout suite covers what the real router
 * does with it.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import LoginScreen from '@/app/(auth)/login';
import RegisterScreen from '@/app/(auth)/register';
import WelcomeScreen from '@/app/(auth)/welcome';

// `mock`-prefixed so Jest's hoisted factory may reference them.
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
}));

describe('<WelcomeScreen>', () => {
  test('greets with product copy, not template copy', async () => {
    await render(<WelcomeScreen />);
    expect(screen.getByText('TripTrackr')).toBeTruthy();
    expect(screen.getByText('Plan it. Live it. Share what you want.')).toBeTruthy();
    expect(screen.queryByText(/Welcome to Expo/)).toBeNull();
  });

  test('offers sign in and create account as labelled actions (C9)', async () => {
    await render(<WelcomeScreen />);
    expect(screen.getByLabelText('Sign in')).toBeTruthy();
    expect(screen.getByLabelText('Create account')).toBeTruthy();
  });

  test('exposes stable ids for the Maestro flows', async () => {
    await render(<WelcomeScreen />);
    expect(screen.getByTestId('welcome-screen')).toBeTruthy();
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
});

describe('<LoginScreen>', () => {
  test('renders an email and a password field', async () => {
    await render(<LoginScreen />);
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });

  test('keeps what the traveller types', async () => {
    await render(<LoginScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'ana@example.com');
    expect(screen.getByLabelText('Email').props.value).toBe('ana@example.com');
  });

  test('masks the password and never autocorrects an email', async () => {
    await render(<LoginScreen />);
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
    expect(screen.getByLabelText('Email').props.autoCapitalize).toBe('none');
    expect(screen.getByLabelText('Email').props.keyboardType).toBe('email-address');
  });

  test('has a labelled submit action that makes no network call yet', async () => {
    await render(<LoginScreen />);
    const submit = screen.getByLabelText('Sign in');
    // Not wired until T065 — pressing must be inert, not a crash or a fetch.
    await fireEvent.press(submit);
    expect(submit.props.accessibilityState).toMatchObject({ disabled: true });
  });

  test('offers a way back — the header is hidden, so the screen supplies its own', async () => {
    await render(<LoginScreen />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('<RegisterScreen>', () => {
  test('renders email, password, and confirmation fields', async () => {
    await render(<RegisterScreen />);
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.getByLabelText('Confirm password')).toBeTruthy();
  });

  test('tells the traveller when the two passwords disagree, by text (FR-010)', async () => {
    await render(<RegisterScreen />);
    await fireEvent.changeText(screen.getByLabelText('Password'), 'correct horse');
    await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'wrong horse');
    expect(screen.getByText('Passwords do not match')).toBeTruthy();
  });

  test('has a labelled create-account action, inert until US1 wires it', async () => {
    await render(<RegisterScreen />);
    const submit = screen.getByLabelText('Create account');
    expect(submit.props.accessibilityState).toMatchObject({ disabled: true });
  });

  test('does not shout about a mismatch before the confirmation has been typed', async () => {
    await render(<RegisterScreen />);
    await fireEvent.changeText(screen.getByLabelText('Password'), 'correct horse');
    expect(screen.queryByText('Passwords do not match')).toBeNull();
  });

  test('offers a way back', async () => {
    await render(<RegisterScreen />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('auth screens — no backend yet', () => {
  test.each(['(auth)/welcome', '(auth)/login', '(auth)/register'])(
    '%s imports no API client and performs no fetch (US1 owns that)',
    (route) => {
      const source = jest
        .requireActual('fs')
        .readFileSync(require.resolve(`@/app/${route}`), 'utf8') as string;
      expect(source).not.toMatch(/fetch\(|axios|api-client|useMutation/);
    },
  );
});
