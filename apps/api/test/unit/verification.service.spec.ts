import { HttpException, Logger } from '@nestjs/common';
import type { TransactionSql } from 'postgres';

import { resetEnvCache } from '@/common/config/env.schema';
import { runInRlsContext } from '@/common/rls/rls-context';
import type { EmailSender, OutboundEmail } from '@/modules/auth/email-sender';
import type { PasswordService } from '@/modules/auth/password.service';
import { hashToken } from '@/modules/auth/token.service';
import { VerificationService } from '@/modules/auth/verification.service';

import { applyUnitTestEnv } from '../support/env';

jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }));

const { captureException } = jest.requireMock<{ captureException: jest.Mock }>(
  '@sentry/nestjs',
);

/**
 * Email verification and password reset (T056; rest-api.md §1; spec
 * Assumptions), against a scripted transaction, a recording email sender and
 * a stand-in password hasher.
 *
 * Pinned here:
 *
 * - An emailed token is 32 random bytes that leave the process twice — in the
 *   link, and as its SHA-256 hash to the `auth_*` keyhole (0008). The
 *   plaintext never reaches the database, and neither does a new password.
 * - Unknown, spent and expired tokens are one refusal per flow: a link cannot
 *   be probed for which it is.
 * - A reset request answers the same whether or not the address has an
 *   account and emails only when it does — the response is not an
 *   account-enumeration oracle.
 * - Sending never blocks the account operation. A failed send is logged and
 *   reported to Sentry (FR-073) whatever the provider rejected with, and the
 *   log line carries neither the recipient nor the link.
 */

const USER_ID = '33333333-3333-4333-8333-333333333333';
const ADDRESS = 'traveller@example.test';
const PUBLIC_URL = 'https://links.triptrackr.test';
const NEW_PASSWORD = 'a considerably longer passphrase';
const NEW_PASSWORD_HASH = '$argon2id$v=19$m=19456,t=2,p=1$stub-salt$stub-hash';

/** The keyholes that answer with the account's id, or NULL for "no such token / account". */
const USER_ID_KEYHOLES = [
  'auth_verify_email',
  'auth_create_password_reset_token',
  'auth_reset_password',
] as const;

interface Script {
  readonly tx: TransactionSql;
  /** Every statement issued, in order, with its bound values. */
  readonly calls: { readonly sql: string; readonly values: unknown[] }[];
}

/**
 * The request transaction, answering each keyhole as 0008 does: `user_id` is
 * the account the token or address belongs to, or NULL for a token that is
 * unknown, spent or expired and for an address with no account alike.
 */
