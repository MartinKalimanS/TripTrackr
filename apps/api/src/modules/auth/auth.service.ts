import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthTokens, LoginRequest, RegisterRequest } from '@triptrackr/contracts';

import { apiError } from '@/common/errors/api-error';
import { asAuthenticated, requireRlsTransaction } from '@/common/rls/rls-context';
import { UsersRepository } from '@/modules/users/users.repository';

import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { VerificationService } from './verification.service';

/** One row from `auth_find_user_by_email` (0006). */
interface AuthUserRow {
  readonly id: string;
  readonly password_hash: string | null;
  readonly email_verified_at: string | null;
}

/**
 * Registration and password login (FR-001; rest-api.md §1).
 *
 * Both begin with no session — the caller is proving who they are — so the
 * lookups go through the `auth_*` keyholes (0006, 0008). Both end by *becoming*
 * the verified traveller for the rest of the request (`asAuthenticated`), so
 * the profile in the response is read through `users_self_all` like any other
 * read of that row rather than through a wider keyhole.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly users: UsersRepository,
    private readonly verification: VerificationService,
  ) {}

  async register(request: RegisterRequest): Promise<AuthTokens> {
    const passwordHash = await this.passwords.hash(request.password);

    const [row] = await requireRlsTransaction()<{ id: string | null }[]>`
      SELECT auth_register_user(${request.email}, ${passwordHash}, ${request.display_name}) AS id
    `;

    if (!row?.id) {
      // Taken — by a password account or an OAuth-only one, indistinguishably.
      // Which kind is a fact about someone else's account (spec edge case:
      // "registers with an email that already has an account created via
      // Google or Apple sign-in").
      throw apiError(
        HttpStatus.CONFLICT,
        'EMAIL_TAKEN',
        'An account already exists for this email address. Sign in with the method you used before, or reset your password.',
      );
    }

    await this.verification.startEmailVerification(row.id, request.email);

    return this.signIn(row.id);
  }

  async login(request: LoginRequest): Promise<AuthTokens> {
    const [row] = await requireRlsTransaction()<AuthUserRow[]>`
      SELECT * FROM auth_find_user_by_email(${request.email})
    `;

    // Always verified, even with no row and no hash — against the dummy, so an
    // unknown address costs the caller exactly what a wrong password costs
    // (0006: "the caller MUST run Argon2 verification even when this returns
    // no row").
    const verified = await this.passwords.verify(
      row?.password_hash ?? null,
      request.password,
    );

    if (!row || !verified) {
      throw apiError(
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
        'That email and password combination was not recognised.',
      );
    }

    return this.signIn(row.id);
  }

  /**
   * Mints the pair and reads the profile as the traveller whose credentials
   * were just verified. Shared with OAuth sign-in so every route that produces
   * `AuthTokens` produces the same `user`.
   */
  signIn(userId: string): Promise<AuthTokens> {
    return asAuthenticated(userId, async () => {
      const pair = await this.tokens.issuePair(userId);
      const user = await this.users.findOwnProfile();

      return { access_token: pair.accessToken, refresh_token: pair.refreshToken, user };
    });
  }
}
