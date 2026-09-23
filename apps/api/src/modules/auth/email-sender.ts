import { Logger } from '@nestjs/common';
import { Resend } from 'resend';

import type { Env } from '@/common/config/env.schema';

export interface OutboundEmail {
  readonly to: string;
  readonly subject: string;
  /** Plain text. Verification and reset emails are one link and one sentence. */
  readonly text: string;
}

/**
 * The one thing the auth module needs from email: deliver this, or throw.
 *
 * An interface rather than the Resend client directly, so that tests and local
 * development never send anything and so that swapping the provider is a
 * change to one file (Constitution: "every external service choice MUST have
 * a non-hyperscaler default").
 */
export interface EmailSender {
  send(email: OutboundEmail): Promise<void>;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

/** A send the provider accepted the request for and then refused. */
export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

/** The slice of the Resend SDK this module uses, so a test can stand it in. */
export interface ResendLike {
  readonly emails: {
    send(payload: { from: string; to: string; subject: string; text: string }): Promise<{
      data: { id: string } | null;
      error: { name: string; message: string } | null;
    }>;
  };
}

/**
 * Real Resend keys start with `re_`. Anything else — the `t` the test
 * environment supplies, a `dev` someone typed to satisfy the schema — is a
 * placeholder, and outside production a placeholder means "log, do not send".
 */
export function isPlaceholderResendKey(key: string): boolean {
  return !/^re_[A-Za-z0-9_]+$/.test(key);
}

/**
 * Picks the sender for this environment.
 *
 * Production always sends. A production process holding a placeholder key
 * fails loudly on the first email — logged and reported — which is the right
 * failure; quietly printing verification links to stdout would not be.
 * Outside production, a real key still sends, so a developer can watch the
 * actual email arrive; a placeholder logs instead.
 */
export function createEmailSender(
  env: Pick<Env, 'NODE_ENV' | 'RESEND_API_KEY' | 'EMAIL_FROM'>,
  logger: Pick<Logger, 'log'> = new Logger('Email'),
): EmailSender {
  if (env.NODE_ENV !== 'production' && isPlaceholderResendKey(env.RESEND_API_KEY)) {
    return new LoggingEmailSender(logger);
  }

  return new ResendEmailSender(new Resend(env.RESEND_API_KEY), env.EMAIL_FROM);
}

/**
 * Writes the email to the log instead of sending it. The link is included on
 * purpose: in development that is how the flow gets exercised end to end.
 */
export class LoggingEmailSender implements EmailSender {
  constructor(private readonly logger: Pick<Logger, 'log'>) {}

  send(email: OutboundEmail): Promise<void> {
    this.logger.log(
      `Email not sent (no Resend key configured). To: ${email.to} — ${email.subject}\n${email.text}`,
    );
    return Promise.resolve();
  }
}

/**
 * Resend. Failures come back in the response body rather than as a rejected
 * promise; they are turned into a thrown error here so a bounced verification
 * email never looks like a delivered one to the caller.
 */
export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly client: ResendLike,
    private readonly from: string,
  ) {}

  async send(email: OutboundEmail): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: email.to,
      subject: email.subject,
      text: email.text,
    });

    if (error) {
      throw new EmailDeliveryError(
        `Resend refused the email (${error.name}): ${error.message}`,
      );
    }
  }
}
