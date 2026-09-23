import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { randomBytes } from 'node:crypto';

import { loadEnv } from '@/common/config/env.schema';
import { apiError } from '@/common/errors/api-error';
import { requireRlsTransaction } from '@/common/rls/rls-context';

import { EMAIL_SENDER, type EmailSender } from './email-sender';
import { PasswordService } from './password.service';
import { hashToken } from './token.service';

/** Bytes of entropy in an emailed token — 256 bits, nothing to guess. */
const EMAIL_TOKEN_BYTES = 32;

/** A verification link is good for a day; a reset link for an hour. */
const VERIFICATION_TTL = '24 hours';
const RESET_TTL = '1 hour';

/**
 * Email verification and password reset (T056; spec Assumptions place both in
 * scope; rest-api.md §1 marks the three routes as added).
 *
 * Tokens are 32 random bytes, sent once in a link and stored only as a
 * SHA-256 hash (0008), for the reasons token.service.ts gives for refresh
 * tokens. Every write goes through an `auth_*` keyhole because both flows run
 * before, or entirely without, a session — a reset link is clicked by someone
 * who by definition cannot sign in.
 *
 * **Sending never blocks the account operation.** Registration succeeds whether
 * or not the verification email goes out; a failed send is logged and reported
 * to Sentry (FR-073) and the traveller can request another later. The
 * alternative — a registration that fails because a mail provider blipped —
 * would turn an email outage into a sign-up outage.
 */
@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    private readonly passwords: PasswordService,
  ) {}

  /** Issues a verification token for a freshly created account and emails the link. */
  async startEmailVerification(userId: string, address: string): Promise<void> {
    const token = randomBytes(EMAIL_TOKEN_BYTES).toString('base64url');

    await requireRlsTransaction()`
      SELECT auth_create_email_verification_token(
        ${userId}::uuid, ${hashToken(token)}, ${VERIFICATION_TTL}::interval
      )
    `;

    this.deliver({
      to: address,
      subject: 'Confirm your TripTrackr email address',
      text:
        'Welcome to TripTrackr. Confirm this address by opening the link below.\n\n' +
        `${loadEnv().APP_PUBLIC_URL}/verify-email?token=${token}\n\n` +
        'The link is valid for 24 hours. If you did not create an account, you can ignore this email.',
    });
  }

  /** `POST /auth/verify-email` — consumes the token and marks the address verified. */
  async verifyEmail(token: string): Promise<void> {
    const [row] = await requireRlsTransaction()<{ user_id: string | null }[]>`
      SELECT auth_verify_email(${hashToken(token)}) AS user_id
    `;

    if (!row?.user_id) {
      // Unknown, spent and expired are one answer (0008): a link cannot be
      // probed for which it is.
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'VERIFICATION_TOKEN_INVALID',
        'This verification link is invalid or has expired. Please request a new one.',
      );
    }
  }

  /**
   * `POST /auth/password-reset/request` — always succeeds from the caller's
   * point of view. Whether an email goes out depends on whether the address
   * has an account, and that fact must not be readable from the response
   * (rest-api.md §1, "an account-enumeration oracle").
   */
  async requestPasswordReset(address: string): Promise<void> {
    const token = randomBytes(EMAIL_TOKEN_BYTES).toString('base64url');

    const [row] = await requireRlsTransaction()<{ user_id: string | null }[]>`
      SELECT auth_create_password_reset_token(
        ${address}, ${hashToken(token)}, ${RESET_TTL}::interval
      ) AS user_id
    `;

    if (!row?.user_id) return;

    this.deliver({
      to: address,
      subject: 'Reset your TripTrackr password',
      text:
        'Someone asked to reset the password for this TripTrackr account. ' +
        'If that was you, open the link below to choose a new one.\n\n' +
        `${loadEnv().APP_PUBLIC_URL}/reset-password?token=${token}\n\n` +
        'The link is valid for one hour. If you did not ask for this, you can ignore this email; ' +
        'your password has not changed.',
    });
  }

  /**
   * `POST /auth/password-reset/confirm` — installs the new password and signs
   * the account out everywhere (0008 `auth_reset_password`).
   */
  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    const passwordHash = await this.passwords.hash(newPassword);

    const [row] = await requireRlsTransaction()<{ user_id: string | null }[]>`
      SELECT auth_reset_password(${hashToken(token)}, ${passwordHash}) AS user_id
    `;

    if (!row?.user_id) {
      throw apiError(
        HttpStatus.BAD_REQUEST,
        'RESET_TOKEN_INVALID',
        'This password reset link is invalid or has expired. Please request a new one.',
      );
    }
  }

  /**
   * Fire and forget, with the forgetting done deliberately: the promise is
   * handled, and a failure is logged and reported rather than swallowed or
   * allowed to fail the request that triggered it.
   */
  private deliver(email: Parameters<EmailSender['send']>[0]): void {
    this.email.send(email).catch((error: unknown) => {
      this.logger.error(
        `Could not send "${email.subject}"; the traveller can request another.`,
        error instanceof Error ? error.stack : String(error),
      );
      Sentry.captureException(error);
    });
  }
}
