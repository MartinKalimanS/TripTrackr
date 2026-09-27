import { Logger } from '@nestjs/common';

import { resetEnvCache } from '@/common/config/env.schema';
import {
  APPLE_ISSUER,
  OAuthProviderUnavailableError,
  OAuthTokenInvalidError,
  OAuthTokenVerifier,
  type OAuthClients,
} from '@/modules/auth/oauth-token-verifier';

import { applyUnitTestEnv } from '../support/env';

/**
 * Server-side verification of provider tokens (FR-002, rest-api.md §1), with
 * the provider clients mocked — never the network.
 *
 * What the wrapper owes the rest of the auth module: the identity a provider
 * vouched for, reduced to the fields account creation needs; a refusal that
 * says nothing about why; and a clear signal when the provider is not
 * configured at all, so the endpoint answers 503 rather than accepting a
 * token it could not have checked against any audience.
 */

interface GoogleCall {
  idToken: string;
  audience: string | string[] | undefined;
}

function clients(overrides: Partial<OAuthClients> = {}): {
  readonly clients: OAuthClients;
  readonly googleCalls: GoogleCall[];
  readonly appleCalls: { token: string; options: unknown }[];
} {
  const googleCalls: GoogleCall[] = [];
  const appleCalls: { token: string; options: unknown }[] = [];

  const google: OAuthClients['google'] = {
    verifyIdToken: (options) => {
      googleCalls.push({ idToken: options.idToken, audience: options.audience });
      return Promise.resolve({
        getPayload: () => ({
          iss: 'https://accounts.google.com',
          sub: 'google-sub-1',
          aud: 'ios-client-id',
          iat: 1,
          exp: 2,
          email: 'Traveller@Example.test',
          email_verified: true,
          name: 'Traveller One',
        }),
      });
    },
  };

  const apple: OAuthClients['apple'] = {
    verify: (token, options) => {
      appleCalls.push({ token, options });
      return Promise.resolve({
        payload: {
          iss: APPLE_ISSUER,
          sub: 'apple-sub-1',
          aud: 'app.triptrackr.ios',
          email: 'private@privaterelay.appleid.com',
          email_verified: 'true',
          is_private_email: 'true',
        },
      });
    },
  };

  return { clients: { google, apple, ...overrides }, googleCalls, appleCalls };
}

/**
 * A promise rejected with `reason` exactly as given. Provider libraries do
 * not all reject with an Error, and that is the case under test.
 */
function rejectWith(reason: unknown): Promise<never> {
  return Promise.resolve().then(() => {
    throw reason;
  });
}

