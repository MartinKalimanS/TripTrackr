import { HttpException } from '@nestjs/common';
import type { UserProfile } from '@triptrackr/contracts';
import type { TransactionSql } from 'postgres';

import { runInRlsContext } from '@/common/rls/rls-context';
import { AuthService } from '@/modules/auth/auth.service';
import type { PasswordService } from '@/modules/auth/password.service';
import type { TokenService } from '@/modules/auth/token.service';
import type { VerificationService } from '@/modules/auth/verification.service';
import type { UsersRepository } from '@/modules/users/users.repository';

/**
 * Registration and login decisions (FR-001; rest-api.md §1), against scripted
 * collaborators.
 *
 * The property worth its own spec is the enumeration defence: an address that
 * has no account, an OAuth-only account with no password, and a wrong password
 * must all cost the caller one Argon2 verification and yield one identical
 * refusal. 0006 says it in the function comment — "the caller MUST run Argon2
 * verification even when this returns no row" — and this is the caller.
 */

const USER_ID = '11111111-1111-4111-8111-111111111111';

const profile: UserProfile = {
  id: USER_ID,
  email: 'a@example.test',
  display_name: 'Traveller A',
  avatar_url: null,
  bio: null,
  home_currency: 'CHF',
  is_profile_public: false,
  email_verified_at: null,
  created_at: '2026-06-01T00:00:00.000Z',
};

interface Script {
  readonly tx: TransactionSql;
  readonly statements: string[];
}

interface UserRow {
  readonly id: string;
  readonly password_hash: string | null;
  readonly email_verified_at: string | null;
}

/** Routes on the auth_* function named in the statement, like token.service.spec. */
function scriptedTx(
  found: UserRow | null,
  registered: { id: string } | null = null,
): Script {
  const statements: string[] = [];

  const tx = (strings: TemplateStringsArray): Promise<unknown[]> => {
    const sql = strings.join('?');
    statements.push(sql);

    if (sql.includes('auth_find_user_by_email'))
      return Promise.resolve(found ? [found] : []);
    if (sql.includes('auth_register_user'))
      return Promise.resolve(registered ? [registered] : []);
    if (sql.includes('set_config')) return Promise.resolve([{ set_config: USER_ID }]);

    return Promise.reject(new Error(`Unexpected statement: ${sql}`));
  };

  return { tx: tx as unknown as TransactionSql, statements };
}

function collaborators(verifyResult: boolean) {
  const verifyCalls: (string | null)[] = [];
  const hashCalls: string[] = [];

  const passwords = {
    hash: (password: string) => {
      hashCalls.push(password);
      return Promise.resolve('$argon2id$hashed');
    },
    verify: (hash: string | null) => {
      verifyCalls.push(hash);
      return Promise.resolve(verifyResult);
    },
  } as unknown as PasswordService;

  const tokens = {
    issuePair: () => Promise.resolve({ accessToken: 'access', refreshToken: 'refresh' }),
  } as unknown as TokenService;

  const users = {
    findOwnProfile: () => Promise.resolve(profile),
  } as unknown as UsersRepository;

  const verificationsStarted: string[] = [];
  const verification = {
    startEmailVerification: (userId: string) => {
      verificationsStarted.push(userId);
      return Promise.resolve();
    },
  } as unknown as VerificationService;

  return {
    passwords,
    tokens,
    users,
    verification,
    verifyCalls,
    hashCalls,
    verificationsStarted,
  };
}

const anonymous = <T>(script: Script, fn: () => Promise<T>) =>
  runInRlsContext({ tx: script.tx, userId: null }, fn);

