/**
 * T1511 - the three recovery screens (spec 015 User Story 6; FR-015..FR-017): the reset
 * request says the same words for any address, the reset link sets a new password and sends
 * the traveller to sign in, a bad link is said in words with a way to ask again, the
 * verification link confirms or says it is invalid, and the token is never shown, logged or
 * left in the route.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import ForgotPasswordScreen, { SENT_MESSAGE } from '@/app/(auth)/forgot-password';
import ResetPasswordScreen from '@/app/reset-password';
import VerifyEmailScreen from '@/app/verify-email';
import { useSessionStore } from '@/features/auth/session-store';
import { ApiRequestError } from '@/lib/api-client';

type Json = {
  type: string;
  props: Record<string, unknown>;
  children?: (Json | string)[];
};
/** Every host node of the rendered tree, in document order. */
function hostNodes(node: Json | null = screen.toJSON() as Json | null): Json[] {
  if (node === null) return [];
  const below = (node.children ?? []).flatMap((child) =>
    typeof child === 'string' ? [] : hostNodes(child),
  );
  return [node, ...below];
}

const TOKEN = 'abcDEF0123456789_-abcDEF0123456789';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockSetParams = jest.fn();
let mockParams: Record<string, string | string[] | undefined> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, setParams: mockSetParams }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

type MutationStub = {
  mutate: jest.Mock;
  reset: jest.Mock;
  isPending: boolean;
  isSuccess: boolean;
  error: unknown;
};
const stub = (): MutationStub => ({
  mutate: jest.fn(),
  reset: jest.fn(),
  isPending: false,
  isSuccess: false,
  error: null,
});
const mockMutations = { request: stub(), confirm: stub(), verify: stub() };
jest.mock('@/features/auth/account-recovery', () => ({
  ...jest.requireActual('@/features/auth/account-recovery'),
  useRequestPasswordReset: () => mockMutations.request,
  useConfirmPasswordReset: () => mockMutations.confirm,
  useVerifyEmail: () => mockMutations.verify,
}));

beforeEach(() => {
  mockParams = {};
  jest.clearAllMocks();
  for (const mutation of Object.values(mockMutations)) {
    Object.assign(mutation, stub(), { mutate: jest.fn(), reset: jest.fn() });
  }
  useSessionStore.setState({ status: 'signed-out', user: null });
});