function scriptedTx(userId: string | null): Script {
  const calls: Script['calls'] = [];

  const tx = (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown[]> => {
    const sql = strings.join('?');
    calls.push({ sql, values });

    if (sql.includes('auth_create_email_verification_token'))
      return Promise.resolve([{ auth_create_email_verification_token: 'token-row-id' }]);
    if (USER_ID_KEYHOLES.some((name) => sql.includes(name)))
      return Promise.resolve([{ user_id: userId }]);

    return Promise.reject(new Error(`Unexpected statement: ${sql}`));
  };

  return { tx: tx as unknown as TransactionSql, calls };
}

interface Mailbox {
  readonly sender: EmailSender;
  /** Every email handed to the sender, whatever became of it. */
  readonly sent: OutboundEmail[];
}

/** An EmailSender whose delivery settles however `deliver` says. */
function mailbox(deliver: () => Promise<void> = () => Promise.resolve()): Mailbox {
  const sent: OutboundEmail[] = [];

  return {
    sender: {
      send: (email) => {
        sent.push(email);
        return deliver();
      },
    },
    sent,
  };
}

function hasher(): { readonly passwords: PasswordService; readonly hashed: string[] } {
  const hashed: string[] = [];
  const passwords = {
    hash: (password: string) => {
      hashed.push(password);
      return Promise.resolve(NEW_PASSWORD_HASH);
    },
  } as unknown as PasswordService;

  return { passwords, hashed };
}

const anonymous = <T>(script: Script, fn: () => Promise<T>) =>
  runInRlsContext({ tx: script.tx, userId: null }, fn);

/** The token in the email's link, once the link is shown to point at APP_PUBLIC_URL. */
function linkToken(email: OutboundEmail | undefined, path: string): string {
  const prefix = `${PUBLIC_URL}${path}?token=`;
  const link = email?.text.split('\n').find((line) => line.startsWith(prefix));

  expect(link).toBeDefined();
  return link?.slice(prefix.length) ?? '';
}

/** What a refused call rejected with; fails the test if it resolved or threw anything else. */
async function refusalOf(attempt: Promise<unknown>): Promise<HttpException> {
  const outcome: unknown = await attempt.then(
    () => undefined,
    (error: unknown) => error,
  );

  expect(outcome).toBeInstanceOf(HttpException);
  return outcome as HttpException;
}

/**
 * Lets a fire-and-forget send settle. Its handlers run on the microtask
 * queue, which drains completely before the next macrotask.
 */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * A promise rejected with `reason` exactly as given. Some libraries reject
 * with a bare string, and that is the case under test.
 */
function rejectWith(reason: unknown): Promise<never> {
  return Promise.resolve().then(() => {
    throw reason;
  });
}

describe('VerificationService', () => {
  let errors: jest.SpiedFunction<Logger['error']>;

  beforeEach(() => {
    applyUnitTestEnv({ APP_PUBLIC_URL: PUBLIC_URL });
    errors = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    captureException.mockClear();
  });

  afterEach(() => {
    errors.mockRestore();
    resetEnvCache();
  });

  describe('startEmailVerification', () => {
    it('emails a link to the new address and stores only its token’s hash, for 24 hours', async () => {
      // Arrange
      const mail = mailbox();
      const service = new VerificationService(mail.sender, hasher().passwords);
      const script = scriptedTx(USER_ID);

      // Act
      await anonymous(script, () => service.startEmailVerification(USER_ID, ADDRESS));

      // Assert
      expect(mail.sent.map((email) => email.to)).toEqual([ADDRESS]);
      const token = linkToken(mail.sent[0], '/verify-email');
      expect(token).toHaveLength(43); // 32 random bytes, base64url
      expect(script.calls).toEqual([
        {
          sql: expect.stringContaining('auth_create_email_verification_token'),
          values: [USER_ID, hashToken(token), '24 hours'],
        },
      ]);
    });

    // A service that awaited the send would hang here rather than fail, so the
    // test carries its own short timeout instead of the suite's 120 s.
    it('completes without waiting for the mail provider to answer', async () => {
      const mail = mailbox(() => new Promise<void>(() => undefined)); // never settles
      const service = new VerificationService(mail.sender, hasher().passwords);

      await expect(
        anonymous(scriptedTx(USER_ID), () =>
          service.startEmailVerification(USER_ID, ADDRESS),
        ),
      ).resolves.toBeUndefined();
      expect(mail.sent).toHaveLength(1);
    }, 5_000);

    it('completes when the send fails, and logs the failure with its stack and reports it (FR-073)', async () => {
      // Arrange
      const failure = new Error(
        'Resend refused the email (validation_error): The domain is not verified',
      );
      const mail = mailbox(() => Promise.reject(failure));
      const service = new VerificationService(mail.sender, hasher().passwords);

      // Act
      await expect(
        anonymous(scriptedTx(USER_ID), () =>
          service.startEmailVerification(USER_ID, ADDRESS),
        ),
      ).resolves.toBeUndefined();
      await settle();

      // Assert — the line names which email failed; the link is a credential
      // and the address is personal data, so neither belongs in it.
      expect(captureException).toHaveBeenCalledWith(failure);
      expect(errors).toHaveBeenCalledTimes(1);
      const [message, detail] = errors.mock.calls[0] ?? [];
      expect(String(message)).toContain(mail.sent[0]?.subject);
      expect(String(message)).not.toContain(ADDRESS);
      expect(String(message)).not.toContain('token=');
      expect(detail).toBe(failure.stack);
    });
  });

  describe('verifyEmail', () => {
    it('consumes the token by its hash, never the token itself', async () => {
      const service = new VerificationService(mailbox().sender, hasher().passwords);
      const script = scriptedTx(USER_ID);

      await expect(
        anonymous(script, () => service.verifyEmail('link-token')),
      ).resolves.toBeUndefined();

      expect(script.calls).toEqual([
        {
          sql: expect.stringContaining('auth_verify_email'),
          values: [hashToken('link-token')],
        },
      ]);
    });

    it('answers 400 VERIFICATION_TOKEN_INVALID when the keyhole accepts nothing — unknown, spent and expired alike', async () => {
      const service = new VerificationService(mailbox().sender, hasher().passwords);

      const error = await refusalOf(
        anonymous(scriptedTx(null), () => service.verifyEmail('spent-token')),
      );

      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toMatchObject({
        error: { code: 'VERIFICATION_TOKEN_INVALID' },
      });
    });
  });

  describe('requestPasswordReset', () => {
    it('emails a reset link to an address that has an account, storing only its token’s hash, for one hour', async () => {
      // Arrange
      const mail = mailbox();
      const service = new VerificationService(mail.sender, hasher().passwords);
      const script = scriptedTx(USER_ID);

      // Act
      await expect(
        anonymous(script, () => service.requestPasswordReset(ADDRESS)),
      ).resolves.toBeUndefined();

      // Assert
      expect(mail.sent.map((email) => email.to)).toEqual([ADDRESS]);
      const token = linkToken(mail.sent[0], '/reset-password');
      expect(script.calls).toEqual([
        {
          sql: expect.stringContaining('auth_create_password_reset_token'),
          values: [ADDRESS, hashToken(token), '1 hour'],
        },
      ]);
    });

    it('answers an address with no account the same way and sends nothing', async () => {
      const mail = mailbox();
      const service = new VerificationService(mail.sender, hasher().passwords);

      await expect(
        anonymous(scriptedTx(null), () =>
          service.requestPasswordReset('nobody@example.test'),
        ),
      ).resolves.toBeUndefined();

      expect(mail.sent).toHaveLength(0);
    });

    it('still answers when the send fails with something that is not an Error, logging it as text and reporting it', async () => {
      const mail = mailbox(() => rejectWith('socket hang up'));
      const service = new VerificationService(mail.sender, hasher().passwords);

      await expect(
        anonymous(scriptedTx(USER_ID), () => service.requestPasswordReset(ADDRESS)),
      ).resolves.toBeUndefined();
      await settle();

      expect(captureException).toHaveBeenCalledWith('socket hang up');
      expect(errors).toHaveBeenCalledTimes(1);
      expect(errors.mock.calls[0]?.[1]).toBe('socket hang up');
    });
  });

  describe('confirmPasswordReset', () => {
    it('installs the new password’s hash through the keyhole that consumes the token — neither in plaintext', async () => {
      // Arrange
      const { passwords, hashed } = hasher();
      const service = new VerificationService(mailbox().sender, passwords);
      const script = scriptedTx(USER_ID);

      // Act
      await expect(
        anonymous(script, () =>
          service.confirmPasswordReset('reset-token', NEW_PASSWORD),
        ),
      ).resolves.toBeUndefined();

      // Assert
      expect(hashed).toEqual([NEW_PASSWORD]);
      expect(script.calls).toEqual([
        {
          sql: expect.stringContaining('auth_reset_password'),
          values: [hashToken('reset-token'), NEW_PASSWORD_HASH],
        },
      ]);
    });

    it('answers 400 RESET_TOKEN_INVALID when the link is unknown, spent or expired', async () => {
      const service = new VerificationService(mailbox().sender, hasher().passwords);

      const error = await refusalOf(
        anonymous(scriptedTx(null), () =>
          service.confirmPasswordReset('stale-token', NEW_PASSWORD),
        ),
      );

      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toMatchObject({
        error: { code: 'RESET_TOKEN_INVALID' },
      });
    });
  });
});
