/** Spec 012 (FR-001, FR-003): the nonce comes from the server and Apple is given its SHA-256. */
import { apiFetch } from '@/lib/api-client';

// The setup file replaces `fetchOAuthNonce` for the screens; this suite tests the real one.
const { fetchOAuthNonce, hashNonce } = jest.requireActual<
  typeof import('@/features/auth/oauth-nonce')
>('@/features/auth/oauth-nonce');

jest.mock('@/lib/api-client', () => ({ apiFetch: jest.fn() }));

describe('fetchOAuthNonce', () => {
  it('asks the public nonce route and returns the nonce', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({ nonce: 'abcdefghijklmnopqrstuv' });

    await expect(fetchOAuthNonce()).resolves.toBe('abcdefghijklmnopqrstuv');

    expect(apiFetch).toHaveBeenCalledWith(expect.anything(), '/auth/oauth/nonce', {
      method: 'POST',
      auth: false,
    });
  });
});

describe('hashNonce', () => {
  it('is the lower-case hex SHA-256 (the form the server expects back from Apple)', async () => {
    await expect(hashNonce('abc')).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