describe('OAuthTokenVerifier', () => {
  afterEach(() => resetEnvCache());
  afterEach(() => jest.restoreAllMocks());

  describe('google', () => {
    it('verifies against every configured client id and reduces the payload to an identity', async () => {
      applyUnitTestEnv({ GOOGLE_OAUTH_CLIENT_IDS: 'ios-client-id, android-client-id' });
      const fake = clients();
      const verifier = new OAuthTokenVerifier(fake.clients);

      const identity = await verifier.verifyGoogle('the-id-token');

      expect(fake.googleCalls).toEqual([
        { idToken: 'the-id-token', audience: ['ios-client-id', 'android-client-id'] },
      ]);
      expect(identity).toEqual({
        provider: 'google',
        subject: 'google-sub-1',
        email: 'traveller@example.test',
        emailVerified: true,
        displayName: 'Traveller One',
      });
    });

    it('reports the provider unavailable when no client id is configured, before calling anything', async () => {
      applyUnitTestEnv();
      delete process.env.GOOGLE_OAUTH_CLIENT_IDS;
      resetEnvCache();
      const fake = clients();
      const verifier = new OAuthTokenVerifier(fake.clients);

      await expect(verifier.verifyGoogle('the-id-token')).rejects.toBeInstanceOf(
        OAuthProviderUnavailableError,
      );
      expect(fake.googleCalls).toHaveLength(0);
    });

    it('turns a rejected token into one invalid-token error, whatever the provider said', async () => {
      applyUnitTestEnv({ GOOGLE_OAUTH_CLIENT_IDS: 'ios-client-id' });
      const fake = clients({
        google: {
          verifyIdToken: () =>
            Promise.reject(new Error('Token used too late, 1700000000 > 1699999999')),
        },
      });
      const verifier = new OAuthTokenVerifier(fake.clients);

      const attempt = verifier.verifyGoogle('stale');

      await expect(attempt).rejects.toBeInstanceOf(OAuthTokenInvalidError);
      await expect(attempt).rejects.not.toThrow(/too late|1700000000/);
    });

    it('refuses a payload without a subject', async () => {
      applyUnitTestEnv({ GOOGLE_OAUTH_CLIENT_IDS: 'ios-client-id' });
      const fake = clients({
        google: { verifyIdToken: () => Promise.resolve({ getPayload: () => undefined }) },
      });
      const verifier = new OAuthTokenVerifier(fake.clients);

      await expect(verifier.verifyGoogle('empty')).rejects.toBeInstanceOf(
        OAuthTokenInvalidError,
      );
    });

    it('does not treat an unverified email as verified', async () => {
      applyUnitTestEnv({ GOOGLE_OAUTH_CLIENT_IDS: 'ios-client-id' });
      const fake = clients({
        google: {
          verifyIdToken: () =>
            Promise.resolve({
              getPayload: () => ({
                iss: 'https://accounts.google.com',
                sub: 'google-sub-2',
                aud: 'ios-client-id',
                iat: 1,
                exp: 2,
                email: 'unverified@example.test',
                email_verified: false,
              }),
            }),
        },
      });
      const verifier = new OAuthTokenVerifier(fake.clients);

      const identity = await verifier.verifyGoogle('t');

      expect(identity.emailVerified).toBe(false);
      expect(identity.displayName).toBeNull();
    });

    it('reports no address when Google shares none, rather than inventing one', async () => {
      // A null address is what lets the keyhole answer `email_required` (0008)
      // instead of creating an account it cannot give a users.email.
      applyUnitTestEnv({ GOOGLE_OAUTH_CLIENT_IDS: 'ios-client-id' });
      const fake = clients({
        google: {
          verifyIdToken: () =>
            Promise.resolve({
              getPayload: () => ({
                iss: 'https://accounts.google.com',
                sub: 'google-sub-3',
                aud: 'ios-client-id',
                iat: 1,
                exp: 2,
              }),
            }),
        },
      });
      const verifier = new OAuthTokenVerifier(fake.clients);

      const identity = await verifier.verifyGoogle('t');

      expect(identity).toEqual({
        provider: 'google',
        subject: 'google-sub-3',
        email: null,
        emailVerified: false,
        displayName: null,
      });
    });

    it('logs a rejection that is not an Error as text, and still refuses with the one error', async () => {
      // Arrange
      applyUnitTestEnv({ GOOGLE_OAUTH_CLIENT_IDS: 'ios-client-id' });
      const warnings = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const fake = clients({
        google: {
          verifyIdToken: () => rejectWith('Wrong number of segments in token: t'),
        },
      });
      const verifier = new OAuthTokenVerifier(fake.clients);

      // Act
      const attempt = verifier.verifyGoogle('t');

      // Assert — the provider's words reach the log, never the caller (FR-072).
      await expect(attempt).rejects.toBeInstanceOf(OAuthTokenInvalidError);
      await expect(attempt).rejects.not.toThrow(/segments/);
      expect(warnings).toHaveBeenCalledWith(
        expect.stringContaining('Wrong number of segments in token: t'),
      );
    });
  });

  describe('apple', () => {
    it('verifies against Apple’s issuer and the configured audiences', async () => {
      applyUnitTestEnv({ APPLE_OAUTH_CLIENT_IDS: 'app.triptrackr.ios' });
      const fake = clients();
      const verifier = new OAuthTokenVerifier(fake.clients);

      const identity = await verifier.verifyApple('the-identity-token');

      expect(fake.appleCalls).toEqual([
        {
          token: 'the-identity-token',
          options: { issuer: APPLE_ISSUER, audience: ['app.triptrackr.ios'] },
        },
      ]);
      expect(identity).toEqual({
        provider: 'apple',
        subject: 'apple-sub-1',
        email: 'private@privaterelay.appleid.com',
        // Apple sends the claim as the string "true"; it must still count.
        emailVerified: true,
        displayName: null,
      });
    });

    it('reports the provider unavailable when APPLE_OAUTH_CLIENT_IDS is absent', async () => {
      applyUnitTestEnv();
      delete process.env.APPLE_OAUTH_CLIENT_IDS;
      resetEnvCache();
      const fake = clients();
      const verifier = new OAuthTokenVerifier(fake.clients);

      await expect(verifier.verifyApple('t')).rejects.toBeInstanceOf(
        OAuthProviderUnavailableError,
      );
      expect(fake.appleCalls).toHaveLength(0);
    });

    it('turns a signature or claim failure into the invalid-token error', async () => {
      applyUnitTestEnv({ APPLE_OAUTH_CLIENT_IDS: 'app.triptrackr.ios' });
      const fake = clients({
        apple: {
          verify: () => Promise.reject(new Error('unexpected "aud" claim value')),
        },
      });
      const verifier = new OAuthTokenVerifier(fake.clients);

      await expect(verifier.verifyApple('t')).rejects.toBeInstanceOf(
        OAuthTokenInvalidError,
      );
    });

    it('refuses a verified token that names no subject — there is no identity to key an account on', async () => {
      applyUnitTestEnv({ APPLE_OAUTH_CLIENT_IDS: 'app.triptrackr.ios' });
      const fake = clients({
        apple: {
          verify: () =>
            Promise.resolve({
              payload: {
                iss: APPLE_ISSUER,
                aud: 'app.triptrackr.ios',
                email: 'someone@example.test',
                email_verified: true,
              },
            }),
        },
      });
      const verifier = new OAuthTokenVerifier(fake.clients);

      await expect(verifier.verifyApple('t')).rejects.toBeInstanceOf(
        OAuthTokenInvalidError,
      );
    });

    it('reports no address, and nothing verified, when Apple’s token carries none', async () => {
      applyUnitTestEnv({ APPLE_OAUTH_CLIENT_IDS: 'app.triptrackr.ios' });
      const fake = clients({
        apple: {
          verify: () =>
            Promise.resolve({
              payload: {
                iss: APPLE_ISSUER,
                sub: 'apple-sub-2',
                aud: 'app.triptrackr.ios',
              },
            }),
        },
      });
      const verifier = new OAuthTokenVerifier(fake.clients);

      const identity = await verifier.verifyApple('t');

      expect(identity).toEqual({
        provider: 'apple',
        subject: 'apple-sub-2',
        email: null,
        emailVerified: false,
        displayName: null,
      });
    });

    it('lower-cases the address and counts the boolean form of email_verified too', async () => {
      // Apple sends the claim as a boolean or as the string "true"; the string
      // form is pinned above.
      applyUnitTestEnv({ APPLE_OAUTH_CLIENT_IDS: 'app.triptrackr.ios' });
      const fake = clients({
        apple: {
          verify: () =>
            Promise.resolve({
              payload: {
                iss: APPLE_ISSUER,
                sub: 'apple-sub-3',
                aud: 'app.triptrackr.ios',
                email: 'Someone@Example.test',
                email_verified: true,
              },
            }),
        },
      });
      const verifier = new OAuthTokenVerifier(fake.clients);

      const identity = await verifier.verifyApple('t');

      expect(identity.email).toBe('someone@example.test');
      expect(identity.emailVerified).toBe(true);
    });
  });
});