describe('Forgot password', () => {
  it('refuses an address that is not one, in words, and sends nothing', async () => {
    await render(<ForgotPasswordScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'nope');
    await fireEvent.press(screen.getByTestId('forgot-password-submit'));
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
    expect(mockMutations.request.mutate).not.toHaveBeenCalled();
  });

  it('requests a reset, and the return key sends too', async () => {
    await render(<ForgotPasswordScreen />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'ana@example.com');
    await fireEvent(screen.getByLabelText('Email'), 'submitEditing');
    expect(mockMutations.request.mutate).toHaveBeenCalledWith({
      email: 'ana@example.com',
    });
  });

  it('says the same words whatever the address is', async () => {
    mockMutations.request.isSuccess = true;
    await render(<ForgotPasswordScreen />);
    expect(screen.getByText(SENT_MESSAGE)).toBeTruthy();
    expect(SENT_MESSAGE).not.toMatch(/no account|not found|unknown|exists/i);
  });

  it('says a failed request in words', async () => {
    mockMutations.request.error = new ApiRequestError(0, {
      code: 'NETWORK',
      message: 'x',
    });
    await render(<ForgotPasswordScreen />);
    expect(screen.getByTestId('forgot-password-error')).toBeTruthy();
    expect(screen.getByText(/offline/i)).toBeTruthy();
  });

  it('goes back to sign in', async () => {
    await render(<ForgotPasswordScreen />);
    await fireEvent.press(screen.getByTestId('forgot-password-back'));
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('scrolls above the keyboard and keeps taps on the buttons while it is open (C4-10 rule 8)', async () => {
    await render(<ForgotPasswordScreen />);
    const scroller = hostNodes().find((node) => node.type === 'RCTScrollView');
    expect(scroller?.props.keyboardShouldPersistTaps).toBe('handled');
    expect(scroller?.props.bottomOffset).toEqual(expect.any(Number));
  });
});

describe('Reset password', () => {
  it('takes the token out of the route at once and never shows it', async () => {
    mockParams = { token: TOKEN };
    await render(<ResetPasswordScreen />);
    expect(mockSetParams).toHaveBeenCalledWith({ token: undefined });
    expect(screen.queryByText(new RegExp(TOKEN))).toBeNull();
    expect(JSON.stringify(screen.toJSON())).not.toContain(TOKEN);
  });

  it('refuses a short password and a mismatch in words', async () => {
    mockParams = { token: TOKEN };
    await render(<ResetPasswordScreen />);
    await fireEvent.changeText(screen.getByLabelText('New password'), 'short');
    await fireEvent.press(screen.getByTestId('reset-password-submit'));
    expect(screen.getAllByText('Use at least 12 characters.').length).toBeGreaterThan(0);
    await fireEvent.changeText(screen.getByLabelText('New password'), 'twelve chars!');
    await fireEvent.changeText(
      screen.getByLabelText('Confirm password'),
      'other chars!!',
    );
    expect(screen.getAllByText('Passwords do not match').length).toBeGreaterThan(0);
    expect(mockMutations.confirm.mutate).not.toHaveBeenCalled();
  });

  it('saves the new password with the token, then sends the traveller to sign in', async () => {
    mockParams = { token: TOKEN };
    await render(<ResetPasswordScreen />);
    await fireEvent.changeText(screen.getByLabelText('New password'), 'twelve chars!');
    await fireEvent.changeText(
      screen.getByLabelText('Confirm password'),
      'twelve chars!',
    );
    await fireEvent.press(screen.getByTestId('reset-password-submit'));
    expect(mockMutations.confirm.mutate).toHaveBeenCalledWith(
      { token: TOKEN, password: 'twelve chars!' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    const { onSuccess } = mockMutations.confirm.mutate.mock.calls[0][1] as {
      onSuccess: () => void;
    };
    onSuccess();
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it.each([
    ['no token', {}],
    ['a malformed token', { token: 'nope' }],
  ])('%s: says so in words and offers a new request', async (_name, params) => {
    mockParams = params;
    await render(<ResetPasswordScreen />);
    expect(screen.getByTestId('reset-password-invalid')).toBeTruthy();
    expect(screen.queryByTestId('reset-password-submit')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Ask for a new link'));
    expect(mockReplace).toHaveBeenCalledWith('/forgot-password');
    expect(mockMutations.confirm.mutate).not.toHaveBeenCalled();
  });

  it('an expired or used link, refused by the server, says so and offers a new request', async () => {
    mockParams = { token: TOKEN };
    mockMutations.confirm.error = new ApiRequestError(400, {
      code: 'RESET_TOKEN_INVALID',
      message: 'x',
    });
    await render(<ResetPasswordScreen />);
    expect(screen.getByTestId('reset-password-invalid')).toBeTruthy();
    expect(screen.getByLabelText('Ask for a new link')).toBeTruthy();
  });

  it('an offline failure keeps the form for another try', async () => {
    mockParams = { token: TOKEN };
    mockMutations.confirm.error = new ApiRequestError(0, {
      code: 'NETWORK',
      message: 'x',
    });
    await render(<ResetPasswordScreen />);
    expect(screen.getByTestId('reset-password-error')).toBeTruthy();
    expect(screen.getByTestId('reset-password-submit')).toBeTruthy();
  });

  it('signed in, there is no way to the sign-in group: it offers Close instead', async () => {
    useSessionStore.setState({ status: 'signed-in' });
    await render(<ResetPasswordScreen />);
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('scrolls above the keyboard (C4-10 rule 8)', async () => {
    mockParams = { token: TOKEN };
    await render(<ResetPasswordScreen />);
    const scroller = hostNodes().find((node) => node.type === 'RCTScrollView');
    expect(scroller?.props.keyboardShouldPersistTaps).toBe('handled');
  });
});

describe('Verify email', () => {
  it('sends the token once, removes it from the route and confirms', async () => {
    mockParams = { token: TOKEN };
    const view = await render(<VerifyEmailScreen />);
    expect(mockSetParams).toHaveBeenCalledWith({ token: undefined });
    expect(mockMutations.verify.mutate).toHaveBeenCalledTimes(1);
    expect(mockMutations.verify.mutate).toHaveBeenCalledWith({ token: TOKEN });

    mockMutations.verify.isSuccess = true;
    await view.rerender(<VerifyEmailScreen />);
    expect(screen.getByText('Email confirmed')).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).not.toContain(TOKEN);
    await fireEvent.press(screen.getByLabelText('Go to sign in'));
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('works signed in too', async () => {
    useSessionStore.setState({ status: 'signed-in' });
    mockParams = { token: TOKEN };
    mockMutations.verify.isSuccess = true;
    await render(<VerifyEmailScreen />);
    await fireEvent.press(screen.getByLabelText('Continue'));
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('a malformed or missing token says the link is no longer valid and sends nothing', async () => {
    mockParams = { token: 'nope' };
    await render(<VerifyEmailScreen />);
    expect(screen.getByText('This link is no longer valid')).toBeTruthy();
    expect(mockMutations.verify.mutate).not.toHaveBeenCalled();
  });

  it('an expired link, refused by the server, says so', async () => {
    mockParams = { token: TOKEN };
    mockMutations.verify.error = new ApiRequestError(400, {
      code: 'VERIFICATION_TOKEN_INVALID',
      message: 'x',
    });
    await render(<VerifyEmailScreen />);
    expect(screen.getByText('This link is no longer valid')).toBeTruthy();
  });

  it('an offline failure offers another try', async () => {
    mockParams = { token: TOKEN };
    mockMutations.verify.error = new ApiRequestError(0, {
      code: 'NETWORK',
      message: 'x',
    });
    await render(<VerifyEmailScreen />);
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(mockMutations.verify.reset).toHaveBeenCalled();
  });
});

describe('the token stays out of logs and reports', () => {
  it.each([
    'src/app/reset-password.tsx',
    'src/app/verify-email.tsx',
    'src/features/auth/account-recovery.ts',
  ])('%s never logs or reports', (file) => {
    const source = readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
    expect(source).not.toMatch(/console\.|Sentry\.|captureException/);
  });
});