describe('AuthService.login', () => {
  it('verifies against the dummy hash when the address has no account, and refuses', async () => {
    // Arrange
    const deps = collaborators(false);
    const service = new AuthService(
      deps.passwords,
      deps.tokens,
      deps.users,
      deps.verification,
    );
    const script = scriptedTx(null);

    // Act
    const attempt = anonymous(script, () =>
      service.login({ email: 'nobody@example.test', password: 'whatever-is-wrong' }),
    );

    // Assert — a verification happened anyway, with no hash to check.
    await expect(attempt).rejects.toBeInstanceOf(HttpException);
    expect(deps.verifyCalls).toEqual([null]);
  });

  it('verifies against the dummy hash for an OAuth-only account, and refuses', async () => {
    const deps = collaborators(false);
    const service = new AuthService(
      deps.passwords,
      deps.tokens,
      deps.users,
      deps.verification,
    );
    const script = scriptedTx({
      id: USER_ID,
      password_hash: null,
      email_verified_at: null,
    });

    await expect(
      anonymous(script, () =>
        service.login({ email: 'a@example.test', password: 'x'.repeat(12) }),
      ),
    ).rejects.toBeInstanceOf(HttpException);
    expect(deps.verifyCalls).toEqual([null]);
  });

  it('refuses a wrong password with exactly the body an unknown address receives', async () => {
    const deps = collaborators(false);
    const service = new AuthService(
      deps.passwords,
      deps.tokens,
      deps.users,
      deps.verification,
    );

    const unknown = await anonymous(scriptedTx(null), () =>
      service.login({ email: 'nobody@example.test', password: 'wrong' }),
    ).catch((error: HttpException) => error);
    const wrongPassword = await anonymous(
      scriptedTx({
        id: USER_ID,
        password_hash: '$argon2id$real',
        email_verified_at: null,
      }),
      () => service.login({ email: 'a@example.test', password: 'wrong' }),
    ).catch((error: HttpException) => error);

    expect(unknown).toBeInstanceOf(HttpException);
    expect(wrongPassword).toBeInstanceOf(HttpException);
    expect((unknown as HttpException).getStatus()).toBe(401);
    expect((unknown as HttpException).getResponse()).toEqual(
      (wrongPassword as HttpException).getResponse(),
    );
    expect((unknown as HttpException).getResponse()).toMatchObject({
      error: { code: 'INVALID_CREDENTIALS' },
    });
  });

  it('issues tokens and the profile once the password verifies, as that traveller', async () => {
    // Arrange
    const deps = collaborators(true);
    const service = new AuthService(
      deps.passwords,
      deps.tokens,
      deps.users,
      deps.verification,
    );
    const script = scriptedTx({
      id: USER_ID,
      password_hash: '$argon2id$real',
      email_verified_at: null,
    });

    // Act
    const tokens = await anonymous(script, () =>
      service.login({
        email: 'a@example.test',
        password: 'correct horse battery staple',
      }),
    );

    // Assert — the profile was read after the session identity was established
    // on the request transaction, so it went through the users policies rather
    // than around them.
    expect(tokens).toEqual({
      access_token: 'access',
      refresh_token: 'refresh',
      user: profile,
    });
    expect(script.statements.some((s) => s.includes('set_config'))).toBe(true);
  });

  it('never issues tokens or starts verification on a refusal', async () => {
    const deps = collaborators(false);
    const issued: unknown[] = [];
    const tokens = {
      issuePair: () => {
        issued.push(true);
        return Promise.resolve({ accessToken: 'a', refreshToken: 'r' });
      },
    } as unknown as TokenService;
    const service = new AuthService(
      deps.passwords,
      tokens,
      deps.users,
      deps.verification,
    );

    await anonymous(scriptedTx(null), () =>
      service.login({ email: 'nobody@example.test', password: 'wrong' }),
    ).catch(() => undefined);

    expect(issued).toHaveLength(0);
    expect(deps.verificationsStarted).toHaveLength(0);
  });
});

describe('AuthService.register', () => {
  it('hashes the password, creates the account through the keyhole, and starts verification', async () => {
    // Arrange
    const deps = collaborators(true);
    const service = new AuthService(
      deps.passwords,
      deps.tokens,
      deps.users,
      deps.verification,
    );
    const script = scriptedTx(null, { id: USER_ID });

    // Act
    const tokens = await anonymous(script, () =>
      service.register({
        email: 'a@example.test',
        password: 'correct horse battery staple',
        display_name: 'Traveller A',
      }),
    );

    // Assert
    expect(deps.hashCalls).toEqual(['correct horse battery staple']);
    expect(script.statements.some((s) => s.includes('auth_register_user'))).toBe(true);
    expect(script.statements.some((s) => /INSERT INTO users/i.test(s))).toBe(false);
    expect(tokens).toEqual({
      access_token: 'access',
      refresh_token: 'refresh',
      user: profile,
    });
    expect(deps.verificationsStarted).toEqual([USER_ID]);
  });

  it('answers 409 EMAIL_TAKEN when the address already has an account, without naming how it signs in', async () => {
    // Spec edge case: the address belongs to an account created through Google
    // or Apple. The message points at signing in; it does not reveal which
    // provider, because that is a fact about someone else's account.
    const deps = collaborators(true);
    const service = new AuthService(
      deps.passwords,
      deps.tokens,
      deps.users,
      deps.verification,
    );
    const script = scriptedTx(null, null);

    const attempt = anonymous(script, () =>
      service.register({
        email: 'taken@example.test',
        password: 'correct horse battery staple',
        display_name: 'Someone',
      }),
    );

    await expect(attempt).rejects.toBeInstanceOf(HttpException);
    await attempt.catch((error: HttpException) => {
      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({ error: { code: 'EMAIL_TAKEN' } });
      expect(JSON.stringify(error.getResponse())).not.toMatch(/google|apple/i);
    });
    expect(deps.verificationsStarted).toHaveLength(0);
  });
});
