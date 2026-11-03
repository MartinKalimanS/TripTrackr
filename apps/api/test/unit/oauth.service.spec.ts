import { HttpException, Logger } from '@nestjs/common';
import type { AuthTokens } from '@triptrackr/contracts';
import type { TransactionSql } from 'postgres';

import { runInRlsContext } from '@/common/rls/rls-context';
import { AuthService } from '@/modules/auth/auth.service';
import {
  OAuthProviderUnavailableError,
  OAuthTokenInvalidError,
  type OAuthTokenVerifier,
  type VerifiedIdentity,
} from '@/modules/auth/oauth-token-verifier';
import { OAuthNonceService } from '@/modules/auth/oauth-nonce.service';
import { OAuthService } from '@/modules/auth/oauth.service';
import type { PasswordService } from '@/modules/auth/password.service';

/**
 * Sign in with Google or Apple (FR-002; T054; rest-api.md §1), with the token
 * verifier, the account keyhole and the token issuer all scripted.
 *
 * What the service owes, and what is pinned here:
 *
 * - Only what the provider vouched for reaches `auth_upsert_oauth_identity`
 *   (0008) — the verified subject, address and verification flag — plus the
 *   name Apple hands the client on first authorisation, for the keyhole to use
 *   if it is creating the account.
 * - A verifier that cannot vouch becomes one of two refusals a client can act
 *   on — 503 "not configured here", 401 "not verified" — each without the
 *   internal reason (FR-072). Anything else is a fault and surfaces as itself.
 * - First use creates or links transparently and ends in the same AuthTokens a
 *   password sign-in produces; the account event is logged by id, not address.
 * - The two refusals the keyhole returns rather than raises become responses:
 *   no address shared (400), and an unverified address someone already holds
 *   (409) — answered exactly as a password registration conflict is, because
 *   which kind of account holds an address is not the caller's to learn.
 */

/** The nonce on every request; the verifier fake does not look at it. */
const NONCE = 'a-single-use-nonce-0123456789';

const USER_ID = '22222222-2222-4222-8222-222222222222';
const ADDRESS = 'traveller@example.test';
const RELAY_ADDRESS = 'private@privaterelay.appleid.com';

const GOOGLE_IDENTITY: VerifiedIdentity = {
  provider: 'google',
  subject: 'google-sub-1',
  email: ADDRESS,
  emailVerified: true,
  displayName: 'Traveller One',
};

/** Apple never puts a name in the token; the verifier always reports null. */
const APPLE_IDENTITY: VerifiedIdentity = {
  provider: 'apple',
  subject: 'apple-sub-1',
  email: RELAY_ADDRESS,
  emailVerified: true,
  displayName: null,
};

type SignInEntry = readonly [
  provider: 'google' | 'apple',
  signIn: (service: OAuthService) => Promise<AuthTokens>,
];

/** Both routes share the verification step, so both owe the same refusals. */
const ENTRY_POINTS: readonly SignInEntry[] = [
  ['google', (service) => service.google({ id_token: 'presented-token', nonce: NONCE })],
  [
    'apple',
    (service) => service.apple({ identity_token: 'presented-token', nonce: NONCE }),
  ],
];

/** The pair and profile AuthService.signIn would mint for `userId`. */
function tokensFor(userId: string): AuthTokens {
  return {
    access_token: `access-for-${userId}`,
    refresh_token: `refresh-for-${userId}`,
    user: {
      id: userId,
      email: ADDRESS,
      display_name: 'Traveller One',
      avatar_url: null,
      bio: null,
      home_currency: 'CHF',
      is_profile_public: false,
      email_verified_at: '2026-06-01T00:00:00.000Z',
      created_at: '2026-06-01T00:00:00.000Z',
    },
  };
}

interface Script {
  readonly tx: TransactionSql;
  /** Every statement issued, in order, with its bound values. */
  readonly calls: { readonly sql: string; readonly values: unknown[] }[];
}

/**
 * A tagged-template stand-in for the request transaction. It answers each
 * `auth_*` keyhole named in `routes` with the given rows and refuses any other
 * statement: sign-in starts with no session, so the keyholes are the only way
 * in (0006, 0008).
 */
