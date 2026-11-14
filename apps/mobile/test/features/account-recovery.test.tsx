/**
 * T1511 - account recovery logic (spec 015 FR-015..FR-017): the token's shape is checked before
 * anything is sent, the requests carry the right body and no session, and a refusal becomes
 * words the screens can show.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import {
  RECOVERY_TOKEN_SHAPE,
  describeRecoveryFailure,
  readRecoveryToken,
  useConfirmPasswordReset,
  useRequestPasswordReset,
  useVerifyEmail,
  validateNewPassword,
  validateResetEmail,
} from '@/features/auth/account-recovery';
import { ApiRequestError } from '@/lib/api-client';

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return { ...actual, apiFetch: jest.fn() };
});
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const { apiFetch } = jest.requireMock('@/lib/api-client') as { apiFetch: jest.Mock };
const TOKEN = 'abcDEF0123456789_-abcDEF0123456789';

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => apiFetch.mockReset());

describe('the token', () => {
  it('accepts the shape the server issues (base64url, 32 bytes)', () => {
    expect(RECOVERY_TOKEN_SHAPE.test(TOKEN)).toBe(true);
    expect(readRecoveryToken(TOKEN)).toBe(TOKEN);
  });

  it.each([
    undefined,
    '',
    'short',
    'has space in it 1234567890',
    'a'.repeat(201),
    '../etc/passwd/aaaa',
    [],
  ])('refuses %p', (raw) => {
    expect(readRecoveryToken(raw)).toBeNull();
  });

  it('takes the first of a repeated parameter', () => {
    expect(readRecoveryToken([TOKEN, 'x'])).toBe(TOKEN);
  });
});

describe('validation', () => {
  it('asks for a valid email', () => {
    expect(validateResetEmail('nope').email).toBeDefined();
    expect(validateResetEmail('ana@example.com')).toEqual({});
  });

  it('needs 12 characters and a matching confirmation', () => {
    expect(validateNewPassword('short', 'short').password).toBeDefined();
    expect(
      validateNewPassword('twelve chars!', 'different one!').confirmation,
    ).toBeDefined();
    expect(validateNewPassword('twelve chars!', 'twelve chars!')).toEqual({});
  });
});

describe('describeRecoveryFailure', () => {
  it.each(['RESET_TOKEN_INVALID', 'VERIFICATION_TOKEN_INVALID'])(
    '%s is an invalid link',
    (code) => {
      expect(
        describeRecoveryFailure(new ApiRequestError(400, { code, message: 'x' })).kind,
      ).toBe('invalid-link');
    },
  );

  it('a network failure is not a bad link', () => {
    const failure = describeRecoveryFailure(
      new ApiRequestError(0, { code: 'NETWORK', message: 'x' }),
    );
    expect(failure.kind).toBe('retry');
    expect(failure.message).toMatch(/offline/i);
  });

  it('never echoes the text of an unknown failure', () => {
    const failure = describeRecoveryFailure(new Error(`boom ${TOKEN}`));
    expect(failure.message).not.toContain(TOKEN);
  });
});

describe('the requests', () => {
  it('asks for a reset without a session', async () => {
    apiFetch.mockResolvedValue(undefined);
    const { result } = await renderHook(() => useRequestPasswordReset(), { wrapper });
    await act(async () => result.current.mutate({ email: ' Ana@Example.com' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, path, options] = apiFetch.mock.calls[0];
    expect(path).toBe('/auth/password-reset/request');
    expect(options).toMatchObject({
      method: 'POST',
      auth: false,
      body: { email: 'ana@example.com' },
    });
  });

  it('confirms a reset with the token and the new password', async () => {
    apiFetch.mockResolvedValue(undefined);
    const { result } = await renderHook(() => useConfirmPasswordReset(), { wrapper });
    await act(async () =>
      result.current.mutate({ token: TOKEN, password: 'twelve chars!' }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, path, options] = apiFetch.mock.calls[0];
    expect(path).toBe('/auth/password-reset/confirm');
    expect(options).toMatchObject({
      auth: false,
      body: { token: TOKEN, password: 'twelve chars!' },
    });
  });

  it('refuses a malformed token before anything is sent', async () => {
    const { result } = await renderHook(() => useConfirmPasswordReset(), { wrapper });
    await act(async () =>
      result.current.mutate({ token: 'bad', password: 'twelve chars!' }),
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(apiFetch).not.toHaveBeenCalled();
    expect(describeRecoveryFailure(result.current.error).kind).toBe('invalid-link');
  });

  it('verifies an email, signed in or out (no session needed)', async () => {
    apiFetch.mockResolvedValue(undefined);
    const { result } = await renderHook(() => useVerifyEmail(), { wrapper });
    await act(async () => result.current.mutate({ token: TOKEN }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetch.mock.calls[0][1]).toBe('/auth/verify-email');
    expect(apiFetch.mock.calls[0][2]).toMatchObject({
      auth: false,
      body: { token: TOKEN },
    });
  });
});
