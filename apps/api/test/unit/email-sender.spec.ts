import {
  createEmailSender,
  EmailDeliveryError,
  isPlaceholderResendKey,
  LoggingEmailSender,
  ResendEmailSender,
  type ResendLike,
} from '@/modules/auth/email-sender';

/**
 * Outbound email (verification and password reset, T056) behind one
 * interface, so that tests and local development never send anything and
 * production never silently fails to.
 */
describe('email sender', () => {
  describe('isPlaceholderResendKey', () => {
    it('recognises a real Resend key by its prefix', () => {
      expect(isPlaceholderResendKey('re_AbCd1234_EfGh5678IjKl')).toBe(false);
    });

    it('treats anything else as a placeholder', () => {
      expect(isPlaceholderResendKey('t')).toBe(true);
      expect(isPlaceholderResendKey('dev')).toBe(true);
      expect(isPlaceholderResendKey('changeme')).toBe(true);
    });
  });

  describe('createEmailSender', () => {
    const from = 'TripTrackr <no-reply@triptrackr.app>';

    it('logs instead of sending outside production when the key is a placeholder', () => {
      const sender = createEmailSender({
        NODE_ENV: 'test',
        RESEND_API_KEY: 't',
        EMAIL_FROM: from,
      });

      expect(sender).toBeInstanceOf(LoggingEmailSender);
    });

    it('sends for real outside production when a real key is present — so a developer can see the email', () => {
      const sender = createEmailSender({
        NODE_ENV: 'development',
        RESEND_API_KEY: 're_AbCd1234_EfGh5678IjKl',
        EMAIL_FROM: from,
      });

      expect(sender).toBeInstanceOf(ResendEmailSender);
    });

    it('never substitutes the logger in production, whatever the key looks like', () => {
      // A production process with a bad key must fail loudly on the first send,
      // not quietly print verification links to stdout.
      const sender = createEmailSender({
        NODE_ENV: 'production',
        RESEND_API_KEY: 't',
        EMAIL_FROM: from,
      });

      expect(sender).toBeInstanceOf(ResendEmailSender);
    });
  });

  describe('LoggingEmailSender', () => {
    it('records the recipient and subject and resolves', async () => {
      const lines: string[] = [];
      const sender = new LoggingEmailSender({ log: (line: string) => lines.push(line) });

      await sender.send({
        to: 'a@example.test',
        subject: 'Verify your email',
        text: 'https://triptrackr.app/verify-email?token=abc',
      });

      expect(lines.join('\n')).toMatch(/a@example\.test/);
      expect(lines.join('\n')).toMatch(/Verify your email/);
      expect(lines.join('\n')).toMatch(/token=abc/);
    });
  });

  describe('ResendEmailSender', () => {
    function fakeResend(result: { error: { name: string; message: string } | null }): {
      client: ResendLike;
      calls: unknown[];
    } {
      const calls: unknown[] = [];
      const client: ResendLike = {
        emails: {
          send: (payload) => {
            calls.push(payload);
            return Promise.resolve({
              data: result.error ? null : { id: 'email-1' },
              error: result.error,
            });
          },
        },
      };
      return { client, calls };
    }

    it('sends from the configured address with a plain-text body', async () => {
      const fake = fakeResend({ error: null });
      const sender = new ResendEmailSender(
        fake.client,
        'TripTrackr <no-reply@triptrackr.app>',
      );

      await sender.send({ to: 'a@example.test', subject: 'Hello', text: 'Body' });

      expect(fake.calls).toEqual([
        {
          from: 'TripTrackr <no-reply@triptrackr.app>',
          to: 'a@example.test',
          subject: 'Hello',
          text: 'Body',
        },
      ]);
    });

    it('turns a refused send into a thrown error rather than a resolved silence', async () => {
      // Resend reports failures in the body, not by rejecting. Left as-is, a
      // bounced verification email would look exactly like a delivered one.
      const fake = fakeResend({
        error: { name: 'validation_error', message: 'The from address is not verified' },
      });
      const sender = new ResendEmailSender(
        fake.client,
        'TripTrackr <no-reply@triptrackr.app>',
      );

      await expect(
        sender.send({ to: 'a@example.test', subject: 'Hello', text: 'Body' }),
      ).rejects.toBeInstanceOf(EmailDeliveryError);
    });
  });
});
