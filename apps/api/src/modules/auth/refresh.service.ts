import { HttpStatus, Injectable } from '@nestjs/common';
import type { RefreshedTokens } from '@triptrackr/contracts';

import { apiError } from '@/common/errors/api-error';
import { requireCurrentUserId } from '@/common/rls/rls-context';

import { TokenService } from './token.service';

/**
 * Session lifecycle over HTTP (FR-003, FR-004, FR-005; rest-api.md §1).
 *
 * A thin layer: the rotation itself, its atomicity and the reuse response are
 * `TokenService` and the `auth_*` functions underneath it. What this adds is
 * the mapping from an outcome to what the caller is told.
 */
@Injectable()
export class RefreshService {
  constructor(private readonly tokens: TokenService) {}

  /** `POST /auth/refresh` — public: the refresh token is the credential. */
  async refresh(refreshToken: string): Promise<RefreshedTokens> {
    const outcome = await this.tokens.rotate(refreshToken);

    if (outcome.status === 'rotated') {
      return {
        access_token: outcome.pair.accessToken,
        refresh_token: outcome.pair.refreshToken,
      };
    }

    if (outcome.status === 'reused') {
      // FR-005: the family is already revoked by the time this is thrown. The
      // message is for the account holder, who may well be the one reading it.
      throw apiError(
        HttpStatus.UNAUTHORIZED,
        'REFRESH_TOKEN_REUSED',
        'You have been signed out everywhere because a retired sign-in credential was presented for your account. Please sign in again.',
      );
    }

    throw apiError(
      HttpStatus.UNAUTHORIZED,
      'INVALID_REFRESH_TOKEN',
      'Please sign in again.',
    );
  }

  /** `POST /auth/logout` — retires exactly the presented token (FR-004). */
  logout(refreshToken: string): Promise<void> {
    return this.tokens.revoke(refreshToken);
  }

  /** `POST /auth/logout-all` — retires every token for the caller (FR-004). */
  logoutAll(): Promise<void> {
    return this.tokens.revokeAllForUser(requireCurrentUserId());
  }
}
