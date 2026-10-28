/**
 * Feature 008 (T804) - the Delete account sheet (FR-001 to FR-004, FR-006). The mutation is a
 * double with a settable state; what is pinned is what the sheet says, what it asks for, and what
 * it sends.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import DeleteAccountScreen from '@/app/modal/delete-account';
import { ApiRequestError } from '@/lib/api-client';

import { resetKeyboard, setWindow } from '../helpers/keyboard';

const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const mockMutation = {
  mutate: jest.fn(),
  reset: jest.fn(),
  isPending: false,
  error: null as unknown,
};
jest.mock('@/features/auth/use-delete-account', () => ({
  useDeleteAccount: () => mockMutation,
}));

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

beforeEach(() => {
  setWindow({ width: 390, height: 844 });
  resetKeyboard();
  mockRouter.back.mockClear();
  mockMutation.mutate.mockClear();
  mockMutation.isPending = false;
  mockMutation.error = null;
});

describe('<DeleteAccountScreen> what it says (FR-002)', () => {
  test('says it is for good, on every device, and cannot be undone', async () => {
    await render(<DeleteAccountScreen />);
    expect(screen.getByText('Delete your account?')).toBeTruthy();
    expect(screen.getByText(/for good, on every device/i)).toBeTruthy();
    expect(screen.getByText(/cannot be undone/i)).toBeTruthy();
  });

  test('lists what goes, files included', async () => {
    await render(<DeleteAccountScreen />);
    for (const thing of [
      /trips and stops/i,
      /notes/i,
      /expenses/i,
      /photos and documents/i,
    ]) {
      expect(screen.getByText(thing)).toBeTruthy();
    }
  });

  test('says it does not cancel a subscription', async () => {
    await render(<DeleteAccountScreen />);
    expect(screen.getByText(/does not cancel a subscription/i)).toBeTruthy();
    expect(screen.getByText(/App Store or Google Play/)).toBeTruthy();
  });
});

describe('<DeleteAccountScreen> what it asks for (FR-003)', () => {
  test('one secure password field that says Google and Apple accounts leave it empty', async () => {
    await render(<DeleteAccountScreen />);
    const field = screen.getByTestId('delete-account-password');
    expect(field.props.secureTextEntry).toBe(true);
    expect(screen.getByText(/signed in with Google or Apple/i)).toBeTruthy();
  });

  test('Cancel closes the sheet and sends nothing', async () => {
    await render(<DeleteAccountScreen />);
    await fireEvent.press(screen.getByTestId('delete-account-cancel'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockMutation.mutate).not.toHaveBeenCalled();
  });

  test('the destructive action is never the coral primary', async () => {
    await render(<DeleteAccountScreen />);
    const action = screen.getByTestId('delete-account-save');
    // The button marks its emphasis under the names the screen suites read (`danger-soft`).
    expect(action.props.variant).toBe('danger-soft');
    expect(screen.getByLabelText('Delete my account')).toBe(action);
  });

  test('has no primary button at all (Cancel is text, the action is destructive)', async () => {
    await render(<DeleteAccountScreen />);
    const primaries = screen
      .getAllByRole('button')
      .filter((button) => button.props.variant === 'primary');
    expect(primaries).toEqual([]);
  });
});

describe('<DeleteAccountScreen> what it sends (FR-006)', () => {
  test('the typed password, and nothing else', async () => {
    await render(<DeleteAccountScreen />);
    await fireEvent.changeText(
      screen.getByTestId('delete-account-password'),
      'my password',
    );
    await fireEvent.press(screen.getByTestId('delete-account-save'));
    expect(mockMutation.mutate).toHaveBeenCalledWith({ password: 'my password' });
  });

  test('an empty field sends no password (an account with none)', async () => {
    await render(<DeleteAccountScreen />);
    await fireEvent.press(screen.getByTestId('delete-account-save'));
    expect(mockMutation.mutate).toHaveBeenCalledWith({});
  });

  test('is busy while the request runs, and cannot be pressed twice', async () => {
    mockMutation.isPending = true;
    await render(<DeleteAccountScreen />);
    const action = screen.getByTestId('delete-account-save');
    expect(action.props.accessibilityState).toMatchObject({ busy: true });
    await fireEvent.press(action);
    expect(mockMutation.mutate).not.toHaveBeenCalled();
  });
});

describe('<DeleteAccountScreen> refusals in words (FR-004)', () => {
  test.each([
    [
      'a wrong or missing password',
      403,
      'REAUTHENTICATION_REQUIRED',
      /Enter your password to confirm/,
    ],
    ['no connection', 0, 'NETWORK', /couldn.t reach the server/i],
    ['a timeout', 0, 'TIMEOUT', /couldn.t reach the server/i],
    ['a server fault', 500, 'INTERNAL', /Nothing was deleted/],
  ])('%s', async (_name, status, code, words) => {
    mockMutation.error = new ApiRequestError(status, { code, message: code });
    await render(<DeleteAccountScreen />);
    const error = screen.getByTestId('delete-account-error');
    expect(error.props.accessibilityRole).toBe('alert');
    expect(screen.getByText(words)).toBeTruthy();
  });

  test('shows no error before anything went wrong', async () => {
    await render(<DeleteAccountScreen />);
    expect(screen.queryByTestId('delete-account-error')).toBeNull();
  });
});
