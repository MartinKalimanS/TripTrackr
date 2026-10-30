import type { NestExpressApplication } from '@nestjs/platform-express';
import { createHash } from 'node:crypto';
import request from 'supertest';

import { bootTestApp, registerTraveller } from '../support/app';
import { migrationSql } from '../support/db';

/**
 * Contract tests for the recovery routes (roadmap S-09; SPECIFICATION.md section 7 item 2;
 * rest-api.md section 1): password reset and email verification, through HTTP and the real
 * keyholes (0008).
 *
 * The emailed token is out of reach (the mail is fire-and-forget), so a token is planted the way
 * the service plants one: its SHA-256 hash through the `auth_create_*` keyhole as the owner. What
 * is under test is everything after the link is opened: that a token works once, that an
 * expired one is the same refusal as an unknown one, that a reset signs every device out and
 * retires the old password, and that asking for a reset reveals nothing about who has an account.
 */
describe('account recovery', () => {
  let app: NestExpressApplication;
  const owner = migrationSql();

  beforeAll(async () => {
    app = await bootTestApp();
  });

  afterAll(async () => {
    await app?.close();
    await owner.end();
  });

  const hash = (token: string) => createHash('sha256').update(token).digest('hex');
  const post = (path: string, body: object) =>
    request(app.getHttpServer()).post(`/v1/auth/${path}`).send(body);

  async function plantResetToken(email: string, token: string, ttl = '1 hour') {
    await owner`SELECT auth_create_password_reset_token(${email}, ${hash(token)}, ${ttl}::interval)`;
  }

  describe('password reset', () => {
    it('installs the new password, retires the old one and signs every device out', async () => {
      const traveller = await registerTraveller(app);
      await plantResetToken(traveller.email, 'reset-token-one');

      const confirm = await post('password-reset/confirm', {
        token: 'reset-token-one',
        password: 'a brand new long passphrase',
      });

      expect(confirm.status).toBe(204);
      const oldLogin = await post('login', {
        email: traveller.email,
        password: traveller.password,
      });
      const newLogin = await post('login', {
        email: traveller.email,
        password: 'a brand new long passphrase',
      });
      const oldRefresh = await post('refresh', {
        refresh_token: traveller.tokens.refresh_token,
      });
      expect(oldLogin.status).toBe(401);
      expect(newLogin.status).toBe(200);
      expect(oldRefresh.status).toBe(401);
    });

    it('works once: the same link a second time is refused', async () => {
      const traveller = await registerTraveller(app);
      await plantResetToken(traveller.email, 'reset-token-two');
      const body = { token: 'reset-token-two', password: 'another long passphrase 1' };

      const first = await post('password-reset/confirm', body);
      const second = await post('password-reset/confirm', body);

      expect(first.status).toBe(204);
      expect(second.status).toBe(400);
      expect(second.body.error.code).toBe('RESET_TOKEN_INVALID');
    });

    it('refuses an expired link exactly as it refuses an unknown one', async () => {
      const traveller = await registerTraveller(app);
      await plantResetToken(traveller.email, 'reset-token-old', '-1 minute');
      const body = { password: 'yet another long passphrase' };

      const expired = await post('password-reset/confirm', {
        token: 'reset-token-old',
        ...body,
      });
      const unknown = await post('password-reset/confirm', {
        token: 'never-issued',
        ...body,
      });

      expect(expired.status).toBe(400);
      expect(expired.body).toEqual(unknown.body);
    });

    it('answers a request the same for an address with an account and one without', async () => {
      const traveller = await registerTraveller(app);

      const known = await post('password-reset/request', { email: traveller.email });
      const unknown = await post('password-reset/request', {
        email: 'nobody-here@example.test',
      });

      expect(known.status).toBe(unknown.status);
      expect(known.body).toEqual(unknown.body);
    });
  });

  describe('email verification', () => {
    it('marks the address verified once and refuses the link afterwards', async () => {
      const traveller = await registerTraveller(app);
      const [user] = await owner<{ id: string }[]>`
        SELECT id FROM users WHERE email = ${traveller.email}
      `;
      await owner`
        SELECT auth_create_email_verification_token(
          ${user?.id ?? ''}::uuid, ${hash('verify-token-one')}, '1 hour'::interval
        )
      `;

      const first = await post('verify-email', { token: 'verify-token-one' });
      const second = await post('verify-email', { token: 'verify-token-one' });

      expect(first.status).toBe(204);
      expect(second.status).toBe(400);
      expect(second.body.error.code).toBe('VERIFICATION_TOKEN_INVALID');
      const [after] = await owner<{ verified: boolean }[]>`
        SELECT email_verified_at IS NOT NULL AS verified FROM users WHERE id = ${user?.id ?? ''}::uuid
      `;
      expect(after?.verified).toBe(true);
    });
  });

  describe('sign-in credentials', () => {
    it('gives an unknown address and a wrong password one identical answer', async () => {
      const traveller = await registerTraveller(app);

      const wrongPassword = await post('login', {
        email: traveller.email,
        password: 'definitely not the password',
      });
      const unknownAddress = await post('login', {
        email: 'ghost@example.test',
        password: 'definitely not the password',
      });

      expect(wrongPassword.status).toBe(401);
      expect(wrongPassword.body).toEqual(unknownAddress.body);
    });
  });
});