function scriptedTx(routes: Readonly<Record<string, readonly unknown[]>>): Script {
  const calls: Script['calls'] = [];

  const tx = (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown[]> => {
    const sql = strings.join('?');
    calls.push({ sql, values });

    const keyhole = Object.keys(routes).find((name) => sql.includes(name));
    if (keyhole) return Promise.resolve([...(routes[keyhole] ?? [])]);

    return Promise.reject(new Error(`Unexpected statement: ${sql}`));
  };

  return { tx: tx as unknown as TransactionSql, calls };
}

/** One `auth_upsert_oauth_identity` answer — the function always returns exactly one row. */
function upsertAnswering(userId: string | null, outcome: string): Script {
  return scriptedTx({ auth_upsert_oauth_identity: [{ user_id: userId, outcome }] });
}

interface Harness {
  readonly service: OAuthService;
  /** Tokens handed to the verifier, as `provider:token`. */
  readonly presented: string[];
  /** Account ids AuthService.signIn was asked to mint tokens for. */
  readonly signedIn: string[];
  /** Nonces the service asked to consume, in order. */
  readonly consumed: string[];
}

function harness(verify: () => Promise<VerifiedIdentity>, nonceIsLive = true): Harness {
  const presented: string[] = [];
  const signedIn: string[] = [];
  const consumed: string[] = [];

  const verifier = {
    verifyGoogle: (token: string) => {
      presented.push(`google:${token}`);
      return verify();
    },
    verifyApple: (token: string) => {
      presented.push(`apple:${token}`);
      return verify();
    },
  } as unknown as OAuthTokenVerifier;

  const auth = {
    signIn: (userId: string) => {
      signedIn.push(userId);
      return Promise.resolve(tokensFor(userId));
    },
  } as unknown as AuthService;

  const nonces = {
    consume: (nonce: string) => {
      consumed.push(nonce);
      return Promise.resolve(nonceIsLive);
    },
  } as unknown as OAuthNonceService;

  return {
    service: new OAuthService(verifier, auth, nonces),
    presented,
    signedIn,
    consumed,
  };
}

/**
 * A real AuthService, for the one comparison that needs password
 * registration's own refusal. It refuses before it would mint tokens, read a
 * profile or start verification, so those collaborators are never reached.
 */
function passwordRegistration(): AuthService {
  const passwords = {
    hash: () => Promise.resolve('$argon2id$stub'),
  } as unknown as PasswordService;

  return new AuthService(passwords, {} as never, {} as never, {} as never);
}

const anonymous = <T>(script: Script, fn: () => Promise<T>) =>
  runInRlsContext({ tx: script.tx, userId: null }, fn);

/** What a refused call rejected with; fails the test if it resolved or threw anything else. */
async function refusalOf(attempt: Promise<unknown>): Promise<HttpException> {
  const outcome: unknown = await attempt.then(
    () => undefined,
    (error: unknown) => error,
  );

  expect(outcome).toBeInstanceOf(HttpException);
  return outcome as HttpException;
}

describe('OAuthService', () => {
  let logged: jest.SpiedFunction<Logger['log']>;

  beforeEach(() => {
    logged = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => logged.mockRestore());

  const loggedLines = () => logged.mock.calls.map(([message]) => String(message));

  describe('nonce (spec 012; FR-004)', () => {
    it.each(ENTRY_POINTS)(
      'spends the nonce once the %s token has verified, before any account is touched',
      async (_provider, signIn) => {
        const deps = harness(() => Promise.resolve(GOOGLE_IDENTITY));

        await anonymous(upsertAnswering(USER_ID, 'existing'), () => signIn(deps.service));

        expect(deps.consumed).toEqual([NONCE]);
      },
    );

    it.each(ENTRY_POINTS)(
      'refuses a %s sign-in whose nonce is unknown, spent or expired, and signs nobody in',
      async (_provider, signIn) => {
        const deps = harness(() => Promise.resolve(GOOGLE_IDENTITY), false);
        const script = upsertAnswering(USER_ID, 'existing');

        await expect(anonymous(script, () => signIn(deps.service))).rejects.toMatchObject(
          {
            response: { error: { code: 'OAUTH_TOKEN_INVALID' } },
          },
        );

        expect(script.calls).toEqual([]);
        expect(deps.signedIn).toEqual([]);
      },
    );

    it.each(ENTRY_POINTS)(
      'does not burn the nonce when the %s token itself is refused',
      async (_provider, signIn) => {
        const deps = harness(() => Promise.reject(new OAuthTokenInvalidError('google')));

        await expect(
          anonymous(upsertAnswering(USER_ID, 'existing'), () => signIn(deps.service)),
        ).rejects.toBeDefined();

        expect(deps.consumed).toEqual([]);
      },
    );
  });

  describe('google', () => {
    it('hands the keyhole what Google verified and signs in the account it names', async () => {
      // Arrange
      const deps = harness(() => Promise.resolve(GOOGLE_IDENTITY));
      const script = upsertAnswering(USER_ID, 'existing');

      // Act
      const tokens = await anonymous(script, () =>
        deps.service.google({ id_token: 'google-id-token', nonce: NONCE }),
      );

      // Assert — Google's own name for the traveller is the one bound, because
      // this route has no client-supplied name to prefer.
      expect(deps.presented).toEqual(['google:google-id-token']);
      expect(script.calls).toEqual([
        {
          sql: expect.stringContaining('auth_upsert_oauth_identity'),
          values: ['google', 'google-sub-1', ADDRESS, true, 'Traveller One'],
        },
      ]);
      expect(deps.signedIn).toEqual([USER_ID]);
      expect(tokens).toEqual(tokensFor(USER_ID));
      // A returning traveller is not an account event.
      expect(logged).not.toHaveBeenCalled();
    });

    it.each(['created', 'linked'])(
      'signs in a %s account and logs the event by account id, never by address',
      async (outcome) => {
        const deps = harness(() => Promise.resolve(GOOGLE_IDENTITY));
        const script = upsertAnswering(USER_ID, outcome);

        const tokens = await anonymous(script, () =>
          deps.service.google({ id_token: 'google-id-token', nonce: NONCE }),
        );

        expect(tokens).toEqual(tokensFor(USER_ID));
        const lines = loggedLines();
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('google');
        expect(lines[0]).toContain(outcome);
        expect(lines[0]).toContain(USER_ID);
        expect(lines[0]).not.toContain(ADDRESS);
      },
    );
  });

  describe('apple', () => {
    it('binds the name Apple gave the client, for the keyhole to use if it creates the account', async () => {
      // Arrange
      const deps = harness(() => Promise.resolve(APPLE_IDENTITY));
      const script = upsertAnswering(USER_ID, 'created');

      // Act
      const tokens = await anonymous(script, () =>
        deps.service.apple({
          identity_token: 'apple-identity-token',
          nonce: NONCE,
          display_name: 'Ada Lovelace',
        }),
      );

      // Assert
      expect(deps.presented).toEqual(['apple:apple-identity-token']);
      expect(script.calls).toEqual([
        {
          sql: expect.stringContaining('auth_upsert_oauth_identity'),
          values: ['apple', 'apple-sub-1', RELAY_ADDRESS, true, 'Ada Lovelace'],
        },
      ]);
      expect(tokens).toEqual(tokensFor(USER_ID));
    });

    it('binds no name when the client has none — Apple shares it only on the first authorisation', async () => {
      const deps = harness(() => Promise.resolve(APPLE_IDENTITY));
      const script = upsertAnswering(USER_ID, 'existing');

      const tokens = await anonymous(script, () =>
        deps.service.apple({ identity_token: 'apple-identity-token', nonce: NONCE }),
      );

      expect(script.calls[0]?.values).toEqual([
        'apple',
        'apple-sub-1',
        RELAY_ADDRESS,
        true,
        null,
      ]);
      expect(tokens).toEqual(tokensFor(USER_ID));
    });
  });

  describe('when the provider cannot vouch for the token', () => {
    it.each(ENTRY_POINTS)(
      '%s: answers 503 OAUTH_PROVIDER_UNAVAILABLE when the provider is not configured, before any database work',
      async (provider, signIn) => {
        // Arrange
        const unavailable = new OAuthProviderUnavailableError(provider);
        const deps = harness(() => Promise.reject(unavailable));
        const script = scriptedTx({});

        // Act
        const error = await refusalOf(anonymous(script, () => signIn(deps.service)));

        // Assert — the caller is pointed at another method; how this server is
        // configured stays on the server.
        expect(error.getStatus()).toBe(503);
        expect(error.getResponse()).toMatchObject({
          error: { code: 'OAUTH_PROVIDER_UNAVAILABLE' },
        });
        expect(JSON.stringify(error.getResponse())).not.toContain(unavailable.message);
        expect(script.calls).toHaveLength(0);
        expect(deps.signedIn).toHaveLength(0);
      },
    );

    it.each(ENTRY_POINTS)(
      '%s: answers 401 OAUTH_TOKEN_INVALID for a token that did not verify, before any database work',
      async (provider, signIn) => {
        const invalid = new OAuthTokenInvalidError(provider);
        const deps = harness(() => Promise.reject(invalid));
        const script = scriptedTx({});

        const error = await refusalOf(anonymous(script, () => signIn(deps.service)));

        expect(error.getStatus()).toBe(401);
        expect(error.getResponse()).toMatchObject({
          error: { code: 'OAUTH_TOKEN_INVALID' },
        });
        expect(JSON.stringify(error.getResponse())).not.toContain(invalid.message);
        expect(script.calls).toHaveLength(0);
        expect(deps.signedIn).toHaveLength(0);
      },
    );

    it('lets any other failure through as itself rather than disguising a fault as a bad token', async () => {
      // A 401 here would send the traveller round a retry loop and hide the
      // fault from the team; as itself it becomes a 500 that is reported (FR-073).
      const fault = new TypeError("Cannot read properties of undefined (reading 'sub')");
      const deps = harness(() => Promise.reject(fault));
      const script = scriptedTx({});

      await expect(
        anonymous(script, () =>
          deps.service.google({ id_token: 'google-id-token', nonce: NONCE }),
        ),
      ).rejects.toBe(fault);
      expect(script.calls).toHaveLength(0);
      expect(deps.signedIn).toHaveLength(0);
    });
  });

  describe('refusals the keyhole returns rather than raises (0008)', () => {
    it('answers 400 OAUTH_EMAIL_REQUIRED when the provider shared no address, and signs nobody in', async () => {
      // Arrange — users.email is NOT NULL, so there is no account to create.
      const deps = harness(() =>
        Promise.resolve({ ...APPLE_IDENTITY, email: null, emailVerified: false }),
      );
      const script = upsertAnswering(null, 'email_required');

      // Act
      const error = await refusalOf(
        anonymous(script, () =>
          deps.service.apple({ identity_token: 'apple-identity-token', nonce: NONCE }),
        ),
      );

      // Assert
      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toMatchObject({
        error: { code: 'OAUTH_EMAIL_REQUIRED' },
      });
      expect(script.calls[0]?.values[2]).toBeNull();
      expect(deps.signedIn).toHaveLength(0);
      expect(logged).not.toHaveBeenCalled();
    });

    it('refuses an unverified address someone already holds exactly as password registration refuses a taken one', async () => {
      // Arrange — linking on an address the provider did not vouch for would
      // hand the account to whoever made a provider account with it (0008).
      const deps = harness(() =>
        Promise.resolve({ ...GOOGLE_IDENTITY, emailVerified: false }),
      );

      // Act
      const oauthConflict = await refusalOf(
        anonymous(upsertAnswering(null, 'email_unverified'), () =>
          deps.service.google({ id_token: 'google-id-token', nonce: NONCE }),
        ),
      );
      const registrationConflict = await refusalOf(
        anonymous(scriptedTx({ auth_register_user: [] }), () =>
          passwordRegistration().register({
            email: ADDRESS,
            password: 'correct horse battery staple',
            display_name: 'Someone Else',
          }),
        ),
      );

      // Assert — one status, one body: nothing says an OAuth attempt was refused.
      expect(oauthConflict.getStatus()).toBe(409);
      expect(oauthConflict.getStatus()).toBe(registrationConflict.getStatus());
      expect(oauthConflict.getResponse()).toEqual(registrationConflict.getResponse());
      expect(deps.signedIn).toHaveLength(0);
    });
  });
});
